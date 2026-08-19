<!-- apps/kimi-web/src/components/chat/TasksPane.vue -->
<!-- Background bash task panel (dock "Bash"): a status filter on top, the
     task list on the left and the selected task's command + output on the
     right. Clicking a row selects it and fills the detail pane; running rows
     keep an inline Stop button. -->
<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TaskItem } from '../../types';
import { filterBashTasks, type BashFilter } from '../../lib/bashTaskFilter';
import { copyTextToClipboard } from '../../lib/clipboard';
import SegmentedControl from '../ui/SegmentedControl.vue';
import StatusGlyph, { type StatusGlyphStatus } from './StatusGlyph.vue';

const props = defineProps<{ tasks: TaskItem[] }>();

const emit = defineEmits<{ cancel: [taskId: string] }>();

const { t } = useI18n();

const filters = computed<{ value: BashFilter; label: string }[]>(() => [
  { value: 'all', label: t('tasks.bash.filterAll') },
  { value: 'running', label: t('tasks.bash.filterRunning') },
  { value: 'done', label: t('tasks.bash.filterDone') },
]);

const activeFilter = ref<BashFilter>('running');

const visibleTasks = computed(() => filterBashTasks(props.tasks, activeFilter.value));

// Clicked row id. The detail pane is derived from it, so switching filters to
// a view that hides the row simply empties the detail side (the selection
// survives in case the filter is switched back).
const selectedId = ref<string | null>(null);

const selected = computed(() => visibleTasks.value.find((task) => task.id === selectedId.value) ?? null);

const EMPTY_BY_FILTER: Record<BashFilter, string> = {
  all: 'tasks.emptyBash',
  running: 'tasks.bash.emptyRunning',
  done: 'tasks.bash.emptyDone',
};

const copiedCommandIds = reactive(new Set<string>());
const copiedOutputIds = reactive(new Set<string>());

function select(task: TaskItem): void {
  selectedId.value = task.id;
}

function hasDetail(task: TaskItem): boolean {
  return Boolean((task.output && task.output.length > 0) || task.meta);
}

function glyphStatus(state: string): StatusGlyphStatus {
  if (state === 'run' || state === 'done' || state === 'fail') return state;
  return 'pending';
}

async function copyToClipboard(text: string, taskId: string, set: Set<string>): Promise<void> {
  const ok = await copyTextToClipboard(text);
  if (!ok) return;
  set.add(taskId);
  setTimeout(() => set.delete(taskId), 1500);
}

async function copyTaskCommand(task: TaskItem): Promise<void> {
  if (!task.meta) return;
  await copyToClipboard(task.meta, task.id, copiedCommandIds);
}

async function copyTaskOutput(task: TaskItem): Promise<void> {
  const text = task.output?.join('\n') ?? '';
  if (!text) return;
  await copyToClipboard(text, task.id, copiedOutputIds);
}
</script>

<template>
  <div class="taskspane">
    <div class="tp-head">
      <SegmentedControl v-model="activeFilter" :options="filters" size="sm" />
    </div>

    <div class="tp-split">
      <div class="tp-list">
        <div v-if="visibleTasks.length === 0" class="tp-empty">{{ t(EMPTY_BY_FILTER[activeFilter]) }}</div>

        <div
          v-for="task in visibleTasks"
          :key="task.id"
          v-memo="[
            task.id,
            task.state,
            task.name,
            task.kind,
            task.timing,
            selectedId === task.id,
            copiedCommandIds.has(task.id),
            copiedOutputIds.has(task.id),
          ]"
          class="tp-row"
          :class="{
            done: task.state === 'done',
            fail: task.state === 'fail',
            selected: selectedId === task.id,
          }"
          :role="hasDetail(task) ? 'button' : undefined"
          :aria-pressed="selectedId === task.id || undefined"
          @click="hasDetail(task) && select(task)"
        >
          <StatusGlyph :status="glyphStatus(task.state)" />
          <span class="tp-name">{{ task.name }}</span>
          <span class="tp-time">{{ task.timing }}</span>
          <button
            v-if="task.state === 'run'"
            class="tp-stop"
            @click.stop="emit('cancel', task.id)"
          >{{ t('tasks.stop') }}</button>
        </div>
      </div>

      <div class="tp-detail">
        <div v-if="!selected" class="tp-empty tp-hint">{{ t('tasks.bash.selectTask') }}</div>

        <template v-else>
          <div class="tp-detail-head">
            <StatusGlyph :status="glyphStatus(selected.state)" />
            <span class="tp-detail-name">{{ selected.name }}</span>
            <span class="tp-detail-time">{{ selected.timing }}</span>
            <button
              v-if="selected.state === 'run'"
              class="tp-stop"
              @click.stop="emit('cancel', selected.id)"
            >{{ t('tasks.stop') }}</button>
          </div>
          <div v-if="selected.meta" class="tp-codebox">
            <button
              class="tp-copy"
              :class="{ copied: copiedCommandIds.has(selected.id) }"
              @click.stop="copyTaskCommand(selected)"
            >
              {{ copiedCommandIds.has(selected.id) ? t('tasks.copied') : t('tasks.copy') }}
            </button>
            <pre class="tp-pre"><code><span class="tp-cmd">{{ selected.meta }}</span></code></pre>
          </div>
          <div v-if="selected.output && selected.output.length > 0" class="tp-codebox">
            <button
              class="tp-copy"
              :class="{ copied: copiedOutputIds.has(selected.id) }"
              @click.stop="copyTaskOutput(selected)"
            >
              {{ copiedOutputIds.has(selected.id) ? t('tasks.copied') : t('tasks.copy') }}
            </button>
            <pre class="tp-pre"><code>
              <span v-for="(line, i) in selected.output" :key="i" class="tp-line">{{ line }}</span>
            </code></pre>
          </div>
          <div v-else-if="selected && !selected.meta" class="tp-empty tp-hint">{{ t('tasks.bash.noOutput') }}</div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.taskspane {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-height: 0;
  flex: 1;
}

.tp-head {
  flex: none;
  display: flex;
}

/* Two-column master/detail: the list stays at a fixed reading width, the
   detail pane takes the rest and scrolls independently. */
.tp-split {
  display: flex;
  min-height: 0;
  flex: 1;
  gap: var(--space-3);
}

.tp-list {
  flex: none;
  width: 208px;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: var(--space-1);
}

.tp-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 4px var(--space-1);
  border-radius: var(--radius-sm);
  color: var(--color-text);
}
.tp-row[role="button"] {
  cursor: pointer;
}
.tp-row[role="button"]:hover {
  background: var(--color-surface-sunken);
}
.tp-row.selected {
  background: color-mix(in srgb, var(--color-accent) 14%, transparent);
}
.tp-row.done .tp-name {
  color: var(--color-text-muted);
  text-decoration: line-through;
}
.tp-row.fail .tp-name {
  color: var(--color-danger);
}

.tp-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
}

.tp-time {
  flex: none;
  font-size: var(--text-xs);
  color: var(--color-text-faint);
}

.tp-stop {
  flex: none;
  background: none;
  border: 1px solid color-mix(in srgb, var(--color-danger) 22%, var(--color-line));
  border-radius: var(--radius-sm);
  color: var(--color-danger);
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  padding: 1px var(--space-2);
  cursor: pointer;
}
.tp-stop:hover {
  background: var(--color-surface-sunken);
}

/* Detail pane: summary row on top, then code boxes for command and output. */
.tp-detail {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border-left: 1px solid var(--color-line);
  padding-left: var(--space-3);
}
.tp-detail-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: none;
}
.tp-detail-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}
.tp-detail-time {
  flex: none;
  font-size: var(--text-xs);
  color: var(--color-text-faint);
}

.tp-codebox {
  position: relative;
  flex: none;
  background: var(--color-surface-sunken);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
}

.tp-copy {
  position: absolute;
  top: 4px;
  right: 6px;
  z-index: 1;
  opacity: 0;
  visibility: hidden;
  transition: opacity var(--duration-fast) ease, visibility var(--duration-fast) ease;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-xs);
  color: var(--color-text-muted);
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  padding: 1px var(--space-2);
  cursor: pointer;
}
.tp-codebox:hover .tp-copy,
.tp-copy:focus-visible {
  opacity: 1;
  visibility: visible;
}
.tp-copy:hover {
  background: var(--color-surface-sunken);
}
.tp-copy.copied {
  color: var(--color-success);
  border-color: color-mix(in srgb, var(--color-success) 30%, var(--color-line));
}

.tp-pre {
  margin: 0;
  padding: 6px 10px;
  max-height: 180px;
  overflow: auto;
  contain: layout paint;
}
.tp-pre code {
  display: block;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  line-height: 1.55;
  color: var(--color-text-muted);
  white-space: pre-wrap;
  word-break: break-word;
}
.tp-cmd {
  display: block;
  color: var(--color-text);
}
.tp-line {
  display: block;
}

.tp-empty {
  padding: var(--space-6) var(--space-4);
  text-align: center;
  color: var(--color-text-faint);
  font-size: var(--text-sm);
}
.tp-hint {
  margin: auto;
}

/* Mobile: stack the list above the detail pane; the panel scrolls as one. */
@media (max-width: 640px) {
  .tp-split {
    flex-direction: column;
    gap: var(--space-2);
  }
  .tp-list {
    width: 100%;
    max-height: 40%;
    padding-right: 0;
  }
  .tp-detail {
    border-left: none;
    border-top: 1px solid var(--color-line);
    padding-left: 0;
    padding-top: var(--space-2);
  }
}
</style>