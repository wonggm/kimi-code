// apps/kimi-web/src/lib/planUsage.ts
// The plan-usage panel's data mapping, kept out of the component: which quota
// rows the daemon reported and in what order, the monthly Kimi / Code split the
// stacked meter draws, the "resets in …" countdown, and the booster wallet's
// money format. GET /api/v1/oauth/usage reports every quota as a 0..1 ratio, so
// all percentages here share one clamp-and-round.
import type { UsageQuota, UsageQuotaEntry } from '../api/types';

export type PlanUsageRowKey = 'limit5h' | 'limit7d' | 'monthTotal';

export interface PlanUsageRow {
  key: PlanUsageRowKey;
  entry: UsageQuotaEntry;
}

/** The limits the daemon actually reported, in display order (short window
 *  first, monthly last). */
export function planUsageRows(usages: UsageQuota): PlanUsageRow[] {
  const rows: PlanUsageRow[] = [];
  if (usages.limit5h !== undefined) rows.push({ key: 'limit5h', entry: usages.limit5h });
  if (usages.limit7d !== undefined) rows.push({ key: 'limit7d', entry: usages.limit7d });
  if (usages.monthTotal !== undefined) rows.push({ key: 'monthTotal', entry: usages.monthTotal });
  return rows;
}

export interface PlanUsageMonthSplit {
  kimiRatio: number;
  codeRatio: number;
}

/** The monthly total is drawn as two segments: `monthCode` is its own counter
 *  and Kimi takes the rest of the monthly total. Null when no monthly total was
 *  reported — which is also what the stacked meter keys off. */
export function planUsageMonthSplit(usages: UsageQuota): PlanUsageMonthSplit | null {
  const total = usages.monthTotal;
  if (total === undefined) return null;
  const codeRatio = clampRatio(usages.monthCode?.usedRatio ?? 0);
  const kimiRatio = clampRatio(Math.round((total.usedRatio - codeRatio) * 1e6) / 1e6);
  return { kimiRatio, codeRatio };
}

export function planUsagePct(ratio: number): number {
  return Math.round(clampRatio(ratio) * 100);
}

function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;
  return Math.max(0, Math.min(ratio, 1));
}

export type PlanUsageDurationUnit = 'day' | 'hour' | 'minute' | 'second';

export interface PlanUsageDurationPart {
  unit: PlanUsageDurationUnit;
  n: number;
}

export type PlanUsageReset =
  | { kind: 'done' }
  | { kind: 'countdown'; parts: PlanUsageDurationPart[] };

/** Countdown for a reset timestamp. Null when there is no timestamp to read —
 *  a missing or unparsable one leaves the row without a reset hint. A
 *  countdown never carries more than three units, and only once it has run
 *  under an hour does it count in seconds. */
export function planUsageReset(resetAt: string | undefined, now: number): PlanUsageReset | null {
  if (resetAt === undefined) return null;
  const time = Date.parse(resetAt);
  if (Number.isNaN(time)) return null;
  const seconds = Math.floor((time - now) / 1000);
  if (seconds <= 0) return { kind: 'done' };
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: PlanUsageDurationPart[] = [];
  if (days > 0) {
    parts.push(
      { unit: 'day', n: days },
      { unit: 'hour', n: hours },
      { unit: 'minute', n: minutes },
    );
  } else if (hours > 0) {
    parts.push({ unit: 'hour', n: hours }, { unit: 'minute', n: minutes });
  } else if (minutes > 0) {
    parts.push({ unit: 'minute', n: minutes });
  } else {
    parts.push({ unit: 'second', n: seconds });
  }
  return { kind: 'countdown', parts };
}

/** Booster wallet amounts arrive as integer cents, two decimals always shown.
 *  A currency without a known symbol keeps its code after the amount. */
export function planUsageMoney(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(2);
  switch (currency.toUpperCase()) {
    case 'CNY':
      return `¥${amount}`;
    case 'USD':
      return `$${amount}`;
    default:
      return currency.trim() === '' ? amount : `${amount} ${currency}`;
  }
}
