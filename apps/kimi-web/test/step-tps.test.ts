import { describe, expect, it } from 'vitest';
import {
  computeStepTps,
  createLiveTpsWindow,
  formatTps,
  TPS_LIVE_WINDOW_MS,
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
  it('publishes nothing until the window holds two samples', () => {
    const window = createLiveTpsWindow();
    expect(window.push(1000, 40)).toBeUndefined();
  });

  it('publishes an estimate once the interval has passed', () => {
    const window = createLiveTpsWindow();
    expect(window.push(1000, 40)).toBeUndefined();
    // Inside the interval, so the figure waits for the next chunk.
    expect(window.push(1200, 40)).toBeUndefined();
    // 120 characters is an estimated 30 tokens over a 400ms span.
    expect(window.push(1400, 40)).toBeCloseTo(75, 5);
  });

  it('drops samples older than the window', () => {
    const window = createLiveTpsWindow();
    expect(window.push(0, 400)).toBeUndefined();
    // The 2000ms window prunes the first sample, leaving one and re-seeding.
    expect(window.push(2500, 400)).toBeUndefined();
    // 800 characters (not 1200) over 300ms: the pruned sample is gone.
    expect(window.push(2800, 400)).toBeCloseTo(666.7, 1);
  });

  it('starts a fresh window after a reset', () => {
    const window = createLiveTpsWindow();
    window.push(1000, 40);
    window.push(1400, 40);
    window.reset();
    expect(window.push(TPS_LIVE_WINDOW_MS + 4000, 40)).toBeUndefined();
  });
});
