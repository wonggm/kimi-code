<!-- apps/kimi-web/src/components/chat/AttachmentChip.vue -->
<!-- One attachment rendered as a pill chip — the SAME component for the
     composer's pending-attachment strip and for sent messages in the chat
     bubble. Context differences are props, not restyled variants:
       - composer: uploading spinner, error tint, remove button
       - bubble:   plain chip, click opens preview / downloads
     Tile rule: images show a real thumbnail, videos a play glyph, files a
     neutral file icon with the extension badge next to the name. -->
<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AuthMedia from './AuthMedia.vue';
import MediaTip from './MediaTip.vue';
import Icon from '../ui/Icon.vue';
import Spinner from '../ui/Spinner.vue';
import Tooltip from '../ui/Tooltip.vue';
import type { IconName } from '../../lib/icons';

const props = withDefaults(
  defineProps<{
    kind: 'image' | 'video' | 'file';
    /** Undefined only for pasted media without a name — a generic label shows. */
    name?: string;
    /** Thumbnail source for images (object URL or the authed file URL). */
    url?: string;
    /** When present, AuthMedia fetches image bytes with auth. */
    fileId?: string;
    mediaType?: string;
    size?: number;
    /** Composer: upload in flight — spinner replaces the ext badge. */
    uploading?: boolean;
    /** Composer: upload failed — chip tinted, info icon replaces the badge. */
    error?: boolean;
    /** Composer: show a remove button. */
    removable?: boolean;
    /** Accessible label for the remove button. */
    removeLabel?: string;
    /** Composer: the upload was interrupted (e.g. session switch during upload)
     *  rather than failing — the chip surfaces a different message ("interrupted"
     *  vs. "failed") but renders the same error styling. */
    interrupted?: boolean;
  }>(),
  { uploading: false, error: false, removable: false, interrupted: false },
);

const emit = defineEmits<{
  /** Primary action (preview media / download file) — the parent decides. */
  activate: [];
  remove: [];
}>();

const { t } = useI18n();

const ext = computed(() => {
  const fromName = props.name?.match(/\.([A-Za-z0-9]{1,8})$/)?.[1];
  const e = fromName ?? props.mediaType?.split('/')[1]?.split('+')[0];
  return e ? e.toUpperCase() : undefined;
});

const fileIcon = computed<IconName>(() => {
  const e = ext.value ?? '';
  if (/^(txt|md|doc|docx|rtf|log)$/i.test(e)) return 'file-text';
  return 'file';
});

const displayName = computed(() => {
  if (props.name) return props.name;
  if (props.kind === 'image') return t('composer.attachmentImage');
  if (props.kind === 'video') return t('composer.attachmentVideo');
  return t('composer.attachmentFile');
});

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const title = computed(() => {
  const parts = [displayName.value];
  if (props.size !== undefined) parts.push(formatSize(props.size));
  return parts.join(' · ');
});

// Inline state badge text — replaces the bare spinner so the chip is readable
// without hovering. Mirrors upstream's compact state label.
const stateLabel = computed(() => {
  if (props.uploading) return t('composer.stateUploading');
  if (props.error) {
    return props.interrupted
      ? t('composer.attachmentUploadInterrupted')
      : t('composer.attachmentUploadFailed');
  }
  return '';
});

// Full accessible description for screen readers — the title attribute is
// short, so a dedicated aria-label spells out the failure mode too.
const ariaLabel = computed(() => {
  const parts = [displayName.value];
  if (props.size !== undefined) parts.push(formatSize(props.size));
  if (props.uploading) parts.push(t('composer.stateUploading'));
  else if (props.error) parts.push(stateLabel.value);
  return parts.join(' · ');
});

// ---------------------------------------------------------------------------
// Media hover popover (image / video chips only). Delayed show + grace-period
// hide, with the popover's own enter cancelling the hide — the same
// flicker-free bridge MentionText uses; moving between chip and popover never
// bounces the tip. Scroll/resize hides it: the anchor moves out from under the
// fixed position.
// ---------------------------------------------------------------------------
const mediaKind = computed<'image' | 'video' | null>(() =>
  props.kind === 'image' || props.kind === 'video' ? props.kind : null,
);

const mediaTipAnchor = ref<DOMRect | null>(null);
let showTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function clearTipTimers(): void {
  if (showTimer !== null) clearTimeout(showTimer);
  if (hideTimer !== null) clearTimeout(hideTimer);
  showTimer = null;
  hideTimer = null;
}

function onTipShowIntent(): void {
  if (mediaKind.value === null) return;
  clearTipTimers();
  showTimer = setTimeout(() => {
    showTimer = null;
    mediaTipAnchor.value = chipRef.value?.getBoundingClientRect() ?? null;
  }, 120);
}

function onTipHideIntent(): void {
  clearTipTimers();
  hideTimer = setTimeout(() => {
    hideTimer = null;
    mediaTipAnchor.value = null;
  }, 140);
}

function onTipStay(): void {
  clearTipTimers();
}

function hideMediaTip(): void {
  clearTipTimers();
  mediaTipAnchor.value = null;
}

function onMediaTipFullscreen(): void {
  hideMediaTip();
  emit('activate');
}

function onViewportChange(): void {
  if (mediaTipAnchor.value !== null) hideMediaTip();
}

if (typeof window !== 'undefined') {
  window.addEventListener('scroll', onViewportChange, true);
  window.addEventListener('resize', onViewportChange);
}
onUnmounted(() => {
  clearTipTimers();
  if (typeof window !== 'undefined') {
    window.removeEventListener('scroll', onViewportChange, true);
    window.removeEventListener('resize', onViewportChange);
  }
});

const chipRef = ref<HTMLElement | null>(null);
</script>

<template>
  <span
    ref="chipRef"
    class="att-chip"
    :class="{ 'is-error': error, 'is-uploading': uploading, 'is-interrupted': interrupted }"
    :title="title"
    :data-kind="kind"
    @mouseenter="onTipShowIntent"
    @mouseleave="onTipHideIntent"
  >
    <button type="button" class="att-activate" :aria-label="ariaLabel" @click="emit('activate')">
      <span class="att-tile">
        <AuthMedia
          v-if="kind === 'image' && url"
          :url="url"
          kind="image"
          :alt="name"
          :file-id="fileId"
          media-class="att-thumb"
        />
        <Icon v-else-if="kind === 'video'" name="play" size="sm" />
        <Icon v-else-if="kind === 'image'" name="image" size="sm" />
        <Icon v-else :name="fileIcon" size="sm" />
      </span>
      <span class="att-name">{{ displayName }}</span>
      <!-- The state badge replaces the silent spinner / info glyph so the chip
           tells the user what's happening without needing to hover or read the
           screen-reader-only label. It still occupies the same slot as the
           existing ext badge would, so the chip layout doesn't jump when the
           state flips. -->
      <span v-if="uploading || error" class="att-state">
        <Spinner v-if="uploading" size="sm" />
        <Icon v-else name="info" size="sm" />
        <span class="att-state-text">{{ stateLabel }}</span>
      </span>
      <span v-else-if="ext" class="att-ext">{{ ext }}</span>
    </button>
    <Tooltip v-if="removable" :text="removeLabel ?? t('composer.remove')">
      <button type="button" class="att-rm" :aria-label="removeLabel ?? t('composer.remove')" @click="emit('remove')">
        <Icon name="close" size="sm" />
      </button>
    </Tooltip>
    <Teleport to="body">
      <MediaTip
        v-if="mediaKind !== null && mediaTipAnchor !== null"
        :kind="mediaKind"
        :name="name"
        :url="url"
        :file-id="fileId"
        :media-type="mediaType"
        :size="size"
        :uploading="uploading"
        :error="error"
        :interrupted="interrupted"
        :anchor="mediaTipAnchor"
        :on-hide="hideMediaTip"
        :on-stay="onTipStay"
        @fullscreen="onMediaTipFullscreen"
      />
    </Teleport>
  </span>
</template>

<style scoped>
.att-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 260px;
  padding: 4px 9px 4px 5px;
  background: var(--color-bg);
  border: 1px solid var(--color-line);
  border-radius: 999px;
  font-size: var(--ui-font-size-sm);
  transition: border-color var(--duration-fast) ease, background var(--duration-fast) ease;
}
.att-chip:hover {
  border-color: var(--color-line-strong);
}
.att-activate {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.att-activate:focus-visible {
  outline: none;
  box-shadow: var(--p-focus-ring);
  border-radius: 999px;
}
.att-tile {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: var(--color-text-muted);
  background: var(--color-surface-sunken);
}
/* Kind-specific tile accents — match upstream's `data-attachment-kind`
   distinction: media (image / video) gets a coloured ring so the kind reads at
   a glance; generic files keep the neutral sunken tile. Mirrors the
   attachment-image / attachment-video selectors in the upstream bundle,
   re-expressed in our token system. */
.att-chip[data-kind="image"] .att-tile,
.att-chip[data-kind="video"] .att-tile {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
.att-chip[data-kind="video"] .att-tile {
  /* A slightly deeper accent so video reads distinct from image. */
  background: color-mix(in srgb, var(--color-accent-soft) 88%, var(--color-text) 12%);
}
.att-tile :deep(.att-thumb) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.att-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
  font-weight: var(--weight-medium);
}
/* Upload-state badge — replaces the silent spinner / info glyph with a compact
   "Uploading" / "Upload failed" label. The badge adopts the chip's
   accent/danger wash so it matches the chip outline. */
.att-state {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: var(--ui-font-size-xs);
  font-weight: var(--weight-medium);
  line-height: 18px;
  white-space: nowrap;
}
.att-chip.is-uploading .att-state {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
.att-chip.is-error .att-state {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.att-state-text {
  /* Truncate the long interruption message in narrow strips — the tooltip /
     aria-label carry the full text. */
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 9em;
}
.att-ext {
  /* Kept as the ext badge that used to sit between the name and the remove
     button when no upload state is active. */
  flex: none;
  font-family: var(--font-mono);
  font-size: var(--ui-font-size-xs);
  color: var(--color-text-faint);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--color-surface-sunken);
  line-height: 18px;
}
.att-chip.is-error {
  border-color: var(--color-danger-bd);
}
/* Interrupted uploads share the error chrome but get a dashed rim to signal
   the chip can still be retried by re-dropping the same file (the message
   copy tells the user that explicitly). */
.att-chip.is-interrupted {
  border-style: dashed;
}
.att-rm {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-faint);
  cursor: pointer;
}
.att-rm:hover {
  background: var(--color-hover);
  color: var(--color-text);
}
.att-rm:focus-visible {
  outline: none;
  box-shadow: var(--p-focus-ring);
}
</style>
