<!-- apps/kimi-web/src/components/chat/tool-calls/GenericTool.vue -->
<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import type { FilePreviewRequest, ToolCall, ToolMedia } from '../../../types';
import { toolChip, toolGlyph, toolHeadParts, toolLabel, toolSummary } from '../../../lib/toolMeta';
import type { DetachTaskTarget } from '../../../lib/detachTarget';
import { useI18n } from 'vue-i18n';
import ToolRow from '../ToolRow.vue';
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
const head = computed(() => toolHeadParts(props.tool.name, props.tool.arg));
// Which body shape this tool uses, per upstream: the path tools lead with the
// resolved path, Run echoes the command, Search lists its matches, everything
// else just shows the output well.
const fullPath = computed(() => toolSummary(props.tool.name, props.tool.arg, true));
const isRead = computed(() => /^read$/i.test(props.tool.name));
const isSearch = computed(() => /^(grep|search)$/i.test(props.tool.name));
const command = computed(() => {
  try {
    const raw = JSON.parse(props.tool.arg) as Record<string, unknown>;
    const cmd = raw['command'] ?? raw['cmd'] ?? raw['script'];
    return typeof cmd === 'string' ? cmd : props.tool.arg;
  } catch {
    return props.tool.arg;
  }
});
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
    :file="head.file"
    :dir="head.dir"
    :mono="head.mono"
    :arg="!open ? summary : ''"
    :time="tool.name !== 'bash' ? tool.timing : ''"
    :open="open"
    :expandable="canExpand"
    @toggle="toggle"
  >
    <template #trailing>
      <span v-if="chip" class="chip tl-chip">{{ chip }}</span>
      <button v-if="canDetach" type="button" class="gt-detach" @click.stop="emit('detachTask', { toolCallId: tool.id, command: bashInput.command })">
        {{ t('tasks.sendToBackground') }}
      </button>
    </template>
    <button v-if="isRead && fullPath" type="button" class="path-link" @click="emit('openFile', { path: fullPath })">{{ fullPath }}</button>
    <div v-if="!isRead && !isSearch && command" class="cmd-echo">{{ command }}</div>
    <div v-if="isSearch" class="match-list">
      <button v-for="(line, i) in tool.output ?? []" :key="i" type="button" class="match-row">
        <span class="mtext">{{ line }}</span>
      </button>
      <div v-if="!(tool.output ?? []).length" class="match-empty">{{ t('tools.output.waiting') }}</div>
    </div>
    <ToolOutputBlock v-else :lines="tool.output" empty-text="Waiting for output…" />
  </ToolRow>
</template>

<style scoped>
.path-link {
  display: block;
  width: 100%;
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  padding: 0 0 var(--space-1);
  font-family: var(--font-mono);
  font-size: calc(var(--content-font-size) - 2px);
  color: var(--color-text-muted);
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.path-link:hover { color: var(--color-text); }
.path-link:focus-visible { outline: none; box-shadow: var(--p-focus-ring); }
.cmd-echo {
  font-family: var(--font-mono);
  font-size: calc(var(--content-font-size) - 2px);
  line-height: 1.6;
  font-variant-ligatures: none;
  color: var(--color-text-muted);
  white-space: pre-wrap;
  word-break: break-all;
  margin-bottom: var(--space-1);
}
.match-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-well);
  padding: var(--space-1);
  max-height: calc(12 * 1.6 * var(--content-font-size));
  overflow-y: auto;
  overscroll-behavior: contain;
}
.match-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  width: 100%;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  padding: 2px var(--space-2);
  font-family: var(--font-mono);
  font-size: calc(var(--content-font-size) - 2px);
  line-height: 1.6;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
}
.match-row:hover { background: var(--color-hover); }
.mtext { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.match-empty { color: var(--color-text-muted); font-size: var(--text-xs); padding: var(--space-1) var(--space-2); }
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
