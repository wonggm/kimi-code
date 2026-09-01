// apps/kimi-web/src/lib/glass/detect.ts
// Pure detection + token-parsing helpers for the liquid-glass WebGL fallback.
// Firefox and Safari (and any other engine that is not Blink) parse
// `backdrop-filter: url(#svg-filter)` but never render it, so the GlassDefs
// refraction chain is invisible there. These helpers decide when the WebGL
// snapshot-refraction path must take over, and parse the shared `--lg-*`
// design tokens into numbers the shader can consume. No DOM access here —
// everything is unit-testable.

export interface GlassEngineEnv {
  /** CSS.supports('backdrop-filter', 'url(#lg-refract)') — PARSE support. */
  supportsUrlBackdrop: boolean;
  /** True on Blink engines (Chrome/Edge/Opera), which also RENDER the url() filter. */
  isBlink: boolean;
  /** html[data-liquid-glass="on"] */
  liquidGlassOn: boolean;
  /** prefers-reduced-transparency: reduce */
  reducedTransparency: boolean;
}

/**
 * True when the WebGL refraction fallback must take over the missing
 * `backdrop-filter: url(#…)` layer: the glass toggle is on, the OS does not
 * ask for reduced transparency, and the engine does not actually render the
 * SVG-filter backdrop chain. Blink renders it (CSS handles everything);
 * Firefox/WebKit pass the `CSS.supports` probe (the value parses) yet paint
 * nothing, so the probe alone is not enough — the engine has to be Blink as
 * well. An old/non-Blink engine where the probe itself fails also needs the
 * fallback (the @supports block in style.css never applied).
 */
export function needsWebglRefraction(env: GlassEngineEnv): boolean {
  if (!env.liquidGlassOn || env.reducedTransparency) return false;
  return !(env.supportsUrlBackdrop && env.isBlink);
}

/**
 * Parse a CSS length token to pixels. Only plain `Npx` / unitless-zero /
 * plain-number forms are understood; anything else (calc(), var() leftovers,
 * percentages) returns null so callers keep their own defaults.
 */
export function parsePxToken(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const v = raw.trim();
  if (v === '' || v === '0') return v === '0' ? 0 : null;
  const px = /^(-?\d+(?:\.\d+)?)px$/.exec(v);
  if (px) return Number(px[1]);
  const plain = /^(\d+(?:\.\d+)?)$/.exec(v);
  if (plain) return Number(plain[1]);
  return null;
}

/** Parse `saturate()`-style percentage tokens ('190%') to a multiplier (1.9). */
export function parsePercentToken(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = /^(-?\d+(?:\.\d+)?)%$/.exec(raw.trim());
  return m ? Number(m[1]) / 100 : null;
}

/** Parse a unitless number token ('1.04'); null on anything else. */
export function parseNumberToken(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = /^(-?\d+(?:\.\d+)?)$/.exec(raw.trim());
  return m ? Number(m[1]) : null;
}

/**
 * Approximate a CSS `blur(Bpx)` backdrop with a down-up resample factor:
 * draw the page snapshot at `factor` scale and stretch it back with bilinear
 * smoothing. The two bilinear passes behave like a box-blur of radius
 * ~1/factor px, so factor ≈ 2.2/blur — clamped to keep the frost tier from
 * collapsing to a single pixel and the glass tier from staying too sharp.
 */
export function blurToDownsampleFactor(blurPx: number): number {
  if (!Number.isFinite(blurPx) || blurPx <= 0) return 1;
  return Math.min(0.4, Math.max(0.055, 2.2 / blurPx));
}

/** devicePixelRatio cap for every canvas/texture this system allocates. */
export function glassPixelRatio(dpr: number): number {
  return Math.min(Math.max(dpr || 1, 1), 1.5);
}
