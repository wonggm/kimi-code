// apps/kimi-web/src/composables/useGlassRefraction.ts
// Opt-in hook for the two-regime ambient material.
//
// A floating glass panel passes its template ref and gets two things:
//
// 1. The WebGL refraction fallback (Firefox/Safari). While the WebGL renderer
//    (src/lib/glass/gl-renderer.ts) is active it mounts a canvas slice directly
//    beneath the panel that paints the rim refraction / specular glint the
//    engine cannot get from `backdrop-filter: url(#lg-refract)`. On Chromium
//    (where CSS handles it), with the glass toggle off, or after a
//    snapshot-failure session-disable, registering is inert and the panel keeps
//    its plain CSS blur.
//
// 2. The render-time ambient tint (direction C). Each registered surface gets
//    `--lg-amb-deepen` / `--lg-amb-lift` written on it — the style.css face
//    recipe mixes the theme surface by that amount, so a panel over a dark code
//    block deepens and one over bright prose lifts. While the WebGL engine runs,
//    the renderer owns that write (it has the page snapshot to measure, and it
//    moves the value into a shader uniform for panes the canvas paints). With
//    the engine off — Chromium, where CSS renders the refraction — this hook
//    runs the rasterization-free DOM probe instead: nine points inside the
//    panel and nine across the page (first opaque background at each), on a
//    slow shared, event-driven cadence — never per frame. A panel is compared
//    against the page, not against a constant, so an ordinary backdrop leaves
//    the tint alone. Nothing is written while the app is in the designed opaque
//    regime, whose face is theme-tinted by contract.
//
// Options:
// - `when`: keep the surface out of the engine while false (e.g. the mobile
//   sheet layouts of the slash/mention menus, which have no glass panel).
// - `transient` (default true): menus/tooltips — the page snapshot freezes
//   while any transient surface is open; dialog/sheet/toast pass false so their
//   backdrop keeps refreshing.

import { computed, onScopeDispose, ref, watch, type Ref } from 'vue';
import {
  ProbeWatchdog,
  clearSurfaceAmbient,
  probePageLuminance,
  probeSurfaceLuminance,
  setSurfaceAmbient,
  tintAdjustFromLuma,
} from '../lib/glass/ambient';
import {
  glassRegime,
  isGlassWebglActive,
  registerGlassSurface,
  subscribeGlassActive,
  subscribeGlassRegime,
  unregisterGlassSurface,
} from '../lib/glass/gl-renderer';

const engineActive = ref(isGlassWebglActive());
subscribeGlassActive((on) => {
  engineActive.value = on;
});
const regime = ref(glassRegime());
subscribeGlassRegime((next) => {
  regime.value = next;
});

/** True while the WebGL glass fallback is the active refraction engine. */
export function useGlassWebglActive(): Ref<boolean> {
  return engineActive;
}

/**
 * Which ambient regime the app is painting in (refractive | opaque).
 *
 * Intentionally exported with no in-repo call sites: the regime is a property of
 * the material rather than of any current component, and the surfaces that would
 * read it (a settings row explaining why glass went flat, the design-system
 * view) live outside this module. Kept as public surface on purpose rather than
 * deleted as unused.
 */
export function useGlassRegime(): Ref<'refractive' | 'opaque'> {
  return regime;
}

export interface GlassRefractionOptions {
  when?: Ref<boolean>;
  transient?: boolean;
}

export function useGlassRefraction(
  panel: Ref<HTMLElement | undefined | null>,
  options: GlassRefractionOptions = {},
): void {
  const enabled = computed(
    () => panel.value != null && (options.when ? options.when.value : true),
  );
  let current: HTMLElement | null = null;

  const sync = (): void => {
    const next = engineActive.value && enabled.value ? (panel.value ?? null) : null;
    if (next === current) return;
    if (current) unregisterGlassSurface(current);
    current = next;
    if (current) registerGlassSurface(current, { transient: options.transient });
  };

  const stop = watch([engineActive, enabled], sync, { flush: 'post' });
  sync();
  // Ambient probe registration is independent of the WebGL engine: it covers
  // exactly the surfaces the engine is NOT refracting.
  const stopRegime = watch(
    [regime, engineActive, enabled, panel],
    () => probeSync(),
    { flush: 'post' },
  );
  probeSync();

  function probeSync(): void {
    const el = enabled.value ? (panel.value ?? null) : null;
    const wantsProbe = el !== null && !engineActive.value && regime.value === 'refractive';
    if (wantsProbe) startProbe(el!);
    else stopProbeFor(el ?? panel.value ?? undefined);
  }

  onScopeDispose(() => {
    stop();
    stopRegime();
    stopProbeFor(panel.value ?? undefined);
    if (current) {
      unregisterGlassSurface(current);
      current = null;
    }
  });
}

// ---------------------------------------------------------------------------
// Shared probe scheduler
//
// One scheduler for the whole page, not one per panel, and event-driven with a
// trailing debounce (the same cadence the WebGL capture path uses): a panel
// measures once when it opens, then again after the backdrop settles following
// scroll / resize / DOM churn. Nothing runs while the app is idle. Each pass
// samples the page reference ONCE and compares every panel against it, so the
// cost of a screen with six glass surfaces is one page sample plus six rects.
// ---------------------------------------------------------------------------

const probes = new Set<HTMLElement>();
let probeDebounce: ReturnType<typeof setTimeout> | null = null;
let probeListeners = 0;
let bodyObserver: MutationObserver | null = null;
// The probe's own frame budget, so the non-WebGL path is covered too. A pass
// measures ~1.8ms mean / 2.6ms p95 on the real app shell in headless Chromium
// (~2.3ms mean, 4.9ms p95, 10.2ms worst single pass with a 400-row deep element
// stack over the sampled region) — see PROBE_BUDGET_OPTIONS in
// lib/glass/ambient.ts for the thresholds and why they sit where they do. The
// MutationObserver schedule means a streaming transcript keeps the probe firing
// at its minimum cadence, so on a page deep enough to make every pass expensive
// the read has to be able to stop itself.
//
// Scope is deliberately narrow: demotion stops the ambient read and clears the
// variables already written, so every surface settles back onto its base theme
// tint. Blur, refraction, GL panes and the regime attribute are untouched — this
// is not the opaque regime, just the render-time tint giving up.
const probeWatchdog = new ProbeWatchdog();
let probeDemoted = false;

/** Trailing debounce, then a minimum gap, so a scroll storm cannot pin the probe.
 *  A pass costs (1 + surfaces) nine-point hit tests, so both the gap and a hard
 *  cap on how many surfaces one pass measures keep the worst case bounded: more
 *  surfaces than the cap simply keep their last tint until they come round. */
const PROBE_DEBOUNCE_MS = 300;
const PROBE_MIN_GAP_MS = 600;
const PROBE_MAX_SURFACES = 8;
let lastProbeAt = 0;
let probeCursor = 0;

function startProbe(el: HTMLElement): void {
  if (probeDemoted || probes.has(el)) return;
  probes.add(el);
  installProbeListeners();
  // The first read lands on the next frame so the panel has its settled rect (a
  // just-mounted dialog measures at 0×0 during setup); the debounced passes then
  // keep it fresh as the backdrop changes.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      if (probes.has(el)) runProbePass();
    });
  } else {
    runProbePass();
  }
}

function stopProbeFor(el: HTMLElement | undefined): void {
  if (!el || !probes.delete(el)) return;
  clearSurfaceAmbient(el);
  if (probes.size === 0) removeProbeListeners();
}

function installProbeListeners(): void {
  if (probeListeners > 0 || typeof window === 'undefined') return;
  probeListeners = 1;
  window.addEventListener('scroll', scheduleProbePass, { passive: true, capture: true });
  window.addEventListener('resize', scheduleProbePass);
  if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
    bodyObserver = new MutationObserver(scheduleProbePass);
    bodyObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
}

function removeProbeListeners(): void {
  if (probeListeners === 0) return;
  probeListeners = 0;
  window.removeEventListener('scroll', scheduleProbePass, { capture: true });
  window.removeEventListener('resize', scheduleProbePass);
  bodyObserver?.disconnect();
  bodyObserver = null;
  if (probeDebounce !== null) {
    clearTimeout(probeDebounce);
    probeDebounce = null;
  }
}

function scheduleProbePass(): void {
  if (probeDemoted || probeDebounce !== null || probes.size === 0) return;
  probeDebounce = setTimeout(() => {
    probeDebounce = null;
    if (typeof document !== 'undefined' && document.hidden) return;
    if (Date.now() - lastProbeAt < PROBE_MIN_GAP_MS) return;
    runProbePass();
  }, PROBE_DEBOUNCE_MS);
}

function runProbePass(): void {
  if (probes.size === 0) return;
  lastProbeAt = Date.now();
  const passStart = performance.now();
  const reference = probePageLuminance();
  const list = Array.from(probes);
  const start = probeCursor % Math.max(1, list.length);
  const count = Math.min(list.length, PROBE_MAX_SURFACES);
  probeCursor += count;
  for (let i = 0; i < count; i++) {
    const el = list[(start + i) % list.length]!;
    const luma = probeSurfaceLuminance(el);
    const adjust =
      luma === null || reference === null ? 0 : tintAdjustFromLuma(luma, reference);
    setSurfaceAmbient(el, adjust);
  }
  // A probe pass is entirely synchronous main-thread work (hit tests plus a few
  // computed styles), so unlike the GL capture there is no off-thread decode to
  // subtract: the wall duration IS the frame cost.
  if (probeWatchdog.sample(performance.now() - passStart, performance.now())) demoteProbe();
}

/** Stop the ambient read for this session: drop the listeners and any pending
 *  pass, and clear what was already written. One-way, like the GL watchdog. */
function demoteProbe(): void {
  if (probeDemoted) return;
  probeDemoted = true;
  console.warn(
    `[glass] ambient probe over budget (${probeWatchdog.averageMs.toFixed(1)}ms mean pass) — ` +
      'stopping the render-time tint for this session',
  );
  removeProbeListeners();
  for (const el of Array.from(probes)) clearSurfaceAmbient(el);
}

/** Live-audit hook: probe scheduling state and the watchdog's rolling cost. */
export function glassProbeState(): {
  demoted: boolean;
  surfaces: number;
  passes: number;
  averageMs: number;
} {
  return {
    demoted: probeDemoted,
    surfaces: probes.size,
    passes: probeWatchdog.passCount,
    averageMs: Math.round(probeWatchdog.averageMs * 100) / 100,
  };
}

// Same live-audit bridge pattern as gl-renderer: the CDP/webbridge probes read
// this from the page, where the module closure is otherwise unreachable.
if (typeof window !== 'undefined') {
  (window as { __glassProbe?: typeof glassProbeState }).__glassProbe = glassProbeState;
}
