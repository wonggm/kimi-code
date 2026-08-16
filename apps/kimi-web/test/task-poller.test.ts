// Scenario: terminal-output backfill for background tasks (useTaskPoller).
// Responsibilities: folded background-subagent rows must receive the output
// fetched under their REST task id, and a transient getTask failure must not
// permanently suppress later backfills.
// Wiring: the composable is real; daemon requests are stubbed.
// Run: pnpm --filter @moonshot-ai/kimi-web exec vitest run test/task-poller.test.ts

import { computed, nextTick, reactive } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppMessage, AppMessageContent, AppTask } from '../src/api/types';
import { createInitialState } from '../src/api/daemon/eventReducer';
import { useTaskPoller } from '../src/composables/client/useTaskPoller';
import type { ExtendedState } from '../src/composables/useKimiWebClient';

const apiMock = vi.hoisted(() => ({
  listTasks: vi.fn(),
  getTask: vi.fn(),
}));

vi.mock('../src/api', () => ({
  getKimiWebApi: () => apiMock,
}));

// Reactive so useTaskPoller's watches fire in tests (the real client state is
// reactive too); the pre-flush watchers flush on nextTick().
function createState(tasks: AppTask[], messages: AppMessage[] = []): ExtendedState {
  return reactive({
    ...createInitialState(),
    activeSessionId: 'sess_1',
    tasksBySession: { sess_1: tasks },
    messagesBySession: { sess_1: messages },
  }) as unknown as ExtendedState;
}

function subagent(id: string, overrides: Partial<AppTask> = {}): AppTask {
  return {
    id,
    sessionId: 'sess_1',
    kind: 'subagent',
    description: `task ${id}`,
    status: 'running',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** The same background subagent as seen on the two channels: WS keys it by
    agent id, REST by background-task id (`backgroundTaskId` links them).
    The live row is already completed so the poller's 1s output polling does
    not start racing the one-off backfill under test. */
function liveRow(): AppTask {
  return subagent('agent-1', {
    runInBackground: true,
    backgroundTaskId: 'task-9',
    status: 'completed',
    completedAt: '2026-01-01T00:01:00.000Z',
  });
}
function restRow(overrides: Partial<AppTask> = {}): AppTask {
  return subagent('task-9', {
    runInBackground: true,
    status: 'completed',
    completedAt: '2026-01-01T00:01:00.000Z',
    ...overrides,
  });
}

describe('useTaskPoller terminal-output backfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('attaches output fetched under the REST id to the folded agent-id row', async () => {
    const state = createState([liveRow()]);
    apiMock.listTasks.mockResolvedValue([restRow()]);
    apiMock.getTask.mockResolvedValue(
      restRow({ outputPreview: 'final result', outputBytes: 2048 }),
    );

    const poller = useTaskPoller(state, computed(() => []));
    await poller.loadTasksForSession('sess_1');

    expect(apiMock.getTask).toHaveBeenCalledWith(
      'sess_1',
      'task-9',
      expect.objectContaining({ withOutput: true }),
    );
    const rows = state.tasksBySession['sess_1'] ?? [];
    expect(rows.map((t) => t.id)).toEqual(['agent-1']);
    expect(rows[0]?.status).toBe('completed');
    expect(rows[0]?.outputPreview).toBe('final result');
    expect(rows[0]?.outputBytes).toBe(2048);
  });

  it('fetches terminal output only once for a task', async () => {
    const state = createState([liveRow()]);
    apiMock.listTasks.mockResolvedValue([restRow()]);
    apiMock.getTask.mockResolvedValue(
      restRow({ outputPreview: 'final result', outputBytes: 2048 }),
    );

    const poller = useTaskPoller(state, computed(() => []));
    await poller.loadTasksForSession('sess_1');
    await poller.loadTasksForSession('sess_1');

    expect(apiMock.getTask).toHaveBeenCalledTimes(1);
  });

  it('retries the backfill on a later load after a transient getTask failure', async () => {
    const state = createState([liveRow()]);
    apiMock.listTasks.mockResolvedValue([restRow()]);
    apiMock.getTask
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValue(restRow({ outputPreview: 'final result', outputBytes: 2048 }));

    const poller = useTaskPoller(state, computed(() => []));
    await poller.loadTasksForSession('sess_1');
    expect(state.tasksBySession['sess_1']?.[0]?.outputPreview).toBeUndefined();

    await poller.loadTasksForSession('sess_1');
    expect(apiMock.getTask).toHaveBeenCalledTimes(2);
    expect(state.tasksBySession['sess_1']?.[0]?.outputPreview).toBe('final result');
  });
});

describe('useTaskPoller bash-command attachment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function bashTask(id: string, overrides: Partial<AppTask> = {}): AppTask {
    return {
      id,
      sessionId: 'sess_1',
      kind: 'bash',
      description: `bash ${id}`,
      status: 'completed',
      completedAt: '2026-01-01T00:01:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  function message(
    id: string,
    role: AppMessage['role'],
    content: AppMessageContent[],
  ): AppMessage {
    return { id, sessionId: 'sess_1', role, content, createdAt: '2026-01-01T00:00:00.000Z' };
  }

  function bashCallMessages(taskId: string, command: string): AppMessage[] {
    return [
      message('m1', 'assistant', [
        { type: 'toolUse', toolCallId: 'tool_1', toolName: 'Bash', input: { command } },
      ]),
      message('m2', 'tool', [
        { type: 'toolResult', toolCallId: 'tool_1', output: `task_id: ${taskId}\n` },
      ]),
    ];
  }

  it('attaches the recovered bash command on load so the UI mapper short-circuits', async () => {
    const state = createState(
      [bashTask('bash-1')],
      bashCallMessages('bash-1', 'echo hi'),
    );
    apiMock.listTasks.mockResolvedValue([bashTask('bash-1')]);

    const poller = useTaskPoller(state, computed(() => []));
    await poller.loadTasksForSession('sess_1');
    await nextTick();

    expect(state.tasksBySession['sess_1']?.[0]?.command).toBe('echo hi');
  });

  it('picks up a bash call that arrives after the task row', async () => {
    const state = createState([bashTask('bash-1')], []);
    apiMock.listTasks.mockResolvedValue([bashTask('bash-1')]);

    const poller = useTaskPoller(state, computed(() => []));
    await poller.loadTasksForSession('sess_1');
    await nextTick();
    expect(state.tasksBySession['sess_1']?.[0]?.command).toBeUndefined();

    // The tool use + result stream in after the task row.
    state.messagesBySession = {
      ...state.messagesBySession,
      sess_1: bashCallMessages('bash-1', 'echo hi'),
    };
    await nextTick();

    expect(state.tasksBySession['sess_1']?.[0]?.command).toBe('echo hi');
  });

  it('does not attach commands for non-bash tasks', async () => {
    const state = createState([liveRow()], bashCallMessages('agent-1', 'echo hi'));
    apiMock.listTasks.mockResolvedValue([restRow()]);

    const poller = useTaskPoller(state, computed(() => []));
    await poller.loadTasksForSession('sess_1');
    await nextTick();

    expect(state.tasksBySession['sess_1']?.[0]?.command).toBeUndefined();
  });
});
