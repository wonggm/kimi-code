/**
 * Tokens-per-second helpers shared by the footer meter and the
 * `KIMI_CODE_DEBUG` step-timing line, so both report the same figure from the
 * same rule.
 */

// Decode TPS is only meaningful when the output actually streamed over a
// window long enough to time. A provider that delivers a whole reply in one
// chunk, or a client that was busy when the chunks landed, gives a window of a
// few tens of milliseconds and a full token count; the ratio then measures
// delivery, not decode, and reads in the thousands. 250 ms is the floor
// opencode uses for the same figure. Measured over 1385 steps of a long
// session it drops the peak from 5107 to 520 tok/s and stops counting 0.9% of
// the output tokens, all of them from steps that were never really streamed.
export const MIN_STREAM_MS_FOR_TPS = 250;

/**
 * Exact decode rate of one step: output tokens over the streamed window, or
 * null when the step has no measurable output. Input and cache tokens are
 * never counted, since they are prompt cost rather than decode speed.
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
