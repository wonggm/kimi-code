// apps/kimi-web/src/lib/glass/gl-renderer.ts
// The WebGL fallback for the liquid-glass rim refraction. Firefox and Safari
// parse `backdrop-filter: url(#lg-refract)` but never render it, so on those
// engines the D1 refraction look (rim displacement of the backdrop + specular
// glint + grain) is missing. This module reproduces exactly that layer: it
// keeps ONE shared WebGL context, rasterizes the page behind
// the open glass panes into a snapshot texture via lib/glass/snapshot.ts, and
// paints each opted-in panel with a canvas that sits directly beneath it.
//
// Contract highlights:
// - Detection: CSS.supports probe + Blink check (detect.ts). Active state
//   flips `html[data-glass-engine="webgl"]` so the style.css cooperation rules
//   (`.lg-gl-refracted` backdrop-filter suppression) can follow.
// - One context for all panes: a detached "layer" canvas holds the GL
//   framebuffer sized to the viewport; each surface gets a cheap 2D canvas
//   that receives its slice via drawImage.
// - Snapshot cadence: captures are debounced (~150ms) and frozen while any
//   transient surface (menus/tooltips) is open; a failed capture keeps the
//   previous snapshot, and repeated failures disable the engine for the
//   session. The attach class that suppresses a panel's own backdrop-filter
//   (`.lg-gl-refracted`) is only added after that panel's first successful
//   paint, so before/without a valid snapshot every pane keeps the plain CSS
//   blur look — nothing ever renders as a hole.
// - Caps: at most MAX_ATTACHED canvases live; newest registrations win, the
//   oldest transient panes are demoted to plain blur first.
// - Lifecycle: no continuous rAF loop when nothing is open; GL/DOM resources
//   are disposed on toggle-off, reduced-transparency, or app unmount.

import {
  glassPixelRatio,
  needsWebglRefraction,
  parseNumberToken,
  parsePercentToken,
  parsePxToken,
  resolveGlassRegime,
  type GlassRegime,
} from './detect';
import {
  FrameBudget,
  clearSurfaceAmbient,
  setSurfaceAmbient,
  tintAdjustFromLuma,
} from './ambient';
import {
  capturePageSnapshot,
  makeBlurredVariant,
  samplePageLuminance,
  sampleRegionLuminance,
  type PageSnapshot,
} from './snapshot';

export interface GlassSurfaceOptions {
  /** Menus/tooltips: freezes snapshot refresh while open (default true). */
  transient?: boolean;
}

type ActiveListener = (active: boolean) => void;
type RegimeListener = (regime: GlassRegime) => void;

interface SurfaceParams {
  blurPx: number;
  sat: number;
  bright: number;
  edgePx: number;
  radiusPx: number;
  /** Rim-band specular strength (`--lg-spec`), theme-linked. */
  spec: number;
}

interface Surface {
  el: HTMLElement;
  transient: boolean;
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  styleObserver: MutationObserver | null;
  params: SurfaceParams;
  lastRect: { x: number; y: number; w: number; h: number } | null;
  lastOpacity: number; // fade detection for transient panes
  genPainted: number; // snapshot generation this pane's canvas holds
  painted: boolean;
  demoted: boolean; // exceeded the canvas cap → stays plain-blur
  /** Signed ambient tint adjustment measured for the current snapshot. */
  ambient: number;
  /** `paramsEpoch` the surface's computed-style params were last read under. */
  paramsEpochRead: number;
}

interface TierTexture {
  texture: WebGLTexture;
  gen: number;
}

// Mirrors of the GlassDefs.vue SVG lens parameters (primitiveUnits
// objectBoundingBox): the ramps bend the outer 24% of the element and the
// feDisplacementMap scale 0.8 peaks at 5% of the element size — the ramp
// channels only span 0x60…0xA0 (0.375…0.625) and the 0.25/0.5/0.75 table
// remap compresses that to 0.4375…0.5625, i.e. ±0.0625 around neutral.
// Fractions, so pane size changes cost nothing.
const LENS_EDGE_FRACTION = 0.24;
const LENS_PULL_FRACTION = 0.05;
// Fallback for the token the shader consumes when a panel's computed style
// cannot be parsed: --lg-spec (rim-band specular strength).
const SPEC_STRENGTH = 0.42;
const GRAIN_AMPLITUDE = 0.05; // feTurbulence+feColorMatrix grain analogue

const MAX_ATTACHED = 10;
const CAPTURE_DEBOUNCE_MS = 150;
const CAPTURE_SCALE_FACTOR = 0.5; // texture px per CSS px (blur hides the rest)
const MAX_LAYER_DIM = 2048;
const FOLLOW_MS = 500;
const MAX_CAPTURE_FAILURES = 3;

const VERT_SRC = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos;
  gl_Position = vec4(aPos.x * 2.0 - 1.0, 1.0 - aPos.y * 2.0, 0.0, 1.0);
}
`;

const FRAG_SRC = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uSize;    // panel size in SNAPSHOT-TEXTURE px
uniform vec2 uBaseTex; // panel top-left inside the snapshot texture (px)
uniform vec2 uTexSize; // snapshot texture size (px)
uniform float uRadius; // corner radius, texture px
uniform vec2 uEdge;    // rim zone width per axis, texture px
uniform vec2 uPull;    // max displacement px (per axis)
uniform float uBright;
uniform float uSat;
uniform float uHasSpec;
uniform float uSpec;    // rim-band specular strength (--lg-spec), theme-linked
uniform float uAmbient;  // signed ±luminance ambient tint for this pane's region

float sdRoundRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + vec2(r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float smoothRamp(float t) {
  float c = clamp(t, 0.0, 1.0);
  return c * c * (3.0 - 2.0 * c);
}

void main() {
  vec2 p = vUv * uSize;
  float d = sdRoundRect(p - uSize * 0.5, uSize * 0.5, uRadius);
  float coverage = 1.0 - smoothstep(-0.75, 0.75, d);
  if (coverage <= 0.0) { discard; }
  // Separable rim ramps, mirroring the SVG lens gradients one-to-one: the x
  // ramp spans the outer rim of the WIDTH and drives only x displacement,
  // the y ramp the outer rim of the HEIGHT and drives only y. Edge pixels
  // sample from OUTSIDE their own position, so the rim magnifies the
  // neighbouring backdrop like a lens shoulder (same asymmetry as the SVG
  // ramps). A radial-from-center direction field instead gives the top and
  // bottom rims of an oblong pane a large sideways component — text under a
  // wide, short pane (the header band) smears into horizontal streaks. The
  // sampled texture is already blurred per tier, so no extra taps here.
  float ex = min(p.x, uSize.x - p.x);
  float ey = min(p.y, uSize.y - p.y);
  float wx = smoothRamp(1.0 - ex / max(uEdge.x, 1.0));
  float wy = smoothRamp(1.0 - ey / max(uEdge.y, 1.0));
  vec2 sgn = sign(p - uSize * 0.5);
  vec2 disp = vec2(sgn.x * wx * uPull.x, sgn.y * wy * uPull.y);
  vec2 texel = uBaseTex + p;
  // One displaced sample for all channels — the SVG filter displaces R/G/B
  // identically, so there is no chromatic split to mirror here.
  vec2 uv = clamp((texel + disp) / uTexSize, vec2(0.0), vec2(1.0));
  vec3 col = texture2D(uTex, uv).rgb;
  // saturate + brightness, mirroring --lg-sat / --lg-bright, then the
  // render-time ambient tint for the region behind this pane (uAmbient is a
  // signed fraction, so dark content deepens and bright content lifts the
  // surface). style.css applies the same read to the face tint through
  // --lg-amb-deepen / --lg-amb-lift; the renderer writes one channel or the
  // other per surface, never both, so a pane is never tinted twice.
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, uSat) * (uBright * (1.0 + uAmbient));
  // Rim-band specular (feSpecularLighting analogue): rides the same
  // separable rim field as the displacement, weighted toward the top edge
  // and slightly the left — the key light sits high-left, and corners,
  // where both ramps meet, read brightest, matching how a real glass
  // highlight follows the edge curvature rather than sitting as a blob.
  // uSpec follows the theme's surface brightness (--lg-spec): the dark theme
  // keeps the full white edge, the light theme drops it because a white rim
  // on a white face is invisible and the shaded edges carry the contour.
  if (uHasSpec > 0.5) {
    float wTop = sgn.y < 0.0 ? 1.0 : 0.12;
    float wSide = sgn.x < 0.0 ? 0.55 : 0.15;
    float rimSpec = pow(wy, 2.5) * wTop + pow(wx, 2.5) * wSide;
    col += vec3(rimSpec * uSpec);
  }
  // Static hash grain (feTurbulence analogue) — no animation, so it is safe
  // under prefers-reduced-motion by construction.
  float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * ${GRAIN_AMPLITUDE.toFixed(3)};
  gl_FragColor = vec4(clamp(col, 0.0, 1.0) * coverage, coverage);
}
`;

/**
 * Re-read a surface's computed-style params, stamping the epoch only on success
 * so a read that fails (style not resolvable yet) retries on the next sync
 * instead of freezing whatever value the surface happened to hold.
 */
function syncParams(s: Surface): void {
  const params = readParams(s.el);
  if (!params) return;
  s.params = params;
  s.paramsEpochRead = paramsEpoch;
}

function readParams(el: HTMLElement): SurfaceParams | null {
  const cs = getComputedStyle(el);
  const blurPx = parsePxToken(cs.getPropertyValue('--lg-blur'));
  if (blurPx === null || blurPx <= 0) return null;
  return {
    blurPx,
    sat: parsePercentToken(cs.getPropertyValue('--lg-sat')) ?? 1.9,
    bright: parseNumberToken(cs.getPropertyValue('--lg-bright')) ?? 1.04,
    edgePx: parsePxToken(cs.getPropertyValue('--lg-edge-px')) ?? 10,
    radiusPx: Math.max(0, parsePxToken(cs.borderTopLeftRadius) ?? 0),
    spec: parseNumberToken(cs.getPropertyValue('--lg-spec')) ?? SPEC_STRENGTH,
  };
}

// ---------------------------------------------------------------------------
// Module state (a single instance — every pane shares this renderer).
// ---------------------------------------------------------------------------

let refCount = 0;
let watching = false; // document-level attribute/media listeners installed
let sessionDisabled = false;
let active = false;
// The frame-budget watchdog latched: the app is in the designed opaque regime
// and the GL loop stays down for the rest of the session (one-way by design).
let budgetDemoted = false;
// Hand-forced opaque regime (design-system demo control).
let forcedOpaque = false;
const frameBudget = new FrameBudget();

let surfaces: Surface[] = [];
let listenersInstalled = false;
let captureTimer: ReturnType<typeof setTimeout> | null = null;
let captureDirty = false;
// Set when a capture was scheduled by a pane opening (registration or lazy
// attach): that capture must fire even while a transient pane is open —
// otherwise the canvas attaches within a frame or two, the freeze check sees
// hasTransientOpen() + an existing snapshot, and the "fresh backdrop exactly
// once" never happens, leaving the pane on a stale snapshot for its whole
// open lifetime.
let captureForced = false;
let capturing = false;
let captureFailures = 0;
let snapshotGen = 0;
let snapshot: PageSnapshot | null = null;
let tierTextures = new Map<number, TierTexture>();
// Paint gating: the follow rAF loop wakes on every scroll event, but the
// permanent panes (sidebar, top band, composer, right panel) do not move
// when the transcript scrolls — re-syncing computed styles and re-painting
// them every frame doubled p95 frame time (16→30ms measured on live
// Firefox). paintedGen tracks the snapshot generation the canvases hold;
// paramsEpoch invalidates every surface's computed-style params. It is compared
// per surface (`paramsEpochRead`) rather than consumed as one global flag: a
// single `paramsStale` boolean was cleared by the first layout pass even when
// individual surfaces had skipped that pass (hidden pane, no canvas yet), so a
// theme change could leave a pane's `--lg-*`-derived params — uSpec included —
// stale for as long as the page stayed still.
let paintedGen = -1;
let paramsEpoch = 0;

let layerCanvas: HTMLCanvasElement | null = null;
let layerScale = 1;
let gl: WebGLRenderingContext | null = null;
let program: WebGLProgram | null = null;
let quadBuffer: WebGLBuffer | null = null;
let aPosLoc = -1;
let renderQueued = false;
let followUntil = 0;
const lastSlices: Record<string, unknown>[] = [];

const activeListeners = new Set<ActiveListener>();
const regimeListeners = new Set<RegimeListener>();
let currentRegime: GlassRegime = 'refractive';

function emitActive(): void {
  for (const fn of Array.from(activeListeners)) fn(active);
}

/** Reactive-friendly subscription to the engine's active flag. */
export function subscribeGlassActive(fn: ActiveListener): () => void {
  activeListeners.add(fn);
  return () => activeListeners.delete(fn);
}

export function isGlassWebglActive(): boolean {
  return active;
}

/** Current ambient regime (refractive glass vs designed opaque). */
export function glassRegime(): GlassRegime {
  return currentRegime;
}

/** Subscribe to regime changes (frame-budget demotion, OS transparency). */
export function subscribeGlassRegime(fn: RegimeListener): () => void {
  regimeListeners.add(fn);
  return () => regimeListeners.delete(fn);
}

/**
 * Force the designed opaque regime on or off by hand (the design-system view's
 * regime control). Clearing it also releases the frame-budget latch, which is
 * the only way the latch opens; that is deliberate — it happens from an
 * explicit user action, never from the watchdog.
 */
export function setGlassRegimeForced(opaque: boolean): void {
  forcedOpaque = opaque;
  if (!opaque) {
    budgetDemoted = false;
    frameBudget.reset();
  }
  evaluate();
}

function probeEnv() {
  const supportsUrlBackdrop =
    typeof CSS !== 'undefined' &&
    (CSS.supports('backdrop-filter', 'url(#lg-refract)') ||
      CSS.supports('-webkit-backdrop-filter', 'url(#lg-refract)'));
  // window.chrome exists on every Blink-based desktop engine and on neither
  // Firefox nor Safari — exactly the parse-vs-render distinction the
  // backdrop-filter url() situation needs (Firefox/WebKit parse it, only
  // Blink renders it).
  const isBlink = typeof (window as { chrome?: unknown }).chrome === 'object';
  const reducedTransparency = window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
  const liquidGlassOn = document.documentElement.dataset.liquidGlass === 'on';
  return { supportsUrlBackdrop, isBlink, reducedTransparency, liquidGlassOn };
}

function evaluate(): void {
  applyRegime();
  if (sessionDisabled || budgetDemoted) {
    setActive(false);
    return;
  }
  // The designed opaque regime needs no refraction engine at all: CSS paints
  // the flat face, so the loop stays down (this is also the path taken when
  // prefers-reduced-transparency matches or the demo control forces opaque).
  if (currentRegime === 'opaque') {
    setActive(false);
    return;
  }
  setActive(needsWebglRefraction(probeEnv()));
}

/**
 * Publish the current regime on `<html>` so style.css can switch every glass
 * surface between the refractive and the designed opaque material. Reduced
 * transparency is a CSS media contract too, but writing the attribute keeps
 * the DOM honest about what is actually being painted (and lets the design
 * view / debug surface read it).
 */
function applyRegime(): void {
  const regime = resolveGlassRegime({
    liquidGlassOn: document.documentElement.dataset.liquidGlass === 'on',
    reducedTransparency: mqTransparency?.matches ?? false,
    budgetExceeded: budgetDemoted,
    forcedOpaque,
  });
  if (document.documentElement.dataset.glassRegime === regime) return;
  if (regime === 'refractive') delete document.documentElement.dataset.glassRegime;
  else document.documentElement.dataset.glassRegime = regime;
  currentRegime = regime;
  for (const fn of Array.from(regimeListeners)) fn(regime);
}

function setActive(on: boolean): void {
  if (on === active) return;
  if (on) {
    active = true;
    document.documentElement.dataset.glassEngine = 'webgl';
    installListeners();
    for (const s of surfaces) {
      s.demoted = false; // fresh canvas budget per activation
      s.ambient = 0;
      syncParams(s);
      markRegistration(s);
    }
    requestFollow();
    scheduleCapture(0);
  } else {
    active = false;
    delete document.documentElement.dataset.glassEngine;
    detachAllSurfaces();
    disposeGl();
    removeListeners();
  }
  emitActive();
}

/** Permanently disable for this page session (repeated snapshot failures). */
function disableSession(): void {
  sessionDisabled = true;
  setActive(false);
}

/**
 * Frame-budget demotion: the loop stopped paying for itself, so every surface
 * moves to the designed opaque regime and the GL loop stops. One-way for the
 * session — no recovery machinery, because the opaque state is a resting
 * design state rather than an error.
 */
function demoteForBudget(averageMs: number): void {
  if (budgetDemoted) return;
  budgetDemoted = true;
  console.warn(
    `[glass] frame budget exceeded (${averageMs.toFixed(1)}ms mean over the rolling window) — ` +
      'switching to the opaque regime for this session',
  );
  setActive(false);
  applyRegime();
}

// ---------------------------------------------------------------------------
// Public registration API (used by composables/useGlassRefraction)
// ---------------------------------------------------------------------------

export function registerGlassSurface(el: HTMLElement, options: GlassSurfaceOptions = {}): void {
  if (surfaces.some((s) => s.el === el)) return;
  const surface: Surface = {
    el,
    transient: options.transient !== false,
    canvas: null,
    ctx: null,
    styleObserver: null,
    params:
      readParams(el) ?? {
        blurPx: 8,
        sat: 1.9,
        bright: 1.04,
        edgePx: 10,
        radiusPx: 8,
        spec: SPEC_STRENGTH,
      },
    lastRect: null,
    lastOpacity: Number.NaN,
    genPainted: -1,
    painted: false,
    demoted: false,
    ambient: 0,
    paramsEpochRead: -1,
  };
  surfaces.push(surface);
  markRegistration(surface);
  if (active) {
    // A newly opened pane needs a fresh backdrop exactly once; while another
    // transient pane is open further captures stay frozen — this one is
    // forced, or the freeze would swallow it (the canvas attaches before the
    // debounce fires). The canvas itself attaches lazily in layoutAndRender,
    // once the rect is actually visible.
    scheduleCapture(CAPTURE_DEBOUNCE_MS, true);
    requestFollow();
  }
}

export function unregisterGlassSurface(el: HTMLElement): void {
  const idx = surfaces.findIndex((s) => s.el === el);
  if (idx === -1) return;
  const surface = surfaces[idx]!;
  surfaces.splice(idx, 1);
  // detachCanvas drops the canvas, class AND the snapshot-fixup attributes.
  detachCanvas(surface);
  clearSurfaceAmbient(el);
  // Last transient pane closed: honour any capture the freeze deferred.
  if (active && captureDirty) scheduleCapture(0);
  requestFollow();
}

/** data-lg-gl-reg marks the pane as registered (debug/inspection hook).
 *  data-lg-gl-rel is set only on STATIC panels: the style.css cooperation
 *  rule turns it into position:relative so the DOM paint order (canvas below
 *  pane) survives. Panels that are already positioned paint above the
 *  non-positioned canvas on their own, and forcing them relative would break
 *  anchored menus (absolute → relative throws the panel back in flow and
 *  stretches its container). The snapshot clone hides panes via the .lg-lens
 *  class (see snapshot.ts), not via these attributes. */
function markRegistration(surface: Surface): void {
  surface.el.dataset.lgGlReg = String(Math.round(surface.params.blurPx));
  if (getComputedStyle(surface.el).position === 'static') surface.el.dataset.lgGlRel = '1';
}

// ---------------------------------------------------------------------------
// Canvas attachment (one 2D canvas per pane, inserted as the panel's
// immediately-preceding sibling so it paints under the panel and above
// everything the panel itself sits above).
// ---------------------------------------------------------------------------

function countAttached(): number {
  return surfaces.reduce((n, s) => n + (s.canvas ? 1 : 0), 0);
}

function attachCanvas(surface: Surface): void {
  if (!active || surface.canvas || surface.demoted) return;
  // A hand-demoted surface is out of the refractive regime: it takes the
  // designed opaque face and never gets a GL pane.
  if (surface.el.classList.contains('lg-demoted')) return;
  if (!surface.el.parentElement) return;
  if (countAttached() >= MAX_ATTACHED) {
    // Newest registrations win. Demote the oldest TRANSIENT pane first —
    // the permanent surfaces (sidebar, composer, right panel, top band)
    // registered at mount and would otherwise be the first to lose their
    // canvas every time a few menus stack up.
    const oldest =
      surfaces.find((s) => s.canvas && s.transient && s !== surface) ??
      surfaces.find((s) => s.canvas && s !== surface);
    if (oldest) {
      detachCanvas(oldest);
      oldest.demoted = true; // newest wins; the rest render plain blur
      // The demoted pane is still mounted and visible (plain CSS blur), so
      // it stays part of the snapshot fixup set: re-stamp its reg attribute
      // and let the newest registered pane take over the top mark.
      markRegistration(oldest);
    } else {
      surface.demoted = true;
      return;
    }
  }
  const cs = getComputedStyle(surface.el);
  const canvas = document.createElement('canvas');
  canvas.className = 'lg-gl-pane';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.position = cs.position === 'fixed' ? 'fixed' : 'absolute';
  canvas.style.left = '0px';
  canvas.style.top = '0px';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = cs.zIndex !== 'auto' ? cs.zIndex : 'auto';
  canvas.style.borderRadius = cs.borderRadius;
  surface.el.parentElement.insertBefore(canvas, surface.el);
  // Probe the canvas's containing block: a transformed/scaled CB breaks the
  // rect-delta math — degrade that pane to plain blur instead.
  canvas.style.width = '100px';
  const probe = canvas.getBoundingClientRect().width;
  canvas.style.width = '';
  if (Math.abs(probe - 100) > 0.75) {
    canvas.remove();
    surface.demoted = true;
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }
  surface.canvas = canvas;
  surface.ctx = ctx;
  surface.painted = false;
  // Panels are often re-anchored by JS right after opening (viewport clamping
  // of the composer dropdowns). Watch style/class writes on the panel itself
  // so a silent move always triggers a re-measure of the slice.
  if (typeof MutationObserver !== 'undefined') {
    surface.styleObserver = new MutationObserver(() => requestFollow());
    surface.styleObserver.observe(surface.el, {
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
  }
  // A lazily attached pane is a newly opened pane: give it one fresh
  // backdrop even if no mutation/scroll event happens to arrive afterwards.
  scheduleCapture(CAPTURE_DEBOUNCE_MS, true);
  requestFollow();
}

function detachCanvas(surface: Surface): void {
  surface.canvas?.remove();
  surface.canvas = null;
  surface.ctx = null;
  surface.styleObserver?.disconnect();
  surface.styleObserver = null;
  surface.painted = false;
  surface.lastRect = null;
  surface.el.classList.remove('lg-gl-refracted');
  // The snapshot fixup attributes are part of the attachment — dropping the
  // attachment (cap demotion, unregister, engine deactivation) must drop them
  // too, or a stale data-lg-gl-reg/-rel survives into the next activation and
  // mislabels the clone fixups.
  delete surface.el.dataset.lgGlReg;
  delete surface.el.dataset.lgGlRel;
}

function detachAllSurfaces(): void {
  for (const s of surfaces) detachCanvas(s);
}

// ---------------------------------------------------------------------------
// Listeners + capture scheduling
// ---------------------------------------------------------------------------

function onScrollResize(): void {
  if (!active || surfaces.length === 0) return;
  requestFollow();
  scheduleCapture(CAPTURE_DEBOUNCE_MS);
}

function onBodyMutation(): void {
  if (!active || surfaces.length === 0) return;
  scheduleCapture(CAPTURE_DEBOUNCE_MS);
}

function onGlassAnimation(): void {
  requestFollow();
}

const bodyObserver =
  typeof MutationObserver !== 'undefined' ? new MutationObserver(() => onBodyMutation()) : null;

function installListeners(): void {
  if (listenersInstalled) return;
  listenersInstalled = true;
  window.addEventListener('scroll', onScrollResize, { passive: true, capture: true });
  window.addEventListener('resize', onScrollResize);
  document.addEventListener('transitionrun', onGlassAnimation, true);
  document.addEventListener('animationstart', onGlassAnimation, true);
  bodyObserver?.observe(document.body, { childList: true, subtree: true, characterData: true });
}

function removeListeners(): void {
  if (!listenersInstalled) return;
  listenersInstalled = false;
  window.removeEventListener('scroll', onScrollResize, { capture: true });
  window.removeEventListener('resize', onScrollResize);
  document.removeEventListener('transitionrun', onGlassAnimation, true);
  document.removeEventListener('animationstart', onGlassAnimation, true);
  bodyObserver?.disconnect();
  if (captureTimer !== null) {
    clearTimeout(captureTimer);
    captureTimer = null;
  }
}

let htmlObserver: MutationObserver | null = null;
const mqTransparency =
  typeof window !== 'undefined' && 'matchMedia' in window
    ? window.matchMedia('(prefers-reduced-transparency: reduce)')
    : null;

function startWatchingDocument(): void {
  if (watching || typeof MutationObserver === 'undefined') return;
  watching = true;
  // data-liquid-glass toggles the engine; data-color-scheme repaints every
  // token on the page, so a theme switch must also refresh the snapshot —
  // scroll/typing would eventually do it, but a pane opened right after the
  // switch would otherwise freeze onto the old theme's backdrop.
  // The theme attribute is applied by useAppearance at module-evaluation time,
  // i.e. BEFORE this observer exists, so the boot state can never arrive as a
  // mutation. That is why every surface starts at paramsEpochRead = -1 (first
  // sync always reads) and why the epoch comparison below, not a witnessed
  // mutation, is what guarantees fresh params.
  htmlObserver = new MutationObserver(() => {
    evaluate();
    paramsEpoch++; // theme tokens feed readParams — re-sync every pane
    if (active) scheduleCapture(CAPTURE_DEBOUNCE_MS, true);
  });
  htmlObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-liquid-glass', 'data-color-scheme'],
  });
  mqTransparency?.addEventListener('change', evaluate);
  evaluate();
}

function stopWatchingDocument(): void {
  if (!watching) return;
  watching = false;
  htmlObserver?.disconnect();
  htmlObserver = null;
  mqTransparency?.removeEventListener('change', evaluate);
}

function hasTransientOpen(): boolean {
  // Only VISIBLE transient panes freeze refreshes (lazy attach keeps
  // mounted-but-hidden panes canvas-less).
  return surfaces.some((s) => s.transient && s.canvas);
}

function hasVisibleSurface(): boolean {
  return surfaces.some((s) => s.canvas);
}

function scheduleCapture(delayMs: number, force = false): void {
  if (!active) return;
  if (force) captureForced = true;
  if (captureTimer !== null) clearTimeout(captureTimer);
  captureTimer = setTimeout(() => {
    captureTimer = null;
    void runCapture();
  }, Math.max(0, delayMs));
}

async function runCapture(): Promise<void> {
  if (!active) return;
  if (capturing) {
    // A capture is already in flight (started before this request — possibly
    // before the theme/scroll change that triggered us). Mark dirty so its
    // finally-block reschedules a follow-up instead of silently dropping the
    // refresh; captureForced survives untouched, so the rerun stays forced.
    captureDirty = true;
    return;
  }
  const forced = captureForced;
  captureForced = false;
  if (!hasVisibleSurface()) {
    // Nothing painted right now: only stay interested in refreshes while a
    // pane is still registered (it may become visible again). With zero
    // mounted surfaces there is nothing to ever paint — sleep until a
    // register/scroll/mutation explicitly wakes capture again.
    captureDirty = surfaces.length > 0;
    return;
  }
  if (!forced && hasTransientOpen() && snapshot !== null) {
    captureDirty = true; // frozen while a dropdown/tooltip is open
    return;
  }
  capturing = true;
  try {
    const dpr = glassPixelRatio(window.devicePixelRatio || 1);
    const snap = await capturePageSnapshot(dpr * CAPTURE_SCALE_FACTOR);
    snapshot = snap;
    snapshotGen++;
    captureFailures = 0;
    invalidateTierTextures();
    // Ambient read: one 12×12 resample of the page plus one per surface, here
    // at snapshot regeneration — never per frame. The resamples are synchronous
    // canvas readbacks, so they join the capture's own main-thread cost in the
    // budget sample.
    const ambientStart = performance.now();
    updateAmbient(snap);
    sampleFrameCost(snap.costMs + (performance.now() - ambientStart));
    requestFollow();
  } catch (e) {
    captureFailures++;
    if (captureFailures >= MAX_CAPTURE_FAILURES) {
      console.warn('[glass] disabling WebGL glass fallback after repeated snapshot failures');
      disableSession();
      return;
    }
    // Keep the previous snapshot for this frame — panels hold their look.
    console.warn('[glass] snapshot capture failed, reusing last frame:', e);
  } finally {
    capturing = false;
    if (captureDirty && captureTimer === null) {
      captureDirty = false;
      scheduleCapture(CAPTURE_DEBOUNCE_MS);
    }
  }
}

/**
 * One ambient read per surface, at snapshot cadence. A surface whose pane the
 * canvas actually paints takes the value through the shader uniform and has
 * its CSS channels cleared; every other surface (capped-out pane, pane without
 * a canvas yet) takes the CSS variables, which is the same adjustment on the
 * face tint. Never both, so no panel is tinted twice.
 */
function updateAmbient(snap: PageSnapshot): void {
  const pageLuma = samplePageLuminance(snap);
  for (const s of surfaces) {
    const box = s.lastRect ?? s.el.getBoundingClientRect();
    const rect = 'w' in box ? box : { x: box.x, y: box.y, w: box.width, h: box.height };
    const luma = sampleRegionLuminance(snap, rect);
    s.ambient = luma === null || pageLuma === null ? 0 : tintAdjustFromLuma(luma, pageLuma);
    // A pane the canvas actually paints carries the value in the shader
    // (uAmbient) and must not also carry the CSS copy; anything else reads the
    // CSS variables. clearSurfaceAmbient is a no-op when nothing was written.
    if (s.painted && s.canvas) clearSurfaceAmbient(s.el);
    else setSurfaceAmbient(s.el, s.ambient);
  }
}

/** Feed the frame-budget watchdog one measured cost. */
function sampleFrameCost(costMs: number): void {
  if (budgetDemoted || forcedOpaque) return;
  if (frameBudget.sample(costMs, performance.now())) demoteForBudget(frameBudget.averageMs);
}

// ---------------------------------------------------------------------------
// WebGL layer — exactly one context for the whole page
// ---------------------------------------------------------------------------

function ensureGl(): boolean {
  if (gl && program) return true;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
    failIfMajorPerformanceCaveat: false,
  });
  if (!context) {
    disableSession();
    return false;
  }
  gl = context;
  layerCanvas = canvas;
  const vs = compileShader(gl.VERTEX_SHADER, VERT_SRC);
  const fs = compileShader(gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) {
    disableSession();
    return false;
  }
  const prog = gl.createProgram();
  if (!prog) {
    disableSession();
    return false;
  }
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('[glass] shader link failed:', gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    disableSession();
    return false;
  }
  program = prog;
  aPosLoc = gl.getAttribLocation(prog, 'aPos');
  quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  return true;
}

function compileShader(type: number, source: string): WebGLShader | null {
  if (!gl) return null;
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('[glass] shader compile failed:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function resizeLayer(): void {
  if (!gl || !layerCanvas) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  let scale = glassPixelRatio(window.devicePixelRatio || 1);
  if (Math.max(w, h) * scale > MAX_LAYER_DIM) {
    scale = MAX_LAYER_DIM / Math.max(1, Math.max(w, h));
  }
  layerScale = scale;
  const pw = Math.max(1, Math.round(w * scale));
  const ph = Math.max(1, Math.round(h * scale));
  if (layerCanvas.width !== pw || layerCanvas.height !== ph) {
    layerCanvas.width = pw;
    layerCanvas.height = ph;
  }
}

function textureForTier(blurPx: number): WebGLTexture | null {
  if (!gl || !snapshot) return null;
  const rounded = Math.round(blurPx);
  const existing = tierTextures.get(rounded);
  if (existing && existing.gen === snapshotGen) return existing.texture;
  const source = makeBlurredVariant(snapshot.canvas, rounded, snapshot.scale);
  const texture = gl.createTexture();
  if (!texture) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  if (existing) gl.deleteTexture(existing.texture);
  tierTextures.set(rounded, { texture, gen: snapshotGen });
  return texture;
}

function invalidateTierTextures(): void {
  if (gl) for (const t of tierTextures.values()) gl.deleteTexture(t.texture);
  tierTextures = new Map();
}

function disposeGl(): void {
  invalidateTierTextures();
  if (gl) {
    if (program) gl.deleteProgram(program);
    if (quadBuffer) gl.deleteBuffer(quadBuffer);
    const lose = gl.getExtension('WEBGL_lose_context');
    lose?.loseContext();
  }
  gl = null;
  program = null;
  quadBuffer = null;
  aPosLoc = -1;
  layerCanvas = null;
  snapshot = null;
}

// ---------------------------------------------------------------------------
// Layout + paint passes
// ---------------------------------------------------------------------------

function requestFollow(): void {
  // While the engine is off there is no canvas to follow and no rAF loop —
  // advancing followUntil would be churn (e.g. unregisters during deactivate).
  if (!active) return;
  followUntil = Math.max(followUntil, performance.now() + FOLLOW_MS);
  requestRender();
}

function requestRender(): void {
  if (renderQueued || !active) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    if (active) layoutAndRender();
  });
}

function layoutAndRender(): void {
  let moving = false;
  let anyVisible = false;
  const gen = snapshot ? snapshotGen : -1;
  for (const s of surfaces) {
    const rect = s.el.getBoundingClientRect();
    if (!s.canvas && !s.demoted && rect.width >= 8 && rect.height >= 8) {
      // First time this pane is actually visible: spend a canvas slot now.
      attachCanvas(s);
      moving = true;
    }
    if (!s.canvas || !s.ctx) continue;
    const last = s.lastRect;
    const moved =
      !last ||
      Math.abs(last.x - rect.left) > 0.5 ||
      Math.abs(last.y - rect.top) > 0.5 ||
      Math.abs(last.w - rect.width) > 0.5 ||
      Math.abs(last.h - rect.height) > 0.5;
    // Slow path (computed-style sync, canvas rebox, reposition) only when the
    // pane moved, the params went stale, a fresh snapshot arrived, or the
    // pane is transient (menus fade/reveal without moving, so they keep the
    // per-frame sync). Static permanent panes cost one rect read per frame.
    if (moved || s.transient || s.genPainted !== gen || s.paramsEpochRead !== paramsEpoch) {
      const cs = getComputedStyle(s.el);
      const opacity = Number.parseFloat(cs.opacity);
      if (rect.width < 8 || rect.height < 8 || (Number.isFinite(opacity) && opacity < 0.02)) {
        continue; // hidden pane: nothing to follow, no rAF churn
      }
      anyVisible = true;
      syncParams(s);
      const pdpr = glassPixelRatio(window.devicePixelRatio || 1);
      const canvas = s.canvas;
      const origin = measureCanvasOrigin(canvas);
      const left = Math.round((rect.left - origin.x) * pdpr) / pdpr;
      const top = Math.round((rect.top - origin.y) * pdpr) / pdpr;
      canvas.style.borderRadius = cs.borderRadius;
      // Mirror clip-path so panels that reveal/hide via clipping (the TOC
      // card's rail→card morph) clip their slice canvas identically.
      canvas.style.clipPath = cs.clipPath === 'none' ? '' : cs.clipPath;
      if (cs.visibility === 'hidden') {
        continue;
      }
      if (cs.zIndex !== 'auto') canvas.style.zIndex = cs.zIndex;
      setCanvasBox(canvas, s.ctx, rect.width, rect.height, pdpr);
      canvas.style.left = `${left}px`;
      canvas.style.top = `${top}px`;
      if (moved) moving = true;
      // A transient pane mid-fade (opacity animating) must repaint so the
      // slice tracks the element; a settled one stops the loop as before.
      if (s.lastOpacity !== opacity) moving = true;
      s.lastOpacity = opacity;
    } else {
      anyVisible = true;
    }
    s.lastRect = { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
  }
  // Paint only when something actually changed: a pane moved, or a fresh
  // snapshot arrived. A static frame leaves every canvas untouched.
  if (anyVisible && snapshot && (moving || paintedGen !== gen)) {
    const paintStart = performance.now();
    paint();
    // Draw pass cost: rect sync + GL draws + the per-pane slice readbacks.
    sampleFrameCost(performance.now() - paintStart);
    paintedGen = gen;
    for (const s of surfaces) s.genPainted = gen;
  }
  if (moving || performance.now() < followUntil) {
    requestRender();
  }
}

/** The canvas's own coordinate origin for left/top offsets — measured
 *  empirically so any containing block (including backdrop-filter-created
 *  ones, as used by the dialog/sheet overlays) is handled correctly. */
function measureCanvasOrigin(canvas: HTMLCanvasElement): { x: number; y: number } {
  const prevL = canvas.style.left;
  const prevT = canvas.style.top;
  canvas.style.left = '0px';
  canvas.style.top = '0px';
  const rect = canvas.getBoundingClientRect();
  canvas.style.left = prevL;
  canvas.style.top = prevT;
  return { x: rect.left, y: rect.top };
}

function setCanvasBox(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  dpr: number,
): void {
  const w = Math.max(1, Math.round(cssW * dpr));
  const h = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    // Assigning width/height resets the backing store (and clears it) — no
    // explicit clearRect needed. Crucially there must be NO unconditional
    // clear here: transient panes take the slow path every follow frame, and
    // a clear without a same-frame repaint (dirty-gating skips static frames)
    // leaves the pane a transparent hole under its suppressed CSS blur.
    canvas.width = w;
    canvas.height = h;
  }
  canvas.style.width = `${Math.round(cssW * 100) / 100}px`;
  canvas.style.height = `${Math.round(cssH * 100) / 100}px`;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function paint(): void {
  if (!ensureGl() || !gl || !layerCanvas || !program || !snapshot) return;
  resizeLayer();
  const glRef = gl;
  glRef.useProgram(program);
  glRef.bindBuffer(glRef.ARRAY_BUFFER, quadBuffer);
  glRef.enableVertexAttribArray(aPosLoc);
  glRef.vertexAttribPointer(aPosLoc, 2, glRef.FLOAT, false, 0, 0);
  glRef.clearColor(0, 0, 0, 0);
  glRef.enable(glRef.SCISSOR_TEST);
  glRef.scissor(0, 0, layerCanvas.width, layerCanvas.height);
  glRef.clear(glRef.COLOR_BUFFER_BIT);

  const lh = layerCanvas.height;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const texScale = snapshot.scale;
  const drawn = new Set<Surface>();

  for (const s of surfaces) {
    if (!s.canvas || !s.ctx || !s.lastRect) continue;
    const rect = s.lastRect;
    const texture = textureForTier(s.params.blurPx);
    if (!texture) continue;
    // Per-axis rim zones, mirroring the SVG gradients: the x ramp spans the
    // outer fraction of the pane's width, the y ramp of its height (a single
    // min-dimension rim under-bends the long axis of oblong panes).
    const edgeX = Math.max(s.params.edgePx, rect.w * LENS_EDGE_FRACTION);
    const edgeY = Math.max(s.params.edgePx, rect.h * LENS_EDGE_FRACTION);
    const vwTex = Math.max(1, rect.w * texScale);
    const vhTex = Math.max(1, rect.h * texScale);
    const vx = Math.round(rect.x * layerScale);
    const vyTop = Math.round(rect.y * layerScale);
    const vw = Math.max(1, Math.round(rect.w * layerScale));
    const vh = Math.max(1, Math.round(rect.h * layerScale));
    const vyGl = lh - vyTop - vh;
    glRef.viewport(vx, vyGl, vw, vh);
    glRef.scissor(vx, vyGl, vw, vh);
    glRef.activeTexture(glRef.TEXTURE0);
    glRef.bindTexture(glRef.TEXTURE_2D, texture);
    setUniform2f(glRef, 'uSize', vwTex, vhTex);
    setUniform2f(glRef, 'uBaseTex', (rect.x + scrollX) * texScale, (rect.y + scrollY) * texScale);
    setUniform2f(glRef, 'uTexSize', snapshot.canvas.width, snapshot.canvas.height);
    setUniform1f(glRef, 'uRadius', s.params.radiusPx * texScale);
    setUniform2f(glRef, 'uEdge', edgeX * texScale, edgeY * texScale);
    setUniform2f(
      glRef,
      'uPull',
      Math.min(rect.w * LENS_PULL_FRACTION, 64) * texScale,
      Math.min(rect.h * LENS_PULL_FRACTION, 64) * texScale,
    );
    setUniform1f(glRef, 'uBright', s.params.bright);
    setUniform1f(glRef, 'uSat', s.params.sat);
    setUniform1f(glRef, 'uSpec', s.params.spec);
    setUniform1f(glRef, 'uAmbient', s.ambient);
    setUniform1f(glRef, 'uHasSpec', 1);
    glRef.drawArrays(glRef.TRIANGLE_STRIP, 0, 4);
    drawn.add(s);
  }
  glRef.disable(glRef.SCISSOR_TEST);

  // Slice each pane's rect out of the shared layer into its own 2D canvas.
  for (const s of surfaces) {
    if (!s.canvas || !s.ctx || !s.lastRect) continue;
    if (!drawn.has(s)) {
      // The GL draw for this pane was skipped (no texture — e.g. a lost GL
      // context): leave its canvas untouched and, above all, never mark a
      // never-drawn pane painted. Adopting the blank layer region would
      // attach .lg-gl-refracted, suppress the pane's own CSS blur, and show
      // the sharp page through the translucent face.
      continue;
    }
    const rect = s.lastRect;
    const vx = Math.round(rect.x * layerScale);
    const vy = Math.round(rect.y * layerScale);
    const vw = Math.max(1, Math.round(rect.w * layerScale));
    const vh = Math.max(1, Math.round(rect.h * layerScale));
    // Clamp the source rect to the layer — a panel partly outside the
    // viewport must not copy blank buffer regions over its canvas (and an
    // empty canvas must never suppress the panel's own CSS blur).
    const lx = Math.max(0, vx);
    const ly = Math.max(0, vy);
    const rx = Math.min(vx + vw, layerCanvas.width);
    const by = Math.min(vy + vh, layerCanvas.height);
    if (rx - lx < 1 || by - ly < 1) {
      s.ctx.clearRect(0, 0, s.canvas.width, s.canvas.height);
      s.painted = false;
      s.el.classList.remove('lg-gl-refracted');
      continue;
    }
    const dw = (s.canvas.width * (rx - lx)) / vw;
    const dh = (s.canvas.height * (by - ly)) / vh;
    const dx = (s.canvas.width * (lx - vx)) / vw;
    const dy = (s.canvas.height * (ly - vy)) / vh;
    const ctx = s.ctx;
    if (dx > 0 || dy > 0 || dw < s.canvas.width || dh < s.canvas.height) {
      // Partially clipped pane: the slice does not cover the whole canvas, so
      // the uncovered strip would keep stale pixels from before the move.
      ctx.clearRect(0, 0, s.canvas.width, s.canvas.height);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    try {
      ctx.drawImage(layerCanvas, lx, ly, rx - lx, by - ly, dx, dy, dw, dh);
      const probe = ctx.getImageData(
        Math.floor(s.canvas.width / 2),
        Math.floor(s.canvas.height / 2),
        1,
        1,
      ).data;
      lastSlices.push({
        cls: s.el.className.split(' ')[0],
        src: [lx, ly, rx - lx, by - ly],
        dst: [dx, dy, dw, dh],
        canvas: [s.canvas.width, s.canvas.height],
        centre: [probe[0]!, probe[1]!, probe[2]!, probe[3]!],
        inDom: s.canvas.isConnected,
        isSibling: s.canvas.nextElementSibling === s.el,
        elInDom: s.el.isConnected,
      });
      if (lastSlices.length > 24) lastSlices.shift();
    } catch {
      continue; // lost context → panels keep the plain blur (class never set)
    }
    if (!s.painted) {
      s.painted = true;
      s.el.classList.add('lg-gl-refracted');
      // This pane's ambient now travels in the shader uniform; drop the CSS
      // copy so it is not applied twice.
      clearSurfaceAmbient(s.el);
    }
  }
}

function setUniform1f(glRef: WebGLRenderingContext, name: string, v: number): void {
  if (!program) return;
  const loc = glRef.getUniformLocation(program, name);
  if (loc) glRef.uniform1f(loc, v);
}

function setUniform2f(glRef: WebGLRenderingContext, name: string, x: number, y: number): void {
  if (!program) return;
  const loc = glRef.getUniformLocation(program, name);
  if (loc) glRef.uniform2f(loc, x, y);
}

// ---------------------------------------------------------------------------
// Engine bootstrap (called by App.vue / BenchView.vue while mounted)
// ---------------------------------------------------------------------------

export function ensureGlassEngine(): () => void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return () => {};
  }
  refCount++;
  startWatchingDocument();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0) {
      setActive(false);
      stopWatchingDocument();
      surfaces = [];
    }
  };
}

/** Debug/test hook: number of pane canvases currently mounted. */
export function glassAttachedCount(): number {
  return countAttached();
}

/** Debug/test hook: capture/paint pipeline state for live audits. */
export function glassDebugState(): Record<string, unknown> {
  return {
    active,
    capturing,
    captureForced,
    captureDirty,
    captureFailures,
    snapshotGen,
    paintedGen,
    hasSnapshot: snapshot !== null,
    surfaces: surfaces.length,
    attached: countAttached(),
    regime: currentRegime,
    budgetDemoted,
    budgetAverageMs: Math.round(frameBudget.averageMs * 10) / 10,
    ambients: surfaces.map((s) => ({
      cls: s.el.className.split(' ')[0],
      ambient: Math.round(s.ambient * 1000) / 1000,
      spec: s.params.spec,
      painted: s.painted,
      paramsStale: s.paramsEpochRead !== paramsEpoch,
    })),
    lastSlices,
  };
}

// Live-audit bridge: the webbridge/CDP probes read the pipeline state from
// the page context, where the module closure is otherwise unreachable.
// `__glassBudgetSample` feeds the watchdog a cost, which is how the frame-budget
// demotion is exercised without waiting for a genuinely slow machine.
if (typeof window !== 'undefined') {
  (window as { __glassDebug?: typeof glassDebugState }).__glassDebug = glassDebugState;
  (window as { __glassLayerDump?: typeof layerDump }).__glassLayerDump = layerDump;
  (window as { __glassBudgetSample?: (ms: number) => void }).__glassBudgetSample = (ms: number) =>
    sampleFrameCost(ms);
}

/** Debug/test hook: RGBA sample of the shared GL layer canvas plus the
 *  per-pane draw bookkeeping, for diagnosing blank-slice reports. */
function layerDump(): Record<string, unknown> {
  if (!layerCanvas) return { layer: null };
  const ctx2 = document.createElement('canvas').getContext('2d');
  let centre: (number | null)[] | null = null;
  const regionStats = (x: number, y: number, w: number, h: number): number | null => {
    if (!ctx2) return null;
    const d = ctx2.getImageData(x, y, w, h).data;
    let op = 0;
    const n = Math.max(1, Math.floor(d.length / 4 / 37));
    for (let i = 0; i < d.length; i += 4 * 37) if (d[i + 3]! > 150) op++;
    return Math.round((op / n) * 100) / 100;
  };
  let perPane: unknown = null;
  if (ctx2) {
    ctx2.canvas.width = layerCanvas.width;
    ctx2.canvas.height = layerCanvas.height;
    ctx2.drawImage(layerCanvas, 0, 0);
    centre = [layerCanvas.width, layerCanvas.height, regionStats(0, 0, layerCanvas.width, layerCanvas.height)];
    perPane = surfaces.map((s) => {
      if (!s.lastRect) return null;
      const x = Math.max(0, Math.round(s.lastRect.x * layerScale));
      const y = Math.max(0, Math.round(s.lastRect.y * layerScale));
      const w = Math.min(layerCanvas!.width - x, Math.round(s.lastRect.w * layerScale));
      const h = Math.min(layerCanvas!.height - y, Math.round(s.lastRect.h * layerScale));
      return { cls: s.el.className.split(' ')[0], layerOpaque: w > 0 && h > 0 ? regionStats(x, y, w, h) : null };
    });
  }
  return {
    layer: centre,
    layerScale,
    layerPanes: perPane,
    panes: surfaces.map((s) => ({
      cls: s.el.className.split(' ')[0],
      rect: s.lastRect,
      painted: s.painted,
      genPainted: s.genPainted,
      demoted: s.demoted,
      hasCanvas: s.canvas !== null,
    })),
  };
}
