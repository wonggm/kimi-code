<!-- apps/kimi-web/src/components/chat/BrowserReferenceDialog.vue -->
<!-- One browser reference, opened from its pill in a message. Upstream's own
     fallback (`BrowserReferenceDetails`): the dialog the web app shows when no
     live browser session can look the capture up again, so everything is
     read-only — the page a reference was captured from, its thumbnail, whether
     the screenshot travels with it, and the user's comment. A captured element
     with a pending screenshot shows that state, with a retry when the upload
     can still be repeated. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getKimiWebApi } from '../../api';
import type {
  BrowserReferenceResolution,
  BrowserReferenceView,
} from '../../lib/browserReference';
import { browserCaptureTargetLine, formatCapturedAt } from '../../lib/browserReference';
import Dialog from '../ui/Dialog.vue';
import CardButton from '../ui/CardButton.vue';
import Checkbox from '../ui/Checkbox.vue';
import Textarea from '../ui/Textarea.vue';

const props = defineProps<{
  open: boolean;
  state: BrowserReferenceView | null;
}>();

const emit = defineEmits<{
  close: [];
  resolve: [id: string, value: BrowserReferenceResolution | null];
}>();

const { t } = useI18n();

const comment = ref('');
const includeScreenshot = ref(true);

watch(
  () => props.state,
  (state) => {
    comment.value = state?.reference.comment ?? '';
    includeScreenshot.value = state?.capture.target.kind === 'region' || state?.reference.includeScreenshot !== false;
  },
  { immediate: true },
);

const status = computed(() => {
  const state = props.state;
  if (!state || state.readOnly || state.screenshotState === undefined) return '';
  if (state.screenshotState === 'uploading') return t('browserReference.screenshotUploading');
  return t(state.canRetry ? 'browserReference.screenshotFailed' : 'browserReference.screenshotUnavailable');
});

const targetLine = computed(() => (props.state ? browserCaptureTargetLine(props.state.capture) : ''));
const capturedAt = computed(() => (props.state ? formatCapturedAt(props.state.capture.capturedAt) : ''));
const isRegion = computed(() => props.state?.capture.target.kind === 'region');

// A capture's screenshot is a session-media attachment: its bytes need the
// bearer credential, so they are fetched into a blob URL rather than pointed at
// by the `<img>` (a bare media URL 401s).
const screenshotUrl = ref('');
const previewUrl = computed(() => props.state?.thumbnail || screenshotUrl.value);
let objectUrl: string | null = null;

function releaseScreenshot(): void {
  if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  screenshotUrl.value = '';
}

watch(
  () => [props.state?.screenshot?.sessionId, props.state?.screenshot?.fileId] as const,
  ([sessionId, fileId]) => {
    releaseScreenshot();
    if (!sessionId || !fileId) return;
    getKimiWebApi()
      .getSessionMediaBlob(sessionId, fileId)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        screenshotUrl.value = objectUrl;
      })
      .catch(() => releaseScreenshot());
  },
  { immediate: true },
);

onBeforeUnmount(releaseScreenshot);

function close(): void {
  emit('resolve', props.state?.id ?? '', null);
  emit('close');
}

function resolve(retryScreenshot = false): void {
  const state = props.state;
  if (!state || state.readOnly) return;
  emit('resolve', state.id, {
    comment: comment.value,
    includeScreenshot: state.capture.target.kind === 'region' || includeScreenshot.value,
    retryScreenshot,
  });
}

function onSubmit(): void {
  resolve();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) return;
  event.preventDefault();
  resolve();
}
</script>

<template>
  <Dialog
    :open="open"
    :title="state?.capture.label ?? ''"
    size="md"
    :initial-focus="state?.readOnly ? 'button' : 'textarea'"
    @close="close"
  >
    <form v-if="state" class="browser-reference-details" @submit.prevent="onSubmit" @keydown="onKeydown">
      <p v-if="status" class="browser-reference-details__status" role="status">{{ status }}</p>
      <div class="browser-reference-details__source">
        <time :datetime="state.capture.capturedAt">{{ t('browserReference.capturedAt', { time: capturedAt }) }}</time>
        <span>{{ state.capture.page.title }}</span>
        <a :href="state.capture.page.url" target="_blank" rel="noopener noreferrer">{{ state.capture.page.url }}</a>
        <span v-if="targetLine" class="browser-reference-details__target">{{ targetLine }}</span>
      </div>
      <img
        v-if="previewUrl"
        class="browser-reference-details__preview"
        :src="previewUrl"
        :alt="state.capture.label"
      />
      <Checkbox
        v-if="state.capture.screenshot"
        v-model="includeScreenshot"
        :disabled="state.readOnly || isRegion"
      >
        {{ t(isRegion ? 'browserReference.regionScreenshot' : 'browserReference.includeScreenshot') }}
      </Checkbox>
      <label class="browser-reference-details__comment">
        <span>{{ t('browserReference.comment') }}</span>
        <Textarea
          v-model="comment"
          :readonly="state.readOnly"
          :placeholder="t('browserReference.commentPlaceholder')"
        />
      </label>
    </form>
    <template #foot>
      <CardButton
        v-if="state && !state.readOnly && state.canRetry && state.screenshotState === 'failed'"
        @click="resolve(true)"
      >
        {{ t('browserReference.retryScreenshot') }}
      </CardButton>
      <CardButton @click="close">
        {{ t(state?.readOnly === true ? 'common.close' : 'common.cancel') }}
      </CardButton>
      <CardButton v-if="state && !state.readOnly" :disabled="comment.length > 10000" @click="resolve(false)">
        {{ t('browserReference.save') }}
      </CardButton>
    </template>
  </Dialog>
</template>

<style scoped>
.browser-reference-details {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.browser-reference-details__source,
.browser-reference-details__comment {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--text-sm);
}
.browser-reference-details__source {
  color: var(--color-text-muted);
  overflow-wrap: anywhere;
}
.browser-reference-details__source a {
  color: inherit;
}
.browser-reference-details__source time {
  font-variant-numeric: tabular-nums;
}
.browser-reference-details__target {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}
.browser-reference-details__status {
  margin: 0;
  color: var(--color-warning);
  font-size: var(--text-sm);
}
.browser-reference-details__preview {
  max-width: 100%;
  max-height: 240px;
  width: auto;
  align-self: center;
  object-fit: contain;
  border-radius: var(--radius-xs);
}
</style>
