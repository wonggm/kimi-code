import { describe, expect, it } from 'vitest';
import { computeMetrics, DROPPED_FRAME_MS, percentile } from '../src/bench/metrics';

describe('bench percentile', () => {
  it('linearly interpolates between samples', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([1, 2, 3, 4], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4], 100)).toBe(4);
  });

  it('returns 0 for an empty sample', () => {
    expect(percentile([], 95)).toBe(0);
  });
});

describe('bench computeMetrics', () => {
  it('computes mean and percentiles over a uniform ramp', () => {
    const frames = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    const m = computeMetrics(frames, 3, 150);
    expect(m.frames).toBe(100);
    expect(m.mean).toBe(50.5);
    expect(m.p50).toBe(50.5);
    expect(m.p95).toBe(95.05);
    expect(m.longtaskCount).toBe(3);
    expect(m.longtaskMs).toBe(150);
  });

  it('counts frames over the dropped threshold', () => {
    // 50ms exceeds DROPPED_FRAME_MS (~33.3ms); the three 16ms frames do not.
    const m = computeMetrics([16, 16, 16, 50], 0, 0);
    expect(m.droppedPct).toBe(25);
  });

  it('handles an empty frame list', () => {
    const m = computeMetrics([], 0, 0);
    expect(m.frames).toBe(0);
    expect(m.mean).toBe(0);
    expect(m.p95).toBe(0);
  });

  it('exposes a positive dropped-frame threshold', () => {
    expect(DROPPED_FRAME_MS).toBeGreaterThan(0);
  });
});
