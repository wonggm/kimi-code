<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ToolCall } from '../../../types';
import { normalizeToolName, toolGlyph, toolLabel } from '../../../lib/toolMeta';
import {
  parseTaskListOutput,
  parseTaskOutputOutput,
  parseTaskStopOutput,
  type TaskFields,
} from '../../../lib/backgroundTaskParse';
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

const { t, te } = useI18n();

const kind = computed(() => normalizeToolName(props.tool.name));
const status = computed<'running' | 'ok' | 'error'>(() => props.tool.status as 'running' | 'ok' | 'error');
const label = computed(() => toolLabel(props.tool.name));
const glyph = computed(() => toolGlyph(props.tool.name));

interface TaskToolInput {
  taskId: string;
  activeOnly: boolean;
}

const input = computed<TaskToolInput>(() => {
  try {
    const parsed = JSON.parse(props.tool.arg) as Record<string, unknown>;
    const id = parsed['task_id'] ?? parsed['taskId'];
    return {
      taskId: typeof id === 'string' ? id : '',
      activeOnly: parsed['active_only'] !== false,
    };
  } catch {
    return { taskId: '', activeOnly: true };
  }
});

const settled = computed(() => status.value === 'ok');
const list = computed(() => (settled.value && kind.value === 'tasklist' ? parseTaskListOutput(props.tool.output) : null));
const output = computed(() =>
  settled.value && kind.value === 'taskoutput' ? parseTaskOutputOutput(props.tool.output) : null,
);
const stopped = computed(() =>
  settled.value && kind.value === 'taskstop' ? parseTaskStopOutput(props.tool.output) : null,
);
const fields = computed<TaskFields | null>(() => output.value?.fields ?? stopped.value);

function localized(key: string, value: string): string {
  return te(key) ? t(key) : value;
}
function statusLabel(value: string | undefined): string {
  return value ? localized(`tools.bgTask.status.${value}`, value) : '';
}
function kindLabel(value: string | undefined): string {
  return value ? localized(`tools.bgTask.kind.${value}`, value) : '';
}

const summary = computed(() =>
  kind.value === 'tasklist'
    ? t(input.value.activeOnly ? 'tools.bgTask.active' : 'tools.bgTask.all')
    : fields.value?.['description'] || input.value.taskId,
);

const tail = computed(() => {
  if (kind.value !== 'tasklist') return statusLabel(fields.value?.['status']);
  const count = list.value?.count ?? 0;
  return count > 0 ? t('tools.bgTask.count', { count }) : t('tools.bgTask.none');
});

const FIELD_ORDER = [
  'status',
  'kind',
  'command',
  'pid',
  'exit_code',
  'subagent_type',
  'model',
  'reason',
  'stop_reason',
  'output_path',
];

interface FieldRow {
  key: string;
  label: string;
  value: string;
  mono: boolean;
}

const fieldRows = computed<FieldRow[]>(() => {
  const source = fields.value;
  if (!source) return [];
  return FIELD_ORDER.filter((key) => source[key]).map((key) => ({
    key,
    label: t(`tools.bgTask.field.${key}`),
    value: key === 'status' ? statusLabel(source[key]) : key === 'kind' ? kindLabel(source[key]) : source[key]!,
    mono: key === 'command' || key === 'output_path',
  }));
});

const hasStructured = computed(() => list.value !== null || fields.value !== null);
const hasOutput = computed(() => !!props.tool.output && props.tool.output.length > 0);

const toolExpandState = inject<Map<string, boolean>>('toolExpandState');
const expandKey = props.tool.id;
const persisted = expandKey ? toolExpandState?.get(expandKey) : undefined;
const canExpand = computed(
  () => (list.value?.tasks.length ?? 0) > 0 || fieldRows.value.length > 0 || hasOutput.value,
);
const open = ref(persisted ?? (props.tool.defaultExpanded === true && canExpand.value));

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
    :arg="summary"
    :faint="tail"
    :open="open"
    :expandable="canExpand"
    @toggle="toggle"
  >
    <ToolPanel scroll>
      <div v-if="list && list.tasks.length > 0" class="bt-list">
        <div v-for="task in list.tasks" :key="task['task_id']" class="bt-task">
          <span class="bt-desc">{{ task['description'] || task['task_id'] }}</span>
          <span class="bt-meta">{{ [kindLabel(task['kind']), statusLabel(task['status'])].filter(Boolean).join(' · ') }}</span>
        </div>
      </div>
      <dl v-else-if="fieldRows.length > 0" class="bt-fields">
        <template v-for="field in fieldRows" :key="field.key">
          <dt>{{ field.label }}</dt>
          <dd :class="{ mono: field.mono }">{{ field.value }}</dd>
        </template>
      </dl>
      <div v-if="output?.truncated" class="bt-note">{{ t('tools.bgTask.truncated') }}</div>
      <ToolOutputBlock
        v-if="output"
        :lines="output.output"
        :empty-text="t('tools.output.empty')"
      />
      <ToolOutputBlock v-else-if="!hasStructured && hasOutput" :lines="tool.output" />
    </ToolPanel>
  </ToolRow>
</template>

<style scoped>
.bt-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.bt-task {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  min-width: 0;
  font-size: var(--text-base);
  line-height: 20px;
}
.bt-desc {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
}
.bt-meta {
  flex: none;
  color: var(--color-text-faint);
}
.bt-fields {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--space-1) var(--space-3);
  margin: 0;
  font-size: var(--text-base);
  line-height: 20px;
}
.bt-fields dt { color: var(--color-text-faint); }
.bt-fields dd {
  margin: 0;
  min-width: 0;
  color: var(--color-text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.bt-fields dd.mono { font-family: var(--font-mono); }
.bt-note {
  color: var(--color-text-faint);
  font-size: var(--text-base);
  line-height: 20px;
}
</style>
