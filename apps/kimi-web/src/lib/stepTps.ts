// apps/kimi-web/src/lib/stepTps.ts
//
// Tokens-per-second figures for the composer's tok/s meter. The terminal UI
// computes the same numbers from the same rules; the two apps share no code,
// so the helper is duplicated here deliberately.

// Decode TPS is only meaningful when the output actually streamed over a
// measurable window. Below this threshold the duration is dominated by
// `Date.now()`'s ~1ms quantization (short / single-chunk tool-call steps can
// drain in 1ms), so dividing output tokens by it would report inflated rates
// like tens of thousands of tok/s.
export const MIN_STREAM_MS_FOR_TPS = 50;

// Half-lives of the decayed sums behind the live rate. The summed scales act
// as a kernel over recent stream time: the short scale moves with bursts, the
// long ones carry inertia through pauses.
export const TPS_HALF_LIVES_MS = [5_000, 20_000, 80_000];

// A delta arriving after a longer pause (a tool ran, the model sat silent) may
// credit at most this much stream time, so idle wall time never dilutes the
// rate; with no deltas at all the sums simply hold their last reading.
export const TPS_MAX_DELTA_GAP_MS = 1_000;

// Nothing publishes until the window holds this much weighted stream time and
// this many estimated tokens: a burst inside the first milliseconds of a step
// would otherwise stamp an unrepresentative first reading.
export const TPS_MIN_PUBLISH_TIME_MS = 1_000;
export const TPS_MIN_PUBLISH_TOKENS = 25;

// Live-rate colour bands: muted below the slow edge, plain text up to the fast
// edge, the accent colour above it.
export const TPS_BAND_SLOW_MAX = 20;
export const TPS_BAND_FAST_MIN = 50;

// The live rate moves with every delta, but the toolbar only needs it a few
// times a second. One state write per interval keeps re-rendering cheap.
export const TPS_LIVE_PATCH_INTERVAL_MS = 250;

// Streamed deltas carry no token counts, so the live rate estimates them from
// the streamed characters.
export const CHARS_PER_TOKEN_ESTIMATE = 4;

// How long the last step's exact rate stays on screen once streaming stops.
export const TPS_FINAL_TTL_MS = 30_000;

/**
 * Exact decode rate of one step: output tokens over the streamed window, or
 * null when the step has no measurable output. Input and cache tokens are never
 * counted, since they are prompt cost, not decode speed.
 */
export function computeStepTps(
  outputTokens: number | undefined,
  streamMs: number | undefined,
): number | null {
  if (outputTokens === undefined || outputTokens <= 0) return null;
  if (streamMs === undefined || streamMs < MIN_STREAM_MS_FOR_TPS) return null;
  return outputTokens / (streamMs / 1000);
}

/** One decimal, so the readout keeps a stable width as the rate moves. */
export function formatTps(tps: number): string {
  return (Math.round(tps * 10) / 10).toFixed(1);
}

export type TpsKind = 'live' | 'step' | 'avg';

export interface TpsDisplayState {
  value: number;
  kind: TpsKind;
}

/**
 * What the meter shows right now: the live estimate while text streams, the
 * last step's exact rate while it is fresh, and the session average from then
 * on, so the readout never goes blank once this session has measured anything.
 */
export function resolveTpsDisplay(input: {
  live?: number;
  final?: { tps: number; at: number };
  avg?: { tokens: number; streamMs: number };
  now: number;
}): TpsDisplayState | undefined {
  if (input.live !== undefined) return { value: input.live, kind: 'live' };
  const final = input.final;
  if (final !== undefined && input.now - final.at < TPS_FINAL_TTL_MS) {
    return { value: final.tps, kind: 'step' };
  }
  const avg = input.avg;
  if (avg !== undefined && avg.streamMs > 0) {
    return { value: avg.tokens / (avg.streamMs / 1000), kind: 'avg' };
  }
  return undefined;
}

export interface LiveTpsWindow {
  /**
   * Add one streamed chunk (assistant text or thinking). Returns the rate to
   * publish, or undefined when this chunk is not a publish point.
   */
  push(at: number, chars: number): number | undefined;
  /** Drop the window: the step ended, or an exact rate replaced the estimate. */
  reset(): void;
}

export type LiveTpsBand = 'slow' | 'mid' | 'fast';

/** Character count from a raw tool-call argument delta. */
export function toolCallDeltaChars(payload: unknown): number {
  if (payload === null || typeof payload !== 'object') return 0;
  const value = (payload as Record<string, unknown>)['argumentsPart'];
  return typeof value === 'string' ? value.length : 0;
}

/** Colour band for the live reading, same edges as the TUI footer. */
export function liveTpsBand(tps: number): LiveTpsBand {
  if (tps < TPS_BAND_SLOW_MAX) return 'slow';
  return tps < TPS_BAND_FAST_MIN ? 'mid' : 'fast';
}

/**
 * Live tok/s over exponentially decayed sums. Each scale ages tokens and an
 * exact integral of the decay kernel over stream time; the rate is the summed
 * tokens over the summed time, which weights recent chunks over older ones
 * without the cliff of a fixed window. Stream time only advances on a delta,
 * capped per gap, so tool pauses hold the reading instead of diluting it.
 *
 * Publishing is gated on minimum weighted time and tokens, then throttled to
 * one write per interval: the toolbar reads whatever is current when it
 * renders, so faster writes would only add renders.
 */
export function createLiveTpsWindow(): LiveTpsWindow {
  const tokens = TPS_HALF_LIVES_MS.map(() => 0);
  const times = TPS_HALF_LIVES_MS.map(() => 0);
  let lastAt = 0;
  let publishedAt = 0;

  function age(dtMs: number): void {
    for (let i = 0; i < TPS_HALF_LIVES_MS.length; i++) {
      const halfLife = TPS_HALF_LIVES_MS[i]!;
      const kept = 2 ** (-dtMs / halfLife);
      tokens[i]! *= kept;
      times[i]! *= kept;
      times[i]! += (halfLife / Math.LN2) * (1 - kept);
    }
  }

  return {
    push(at, chars) {
      if (chars <= 0) return undefined;
      const gap = lastAt === 0 ? 0 : Math.min(at - lastAt, TPS_MAX_DELTA_GAP_MS);
      if (gap > 0) age(gap);
      lastAt = at;
      const estimated = Math.ceil(chars / CHARS_PER_TOKEN_ESTIMATE);
      let totalTokens = 0;
      let totalTime = 0;
      for (let i = 0; i < TPS_HALF_LIVES_MS.length; i++) {
        tokens[i]! += estimated;
        totalTokens += tokens[i]!;
        totalTime += times[i]!;
      }
      if (totalTime < TPS_MIN_PUBLISH_TIME_MS || totalTokens < TPS_MIN_PUBLISH_TOKENS) {
        return undefined;
      }
      if (at - publishedAt < TPS_LIVE_PATCH_INTERVAL_MS) return undefined;
      publishedAt = at;
      return totalTokens / (totalTime / 1000);
    },
    reset() {
      tokens.fill(0);
      times.fill(0);
      lastAt = 0;
      publishedAt = 0;
    },
  };
}
