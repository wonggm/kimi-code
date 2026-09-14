// apps/kimi-web/test/daemon-client.test.ts
// DaemonKimiWebApi public REST adapter: session export binary/error contracts,
// getSessionGoal wire → app mapping, and raw stream-coordinate delivery.
// Wiring: real client/projector; fetch or WebSocket is stubbed at the network boundary.
// Run: pnpm --filter @moonshot-ai/kimi-web exec vitest run test/daemon-client.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DaemonKimiWebApi } from '../src/api/daemon/client';
import { FORK_TIMEOUT_MS, REQUEST_TIMEOUT_MS } from '../src/api/daemon/http';
import { DaemonApiError, DaemonNetworkError } from '../src/api/errors';
import { clearTrace, traceToJsonl } from '../src/debug/trace';
import type { AppEvent, KimiEventConnection, KimiEventMeta } from '../src/api/types';

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readonly OPEN = FakeWebSocket.OPEN;
  readyState = FakeWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event?: CloseEvent) => void) | null = null;

  constructor(_url: string, _protocols?: string | string[]) {
    FakeWebSocket.instances.push(this);
  }

  send(_data: string): void {}

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  emit(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent);
  }
}

function envelope(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, msg: '', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const WIRE_GOAL = {
  goalId: 'goal_1',
  objective: 'fix all lint warnings',
  status: 'active',
  turnsUsed: 1,
  tokensUsed: 0,
  wallClockMs: 0,
  budget: {
    tokenBudget: null,
    turnBudget: null,
    wallClockBudgetMs: null,
    remainingTokens: null,
    remainingTurns: null,
    remainingWallClockMs: null,
    tokenBudgetReached: false,
    turnBudgetReached: false,
    wallClockBudgetReached: false,
    overBudget: false,
  },
};

function createApi(): DaemonKimiWebApi {
  return new DaemonKimiWebApi({
    serverHttpUrl: 'http://daemon.test',
    clientId: 'web_test',
    clientName: 'test',
    clientVersion: '0.0.0',
    clientUiMode: 'test',
  });
}

describe('DaemonKimiWebApi.deleteProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('location', { search: '?debug=1' });
    clearTrace();
  });

  it('accepts the provider endpoint 204 empty response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createApi().deleteProvider('custom-provider')).resolves.toEqual({ deleted: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://daemon.test/api/v1/providers/custom-provider',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});

describe('DaemonKimiWebApi.exportSession', () => {
  beforeEach(() => {
    vi.stubGlobal('location', { search: '?debug=1' });
    vi.stubGlobal('fetch', vi.fn());
    clearTrace();
  });

  afterEach(() => {
    clearTrace();
    vi.unstubAllGlobals();
  });

  it('posts the Web log to the encoded session export endpoint and returns the ZIP', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(new Uint8Array([80, 75, 3, 4]), {
        status: 200,
        headers: {
          'content-type': 'application/zip',
          'content-disposition': 'attachment; filename="session-export.zip"',
        },
      }),
    );

    const result = await createApi().exportSession('sess/1', '{"event":"safe"}');

    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      'http://daemon.test/api/v1/sessions/sess%2F1/export',
    );
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ web_log: '{"event":"safe"}' }),
    });
    expect(result.fileName).toBe('session-export.zip');
    expect(result.blob.size).toBe(4);
  });

  it('falls back to a session-id ZIP name for an unsafe response filename', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(new Uint8Array([80, 75]), {
        status: 200,
        headers: {
          'content-type': 'application/zip',
          'content-disposition': 'attachment; filename="../credentials.zip"',
        },
      }),
    );

    const result = await createApi().exportSession('sess_1');

    expect(result.fileName).toBe('sess_1.zip');
  });

  it('parses a JSON error envelope returned by the export endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ code: 41301, msg: 'export too large', request_id: 'req_server' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const caught = await createApi()
      .exportSession('sess_1', 'log')
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(DaemonApiError);
    expect(caught).toMatchObject({ code: 41301, requestId: 'req_server' });
  });

  it('rejects a successful response whose media type is not a ZIP', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('not a zip', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    );

    const caught = await createApi().exportSession('sess_1').catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(DaemonNetworkError);
    expect(caught).toMatchObject({ phase: 'parse', contentType: 'text/plain' });
  });

  it('records only Web-log counts in the request trace', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(new Uint8Array([80, 75]), {
        status: 200,
        headers: { 'content-type': 'application/zip' },
      }),
    );
    const secret = 'PROMPT_CONTENT_MUST_NOT_ENTER_TRACE';

    await createApi().exportSession('sess_1', `${secret}\nsecond line`);

    const trace = traceToJsonl();
    expect(trace).not.toContain(secret);
    expect(trace).toContain('web_log_bytes');
    expect(trace).toContain('web_log_entries');
  });
});

describe('DaemonKimiWebApi.getSessionGoal', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps a present goal snapshot', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope(WIRE_GOAL));
    const goal = await createApi().getSessionGoal('sess_1');
    expect(goal?.objective).toBe('fix all lint warnings');
    expect(goal?.status).toBe('active');
    expect(goal?.turnsUsed).toBe(1);
  });

  it('maps null to null (no active goal)', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope(null));
    const goal = await createApi().getSessionGoal('sess_1');
    expect(goal).toBeNull();
  });

  it('requests the session goal endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope(null));
    await createApi().getSessionGoal('sess_42');
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      'http://daemon.test/api/v1/sessions/sess_42/goal',
    );
  });
});

describe('DaemonKimiWebApi.getAgentTranscript', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests the per-agent transcript endpoint and maps wire → app fields', async () => {
    vi.mocked(fetch).mockResolvedValue(
      envelope({
        agent_id: 'agent-1',
        items: [{ kind: 'turn', turnId: 't1', ordinal: 0, state: 'completed', steps: [] }],
        has_more: false,
        seq: 12,
        // The transcript contract is camelCase here (prompts are not part of
        // the snake_case REST protocol).
        prompts: [
          { promptId: 'pr_1', status: 'queued', content: [{ type: 'text', text: 'waiting' }], createdAt: '2026-01-01T00:00:00Z' },
        ],
      }),
    );
    const page = await createApi().getAgentTranscript('sess_1', 'agent-1');
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      'http://daemon.test/api/v1/sessions/sess_1/transcript?agent_id=agent-1&page_size=100',
    );
    expect(page).toEqual({
      agentId: 'agent-1',
      items: [{ kind: 'turn', turnId: 't1', ordinal: 0, state: 'completed', steps: [] }],
      hasMore: false,
      prompts: [
        { promptId: 'pr_1', status: 'queued', content: [{ type: 'text', text: 'waiting' }], createdAt: '2026-01-01T00:00:00Z' },
      ],
      seq: 12,
    });
  });

  it('asks for a smaller page when the caller only wants the prompt list', async () => {
    vi.mocked(fetch).mockResolvedValue(
      envelope({ agent_id: 'main', items: [], has_more: false, prompts: [] }),
    );
    await createApi().getAgentTranscript('sess_1', 'main', { pageSize: 1 });
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      'http://daemon.test/api/v1/sessions/sess_1/transcript?agent_id=main&page_size=1',
    );
  });
});

describe('DaemonKimiWebApi.getMeta', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps web_title from the wire meta', async () => {
    vi.mocked(fetch).mockResolvedValue(
      envelope({
        server_version: '0.0.0',
        server_id: 'srv_1',
        started_at: '2026-01-01T00:00:00Z',
        capabilities: {},
        web_title: 'My Dev Box',
      }),
    );
    const meta = await createApi().getMeta();
    expect(meta.webTitle).toBe('My Dev Box');
  });

  it('maps an absent web_title to null', async () => {
    vi.mocked(fetch).mockResolvedValue(
      envelope({
        server_version: '0.0.0',
        server_id: 'srv_1',
        started_at: '2026-01-01T00:00:00Z',
        capabilities: {},
      }),
    );
    const meta = await createApi().getMeta();
    expect(meta.webTitle).toBeNull();
  });
});

describe('DaemonKimiWebApi.getSessionPlans', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps the plan history wire shape (snake_case → camelCase)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      envelope({
        agent_id: 'main',
        plans: [
          {
            tool_call_id: 'call_1',
            turn_id: 't1',
            source: 'interaction',
            plan: '# Refactor\n\n- step 1',
            path: '/work/plan.md',
            options: [{ label: 'Proceed' }],
            review: {
              state: 'rejected',
              selected_option: 'Proceed',
              feedback: 'Too broad',
            },
          },
          {
            tool_call_id: 'call_2',
            turn_id: 't2',
            source: 'output',
            plan: 'Auto-approved plan',
          },
        ],
      }),
    );

    const result = await createApi().getSessionPlans('sess_1', { agentId: 'main' });
    expect(result.agentId).toBe('main');
    expect(result.plans).toHaveLength(2);
    const first = result.plans[0]!;
    expect(first).toMatchObject({
      toolCallId: 'call_1',
      turnId: 't1',
      source: 'interaction',
      plan: '# Refactor\n\n- step 1',
      path: '/work/plan.md',
    });
    expect(first.options?.[0]?.label).toBe('Proceed');
    expect(first.review).toEqual({
      state: 'rejected',
      selectedOption: 'Proceed',
      feedback: 'Too broad',
    });
    expect(result.plans[1]!.review).toBeUndefined();
  });

  it('requests the transcript plan endpoint with the query params', async () => {
    vi.mocked(fetch).mockResolvedValue(envelope({ agent_id: 'main', plans: [] }));
    await createApi().getSessionPlans('sess_9', { agentId: 'main', toolCallId: 'call_7' });
    const url = vi.mocked(fetch).mock.calls[0]?.[0];
    expect(String(url)).toBe(
      'http://daemon.test/api/v1/sessions/sess_9/transcript/plan?agent_id=main&tool_call_id=call_7',
    );
  });
});

describe('DaemonKimiWebApi.connectEvents', () => {
  let connection: KimiEventConnection | undefined;

  afterEach(() => {
    connection?.close();
    connection = undefined;
    vi.unstubAllGlobals();
  });

  it('delivers raw assistant stream coordinates with the projected delta', () => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
    const received: Array<{ event: AppEvent; meta: KimiEventMeta }> = [];
    connection = createApi().connectEvents({
      onEvent(event, meta) {
        received.push({ event, meta });
      },
      onResync() {},
      onError() {},
      onConnectionChange() {},
    });
    const socket = FakeWebSocket.instances[0]!;

    socket.emit({ type: 'server_hello', payload: { protocol_version: 2 } });
    socket.emit({
      type: 'turn.started',
      seq: 1,
      session_id: 'session-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      payload: { agentId: 'main', turnId: 7 },
    });
    socket.emit({
      type: 'turn.step.started',
      seq: 2,
      session_id: 'session-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      payload: { agentId: 'main', turnId: 7, step: 1 },
    });
    socket.emit({
      type: 'assistant.delta',
      seq: 2,
      session_id: 'session-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      volatile: true,
      offset: 0,
      payload: { agentId: 'main', turnId: 7, delta: 'hello' },
    });
    socket.emit({
      type: 'thinking.delta',
      seq: 2,
      session_id: 'session-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      volatile: true,
      offset: 0,
      payload: { agentId: 'main', turnId: 7, delta: 'thought' },
    });

    const delta = received.find(({ event }) => event.type === 'assistantDelta');
    expect(delta).toMatchObject({
      event: {
        type: 'assistantDelta',
        sessionId: 'session-1',
        delta: { text: 'hello' },
      },
      meta: {
        sessionId: 'session-1',
        seq: 2,
        stream: { turnId: 7, offset: 0, kind: 'text' },
      },
    });

    const thinking = received.find(
      ({ event }) => event.type === 'assistantDelta' && event.delta.thinking !== undefined,
    );
    expect(thinking).toMatchObject({
      event: {
        type: 'assistantDelta',
        sessionId: 'session-1',
        delta: { thinking: 'thought' },
      },
      meta: {
        sessionId: 'session-1',
        seq: 2,
        stream: { turnId: 7, offset: 0, kind: 'thinking' },
      },
    });
  });

  it('projects list-level work facts from the global session event', () => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
    const received: AppEvent[] = [];
    connection = createApi().connectEvents({
      onEvent(event) {
        received.push(event);
      },
      onResync() {},
      onError() {},
      onConnectionChange() {},
    });
    const [socket] = FakeWebSocket.instances;
    if (socket === undefined) throw new Error('WebSocket was not created');

    socket.emit({ type: 'server_hello', payload: { protocol_version: 2 } });
    socket.emit({
      type: 'event.session.work_changed',
      seq: 1,
      session_id: 'session-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      payload: {
        busy: true,
        main_turn_active: false,
        pending_interaction: 'question',
      },
    });

    expect(received).toContainEqual({
      type: 'sessionWorkChanged',
      sessionId: 'session-1',
      busy: true,
      mainTurnActive: false,
      pendingInteraction: 'question',
      lastTurnReason: undefined,
    });
  });
});

describe('DaemonKimiWebApi request timeouts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    clearTrace();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('runs fork and child-session requests with the extended fork timeout', async () => {
    const abortTimeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    vi.mocked(fetch).mockRejectedValue(new TypeError('fetch failed'));

    await createApi().forkSession('sess_1').catch(() => undefined);
    await createApi().createChildSession('sess_1').catch(() => undefined);
    await createApi().compactSession('sess_1').catch(() => undefined);
    await createApi().compactSession('sess_1').catch(() => undefined);

    expect(abortTimeoutSpy).toHaveBeenCalledWith(FORK_TIMEOUT_MS);
    expect(abortTimeoutSpy).toHaveBeenCalledWith(REQUEST_TIMEOUT_MS);
    const forkCalls = abortTimeoutSpy.mock.calls.filter(([ms]) => ms === FORK_TIMEOUT_MS);
    expect(forkCalls).toHaveLength(2);
  });

  it('records the effective timeout on a fork request failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('fetch failed'));

    const caught = await createApi().forkSession('sess_1').catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(DaemonNetworkError);
    expect(caught).toMatchObject({ phase: 'fetch', timeoutMs: FORK_TIMEOUT_MS });
  });

  it('marks a timeout abort as timedOut instead of unreachable', async () => {
    const timeoutAbort = Object.assign(new Error('The operation was aborted due to timeout'), {
      name: 'AbortError',
      cause: Object.assign(new Error('signal timed out'), { name: 'TimeoutError' }),
    });
    vi.mocked(fetch).mockRejectedValue(timeoutAbort);

    const caught = await createApi().compactSession('sess_1').catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(DaemonNetworkError);
    expect(caught).toMatchObject({ phase: 'fetch', timeoutMs: REQUEST_TIMEOUT_MS, timedOut: true });
  });

  it('treats an AbortError without a cause as our own timeout', async () => {
    const bareAbort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    vi.mocked(fetch).mockRejectedValue(bareAbort);

    const caught = await createApi().compactSession('sess_1').catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(DaemonNetworkError);
    expect(caught).toMatchObject({ phase: 'fetch', timedOut: true });
  });

  it('leaves timedOut unset for a plain network failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('fetch failed'));

    const caught = await createApi().compactSession('sess_1').catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(DaemonNetworkError);
    expect(caught).toMatchObject({ phase: 'fetch', timedOut: false });
  });
});
