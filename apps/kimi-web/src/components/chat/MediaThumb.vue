<!-- apps/kimi-web/src/components/chat/MediaThumb.vue -->
<!-- One image/video attachment as a square thumbnail: the media itself, a state
     badge while it uploads or fails, the 1-based position badge, and — in the
     composer — the hover tools that mention it in the prompt text or remove it.
     The SAME component fills the composer rail and the read-only rails in the
     transcript bubble and the queue row; the context is props, not restyled
     variants. -->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import AuthMedia from './AuthMedia.vue';
import Icon from '../ui/Icon.vue';
import Spinner from '../ui/Spinner.vue';
import Tooltip from '../ui/Tooltip.vue';

const props = withDefaults(
  defineProps<{
    kind: 'image' | 'video';
    /** File name; undefined for a pasted image without one. */
    name?: string;
    /** Thumbnail source: the composer's local object URL, or the daemon file URL. */
    url?: string;
    /** File-store id — the thumbnail is then fetched with auth (see AuthMedia). */
    fileId?: string;
    /** Upload in flight — a spinner sits over the thumbnail. */
    uploading?: boolean;
    /** Upload failed — the rim and the badge turn red. */
    error?: boolean;
    /** 1-based position among the prompt's media attachments. */
    ordinal?: number;
    /** Composer thumbs carry the hover tools and a wider corner radius. */
    size?: 'composer' | 'rail';
    /** Composer rail: the thumb is the drag handle for reordering. */
    reorderable?: boolean;
    dragging?: boolean;
    /** Composer rail: show the mention / remove tools on hover. */
    mentionable?: boolean;
    mentionLabel?: string;
    removable?: boolean;
    removeLabel?: string;
  }>(),
  {
    uploading: false,
    error: false,
    size: 'rail',
    reorderable: false,
    dragging: false,
    mentionable: false,
    removable: false,
  },
);

const emit = defineEmits<{
  /** Primary action (open the full preview) — the parent decides. */
  activate: [];
  mention: [];
  remove: [];
}>();

const { t } = useI18n();

const label = computed(() => {
  const base =
    props.name || t(props.kind === 'video' ? 'composer.attachmentVideo' : 'composer.attachmentImage');
  if (props.uploading) return `${base} · ${t('composer.stateUploading')}`;
  if (props.error) return `${base} · ${t('composer.stateUploadFailed')}`;
  return base;
});

// A local object URL still holds the picked bytes, so the thumbnail renders it
// directly instead of re-downloading the same image through the authed file route.
const isLocalUrl = computed(() => /^(?:blob|data):/i.test(props.url ?? ''));
const mediaFileId = computed(() => (isLocalUrl.value ? undefined : props.fileId));

const hasTools = computed(() => props.mentionable || props.removable);
</script>

<template>
  <span
    class="mt"
    :class="[
      `is-${size}`,
      { 'is-error': error, 'is-reorderable': reorderable, 'is-dragging': dragging },
    ]"
    role="listitem"
  >
    <Tooltip :text="error ? t('composer.stateUploadFailed') : null">
      <button
        type="button"
        class="mt-btn"
        :aria-label="label"
        :aria-busy="uploading"
        :aria-keyshortcuts="reorderable ? 'Alt+ArrowLeft Alt+ArrowRight' : undefined"
        @click="emit('activate')"
      >
        <AuthMedia
          v-if="url || fileId"
          :url="url ?? ''"
          :kind="kind"
          :file-id="mediaFileId"
          media-class="mt-img"
          :controls="false"
          muted
        />
        <span class="mt-badge" :class="{ 'is-error': error }" aria-hidden="true">
          <Spinner v-if="uploading" size="sm" :label="t('composer.stateUploading')" />
          <Icon v-else-if="error" name="info" size="sm" />
          <Icon v-else-if="kind === 'video'" name="play" size="sm" />
        </span>
      </button>
    </Tooltip>

    <span
      v-if="ordinal !== undefined || hasTools"
      class="mt-dock"
      :class="{ 'has-tools': hasTools }"
    >
      <span v-if="hasTools" class="mt-tools">
        <Tooltip v-if="mentionable" :text="mentionLabel">
          <button
            type="button"
            class="mt-tool"
            :aria-label="mentionLabel"
            @mousedown.prevent
            @click.stop="emit('mention')"
          >
            <Icon name="at" size="sm" />
          </button>
        </Tooltip>
        <Tooltip v-if="removable" :text="removeLabel ?? t('composer.remove')">
          <button
            type="button"
            class="mt-tool"
            :aria-label="removeLabel ?? t('composer.remove')"
            @click.stop="emit('remove')"
          >
            <Icon name="trash" size="sm" />
          </button>
        </Tooltip>
      </span>
      <span v-if="ordinal !== undefined" class="mt-ordinal" aria-hidden="true">{{ ordinal }}</span>
    </span>
  </span>
</template>

<style scoped>
.mt {
  /* Local geometry: upstream sizes every media thumb from one composer token and
     only varies the corner radius between the two rails. */
  --media-thumb-size: 72px;
  --media-thumb-scrim: rgba(0, 0, 0, 0.6);
  position: relative;
  flex: none;
  display: inline-flex;
}
.mt-btn {
  display: block;
  padding: 0;
  border: 0.5px solid var(--color-line);
  border-radius: var(--radius-lg);
  background: var(--color-well);
  overflow: hidden;
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-out);
}
.mt.is-composer .mt-btn {
  border-radius: var(--radius-xl);
}
.mt-btn:hover {
  border-color: var(--color-line-strong);
}
.mt-btn:focus-visible {
  outline: none;
  box-shadow: var(--p-focus-ring);
}
.mt.is-error .mt-btn {
  border-color: var(--color-danger-bd);
}
/* While a drag is live the thumb must not start a text selection, and the
   dragged one dims so the insertion mark reads as the moving element. */
.mt.is-reorderable .mt-btn {
  user-select: none;
}
.mt.is-dragging .mt-btn {
  opacity: 0.55;
  cursor: grabbing;
}
.mt-img {
  display: block;
  width: var(--media-thumb-size);
  height: var(--media-thumb-size);
  object-fit: cover;
}
/* Centered state badge — the only thing that tells "Preparing" or "Failed"
   apart from a loaded thumb without reading the aria label. */
.mt-badge {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-full);
  background: var(--color-surface-raised);
  border: 0.5px solid var(--color-line);
  color: var(--color-text);
  box-shadow: var(--shadow-sm);
  pointer-events: none;
}
.mt-badge.is-error {
  color: var(--color-danger);
  border-color: var(--color-danger-bd);
}
.mt-dock {
  position: absolute;
  right: var(--space-1);
  bottom: var(--space-1);
  z-index: 1;
  color: var(--color-text-on-scrim);
  pointer-events: none;
}
.mt.is-composer .mt-dock {
  inset: 0;
}
/* Scrim behind the composer tools so the icons stay legible on any photo. */
.mt.is-composer .mt-dock.has-tools::before {
  position: absolute;
  inset: 0;
  border-radius: var(--radius-xl);
  background: rgba(0, 0, 0, 0.4);
  content: '';
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out);
}
.mt-tools {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 1;
  display: flex;
  gap: var(--space-1);
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, -50%);
  transition: opacity var(--duration-fast) var(--ease-out);
}
.mt.is-composer:not(.is-dragging):hover .mt-tools,
.mt.is-composer:not(.is-dragging):focus-within .mt-tools {
  opacity: 1;
  pointer-events: auto;
}
.mt.is-composer:not(.is-dragging):hover .mt-dock.has-tools::before,
.mt.is-composer:not(.is-dragging):focus-within .mt-dock.has-tools::before {
  opacity: 1;
  transition-duration: var(--duration-base);
}
/* The position badge yields to the tools; the tool aria-labels carry the same
   information ("Mention Image 1"). */
.mt.is-composer:not(.is-dragging):hover .mt-ordinal,
.mt.is-composer:not(.is-dragging):focus-within .mt-ordinal {
  opacity: 0;
}
.mt-tool {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: var(--radius-md);
  background: var(--media-thumb-scrim);
  color: inherit;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out),
    transform var(--duration-fast) var(--ease-out);
}
.mt-tool:hover {
  background: color-mix(in srgb, var(--media-thumb-scrim) 80%, var(--color-text-on-scrim) 20%);
}
.mt-tool:active {
  transform: scale(0.96);
}
.mt-tool:focus-visible {
  outline: none;
  box-shadow: var(--p-focus-ring);
}
.mt-ordinal {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: var(--space-5);
  height: var(--space-5);
  padding: 0 var(--space-1-5);
  border-radius: var(--radius-md);
  background: var(--media-thumb-scrim);
  color: var(--color-text-on-scrim);
  font-size: var(--ui-font-size-xs);
  font-weight: var(--weight-section-label);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.mt.is-composer .mt-ordinal {
  position: absolute;
  right: var(--space-1);
  bottom: var(--space-1);
  transition: opacity var(--duration-fast) var(--ease-out);
}
/* Touch (no hover): the tools own no hover state, so they stay visible instead
   of being unreachable. They sit over the thumbnail rather than at its corners. */
@media (hover: none) {
  .mt.is-composer .mt-dock.has-tools::before {
    display: none;
  }
  .mt-tools {
    opacity: 1;
    pointer-events: auto;
  }
  .mt.is-composer .mt-ordinal {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .mt-dock::before,
  .mt-tools,
  .mt-ordinal,
  .mt-tool {
    transition: none;
  }
}
</style>
