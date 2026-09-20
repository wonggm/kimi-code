<!-- apps/kimi-web/src/components/chat/TodoCard.vue -->
<!-- Read-only todo list driven by the model's TodoList tool (latest full-list
     write wins). Rendered inside the dock panel: a current-progress
     completion count with a thin progress bar on top, then each todo as a row.
     The rows carry no material of their own — the dock panel they sit in takes
     upstream's menu material (see the material note in style.css), so a second
     blur here would nest a backdrop-filter inside it for nothing. Rows share
     StatusGlyph with the background bash/subagent task lists so the three stay
     visually identical. -->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TodoView } from '../../types';
import Icon from '../ui/Icon.vue';
import Spinner from '../ui/Spinner.vue';

const props = defineProps<{
  todos: TodoView[];
}>();

const { t } = useI18n();

const doneCount = computed(() => props.todos.filter((td) => td.status === 'done').length);
const donePct = computed(() => {
  const total = props.todos.length;
  if (total === 0) return 0;
  return Math.round((doneCount.value / total) * 100);
});
</script>

<template>
  <div class="todo-card">
    <div v-if="props.todos.length === 0" class="tc-empty">
      <svg class="tc-empty-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 11l2 2 4-4" />
        <rect x="4" y="4" width="16" height="16" rx="3" />
      </svg>
      <span>{{ t('tasks.emptyTodo') }}</span>
    </div>

    <template v-else>
      <div class="tc-progress">
        <span class="tc-progress-label">{{ t('tasks.todoProgress', { done: doneCount, total: props.todos.length }) }}</span>
        <span class="tc-progress-track" :title="`${donePct}%`">
          <span class="tc-progress-fill" :style="{ width: `${donePct}%` }"></span>
        </span>
      </div>

      <div v-for="(td, i) in props.todos" :key="i" class="tc-row" :class="`s-${td.status}`">
        <span class="tc-glyph" :class="`g-${td.status}`" aria-hidden="true">
          <Icon v-if="td.status === 'done'" name="check" size="sm" />
          <Spinner v-else-if="td.status === 'in_progress'" class="tc-spin" size="xs" />
        </span>
        <span class="tc-name">{{ td.title }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.todo-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--text-base);
}

/* Current-progress completion count: label + thin track. */
.tc-progress {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-1) var(--space-1);
}
.tc-progress-label {
  flex: none;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
}
.tc-progress-track {
  flex: 1;
  height: 4px;
  border-radius: var(--radius-full);
  background: var(--color-surface-sunken);
  overflow: hidden;
}
.tc-progress-fill {
  display: block;
  height: 100%;
  border-radius: var(--radius-full);
  background: var(--color-accent);
  transition: width var(--duration-base) var(--ease-out);
}

/* Upstream's rows are plain: the panel supplies the surface, so a row carries
   no background, border or radius of its own, and a settled row is not struck
   through — the glyph shows the state. */
.tc-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  color: var(--color-text);
}
.tc-name { flex: 1; min-width: 0; overflow-wrap: anywhere; line-height: var(--leading-normal); }
.tc-row.s-in_progress .tc-name { font-weight: var(--weight-medium); }
.tc-row.s-pending .tc-name { color: var(--color-text-muted); }
.tc-glyph {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--p-ic-md);
  height: var(--p-ic-md);
  border-radius: var(--radius-full);
}
.tc-glyph.g-done { color: var(--color-success); }
.tc-glyph.g-pending { border: 1px solid var(--color-line-strong); }
.tc-glyph .tc-spin { color: var(--color-text); }

.tc-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-6) var(--space-4);
  color: var(--color-text-faint);
  font-size: var(--text-sm);
}
.tc-empty-ico { width: 28px; height: 28px; color: var(--color-line-strong); }

/* Mobile (~/todo tab): match the chat font bump; row spacing opens up. */
@media (max-width: 640px) {
  .todo-card { font-size: var(--text-lg); }
  .tc-row { padding: var(--space-2) var(--space-3); }
}
</style>