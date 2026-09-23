/**
 * Tokens-per-second helpers shared by the footer meter and the
 * `KIMI_CODE_DEBUG` step-timing line, so both report the same figure from the
 * same rule.
 */

// Decode TPS is only meaningful when the output actually streamed over a
// measurable window. Below this threshold the duration is dominated by
// `Date.now()`'s ~1ms quantization (short / single-chunk tool-call turns can
// drain in 1ms), so dividing output tokens by it would report inflated rates
// like tens of thousands of tok/s.
export const MIN_STREAM_MS_FOR_TPS = 50;

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
