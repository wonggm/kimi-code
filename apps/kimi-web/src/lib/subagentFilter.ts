// apps/kimi-web/src/lib/subagentFilter.ts
// Status-filter model for the subagent card grid (dock "Background Agent" panel).
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
 * Foreground subagents (`runInBackground === false`) are excluded up front:
 * they render inline in the message flow as the Agent tool card, and their
 * terminal signal is the tool result rather than a task event — listed here
 * they would inflate the count and stick as running rows that cannot be
 * stopped.
 *
 * - `all` — every background task, unchanged order.
 * - `running` — only in-progress (`state === 'run'`).
 * - `done` — every settled task (completed / failed / cancelled).
 * - `active` (default) — all in-progress tasks first, then the
 *   `RECENT_FINISHED_CAP` most recently finished tasks by completion time.
 */
export function filterSubagentTasks(tasks: TaskItem[], filter: SubagentFilter): TaskItem[] {
  const background = tasks.filter((task) => task.runInBackground === true);
  if (filter === 'all') return background;
  if (filter === 'running') return background.filter((task) => task.state === 'run');
  if (filter === 'done') return background.filter((task) => task.state !== 'run');

  const running = background.filter((task) => task.state === 'run');
  const recentFinished = background
    .filter((task) => task.state !== 'run')
    .toSorted((a, b) => finishTimeMs(b) - finishTimeMs(a))
    .slice(0, RECENT_FINISHED_CAP);
  return [...running, ...recentFinished];
}