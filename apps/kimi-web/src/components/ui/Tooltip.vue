<!-- apps/kimi-web/src/components/ui/Tooltip.vue -->
<!-- Design-system §03 Tooltip: hover/focus hint. Wrap the trigger in the default
     slot; text via prop. The wrapper is `display: contents` so it never alters the
     trigger's layout (safe for truncated/flex triggers); listeners are attached to
     the real trigger element, which also anchors the bubble, and re-attached if that
     element is removed or replaced (so an open tooltip can never strand on screen).
     The bubble is rendered through a body teleport so it escapes ancestor overflow
     clipping, and positioned with flip + viewport clamping. Short text stays on one
     line; long text wraps within `maxWidth` and is clamped to `maxLines` lines with
     an ellipsis so the bubble never grows too tall. -->
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { isAnyMenuOpen, menuOpenCount } from '../../composables/useMenuOpen';
import { useGlassRefraction } from '../../composables/useGlassRefraction';

type Placement = 'top' | 'bottom' | 'left' | 'right';

const props = withDefaults(
  defineProps<{
    text?: string | null;
    placement?: Placement;
    maxWidth?: number;
    /** Clamp the bubble to at most this many lines (with an ellipsis). */
    maxLines?: number;
  }>(),
  {
    placement: 'top',
    maxWidth: 280,
    maxLines: 6,
  },
);

const GAP = 6;
const MARGIN = 8;
// Upstream's own delay (its tooltip bubble waits 150ms before appearing).
const SHOW_DELAY = 150;

const trigger = ref<HTMLElement>();
const bubble = ref<HTMLElement>();
const open = ref(false);
const mounted = ref(false);

// WebGL rim-refraction fallback for Firefox/Safari (inert on Chromium). The
// bubble only participates while actually shown (v-show="open").
useGlassRefraction(bubble, { when: open });
const positioned = ref(false);
const bubbleStyle = ref<Record<string, string>>({ maxWidth: `${props.maxWidth}px` });

let showTimer: ReturnType<typeof setTimeout> | undefined;
let target: HTMLElement | null = null;
let observer: MutationObserver | undefined;

function position(): void {
  const bub = bubble.value;
  if (!target || !bub) return;
  const r = target.getBoundingClientRect();
  const bw = bub.offsetWidth;
  const bh = bub.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let place = props.placement;
  if (place === 'top' && r.top - GAP - bh < MARGIN) place = 'bottom';
  else if (place === 'bottom' && r.bottom + GAP + bh > vh - MARGIN) place = 'top';
  else if (place === 'left' && r.left - GAP - bw < MARGIN) place = 'right';
  else if (place === 'right' && r.right + GAP + bw > vw - MARGIN) place = 'left';

  let top = 0;
  let left = 0;
  if (place === 'top') {
    top = r.top - GAP - bh;
    left = r.left + r.width / 2 - bw / 2;
  } else if (place === 'bottom') {
    top = r.bottom + GAP;
    left = r.left + r.width / 2 - bw / 2;
  } else if (place === 'left') {
    top = r.top + r.height / 2 - bh / 2;
    left = r.left - GAP - bw;
  } else {
    top = r.top + r.height / 2 - bh / 2;
    left = r.right + GAP;
  }

  left = Math.min(Math.max(left, MARGIN), vw - MARGIN - bw);
  top = Math.min(Math.max(top, MARGIN), vh - MARGIN - bh);

  bubbleStyle.value = {
    maxWidth: `${props.maxWidth}px`,
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
  };
}

function show(): void {
  if (!props.text) return;
  // While any menu is open, suppress hover bubbles whose trigger is outside it
  // (upstream behaviour); the composer's own controls read as one surface then.
  if (isAnyMenuOpen()) return;
  window.clearTimeout(showTimer);
  showTimer = window.setTimeout(() => {
    mounted.value = true;
    open.value = true;
    positioned.value = false;
    void nextTick(() => {
      position();
      positioned.value = true;
    });
  }, SHOW_DELAY);
}

function hide(): void {
  window.clearTimeout(showTimer);
  open.value = false;
  mounted.value = false;
  positioned.value = false;
}

function onScrollOrResize(): void {
  if (open.value) hide();
}

function setTarget(el: HTMLElement | null): void {
  if (el === target) return;
  if (target) {
    target.removeEventListener('mouseenter', show);
    target.removeEventListener('mouseleave', hide);
    target.removeEventListener('focusin', show);
    target.removeEventListener('focusout', hide);
  }
  target = el;
  if (target) {
    target.addEventListener('mouseenter', show);
    target.addEventListener('mouseleave', hide);
    target.addEventListener('focusin', show);
    target.addEventListener('focusout', hide);
  }
}

onMounted(() => {
  // A menu opening while a bubble is showing hides it immediately (the menu
  // panel sits above the bubble layer); the next hover decides afresh.
  watch(menuOpenCount, () => {
    if (isAnyMenuOpen()) hide();
  });
  const root = trigger.value ?? null;
  setTarget((root?.firstElementChild as HTMLElement | null) ?? root);
  // Keep `target` in sync with the live slotted element: if it's removed or
  // replaced while the tooltip is open (e.g. a v-if toggles on hover), the
  // mouseleave we rely on never fires and the bubble would get stuck on screen.
  if (root) {
    observer = new MutationObserver(() => {
      const next = (root.firstElementChild as HTMLElement | null) ?? null;
      if (next !== target) {
        hide();
        setTarget(next ?? root);
      }
    });
    observer.observe(root, { childList: true });
  }
  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);
});

onBeforeUnmount(() => {
  window.clearTimeout(showTimer);
  observer?.disconnect();
  setTarget(null);
  window.removeEventListener('scroll', onScrollOrResize, true);
  window.removeEventListener('resize', onScrollOrResize);
});
</script>

<template>
  <span ref="trigger" class="ui-tip">
    <slot />
  </span>
  <Teleport to="body">
    <div
      v-if="mounted"
      ref="bubble"
      v-show="open"
      class="ui-tip__bubble lg-glass lg-lens"
      :class="{ positioned }"
      :style="[bubbleStyle, { '--tip-lines': maxLines }]"
      role="tooltip"
    >
      {{ text }}
    </div>
  </Teleport>
</template>

<style scoped>
.ui-tip { display: contents; }
.ui-tip__bubble {
  position: fixed;
  z-index: var(--z-tooltip);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: var(--tip-lines);
  max-width: 280px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  background: var(--color-text);
  color: var(--color-bg);
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  line-height: 1.35;
  overflow: hidden;
  overflow-wrap: anywhere;
  pointer-events: none;
  opacity: 0;
  /* Upstream's fade: 120ms out-curve, no overshoot (opacity clamps). */
  transition: opacity var(--duration-fast) var(--ease-out);
}
.ui-tip__bubble.positioned { opacity: 1; }
/* Glass fallback background is light/translucent — restore dark-on-light text
   in dark theme (frost bg + light text reads correctly). In light theme the
   bubble stays on the original inverted dark fill + light text; the dark-frost
   bg scoped to dark theme only preserves that look without a per-theme rewrite
   of the base rule. */
html[data-liquid-glass="on"] .ui-tip__bubble.lg-glass { color: var(--color-text); }
/* "Light theme" here means light, not merely "not explicitly dark": a
   system-scheme user on a dark OS must get the dark treatment, so the system
   case is spelled out under a light-OS media query (same keying as the
   `--lg-*` light re-tune in style.css). */
html[data-color-scheme="light"][data-liquid-glass="on"] .ui-tip__bubble.lg-glass {
  background: var(--color-text);
  color: var(--color-bg);
}
@media (prefers-color-scheme: light) {
  html[data-color-scheme="system"][data-liquid-glass="on"] .ui-tip__bubble.lg-glass {
    background: var(--color-text);
    color: var(--color-bg);
  }
}
</style>
