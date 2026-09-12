<!-- apps/kimi-web/src/components/chat/DockWorkPanel.vue -->
<!-- The floating panel a dock pill opens, ported from upstream's `.dock-work-panel`:
     a head carrying the kind's tab (glyph, name, meta such as "1 running") and its
     actions, then the kind's body. Upstream anchors it to the workbar with
     `bottom: 100%` and grows it from the clicked pill via `transform-origin`.
     The head's filter control is upstream's `FilterControl`: a segmented control
     while the panel is wide, and the same options behind a dropdown trigger
     (`fc-trigger`) when it is compact — the shape follows the space, not the
     kind. Callers pass the dropdown form as `dropdown`, or slot the segmented
     control into `#filter`; both land inside `span.filter-control`. -->
<script lang="ts">
/** The four kinds a dock pill can open. `subagents` is the pill's id; upstream
    names the panel `panel-subagent`. */
export type DockPanelKind = 'plan' | 'bash' | 'subagents' | 'todos';
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import type { IconName } from '../../lib/icons';
import Icon from '../ui/Icon.vue';
import Menu from '../ui/Menu.vue';
import MenuItem from '../ui/MenuItem.vue';

const props = defineProps<{
  kind: DockPanelKind;
  /** Tab text — upstream's pill label ("Bash", "Background Agent", …). */
  title: string;
  /** Tab glyph, the same one the pill carries. */
  icon: IconName;
  /** State after the title ("1 running", "1/3", "Pending review"); omitted when
      the kind has nothing to report. */
  meta?: string;
  /** Horizontal centre of the pill that opened the panel, in workbar pixels —
      upstream's `transform-origin`. */
  originX: number;
  /** Upstream's `fc-trigger`: a pill showing the current filter, opening a menu.
      Kinds with a segmented control leave this out and use the slot. */
  dropdown?: { value: string; options: { value: string; label: string; icon: IconName }[] };
}>();

const emit = defineEmits<{ 'update:dropdown': [value: string] }>();

const open = ref(false);
const triggerRef = ref<HTMLButtonElement | null>(null);
const menuRef = ref<InstanceType<typeof Menu> | null>(null);
const menuStyle = ref<Record<string, string>>({});

const currentOption = computed(() =>
  props.dropdown?.options.find((option) => option.value === props.dropdown?.value),
);

/** The panel's class is upstream's: the subagent kind drops the plural. */
const panelClass = computed(() => (props.kind === 'subagents' ? 'panel-subagent' : `panel-${props.kind}`));

function onDocClick(event: MouseEvent): void {
  const target = event.target as Node;
  if (menuRef.value?.el?.contains(target) || triggerRef.value?.contains(target)) return;
  closeMenu();
}

function closeMenu(): void {
  open.value = false;
  document.removeEventListener('mousedown', onDocClick);
  window.removeEventListener('resize', closeMenu);
}

/** Same anchored-panel placement the task pane's copy menu uses: below the
 *  trigger, flipped above when it would run past the window, right-aligned. */
async function toggleMenu(): Promise<void> {
  if (open.value) {
    closeMenu();
    return;
  }
  open.value = true;
  document.addEventListener('mousedown', onDocClick);
  window.addEventListener('resize', closeMenu);
  await nextTick();
  const trigger = triggerRef.value;
  const menu = menuRef.value?.el;
  if (!trigger || !menu) return;
  const rect = trigger.getBoundingClientRect();
  const gap = 4;
  const margin = 8;
  let top = rect.bottom + gap;
  if (top + menu.offsetHeight > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - menu.offsetHeight - gap);
  }
  let left = rect.right - menu.offsetWidth;
  if (left < margin) left = margin;
  menuStyle.value = { top: `${Math.round(top)}px`, left: `${Math.round(left)}px` };
}

function pick(value: string): void {
  emit('update:dropdown', value);
  closeMenu();
}

onBeforeUnmount(closeMenu);
</script>

<template>
  <div
    class="dock-work-panel lg-glass lg-lens"
    :class="panelClass"
    :style="{ transformOrigin: `${originX}px 100%` }"
  >
    <div class="dock-work-head">
      <span class="wp-head-tab">
        <Icon :name="icon" size="md" />
        <span>{{ title }}</span>
        <span v-if="meta" class="wp-head-meta">{{ meta }}</span>
      </span>
      <span class="wp-head-actions">
        <span v-if="dropdown || $slots.filter" class="filter-control">
          <button
            v-if="dropdown"
            ref="triggerRef"
            type="button"
            class="ui-pill fc-trigger"
            aria-haspopup="menu"
            :aria-expanded="open"
            @click.stop="toggleMenu"
          >
            <Icon :name="currentOption?.icon ?? 'clock'" size="sm" />
            <span>{{ currentOption?.label ?? '' }}</span>
            <Icon class="fc-chevron" name="chevron-down" size="sm" />
          </button>
          <Menu v-if="dropdown && open" ref="menuRef" :style="menuStyle">
            <MenuItem
              v-for="option in dropdown.options"
              :key="option.value"
              :active="option.value === dropdown.value"
              @click="pick(option.value)"
            >
              {{ option.label }}
            </MenuItem>
          </Menu>
          <slot name="filter" />
        </span>
        <slot name="actions" />
      </span>
    </div>
    <div class="dock-work-body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.dock-work-panel {
  position: absolute;
  left: 16px;
  right: calc(16px + var(--panes-scrollbar-width, 0px));
  bottom: 100%;
  margin-bottom: var(--space-2);
  max-height: min(360px, 50vh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 0.5px solid var(--color-line);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-menu);
  user-select: none;
}
.dock-work-head {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: 0.5px solid var(--color-line);
}
/* The task-like kinds drop the head's rule and the body's side padding, so the
   list can run edge to edge like upstream's. */
.dock-work-panel.panel-bash .dock-work-head,
.dock-work-panel.panel-subagent .dock-work-head,
.dock-work-panel.panel-todos .dock-work-head {
  padding: var(--space-4) var(--space-4) 0;
  border-bottom: none;
}
.dock-work-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: var(--space-2) var(--space-3);
  overflow-y: auto;
}
.dock-work-panel.panel-bash .dock-work-body,
.dock-work-panel.panel-subagent .dock-work-body,
.dock-work-panel.panel-todos .dock-work-body {
  margin-top: var(--space-3);
  padding: 0 var(--space-4) var(--space-4);
}
.wp-head-tab {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-family: var(--font-ui);
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  line-height: 1;
  white-space: nowrap;
}
.wp-head-tab > svg {
  width: 1.5em;
  height: 1.5em;
}
.wp-head-meta {
  color: var(--color-text-muted);
}
.wp-head-actions {
  flex: none;
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
.filter-control {
  display: inline-flex;
  min-width: 0;
}
/* Upstream's dropdown trigger: a pill carrying the current filter's glyph, its
   word, and a chevron that points up while the menu is open. */
.fc-trigger {
  gap: 6px;
  min-height: 36px;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--color-text-muted);
  font-family: var(--font-ui);
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
}
.fc-trigger:hover {
  color: var(--color-text-strong);
}
.fc-trigger .fc-chevron {
  transition: transform var(--duration-base) var(--ease-out);
}
.fc-trigger[aria-expanded='true'] .fc-chevron {
  transform: rotate(180deg);
}
.dock-work-body :deep(.taskspane) {
  border: none;
  background: transparent;
  padding: 0;
}
/* Upstream keeps the pane's own filter control hidden inside the panel — the
   head carries it. */
.dock-work-body :deep(.taskspane .tp-head) {
  display: none;
}
</style>
