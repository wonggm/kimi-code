<!-- apps/kimi-web/src/components/chat/DiffLines.vue -->
<!-- Unified-diff renderer: upstream's shared code renderer in its `lines`
     shape (`hl-code.gutter > hl-body > hl-row.row-<type>` with an old/new
     gutter pair, a sign and the text). Shared by the ~/diff panel (DiffView),
     the turn-diff panel and the inline tool-call edit previews; owns only the
     rows + their styling, the parent controls the surrounding height/scroll. -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { DiffViewLine } from '../../types';
import { useSelectionCapture } from '../../composables/useSelectionQuote';

const props = defineProps<{
  lines: DiffViewLine[];
  /** Wrap long lines onto the next row instead of scrolling horizontally. */
  wrap?: boolean;
}>();

// Diff text selections open the app-wide quote bubble — one mount covers the
// changes panel, the per-turn diff tab and the tool-diff preview.
const rootRef = ref<HTMLElement | null>(null);
useSelectionCapture(() => rootRef.value);

function oldGutter(line: DiffViewLine): string {
  return line.oldNo !== undefined ? String(line.oldNo) : '';
}
function newGutter(line: DiffViewLine): string {
  return line.newNo !== undefined ? String(line.newNo) : '';
}
function sign(line: DiffViewLine): string {
  return line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';
}

// The gutter column is sized to the widest line number (upstream sets
// --gutter-ch from the same measure, with a 4-character floor).
const gutterCh = computed(() => {
  let max = 0;
  for (const line of props.lines) {
    if (line.oldNo !== undefined && line.oldNo > max) max = line.oldNo;
    if (line.newNo !== undefined && line.newNo > max) max = line.newNo;
  }
  return Math.max(4, String(max).length);
});
</script>

<template>
  <div
    ref="rootRef"
    class="hl-code gutter"
    :class="{ wrap }"
    :style="{ '--gutter-ch': `${gutterCh}ch` }"
  >
    <div class="hl-body">
      <div
        v-for="(line, i) in lines"
        :key="i"
        class="hl-row"
        :class="`row-${line.type}`"
      >
        <span class="hl-gutter">{{ oldGutter(line) }}</span>
        <span class="hl-gutter new">{{ newGutter(line) }}</span>
        <span class="hl-sign">{{ sign(line) }}</span>
        <span class="hl-text">{{ line.text }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hl-code {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-normal);
  font-feature-settings: 'liga' 0, 'calt' 0;
  font-variant-ligatures: none;
}

.hl-body {
  width: max-content;
  min-width: 100%;
  padding: var(--space-1) 0 var(--space-2);
}

.hl-row {
  display: flex;
  align-items: flex-start;
  min-height: calc(1em * var(--leading-normal));
  white-space: pre;
  width: 100%;
}

.hl-gutter {
  flex: none;
  box-sizing: content-box;
  min-width: var(--gutter-ch, 4ch);
  padding: 0 var(--space-2);
  text-align: right;
  color: var(--color-text-faint);
  user-select: none;
  border-right: 0.5px solid var(--color-line);
  font-variant-numeric: tabular-nums;
}

.hl-sign {
  flex: none;
  width: 16px;
  text-align: center;
  color: var(--color-text-muted);
  user-select: none;
}

.hl-text {
  flex: none;
  padding-right: 14px;
  white-space: pre;
  color: var(--color-text);
}
.hl-gutter + .hl-text {
  padding-left: var(--space-2);
}

.row-add {
  background: var(--color-diff-add-bg);
}
.row-add .hl-sign {
  color: var(--color-success);
}

.row-del {
  background: var(--color-diff-del-bg);
}
.row-del .hl-sign {
  color: var(--color-danger);
}

.row-hunk {
  background: var(--color-surface-sunken);
}
.row-hunk .hl-text {
  color: var(--color-text-muted);
}

/* A left accent bar marks the change while the code text keeps its ink. */
.hl-code.gutter .row-add {
  box-shadow: inset 2px 0 color-mix(in srgb, var(--color-success) 55%, transparent);
}
.hl-code.gutter .row-del {
  box-shadow: inset 2px 0 color-mix(in srgb, var(--color-danger) 55%, transparent);
}

/* Word wrap: the rows take the pane width and long lines fold. */
.hl-code.wrap .hl-body {
  width: 100%;
}
.hl-code.wrap .hl-text {
  flex: 1 1 auto;
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
