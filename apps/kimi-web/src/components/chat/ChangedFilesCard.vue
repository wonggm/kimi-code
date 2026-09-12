<!-- apps/kimi-web/src/components/chat/ChangedFilesCard.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Icon from '../ui/Icon.vue';
import { useSelectionCapture } from '../../composables/useSelectionQuote';

const props = defineProps<{
  /** File paths changed during the turn, in display order. */
  files: string[];
  /** Number of paths shown before the list can be expanded. */
  collapsedLimit?: number;
}>();

const { t } = useI18n();
const expanded = ref(false);

// Selecting a changed path opens the app-wide quote bubble, so the per-turn
// changes panel can be quoted into the chat.
const rootRef = ref<HTMLElement | null>(null);
useSelectionCapture(() => rootRef.value);
const collapsedLimit = computed(() => props.collapsedLimit ?? 5);
const canExpand = computed(() => props.files.length > collapsedLimit.value);
const visibleFiles = computed(() =>
  expanded.value || !canExpand.value ? props.files : props.files.slice(0, collapsedLimit.value),
);

function toggle(): void {
  if (canExpand.value) expanded.value = !expanded.value;
}

// Compact display form of a changed path: prefer everything from `/src/`
// onward, else the last two segments of an absolute path. The full path stays
// in the row's `title` tooltip.
function displayPath(path: string): string {
  const srcIdx = path.indexOf('/src/');
  if (srcIdx >= 0) return `…${path.slice(srcIdx)}`;
  if (path.startsWith('/')) {
    const segs = path.split('/').filter(Boolean);
    if (segs.length > 2) return `…/${segs.slice(-2).join('/')}`;
  }
  return path;
}
</script>

<template>
  <section v-if="props.files.length > 0" ref="rootRef" class="changed-files-card lg-glass lg-frost">
    <div class="changed-files-heading">
      <Icon name="file-edit" size="sm" />
      <span>{{ t('conversation.changedFiles.title') }}</span>
      <span class="changed-files-count">{{ props.files.length }}</span>
    </div>
    <ul class="changed-files-list">
      <li v-for="path in visibleFiles" :key="path" class="changed-files-path" :title="path">
        {{ displayPath(path) }}
      </li>
    </ul>
    <button
      v-if="canExpand"
      type="button"
      class="changed-files-toggle lg-glass"
      :aria-expanded="expanded"
      @click="toggle"
    >
      <span>{{ t(expanded ? 'conversation.changedFiles.showLess' : 'conversation.changedFiles.showMore') }}</span>
      <!-- A down chevron expands the collapsed list; up collapses it. -->
      <Icon :name="expanded ? 'chevron-up' : 'chevron-down'" size="sm" />
    </button>
  </section>
</template>

<style scoped>
.changed-files-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-lg);
  color: var(--color-text);
}
.changed-files-heading {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}
.changed-files-count {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}
.changed-files-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}
.changed-files-path {
  overflow: hidden;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.changed-files-toggle {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: var(--space-1);
  min-height: 28px;
  padding: 0 var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  font: inherit;
  font-size: var(--text-xs);
}
.changed-files-toggle:hover { color: var(--color-text); }
</style>
