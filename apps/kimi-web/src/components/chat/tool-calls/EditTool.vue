<!-- apps/kimi-web/src/components/chat/tool-calls/EditTool.vue -->
<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import type { DiffViewLine, FilePreviewRequest, ToolCall, ToolMedia } from '../../../types';
import { diffStats } from '../../../lib/diffLines';
import { buildEditDiffLines } from '../../../lib/toolDiff';
import { toolGlyph, toolLabel, toolSummary } from '../../../lib/toolMeta';
import ToolRow from '../ToolRow.vue';
import ToolOutputBlock from './ToolOutputBlock.vue';

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
}>();

const status = computed<'running' | 'ok' | 'error'>(() => props.tool.status as 'running' | 'ok' | 'error');
const label = computed(() => toolLabel(props.tool.name));
const glyph = computed(() => toolGlyph(props.tool.name));
const summary = computed(() => toolSummary(props.tool.name, props.tool.arg));
const summaryFull = computed(() => toolSummary(props.tool.name, props.tool.arg, true));

const editDiff = computed<DiffViewLine[] | null>(() => buildEditDiffLines(props.tool));
const chip = computed(() => {
  const diff = editDiff.value;
  if (diff && props.tool.status !== 'error') {
    const { added, removed } = diffStats(diff);
    if (added || removed) return `+${added} −${removed}`;
  }
  return '';
});

const hasOutput = computed(() => !!props.tool.output && props.tool.output.length > 0);
// Persist the user's manual open/closed choice across row eviction (see
// ChatPane's toolExpandState): Edit cards default closed, so without this a
// re-mounted card would collapse even if the user had it open.
const toolExpandState = inject<Map<string, boolean>>('toolExpandState');
const expandKey = props.tool.id;
const persisted = expandKey ? toolExpandState?.get(expandKey) : undefined;
const open = ref(persisted ?? false);
const canExpand = computed(() => hasOutput.value && !props.toolDiffPanel);

function toggle(): void {
  if (props.toolDiffPanel) {
    emit('openToolDiff', props.tool.id);
    return;
  }
  if (hasOutput.value) {
    open.value = !open.value;
    if (expandKey && toolExpandState) toolExpandState.set(expandKey, open.value);
  }
}
</script>

<template>
  <ToolRow
    :status="status"
    :icon="glyph"
    :name="label"
    :arg="!open ? summary : ''"
    :time="tool.timing"
    :open="open"
    :expandable="canExpand || toolDiffPanel"
    :stacked="stackPosition !== 'single'"
    :stack-position="stackPosition"
    @toggle="toggle"
  >
    <template #trailing>
      <span v-if="chip" class="chip">{{ chip }}</span>
    </template>
    <div v-if="summaryFull" class="bb-summary">{{ summaryFull }}</div>
    <ToolOutputBlock :lines="tool.output" empty-text="Waiting for output…" />
  </ToolRow>
</template>

<style scoped>
.chip {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  flex: none;
}
.bb-summary {
  color: var(--color-text);
  border-bottom: 1px dashed var(--color-line);
  padding-bottom: 6px;
  margin-bottom: 6px;
  word-break: break-all;
}
</style>
