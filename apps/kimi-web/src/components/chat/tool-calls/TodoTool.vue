<!-- apps/kimi-web/src/components/chat/tool-calls/TodoTool.vue -->
<!-- Upstream renders a TodoWrite call as a tool line — the current item's title
     and the done/total count beside the label, both gone once the card opens —
     over a body headed by the same pair and holding the status-glyph list. -->
<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import type { ToolCall } from '../../../types';
import { toolGlyph, toolLabel } from '../../../lib/toolMeta';
import ToolRow from '../ToolRow.vue';
import Icon from '../../ui/Icon.vue';
import Spinner from '../../ui/Spinner.vue';
import ToolPanel from './ToolPanel.vue';

const props = withDefaults(
  defineProps<{
    tool: ToolCall;
    mobile?: boolean;
    toolDiffPanel?: boolean;
  }>(),
  { mobile: false, toolDiffPanel: false },
);

interface TodoItem {
  title: string;
  status: string;
}

/** Kimi's TodoList reports a finished item as `done`; Claude-style TodoWrite
 *  says `completed`. The row/glyph vocabulary below is the latter. */
function normalizeStatus(raw: unknown): string {
  if (raw === 'done' || raw === 'completed') return 'completed';
  return typeof raw === 'string' ? raw : 'pending';
}

const todos = computed<TodoItem[]>(() => {
  try {
    const raw = JSON.parse(props.tool.arg) as { todos?: unknown };
    if (!Array.isArray(raw.todos)) return [];
    return raw.todos.map((entry) => {
      const rec = (entry ?? {}) as Record<string, unknown>;
      return {
        title: typeof rec['title'] === 'string' ? rec['title'] : '',
        status: normalizeStatus(rec['status']),
      };
    });
  } catch {
    return [];
  }
});

const doneCount = computed(() => todos.value.filter((todo) => todo.status === 'completed').length);
const currentTitle = computed(() => todos.value.find((todo) => todo.status === 'in_progress')?.title ?? '');
const countText = computed(() => `${doneCount.value} / ${todos.value.length}`);

const status = computed<'running' | 'ok' | 'error'>(() => props.tool.status as 'running' | 'ok' | 'error');
const label = computed(() => toolLabel(props.tool.name));
const glyph = computed(() => toolGlyph(props.tool.name));

const toolExpandState = inject<Map<string, boolean>>('toolExpandState');
const expandKey = props.tool.id;
const persisted = expandKey ? toolExpandState?.get(expandKey) : undefined;
const open = ref(persisted ?? (props.tool.defaultExpanded === true && todos.value.length > 0));

function toggle(): void {
  open.value = !open.value;
  if (expandKey && toolExpandState) toolExpandState.set(expandKey, open.value);
}

/** Row and glyph classes are upstream's vocabulary: a row is `s-done`,
 *  `s-in_progress` or `s-pending`, while the in-progress glyph is `s-run`. */
function rowClass(todoStatus: string): string {
  if (todoStatus === 'completed') return 's-done';
  if (todoStatus === 'in_progress') return 's-in_progress';
  return 's-pending';
}

function glyphClass(todoStatus: string): string {
  if (todoStatus === 'completed') return 's-done';
  if (todoStatus === 'in_progress') return 's-run';
  if (todoStatus === 'pending') return 's-pending';
  return 's-fail';
}
</script>

<template>
  <ToolRow
    :status="status"
    :icon="glyph"
    :name="label"
    :arg="todos.length > 0 && !open ? currentTitle : ''"
    :faint="todos.length > 0 && !open ? countText : ''"
    :time="tool.timing"
    :open="open"
    :expandable="todos.length > 0"
    @toggle="toggle"
  >
    <template v-if="todos.length > 0">
      <ToolPanel scroll :copy="false">
        <template #head>
          <span class="todo-head">
            <span class="todo-current">{{ currentTitle }}</span>
            <span class="todo-count">{{ countText }}</span>
          </span>
        </template>
        <div class="todo-list">
          <div v-for="(todo, i) in todos" :key="i" class="todo-row" :class="rowClass(todo.status)">
            <span class="status-glyph" :class="glyphClass(todo.status)" aria-hidden="true">
              <Icon v-if="todo.status === 'completed'" name="circle-check-filled" size="md" />
              <Spinner v-else-if="todo.status === 'in_progress'" size="md" />
              <Icon v-else-if="todo.status === 'pending'" name="circle-empty" size="md" />
              <Icon v-else name="close" size="sm" />
            </span>
            <span class="todo-title">{{ todo.title }}</span>
          </div>
        </div>
      </ToolPanel>
    </template>
  </ToolRow>
</template>

<style scoped>
.todo-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.todo-current {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
}
.todo-count {
  flex: none;
  color: var(--color-text-faint);
}
.todo-list { display: flex; flex-direction: column; gap: var(--space-1); }
.todo-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-base);
  line-height: 20px;
  color: var(--color-text);
}
.todo-row.s-in_progress .todo-title {
  color: var(--color-text);
  font-weight: var(--weight-medium);
}
.todo-row.s-done .todo-title {
  color: var(--color-text-quaternary);
}
.status-glyph {
  flex: none;
  width: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  user-select: none;
}
.status-glyph.s-run {
  color: var(--color-text);
}
.status-glyph.s-done {
  color: var(--color-fill-4);
}
.status-glyph.s-pending {
  color: var(--color-fill-4);
}
.status-glyph.s-fail {
  color: var(--color-danger);
}
.todo-title {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
