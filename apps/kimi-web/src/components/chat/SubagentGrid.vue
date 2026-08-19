<!-- apps/kimi-web/src/components/chat/SubagentGrid.vue -->
<!-- Subagent dock panel: a card grid with status filtering. The default
     "recent" filter shows every in-progress subagent plus the most recently
     finished ones; running/done/all widen the set. Each card carries the
     subagent's bound model (threated from the task row) and opens the live
     detail side panel on click. -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TaskItem } from '../../types';
import { filterSubagentTasks, type SubagentFilter } from '../../lib/subagentFilter';
import SegmentedControl from '../ui/SegmentedControl.vue';
import StatusGlyph, { type StatusGlyphStatus } from './StatusGlyph.vue';

const props = defineProps<{ tasks: TaskItem[] }>();

const emit = defineEmits<{
  cancel: [taskId: string];
  /** A subagent card was clicked — open its live detail in the side panel. */
  open: [taskId: string];
}>();

const { t } = useI18n();

const filters = computed<{ value: SubagentFilter; label: string }[]>(() => [
  { value: 'active', label: t('tasks.filterRecent') },
  { value: 'running', label: t('tasks.filterRunning') },
  { value: 'done', label: t('tasks.filterDone') },
  { value: 'all', label: t('tasks.filterAll') },
]);

const activeFilter = ref<SubagentFilter>('active');

const visibleTasks = computed(() => filterSubagentTasks(props.tasks, activeFilter.value));

const EMPTY_BY_FILTER: Record<SubagentFilter, string> = {
  active: 'tasks.emptyRecent',
  running: 'tasks.emptyRunning',
  done: 'tasks.emptyDone',
  all: 'tasks.emptySubagent',
};

function glyphStatus(state: string): StatusGlyphStatus {
  if (state === 'run' || state === 'done' || state === 'fail') return state;
  return 'pending';
}

// Trim a `provider/alias` model alias down to its short name for display
// (e.g. `opencode-go/deepseek-v4-flash` → `deepseek-v4-flash`). Same rule as
// the AgentDetailPanel's model line; shows the whole alias when no provider
// prefix is present.
function displayModel(task: TaskItem): string | undefined {
  const model = task.model;
  if (typeof model !== 'string' || model.length === 0) return undefined;
  const lastSlash = model.lastIndexOf('/');
  return lastSlash >= 0 && lastSlash < model.length - 1 ? model.slice(lastSlash + 1) : model;
}
</script>

<template>
  <div class="sg">
    <div class="sg-filters">
      <SegmentedControl v-model="activeFilter" :options="filters" size="sm" />
    </div>

    <div v-if="visibleTasks.length === 0" class="sg-empty">{{ t(EMPTY_BY_FILTER[activeFilter]) }}</div>

    <div v-else class="sg-grid">
      <div
        v-for="task in visibleTasks"
        :key="task.id"
        class="sg-card"
        :class="{ run: task.state === 'run', done: task.state === 'done', fail: task.state === 'fail' }"
      >
        <div class="sg-main" role="button" :aria-label="task.name" @click="emit('open', task.id)">
          <StatusGlyph :status="glyphStatus(task.state)" />
          <span class="sg-name" :title="task.name">{{ task.name }}</span>
        </div>
        <div class="sg-meta">
          <span v-if="displayModel(task)" class="sg-model" :title="task.model">{{ displayModel(task) }}</span>
          <span v-else class="sg-model" />
          <span class="sg-time">{{ task.timing }}</span>
        </div>
        <div class="sg-actions">
          <button
            v-if="task.state === 'run'"
            type="button"
            class="sg-stop"
            @click.stop="emit('cancel', task.id)"
          >{{ t('tasks.stop') }}</button>
          <span class="sg-open">{{ t('tasks.openDetail') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sg {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-height: 0;
}

.sg-filters {
  flex: none;
  display: flex;
}

/* Responsive card grid: fill the pane width, wrap to more columns when there
   is room. */
.sg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: var(--space-2);
  align-content: start;
  min-height: 0;
  overflow-y: auto;
}

.sg-card {
  background: var(--color-surface);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}
.sg-card.run { border-color: color-mix(in srgb, var(--color-accent) 45%, var(--color-line)); }
.sg-card.done { opacity: 0.72; }
.sg-card.fail .sg-name { color: var(--color-danger); }

.sg-main {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  cursor: pointer;
  border-radius: var(--radius-sm);
}
.sg-main:hover { background: var(--color-surface-sunken); }

.sg-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}
.sg-card.done .sg-name { color: var(--color-text-muted); }

.sg-meta {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  min-width: 0;
}
.sg-model {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-accent);
}
.sg-time {
  flex: none;
  font-size: var(--text-xs);
  color: var(--color-text-faint);
}

.sg-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.sg-open {
  font-size: var(--text-sm);
  color: var(--color-accent);
}
.sg-stop {
  background: none;
  border: 1px solid color-mix(in srgb, var(--color-danger) 22%, var(--color-line));
  border-radius: var(--radius-sm);
  color: var(--color-danger);
  font-size: var(--text-sm);
  padding: 1px var(--space-2);
  cursor: pointer;
  font-family: var(--font-ui);
}
.sg-stop:hover { background: var(--color-surface-sunken); }

.sg-empty {
  padding: var(--space-5) 0;
  text-align: center;
  color: var(--color-text-faint);
  font-size: var(--text-sm);
}
</style>