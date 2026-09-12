<!-- apps/kimi-web/src/components/chat/DockTaskList.vue -->
<!-- The bash body of the dock panel: upstream's flat `taskspane` list. One row
     per task — a full-width open button (hands the task to the side panel), the
     state glyph, the name, the command on its own line (`tp-meta`, which wraps
     through `flex-wrap` + `order:10; flex:1 1 100%`), the elapsed time, a stop
     button while it runs, and the hand-off chevron. Upstream keeps the detail
     view in the side panel, not in the dock. -->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TaskItem } from '../../types';
import { filterBashTasks, type BashFilter } from '../../lib/bashTaskFilter';
import Icon from '../ui/Icon.vue';
import IconButton from '../ui/IconButton.vue';

const props = defineProps<{ tasks: TaskItem[]; filter: BashFilter }>();

const emit = defineEmits<{
  /** Hand the task off to the side panel, as upstream's row does. */
  open: [taskId: string];
  stop: [taskId: string];
}>();

const { t } = useI18n();

const visible = computed(() => filterBashTasks(props.tasks, props.filter));

const EMPTY_BY_FILTER: Record<BashFilter, string> = {
  recent: 'tasks.emptyRecent',
  all: 'tasks.emptyBash',
  running: 'tasks.bash.emptyRunning',
  done: 'tasks.bash.emptyDone',
};

const STATE_WORD: Record<TaskItem['state'], string> = {
  run: 'tasks.running',
  done: 'tasks.stateDone',
  fail: 'tasks.stateFail',
  cancel: 'tasks.stateCancelled',
};
</script>

<template>
  <div class="taskspane">
    <div class="tp-list">
      <div v-if="visible.length === 0" class="tp-empty">{{ t(EMPTY_BY_FILTER[filter]) }}</div>

      <div
        v-for="task in visible"
        :key="task.id"
        class="tp-row expandable"
        :class="task.state"
      >
        <div class="tp-main">
          <button
            type="button"
            class="tp-open"
            :aria-label="task.name"
            @click="emit('open', task.id)"
          />
          <span class="tp-glyph" role="img" :aria-label="t(STATE_WORD[task.state])">
            <span v-if="task.state === 'run'" class="kw-dot kw-dot--running" aria-hidden="true" />
            <Icon v-else-if="task.state === 'done'" class="tp-done" name="circle-check" size="sm" />
            <Icon v-else-if="task.state === 'fail'" class="tp-fail" name="close" size="sm" />
            <Icon v-else class="tp-cancelled" name="close" size="sm" />
          </span>
          <span class="tp-name">{{ task.name }}</span>
          <span v-if="task.meta" class="tp-meta">{{ task.meta }}</span>
          <span v-if="task.duration ?? task.timing" class="tp-time">{{ task.duration ?? task.timing }}</span>
          <IconButton
            v-if="task.state === 'run'"
            class="tp-stop"
            size="sm"
            :label="t('tasks.stop')"
            @click="emit('stop', task.id)"
          >
            <Icon name="stop" size="sm" />
          </IconButton>
          <Icon class="tp-chevron" name="chevron-right" size="sm" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.taskspane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.tp-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-05);
}
.tp-empty {
  padding: var(--space-3) 0;
  color: var(--color-text-muted);
  font-size: var(--text-base);
}
.tp-row {
  padding: var(--space-1) 0;
}
.tp-row.fail .tp-name {
  color: var(--color-danger);
}
.tp-row.expandable > .tp-main {
  position: relative;
  min-height: var(--p-ic-lg);
  padding: var(--space-1) var(--space-2);
  margin: calc(-1 * var(--space-1)) 0;
  border-radius: var(--radius-lg);
}
.tp-row.expandable > .tp-main:hover {
  background: var(--color-hover);
}
.tp-main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  row-gap: var(--space-1);
  font-size: var(--text-base);
}
.tp-open {
  position: absolute;
  inset: 0;
  padding: 0;
  border: none;
  border-radius: var(--radius-lg);
  background: transparent;
  cursor: pointer;
}
.tp-open:focus-visible {
  outline: none;
  box-shadow: var(--p-focus-ring);
}
.tp-glyph {
  flex: none;
  width: var(--p-ic-md);
  height: var(--p-ic-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
/* Upstream colours the glyph per state, through the state class the icon
   carries — not the wrapper, which stays neutral. */
.tp-glyph :deep(.tp-done) {
  color: var(--color-success);
  transform: scale(0.91);
}
.tp-glyph :deep(.tp-fail) {
  color: var(--color-danger);
}
.tp-glyph :deep(.tp-cancelled) {
  color: var(--color-text-muted);
}
.tp-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
  font-size: var(--ui-font-size-sm);
}
.tp-meta {
  order: 10;
  flex: 1 1 100%;
  min-width: 0;
  padding-left: calc(var(--p-ic-md) + var(--space-2));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: var(--ui-font-size-xs);
}
.tp-time {
  flex: none;
  color: var(--color-text-muted);
  font-size: var(--text-base);
  font-variant-numeric: tabular-nums;
}
.tp-chevron {
  flex: none;
  color: var(--color-text-faint);
}
</style>
