// Scenario: taskListsEqual (lib/taskMerge) — the no-op detection used by the
// task poller to skip re-assigning tasksBySession when a poll changed nothing.
// Run: pnpm --filter @moonshot-ai/kimi-web exec vitest run test/task-merge.test.ts

import { describe, expect, it } from 'vitest';
import type { AppTask } from '../src/api/types';
import { taskListsEqual } from '../src/lib/taskMerge';

function bashTask(id: string, overrides: Partial<AppTask> = {}): AppTask {
  return {
    id,
    sessionId: 'sess_1',
    kind: 'bash',
    description: `bash ${id}`,
    status: 'running',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('taskListsEqual', () => {
  it('is true for the same array reference', () => {
    const tasks = [bashTask('bash-1')];
    expect(taskListsEqual(tasks, tasks)).toBe(true);
  });

  it('is true for fresh objects with identical scalar fields', () => {
    const a = [bashTask('bash-1', { command: 'echo hi', startedAt: '2026-01-01T00:00:01.000Z' })];
    const b = [bashTask('bash-1', { command: 'echo hi', startedAt: '2026-01-01T00:00:01.000Z' })];
    expect(taskListsEqual(a, b)).toBe(true);
  });

  it('is false when the length differs', () => {
    expect(taskListsEqual([bashTask('bash-1')], [])).toBe(false);
  });

  it('is false when a field the UI renders changed', () => {
    expect(taskListsEqual([bashTask('bash-1', { status: 'running' })], [bashTask('bash-1', { status: 'completed' })])).toBe(false);
  });

  it('is false when a WS-owned reference changed (e.g. streamed outputLines)', () => {
    const a = [bashTask('bash-1', { outputLines: ['line 1'] })];
    const b = [bashTask('bash-1', { outputLines: ['line 1', 'line 2'] })];
    expect(taskListsEqual(a, b)).toBe(false);
  });

  it('is false when the recovered command is present in only one list', () => {
    expect(taskListsEqual([bashTask('bash-1', { command: 'echo hi' })], [bashTask('bash-1')])).toBe(false);
  });
});
