<!-- apps/kimi-web/src/components/chat/tool-calls/AgentTool.vue -->
<!-- The single-subagent `Agent` tool, rendered as a normal tool card: the fixed
     args (description / prompt) and final result show here when expanded, while
     the subagent's LIVE progress streams in the right-side detail panel. The
     trailing "Open" button jumps to that panel. -->
<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FilePreviewRequest, ToolCall, ToolMedia } from '../../../types';
import { toolGlyph, toolLabel } from '../../../lib/toolMeta';
import type { DetachTaskTarget } from '../../../lib/detachTarget';
import Badge from '../../ui/Badge.vue';
import ToolRow from '../ToolRow.vue';

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
  prompt?: string;
}

function parseAgentInput(arg: string): AgentInput {
  if (!arg) return {};
  try {
    const obj = JSON.parse(arg) as Record<string, unknown>;
    return {
      description: typeof obj['description'] === 'string' ? obj['description'] : undefined,
      subagentType: typeof obj['subagent_type'] === 'string' ? obj['subagent_type'] : undefined,
      prompt: typeof obj['prompt'] === 'string' ? obj['prompt'] : undefined,
    };
  } catch {
    return {};
  }
}

const input = computed(() => parseAgentInput(props.tool.arg));
const hasOutput = computed(() => !!props.tool.output && props.tool.output.length > 0);
const canExpand = computed(
  () => Boolean(input.value.prompt) || Boolean(input.value.subagentType) || hasOutput.value,
);
// Persist the user's manual open/closed choice across row eviction (see
// ChatPane's toolExpandState); the persisted value overrides the default on
// re-mount, while the auto-expand watch below keeps its existing behavior for
// running tools.
const toolExpandState = inject<Map<string, boolean>>('toolExpandState');
const expandKey = props.tool.id;
const persisted = expandKey ? toolExpandState?.get(expandKey) : undefined;
const open = ref(persisted ?? (props.tool.defaultExpanded === true && canExpand.value));

const status = computed<'running' | 'ok' | 'error'>(() => props.tool.status as 'running' | 'ok' | 'error');
const label = computed(() => toolLabel(props.tool.name));
const glyph = computed(() => toolGlyph(props.tool.name));
const summary = computed(() => input.value.description || input.value.subagentType || '');

// Hide the "Open detail" button when no live/background subagent task matches
// this tool call (e.g. a completed foreground subagent after a page refresh) —
// otherwise the button emits into a panel that silently no-ops.
const resolveAgentTaskId = inject<(toolCallId: string) => string | undefined>('resolveAgentTaskId');
const canOpenAgent = computed(() => {
  if (!resolveAgentTaskId) return true;
  return resolveAgentTaskId(props.tool.id) !== undefined;
});

// Foreground/background mode label for this card's subagent (undefined when no
// matching task exists — same fallback as the Open-detail button).
const resolveAgentTask = inject<(toolCallId: string) => unknown | undefined>('resolveAgentTask');
const agentTask = computed(() => {
  if (!resolveAgentTask) return undefined;
  const task = resolveAgentTask(props.tool.id) as
    | { runInBackground?: boolean; agentId?: string }
    | undefined;
  return task ?? undefined;
});
// Detach is only meaningful while the subagent still runs in the foreground.
const canDetach = computed(
  () => status.value === 'running' && agentTask.value?.runInBackground === false,
);

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
    :icon="glyph"
    :name="label"
    :arg="!open ? summary : ''"
    :time="tool.timing"
    :open="open"
    :expandable="canExpand"
    @toggle="toggle"
  >
    <template #trailing>
      <Badge
        v-if="agentTask"
        variant="neutral"
        size="sm"
        class="at-mode"
      >{{ agentTask.runInBackground ? t('tools.agent.background') : t('tools.agent.foreground') }}</Badge>
      <button v-if="canDetach" type="button" class="at-open" @click.stop="emit('detachTask', { toolCallId: tool.id, agentId: agentTask?.agentId })">
        {{ t('tasks.sendToBackground') }}
      </button>
      <button v-if="canOpenAgent" type="button" class="at-open" @click.stop="emit('openAgent', tool.id)">
        {{ t('tasks.openDetail') }}
      </button>
    </template>
    <div v-if="input.subagentType" class="at-type">{{ input.subagentType }}</div>
    <div v-if="input.prompt" class="at-task">{{ input.prompt }}</div>
    <div v-if="hasOutput" class="bb-code">
      <div v-for="(line, i) in tool.output ?? []" :key="i">{{ line }}</div>
    </div>
  </ToolRow>
</template>

<style scoped>
.at-open {
  flex: none;
  background: none;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-xs);
  color: var(--color-text-muted);
  font: var(--text-xs) var(--font-ui);
  padding: 1px 7px;
  cursor: pointer;
}
.at-open:hover {
  color: var(--color-text);
  background: var(--color-surface-sunken);
}
.at-mode {
  flex: none;
}
.at-type {
  font: var(--text-xs) var(--font-mono);
  color: var(--color-text-muted);
  margin-bottom: 6px;
}
.at-task {
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
}
.at-task + .bb-code {
  margin-top: 10px;
}
.bb-code {
  padding: 11px 13px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
}
</style>
