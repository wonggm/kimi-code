// apps/kimi-web/src/bench/metrics.ts
// Pure frame-time / longtask statistics for the bench sampler. DOM-free so it
// is unit-testable under vitest (the app's tests are pure-logic only, no jsdom).

/** One bench run's harvested metrics. Serialized to `window.__bench`. */
export interface BenchMetrics {
  /** Mean inter-frame interval (ms). */
  mean: number;
  /** Median inter-frame interval (ms). */
  p50: number;
  p95: number;
  p99: number;
  /** Percentage of sampled frames longer than `DROPPED_FRAME_MS`. */
  droppedPct: number;
  /** Number of `longtask` entries observed. */
  longtaskCount: number;
  /** Total `longtask` busy time (ms). */
  longtaskMs: number;
  /** Number of frame intervals sampled. */
  frames: number;
}

/**
 * A frame interval longer than this counts as "dropped": it missed a 60 Hz
 * deadline by more than 2× (i.e. the compositor delivered ≤30 fps for that
 * frame). Used for `droppedPct`.
 */
export const DROPPED_FRAME_MS = 1000 / 30;

/**
 * Linear-interpolated percentile over an ascending-sorted sample. Returns 0 for
 * an empty sample. `sorted` must already be sorted ascending; the function does
 * not re-sort (the caller sorts once).
 */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo]!;
  const frac = rank - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

/** Fold raw frame intervals + longtask counters into a `BenchMetrics`. */
export function computeMetrics(
  frameTimes: readonly number[],
  longtaskCount: number,
  longtaskMs: number,
  droppedThresholdMs: number = DROPPED_FRAME_MS,
): BenchMetrics {
  if (frameTimes.length === 0) {
    return {
      mean: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      droppedPct: 0,
      longtaskCount,
      longtaskMs: round(longtaskMs),
      frames: 0,
    };
  }
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, x) => sum + x, 0) / sorted.length;
  const dropped = sorted.filter((x) => x > droppedThresholdMs).length;
  return {
    mean: round(mean),
    p50: round(percentile(sorted, 50)),
    p95: round(percentile(sorted, 95)),
    p99: round(percentile(sorted, 99)),
    droppedPct: round((dropped / sorted.length) * 100),
    longtaskCount,
    longtaskMs: round(longtaskMs),
    frames: sorted.length,
  };
}

function round(x: number): number {
  return Math.round(x * 100) / 100;
}
