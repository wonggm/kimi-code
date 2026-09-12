// apps/kimi-web/src/lib/activitySummary.ts
// The counted summary line upstream shows on an activity run ("Read 1 file ·
// Ran 1 command · Searched 1 pattern · Made 1 edit"), built the way upstream
// builds it: group the run's tool calls by normalized kind, keep the order the
// kinds first appeared in, phrase each group with its own template (or the
// generic "N tool calls" one), append a failure count per group when any call in
// it failed, and close with the run's duration.
import type { ToolStackItem } from '../components/chatTurnRendering';
import { normalizeToolName } from './toolMeta';

export interface ActivityFragment {
  text: string;
  tone: 'normal' | 'danger' | 'faint';
}

export interface ActivityClause {
  fragments: ActivityFragment[];
}

export interface ActivitySummary {
  clauses: ActivityClause[];
  plain: string;
  hasError: boolean;
}

/** Kinds with their own phrase template; everything else falls back to the
 *  generic one. */
const TYPED_KINDS = new Set(['read', 'bash', 'grep', 'search', 'glob', 'ls', 'web_fetch', 'edit', 'write']);

function kindOf(name: string): string {
  const kind = normalizeToolName(name);
  return kind === 'multi_edit' ? 'edit' : kind;
}

function groupByKind(items: readonly ToolStackItem[]): {
  order: string[];
  byKind: Map<string, { count: number; errors: number }>;
} {
  const order: string[] = [];
  const byKind = new Map<string, { count: number; errors: number }>();
  for (const item of items) {
    const kind = kindOf(item.tool.name);
    let entry = byKind.get(kind);
    if (!entry) {
      entry = { count: 0, errors: 0 };
      byKind.set(kind, entry);
      order.push(kind);
    }
    entry.count += 1;
    if (item.tool.status === 'error') entry.errors += 1;
  }
  return { order, byKind };
}

/** Duration clause text for a run, using the same unit table as the goal
 *  summaries. */
export function activityDuration(ms: number, t: (key: string, named: Record<string, unknown>) => string): string {
  if (ms < 1000) return t('tools.goal.milliseconds', { value: ms });
  if (ms < 60_000) return t('tools.goal.seconds', { value: Math.round(ms / 1000) });
  if (ms < 3_600_000) return t('tools.goal.minutes', { value: Math.round(ms / 60_000) });
  return t('tools.goal.hours', { value: Math.round(ms / 3_600_000) });
}

export function buildActivitySummary(
  items: readonly ToolStackItem[],
  t: (key: string, named: Record<string, unknown>) => string,
  options: { durationMs?: number } = {},
): ActivitySummary {
  const { order, byKind } = groupByKind(items);
  const clauses: ActivityClause[] = [];
  let hasError = false;

  for (const kind of order) {
    const entry = byKind.get(kind);
    if (!entry) continue;
    const text = TYPED_KINDS.has(kind)
      ? t(`tools.group.typed.${kind}.done`, { count: entry.count })
      : t('tools.group.countOther', { count: entry.count });
    const fragments: ActivityFragment[] = [{ text, tone: 'normal' }];
    if (entry.errors > 0) {
      hasError = true;
      fragments.push({ text: t('tools.activity.failedClause', { count: entry.errors }), tone: 'danger' });
    }
    clauses.push({ fragments });
  }

  if (options.durationMs !== undefined) {
    clauses.push({ fragments: [{ text: activityDuration(options.durationMs, t), tone: 'faint' }] });
  }

  const plain = clauses.map((clause) => clause.fragments.map((f) => f.text).join('')).join(' · ');
  return { clauses, plain, hasError };
}
