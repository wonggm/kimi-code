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
function sign(line: DiffViewLine): string {
  return line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';
}
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
const canExpand = computed(
  () => (hasOutput.value || (editDiff.value?.length ?? 0) > 0) && !props.toolDiffPanel,
);

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
      </template>
      <div v-if="editDiff && editDiff.length > 0" class="hl-code" style="--gutter-ch: 4ch">
        <div class="hl-body">
          <div
            v-for="(line, i) in editDiff"
            :key="i"
            class="hl-row"
            :class="`row-${line.type}`"
          >
            <span class="hl-sign">{{ sign(line) }}</span>
            <span class="hl-text">{{ line.text }}</span>
          </div>
        </div>
      </div>
      <ToolOutputBlock v-else :lines="tool.output" empty-text="Waiting for output…" />
    </ToolPanel>
  </ToolRow>
</template>

<style scoped>
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
.ed-add { color: var(--color-diff-add-fg); }
.ed-del { color: var(--color-diff-del-fg); }

/* The opened body is upstream's shared code renderer in its `lines` shape,
   unframed (no well of its own over the panel body) and without line numbers,
   so the rows carry the sign column only and the element keeps the renderer's
   4ch gutter floor. Its tool panel raises the renderer's code size to the prose
   size here, hence --content-font-size. */
.hl-code {
  border: var(--p-hairline) solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-well);
  overflow: auto;
  max-height: calc(24 * 1.5 * var(--ui-font-size));
  overscroll-behavior: contain;
  font-family: var(--font-mono);
  font-size: var(--content-font-size);
  line-height: 1.571;
  font-feature-settings: 'liga' 0, 'calt' 0;
  font-variant-ligatures: none;
}
.hl-code:not(.framed) {
  border: none;
  border-radius: 0;
  background: transparent;
  max-height: none;
  overflow: visible;
}
.hl-body {
  width: max-content;
  min-width: 100%;
  padding: var(--space-1) 0 var(--space-2);
}
.hl-code.plain-pad .hl-body { padding-left: var(--space-3); }
.hl-row {
  display: flex;
  align-items: flex-start;
  min-height: calc(1em * var(--leading-normal));
  white-space: pre;
  width: 100%;
}
.hl-gutter {
  flex: none;
  box-sizing: content-box;
  min-width: var(--gutter-ch, 4ch);
  padding: 0 var(--space-2);
  text-align: right;
  color: var(--color-text-faint);
  user-select: none;
  border-right: var(--p-hairline) solid var(--color-line);
  font-variant-numeric: tabular-nums;
}
.hl-sign {
  flex: none;
  width: 16px;
  text-align: center;
  color: var(--color-text-muted);
  user-select: none;
}
.hl-text {
  flex: none;
  padding-right: 14px;
  white-space: pre;
  color: var(--color-text);
}
.hl-gutter + .hl-text { padding-left: var(--space-2); }
.hl-code.wrap .hl-body { width: 100%; }
.hl-code.wrap .hl-text {
  flex: 1 1 auto;
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.row-add { background: var(--color-diff-add-bg); }
.row-del { background: var(--color-diff-del-bg); }
.row-hunk { background: var(--color-surface-sunken); }
.row-add .hl-sign { color: var(--color-success); }
.row-del .hl-sign { color: var(--color-danger); }
.row-hunk .hl-text { color: var(--color-text-muted); }
</style>
