<!-- apps/kimi-web/src/components/chat/tool-calls/GenericTool.vue -->
<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import type { FilePreviewRequest, ToolCall, ToolMedia } from '../../../types';
import { toolChip, toolGlyph, toolLabel, toolSummary } from '../../../lib/toolMeta';
import type { DetachTaskTarget } from '../../../lib/detachTarget';
import { useI18n } from 'vue-i18n';
import ToolRow from '../ToolRow.vue';
import ToolOutputBlock from './ToolOutputBlock.vue';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    tool: ToolCall;
    mobile?: boolean;
    stackPosition?: 'single' | 'first' | 'middle' | 'last';
    toolDiffPanel?: boolean;
  }>(),
  { mobile: false, stackPosition: 'single', toolDiffPanel: false },
);

const emit = defineEmits<{
  openMedia: [media: ToolMedia];
  openFile: [target: FilePreviewRequest];
  openToolDiff: [id: string];
  /** Send this running foreground bash command to the background (ctrl+b parity). */
  detachTask: [target: DetachTaskTarget];
}>();

const isRunningBash = computed(
  () => props.tool.status === 'running' && /^bash$/i.test(props.tool.name),
);
// Parsed bash args: the detach button needs the exact command (the engine task
// is resolved by matching it against REST /tasks) and skips already-background
// launches.
interface BashInput {
  command?: string;
  runInBackground?: boolean;
}
const bashInput = computed<BashInput>(() => {
  if (!isRunningBash.value) return {};
  try {
    const obj = JSON.parse(props.tool.arg) as Record<string, unknown>;
    return {
      command: typeof obj['command'] === 'string' ? obj['command'] : undefined,
      runInBackground: obj['run_in_background'] === true,
    };
  } catch {
    return {};
  }
});
const canDetach = computed(() => isRunningBash.value && bashInput.value.runInBackground !== true);
const hasOutput = computed(() => !!props.tool.output && props.tool.output.length > 0);
const canExpand = computed(() => hasOutput.value || isRunningBash.value);
// Persist the user's manual open/closed choice across row eviction (see
// ChatPane's toolExpandState): a re-mounted card would otherwise re-render in
// its default state, changing the row's height. Keyed by tool id (unique per
// session); the persisted value overrides the default on re-mount, while the
// auto-expand watch below keeps its existing behavior for running tools.
const toolExpandState = inject<Map<string, boolean>>('toolExpandState');
const expandKey = props.tool.id;
const persisted = expandKey ? toolExpandState?.get(expandKey) : undefined;
const open = ref(persisted ?? (props.tool.defaultExpanded === true && canExpand.value));

const status = computed<'running' | 'ok' | 'error'>(() => props.tool.status as 'running' | 'ok' | 'error');
const label = computed(() => toolLabel(props.tool.name));
const glyph = computed(() => toolGlyph(props.tool.name));
const summary = computed(() => toolSummary(props.tool.name, props.tool.arg));
const summaryFull = computed(() => toolSummary(props.tool.name, props.tool.arg, true));
const chip = computed(() =>
  toolChip({
    name: props.tool.name,
    arg: props.tool.arg,
    output: props.tool.output,
    timing: props.tool.timing,
    status: props.tool.status,
  }),
);

function toggle(): void {
  if (!canExpand.value) return;
  open.value = !open.value;
  if (expandKey && toolExpandState) toolExpandState.set(expandKey, open.value);
}

watch(
  () => [props.tool.defaultExpanded, props.tool.output?.length, props.tool.status, props.tool.name] as const,
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
    :time="tool.name !== 'bash' ? tool.timing : ''"
    :open="open"
    :expandable="canExpand"
    :stacked="stackPosition !== 'single'"
    :stack-position="stackPosition"
    @toggle="toggle"
  >
    <template #trailing>
      <span v-if="chip" class="chip">{{ chip }}</span>
      <button v-if="canDetach" type="button" class="gt-detach" @click.stop="emit('detachTask', { toolCallId: tool.id, command: bashInput.command })">
        {{ t('tasks.sendToBackground') }}
      </button>
    </template>
    <div v-if="summaryFull" class="bb-summary">{{ summaryFull }}</div>
    <ToolOutputBlock :lines="tool.output" empty-text="Waiting for output…" />
  </ToolRow>
</template>

<style scoped>
.bb-summary {
  color: var(--color-text);
  border-bottom: 1px dashed var(--color-line);
  padding-bottom: 6px;
  margin-bottom: 6px;
  word-break: break-all;
}
.chip {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  flex: none;
}
.gt-detach {
  flex: none;
  background: none;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-xs);
  color: var(--color-text-muted);
  font: var(--text-xs) var(--font-ui);
  padding: 1px 7px;
  cursor: pointer;
}
.gt-detach:hover {
  color: var(--color-text);
  background: var(--color-surface-sunken);
}
</style>
