// apps/kimi-web/src/composables/useGlassRefraction.ts
// Opt-in hook for the WebGL liquid-glass refraction fallback (Firefox/Safari).
// A floating glass panel passes its template ref; while the WebGL engine is
// active the shared renderer (src/lib/glass/gl-renderer.ts) mounts a canvas
// slice directly beneath the panel that paints the rim refraction / chromatic
// fringe / specular glint the engine cannot get from
// `backdrop-filter: url(#lg-refract)`. On Chromium (where CSS handles it),
// with the glass toggle off, or after a snapshot-failure session-disable,
// registering is inert and the panel keeps its plain CSS blur.
//
// Options:
// - `when`: keep the surface out of the engine while false (e.g. the mobile
//   sheet layouts of the slash/mention menus, which have no glass panel).
// - `transient` (default true): menus/tooltips — the page snapshot freezes
//   while any transient surface is open. Dialogs/sheets/toasts pass false so
//   their backdrop keeps refreshing.

import { computed, onScopeDispose, ref, watch, type Ref } from 'vue';
import {
  isGlassWebglActive,
  registerGlassSurface,
  subscribeGlassActive,
  unregisterGlassSurface,
} from '../lib/glass/gl-renderer';

const engineActive = ref(isGlassWebglActive());
subscribeGlassActive((on) => {
  engineActive.value = on;
});

/** True while the WebGL glass fallback is the active refraction engine. */
export function useGlassWebglActive(): Ref<boolean> {
  return engineActive;
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
  onScopeDispose(() => {
    stop();
    if (current) {
      unregisterGlassSurface(current);
      current = null;
    }
  });
}
