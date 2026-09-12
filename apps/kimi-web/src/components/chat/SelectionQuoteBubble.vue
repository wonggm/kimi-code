<!-- apps/kimi-web/src/components/chat/SelectionQuoteBubble.vue -->
<!-- The single app-wide selection popover: a multi-line auto-growing comment
     box over a right-aligned Cancel / Add to chat row. Mounted once by
     ConversationPane and driven by the app-wide selectionAnchor; surfaces that
     can hold a selection register with useSelectionCapture instead of mounting
     their own bubble. Teleported to body with a z token so a glass /
     backdrop-filter ancestor can neither clip it nor stack the panel header
     over it. Positioned below the selection by default, flipping above it when
     there is no room below (and anchored by its bottom edge then, so it grows
     upward instead of forcing a second scrollbar). -->
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from '../ui/Button.vue';
import Kbd from '../ui/Kbd.vue';
import {
  clearSelectionAnchor,
  quoteSelectionIntoChat,
  selectionAnchor,
} from '../../composables/useSelectionQuote';

const { t } = useI18n();

const GAP = 6;
const MARGIN = 8;
const MIN_AVAILABLE = 96;

const rootRef = ref<HTMLElement | null>(null);
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const comment = ref('');
const bubbleStyle = ref<Record<string, string>>({});
// Hidden until the first measurement lands, so the bubble never paints at its
// untargeted static position.
const ready = ref(false);

function position(): void {
  const el = rootRef.value;
  const anchor = selectionAnchor.value;
  if (!el || !anchor) return;
  // Measure the natural height: a cap left over from the previous placement
  // would truncate it and misjudge which side the bubble fits on.
  const previousMaxHeight = el.style.maxHeight;
  el.style.maxHeight = 'none';
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  el.style.maxHeight = previousMaxHeight;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spaceBelow = vh - MARGIN - (anchor.bottom + GAP);
  const spaceAbove = anchor.top - GAP - MARGIN;
  const above = height > spaceBelow && spaceAbove > spaceBelow;
  const available = Math.max(above ? spaceAbove : spaceBelow, MIN_AVAILABLE);
  // The cap keeps the rendered height inside the viewport; clamp both edges
  // against it so a huge selection (top above the viewport, bottom below it)
  // still lands on screen.
  const renderHeight = Math.min(height, available);
  const left = Math.min(
    Math.max(anchor.centerX - width / 2, MARGIN),
    Math.max(MARGIN, vw - MARGIN - width),
  );
  const top = Math.min(
    Math.max(anchor.bottom + GAP, MARGIN),
    Math.max(vh - MARGIN - renderHeight, MARGIN),
  );
  const offsetBottom = Math.min(
    Math.max(vh - anchor.top + GAP, MARGIN),
    Math.max(vh - MARGIN - renderHeight, MARGIN),
  );

  bubbleStyle.value = above
    ? {
        left: `${Math.round(left)}px`,
        bottom: `${Math.round(offsetBottom)}px`,
        top: 'auto',
        maxHeight: `${Math.round(available)}px`,
      }
    : {
        left: `${Math.round(left)}px`,
        top: `${Math.round(top)}px`,
        bottom: 'auto',
        maxHeight: `${Math.round(available)}px`,
      };
}

// Fit the box to its content; the upper bound lives in CSS (max-height).
function autosize(): void {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

watch(selectionAnchor, (anchor) => {
  if (anchor === null) return;
  ready.value = false;
  comment.value = '';
  void nextTick(() => {
    autosize();
    position();
    ready.value = true;
    // Focus once the ready class has actually landed — a hidden element
    // cannot take focus.
    void nextTick(() => textareaRef.value?.focus({ preventScroll: true }));
  });
});

function close(): void {
  clearSelectionAnchor();
}

function confirm(): void {
  const anchor = selectionAnchor.value;
  if (!anchor) return;
  quoteSelectionIntoChat(anchor.text, comment.value);
  close();
}

function onInput(): void {
  autosize();
  position();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey) return;
  // An Enter that only resolves an IME candidate belongs to the candidate.
  if (event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  confirm();
}

// Dismissal. Registered once for the bubble's lifetime, so every handler
// no-ops while no selection is anchored — otherwise the Escape capture would
// swallow the app-level Escape (panel close / interrupt) unconditionally.
function onDocMousedown(event: MouseEvent): void {
  if (selectionAnchor.value === null) return;
  if (rootRef.value?.contains(event.target as Node)) return;
  close();
}

function onDocKeydown(event: KeyboardEvent): void {
  if (selectionAnchor.value === null || event.key !== 'Escape') return;
  event.stopPropagation();
  close();
}

function onDocScroll(event: Event): void {
  if (selectionAnchor.value === null) return;
  if (rootRef.value?.contains(event.target as Node)) return;
  close();
}

onMounted(() => {
  document.addEventListener('mousedown', onDocMousedown, true);
  window.addEventListener('keydown', onDocKeydown, true);
  document.addEventListener('scroll', onDocScroll, true);
  window.addEventListener('resize', position);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMousedown, true);
  window.removeEventListener('keydown', onDocKeydown, true);
  document.removeEventListener('scroll', onDocScroll, true);
  window.removeEventListener('resize', position);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="selectionAnchor"
      ref="rootRef"
      class="sqb lg-glass"
      :class="{ 'is-ready': ready }"
      :style="bubbleStyle"
      role="dialog"
      :aria-label="t('conversation.selection.label')"
      @mousedown.stop
      @mouseup.stop
    >
      <textarea
        ref="textareaRef"
        v-model="comment"
        class="sqb-input"
        rows="1"
        :placeholder="t('conversation.selection.placeholder')"
        :aria-label="t('conversation.selection.placeholder')"
        @input="onInput"
        @keydown="onKeydown"
      />
      <div class="sqb-actions">
        <Button size="sm" variant="ghost" @click="close">
          {{ t('conversation.selection.cancel') }}
        </Button>
        <Button size="sm" variant="primary" @click="confirm">
          {{ t('conversation.selection.addToChat') }}
          <Kbd aria-hidden="true" :keys="['↵']" />
        </Button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sqb {
  position: fixed;
  z-index: var(--z-overlay);
  visibility: hidden;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  box-sizing: border-box;
  width: 280px;
  max-width: calc(100vw - 2 * var(--space-4));
  padding: var(--space-2);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow-y: auto;
}
.sqb.is-ready {
  visibility: visible;
}

.sqb-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 34px;
  max-height: 30vh;
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-line-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  resize: none;
  overflow-y: auto;
  outline: none;
}
.sqb-input::placeholder {
  color: var(--color-text-faint);
}
.sqb-input:focus {
  border-color: var(--color-accent);
  box-shadow: var(--p-focus-ring);
}

.sqb-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
}

/* The Enter hint sits on the accent fill of the confirm button, so it borrows
   the button's ink instead of the Kbd primitive's sunken surface. */
.sqb :deep(.ui-kbd__key) {
  background: transparent;
  border-color: currentColor;
  color: currentColor;
  opacity: 0.75;
}
</style>
