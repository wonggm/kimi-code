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
 *  `s-in_progress` or `s-pending`, while the in-progress glyph is `s-run`.
 *  Upstream draws the pending glyph as a hollow ring from its own icon set;
 *  the registry here has no ring, so the SVG is inlined in the template. */
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
              <Icon v-if="todo.status === 'completed'" name="check" size="sm" />
              <Spinner v-else-if="todo.status === 'in_progress'" size="md" />
              <svg
                v-else
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                class="kw-icon"
                aria-hidden="true"
              >
                <g transform="scale(1.333333)">
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M1.575 9C1.575 4.89918 4.89918 1.575 9 1.575C13.1008 1.575 16.425 4.89918 16.425 9C16.425 13.1008 13.1008 16.425 9 16.425C4.89918 16.425 1.575 13.1008 1.575 9ZM9 2.925C5.64477 2.925 2.925 5.64477 2.925 9C2.925 12.3552 5.64477 15.075 9 15.075C12.3552 15.075 15.075 12.3552 15.075 9C15.075 5.64477 12.3552 2.925 9 2.925Z"
                    fill="currentColor"
                  />
                </g>
              </svg>
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
  width: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  user-select: none;
}
.status-glyph.s-run {
  color: var(--color-accent);
}
.status-glyph.s-pending {
  color: var(--color-text-faint);
}
.todo-title {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  line-height: 1.4;
}
</style>
