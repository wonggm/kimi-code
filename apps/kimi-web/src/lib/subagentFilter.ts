// apps/kimi-web/src/lib/subagentFilter.ts
// Status-filter model for the subagent card grid (dock "Sub Agent" panel).
// Mirrors the upstream web panel's semantics: the default "recent" filter
// shows every in-progress subagent plus the most recently finished ones;
// "running" / "done" / "all" narrow or widen the set. Kept in plain TS so it
// can be unit-tested without mounting the component.

import type { TaskItem } from '../types';

export type SubagentFilter = 'active' | 'running' | 'done' | 'all';

/** How many finished subagents the "recent" filter keeps alongside the
 *  in-progress ones. */
export const RECENT_FINISHED_CAP = 5;

/** Completion time (milliseconds) for the "recently finished" ordering.
 *  Falls back to the creation time; rows with neither sort last. */
function finishTimeMs(task: TaskItem): number {
  const raw = task.completedAt ?? task.createdAt;
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Apply a dock filter to a subagent task list.
 *
 * - `all` — every task, unchanged order.
 * - `running` — only in-progress (`state === 'run'`).
 * - `done` — every settled task (completed / failed / cancelled).
 * - `active` (default) — all in-progress tasks first, then the
 *   `RECENT_FINISHED_CAP` most recently finished tasks by completion time.
 */
export function filterSubagentTasks(tasks: TaskItem[], filter: SubagentFilter): TaskItem[] {
  if (filter === 'all') return tasks;
  if (filter === 'running') return tasks.filter((task) => task.state === 'run');
  if (filter === 'done') return tasks.filter((task) => task.state !== 'run');

  const running = tasks.filter((task) => task.state === 'run');
  const recentFinished = tasks
    .filter((task) => task.state !== 'run')
    .toSorted((a, b) => finishTimeMs(b) - finishTimeMs(a))
    .slice(0, RECENT_FINISHED_CAP);
  return [...running, ...recentFinished];
}