<!-- apps/kimi-web/src/components/chat/MediaTip.vue -->
<!-- Hover preview popover for an image/video attachment chip (composer strip
     and sent-message chips alike): authed media preview, name + size, the
     upload/failed state line, and a fullscreen action. Anchored to the chip's
     rect (fixed positioning + Teleport, same pattern as MentionTip) so no
     transformed/backdrop-filtered ancestor can displace it. -->
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AuthMedia from './AuthMedia.vue';
import Icon from '../ui/Icon.vue';
import Spinner from '../ui/Spinner.vue';

const props = withDefaults(
  defineProps<{
    kind: 'image' | 'video';
    name?: string;
    /** Thumbnail / preview source (object URL or authed file URL). */
    url?: string;
    /** When present, AuthMedia fetches the bytes with auth. */
    fileId?: string;
    mediaType?: string;
    size?: number;
    /** Upload in flight — the preview area shows the pending state. */
    uploading?: boolean;
    /** Upload failed / interrupted — the state line explains. */
    error?: boolean;
    interrupted?: boolean;
    /** Chip bounding rect — the tip anchors to it. */
    anchor: DOMRect;
    /** Hide the tip (the pointer left both chip and tip). */
    onHide: () => void;
    /** Cancel a pending hide (the pointer entered the tip). */
    onStay: () => void;
  }>(),
  { name: '', url: '', fileId: '', mediaType: '', size: undefined, uploading: false, error: false, interrupted: false },
);

const emit = defineEmits<{ fullscreen: [] }>();

const { t } = useI18n();

const SIDE_GAP = 8;
const PREVIEW_HEIGHT = 200;

const rootRef = ref<HTMLElement | null>(null);
const pos = ref({ top: 0, left: 0 });

const displayName = computed(() => {
  if (props.name) return props.name;
  return props.kind === 'image' ? t('composer.attachmentImage') : t('composer.attachmentVideo');
});

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** Whether a real media preview can resolve: nothing to show while the upload
 *  is still in flight or already failed. */
const previewable = computed(() => !props.uploading && !props.error && (props.url !== '' || props.fileId !== ''));

const mediaStatus = ref<'loading' | 'ready' | 'error' | 'idle'>('idle');
function onMediaStatus(next: 'loading' | 'ready' | 'error'): void {
  mediaStatus.value = next;
}
watch(
  () => [props.kind, props.url, props.fileId] as const,
  () => {
    mediaStatus.value = 'idle';
  },
);

const stateLine = computed(() => {
  if (props.uploading) return t('composer.mediaPreviewUploading');
  if (props.error) {
    return props.interrupted
      ? t('composer.attachmentUploadInterrupted')
      : t('composer.attachmentUploadFailed');
  }
  if (!previewable.value) return t('composer.mediaPreviewUnavailable');
  if (mediaStatus.value === 'loading') return t('composer.mediaPreviewLoading');
  return '';
});
const stateDanger = computed(() => props.error);

function position(): void {
  const el = rootRef.value;
  if (!el) return;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let top = props.anchor.bottom + SIDE_GAP;
  if (top + h > window.innerHeight - SIDE_GAP) {
    top = Math.max(SIDE_GAP, props.anchor.top - h - SIDE_GAP);
  }
  const left = Math.min(
    Math.max(props.anchor.left, SIDE_GAP),
    Math.max(SIDE_GAP, window.innerWidth - SIDE_GAP - w),
  );
  pos.value = { top: Math.round(top), left: Math.round(left) };
}

onMounted(() => {
  void nextTick(position);
});
watch(() => [props.anchor, mediaStatus.value] as const, () => {
  void nextTick(position);
});

function onFullscreen(): void {
  props.onHide();
  emit('fullscreen');
}
const tipStyle = computed(() => ({ top: `${pos.value.top}px`, left: `${pos.value.left}px` }));

</script>

<template>
  <div
    ref="rootRef"
    class="media-tip"
    role="tooltip"
    :style="tipStyle"
    @mouseenter="onStay"
    @mouseleave="onHide"
  >
    <div class="media-tip-preview" :style="{ height: `${PREVIEW_HEIGHT}px` }">
      <AuthMedia
        v-if="previewable"
        :url="url"
        :kind="kind"
        :alt="name"
        :file-id="fileId || undefined"
        media-class="media-tip-media"
        :controls="false"
        muted
        @status="onMediaStatus"
      />
      <div v-if="!previewable || mediaStatus !== 'ready'" class="media-tip-placeholder">
        <Spinner v-if="uploading || (previewable && mediaStatus !== 'error')" size="md" />
        <Icon v-else :name="kind === 'video' ? 'play' : 'image'" size="md" />
      </div>
      <button
        v-if="previewable && mediaStatus === 'ready'"
        type="button"
        class="media-tip-zoom"
        :aria-label="t('composer.mediaPreviewFullscreen')"
        @click="onFullscreen"
      >
        <Icon name="expand" size="sm" />
      </button>
    </div>
    <div class="media-tip-meta">
      <span class="media-tip-name">{{ displayName }}</span>
      <span v-if="size !== undefined" class="media-tip-size"> · {{ formatSize(size) }}</span>
    </div>
    <div v-if="stateLine" class="media-tip-state" :class="{ danger: stateDanger }">{{ stateLine }}</div>
  </div>
</template>

<style scoped>
.media-tip {
  position: fixed;
  z-index: var(--z-tooltip);
  width: 280px;
  padding: var(--space-2);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  font-family: var(--font-ui);
  pointer-events: auto;
}

.media-tip-preview {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: var(--color-surface-sunken);
  overflow: hidden;
}
.media-tip-preview :deep(.media-tip-media) {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
}
.media-tip-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
}
.media-tip-zoom {
  position: absolute;
  top: var(--space-1);
  right: var(--space-1);
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0;
}
.media-tip-zoom:hover {
  color: var(--color-text);
  background: var(--color-hover);
}

.media-tip-meta {
  display: flex;
  align-items: baseline;
  gap: 0;
  margin-top: var(--space-2);
  min-width: 0;
}
.media-tip-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  font-size: var(--ui-font-size-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text);
  line-height: var(--leading-normal);
}
.media-tip-size {
  flex: none;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.media-tip-state {
  margin-top: 2px;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  line-height: var(--leading-normal);
  overflow-wrap: anywhere;
}
.media-tip-state.danger {
  color: var(--color-danger);
}
</style>
