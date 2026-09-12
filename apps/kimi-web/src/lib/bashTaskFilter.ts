// apps/kimi-web/src/lib/bashTaskFilter.ts
// Status-filter model for the dock "Bash" panel (TasksPane). The panel lists
// background bash tasks; the filter narrows the list to in-progress or settled
// tasks. Kept in plain TS so it can be unit-tested without mounting the
// component (same pattern as lib/subagentFilter.ts).

import type { TaskItem } from '../types';

export type BashFilter = 'recent' | 'running' | 'done' | 'all';

/** Upstream's segment order and glyphs; labels come from the `tasks.bash.*` keys.
 *  Shared by the dock panel's head control and the pane's own control. */
export const BASH_FILTERS: { value: BashFilter; labelKey: string; icon: 'clock' | 'play' | 'check' | 'list' }[] = [
  { value: 'recent', labelKey: 'tasks.bash.filterRecent', icon: 'clock' },
  { value: 'running', labelKey: 'tasks.bash.filterRunning', icon: 'play' },
  { value: 'done', labelKey: 'tasks.bash.filterDone', icon: 'check' },
  { value: 'all', labelKey: 'tasks.bash.filterAll', icon: 'list' },
];

/**
 * Apply a dock filter to a bash task list, in upstream's order of segments.
 *
 * - `recent` — every task, most recently started first. This is upstream's
 *   default segment (`tasks.filterRecent`, first in the control, carrying the
 *   clock glyph). What upstream excludes from "recent" is not recoverable from
 *   its bundle — only the label, the clock icon, and `emptyRecent` are in the
 *   strings — so the fork orders by recency instead of filtering by a window it
 *   cannot verify. See PLANS/web-port-0.41.md.
 * - `running` — only in-progress (`state === 'run'`).
 * - `done` — every settled task (completed / failed).
 * - `all` — every task, unchanged order.
 */
export function filterBashTasks(tasks: TaskItem[], filter: BashFilter): TaskItem[] {
  if (filter === 'recent') {
    return [...tasks].sort((a, b) => {
      const at = a.createdAt ?? '';
      const bt = b.createdAt ?? '';
      if (at === bt) return 0;
      return at < bt ? 1 : -1;
    });
  }
  return filter === 'all'
    ? tasks
    : filter === 'running'
      ? tasks.filter((task) => task.state === 'run')
      : tasks.filter((task) => task.state !== 'run');
}