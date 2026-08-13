<!-- apps/kimi-web/src/components/media/MediaPreview.vue -->
<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { ToolMedia } from '../../types';
import IconButton from '../ui/IconButton.vue';
import Icon from '../ui/Icon.vue';

const props = defineProps<{
  media: ToolMedia;
  src: string | null;
  loading?: boolean;
}>();

const emit = defineEmits<{ close: [] }>();

const closeButton = ref<InstanceType<typeof IconButton> | null>(null);
const scale = ref(1);
const panX = ref(0);
const panY = ref(0);
const dragging = ref(false);
let dragStartX = 0;
let dragStartY = 0;
let dragOriginX = 0;
let dragOriginY = 0;

const minScale = 1;
const maxScale = 4;

function resetZoom(): void {
  scale.value = 1;
  panX.value = 0;
  panY.value = 0;
}

function changeZoom(delta: number): void {
  scale.value = Math.min(maxScale, Math.max(minScale, scale.value + delta));
  if (scale.value === minScale) {
    panX.value = 0;
    panY.value = 0;
  }
}

function onWheel(event: WheelEvent): void {
  event.preventDefault();
  changeZoom(event.deltaY < 0 ? 0.2 : -0.2);
}

function onPointerDown(event: PointerEvent): void {
  if (props.media.kind !== 'image' || scale.value <= minScale) return;
  dragging.value = true;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  dragOriginX = panX.value;
  dragOriginY = panY.value;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging.value) return;
  panX.value = dragOriginX + event.clientX - dragStartX;
  panY.value = dragOriginY + event.clientY - dragStartY;
}

function onPointerUp(): void {
  dragging.value = false;
}

function focusCloseButton(): void {
  void nextTick(() => {
    const button = closeButton.value?.$el as HTMLButtonElement | undefined;
    button?.focus();
  });
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close');
}

watch(() => props.media, () => {
  resetZoom();
  focusCloseButton();
}, { immediate: true });

onMounted(() => {
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  document.body.style.overflow = '';
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div
      class="media-preview-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Media preview"
      @click.self="emit('close')"
    >
      <IconButton
        ref="closeButton"
        class="media-preview-close"
        size="lg"
        label="Close media preview"
        @click="emit('close')"
      >
        <Icon name="close" size="lg" />
      </IconButton>

      <div v-if="loading" class="media-preview-status" role="status">Loading preview…</div>
      <div v-else-if="!src" class="media-preview-status" role="status">Preview unavailable</div>
      <div
        v-else
        class="media-preview-stage"
        :class="{ 'is-dragging': dragging }"
        @wheel="onWheel"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <img
          v-if="media.kind === 'image'"
          class="media-preview-image"
          :src="src"
          :alt="media.path || 'Image preview'"
          :style="{ transform: `translate3d(${panX}px, ${panY}px, 0) scale(${scale})` }"
          draggable="false"
        />
        <video
          v-else
          class="media-preview-video"
          :src="src"
          controls
          autoplay
          playsinline
        />
      </div>

      <div v-if="media.kind === 'image' && src && !loading" class="media-preview-controls" @click.stop>
        <IconButton size="lg" label="Zoom out" :disabled="scale <= minScale" @click="changeZoom(-0.2)">
          <Icon name="minus" size="lg" />
        </IconButton>
        <button type="button" class="media-preview-reset" @click="resetZoom">{{ Math.round(scale * 100) }}%</button>
        <IconButton size="lg" label="Zoom in" :disabled="scale >= maxScale" @click="changeZoom(0.2)">
          <Icon name="plus" size="lg" />
        </IconButton>
        <button type="button" class="media-preview-reset" @click="resetZoom">Reset</button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.media-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(var(--space-8), var(--safe-top)) max(var(--space-8), var(--safe-right)) max(var(--space-8), var(--safe-bottom)) max(var(--space-8), var(--safe-left));
  box-sizing: border-box;
  background: rgb(0 0 0 / 78%);
  animation: media-preview-in var(--duration-base) var(--ease-out);
}

html[data-liquid-glass='on'] .media-preview-overlay {
  -webkit-backdrop-filter: blur(10px) saturate(140%);
  backdrop-filter: blur(10px) saturate(140%);
}

.media-preview-close {
  position: absolute;
  top: max(var(--space-4), var(--safe-top));
  right: max(var(--space-4), var(--safe-right));
  z-index: 1;
  border-radius: var(--radius-full);
  background: rgb(0 0 0 / 42%);
  color: white;
}

.media-preview-close:hover:not(:disabled) {
  background: rgb(0 0 0 / 66%);
  color: white;
}

.media-preview-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  max-height: 100%;
  overflow: hidden;
  touch-action: none;
  user-select: none;
}

.media-preview-stage.is-dragging { cursor: grabbing; }
.media-preview-image {
  display: block;
  max-width: calc(100vw - var(--space-8) * 2);
  max-height: calc(100dvh - var(--space-8) * 2);
  object-fit: contain;
  cursor: grab;
  transform-origin: center;
  transition: transform var(--duration-fast) var(--ease-out);
}
.media-preview-stage.is-dragging .media-preview-image { cursor: grabbing; transition: none; }
.media-preview-video {
  display: block;
  width: min(100%, 1100px);
  max-width: calc(100vw - var(--space-8) * 2);
  max-height: calc(100dvh - var(--space-8) * 2);
  object-fit: contain;
}

.media-preview-status {
  color: white;
  font-size: var(--text-sm);
}

.media-preview-controls {
  position: absolute;
  bottom: max(var(--space-4), var(--safe-bottom));
  left: 50%;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border-radius: var(--radius-full);
  background: rgb(0 0 0 / 42%);
  color: white;
  transform: translateX(-50%);
}
.media-preview-controls :deep(.ui-icon-button) { border-radius: var(--radius-full); color: white; }
.media-preview-controls :deep(.ui-icon-button:hover:not(:disabled)) { background: rgb(255 255 255 / 16%); color: white; }
.media-preview-reset {
  min-width: 48px;
  padding: var(--space-2) var(--space-3);
  border: 0;
  border-radius: var(--radius-full);
  background: transparent;
  color: white;
  font: inherit;
  cursor: pointer;
}
.media-preview-reset:hover { background: rgb(255 255 255 / 16%); }

@keyframes media-preview-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (max-width: 640px) {
  .media-preview-overlay { padding: max(var(--space-6), var(--safe-top)) max(var(--space-4), var(--safe-right)) max(var(--space-6), var(--safe-bottom)) max(var(--space-4), var(--safe-left)); }
  .media-preview-image { max-width: calc(100vw - var(--space-4) * 2); max-height: calc(100dvh - var(--space-6) * 2); }
  .media-preview-video { max-width: calc(100vw - var(--space-4) * 2); max-height: calc(100dvh - var(--space-6) * 2); }
}
</style>
