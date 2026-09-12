<!-- apps/kimi-web/src/components/chat/tool-calls/TodoTool.vue -->
<!-- Upstream renderers a TodoWrite call as a progress summary in the tool line
     (a done/total chip plus a thin bar) and a status-glyph list in the body.
     Rendering it as a generic tool echoed the raw JSON input instead. -->
<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import type { ToolCall } from '../../../types';
import { toolGlyph, toolHeadParts, toolLabel, toolSummary } from '../../../lib/toolMeta';
import ToolRow from '../ToolRow.vue';
import Icon from '../../ui/Icon.vue';
import StatusDot from '../../ui/StatusDot.vue';

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

const todos = computed<TodoItem[]>(() => {
  try {
    const raw = JSON.parse(props.tool.arg) as { todos?: unknown };
    if (!Array.isArray(raw.todos)) return [];
    return raw.todos.map((entry) => {
      const rec = (entry ?? {}) as Record<string, unknown>;
      return {
        title: typeof rec['title'] === 'string' ? rec['title'] : '',
        status: typeof rec['status'] === 'string' ? rec['status'] : 'pending',
      };
    });
  } catch {
    return [];
  }
});

const doneCount = computed(() => todos.value.filter((todo) => todo.status === 'completed').length);
const fillPct = computed(() =>
  todos.value.length === 0 ? 0 : (doneCount.value / todos.value.length) * 100,
);

const status = computed<'running' | 'ok' | 'error'>(() => props.tool.status as 'running' | 'ok' | 'error');
const label = computed(() => toolLabel(props.tool.name));
const glyph = computed(() => toolGlyph(props.tool.name));
const summary = computed(() => toolSummary(props.tool.name, props.tool.arg));
const head = computed(() => toolHeadParts(props.tool.name, props.tool.arg));

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
  return 's-pending';
}
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
    :time="tool.timing"
    :open="open"
    :expandable="todos.length > 0"
    @toggle="toggle"
  >
    <template #trailing>
      <span class="tl-chip">{{ doneCount }}/{{ todos.length }}</span>
      <span class="todo-bar" aria-hidden="true">
        <span class="todo-fill" :style="{ width: `${fillPct}%` }" />
      </span>
    </template>
    <div class="todo-list">
      <div v-for="(todo, i) in todos" :key="i" class="todo-row" :class="rowClass(todo.status)">
        <span class="status-glyph" :class="glyphClass(todo.status)" aria-hidden="true">
          <Icon v-if="todo.status === 'completed'" name="check" size="sm" />
          <StatusDot v-else-if="todo.status === 'in_progress'" status="running" />
          <StatusDot v-else status="pending" />
        </span>
        <span class="todo-title">{{ todo.title }}</span>
      </div>
    </div>
  </ToolRow>
</template>

<style scoped>
.todo-bar {
  display: inline-flex;
  width: 36px;
  height: 3px;
  border-radius: var(--radius-full);
  background: var(--color-line);
  overflow: hidden;
  flex: none;
}
.todo-fill {
  background: var(--color-success);
  border-radius: var(--radius-full);
  transition: width var(--duration-slow) var(--ease-out);
}
.todo-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  border: 0.5px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-well);
  padding: var(--space-2) var(--space-3);
  max-height: calc(12 * 1.6 * var(--content-font-size));
  overflow-y: auto;
  overscroll-behavior: contain;
}
.todo-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 2px 0;
  font-size: calc(var(--content-font-size) - 1px);
  color: var(--color-text);
}
.todo-row.s-in_progress .todo-title {
  font-weight: var(--weight-medium);
}
.status-glyph {
  flex: none;
  width: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  user-select: none;
}
.status-glyph.s-run {
  color: var(--color-accent);
}
.todo-title {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  line-height: 1.4;
}
</style>
