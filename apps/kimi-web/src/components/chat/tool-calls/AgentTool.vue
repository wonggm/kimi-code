<!-- apps/kimi-web/src/components/chat/tool-calls/AgentTool.vue -->
<!-- The single-subagent `Agent` tool, rendered as upstream's card: the agent
     glyph, the description as the title, the muted `Foreground · coder` mode
     line, the `saved-result` control, the result body behind it or the head's
     disclosure, and upstream's right-hand go-slot: an arrow into the
     subagent's live progress in the detail panel when the card links to a
     task, the disclosure chevron otherwise. -->
<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FilePreviewRequest, ToolCall, ToolMedia } from '../../../types';
import { toolLabel } from '../../../lib/toolMeta';
import type { DetachTaskTarget } from '../../../lib/detachTarget';
import Icon from '../../ui/Icon.vue';
import StatusDot from '../../ui/StatusDot.vue';
import ToolOutputBlock from './ToolOutputBlock.vue';

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
const canExpand = computed(() => hasOutput.value);
// Persist the user's manual open/closed choice across row eviction (see
// ChatPane's toolExpandState); the persisted value overrides the default on
// re-mount, while the auto-expand watch below keeps its existing behavior for
// running tools.
const toolExpandState = inject<Map<string, boolean>>('toolExpandState');
const expandKey = props.tool.id;
const persisted = expandKey ? toolExpandState?.get(expandKey) : undefined;
const open = ref(persisted ?? (props.tool.defaultExpanded === true && canExpand.value));

const status = computed<'running' | 'ok' | 'error'>(() => props.tool.status as 'running' | 'ok' | 'error');
const statusLabel = computed(() => t(`tools.agent.status.${status.value}`));
const title = computed(() => input.value.description || input.value.subagentType || toolLabel(props.tool.name));

// Show the go-slot's arrow only when a live/background subagent task matches
// this tool call (e.g. a completed foreground subagent after a page refresh has
// none) — otherwise the arrow would emit into a panel that silently no-ops, so
// the slot falls back to the disclosure chevron.
const resolveAgentTaskId = inject<(toolCallId: string) => string | undefined>('resolveAgentTaskId');
const canOpenAgent = computed(() => {
  if (!resolveAgentTaskId) return true;
  return resolveAgentTaskId(props.tool.id) !== undefined;
});

// The subagent's task, when a live/background one matches this tool call.
const resolveAgentTask = inject<(toolCallId: string) => unknown | undefined>('resolveAgentTask');
const agentTask = computed(() => {
  if (!resolveAgentTask) return undefined;
  const task = resolveAgentTask(props.tool.id) as
    | { runInBackground?: boolean; agentId?: string }
    | undefined;
  return task ?? undefined;
});
// The task is the live truth once it exists (a detached foreground subagent
// flips to background without its args changing); before that the launch args
// carry the mode.
const runInBackground = computed(
  () => agentTask.value?.runInBackground ?? (input.value.runInBackground === true),
);
const subtitle = computed(() =>
  [
    runInBackground.value ? t('tools.agent.background') : t('tools.agent.foreground'),
    input.value.description ? input.value.subagentType : '',
  ]
    .filter(Boolean)
    .join(' · '),
);
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
  <div class="agent-card" :class="{ err: status === 'error' }">
    <div class="head-row">
      <button
        class="head"
        type="button"
        :disabled="!canExpand"
        :aria-expanded="open"
        @click="toggle"
      >
        <span class="lead" aria-hidden="true"><Icon name="robot" size="sm" /></span>
        <span class="main">
          <span class="task">{{ title }}</span>
          <span v-if="subtitle" class="type">{{ subtitle }}</span>
        </span>
        <span class="tail">
          <span class="st" :class="status" role="status" :aria-label="statusLabel">
            <Icon v-if="status === 'ok'" name="check" size="sm" />
            <Icon v-else-if="status === 'error'" name="close" size="sm" />
            <StatusDot v-else status="running" />
          </span>
        </span>
      </button>
      <button
        v-if="canDetach"
        type="button"
        class="at-action"
        @click.stop="emit('detachTask', { toolCallId: tool.id, agentId: agentTask?.agentId })"
      >
        {{ t('tasks.sendToBackground') }}
      </button>
      <!-- Upstream's go-slot: one right-hand control, an arrow into the agent's
           pane when the card links to one and the disclosure chevron otherwise.
           The arrow carries the Open label as its accessible name. -->
      <button
        v-if="canOpenAgent"
        type="button"
        class="go-slot"
        :aria-label="t('tasks.openDetail')"
        @click.stop="emit('openAgent', tool.id)"
      >
        <Icon class="go" name="arrow-right" size="sm" />
      </button>
      <span v-else class="go-slot" aria-hidden="true" @click="toggle">
        <Icon v-if="canExpand" class="go car" :class="{ open }" name="chevron-right" size="sm" />
      </span>
    </div>
    <!-- Upstream's `saved-result` control. Upstream gates it on the card having
         a linked agent (`tool.agentId`, which it reads from the transcript
         frame's `agentRefs`); the fork never sees that field, so it shows the
         control wherever there is a result body to reveal. -->
    <button
      v-if="hasOutput"
      type="button"
      class="saved-result"
      :aria-expanded="open"
      @click="toggle"
    >
      <Icon class="saved-result__chevron" :class="{ open }" name="chevron-right" size="sm" />
      <span>{{ t('tools.output.saved') }}</span>
    </button>
    <div v-if="open && hasOutput" class="result">
      <ToolOutputBlock :lines="tool.output" />
    </div>
  </div>
</template>

<style scoped>
.agent-card {
  margin: var(--space-1) 0;
  background: var(--color-surface-raised);
  border: 0.5px solid var(--color-line);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: border-color var(--duration-base) var(--ease-out);
}
.agent-card:hover { border-color: var(--color-line-strong); }
.agent-card.err { border-color: color-mix(in srgb, var(--color-danger) 45%, var(--color-bg)); }
.head-row { display: flex; align-items: center; }
.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 1;
  min-width: 0;
  padding: var(--space-2) var(--space-3);
  border: none;
  background: transparent;
  color: var(--color-text);
  font-family: var(--font-ui);
  text-align: left;
  cursor: pointer;
}
.head:disabled { cursor: default; }
.head:focus-visible { outline: none; box-shadow: var(--p-focus-ring); }
.lead {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md);
  background: var(--color-surface-sunken);
  color: var(--color-text-muted);
  flex: none;
}
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.task {
  font-size: var(--ui-font-size);
  /* Upstream's `--leading-caption`. */
  line-height: 1.4;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.type {
  font-size: var(--text-xs);
  line-height: 1.4;
  color: var(--color-text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tail { display: flex; align-items: center; gap: var(--space-2); flex: none; }
.st { display: inline-flex; align-items: center; }
.st.ok { color: var(--color-success); }
.st.error { color: var(--color-danger); }
.go-slot {
  display: inline-flex;
  align-items: center;
  /* Upstream's span box: the resets below only neutralise the button element
     the arrow branch needs for its accessible name and keyboard access. */
  padding: 0 var(--space-3) 0 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  flex: none;
}
.go-slot:focus-visible { outline: none; box-shadow: var(--p-focus-ring); }
.go { color: var(--color-text-faint); transition: color var(--duration-base) var(--ease-out); }
.car { transition: transform var(--duration-base) var(--ease-out); }
.car.open { transform: rotate(90deg); }
.agent-card:hover .head:not(:disabled) .go { color: var(--color-text); }
.at-action {
  flex: none;
  margin-right: var(--space-1);
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
.result { padding: var(--space-2) var(--space-3); }
.saved-result {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: none;
  border-top: 0.5px solid var(--color-line);
  background: transparent;
  color: var(--color-text-faint);
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  text-align: left;
  cursor: pointer;
}
.saved-result:hover { color: var(--color-text-muted); }
.saved-result:focus-visible { outline: none; box-shadow: var(--p-focus-ring); }
.saved-result__chevron { transition: transform var(--duration-base) var(--ease-out); }
.saved-result__chevron.open { transform: rotate(90deg); }
</style>
