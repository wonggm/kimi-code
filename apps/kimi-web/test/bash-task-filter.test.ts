// Test for the dock Bash panel's status filter (lib/bashTaskFilter).
// Run: pnpm --filter @moonshot-ai/kimi-web exec vitest run test/bash-task-filter.test.ts

import { describe, expect, it } from 'vitest';
import type { TaskItem } from '../src/types';
import { filterBashTasks } from '../src/lib/bashTaskFilter';

function bashTask(id: string, state: TaskItem['state']): TaskItem {
  return { id, name: `bash ${id}`, kind: 'task', state, timing: '0s' };
}

const tasks: TaskItem[] = [
  bashTask('bash-1', 'run'),
  bashTask('bash-2', 'done'),
  bashTask('bash-3', 'fail'),
];

describe('filterBashTasks', () => {
  it('keeps every task and order for the all filter', () => {
    expect(filterBashTasks(tasks, 'all')).toEqual(tasks);
  });

  it('keeps only in-progress tasks for running', () => {
    expect(filterBashTasks(tasks, 'running')).toEqual([tasks[0]]);
  });

  it('keeps every settled task (done and failed) for done', () => {
    expect(filterBashTasks(tasks, 'done')).toEqual([tasks[1], tasks[2]]);
  });

  it('returns an empty list when no task matches the filter', () => {
    expect(filterBashTasks([bashTask('bash-9', 'done')], 'running')).toEqual([]);
    expect(filterBashTasks([], 'all')).toEqual([]);
  });
});