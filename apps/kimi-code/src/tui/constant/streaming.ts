// Extracts useful string fields from partially streamed JSON tool args.
// This is intentionally a preview parser, not a full JSON parser.
export const STREAMING_ARGS_FIELD_RE =
  /"(path|file_path|command|pattern|query|url|description|title|name)"\s*:\s*"((?:\\.|[^"\\])*)"/g;

// Bounds live tool-argument previews; final tool.call payloads remain complete.
export const STREAMING_ARGS_PREVIEW_MAX_CHARS = 64 * 1024;

// Coalesces high-frequency model/tool deltas before rebuilding TUI components.
export const STREAMING_UI_FLUSH_MS = 50;

// Half-lives of the decayed sums behind the footer's live tok/s meter. The
// summed scales act as a kernel over recent stream time: the short scale moves
// with bursts, the long ones carry inertia through pauses.
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

// Live-rate colour bands: the dim text colour below the slow edge, the plain
// text colour up to the fast edge, the accent colour above it.
export const TPS_BAND_SLOW_MAX = 20;
export const TPS_BAND_FAST_MIN = 50;

// The live rate moves with every delta, but the footer only needs it a few
// times a second. One state patch per interval keeps rendering cheap.
export const TPS_LIVE_PATCH_INTERVAL_MS = 250;

// Streamed deltas carry no token counts, so the live rate estimates them from
// the streamed characters. The prior below is only a seed: every settled step
// reports the engine's own output count, which says how many characters one
// token really took, and the ratio moves toward it.
export const CHARS_PER_TOKEN_SEED = 4;

// A settled step may only move the ratio when its own text accounts for most of
// its tokens. A step whose text never arrived (a redacted or summarized
// thinking block, a tool-call envelope) has far fewer characters than tokens and
// would otherwise teach the estimator that one token is a fraction of a
// character. The band also rejects a step whose text was truncated away.
export const MIN_CHARS_PER_TOKEN_CALIBRATION = 1;
export const MAX_CHARS_PER_TOKEN_CALIBRATION = 12;

// How much of the correction a single settled step applies (dsh's ratio EMA).
export const CHARS_PER_TOKEN_CALIBRATION_WEIGHT = 0.4;

// How long the last step's exact rate stays on screen once streaming stops.
export const TPS_FINAL_TTL_MS = 30_000;
