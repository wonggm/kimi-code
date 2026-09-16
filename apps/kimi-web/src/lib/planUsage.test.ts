import { describe, expect, it } from 'vitest';

import {
  planUsageMoney,
  planUsageMonthSplit,
  planUsagePct,
  planUsageReset,
  planUsageRows,
} from './planUsage';

const NOW = Date.parse('2026-09-16T12:00:00.000Z');

describe('planUsageRows', () => {
  it('keeps display order and drops the limits the daemon omitted', () => {
    expect(planUsageRows({ limit7d: { usedRatio: 0.5 } }).map((row) => row.key)).toEqual([
      'limit7d',
    ]);
    expect(
      planUsageRows({
        monthTotal: { usedRatio: 0.2 },
        limit5h: { usedRatio: 0.1 },
      }).map((row) => row.key),
    ).toEqual(['limit5h', 'monthTotal']);
  });

  it('is empty without quota counters', () => {
    expect(planUsageRows({})).toEqual([]);
  });
});

describe('planUsageMonthSplit', () => {
  it('gives Kimi whatever the monthly total does not attribute to Code', () => {
    const split = planUsageMonthSplit({
      monthTotal: { usedRatio: 0.4 },
      monthCode: { usedRatio: 0.25 },
    });
    expect(split).toEqual({ kimiRatio: 0.15, codeRatio: 0.25 });
  });

  it('treats a missing Code counter as zero', () => {
    expect(planUsageMonthSplit({ monthTotal: { usedRatio: 0.4 } })).toEqual({
      kimiRatio: 0.4,
      codeRatio: 0,
    });
  });

  it('clamps so a Code counter above the total never inverts the split', () => {
    expect(
      planUsageMonthSplit({ monthTotal: { usedRatio: 0.3 }, monthCode: { usedRatio: 1.4 } }),
    ).toEqual({ kimiRatio: 0, codeRatio: 1 });
  });

  it('is null without a monthly total', () => {
    expect(planUsageMonthSplit({ monthCode: { usedRatio: 0.2 } })).toBeNull();
  });
});

describe('planUsagePct', () => {
  it('rounds a ratio and clamps it to the 0..100 the meter can draw', () => {
    expect(planUsagePct(0)).toBe(0);
    expect(planUsagePct(0.156)).toBe(16);
    expect(planUsagePct(1)).toBe(100);
    expect(planUsagePct(1.8)).toBe(100);
    expect(planUsagePct(-0.4)).toBe(0);
    expect(planUsagePct(Number.NaN)).toBe(0);
  });
});

describe('planUsageReset', () => {
  it('is null without a readable timestamp', () => {
    expect(planUsageReset(undefined, NOW)).toBeNull();
    expect(planUsageReset('not a date', NOW)).toBeNull();
  });

  it('reports a finished countdown as done', () => {
    expect(planUsageReset('2026-09-16T11:59:00.000Z', NOW)).toEqual({ kind: 'done' });
  });

  it('counts days with hours and minutes, never seconds', () => {
    expect(planUsageReset('2026-09-18T15:05:00.000Z', NOW)).toEqual({
      kind: 'countdown',
      parts: [
        { unit: 'day', n: 2 },
        { unit: 'hour', n: 3 },
        { unit: 'minute', n: 5 },
      ],
    });
  });

  it('drops to the units it is counting in', () => {
    expect(planUsageReset('2026-09-16T14:05:00.000Z', NOW)).toEqual({
      kind: 'countdown',
      parts: [
        { unit: 'hour', n: 2 },
        { unit: 'minute', n: 5 },
      ],
    });
    expect(planUsageReset('2026-09-16T12:05:00.000Z', NOW)).toEqual({
      kind: 'countdown',
      parts: [{ unit: 'minute', n: 5 }],
    });
    expect(planUsageReset('2026-09-16T12:00:30.000Z', NOW)).toEqual({
      kind: 'countdown',
      parts: [{ unit: 'second', n: 30 }],
    });
  });
});

describe('planUsageMoney', () => {
  it('renders cents with the currency symbol it knows', () => {
    expect(planUsageMoney(1500, 'CNY')).toBe('¥15.00');
    expect(planUsageMoney(1500, 'usd')).toBe('$15.00');
  });

  it('keeps an unknown currency code after the amount', () => {
    expect(planUsageMoney(1500, 'EUR')).toBe('15.00 EUR');
    expect(planUsageMoney(1500, '')).toBe('15.00');
  });
});
