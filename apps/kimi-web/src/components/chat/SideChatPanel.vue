<!-- apps/kimi-web/src/components/chat/SideChatPanel.vue -->
<!-- BTW "side chat": a side-channel agent rendered in the right-side panel.
     It keeps the parent's context without creating a sidebar session. Reuses
     ChatPane for the transcript and the shared Composer (its side-chat
     variant) for the input, so the pane's look and its draft handling are the
     main composer's. Element structure follows upstream's own SideChatPanel:
     no pane header (the tab strip titles it), a composer pinned to the pane's
     bottom edge with the transcript's last rows faded out under it, and an
     EmptyState carrying the side-chat glyph while the chat has no turns. -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ChatPane from './ChatPane.vue';
import Composer from './Composer.vue';
import EmptyState from '../ui/EmptyState.vue';
import Icon from '../ui/Icon.vue';
import type { PromptAttachment } from '../../composables/useKimiWebClient';
import type { ChatTurn, ConversationStatus, ToolMedia } from '../../types';
import type { FileItem } from './MentionMenu.vue';

const props = defineProps<{
  turns: ChatTurn[];
  running: boolean;
  sending: boolean;
  /** The side-chat agent this pane is bound to. Scopes the composer's draft. */
  agentId?: string;
  status?: ConversationStatus;
  searchFiles?: (q: string) => Promise<FileItem[]>;
  uploadImage?: (file: Blob, name?: string) => Promise<{ fileId: string; name: string; mediaType: string } | null>;
  /** Sends the prompt; resolves false when the daemon refused it, which puts
   *  the draft back in the composer. */
  onSend?: (text: string, attachments: PromptAttachment[]) => Promise<boolean>;
}>();

const emit = defineEmits<{
  openMedia: [media: ToolMedia];
}>();

const { t } = useI18n();

const bodyRef = ref<HTMLDivElement | null>(null);
const composerEl = ref<HTMLDivElement | null>(null);
const composerRef = ref<InstanceType<typeof Composer> | null>(null);

// The composer floats over the pane's bottom edge, so the transcript needs the
// composer's height (plus the 48px band the fade covers) as bottom padding to
// keep its last row reachable. Growing the composer scrolls the body by the
// same amount, so the rows under it do not shift.
const GAP = 48;
const composerHeight = ref(0);
let composerObserver: ResizeObserver | null = null;

watch(composerEl, (el, previous) => {
  if (previous) composerObserver?.unobserve(previous);
  if (el === null) return;
  if (composerObserver === null && typeof ResizeObserver !== 'undefined') {
    composerObserver = new ResizeObserver(() => {
      const next = composerEl.value?.offsetHeight ?? 0;
      const body = bodyRef.value;
      if (body) body.scrollTop += next - composerHeight.value;
      composerHeight.value = next;
    });
  }
  composerObserver?.observe(el);
  composerHeight.value = el.offsetHeight;
}, { immediate: true });

onBeforeUnmount(() => composerObserver?.disconnect());

// The panel mounts fresh on every open, so land focus in the input immediately
// — the panel launcher and /btw both land the user typing.
onMounted(() => {
  void nextTick(() => {
    composerRef.value?.focus();
  });
});

const busy = ref(false);

// The composer's own submit handler: it awaits the daemon's answer and keeps
// the draft (text and chips) when the turn was refused.
async function send(payload: {
  text: string;
  attachments: PromptAttachment[];
}): Promise<boolean> {
  if (busy.value || props.running || props.sending) return false;
  if (!props.onSend) return false;
  busy.value = true;
  try {
    return await props.onSend(payload.text, payload.attachments);
  } finally {
    busy.value = false;
    void nextTick(() => {
      scrollToBottom();
    });
  }
}

function scrollToBottom(): void {
  const el = bodyRef.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

const scrollKey = computed(() => {
  const t = props.turns;
  if (t.length === 0) return '0';
  const last = t.at(-1)!;
  const thinkingLen = last.thinking?.length ?? 0;
  // The key only needs to CHANGE when the tail turn grows, so the lengths are
  // summed, not built: `tool.output.join('')` copied every line of every tool
  // output into a fresh string on each streamed token, only to measure it.
  const toolsLen =
    last.tools?.reduce(
      (n, tool) =>
        n +
        tool.name.length +
        (tool.arg?.length ?? 0) +
        (tool.output?.reduce((m, line) => m + line.length, 0) ?? 0),
      0,
    ) ?? 0;
  return `${t.length}:${last.text.length}:${thinkingLen}:${toolsLen}`;
});

watch(scrollKey, async () => {
  if (!props.running && !props.sending) return;
  await nextTick();
  scrollToBottom();
});

function focusInput(): void {
  composerRef.value?.focus();
}

defineExpose({ focusInput });
</script>

<template>
  <div class="sc">
    <div
      ref="bodyRef"
      class="sc-body"
      :style="
        composerHeight > 0
          ? { '--sc-composer-h': `${composerHeight}px`, paddingBottom: `${composerHeight + GAP}px` }
          : undefined
      "
    >
      <EmptyState
        v-if="turns.length === 0"
        class="sc-empty"
        :title="t('sideChat.title')"
        :hint="t('sideChat.empty')"
      >
        <template #icon><Icon name="side-chat" size="lg" /></template>
      </EmptyState>
      <ChatPane
        v-else
        :turns="turns"
        :approvals="[]"
        :turn-active="running"
        :working="sending || running"
        @open-media="emit('openMedia', $event)"
      />
    </div>

    <div ref="composerEl" class="sc-composer">
      <Composer
        ref="composerRef"
        side-chat
        :session-id="agentId"
        :status="status"
        :search-files="searchFiles"
        :upload-image="uploadImage"
        :submit-disabled="running || sending || busy"
        :submit-handler="send"
      />
    </div>
  </div>
</template>

<style scoped>
.sc {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg);
  position: relative;
}
.sc-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  --sc-composer-h: 0px;
  mask-image: linear-gradient(
    to bottom,
    black calc(100% - var(--sc-composer-h) - 48px),
    transparent calc(100% - var(--sc-composer-h))
  );
  -webkit-mask-image: linear-gradient(
    to bottom,
    black calc(100% - var(--sc-composer-h) - 48px),
    transparent calc(100% - var(--sc-composer-h))
  );
}
.sc-empty {
  min-height: 100%;
}
/* Upstream sizes the side chat's own empty state down from the shared
   EmptyState defaults and paints its glyph in the accent colour. */
.sc-empty :deep(.ui-empty__icon) { color: var(--color-accent); }
.sc-empty :deep(.ui-empty__icon svg) { width: 28px; height: 28px; }
.sc-empty :deep(.ui-empty__title) {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text);
}
.sc-empty :deep(.ui-empty__hint) {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  white-space: pre-line;
}

.sc-composer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: var(--z-sticky);
}
</style>
