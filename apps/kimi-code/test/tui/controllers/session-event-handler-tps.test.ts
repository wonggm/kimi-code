import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionEventHandler } from '#/tui/controllers/session-event-handler';
import { getBuiltInPalette } from '#/tui/theme';

function makeHost() {
  const host = {
    state: {
      appState: {
        sessionId: 's1',
        streamingPhase: 'waiting',
        isCompacting: false,
        model: 'kimi-model',
        permissionMode: 'auto',
        stepRetry: null,
      },
      queuedMessages: [],
      queuedMessageDispatchPending: false,
      theme: { palette: getBuiltInPalette('dark') },
      toolOutputExpanded: false,
      todoPanel: { getTodos: vi.fn(() => []) },
      transcriptContainer: { addChild: vi.fn() },
      ui: { requestRender: vi.fn() },
    },
    session: { id: 's1' },
    aborted: false,
    sessionEventUnsubscribe: undefined,
    streamingUI: {
      setTurnId: vi.fn(),
      setStep: vi.fn(),
      flushNow: vi.fn(),
      resetToolUi: vi.fn(),
      clearNotifyPanel: vi.fn(),
      markNotifyPanelEnded: vi.fn(),
      finalizeTurn: vi.fn(),
      finalizeLiveTextBuffers: vi.fn(),
      hasThinkingDraft: vi.fn(() => false),
      flushThinkingToTranscript: vi.fn(),
      appendAssistantDelta: vi.fn(),
      scheduleFlush: vi.fn(),
    },
    requireSession: vi.fn(),
    setAppState: vi.fn((patch: Record<string, unknown>) =>
      Object.assign(host.state.appState, patch),
    ),
    patchLivePane: vi.fn(),
    resetLivePane: vi.fn(),
    updateActivityPane: vi.fn(),
    showError: vi.fn(),
    showStatus: vi.fn(),
    showNotice: vi.fn(),
    track: vi.fn(),
    recordSessionActivity: vi.fn(),
    noteStepUsage: vi.fn(),
    noteCompactionFinished: vi.fn(),
    mountEditorReplacement: vi.fn(),
    restoreEditor: vi.fn(),
    restoreInputText: vi.fn(),
    appendTranscriptEntry: vi.fn(),
    sendNormalUserInput: vi.fn(),
    sendQueuedMessage: vi.fn(),
    shiftQueuedMessage: vi.fn(),
    btwPanelController: { routeEvent: vi.fn(() => false) },
    tasksBrowserController: {},
    surveyController: {
      notifyToolCallStarted: vi.fn(),
      notifyToolCallEnded: vi.fn(),
      notifySubagentSpawned: vi.fn(),
    },
  };
  return { host: host as any };
}

/** 400 characters is the estimator's 100 tokens. */
function deltaEvent(chars = 400) {
  return {
    type: 'assistant.delta',
    sessionId: 's1',
    agentId: 'main',
    turnId: 1,
    step: 1,
    delta: 'x'.repeat(chars),
  } as const;
}

function stepCompletedEvent(usage: { output: number }, llmStreamDurationMs: number) {
  return {
    type: 'turn.step.completed',
    sessionId: 's1',
    agentId: 'main',
    turnId: 1,
    step: 1,
    usage: { inputOther: 10, inputCacheRead: 0, inputCacheCreation: 0, ...usage },
    llmStreamDurationMs,
  } as const;
}

describe('SessionEventHandler tps meter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for a real window before reporting a rate', () => {
    const { host } = makeHost();
    const handler = new SessionEventHandler(host);

    // A lone early delta has no elapsed span. Dividing its estimate by the 1ms
    // floor would read thousands of tok/s, so nothing is reported yet.
    handler.handleEvent(deltaEvent(10), vi.fn());
    expect(host.state.appState.tpsLive).toBeUndefined();

    vi.advanceTimersByTime(250);
    handler.handleEvent(deltaEvent(), vi.fn());

    // The first rate comes from the window: 410 characters ≈ 103 tokens in 250ms.
    expect(host.state.appState.tpsLive).toBe(412);
  });

  it('leaves the rate alone when the prune leaves a single sample', () => {
    const { host } = makeHost();
    const handler = new SessionEventHandler(host);

    // A gap longer than the window (thinking between text chunks, say) prunes
    // the opening sample, so the delta that arrives has nothing to span.
    handler.handleEvent(deltaEvent(), vi.fn());
    vi.advanceTimersByTime(2500);
    handler.handleEvent(deltaEvent(), vi.fn());
    expect(host.state.appState.tpsLive).toBeUndefined();

    // A second sample inside the window restores the span.
    vi.advanceTimersByTime(250);
    handler.handleEvent(deltaEvent(), vi.fn());
    expect(host.state.appState.tpsLive).toBe(800);
  });

  it('does not patch two deltas that share a millisecond after a prune', () => {
    const { host } = makeHost();
    const handler = new SessionEventHandler(host);

    handler.handleEvent(deltaEvent(), vi.fn());
    vi.advanceTimersByTime(2500);
    handler.handleEvent(deltaEvent(), vi.fn());
    // Back-to-back chunks land in the same millisecond, so the window is two
    // samples wide with a 1ms span. The clock was re-seeded by the push above,
    // which keeps the throttle shut.
    handler.handleEvent(deltaEvent(), vi.fn());
    expect(host.state.appState.tpsLive).toBeUndefined();

    vi.advanceTimersByTime(250);
    handler.handleEvent(deltaEvent(), vi.fn());
    // 1200 characters ≈ 300 tokens over 250ms.
    expect(host.state.appState.tpsLive).toBe(1200);
  });

  it('reports the live rate over the rolling window', () => {
    const { host } = makeHost();
    const handler = new SessionEventHandler(host);

    handler.handleEvent(deltaEvent(), vi.fn());
    vi.advanceTimersByTime(250);
    handler.handleEvent(deltaEvent(), vi.fn());

    // 800 characters ≈ 200 tokens over 250ms.
    expect(host.state.appState.tpsLive).toBe(800);
  });

  it('patches the live rate at most once per interval', () => {
    const { host } = makeHost();
    const handler = new SessionEventHandler(host);

    handler.handleEvent(deltaEvent(), vi.fn());
    vi.advanceTimersByTime(250);
    handler.handleEvent(deltaEvent(), vi.fn());
    expect(host.state.appState.tpsLive).toBe(800);

    // Same instant: the window grows but state is left alone.
    handler.handleEvent(deltaEvent(), vi.fn());
    expect(host.state.appState.tpsLive).toBe(800);

    // A small delta a full interval later moves the rate, and the patch lands.
    vi.advanceTimersByTime(250);
    handler.handleEvent(deltaEvent(4), vi.fn());
    expect(host.state.appState.tpsLive).toBeCloseTo(602, 0);
  });

  it('drops samples that fell out of the window', () => {
    const { host } = makeHost();
    const handler = new SessionEventHandler(host);

    handler.handleEvent(deltaEvent(), vi.fn());
    vi.advanceTimersByTime(1000);
    handler.handleEvent(deltaEvent(), vi.fn());
    vi.advanceTimersByTime(1001);
    handler.handleEvent(deltaEvent(), vi.fn());

    // The first sample aged out, so the rate spans 1001ms rather than 2001ms.
    expect(host.state.appState.tpsLive).toBeCloseTo(199.8, 1);
  });

  it('drops the window when runtime state resets', () => {
    const { host } = makeHost();
    const handler = new SessionEventHandler(host);

    handler.handleEvent(deltaEvent(), vi.fn());
    handler.resetRuntimeState();
    vi.advanceTimersByTime(250);
    handler.handleEvent(deltaEvent(), vi.fn());
    vi.advanceTimersByTime(250);
    handler.handleEvent(deltaEvent(), vi.fn());

    expect(host.state.appState.tpsLive).toBe(800);
  });

  it('replaces the live rate with the step exact rate', () => {
    const { host } = makeHost();
    const handler = new SessionEventHandler(host);

    handler.handleEvent(deltaEvent(), vi.fn());
    vi.advanceTimersByTime(250);
    handler.handleEvent(deltaEvent(), vi.fn());
    expect(host.state.appState.tpsLive).not.toBeUndefined();

    handler.handleEvent(stepCompletedEvent({ output: 200 }, 5000), vi.fn());

    expect(host.state.appState.tpsLive).toBeUndefined();
    expect(host.state.appState.tpsFinal).toEqual({
      tps: 40,
      tokens: 200,
      streamMs: 5000,
      at: Date.now(),
    });
  });

  it('keeps the previous rate when a step has nothing measurable', () => {
    const { host } = makeHost();
    const handler = new SessionEventHandler(host);
    const previous = { tps: 40, tokens: 200, streamMs: 5000, at: Date.now() };
    host.state.appState.tpsFinal = previous;

    handler.handleEvent(deltaEvent(), vi.fn());
    handler.handleEvent(stepCompletedEvent({ output: 44 }, 1), vi.fn());

    expect(host.state.appState.tpsFinal).toEqual(previous);
    expect(host.state.appState.tpsLive).toBeUndefined();
  });

  it('clears the live rate when the turn ends', () => {
    const { host } = makeHost();
    const handler = new SessionEventHandler(host);

    handler.handleEvent(deltaEvent(), vi.fn());
    vi.advanceTimersByTime(250);
    handler.handleEvent(deltaEvent(), vi.fn());
    expect(host.state.appState.tpsLive).toBe(800);

    handler.handleEvent(
      { type: 'turn.ended', sessionId: 's1', agentId: 'main', turnId: 1, reason: 'completed' } as any,
      vi.fn(),
    );

    expect(host.state.appState.tpsLive).toBeUndefined();
  });

  it('ignores zero-length deltas', () => {
    const { host } = makeHost();
    const handler = new SessionEventHandler(host);

    // An empty delta carries no tokens but would stretch the window as its
    // oldest point, deflating the rate that follows.
    handler.handleEvent(deltaEvent(0), vi.fn());
    vi.advanceTimersByTime(250);
    handler.handleEvent(deltaEvent(0), vi.fn());
    expect(host.state.appState.tpsLive).toBeUndefined();

    vi.advanceTimersByTime(250);
    handler.handleEvent(deltaEvent(400), vi.fn());
    // Only the non-empty deltas count, so this is still a lone sample.
    expect(host.state.appState.tpsLive).toBeUndefined();

    vi.advanceTimersByTime(250);
    handler.handleEvent(deltaEvent(400), vi.fn());
    // 800 characters ≈ 200 tokens over 250ms.
    expect(host.state.appState.tpsLive).toBe(800);
  });
});

describe('SessionEventHandler tps session average', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('folds every measurable step into the session average', () => {
    const { host } = makeHost();
    const handler = new SessionEventHandler(host);

    handler.handleEvent(stepCompletedEvent({ output: 200 }, 5000), vi.fn());
    expect(host.state.appState.tpsAvg).toEqual({ tokens: 200, streamMs: 5000 });

    handler.handleEvent(stepCompletedEvent({ output: 100 }, 2500), vi.fn());
    expect(host.state.appState.tpsAvg).toEqual({ tokens: 300, streamMs: 7500 });
  });

  it('leaves the average alone when a step has nothing measurable', () => {
    const { host } = makeHost();
    const handler = new SessionEventHandler(host);

    handler.handleEvent(stepCompletedEvent({ output: 200 }, 5000), vi.fn());
    handler.handleEvent(stepCompletedEvent({ output: 44 }, 1), vi.fn());

    expect(host.state.appState.tpsAvg).toEqual({ tokens: 200, streamMs: 5000 });
  });
});
