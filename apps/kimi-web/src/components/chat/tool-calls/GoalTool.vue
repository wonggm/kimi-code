<!-- apps/kimi-web/src/components/chat/tool-calls/GoalTool.vue -->
<!-- The goal tools (`CreateGoal` / `GetGoal` / `SetGoalBudget` / `UpdateGoal`) as
     upstream renders them: the objective and criterion the call carried, the
     budget it set beside the name, and the state chip an update leaves behind. -->
<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ToolCall } from '../../../types';
import { goalBudgetSummary, goalStatusLabel, normalizeToolName, toolGlyph, toolLabel } from '../../../lib/toolMeta';
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

const { t } = useI18n();

const status = computed<'running' | 'ok' | 'error'>(() => props.tool.status as 'running' | 'ok' | 'error');
const kind = computed(() => normalizeToolName(props.tool.name));

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

const args = computed<Record<string, unknown>>(() => {
  try {
    const parsed = JSON.parse(props.tool.arg ?? '') as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
});

/** An update's argument carries the objective for a create and the new state for
 *  an update; a read carries neither. */
const objective = computed(() => str(args.value['objective']));
const criterion = computed(() => str(args.value['completionCriterion']) || str(args.value['completion_criterion']));
const stateWord = computed(() => goalStatusLabel(args.value['status']) ?? '');

/** The head's own state chip: a create is Active by definition, an update shows
 *  the state it moved the goal to. */
const pill = computed<{ word: string; tone: string } | null>(() => {
  if (kind.value === 'creategoal') return { word: t('status.goalStatusActive'), tone: 'pill-active' };
  if (kind.value !== 'updategoal' || !stateWord.value) return null;
  const tone =
    args.value['status'] === 'complete' ? 'pill-done'
      : args.value['status'] === 'blocked' ? 'pill-blocked'
        : 'pill-active';
  return { word: stateWord.value, tone };
});

/** The dim text after the name: the objective a create sets, the budget a
 *  `SetGoalBudget` sets, the state an update moves to. */
const dim = computed(() => {
  switch (kind.value) {
    case 'creategoal':
      return objective.value;
    case 'updategoal':
      return stateWord.value;
    case 'setgoalbudget':
      return goalBudgetSummary(args.value) ?? '';
    default:
      return '';
  }
});

const hasOutput = computed(() => !!props.tool.output && props.tool.output.length > 0);
const canExpand = computed(() => hasOutput.value || !!criterion.value);
// Persist the user's manual open/closed choice across row eviction (see
// ChatPane's toolExpandState).
const toolExpandState = inject<Map<string, boolean>>('toolExpandState');
const expandKey = props.tool.id;
const persisted = expandKey ? toolExpandState?.get(expandKey) : undefined;
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
    :icon="toolGlyph(tool.name)"
    :name="toolLabel(tool.name)"
    :arg="dim"
    :open="open"
    :expandable="canExpand"
    @toggle="toggle"
  >
    <template #trailing>
      <span v-if="pill" class="tl-pill" :class="pill.tone">{{ pill.word }}</span>
    </template>
    <ToolPanel scroll>
      <div v-if="objective" class="goal-block">
        <div class="goal-text">{{ objective }}</div>
        <div v-if="criterion" class="goal-criterion">{{ criterion }}</div>
      </div>
      <ToolOutputBlock v-if="hasOutput" :lines="tool.output" />
    </ToolPanel>
  </ToolRow>
</template>

<style scoped>
.goal-block {
  margin-bottom: var(--space-1);
}
.goal-text {
  color: var(--color-text);
  font-size: calc(var(--content-font-size) - 1px);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
.goal-criterion {
  color: var(--color-text-muted);
  font-size: calc(var(--content-font-size) - 2px);
  line-height: 1.6;
  margin-top: 2px;
  white-space: pre-wrap;
  word-break: break-word;
}
.tl-pill.pill-active {
  color: var(--color-accent);
  background: var(--color-accent-soft);
}
.tl-pill.pill-done {
  color: var(--color-success);
  background: var(--color-success-soft);
}
.tl-pill.pill-blocked {
  color: var(--color-warning);
  background: var(--color-warning-soft);
}
</style>
