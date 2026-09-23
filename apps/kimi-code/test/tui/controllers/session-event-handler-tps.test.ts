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
      appendThinkingDelta: vi.fn(),
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

  it('publishes a live rate only after the evidence gates pass', () => {
    const { host } = makeHost();
    const handler = new SessionEventHandler(host);

    handler.handleEvent(deltaEvent(10), vi.fn());
    vi.advanceTimersByTime(250);
    handler.handleEvent(deltaEvent(10), vi.fn());
    expect(host.state.appState.tpsLive).toBeUndefined();

    vi.advanceTimersByTime(250);
    handler.handleEvent(deltaEvent(10), vi.fn());
    const rate = host.state.appState.tpsLive;
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThan(1000);
  });

  it('tracks a steady stream near its true rate', () => {
    const { host } = makeHost();
    const handler = new SessionEventHandler(host);

    // 10 characters every 250ms is about 12 tok/s with the chars/4 estimate.
    for (let i = 0; i < 40; i++) {
      handler.handleEvent(deltaEvent(10), vi.fn());
      vi.advanceTimersByTime(250);
    }
    expect(host.state.appState.tpsLive).toBeGreaterThan(5);
    expect(host.state.appState.tpsLive).toBeLessThan(25);
  });

  it('counts thinking deltas into the window', () => {
    const { host } = makeHost();
    const handler = new SessionEventHandler(host);

    for (let i = 0; i < 12; i++) {
      handler.handleEvent(
        {
          type: 'thinking.delta',
          sessionId: 's1',
          agentId: 'main',
          turnId: 1,
          delta: 'x'.repeat(10),
        },
        vi.fn(),
      );
      vi.advanceTimersByTime(250);
    }
    const rate = host.state.appState.tpsLive;
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThan(1000);
  });

  it('drops the window when runtime state resets', () => {
    const { host } = makeHost();
    const handler = new SessionEventHandler(host);

    for (let i = 0; i < 10; i++) {
      handler.handleEvent(deltaEvent(10), vi.fn());
      vi.advanceTimersByTime(250);
    }
    const before = host.state.appState.tpsLive;
    expect(before).toBeGreaterThan(0);

    handler.resetRuntimeState();

    // The fresh window is under the evidence gates again, so two pushes leave
    // the last published figure untouched; a live window would republish here.
    handler.handleEvent(deltaEvent(10), vi.fn());
    vi.advanceTimersByTime(250);
    handler.handleEvent(deltaEvent(10), vi.fn());
    expect(host.state.appState.tpsLive).toBe(before);

    for (let i = 0; i < 10; i++) {
      handler.handleEvent(deltaEvent(10), vi.fn());
      vi.advanceTimersByTime(250);
    }
    expect(host.state.appState.tpsLive).toBeGreaterThan(0);
  });

  it('replaces the live rate with the step exact rate', () => {
    const { host } = makeHost();
    const handler = new SessionEventHandler(host);

    for (let i = 0; i < 8; i++) {
      handler.handleEvent(deltaEvent(10), vi.fn());
      vi.advanceTimersByTime(250);
    }
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

    for (let i = 0; i < 8; i++) {
      handler.handleEvent(deltaEvent(10), vi.fn());
      vi.advanceTimersByTime(250);
    }
    expect(host.state.appState.tpsLive).not.toBeUndefined();

    handler.handleEvent(
      { type: 'turn.ended', sessionId: 's1', agentId: 'main', turnId: 1, reason: 'completed' } as any,
      vi.fn(),
    );

    expect(host.state.appState.tpsLive).toBeUndefined();
  });

  it('ignores zero-length deltas', () => {
    const { host } = makeHost();
    const handler = new SessionEventHandler(host);

    // An empty delta carries no tokens and must not advance the window.
    handler.handleEvent(deltaEvent(0), vi.fn());
    vi.advanceTimersByTime(250);
    handler.handleEvent(deltaEvent(0), vi.fn());
    vi.advanceTimersByTime(250);
    handler.handleEvent(deltaEvent(0), vi.fn());
    expect(host.state.appState.tpsLive).toBeUndefined();

    for (let i = 0; i < 12; i++) {
      handler.handleEvent(deltaEvent(10), vi.fn());
      vi.advanceTimersByTime(250);
    }
    expect(host.state.appState.tpsLive).toBeGreaterThan(0);
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
