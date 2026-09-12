<!-- apps/kimi-web/src/components/chat/TaskNotice.vue -->
<!-- In-transcript notice for a background task completion: the daemon injects
     a user message whose text is a `<notification>` XML block (origin kind
     `task`). Rendered as a light notice — a "From background (Bash)" sender
     line plus one status body line, an output-file row with a copy-path
     action, and a small output-preview snippet — rather than a user bubble.
     Renders either as a standalone turn (pass turnId for the scroll anchor) or
     embedded in an assistant turn's blocks. -->
<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Icon from '../ui/Icon.vue';
import MessageTime from './MessageTime.vue';
import { copyTextToClipboard } from '../../lib/clipboard';
import {
  isBackgroundTaskTitle,
  parseTaskNotification,
  parseTaskNotificationBody,
  taskStatusFromType,
  type TaskNotification,
} from '../../lib/taskNotification';

const props = defineProps<{
  text: string;
  /** Scroll-anchor id for a standalone turn; omitted when embedded in an
   *  assistant turn's blocks (the assistant turn already carries the anchor). */
  turnId?: string;
  /** ISO timestamp of when the notification was injected. */
  createdAt?: string;
}>();

const { t } = useI18n();

const notice = computed<TaskNotification | null>(() => parseTaskNotification(props.text));

// Fall back to the raw text when the payload is not a parseable notification.
const rawBody = computed(() => notice.value?.body?.trim() || props.text.trim());

/** The sender line: "From background (Bash)" / "From background (Agent)". */
const title = computed(() =>
  notice.value?.agentId
    ? t('conversation.notification.sentBy.subagent')
    : t('conversation.notification.sentBy.task'),
);

/** The engine's boilerplate `<description> <status>.` first line, split so the
    card can show a single "Completed: <description>" body line. Null for
    meaning-carrying bodies (a background-question outcome) and for payloads
    that are not parseable notifications — those fall back to the raw body. */
const parsedBody = computed(() => {
  const n = notice.value;
  if (!n || !isBackgroundTaskTitle(n.title)) return null;
  const parsed = parseTaskNotificationBody(n.body);
  if (parsed === null || parsed.status !== taskStatusFromType(n.type)) return null;
  return parsed;
});

const bodyLine = computed(() => {
  const parsed = parsedBody.value;
  if (!parsed) return rawBody.value;
  const status = parsed.userStopped
    ? t('conversation.notification.userStopped')
    : t(`conversation.notification.statusTitle.${parsed.status}`);
  return parsed.description === ''
    ? status
    : t('conversation.notification.bodyLine', { status, description: parsed.description });
});

const reasonLine = computed(() => {
  const reason = parsedBody.value?.reason;
  return reason ? t('conversation.notification.reason', { reason }) : '';
});

const restLine = computed(() => parsedBody.value?.rest ?? '');

type NoticeTone = 'info' | 'success' | 'warn' | 'err';

const tone = computed<NoticeTone>(() => {
  const severity = notice.value?.severity;
  if (severity === 'error') return 'err';
  if (severity === 'warning') return 'warn';
  if (notice.value?.type?.endsWith('.completed')) return 'success';
  if (notice.value?.type?.endsWith('.failed')) return 'err';
  if (notice.value?.type?.endsWith('.timed_out')) return 'warn';
  if (notice.value?.type?.endsWith('.killed')) return 'warn';
  return 'info';
});

const outputFile = computed(() => notice.value?.outputFile);
const outputPreview = computed(() => notice.value?.outputPreview);

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Copy-path button state, keyed by the file path; the check icon shows for 2s.
const copiedPath = ref<string | null>(null);
let copiedTimer: ReturnType<typeof setTimeout> | null = null;
onUnmounted(() => {
  if (copiedTimer !== null) clearTimeout(copiedTimer);
});

function onCopyPath(path: string): void {
  void copyTextToClipboard(path).then((ok) => {
    if (!ok) return;
    copiedPath.value = path;
    if (copiedTimer !== null) clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      copiedTimer = null;
      copiedPath.value = null;
    }, 2000);
  }).catch(() => {/* ignore */});
}

const previewText = computed(() => outputPreview.value?.text ?? '');
</script>

<template>
  <div
    class="tn"
    :class="{ 'turn-anchor': !!turnId }"
    :data-turn-id="turnId"
    role="status"
  >
    <div class="tn-card" :class="`tone-${tone}`">
      <span class="tn-sev" aria-hidden="true">
        <Icon v-if="tone === 'success'" name="check" size="sm" />
        <Icon v-else-if="tone === 'err'" name="close" size="sm" />
        <Icon v-else-if="tone === 'warn'" name="alert-triangle" size="sm" />
        <Icon v-else name="info" size="sm" />
      </span>
      <div class="tn-main">
        <div class="tn-title">{{ title }}</div>
        <div v-if="bodyLine" class="tn-body">{{ bodyLine }}</div>
        <div v-if="reasonLine" class="tn-body tn-reason">{{ reasonLine }}</div>
        <div v-if="restLine" class="tn-body tn-rest">{{ restLine }}</div>
        <div v-if="outputFile" class="tn-file">
          <span class="tn-path" :title="outputFile.path">{{ outputFile.path }}</span>
          <span v-if="outputFile.bytes !== undefined" class="tn-bytes">
            {{ formatBytes(outputFile.bytes) }}
          </span>
          <button
            type="button"
            class="tn-copy"
            :aria-label="t('conversation.notification.copyPath')"
            @click="onCopyPath(outputFile.path)"
          >
            <Icon v-if="copiedPath === outputFile.path" name="check" size="sm" />
            <Icon v-else name="copy" size="sm" />
          </button>
        </div>
        <div v-if="outputPreview && previewText" class="tn-preview">
          <div v-if="outputPreview.truncated" class="tn-preview-note">
            {{ t('conversation.notification.outputTruncated') }}
          </div>
          <pre class="tn-preview-text">{{ previewText }}</pre>
        </div>
      </div>
    </div>
    <div v-if="createdAt" class="tn-meta">
      <MessageTime :time="createdAt" />
    </div>
  </div>
</template>

<style scoped>
.tn {
  margin-top: var(--chat-turn-gap);
  align-self: flex-start;
  max-width: 78%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
}

/* Lighter than a user bubble: a flat notice card with a severity-tinted icon,
   not a filled bubble. */
.tn-card {
  display: flex;
  gap: 8px;
  max-width: 100%;
  min-width: 0;
  padding: 9px 12px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
  color: var(--color-text);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
}
.tn-sev {
  flex: none;
  display: inline-flex;
  align-items: flex-start;
  padding-top: 2px;
  color: var(--color-text-faint);
}
.tn-card.tone-success .tn-sev { color: var(--color-success); }
.tn-card.tone-err .tn-sev { color: var(--color-danger); }
.tn-card.tone-warn .tn-sev { color: var(--color-warning); }

.tn-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.tn-title {
  font-weight: var(--weight-medium);
  color: var(--color-text);
}
.tn-body {
  color: var(--color-text-muted);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
/* Failure reason and the subagent recovery hint are secondary to the status line. */
.tn-reason,
.tn-rest {
  font-size: var(--text-xs);
}

.tn-file {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin-top: 3px;
}
.tn-path {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-accent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tn-bytes {
  flex: none;
  font-size: var(--text-xs);
  color: var(--color-text-faint);
}
.tn-copy {
  flex: none;
  display: inline-flex;
  align-items: center;
  background: none;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-xs);
  padding: 1px 5px;
  color: var(--color-text-muted);
  cursor: pointer;
}
.tn-copy:hover {
  color: var(--color-text);
  background: var(--color-surface-sunken);
}

.tn-preview {
  margin-top: 5px;
  padding: 6px 9px;
  border: 1px dashed var(--color-line);
  border-radius: var(--radius-sm);
  background: var(--color-surface-sunken);
  min-width: 0;
}
.tn-preview-note {
  font-size: var(--text-xs);
  color: var(--color-text-faint);
  margin-bottom: 3px;
}
.tn-preview-text {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: 1.5;
  color: var(--color-text-muted);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 96px;
  overflow-y: auto;
}

.tn-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  padding: 0 4px;
  color: var(--color-text-faint);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
}
</style>