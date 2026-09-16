<!-- apps/kimi-web/src/components/chat/ToolFoldRow.vue -->
<!-- Collapsed summary chip for a run of consecutive tool cards. Mirrors the
     Upstream `activityRunFolding` pattern: while a turn streams or has
     finished, ≥ 3 consecutive tool-call rows fold into ONE row, e.g.
     "5 tool calls · last: Bash". Click to expand; the fold state is
     persisted in `toolExpandState` so a re-mounted row after viewport
     eviction remembers the user's choice.

     IMPORTANT: this is the tool-CALL summary fold, not the turn fold
     ("Auto-fold messages", components/chat/TurnFold.vue): that one hides a
     whole turn's work behind its own head row; this component only folds the
     per-turn tool cards inside ONE assistant message, and only at the render
     layer (turn-store objects are untouched). -->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { toolLabel } from '../../lib/toolMeta';
import { foldAggregateStatus, type FoldStatus } from '../../lib/toolFold';
import type { ToolStackItem } from '../chatTurnRendering';
import StatusDot from '../ui/StatusDot.vue';
import Icon from '../ui/Icon.vue';

const props = withDefaults(
  defineProps<{
    tools: ToolStackItem[];
    sourceIndex: number;
    /** When true, the chip is in its expanded state — rendering the inner
     *  stack is the parent's job (ChatPane re-emits a tool-stack when the
     *  user has expanded this fold). The chip itself stays visible as a
     *  pinned "expanded" indicator in case more rows land on top of it. */
    expanded?: boolean;
  }>(),
  { expanded: false },
);

const emit = defineEmits<{
  toggle: [];
}>();

const { t } = useI18n();

const status = computed<FoldStatus>(() => foldAggregateStatus(props.tools));
const statusLabel = computed(() => {
  switch (status.value) {
    case 'running':
      return t('tools.group.running');
    case 'error':
      return t('tools.group.error');
    default:
      return t('tools.group.done');
  }
});

const count = computed(() => props.tools.length);

const lastToolName = computed<string>(() => {
  const last = props.tools.at(-1);
  return last ? toolLabel(last.tool.name) : '';
});

const summaryLabel = computed(() => {
  if (props.expanded) {
    return t('tools.fold.expandedSummary', {
      count: count.value,
      last: lastToolName.value,
    });
  }
  return t('tools.fold.summary', {
    count: count.value,
    last: lastToolName.value,
  });
});

function onClick(): void {
  // The parent (ChatPane) owns the fold-state write via the `toggle` emit —
  // writing the injected Map here too would double-toggle back to the
  // pre-click state and the chip would never expand.
  emit('toggle');
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onClick();
  }
}
</script>

<template>
  <div class="tool-fold">
    <button
      type="button"
      class="tool-fold-chip lg-glass lg-glass"
      :aria-expanded="expanded"
      :aria-label="summaryLabel"
      @click="onClick"
      @keydown="onKeydown"
    >
      <StatusDot :status="status" />
      <Icon class="tfc-ic" name="list" size="sm" />
      <span class="tfc-title">{{ summaryLabel }}</span>
      <span class="tfc-meta">· {{ statusLabel }}</span>
      <Icon class="tfc-car" :name="expanded ? 'chevron-down' : 'chevron-right'" size="sm" />
    </button>
  </div>
</template>

<style scoped>
.tool-fold {
  /* A small float chip; the expanded view re-emits a tool-stack below it
     (handled by the parent), so this element never grows taller than its
     single 30px row. */
  display: block;
  margin: 0;
}
.tool-fold-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  max-width: 100%;
  height: 30px;
  padding: 0 11px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-line);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  cursor: pointer;
  user-select: none;
  /* Float chip: a hover wash should not nest a backdrop-filter. The .lg-glass
     class owns the backdrop-filter; we only tint via a hover overlay using
     a flat color, never another filter. Firefox keeps its default rendering
     (no nesting) per the upstream porting constraints. */
  transition: background-color 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}
.tool-fold-chip:hover {
  background: var(--color-surface-sunken);
  color: var(--color-text);
  border-color: color-mix(in srgb, var(--color-accent) 18%, var(--color-line));
}
.tool-fold-chip:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--color-accent-soft);
}
.tfc-ic {
  color: var(--color-text-faint);
  flex: none;
}
.tfc-title {
  font-weight: var(--weight-medium);
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 360px;
}
.tfc-meta {
  color: var(--color-text-faint);
  white-space: nowrap;
}
.tfc-car {
  margin-left: auto;
  color: var(--color-text-faint);
  flex: none;
}
@media (max-width: 640px) {
  .tfc-title { max-width: min(60vw, 240px); }
}
</style>