<!-- apps/kimi-web/src/components/chat/SideChatPanel.vue -->
<!-- BTW "side chat": a side-channel agent rendered in the right-side panel.
     It keeps the parent's context without creating a sidebar session. Reuses
     ChatPane for the transcript. Element structure and class vocabulary follow
     upstream's own SideChatPanel: no pane header (the tab strip titles it), a
     composer pinned to the pane's bottom edge with the transcript padded clear
     of it, and a moon + label line while the prompt waits for its first token. -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ChatPane from './ChatPane.vue';
import MoonSpinner from '../ui/MoonSpinner.vue';
import Icon from '../ui/Icon.vue';
import type { ChatTurn, ToolMedia } from '../../types';
import Tooltip from '../ui/Tooltip.vue';

const props = defineProps<{
  turns: ChatTurn[];
  running: boolean;
  sending: boolean;
}>();

const emit = defineEmits<{
  send: [text: string];
  openMedia: [media: ToolMedia];
}>();

const { t } = useI18n();

const draft = ref('');
const inputRef = ref<HTMLTextAreaElement | null>(null);
const bodyRef = ref<HTMLDivElement | null>(null);
const composerEl = ref<HTMLDivElement | null>(null);

// The composer floats over the pane's bottom edge, so the transcript needs the
// composer's height as bottom padding to keep its last row reachable.
const composerHeight = ref(0);
let composerObserver: ResizeObserver | null = null;

watch(composerEl, (el, previous) => {
  if (previous) composerObserver?.unobserve(previous);
  if (el !== null && typeof ResizeObserver !== 'undefined') {
    if (composerObserver === null) {
      composerObserver = new ResizeObserver(() => {
        composerHeight.value = composerEl.value?.offsetHeight ?? 0;
      });
    }
    composerObserver.observe(el);
  }
  composerHeight.value = el?.offsetHeight ?? 0;
}, { immediate: true });

onBeforeUnmount(() => composerObserver?.disconnect());

// Panel mounts fresh on every open (v-else-if in the panel body), so land focus
// in the input immediately — /btw or the shortcut both land the user typing.
onMounted(() => {
  void nextTick(() => {
    inputRef.value?.focus();
  });
});

function submit(): void {
  const text = draft.value.trim();
  if (!text) return;
  emit('send', text);
  draft.value = '';
  void nextTick(() => {
    if (inputRef.value) inputRef.value.style.height = 'auto';
    scrollToBottom();
  });
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
  const toolsLen =
    last.tools?.reduce(
      (n, tool) => n + tool.name.length + (tool.arg?.length ?? 0) + (tool.output?.join('').length ?? 0),
      0,
    ) ?? 0;
  return `${t.length}:${last.text.length}:${thinkingLen}:${toolsLen}`;
});

watch(scrollKey, async () => {
  if (!props.running && !props.sending) return;
  await nextTick();
  scrollToBottom();
});

/** Show the "Requesting…" line from the moment the user sends a prompt until
    the assistant's first message appears — upstream's own condition. */
const showLoading = computed(() => {
  if (!props.sending) return false;
  return props.turns.at(-1)?.role === 'user';
});

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    submit();
  }
}

function autosize(): void {
  const el = inputRef.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
}
</script>

<template>
  <div class="sc">
    <div
      ref="bodyRef"
      class="sc-body"
      :style="composerHeight > 0 ? { paddingBottom: `${composerHeight}px` } : undefined"
    >
      <div v-if="turns.length === 0" class="sc-empty">{{ t('sideChat.empty') }}</div>
      <ChatPane
        v-else
        :turns="turns"
        :approvals="[]"
        :turn-active="running"
        :working="sending || running"
        @open-media="emit('openMedia', $event)"
      />
      <div v-if="showLoading" class="sc-loading">
        <div class="working-indicator" role="status">
          <span class="wi-mascot" aria-hidden="true"><MoonSpinner size="lg" /></span>
          <span class="wi-label">{{ t('conversation.requesting') }}</span>
        </div>
      </div>
    </div>

    <div ref="composerEl" class="sc-composer">
      <textarea
        ref="inputRef"
        v-model="draft"
        class="sc-input"
        rows="1"
        :placeholder="t('sideChat.placeholder')"
        @input="autosize"
        @keydown="onKeydown"
      ></textarea>
      <Tooltip :text="t('sideChat.send')">
        <button type="button" class="sc-send" :disabled="!draft.trim()" @click="submit">
          <Icon name="arrow-right" size="sm" />
        </button>
      </Tooltip>
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
}
.sc-empty {
  padding: 24px 16px;
  text-align: center;
  color: var(--muted);
  font-size: var(--ui-font-size);
}

.sc-composer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: var(--z-sticky);
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 8px 10px;
  border-top: 0.5px solid var(--color-line);
  background: var(--color-surface-raised);
}
.sc-input {
  flex: 1;
  min-width: 0;
  resize: none;
  border: 0.5px solid var(--color-line);
  border-radius: var(--r-sm, 8px);
  padding: 7px 9px;
  background: var(--bg);
  color: var(--color-text);
  font: var(--ui-font-size)/1.5 var(--sans);
  outline: none;
  max-height: 160px;
}
.sc-input:focus { border-color: var(--color-accent-bd); }
.sc-send {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--r-sm, 8px);
  background: var(--color-accent);
  color: var(--color-text-on-accent);
  cursor: pointer;
}
.sc-send:disabled { opacity: 0.4; cursor: default; }
.sc-send:not(:disabled):hover { background: var(--color-accent-hover); }

/* Send → first-token indicator, upstream's WorkingIndicator layout. */
.sc-loading {
  flex: none;
  padding: 8px 12px 12px;
}
.working-indicator {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  align-self: flex-start;
  font: var(--text-sm)/var(--leading-normal) var(--font-ui);
  color: var(--color-text-muted);
}
.wi-mascot {
  flex: none;
  width: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.wi-label { animation: wi-breathe 1.6s var(--ease-in-out) infinite; }

@keyframes wi-breathe {
  50% { opacity: 0.55; }
}

/* The side chat reuses ChatPane, but we don't want its working moon/spinner
   placeholder here — the line above owns that state (upstream hides it too). */
.sc-body :deep(.sending-placeholder),
.sc-body :deep(.sending-line) {
  display: none;
}
</style>
