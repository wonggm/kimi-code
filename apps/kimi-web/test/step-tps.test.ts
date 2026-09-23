import { describe, expect, it } from 'vitest';
import {
  computeStepTps,
  createLiveTpsWindow,
  formatTps,
  toolCallDeltaChars,
  liveTpsBand,
  resolveTpsDisplay,
} from '../src/lib/stepTps';

describe('computeStepTps', () => {
  it('returns null when the step has nothing measurable to divide', () => {
    expect(computeStepTps(undefined, 5000)).toBeNull();
    expect(computeStepTps(0, 5000)).toBeNull();
    expect(computeStepTps(200, undefined)).toBeNull();
  });

  it('returns null below the reliable stream window', () => {
    expect(computeStepTps(200, 49)).toBeNull();
    expect(computeStepTps(200, 50)).not.toBeNull();
  });

  it('divides output tokens by the streamed window in seconds', () => {
    expect(computeStepTps(200, 5000)).toBe(40);
    expect(computeStepTps(100, 50)).toBe(2000);
  });
});

describe('formatTps', () => {
  it('always renders one decimal', () => {
    expect(formatTps(40)).toBe('40.0');
    expect(formatTps(5)).toBe('5.0');
    expect(formatTps(18.54)).toBe('18.5');
  });

  it('rounds to one decimal', () => {
    expect(formatTps(39.96)).toBe('40.0');
  });
});

describe('createLiveTpsWindow', () => {
  it('publishes nothing until the evidence gates pass', () => {
    const window = createLiveTpsWindow();
    expect(window.push(1000, 8)).toBeUndefined();
    expect(window.push(1050, 8)).toBeUndefined();
    expect(window.push(1100, 8)).toBeUndefined();
  });

  it('tracks a steady stream near its true rate', () => {
    const window = createLiveTpsWindow();
    // 8 characters per 50ms push is 40 tok/s with the chars/4 estimate.
    let rate: number | undefined;
    for (let i = 0; i < 60; i++) {
      const value = window.push(1000 + i * 50, 8);
      if (value !== undefined) rate = value;
    }
    expect(rate).toBeGreaterThan(30);
    expect(rate).toBeLessThan(50);
  });

  it('publishes at most once per patch interval', () => {
    const window = createLiveTpsWindow();
    let published: number | undefined;
    for (let i = 0; i < 40; i++) {
      const value = window.push(1000 + i * 50, 8);
      if (value !== undefined) {
        published = value;
        expect(window.push(1000 + i * 50 + 20, 8)).toBeUndefined();
        break;
      }
    }
    expect(published).toBeGreaterThan(0);
  });

  it('holds the reading through a long pause instead of diluting it', () => {
    const window = createLiveTpsWindow();
    let before: number | undefined;
    for (let i = 0; i < 40; i++) {
      const value = window.push(1000 + i * 50, 8);
      if (value !== undefined) before = value;
    }
    expect(before).toBeDefined();
    const after = window.push(1000 + 40 * 50 + 30_000, 8);
    expect(after).toBeDefined();
    expect(after!).toBeGreaterThan(before! * 0.4);
  });

  it('starts over after a reset', () => {
    const window = createLiveTpsWindow();
    for (let i = 0; i < 30; i++) window.push(1000 + i * 50, 8);
    window.reset();
    expect(window.push(60_000, 8)).toBeUndefined();
    expect(window.push(60_050, 8)).toBeUndefined();
  });
});

describe('toolCallDeltaChars', () => {
  it('counts streamed tool-call argument characters', () => {
    expect(toolCallDeltaChars({ argumentsPart: 'x'.repeat(12) })).toBe(12);
  });

  it('ignores malformed or missing argument payloads', () => {
    expect(toolCallDeltaChars({ argumentsPart: 12 })).toBe(0);
    expect(toolCallDeltaChars({})).toBe(0);
    expect(toolCallDeltaChars(null)).toBe(0);
  });
});

describe('liveTpsBand', () => {
  it('bands the rate for the colour ramp', () => {
    expect(liveTpsBand(5)).toBe('slow');
    expect(liveTpsBand(20)).toBe('mid');
    expect(liveTpsBand(49)).toBe('mid');
    expect(liveTpsBand(50)).toBe('fast');
    expect(liveTpsBand(151)).toBe('fast');
  });
});

describe('resolveTpsDisplay', () => {
  const now = 1_000_000;
  const freshFinal = { tps: 40, at: now - 5_000 };
  const staleFinal = { tps: 40, at: now - 31_000 };
  const avg = { tokens: 600, streamMs: 15_000 };

  it('shows the live estimate while one exists', () => {
    expect(
      resolveTpsDisplay({ live: 55.5, final: freshFinal, avg, now }),
    ).toEqual({ value: 55.5, kind: 'live' });
  });

  it('shows the step rate while it is fresh', () => {
    expect(resolveTpsDisplay({ final: freshFinal, avg, now })).toEqual({
      value: 40,
      kind: 'step',
    });
  });

  it('falls back to the session average once the step rate goes stale', () => {
    expect(resolveTpsDisplay({ final: staleFinal, avg, now })).toEqual({
      value: 40,
      kind: 'avg',
    });
  });

  it('keeps showing the average with no step rate at all', () => {
    expect(resolveTpsDisplay({ avg, now })).toEqual({ value: 40, kind: 'avg' });
  });

  it('hides when nothing has been measured', () => {
    expect(resolveTpsDisplay({ now })).toBeUndefined();
    expect(resolveTpsDisplay({ avg: { tokens: 0, streamMs: 0 }, now })).toBeUndefined();
    expect(resolveTpsDisplay({ final: staleFinal, now })).toBeUndefined();
  });
});
