<!-- apps/kimi-web/src/components/chat/ConversationToc.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ChatTurn } from '../../types';

export interface ConversationTocItem {
  id: string;
  role: ChatTurn['role'];
  no: number;
  title: string;
}

const props = defineProps<{
  items: ConversationTocItem[];
  /** Query currently owning the viewport middle. */
  activeTurnId: string | null;
  mobile?: boolean;
  sessionLoading?: boolean;
  /** Temporarily hidden while a wide table actually covers the rail. Kept out
      of `visible` on purpose: the nav must stay mounted so the occlusion can
      be measured and lifted again. Never touches the user's TOC setting. */
  occluded?: boolean;
}>();

const emit = defineEmits<{
  select: [turnId: string];
}>();

const { t } = useI18n();

// The outline is only useful once there is something to navigate, and it never
// shows on mobile or while the session is still loading.
const visible = computed(
  () => !props.mobile && !props.sessionLoading && props.items.length > 1,
);
</script>

<template>
  <!-- Conversation outline: a vertical list of short bars (one per user query),
       anchored to the right edge of the reading column. Hovering expands the
       labels LEFTWARD over the conversation as a floating panel (glass material
       when liquid glass is on, solid raised surface otherwise — same look as
       the dropdown menus), so the rail never needs empty room beside the
       column and is never hidden just because the pane is narrow. -->
  <nav
    v-if="visible"
    class="conversation-toc"
    :class="{ 'toc-clipped': occluded }"
    :aria-label="t('conversation.toc')"
    :aria-hidden="occluded || undefined"
  >
    <div class="toc-scroll">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="toc-row"
        :class="{ active: activeTurnId === item.id }"
        @click="emit('select', item.id)"
      >
        <span class="toc-bar" />
        <span class="toc-label">{{ item.title }}</span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.conversation-toc {
  position: absolute;
  z-index: var(--z-sticky);
  top: 50%;
  transform: translateY(-50%);
  /* Anchor the rail's RIGHT edge beside the reading column's right edge
     (14px gap + 3px bar), so the collapsed bar sits at a fixed x and hover
     expansion grows the panel leftward over the conversation. The previous
     left-anchored rail needed ~240px of free room to the column's right and
     hid itself (toc-clipped) whenever the pane was narrower — hiding the
     sidebar was the only way to get it back. Track --read-max (1100px in
     wide-screen mode) so the rail hugs the widened column; the cqi cap keeps
     it inside narrow containers. Tables that reach the bar still hide the
     rail via the occlusion hit-test in ConversationPane. */
  --toc-content-max: min(
    var(--read-max, var(--p-content-max)),
    calc(100cqi - var(--space-5) - var(--space-5))
  );
  right: calc(50% - (var(--toc-content-max) / 2) - 17px);
  display: flex;
  flex-direction: column;
  justify-content: center;
  opacity: 0.5;
  transition: opacity var(--duration-base) var(--ease-out);
}
/* Invisible hover bridge: the collapsed rail is only a few px wide, so this
   extends the hover target on both sides to make the outline easy to open and
   forgiving to stay within. Kept at z-index 0 so it sits behind the rows
   (which are raised to z-index 1) — otherwise the bridge, as a positioned
   pseudo-element, paints above the in-flow rows and swallows their clicks. */
.conversation-toc::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: -14px;
  right: -48px;
  z-index: 0;
}
/* Expanded panel: painted by a ::after behind the rows so the collapsed rail
   carries no padding/border (the bar's x never shifts, and the collapsed nav
   intercepts no clicks over the messages). Fades in on hover/focus.
   Borderless: no outline, radius or rim — the tint and the backdrop blur
   feather out at every edge via a two-axis mask, the same trick the top
   bar's blur band uses for its bottom fade. */
.conversation-toc::after {
  content: "";
  position: absolute;
  inset: -8px -12px;
  z-index: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--duration-base) var(--ease-out);
  -webkit-mask-image:
    linear-gradient(to right, transparent 0, black 16px, black calc(100% - 16px), transparent 100%),
    linear-gradient(to bottom, transparent 0, black 14px, black calc(100% - 14px), transparent 100%);
  -webkit-mask-composite: source-in;
  mask-image:
    linear-gradient(to right, transparent 0, black 16px, black calc(100% - 16px), transparent 100%),
    linear-gradient(to bottom, transparent 0, black 14px, black calc(100% - 14px), transparent 100%);
  mask-composite: intersect;
}
.conversation-toc:hover,
.conversation-toc:focus-within { opacity: 1; }
/* Solid fallback surface (liquid glass off) — the dropdowns' raised-surface
   tint, edge-feathered by the mask. */
.conversation-toc:hover::after,
.conversation-toc:focus-within::after {
  opacity: 1;
  background: var(--color-surface-raised);
}
/* Liquid glass on: same material as the .lg-glass dropdowns — translucent
   surface tint (50% dark / 45% light) over an 8px (dark) / 20px (light)
   backdrop blur and a specular top-right bloom. No border/rim: the mask
   feather is the edge. */
html[data-liquid-glass="on"] .conversation-toc:hover::after,
html[data-liquid-glass="on"] .conversation-toc:focus-within::after {
  background:
    radial-gradient(
      140% 90% at 88% -20%,
      color-mix(in srgb, #fff 10%, transparent),
      transparent 55%
    ),
    linear-gradient(
      to bottom,
      color-mix(in srgb, color-mix(in srgb, var(--color-surface-raised) 95%, white) 50%, transparent) 0%,
      color-mix(in srgb, var(--color-surface-raised) 50%, transparent) 30%
    ),
    color-mix(in srgb, var(--color-surface-raised) 50%, transparent);
  -webkit-backdrop-filter: blur(8px) saturate(170%) brightness(1.04);
  backdrop-filter: blur(8px) saturate(170%) brightness(1.04);
}
html:not([data-color-scheme="dark"])[data-liquid-glass="on"] .conversation-toc:hover::after,
html:not([data-color-scheme="dark"])[data-liquid-glass="on"] .conversation-toc:focus-within::after {
  background:
    radial-gradient(
      140% 90% at 88% -20%,
      color-mix(in srgb, #fff 10%, transparent),
      transparent 55%
    ),
    linear-gradient(
      to bottom,
      color-mix(in srgb, color-mix(in srgb, var(--color-surface-raised) 95%, white) 45%, transparent) 0%,
      color-mix(in srgb, var(--color-surface-raised) 45%, transparent) 30%
    ),
    color-mix(in srgb, var(--color-surface-raised) 45%, transparent);
  -webkit-backdrop-filter: blur(20px) saturate(170%) brightness(1.04);
  backdrop-filter: blur(20px) saturate(170%) brightness(1.04);
}

.toc-scroll {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 8px 0;
  max-height: calc(100vh - 200px);
  overflow-y: auto;
  scrollbar-width: none;
}
.toc-scroll::-webkit-scrollbar { display: none; }

.toc-row {
  display: flex;
  /* Label left of the bar, so hover expansion grows leftward over the
     conversation while the bar (the rail the occlusion hit-test measures)
     stays at a fixed x. */
  flex-direction: row-reverse;
  align-items: center;
  gap: 10px;
  height: 18px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
}
.toc-row:focus-visible { outline: none; box-shadow: var(--p-focus-ring); }

.toc-bar {
  flex: none;
  width: 3px;
  height: 14px;
  border-radius: var(--radius-full);
  background: var(--color-accent);
  opacity: 0.3;
  transition:
    opacity var(--duration-fast) var(--ease-out),
    height var(--duration-fast) var(--ease-out);
}
.toc-label {
  display: block;
  max-width: 0;
  overflow: hidden;
  opacity: 0;
  text-overflow: ellipsis;
  transition:
    max-width 220ms var(--ease-out),
    opacity var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
}

/* Hover / focus: enlarge bars and reveal labels to the left. */
.conversation-toc:hover .toc-bar,
.conversation-toc:focus-within .toc-bar { height: 18px; opacity: 0.5; }
.conversation-toc:hover .toc-label,
.conversation-toc:focus-within .toc-label { max-width: 220px; opacity: 1; }

.toc-row.active .toc-bar { opacity: 1; height: 18px; }
.toc-row.active .toc-label { color: var(--color-accent); font-weight: var(--weight-medium); }
.toc-row:hover .toc-bar { opacity: 1; }
.toc-row:hover .toc-label { color: var(--color-text); }

/* Only the table-occlusion case hides the rail now: kept mounted (so its
   position can keep being measured) but hidden from view and from
   pointer/screen-reader interaction. */
.conversation-toc.toc-clipped {
  visibility: hidden;
  pointer-events: none;
}
</style>
