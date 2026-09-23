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

// Rolling window of text-delta samples behind the live rate: older samples are
// dropped so the figure tracks the current decode speed rather than the average
// over the whole step.
export const TPS_LIVE_WINDOW_MS = 2000;

// The live rate moves with every delta, but the toolbar only needs it a few
// times a second. One state write per interval keeps re-rendering cheap.
export const TPS_LIVE_PATCH_INTERVAL_MS = 250;

// Text deltas carry no token counts, so the live rate estimates them from the
// streamed characters.
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

export interface LiveTpsWindow {
  /**
   * Add one streamed text chunk. Returns the rate to publish, or undefined when
   * this chunk is not a publish point.
   */
  push(at: number, chars: number): number | undefined;
  /** Drop the window: the step ended, or an exact rate replaced the estimate. */
  reset(): void;
}

/**
 * The window itself is pruned on every chunk, but a rate is published at most
 * once per interval: the toolbar reads whatever is current when it renders, so
 * publishing faster would only add renders.
 *
 * A window holding fewer than two samples is never published, and the publish
 * clock is re-seeded to the incoming sample whenever that happens. One sample
 * has no elapsed span, so the rate would divide by the 1ms floor and read in
 * the thousands of tok/s. The re-seed is what keeps the clock honest after a
 * gap: a gap longer than the window prunes it down to the chunk that just
 * arrived, and a clock left over from before the gap would let a second chunk
 * in the same millisecond pass the throttle and publish that same 1ms span.
 * Together the two rules mean every published rate spans at least one interval.
 */
export function createLiveTpsWindow(): LiveTpsWindow {
  let samples: { at: number; chars: number }[] = [];
  let publishedAt = 0;

  return {
    push(at, chars) {
      samples.push({ at, chars });
      const cutoff = at - TPS_LIVE_WINDOW_MS;
      while (samples.length > 0 && samples[0]!.at < cutoff) samples.shift();
      if (samples.length < 2) {
        publishedAt = at;
        return undefined;
      }
      if (at - publishedAt < TPS_LIVE_PATCH_INTERVAL_MS) return undefined;
      publishedAt = at;
      let windowChars = 0;
      for (const sample of samples) windowChars += sample.chars;
      const spanMs = Math.max(1, at - samples[0]!.at);
      return Math.ceil(windowChars / CHARS_PER_TOKEN_ESTIMATE) / (spanMs / 1000);
    },
    reset() {
      samples = [];
    },
  };
}
