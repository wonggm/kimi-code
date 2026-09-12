<!-- apps/kimi-web/src/components/chat/TasksPane.vue -->
<!-- Background bash task panel (dock "Bash"): a status filter on top, the
     task list on the left and the selected task's command + output on the
     right. Clicking a row selects it and fills the detail pane; running rows
     keep an inline Stop button. -->
<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TaskItem } from '../../types';
import { BASH_FILTERS, filterBashTasks, type BashFilter } from '../../lib/bashTaskFilter';
import { copyTextToClipboard } from '../../lib/clipboard';
import { composeTaskCopyPayload, type TaskCopyKind } from '../../lib/taskCopy';
import SegmentedControl from '../ui/SegmentedControl.vue';
import IconButton from '../ui/IconButton.vue';
import Icon from '../ui/Icon.vue';
import Menu from '../ui/Menu.vue';
import MenuItem from '../ui/MenuItem.vue';
import StatusGlyph, { type StatusGlyphStatus } from './StatusGlyph.vue';
import type { DetachTaskTarget } from '../../lib/detachTarget';

const props = defineProps<{ tasks: TaskItem[] }>();

const emit = defineEmits<{
  cancel: [taskId: string];
  /** Send a still-running foreground bash task to the background. */
  detach: [target: DetachTaskTarget];
}>();

const { t } = useI18n();

const filters = computed(() =>
  BASH_FILTERS.map((filter) => ({ value: filter.value, label: t(filter.labelKey), icon: filter.icon })),
);

// Upstream's default segment is Recent; the pane owns this state in the right
// panel (the dock panel's head drives its own list instead).
const activeFilter = ref<BashFilter>('recent');

const visibleTasks = computed(() => filterBashTasks(props.tasks, activeFilter.value));

// Clicked row id. The detail pane is derived from it, so switching filters to
// a view that hides the row simply empties the detail side (the selection
// survives in case the filter is switched back).
const selectedId = ref<string | null>(null);

const selected = computed(() => visibleTasks.value.find((task) => task.id === selectedId.value) ?? null);

const EMPTY_BY_FILTER: Record<BashFilter, string> = {
  recent: 'tasks.emptyRecent',
  all: 'tasks.emptyBash',
  running: 'tasks.bash.emptyRunning',
  done: 'tasks.bash.emptyDone',
};

// ---------------------------------------------------------------------------
// Task detail copy menu: one trigger opens a menu with copy command / copy
// output / copy all (command + output joined by a blank line). A single
// "copied" feedback flips the trigger icon for whichever item last fired.
// ---------------------------------------------------------------------------
const copiedKind = ref<TaskCopyKind | null>(null);

const selectedPayload = computed(() =>
  selected.value
    ? composeTaskCopyPayload(selected.value.meta, selected.value.output)
    : null,
);
const copyCommandAvailable = computed(() => Boolean(selectedPayload.value?.command));
const copyOutputAvailable = computed(() => Boolean(selectedPayload.value?.output));
const copyAnything = computed(() => Boolean(selectedPayload.value?.all));

const menuOpen = ref(false);
const triggerRef = ref<InstanceType<typeof IconButton> | null>(null);
const menuRef = ref<InstanceType<typeof Menu> | null>(null);
const menuStyle = ref<Record<string, string>>({});

function onDocClick(e: MouseEvent): void {
  const target = e.target as Node;
  if (menuRef.value?.el?.contains(target) || triggerRef.value?.el?.contains(target)) return;
  closeMenu();
}

function onScrollOrResize(): void {
  closeMenu();
}

async function toggleMenu(e: Event): Promise<void> {
  e.stopPropagation();
  if (menuOpen.value) {
    closeMenu();
    return;
  }
  if (!copyAnything.value) return;
  menuOpen.value = true;
  document.addEventListener('mousedown', onDocClick);
  window.addEventListener('resize', onScrollOrResize);
  await nextTick();
  const btn = triggerRef.value?.el;
  const menu = menuRef.value?.el;
  if (!btn || !menu) return;
  const r = btn.getBoundingClientRect();
  const gap = 4;
  const margin = 8;
  const menuW = menu.offsetWidth;
  const menuH = menu.offsetHeight;
  let top = r.bottom + gap;
  if (top + menuH > window.innerHeight - margin) {
    top = Math.max(margin, r.top - menuH - gap);
  }
  let left = r.right - menuW;
  if (left < margin) left = margin;
  menuStyle.value = {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
  };
}

function closeMenu(): void {
  menuOpen.value = false;
  document.removeEventListener('mousedown', onDocClick);
  window.removeEventListener('resize', onScrollOrResize);
}

onUnmounted(() => {
  document.removeEventListener('mousedown', onDocClick);
  window.removeEventListener('resize', onScrollOrResize);
});

async function onCopyPayload(kind: TaskCopyKind): Promise<void> {
  const text = selectedPayload.value?.[kind] ?? '';
  if (!text) return;
  closeMenu();
  const ok = await copyTextToClipboard(text);
  if (!ok) return;
  copiedKind.value = kind;
  setTimeout(() => {
    if (copiedKind.value === kind) copiedKind.value = null;
  }, 1500);
}

function select(task: TaskItem): void {
  selectedId.value = task.id;
}

function hasDetail(task: TaskItem): boolean {
  return Boolean((task.output && task.output.length > 0) || task.meta);
}

// Detach only applies to tasks still running in the foreground.
function canDetach(task: TaskItem): boolean {
  return task.state === 'run' && task.runInBackground !== true;
}

function glyphStatus(state: string): StatusGlyphStatus {
  // 'cancel' falls through to 'pending' — the muted glyph, deliberately not
  // the danger (fail) or success (done) coloring.
  if (state === 'run' || state === 'done' || state === 'fail') return state;
  return 'pending';
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
            task.runInBackground,
            selectedId === task.id,
          ]"
          class="tp-row"
          :class="{
            done: task.state === 'done',
            fail: task.state === 'fail',
            cancel: task.state === 'cancel',
            selected: selectedId === task.id,
          }"
          :role="hasDetail(task) ? 'button' : undefined"
          :aria-pressed="selectedId === task.id || undefined"
          @click="hasDetail(task) && select(task)"
        >
          <StatusGlyph :status="glyphStatus(task.state)" />
          <span v-if="task.state === 'cancel'" class="tp-state">{{ t('tasks.stateCancelled') }}</span>
          <span class="tp-name">{{ task.name }}</span>
          <span class="tp-time">{{ task.timing }}</span>
          <button
            v-if="canDetach(task)"
            class="tp-detach"
            @click.stop="emit('detach', { taskId: task.id, command: task.meta })"
          >{{ t('tasks.sendToBackground') }}</button>
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
            <span v-if="selected.state === 'cancel'" class="tp-state">{{ t('tasks.stateCancelled') }}</span>
            <span class="tp-detail-name">{{ selected.name }}</span>
            <span class="tp-detail-time">{{ selected.timing }}</span>
            <button
              v-if="canDetach(selected)"
              class="tp-detach"
              @click.stop="emit('detach', { taskId: selected.id, command: selected.meta })"
            >{{ t('tasks.sendToBackground') }}</button>
            <button
              v-if="selected.state === 'run'"
              class="tp-stop"
              @click.stop="emit('cancel', selected.id)"
            >{{ t('tasks.stop') }}</button>
            <IconButton
              ref="triggerRef"
              class="tp-copy-menu"
              :class="{ open: menuOpen }"
              size="sm"
              :label="t('tasks.copy')"
              :disabled="!copyAnything"
              aria-haspopup="menu"
              :aria-expanded="menuOpen"
              @click.stop="toggleMenu($event)"
            >
              <Icon :name="copiedKind ? 'check' : 'copy'" size="sm" />
            </IconButton>
            <Menu
              v-if="menuOpen"
              ref="menuRef"
              class="tp-menu"
              :style="menuStyle"
              @click.stop
            >
              <MenuItem :disabled="!copyCommandAvailable" @click="onCopyPayload('command')">
                <Icon name="terminal" size="sm" />
                {{ copiedKind === 'command' ? t('tasks.copied') : t('tasks.copyCommand') }}
              </MenuItem>
              <MenuItem :disabled="!copyOutputAvailable" @click="onCopyPayload('output')">
                <Icon name="file-text" size="sm" />
                {{ copiedKind === 'output' ? t('tasks.copied') : t('tasks.copyOutput') }}
              </MenuItem>
              <MenuItem separator />
              <MenuItem :disabled="!copyAnything" @click="onCopyPayload('all')">
                <Icon name="copy" size="sm" />
                {{ copiedKind === 'all' ? t('tasks.copied') : t('tasks.copyAll') }}
              </MenuItem>
            </Menu>
          </div>
          <div v-if="selected.meta" class="tp-codebox">
            <pre class="tp-pre"><code><span class="tp-cmd">{{ selected.meta }}</span></code></pre>
          </div>
          <div v-if="selected.output && selected.output.length > 0" class="tp-codebox">
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
.tp-row.cancel .tp-name {
  color: var(--color-text-muted);
}

.tp-state {
  flex: none;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
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

/* Neutral sibling of .tp-stop — detach keeps the task running, so it must not
   borrow the danger styling. */
.tp-detach {
  flex: none;
  background: none;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  padding: 1px var(--space-2);
  cursor: pointer;
}
.tp-detach:hover {
  color: var(--color-text);
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
  min-width: 0;
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

/* Copy menu trigger + float, anchored to the detail head row (same pattern as
   the header kebab menu: fixed positioning, surface/items from Menu + MenuItem). */
.tp-copy-menu.open {
  background: var(--color-surface-sunken);
  color: var(--color-text);
}
.tp-menu {
  position: fixed;
  top: 0;
  left: 0;
  z-index: var(--z-dropdown);
}

.tp-codebox {
  flex: none;
  background: var(--color-surface-sunken);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
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