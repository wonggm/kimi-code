import { describe, expect, it } from 'vitest';
import type { TaskItem } from '../src/types';
import {
  filterSubagentTasks,
  RECENT_FINISHED_CAP,
  type SubagentFilter,
} from '../src/lib/subagentFilter';

function task(
  id: string,
  state: TaskItem['state'],
  opts: { completedAt?: string; createdAt?: string } = {},
): TaskItem {
  return {
    id,
    name: `sub ${id}`,
    kind: 'subagent',
    state,
    timing: '',
    createdAt: opts.createdAt ?? '2026-01-01T00:00:00.000Z',
    completedAt: opts.completedAt,
    runInBackground: true,
    model: 'opencode-go/deepseek-v4-flash',
  };
}

describe('filterSubagentTasks', () => {
  it('keeps the full list unchanged for "all"', () => {
    const tasks = [task('a', 'run'), task('b', 'done')];
    expect(filterSubagentTasks(tasks, 'all')).toEqual(tasks);
  });

  it('selects only running tasks for "running"', () => {
    const tasks = [task('a', 'run'), task('b', 'done'), task('c', 'fail')];
    expect(filterSubagentTasks(tasks, 'running').map((t) => t.id)).toEqual(['a']);
  });

  it('selects every settled task for "done" (including failed)', () => {
    const tasks = [task('a', 'run'), task('b', 'done'), task('c', 'fail')];
    expect(filterSubagentTasks(tasks, 'done').map((t) => t.id)).toEqual(['b', 'c']);
  });

  it('"recent" keeps all running tasks then the most recently finished ones', () => {
    const tasks = [
      task('old-done', 'done', { createdAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T01:00:00.000Z' }),
      task('run', 'run', { createdAt: '2026-01-03T00:00:00.000Z' }),
      task('new-done', 'done', { createdAt: '2026-01-02T00:00:00.000Z', completedAt: '2026-01-02T12:00:00.000Z' }),
      task('run2', 'run', { createdAt: '2026-01-02T00:00:00.000Z' }),
    ];
    const recent = filterSubagentTasks(tasks, 'active');
    // Running first (source order), then finished by completion time desc.
    expect(recent.map((t) => t.id)).toEqual(['run', 'run2', 'new-done', 'old-done']);
  });

  it('"recent" caps the finished group at RECENT_FINISHED_CAP', () => {
    const tasks = Array.from({ length: RECENT_FINISHED_CAP + 3 }, (_, i) =>
      task(`done-${i}`, 'done', {
        completedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
      }),
    );
    const recent = filterSubagentTasks(tasks, 'active');
    const finished = recent.filter((t) => t.state !== 'run');
    expect(finished).toHaveLength(RECENT_FINISHED_CAP);
    // The kept ones are the most recent (highest index timestamps).
    expect(finished[0]!.id).toBe(`done-${RECENT_FINISHED_CAP + 2}`);
  });

  it("'recent' orders finished rows by completedAt, falling back to createdAt", () => {
    const tasks = [
      // No completedAt — falls back to its createdAt.
      task('no-completed', 'done', { createdAt: '2026-01-01T00:00:00.000Z' }),
      task('with-completed', 'done', {
        createdAt: '2026-01-05T00:00:00.000Z',
        completedAt: '2026-01-06T00:00:00.000Z',
      }),
    ];
    const recent = filterSubagentTasks(tasks, 'active');
    expect(recent.map((t) => t.id)).toEqual(['with-completed', 'no-completed']);
  });

  it('each filter variant is a valid SubagentFilter', () => {
    const filters: SubagentFilter[] = ['active', 'running', 'done', 'all'];
    for (const f of filters) {
      expect(Array.isArray(filterSubagentTasks([], f))).toBe(true);
    }
  });
});