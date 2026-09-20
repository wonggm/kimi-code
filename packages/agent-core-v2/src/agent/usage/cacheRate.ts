import { addUsage, type TokenUsage } from '#human/llm/usage';

export type CacheReporting = 'none' | 'reads' | 'reads+writes';

export const CACHE_RECENT_WINDOW = 20;

export interface CacheStatus {
  readonly reporting: CacheReporting;
  readonly lastRequestPercent?: number;
  readonly recentPercent?: number;
  readonly recentRequestCount?: number;
  readonly sessionPercent?: number;
}

function cacheHitPercent(usage: TokenUsage): number | undefined {
  const inputTotal = usage.inputOther + usage.inputCacheRead + usage.inputCacheCreation;
  if (inputTotal <= 0) return undefined;
  return (usage.inputCacheRead / inputTotal) * 100;
}

function cacheReportingOf(total: TokenUsage): CacheReporting {
  if (total.inputCacheRead === 0 && total.inputCacheCreation === 0) return 'none';
  return total.inputCacheCreation > 0 ? 'reads+writes' : 'reads';
}

export function cacheStatus(
  total: TokenUsage | undefined,
  lastRequest: TokenUsage | undefined,
  recentRequests: readonly TokenUsage[],
): CacheStatus | undefined {
  if (total === undefined) return undefined;
  const reporting = cacheReportingOf(total);
  if (reporting === 'none') return { reporting };
  let windowed: TokenUsage | undefined;
  for (const request of recentRequests) {
    windowed = windowed === undefined ? request : addUsage(windowed, request);
  }
  return {
    reporting,
    lastRequestPercent: lastRequest === undefined ? undefined : cacheHitPercent(lastRequest),
    recentPercent: windowed === undefined ? undefined : cacheHitPercent(windowed),
    recentRequestCount: recentRequests.length,
    sessionPercent: cacheHitPercent(total),
  };
}
