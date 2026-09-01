<!-- apps/kimi-web/src/components/chat/ConversationToc.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ChatTurn } from '../../types';
import { useGlassRefraction } from '../../composables/useGlassRefraction';

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

const cardEl = ref<HTMLElement | null>(null);
// WebGL rim-refraction fallback (Firefox/Safari): the card only refracts
// while actually revealed — expansion itself is pure CSS clip-path (the
// renderer mirrors clip-path onto the slice canvas each layout pass).
const revealed = ref(false);
useGlassRefraction(cardEl, { when: computed(() => visible.value && revealed.value) });
</script>

<template>
  <!-- Conversation outline. Collapsed: a slim rail of accent ticks anchored to
       the right edge of the reading column. Hover/focus: an exchange card
       morphs out of the rail (clip-path grows a bar-sized sliver into the full
       rounded card) and lists every query with wrapped, two-line titles; the
       card scrolls internally, so long histories never stretch it. The rail is
       decorative — the card's entries are the sole interactive list, so the
       outline appears in the accessibility tree exactly once. -->
  <nav
    v-if="visible"
    class="conversation-toc"
    :class="{ 'toc-clipped': occluded }"
    :aria-label="t('conversation.toc')"
    :aria-hidden="occluded || undefined"
    @mouseenter="revealed = true"
    @mouseleave="revealed = false"
    @focusin="revealed = true"
    @focusout="revealed = false"
  >
    <div class="toc-rail" aria-hidden="true">
      <span
        v-for="item in items"
        :key="item.id"
        class="toc-bar"
        :class="{ active: activeTurnId === item.id }"
      />
    </div>
    <div ref="cardEl" class="toc-card lg-glass lg-lens">
      <div class="toc-card-scroll">
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          class="toc-entry"
          :class="{ active: activeTurnId === item.id }"
          @click="emit('select', item.id)"
        >
          <span class="toc-entry-title">{{ item.title }}</span>
          <span class="toc-entry-bar" />
        </button>
      </div>
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
     expansion grows the card leftward over the conversation. The previous
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
}
/* Invisible hover bridge: the collapsed rail is only a few px wide, so this
   extends the hover target on both sides to make the outline easy to open and
   forgiving to stay within. */
.conversation-toc::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: -14px;
  right: -48px;
  z-index: 0;
}

/* Collapsed rail: one short accent bar per query. Decorative only (the card
   owns interaction); .toc-bar keeps a stable x so the table-occlusion
   hit-test in ConversationPane can measure it whether or not the card is
   open. */
.toc-rail {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 8px 0;
  max-height: calc(100vh - 200px);
  overflow: hidden;
  opacity: 0.5;
  transition: opacity var(--duration-base) var(--ease-out);
}
.conversation-toc:hover .toc-rail,
.conversation-toc:focus-within .toc-rail { opacity: 0; }

.toc-bar {
  flex: none;
  width: 3px;
  height: 14px;
  border-radius: var(--radius-full);
  background: var(--color-accent);
  opacity: 0.3;
}
.toc-bar.active { opacity: 1; height: 18px; }

/* Exchange card: hidden as a bar-sized sliver at the rail's x (clip-path
   inset leaves a 9px-wide, 48px-tall strip at the right edge), then grows
   leftward and vertically into the full card on hover/focus — the vertical
   bar becomes the card. pointer-events stay off while hidden so the sliver
   never swallows clicks meant for the messages beneath. */
.toc-card {
  position: absolute;
  z-index: 2;
  top: 50%;
  right: 0;
  width: 248px;
  transform: translateY(-50%);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-lg);
  background: var(--color-surface-raised);
  box-shadow: var(--shadow-md);
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
  clip-path: inset(calc(50% - 24px) calc(100% - 9px) calc(50% - 24px) 0 round 12px);
  transition:
    clip-path var(--duration-slow) var(--ease-out),
    opacity var(--duration-base) var(--ease-out);
}
.conversation-toc:hover .toc-card,
.conversation-toc:focus-within .toc-card {
  opacity: 1;
  pointer-events: auto;
  clip-path: inset(0 0 0 0 round var(--radius-lg));
}

/* Liquid glass on: the card carries .lg-glass, so the shared consuming rule
   in style.css paints the material (translucent surface tint, bloom, rim,
   8px dark / 20px light blur) — the hand-written duplicate and its
   per-theme retune are gone; the solid .toc-card background above remains
   as the glass-off fallback. */

.toc-card-scroll {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  max-height: min(70vh, 460px);
  overflow-y: auto;
}

.toc-entry {
  /* Accent bar at the row's right edge — the card-facing continuation of the
     rail's bars, keeping the right-aligned reading of the collapsed state. */
  display: flex;
  flex-direction: row-reverse;
  align-items: stretch;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-muted);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
}
.toc-entry:hover { background: var(--color-surface-sunken); color: var(--color-text); }
.toc-entry:focus-visible { outline: none; box-shadow: var(--p-focus-ring); }

.toc-entry-title {
  flex: 1;
  min-width: 0;
  line-height: var(--leading-normal);
  overflow-wrap: anywhere;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.toc-entry-bar {
  flex: none;
  width: 3px;
  border-radius: var(--radius-full);
  background: var(--color-accent);
  opacity: 0.25;
}
.toc-entry.active .toc-entry-bar { opacity: 1; }
.toc-entry.active .toc-entry-title { color: var(--color-accent); font-weight: var(--weight-medium); }

/* Only the table-occlusion case hides the rail now: kept mounted (so its
   position can keep being measured) but hidden from view and from
   pointer/screen-reader interaction. */
.conversation-toc.toc-clipped {
  visibility: hidden;
  pointer-events: none;
}
</style>
