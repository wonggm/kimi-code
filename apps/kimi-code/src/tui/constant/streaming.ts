// Extracts useful string fields from partially streamed JSON tool args.
// This is intentionally a preview parser, not a full JSON parser.
export const STREAMING_ARGS_FIELD_RE =
  /"(path|file_path|command|pattern|query|url|description|title|name)"\s*:\s*"((?:\\.|[^"\\])*)"/g;

// Bounds live tool-argument previews; final tool.call payloads remain complete.
export const STREAMING_ARGS_PREVIEW_MAX_CHARS = 64 * 1024;

// Coalesces high-frequency model/tool deltas before rebuilding TUI components.
export const STREAMING_UI_FLUSH_MS = 50;

// Rolling window of assistant-delta samples behind the footer's live tok/s
// meter: older samples are dropped so the rate tracks the current decode speed
// rather than the average over the whole step.
export const TPS_LIVE_WINDOW_MS = 2000;

// The live rate moves with every delta, but the footer only needs it a few
// times a second. One state patch per interval keeps rendering cheap.
export const TPS_LIVE_PATCH_INTERVAL_MS = 250;

// Assistant deltas carry no token counts, so the live rate estimates them from
// the streamed characters.
export const CHARS_PER_TOKEN_ESTIMATE = 4;

// How long the last step's exact rate stays on screen once streaming stops.
export const TPS_FINAL_TTL_MS = 30_000;
