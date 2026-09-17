<!-- apps/kimi-web/src/components/chat/tool-calls/WaitForTool.vue -->
<!-- The `WaitFor` tool (task wait): a quiet single-line card — "Wait · <state>"
     plus a duration chip — that expands to a small summary of what the wait
     produced: the finished task, how many more finished during the wait, and
     which tasks are still running. The parse lives in lib/waitForToolParse. -->
<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ToolCall } from '../../../types';
import { toolGlyph, toolLabel } from '../../../lib/toolMeta';
import { formatDuration } from '../../chatTurnRendering';
import { parseWaitForOutput, type WaitForParse } from '../../../lib/waitForToolParse';
import ToolRow from '../ToolRow.vue';
import ToolOutputBlock from './ToolOutputBlock.vue';
import ToolPanel from './ToolPanel.vue';
import Badge from '../../ui/Badge.vue';

const props = withDefaults(
  defineProps<{
    tool: ToolCall;
    mobile?: boolean;
    toolDiffPanel?: boolean;
  }>(),
  { mobile: false, toolDiffPanel: false },
);

const { t } = useI18n();

const status = computed<'running' | 'ok' | 'error'>(() => props.tool.status as 'running' | 'ok' | 'error');

// The input carries `{ timeout, task_id? }` — resolve the waited-for task id
// whichever casing the daemon used.
const taskId = computed(() => {
  try {
    const parsed = JSON.parse(props.tool.arg ?? '') as Record<string, unknown>;
    return typeof parsed['task_id'] === 'string'
      ? parsed['task_id']
      : typeof parsed['taskId'] === 'string'
        ? parsed['taskId']
        : undefined;
  } catch {
    return undefined;
  }
});

const full = computed(() => (status.value === 'error' ? null : parseWaitForOutput(props.tool.output)));

const STATUS_LABEL_KEYS: Record<string, string> = {
  completed: 'conversation.notification.status.completed',
  failed: 'conversation.notification.status.failed',
  timed_out: 'conversation.notification.status.timed_out',
  killed: 'conversation.notification.status.killed',
  lost: 'conversation.notification.status.lost',
};

function statusLabel(value: string | undefined): string {
  if (!value) return '';
  const key = STATUS_LABEL_KEYS[value];
  return key ? t(key) : value;
}

function statusVariant(value: string | undefined): 'neutral' | 'success' | 'danger' | 'warning' {
  switch (value) {
    case 'completed':
      return 'success';
    case 'failed':
    case 'lost':
      return 'danger';
    case 'timed_out':
    case 'killed':
      return 'warning';
    default:
      return 'neutral';
  }
}

const firstOutputLine = computed(() => props.tool.output?.find((line) => line.trim().length > 0) ?? '');

/** The collapsed single line: what the wait was waiting for / what it ended in. */
const mainLine = computed(() => {
  if (status.value === 'running') {
    return taskId.value
      ? t('tools.waitfor.waitingTask', { id: taskId.value })
      : t('tools.waitfor.waitingAny');
  }
  if (status.value === 'error') return firstOutputLine.value;
  const parsed = full.value;
  if (!parsed) return taskId.value ?? firstOutputLine.value;
  switch (parsed.status) {
    case 'completed':
      return parsed.finishedDescription ?? parsed.taskId ?? '';
    case 'timed_out':
      return parsed.runningCount > 0
        ? t('tools.waitfor.stillRunning', { count: parsed.runningCount })
        : t('tools.waitfor.timedOut');
    case 'no_tasks':
      return t('tools.waitfor.noTasks');
  }
});

const duration = computed(() => {
  const parsed = full.value;
  if (!parsed || parsed.status === 'no_tasks') return '';
  const waited = formatDuration(parsed.waitedMs);
  return waited.length > 0 ? waited : '';
});

const time = computed(() => duration.value || props.tool.timing || '');

/** Expanded summary ("glance"): main line + sub lines. Null when nothing extra
    to show beyond the collapsed line and the raw output. */
const glance = computed<{ main: string; subs: string[] } | null>(() => {
  const parsed = full.value;
  if (!parsed) return null;
  if (parsed.status === 'completed') {
    const main = [parsed.taskId, statusLabel(parsed.finishedStatus)].filter(Boolean).join(' · ');
    const subs: string[] = [];
    if (parsed.finishedDescription) subs.push(parsed.finishedDescription);
    const counts: string[] = [];
    if (parsed.extraCount > 0) {
      counts.push(t('tools.waitfor.moreFinished', { count: parsed.extraCount }));
    }
    if (parsed.runningCount > 0) {
      counts.push(t('tools.waitfor.stillRunning', { count: parsed.runningCount }));
    }
    if (counts.length > 0) subs.push(counts.join(' · '));
    const samples = runningSamplesLine(parsed);
    if (samples !== null) subs.push(samples);
    return { main, subs };
  }
  if (parsed.status === 'timed_out') {
    if (parsed.runningCount === 0 && parsed.extraCount === 0) return null;
    const main = parsed.runningCount > 0
      ? t('tools.waitfor.stillRunning', { count: parsed.runningCount })
      : t('tools.waitfor.moreFinished', { count: parsed.extraCount });
    const subs: string[] = [];
    if (parsed.runningCount > 0 && parsed.extraCount > 0) {
      subs.push(t('tools.waitfor.moreFinished', { count: parsed.extraCount }));
    }
    const samples = runningSamplesLine(parsed);
    if (samples !== null) subs.push(samples);
    return { main, subs };
  }
  return null; // no_tasks — the explanation text stays in the raw output
});

function runningSamplesLine(parsed: WaitForParse): string | null {
  if (parsed.runningSamples.length === 0) return null;
  const parts = [...parsed.runningSamples];
  const more = parsed.runningCount - parsed.runningSamples.length;
  if (more > 0) parts.push(t('tools.waitfor.moreRunning', { count: more }));
  return parts.join(', ');
}

const hasOutput = computed(() => !!props.tool.output && props.tool.output.length > 0);
const canExpand = computed(() => glance.value !== null || hasOutput.value);
// Persist the user's manual open/closed choice across row eviction (see
// ChatPane's toolExpandState).
const toolExpandState = inject<Map<string, boolean>>('toolExpandState');
const expandKey = props.tool.id;
const persisted = expandKey ? toolExpandState?.get(expandKey) : undefined;
const open = ref(persisted ?? (props.tool.defaultExpanded === true && canExpand.value));

function toggle(): void {
  if (!canExpand.value) return;
  open.value = !open.value;
  if (expandKey && toolExpandState) toolExpandState.set(expandKey, open.value);
}

watch(
  () => [props.tool.defaultExpanded, props.tool.output?.length, props.tool.status] as const,
  () => {
    if (props.tool.defaultExpanded === true && canExpand.value) open.value = true;
  },
);
</script>

<template>
  <ToolRow
    :status="status"
    :icon="toolGlyph(tool.name)"
    :name="toolLabel(tool.name)"
    :arg="mainLine"
    :time="time"
    :open="open"
    :expandable="canExpand"
    @toggle="toggle"
  >
    <template #trailing>
      <Badge
        v-if="full?.status === 'timed_out'"
        variant="warning"
        size="sm"
      >{{ t('tools.waitfor.timedOut') }}</Badge>
      <Badge
        v-else-if="full?.status === 'completed' && full.finishedStatus"
        :variant="statusVariant(full.finishedStatus)"
        size="sm"
      >{{ statusLabel(full.finishedStatus) }}</Badge>
    </template>
    <ToolPanel scroll>
      <div v-if="glance" class="wf-glance">
        <div class="wf-main">{{ glance.main }}</div>
        <div v-for="(sub, i) in glance.subs" :key="i" class="wf-sub">{{ sub }}</div>
      </div>
      <ToolOutputBlock v-if="hasOutput" :lines="tool.output" />
    </ToolPanel>
  </ToolRow>
</template>

<style scoped>
.wf-glance {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}
.wf-main {
  color: var(--color-text);
  font-weight: var(--weight-medium);
}
.wf-sub {
  color: var(--color-text-muted);
}
</style>