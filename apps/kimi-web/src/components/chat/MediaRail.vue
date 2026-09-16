<!-- apps/kimi-web/src/components/chat/MediaRail.vue -->
<!-- A horizontal rail of image/video thumbnails. Read-only it is the transcript
     and queue presentation; with `reorderable` it is the composer's rail, where
     a thumb is also the drag handle. Dragging moves the thumb with the pointer
     and shows where it will land; Alt+ArrowLeft/Right does the same from the
     keyboard, on the same thumb button (`aria-keyshortcuts`). -->
<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import MediaThumb from './MediaThumb.vue';

export interface MediaRailItem {
  /** Stable id within this rail (the composer's local attachment id, or
   *  `sessionId:fileId` in the transcript). */
  id: string;
  kind: 'image' | 'video';
  name?: string;
  url?: string;
  fileId?: string;
  uploading?: boolean;
  error?: boolean;
}

const props = withDefaults(
  defineProps<{
    items: MediaRailItem[];
    /** Accessible label for the rail (it is one `list` of thumbs). */
    label: string;
    /** Composer rails are wider-cornered and carry the hover tools. */
    size?: 'composer' | 'rail';
    /** Enable pointer-drag + Alt+Arrow reordering. The parent applies the order. */
    reorderable?: boolean;
    /** Show the per-thumb "mention in the text" tool. */
    mentionable?: boolean;
    /** Show the per-thumb remove tool. */
    removable?: boolean;
  }>(),
  { size: 'rail', reorderable: false, mentionable: false, removable: false },
);

const emit = defineEmits<{
  /** Primary click on a thumb (open the full preview). */
  activate: [item: MediaRailItem];
  /** The thumb's label goes with the item — the parent inserts it into the
   *  draft text, and the label is what the prompt should call the attachment. */
  mention: [item: MediaRailItem, label: string];
  remove: [item: MediaRailItem];
  /** Drop target: the parent splices `id` to `toIndex` (media positions). */
  reorder: [payload: { id: string; toIndex: number }];
}>();

const { t } = useI18n();

/** The thumb's label in the prompt text and in the tool labels: a stable
 *  kind + position pair ("Image 1") that matches the ordinal badge, so a
 *  mention always names the thumb the user is looking at. */
function mediaLabel(item: MediaRailItem, index: number): string {
  const kind = t(item.kind === 'video' ? 'composer.attachmentVideo' : 'composer.attachmentImage');
  return `${kind} ${index + 1}`;
}

// ---------------------------------------------------------------------------
// Drag-to-reorder. The rail scrolls horizontally, so the drag is driven by
// pointer events rather than HTML5 drag-and-drop: we own the auto-scroll near
// either edge, and touch can hold a thumb to pick it up (a plain touch move is
// still the rail's own scroll).
// ---------------------------------------------------------------------------
const LONG_PRESS_MS = 300;
const DRAG_SLOP_PX = 4;
const EDGE_ZONE_PX = 32;
const EDGE_STEP_PX = 8;

const railRef = ref<HTMLElement | null>(null);
const draggingId = ref<string | null>(null);
const dropIndex = ref<number | null>(null);
const dropLeft = ref<number | null>(null);
const dragX = ref(0);

interface DragState {
  id: string;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  startScrollLeft: number;
  /** The thumb's root element — measured for the slide and the insert mark. */
  element: HTMLElement;
  longPress: number | null;
  /** Touch only: the gesture became a rail scroll, so it can't become a drag. */
  scrolling: boolean;
}

let drag: DragState | null = null;
let lastPointerX = 0;
let autoScrollDir = 0;
let autoScrollFrame = 0;
/** Set on drop so the click that follows the pointerup doesn't open the preview. */
let suppressedClickId: string | null = null;
let suppressTimer: number | null = null;

function thumbEls(): HTMLElement[] {
  return Array.from(railRef.value?.querySelectorAll<HTMLElement>('[data-media-id]') ?? []);
}

function clearLongPress(): void {
  const state = drag;
  if (state === null) return;
  if (state.longPress !== null) window.clearTimeout(state.longPress);
  state.longPress = null;
}

/** How far the dragged thumb may slide: between the first slot's left edge and
 *  the last slot's right edge, clamped, so it never leaves the rail. */
function clampTranslate(pointerX: number): number {
  const rail = railRef.value;
  const state = drag;
  if (rail === null || state === null) return 0;
  const slots = thumbEls();
  const first = slots[0];
  const last = slots[slots.length - 1];
  if (first === undefined || last === undefined) return 0;
  const min = first.offsetLeft - state.element.offsetLeft;
  const max = last.offsetLeft + last.offsetWidth - state.element.offsetLeft - state.element.offsetWidth;
  const wanted = pointerX - state.startX + rail.scrollLeft - state.startScrollLeft;
  return Math.max(min, Math.min(max, wanted));
}

/** Centre of the gap the insert mark points at: the middle of the first slot
 *  for index 0, otherwise the midpoint between the two slots it separates. */
function indicatorLeft(targetIndex: number): number | null {
  const rail = railRef.value;
  const slots = thumbEls();
  const slot = slots[targetIndex];
  if (rail === null || slot === undefined) return null;
  if (targetIndex === 0) return (rail.clientLeft + slot.offsetLeft) / 2;
  const prev = slots[targetIndex - 1];
  return prev === undefined ? null : (prev.offsetLeft + prev.offsetWidth + slot.offsetLeft) / 2;
}

/** Insertion index for the pointer position: the slot whose midpoint the
 *  pointer has not passed yet, measured without the dragged thumb. */
function updateDropTarget(pointerX: number): void {
  const rail = railRef.value;
  const state = drag;
  if (rail === null || state === null) return;
  const others = thumbEls().filter((el) => el.dataset.mediaId !== state.id);
  const x = pointerX - rail.getBoundingClientRect().left + rail.scrollLeft;
  const at = others.findIndex((el) => x < el.offsetLeft + el.offsetWidth / 2);
  const index = at === -1 ? others.length : at;
  dropIndex.value = index;
  dropLeft.value = indicatorLeft(index);
}

function stepAutoScroll(): void {
  autoScrollFrame = 0;
  const rail = railRef.value;
  if (rail === null || drag === null || autoScrollDir === 0) return;
  rail.scrollLeft += autoScrollDir * EDGE_STEP_PX;
  dragX.value = clampTranslate(lastPointerX);
  updateDropTarget(lastPointerX);
  autoScrollFrame = window.requestAnimationFrame(stepAutoScroll);
}

function stopAutoScroll(): void {
  autoScrollDir = 0;
  if (autoScrollFrame !== 0) {
    window.cancelAnimationFrame(autoScrollFrame);
    autoScrollFrame = 0;
  }
}

/** Near either edge the rail scrolls under the pointer, so a thumb can be
 *  carried past what is currently visible. */
function updateAutoScroll(pointerX: number): void {
  const rail = railRef.value;
  if (rail === null) return;
  const rect = rail.getBoundingClientRect();
  const dir =
    pointerX < rect.left + EDGE_ZONE_PX ? -1 : pointerX > rect.right - EDGE_ZONE_PX ? 1 : 0;
  if (dir === autoScrollDir) return;
  stopAutoScroll();
  autoScrollDir = dir;
  if (dir !== 0) autoScrollFrame = window.requestAnimationFrame(stepAutoScroll);
}

function startDrag(): void {
  const state = drag;
  if (state === null) return;
  clearLongPress();
  draggingId.value = state.id;
  lastPointerX = state.startX;
  updateDropTarget(state.startX);
}

function endDrag(): void {
  stopAutoScroll();
  drag = null;
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerUp);
  window.removeEventListener('keydown', onEscape);
}

function resetDragState(): void {
  draggingId.value = null;
  dropIndex.value = null;
  dropLeft.value = null;
  dragX.value = 0;
}

/** Drop the thumb: the parent takes the new index, then the state clears. */
function finishDrag(inside: boolean): void {
  const id = draggingId.value;
  const to = dropIndex.value;
  if (id !== null && to !== null && inside) emit('reorder', { id, toIndex: to });
  if (id !== null) suppressClick(id);
  resetDragState();
  endDrag();
}

function suppressClick(id: string): void {
  suppressedClickId = id;
  if (suppressTimer !== null) window.clearTimeout(suppressTimer);
  suppressTimer = window.setTimeout(() => {
    suppressedClickId = null;
    suppressTimer = null;
  }, 0);
}

function onPointerMove(event: PointerEvent): void {
  const state = drag;
  if (state === null || event.pointerId !== state.pointerId) return;
  const dx = event.clientX - state.startX;
  const dy = event.clientY - state.startY;
  if (draggingId.value === null) {
    if (state.pointerType === 'touch') {
      // A touch move is the rail's own scroll until the long press has picked
      // the thumb up; the browser keeps vertical panning (touch-action: pan-y).
      if (state.scrolling || Math.abs(dx) > DRAG_SLOP_PX) {
        clearLongPress();
        state.scrolling = true;
        event.preventDefault();
        const rail = railRef.value;
        if (rail !== null) rail.scrollLeft = state.startScrollLeft - dx;
      }
      return;
    }
    if (Math.hypot(dx, dy) <= DRAG_SLOP_PX) return;
    startDrag();
  }
  event.preventDefault();
  lastPointerX = event.clientX;
  dragX.value = clampTranslate(event.clientX);
  updateDropTarget(event.clientX);
  updateAutoScroll(event.clientX);
}

function onPointerUp(event: PointerEvent): void {
  if (event.pointerId !== drag?.pointerId) return;
  if (drag?.scrolling === true) {
    // The rail was scrolled, not reordered — the click must not open the preview.
    const id = drag.id;
    resetDragState();
    endDrag();
    suppressClick(id);
    return;
  }
  const rail = railRef.value;
  const rect = rail?.getBoundingClientRect();
  const inside =
    rect !== undefined &&
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom;
  finishDrag(draggingId.value !== null && inside);
}

function onEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || drag === null) return;
  event.preventDefault();
  resetDragState();
  endDrag();
}

function onThumbPointerDown(item: MediaRailItem, event: PointerEvent): void {
  if (!props.reorderable || !event.isPrimary || event.button !== 0) return;
  const target = event.target as HTMLElement | null;
  // A press on one of the hover tools is that tool's own click, never a drag.
  if (target === null || target.closest('.mt-tool') !== null) return;
  if (drag !== null) endDrag();
  const element = event.currentTarget as HTMLElement | null;
  if (element === null) return;
  drag = {
    id: item.id,
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    startX: event.clientX,
    startY: event.clientY,
    startScrollLeft: railRef.value?.scrollLeft ?? 0,
    element,
    longPress: null,
    scrolling: false,
  };
  if (event.pointerType === 'touch') {
    drag.longPress = window.setTimeout(startDrag, LONG_PRESS_MS);
  }
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('keydown', onEscape);
}

/** Swallow the click that a drag or a scroll would otherwise fire on the thumb. */
function onThumbClickCapture(item: MediaRailItem, event: MouseEvent): void {
  if (suppressedClickId !== item.id) return;
  suppressedClickId = null;
  event.preventDefault();
  event.stopImmediatePropagation();
}

/** Alt+ArrowLeft/Right moves the focused thumb one slot; the surrounding
 *  arrows belong to the rail's own scroll and the caret. */
function onThumbKeydown(item: MediaRailItem, index: number, event: KeyboardEvent): void {
  if (!props.reorderable || !event.altKey) return;
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  if ((event.target as HTMLElement | null)?.closest('.mt-btn') === null) return;
  const toIndex = event.key === 'ArrowLeft' ? index - 1 : index + 1;
  if (toIndex < 0 || toIndex >= props.items.length) return;
  event.preventDefault();
  emit('reorder', { id: item.id, toIndex });
}

/** Where the thumb sits while the rail is being rearranged: the dragged one
 *  follows the pointer, the ones it passes step aside by one slot. */
function thumbTransform(id: string, index: number): string | undefined {
  const from = draggingId.value;
  const to = dropIndex.value;
  if (from === null || to === null) return undefined;
  if (id === from) return `translateX(${dragX.value}px)`;
  const fromIndex = props.items.findIndex((item) => item.id === from);
  if (fromIndex < to && index > fromIndex && index <= to) {
    return 'translateX(calc((var(--media-thumb-size) + var(--space-2)) * -1))';
  }
  if (fromIndex > to && index >= to && index < fromIndex) {
    return 'translateX(calc(var(--media-thumb-size) + var(--space-2)))';
  }
  return undefined;
}

// A newly added thumb is appended off-screen in a long rail — bring it into view.
watch(
  () => props.items.length,
  (next, prev) => {
    if (next <= prev) return;
    void nextTick(() => {
      const rail = railRef.value;
      if (rail !== null) rail.scrollLeft = rail.scrollWidth;
    });
  },
);

onUnmounted(() => {
  endDrag();
  if (suppressTimer !== null) window.clearTimeout(suppressTimer);
});
</script>

<template>
  <div
    ref="railRef"
    class="rail"
    :class="`is-${size}`"
    role="list"
    :aria-label="label"
    @dragstart.prevent
  >
    <span
      v-if="dropLeft !== null && draggingId !== null"
      class="rail-drop"
      :style="{ left: `${dropLeft}px` }"
      aria-hidden="true"
    />
    <MediaThumb
      v-for="(item, index) in items"
      :key="item.id"
      :data-media-id="item.id"
      :style="{ transform: thumbTransform(item.id, index) }"
      :class="{ 'is-moving': draggingId !== null }"
      :kind="item.kind"
      :name="item.name"
      :url="item.url"
      :file-id="item.fileId"
      :uploading="item.uploading"
      :error="item.error"
      :ordinal="index + 1"
      :size="size"
      :reorderable="reorderable"
      :dragging="draggingId === item.id"
      :mentionable="mentionable"
      :removable="removable"
      :mention-label="t('composer.mentionNamed', { name: mediaLabel(item, index) })"
      :remove-label="t('composer.removeNamed', { name: mediaLabel(item, index) })"
      @pointerdown="onThumbPointerDown(item, $event)"
      @click.capture="onThumbClickCapture(item, $event)"
      @keydown.capture="onThumbKeydown(item, index, $event)"
      @activate="emit('activate', item)"
      @mention="emit('mention', item, mediaLabel(item, index))"
      @remove="emit('remove', item)"
    />
  </div>
</template>

<style scoped>
.rail {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
  /* Horizontal gestures belong to the rail's own scroll handler, which is also
     what lets a thumb be picked up without the browser panning the page. */
  touch-action: pan-y;
}
.rail::-webkit-scrollbar {
  display: none;
}
.rail.is-moving :deep(.mt) {
  transition: transform var(--duration-fast) var(--ease-in-out);
}
.rail.is-moving :deep(.mt.is-dragging) {
  z-index: 1;
  transition: none;
}
/* Insertion mark: a bar in the gap the thumb would drop into. It spans the
   rail's height, which is the thumb height. */
.rail-drop {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 1;
  width: var(--space-05);
  border-radius: var(--radius-full);
  background: var(--color-text);
  transform: translateX(-50%);
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .rail.is-moving :deep(.mt) {
    transition: none;
  }
}
</style>
