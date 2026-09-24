<!-- apps/kimi-web/src/components/chat/tool-calls/GenericTool.vue -->
<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import type { FilePreviewRequest, ToolCall, ToolMedia } from '../../../types';
import { normalizeToolName, toolChip, toolGlyph, toolHeadParts, toolLabel, toolSummary } from '../../../lib/toolMeta';
import type { DetachTaskTarget } from '../../../lib/detachTarget';
import { useI18n } from 'vue-i18n';
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

defineEmits<{
  openMedia: [media: ToolMedia];
  openFile: [target: FilePreviewRequest];
  openToolDiff: [id: string];
  detachTask: [target: DetachTaskTarget];
}>();

const hasOutput = computed(() => !!props.tool.output && props.tool.output.length > 0);
const canExpand = computed(() => hasOutput.value);
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
const head = computed(() => toolHeadParts(props.tool.name, props.tool.arg));
// Which body shape this tool uses, per upstream: Search lists its matches and
// everything else shows the output well.
const fullPath = computed(() => toolSummary(props.tool.name, props.tool.arg, true));
const isRead = computed(() => /^read$/i.test(props.tool.name));
const isSearch = computed(() => /^(grep|search)$/i.test(props.tool.name));
const panelTitle = computed(() => isRead.value ? head.value.file || fullPath.value : '');
const chip = computed(() =>
  toolChip({
    name: props.tool.name,
    arg: props.tool.arg,
    output: props.tool.output,
    timing: props.tool.timing,
    status: props.tool.status,
  }),
);
// Upstream prints the read/search count in the row's head, beside the path,
// and leaves the tail chip to the running bash command's timing.
const leadFaint = computed(() => {
  const name = normalizeToolName(props.tool.name);
  return name === 'read' || name === 'grep' || name === 'search' ? chip.value : '';
});

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
    :file="head.file"
    :dir="head.dir"
    :mono="head.mono"
    :faint="leadFaint"
    :arg="!open ? summary : ''"
    :time="tool.timing"
    :open="open"
    :expandable="canExpand"
    @toggle="toggle"
  >
    <template #trailing>
      <span v-if="chip && !leadFaint" class="chip tl-chip">{{ chip }}</span>
    </template>
    <ToolPanel :title="panelTitle" scroll>
      <div v-if="isSearch" class="match-list">
        <button v-for="(line, i) in tool.output ?? []" :key="i" type="button" class="match-row">
          <span class="mtext">{{ line }}</span>
        </button>
        <div v-if="!(tool.output ?? []).length" class="match-empty">{{ t('tools.output.waiting') }}</div>
      </div>
      <ToolOutputBlock v-else :lines="tool.output" empty-text="Waiting for output…" />
    </ToolPanel>
  </ToolRow>
</template>

<style scoped>
.match-list { display: flex; flex-direction: column; }
.match-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  width: 100%;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  padding: 0;
  font-family: var(--font-mono);
  font-size: var(--content-font-size);
  line-height: 1.571;
  font-feature-settings: 'liga' 0, 'calt' 0;
  font-variant-ligatures: none;
  color: var(--color-text);
  text-align: left;
  cursor: default;
}
.match-row:focus-visible { outline: none; box-shadow: var(--p-focus-ring); }
.mtext { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.match-empty { color: var(--color-text-muted); font-size: var(--text-xs); }
.chip {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  flex: none;
}
</style>
