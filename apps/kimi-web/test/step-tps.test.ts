import { describe, expect, it } from 'vitest';
import enStatus from '../src/i18n/locales/en/status';
import zhStatus from '../src/i18n/locales/zh/status';
import {
  calibratedCharsPerToken,
  computeStepTps,
  createLiveTpsWindow,
  formatTps,
  toolCallDeltaChars,
  liveTpsBand,
  resolveTpsDisplay,
  CHARS_PER_TOKEN_SEED,
} from '../src/lib/stepTps';

describe('computeStepTps', () => {
  it('returns null when the step has nothing measurable to divide', () => {
    expect(computeStepTps(undefined, 5000)).toBeNull();
    expect(computeStepTps(0, 5000)).toBeNull();
    expect(computeStepTps(200, undefined)).toBeNull();
  });

  it('returns null for a step whose whole reply landed in one chunk', () => {
    // 286 tokens delivered inside 56 ms is a delivery artefact, not a decode
    // rate: the engine timed from the first chunk to the last, and there was
    // only one chunk.
    expect(computeStepTps(286, 56)).toBeNull();
    expect(computeStepTps(90, 50)).toBeNull();
    expect(computeStepTps(200, 249)).toBeNull();
  });

  it('divides output tokens by the streamed window in seconds', () => {
    expect(computeStepTps(200, 5000)).toBe(40);
    expect(computeStepTps(100, 250)).toBe(400);
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

  it('does not round each one-character delta up to a token', () => {
    // 1 character per 50ms is 20 characters/s, or 5 tok/s with the chars/4 estimate.
    const window = createLiveTpsWindow();
    let rate: number | undefined;
    for (let i = 0; i < 60; i++) {
      const value = window.push(1000 + i * 50, 1);
      if (value !== undefined) rate = value;
    }
    expect(rate).toBeGreaterThan(4);
    expect(rate).toBeLessThan(6);
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

describe('calibratedCharsPerToken', () => {
  it('moves the estimate part of the way to what the step proved', () => {
    // 1000 characters for 200 tokens is 5 characters per token; the seed is 4.
    expect(calibratedCharsPerToken(CHARS_PER_TOKEN_SEED, 1000, 200)).toBeCloseTo(4.4);
    expect(calibratedCharsPerToken(4.4, 2000, 400)).toBeCloseTo(4.64);
  });

  it('ignores a step whose text never arrived with its tokens', () => {
    // 40 characters billed as 900 tokens: a redacted thinking block or a
    // tool-call envelope, which would teach a fraction of a character per token.
    expect(calibratedCharsPerToken(4, 40, 900)).toBe(4);
  });

  it('ignores a step with no output or no text to compare', () => {
    expect(calibratedCharsPerToken(4, 1000, undefined)).toBe(4);
    expect(calibratedCharsPerToken(4, 1000, 0)).toBe(4);
    expect(calibratedCharsPerToken(4, 0, 200)).toBe(4);
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

describe('session average label', () => {
  it('shows the rate without an average prefix', () => {
    expect(enStatus.tpsAvgText).toBe('{value} tok/s');
    expect(zhStatus.tpsAvgText).toBe('{value} tok/s');
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
