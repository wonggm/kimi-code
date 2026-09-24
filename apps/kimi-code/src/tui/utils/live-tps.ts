import {
  CHARS_PER_TOKEN_ESTIMATE,
  TPS_HALF_LIVES_MS,
  TPS_LIVE_PATCH_INTERVAL_MS,
  TPS_MAX_DELTA_GAP_MS,
  TPS_MIN_PUBLISH_TIME_MS,
  TPS_MIN_PUBLISH_TOKENS,
} from '../constant/streaming';

export interface LiveTpsWindow {
  /**
   * Add one streamed chunk (assistant text, thinking, or tool-call arguments).
   * Returns the rate to publish, or undefined when this chunk is not a publish point.
   */
  push(at: number, chars: number): number | undefined;
  /** Drop the window: the step ended, the turn ended, or the runtime reset. */
  reset(): void;
}

/**
 * Live tok/s over exponentially decayed sums. Each scale ages tokens and an
 * exact integral of the decay kernel over stream time; the rate is the summed
 * tokens over the summed time, which weights recent chunks over older ones
 * without the cliff of a fixed window. Stream time only advances on a delta,
 * capped per gap, so tool pauses hold the reading instead of diluting it.
 *
 * Publishing is gated on minimum weighted time and tokens, then throttled to
 * one patch per interval: the footer reads whatever is current when it renders,
 * so faster patches would only add renders.
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
      const estimated = chars / CHARS_PER_TOKEN_ESTIMATE;
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
