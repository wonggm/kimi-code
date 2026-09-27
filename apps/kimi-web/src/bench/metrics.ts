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
 * One bench run's memory readings. The in-page sampler supplies the heap and
 * element series; the renderer-side counters come from CDP, which the driver
 * merges in after reading `window.__benchMemory` (so they arrive as 0 in the page).
 */
export interface BenchMemory {
  /** JS heap in use when the scenario finished (MB). */
  heapEndMb: number;
  /** Highest JS heap seen during the scenario (MB). */
  heapPeakMb: number;
  /** Elements in the document when the scenario finished. */
  domNodesEnd: number;
  /** Highest element count seen during the scenario. */
  domNodesPeak: number;
  /** Every node the renderer holds, text and shadow nodes included. */
  rendererNodes: number;
  /** Live event listeners the renderer reports. */
  eventListeners: number;
  /** Nodes held with no path to a document, or -1 when no snapshot was taken. */
  detachedNodes: number;
  /** Bytes held by those detached nodes, or -1 when no snapshot was taken. */
  detachedBytes: number;
  /**
   * JS heap still held after the driver forces a collection. The gap between
   * this and `heapEndMb` is what the run left behind; a value close to
   * `heapEndMb` means the memory is still reachable, not waiting to be swept.
   * -1 when the collection could not be run.
   */
  heapAfterGcMb: number;
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
  const sorted = [...frameTimes].toSorted((a, b) => a - b);
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

/**
 * Fold the sampler's heap (MB) and element-count series into a `BenchMemory`.
 * Empty series read as 0 rather than NaN, so an unsupported `performance.memory`
 * still produces a comparable record. The renderer counters default to -1, which
 * reads as "not measured" and never as a real zero.
 */
export function computeMemory(heapMb: readonly number[], domNodes: readonly number[]): BenchMemory {
  return {
    heapEndMb: heapMb.length === 0 ? 0 : round(heapMb.at(-1)!),
    heapPeakMb: heapMb.length === 0 ? 0 : round(Math.max(...heapMb)),
    domNodesEnd: domNodes.length === 0 ? 0 : domNodes.at(-1)!,
    domNodesPeak: domNodes.length === 0 ? 0 : Math.max(...domNodes),
    rendererNodes: -1,
    eventListeners: -1,
    detachedNodes: -1,
    detachedBytes: -1,
    heapAfterGcMb: -1,
  };
}
