// apps/kimi-web/src/lib/bashTaskFilter.ts
// Status-filter model for the dock "Bash" panel (TasksPane). The panel lists
// background bash tasks; the filter narrows the list to in-progress or settled
// tasks. Kept in plain TS so it can be unit-tested without mounting the
// component (same pattern as lib/subagentFilter.ts).

import type { TaskItem } from '../types';

export type BashFilter = 'all' | 'running' | 'done';

/**
 * Apply a dock filter to a bash task list.
 *
 * - `all` — every task, unchanged order.
 * - `running` — only in-progress (`state === 'run'`).
 * - `done` — every settled task (completed / failed).
 */
export function filterBashTasks(tasks: TaskItem[], filter: BashFilter): TaskItem[] {
  return filter === 'all'
    ? tasks
    : filter === 'running'
      ? tasks.filter((task) => task.state === 'run')
      : tasks.filter((task) => task.state !== 'run');
}