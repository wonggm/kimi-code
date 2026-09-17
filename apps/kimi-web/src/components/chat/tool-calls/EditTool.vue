<!-- apps/kimi-web/src/components/chat/tool-calls/EditTool.vue -->
<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import type { DiffViewLine, FilePreviewRequest, ToolCall, ToolMedia } from '../../../types';
import { diffStats } from '../../../lib/diffLines';
import { buildEditDiffLines } from '../../../lib/toolDiff';
import { toolGlyph, toolHeadParts, toolLabel, toolSummary } from '../../../lib/toolMeta';
import ToolRow from '../ToolRow.vue';
import ToolOutputBlock from './ToolOutputBlock.vue';
import ToolPanel from './ToolPanel.vue';

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
const head = computed(() => toolHeadParts(props.tool.name, props.tool.arg));
const fullPath = computed(() => toolSummary(props.tool.name, props.tool.arg, true));
const filePath = computed(() =>
  head.value.file ? (head.value.dir ? `${head.value.dir}/${head.value.file}` : head.value.file) : '',
);
const leadDir = computed(() => (head.value.dir ? `${head.value.dir}/` : ''));

const editDiff = computed<DiffViewLine[] | null>(() => buildEditDiffLines(props.tool));
// Upstream prints the pair twice from the same counts: as the row's trailing
// pair (`tl-add` / `tl-del`) while the card is closed, and as the opened card's
// `ed-stats`.
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
    :file="open ? '' : head.file"
    :dir="open ? '' : leadDir"
    :mono="head.mono"
    :diff="open ? undefined : diffCounts"
    :arg="!open ? summary : ''"
    :time="tool.timing"
    :open="open"
    :expandable="canExpand || toolDiffPanel"
    @toggle="toggle"
  >
    <ToolPanel flush scroll>
      <template #head>
        <span class="ed-head">
          <span class="ed-path">
            <span v-if="head.dir" class="ed-dir">{{ head.dir }}/</span>
            <button
              v-if="head.file"
              type="button"
              class="ed-file ed-open"
              @click.stop="emit('openFile', { path: filePath })"
            >{{ head.file }}</button>
            <span v-else class="ed-file">{{ fullPath }}</span>
          </span>
          <span v-if="diffCounts" class="ed-stats">
            <span v-if="diffCounts.add > 0" class="ed-add">+{{ diffCounts.add }}</span>
            <span v-if="diffCounts.del > 0" class="ed-del">−{{ diffCounts.del }}</span>
          </span>
        </span>
      </template>
      <ToolOutputBlock :lines="tool.output" empty-text="Waiting for output…" />
    </ToolPanel>
  </ToolRow>
</template>

<style scoped>
.ed-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 1;
  gap: var(--space-2);
  min-width: 0;
}
.ed-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ed-dir { color: var(--color-text-faint); }
.ed-file { color: var(--color-text); }
.ed-open {
  padding: 0;
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  font: inherit;
  cursor: pointer;
}
.ed-open:hover { color: var(--color-accent); text-decoration: underline; text-underline-offset: 3px; }
.ed-open:focus-visible { outline: none; box-shadow: var(--p-focus-ring); }
.ed-stats {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  flex: none;
}
.ed-add { color: var(--color-success); }
.ed-del { color: var(--color-danger); }
</style>
