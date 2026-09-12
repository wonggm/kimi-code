<!-- apps/kimi-web/src/components/chat/tool-calls/EditTool.vue -->
<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import type { DiffViewLine, FilePreviewRequest, ToolCall, ToolMedia } from '../../../types';
import { diffStats } from '../../../lib/diffLines';
import { buildEditDiffLines } from '../../../lib/toolDiff';
import { toolGlyph, toolHeadParts, toolLabel, toolSummary } from '../../../lib/toolMeta';
import ToolRow from '../ToolRow.vue';
import ToolOutputBlock from './ToolOutputBlock.vue';

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
}>();

const status = computed<'running' | 'ok' | 'error'>(() => props.tool.status as 'running' | 'ok' | 'error');
const label = computed(() => toolLabel(props.tool.name));
const glyph = computed(() => toolGlyph(props.tool.name));
const summary = computed(() => toolSummary(props.tool.name, props.tool.arg));
const summaryFull = computed(() => toolSummary(props.tool.name, props.tool.arg, true));
const head = computed(() => toolHeadParts(props.tool.name, props.tool.arg));

const editDiff = computed<DiffViewLine[] | null>(() => buildEditDiffLines(props.tool));
// Upstream prints the pair as two spans with a proportion bar rather than one
// chip, so the counts ride on the row's `diff` prop and the chip stays for the
// cases with no counts to show.
const diffCounts = computed(() => {
  const diff = editDiff.value;
  if (!diff || props.tool.status === 'error') return undefined;
  const { added, removed } = diffStats(diff);
  return added || removed ? { add: added, del: removed } : undefined;
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
    :file="head.file"
    :dir="head.dir"
    :mono="head.mono"
    :diff="diffCounts"
    :arg="!open ? summary : ''"
    :time="tool.timing"
    :open="open"
    :expandable="canExpand || toolDiffPanel"
    @toggle="toggle"
  >
    <template #trailing>
      
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
</style>
