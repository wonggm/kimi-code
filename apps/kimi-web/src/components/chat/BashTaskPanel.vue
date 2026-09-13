<!-- apps/kimi-web/src/components/chat/BashTaskPanel.vue -->
<!-- A bash task's detail in the right panel: upstream's BashTaskPanel. The
     command sits in its own `bp-cmd` line behind a `$`, the captured output
     fills the `bp-output` well below it, and a `bp-status` row reports a task
     that is still running or stopped short (suspended, failed, cancelled).
     Element structure, class names and the line de-duplication are upstream's
     own; each block carries a hover copy button. The pane is fed by the same
     member record the subagent pane reads, whose `prompt` is the command. -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AgentMember } from '../../types';
import { copyTextToClipboard } from '../../lib/clipboard';
import Icon from '../ui/Icon.vue';
import IconButton from '../ui/IconButton.vue';
import Spinner from '../ui/Spinner.vue';

const props = defineProps<{ member: AgentMember }>();

const { t } = useI18n();

/** The command, when the task reported one. */
const command = computed(() => {
  const text = props.member.prompt;
  return text !== undefined && text.trim() !== '' ? text : undefined;
});

/** Upstream collects the member's live text, its progress lines and its output
 *  preview into one de-duplicated block (dropping a line that only repeats the
 *  command) and renders it line by line. */
const lines = computed(() => {
  const seen = new Set<string>();
  const joined: string[] = [];
  const commandLine = command.value !== undefined ? `$ ${command.value}` : null;
  const sources = [props.member.text, props.member.outputLines?.join('\n'), props.member.summary];
  for (const source of sources) {
    const text = source?.trim();
    if (!text || seen.has(text)) continue;
    if (commandLine !== null && text === commandLine) continue;
    seen.add(text);
    joined.push(text);
  }
  return joined.flatMap((text) => text.split('\n'));
});

const running = computed(
  () => props.member.status === 'running' && props.member.phase !== 'suspended',
);
const suspended = computed(() => props.member.phase === 'suspended');
const failed = computed(() => props.member.status === 'failed');
const cancelled = computed(() => props.member.status === 'cancelled');
const statusVisible = computed(() => running.value || suspended.value || failed.value || cancelled.value);

const copied = ref<'cmd' | 'out' | null>(null);
let copiedTimer: ReturnType<typeof setTimeout> | null = null;

function markCopied(which: 'cmd' | 'out'): void {
  copied.value = which;
  if (copiedTimer !== null) clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => {
    copied.value = null;
    copiedTimer = null;
  }, 1400);
}

async function copy(text: string, which: 'cmd' | 'out'): Promise<void> {
  if (await copyTextToClipboard(text)) markCopied(which);
}

// A task switch clears the copy confirmation and the user's scroll pin.
const scrollerEl = ref<HTMLElement | null>(null);
const pinnedBottom = ref(true);

function onOutputScroll(): void {
  const el = scrollerEl.value;
  if (!el) return;
  pinnedBottom.value = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
}

watch(
  () => props.member.id,
  () => {
    copied.value = null;
    pinnedBottom.value = true;
    scrollerEl.value?.scrollTo({ top: scrollerEl.value.scrollHeight });
  },
);

// New output follows the tail while the user has not scrolled up.
watch(
  () => lines.value.length,
  () => {
    if (!pinnedBottom.value) return;
    void nextTick(() => {
      const el = scrollerEl.value;
      if (el) el.scrollTop = el.scrollHeight;
    });
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (copiedTimer !== null) clearTimeout(copiedTimer);
});
</script>

<template>
  <div class="bp">
    <div v-if="command !== undefined" class="bp-cmd-wrap">
      <div class="bp-cmd"><span class="bp-dollar" aria-hidden="true">$</span> {{ command }}</div>
      <div class="bp-actions">
        <IconButton
          class="bp-copy"
          size="sm"
          :label="copied === 'cmd' ? t('tasks.copied') : t('tasks.copyCommand')"
          @click="copy(command, 'cmd')"
        >
          <Icon :name="copied === 'cmd' ? 'check' : 'copy'" size="sm" />
        </IconButton>
      </div>
    </div>

    <div class="bp-output-wrap">
      <div ref="scrollerEl" class="bp-output" @scroll.passive="onOutputScroll">
        <div class="bp-output-inner">
          <div v-for="(line, index) in lines" :key="index">{{ line }}</div>
          <div v-if="lines.length === 0" class="bp-empty">
            {{ running ? t('tools.output.waiting') : t('tools.output.empty') }}
          </div>
        </div>
      </div>
      <div class="bp-actions">
        <IconButton
          v-if="lines.length > 0"
          class="bp-copy"
          size="sm"
          :label="copied === 'out' ? t('tasks.copied') : t('tasks.copyOutput')"
          @click="copy(lines.join('\n'), 'out')"
        >
          <Icon :name="copied === 'out' ? 'check' : 'copy'" size="sm" />
        </IconButton>
      </div>
    </div>

    <div v-if="statusVisible" class="bp-status">
      <template v-if="running">
        <Spinner size="sm" />
        <span>{{ t('tasks.running') }}</span>
      </template>
      <span v-else-if="suspended" class="bp-status-muted">{{ member.suspendedReason }}</span>
      <span v-else-if="failed" class="bp-status-danger">{{ t('tools.agent.status.error') }}</span>
      <span v-else class="bp-status-muted">{{ t('tasks.stateCancelled') }}</span>
    </div>
  </div>
</template>

<style scoped>
/* Upstream's own numbers, from its stylesheet. */
.bp {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  position: relative;
  background: var(--color-bg);
}
.bp-cmd,
.bp-output {
  background: var(--color-well);
  border: 0.5px solid var(--color-line);
  border-radius: var(--radius-md);
  padding: var(--space-2) calc(var(--icon-button-sm) + var(--space-2)) var(--space-2) var(--space-3);
  font-family: var(--font-mono);
  font-size: calc(var(--content-font-size) - 2px);
  line-height: 1.6;
  font-feature-settings: 'liga' 0, 'calt' 0;
  font-variant-ligatures: none;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
  overscroll-behavior: contain;
}
.bp-cmd {
  flex: none;
  max-height: 6lh;
  overflow-y: auto;
}
.bp-cmd-wrap {
  flex: none;
  position: relative;
}
.bp-output-wrap {
  flex: 1;
  min-height: 0;
  position: relative;
}
.bp-output {
  height: 100%;
  overflow-y: auto;
}
.bp-actions {
  position: absolute;
  top: var(--space-1);
  right: var(--space-1);
  z-index: var(--z-sticky);
  display: flex;
  gap: var(--space-1);
  opacity: 0;
  transition: opacity var(--duration-base) var(--ease-out);
}
.bp-cmd-wrap:hover .bp-actions,
.bp-output-wrap:hover .bp-actions,
.bp-actions:focus-within {
  opacity: 1;
}
.bp-copy {
  background: var(--color-well);
  border-color: var(--color-line);
}
.bp-dollar {
  color: var(--color-text-faint);
  user-select: none;
}
.bp-empty {
  color: var(--color-text-faint);
  font-style: italic;
}
.bp-status {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  color: var(--color-text-muted);
}
.bp-status-muted {
  color: var(--color-text-muted);
}
.bp-status-danger {
  color: var(--color-danger);
}
</style>
