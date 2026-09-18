<!-- apps/kimi-web/src/components/chat/DockAgentGrid.vue -->
<!-- The Background Agent body of the dock panel: upstream's `sg-grid` of cards.
     Each card is `sg-card.s-<state>.openable` with an overlay `sg-open` button
     labelled with the agent's name, a `sg-top` row carrying the ordinal and the
     name, a `sg-foot` column holding the bound-model row (`sg-model`) above the
     status line (the state glyph + word, and the elapsed time pushed right), and
     — while it runs — the hover `sg-cancel` button. Clicking a card hands the
     agent to the side panel. -->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TaskItem } from '../../types';
import { filterSubagentTasks, type SubagentFilter } from '../../lib/subagentFilter';
import { modelDisplay } from '../../lib/modelDisplay';
import Icon from '../ui/Icon.vue';
import IconButton from '../ui/IconButton.vue';

const props = defineProps<{ tasks: TaskItem[]; filter: SubagentFilter }>();

const emit = defineEmits<{
  /** Hand the agent off to the side panel, as the card does upstream. */
  open: [taskId: string];
  cancel: [taskId: string];
}>();

const { t } = useI18n();

const visible = computed(() => filterSubagentTasks(props.tasks, props.filter));

// Upstream numbers the cards from a per-session serial that is handed out once
// per background subagent in creation order, so the number stays put when a
// filter hides the cards before it. Numbering by the visible index instead
// re-numbers the survivors.
const serials = computed(() => {
  const ordered = props.tasks
    .filter((task) => task.runInBackground === true)
    .toSorted((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  return new Map(ordered.map((task, index) => [task.id, index]));
});

const EMPTY_BY_FILTER: Record<SubagentFilter, string> = {
  active: 'tasks.emptyRecent',
  running: 'tasks.emptyRunning',
  done: 'tasks.emptyDone',
  all: 'tasks.emptySubagent',
};

const STATE_WORD: Record<TaskItem['state'], string> = {
  run: 'tasks.running',
  done: 'tasks.stateDone',
  fail: 'tasks.stateFail',
  cancel: 'tasks.stateCancelled',
};

const ordinal = (task: TaskItem): string => String((serials.value.get(task.id) ?? 0) + 1).padStart(2, '0');

// The bound model the agent actually runs on, as upstream's `sg-model` row shows
// it; dropped when the row carries no model (older servers, REST `/tasks` rows).
const modelLabel = (task: TaskItem): string | undefined => modelDisplay(task.model);
</script>

<template>
  <div class="sg-grid">
    <div v-if="visible.length === 0" class="sg-empty">{{ t(EMPTY_BY_FILTER[filter]) }}</div>

    <div
      v-for="task in visible"
      :key="task.id"
      class="sg-card openable"
      :class="`s-${task.state}`"
    >
      <button type="button" class="sg-open" :aria-label="task.name" @click="emit('open', task.id)" />
      <div class="sg-top">
        <span class="sg-num">{{ ordinal(task) }}</span>
        <span class="sg-name">{{ task.name }}</span>
      </div>
      <div class="sg-foot">
        <div v-if="modelLabel(task)" class="sg-model">
          <Icon name="robot" size="sm" />
          <span>{{ modelLabel(task) }}</span>
        </div>
        <div class="sg-status">
          <span class="sg-state">
            <span v-if="task.state === 'run'" class="kw-dot kw-dot--running" aria-hidden="true" />
            <Icon v-else-if="task.state === 'done'" class="sg-ic-done" name="circle-check" size="sm" />
            <Icon v-else-if="task.state === 'fail'" name="close" size="sm" />
            <Icon v-else name="close" size="sm" />
            {{ t(STATE_WORD[task.state]) }}
          </span>
          <span v-if="task.duration ?? task.timing" class="sg-time">
            <Icon name="clock" size="sm" />
            {{ task.duration ?? task.timing }}
          </span>
        </div>
      </div>
      <IconButton
        v-if="task.state === 'run'"
        class="sg-cancel"
        size="sm"
        :label="t('tasks.stop')"
        @click="emit('cancel', task.id)"
      >
        <Icon name="close" size="sm" />
      </IconButton>
    </div>
  </div>
</template>

<style scoped>
.sg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: var(--space-2);
  align-content: start;
}
.sg-empty {
  color: var(--color-text-muted);
  font-size: var(--text-base);
}
.sg-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-lg);
  background: var(--color-selected);
}
.sg-card.openable {
  cursor: pointer;
}
.sg-card.openable:hover {
  background: var(--color-selected-hover);
}
.sg-open {
  position: absolute;
  inset: 0;
  padding: 0;
  border: none;
  border-radius: var(--radius-lg);
  background: transparent;
  cursor: pointer;
}
.sg-open:focus-visible {
  outline: none;
  box-shadow: var(--p-focus-ring);
}
.sg-top {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
/* Room for the cancel button, which is anchored in the card's top-right. */
.sg-card:has(.sg-cancel) .sg-top {
  padding-right: calc(36px + var(--space-1));
}
.sg-num {
  flex: none;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
}
.sg-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
  font-weight: var(--weight-medium);
}
.sg-foot {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
/* Bound-model row — upstream's, at its own type size above the state line. */
.sg-model {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}
.sg-model span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-status {
  display: flex;
  align-items: center;
}
.sg-state {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}
.s-fail .sg-state {
  color: var(--color-danger);
}
.sg-state :deep(.sg-ic-done) {
  color: var(--color-success);
  transform: scale(0.91);
}
.sg-time {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}
/* Upstream reveals the cancel button on hover on a pointer device and keeps it
   visible on touch; the fork has no touch-target token, so the size is literal. */
.sg-cancel {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  color: var(--color-text-muted);
  opacity: 0;
  transition: opacity var(--duration-base) var(--ease-out);
}
.sg-card:hover .sg-cancel,
.sg-cancel:focus-visible {
  opacity: 1;
}
.sg-cancel:hover {
  color: var(--color-danger);
}
@media (hover: none) {
  .sg-cancel {
    top: 0;
    right: 0;
    width: 36px;
    height: 36px;
    opacity: 1;
  }
}
</style>
