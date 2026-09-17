<!-- apps/kimi-web/src/components/chat/tool-calls/AgentTool.vue -->
<!-- The single-subagent `Agent` tool: a tool line labelled by the agent's mode
     ("Agent" / "Background Agent") over a card with the robot avatar, the
     description as the title and the muted `coder · model` line, plus the
     result behind the disclosure. The card is the detail panel's entry point
     whenever a live task matches this tool call. -->
<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FilePreviewRequest, ToolCall, ToolMedia } from '../../../types';
import { toolGlyph, toolLabel } from '../../../lib/toolMeta';
import type { DetachTaskTarget } from '../../../lib/detachTarget';
import Icon from '../../ui/Icon.vue';
import Spinner from '../../ui/Spinner.vue';
import ToolRow from '../ToolRow.vue';
import ToolOutputBlock from './ToolOutputBlock.vue';
import ToolPanel from './ToolPanel.vue';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    tool: ToolCall;
    mobile?: boolean;
    toolDiffPanel?: boolean;
  }>(),
  { mobile: false, toolDiffPanel: false },
);

const emit = defineEmits<{
  openMedia: [media: ToolMedia];
  openFile: [target: FilePreviewRequest];
  openToolDiff: [id: string];
  /** Open this subagent's live progress in the right-side detail panel. */
  openAgent: [toolCallId: string];
  /** Send this running foreground subagent to the background (ctrl+b parity). */
  detachTask: [target: DetachTaskTarget];
}>();

interface AgentInput {
  description?: string;
  subagentType?: string;
  runInBackground: boolean;
}

function parseAgentInput(arg: string): AgentInput {
  if (!arg) return { runInBackground: false };
  try {
    const obj = JSON.parse(arg) as Record<string, unknown>;
    return {
      description: typeof obj['description'] === 'string' ? obj['description'] : undefined,
      subagentType: typeof obj['subagent_type'] === 'string' ? obj['subagent_type'] : undefined,
      runInBackground: obj['run_in_background'] === true,
    };
  } catch {
    return { runInBackground: false };
  }
}

const input = computed(() => parseAgentInput(props.tool.arg));
const hasOutput = computed(() => !!props.tool.output && props.tool.output.length > 0);
// Persist the user's manual open/closed choice across row eviction (see
// ChatPane's toolExpandState); the persisted value overrides the default on
// re-mount.
const toolExpandState = inject<Map<string, boolean>>('toolExpandState');
const expandKey = props.tool.id;
const persisted = expandKey ? toolExpandState?.get(expandKey) : undefined;
const open = ref(persisted ?? props.tool.defaultExpanded === true);

const toolStatus = computed<'running' | 'ok' | 'error'>(() => props.tool.status as 'running' | 'ok' | 'error');
const title = computed(() => input.value.description || input.value.subagentType || toolLabel(props.tool.name));
const glyph = computed(() => toolGlyph(props.tool.name));

// The card is the detail panel's entry point only when a live/background
// subagent task matches this tool call (e.g. a completed foreground subagent
// after a page refresh has none); otherwise the card is inert text.
const resolveAgentTaskId = inject<(toolCallId: string) => string | undefined>('resolveAgentTaskId');
const agentTaskId = computed(() => resolveAgentTaskId?.(props.tool.id));
const canOpenAgent = computed(() => (resolveAgentTaskId ? agentTaskId.value !== undefined : true));

// The subagent's task, when a live/background one matches this tool call.
const resolveAgentTask = inject<(toolCallId: string) => unknown | undefined>('resolveAgentTask');
const agentTask = computed(() => {
  if (!resolveAgentTask) return undefined;
  const task = resolveAgentTask(props.tool.id) as
    | { runInBackground?: boolean; state?: string; model?: string; agentId?: string }
    | undefined;
  return task ?? undefined;
});
// The task is the live truth once it exists (a detached foreground subagent
// flips to background without its args changing); before that the launch args
// carry the mode.
const runInBackground = computed(
  () => agentTask.value?.runInBackground ?? (input.value.runInBackground === true),
);

const status = computed<'running' | 'ok' | 'error'>(() => {
  if (input.value.runInBackground !== true) return toolStatus.value;
  switch (agentTask.value?.state) {
    case 'run':
      return 'running';
    case 'done':
      return 'ok';
    case 'fail':
    case 'cancel':
      return 'error';
    default:
      return toolStatus.value;
  }
});

const modeLabel = computed(() =>
  runInBackground.value ? t('tools.agent.backgroundAgent') : t('tools.agent.foregroundAgent'),
);
const doneCount = computed(() => (status.value === 'ok' ? 1 : 0));

const modelLine = computed(() => {
  const model = agentTask.value?.model;
  const alias =
    typeof model === 'string' && model.length > 0
      ? model.slice(model.lastIndexOf('/') + 1)
      : '';
  return [input.value.description ? input.value.subagentType : '', alias].filter(Boolean).join(' · ');
});

// Detach is only meaningful while the subagent still runs in the foreground.
const canDetach = computed(
  () => toolStatus.value === 'running' && agentTask.value?.runInBackground === false,
);

function toggle(): void {
  open.value = !open.value;
  if (expandKey && toolExpandState) toolExpandState.set(expandKey, open.value);
}

function onCardClick(): void {
  if (agentTaskId.value === undefined) return;
  emit('openAgent', agentTaskId.value);
}

watch(
  () => [props.tool.defaultExpanded, props.tool.status] as const,
  () => {
    if (props.tool.defaultExpanded === true) open.value = true;
  },
);
</script>

<template>
  <ToolRow
    :status="status"
    :icon="glyph"
    :name="modeLabel"
    :faint="`${doneCount} / 1`"
    :open="open"
    expandable
    @toggle="toggle"
  >
    <template #trailing>
      <button
        v-if="canDetach"
        type="button"
        class="at-action"
        @click.stop="emit('detachTask', { toolCallId: tool.id, agentId: agentTask?.agentId })"
      >
        {{ t('tasks.sendToBackground') }}
      </button>
    </template>
    <ToolPanel>
      <component
        :is="canOpenAgent ? 'button' : 'div'"
        class="ag-card"
        :class="{ clickable: canOpenAgent }"
        :type="canOpenAgent ? 'button' : undefined"
        :aria-label="canOpenAgent ? t('tasks.openDetail') : undefined"
        @click="onCardClick"
      >
        <span class="ag-avatar" aria-hidden="true"><Icon name="robot" size="lg" /></span>
        <span class="ag-text">
          <span class="ag-title">{{ title }}</span>
          <span v-if="modelLine" class="ag-model">{{ modelLine }}</span>
        </span>
        <Spinner v-if="status === 'running'" size="xs" class="ag-spin" />
      </component>
      <ToolOutputBlock v-if="hasOutput" :lines="tool.output" />
    </ToolPanel>
  </ToolRow>
</template>

<style scoped>
.ag-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-width: 0;
  padding: 0;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  text-align: left;
  font-family: inherit;
  font-size: inherit;
  color: inherit;
}
.ag-card.clickable { cursor: pointer; }
.ag-card:focus-visible { outline: none; box-shadow: var(--p-focus-ring); }
.ag-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: var(--color-subtle);
  color: var(--color-text);
}
.ag-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  font-family: var(--font-ui);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
}
.ag-title {
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ag-model {
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ag-spin { color: var(--color-text); flex: none; }
.at-action {
  flex: none;
  padding: 1px 7px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-xs);
  background: none;
  color: var(--color-text-muted);
  font: var(--text-xs) var(--font-ui);
  cursor: pointer;
}
.at-action:hover {
  color: var(--color-text);
  background: var(--color-surface-sunken);
}
</style>
