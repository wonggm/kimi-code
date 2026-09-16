<!-- apps/kimi-web/src/components/chat/PanelTabs.vue -->
<!-- Upstream's right panel, re-implemented in our source: an `aside.global-preview`
     that is ALWAYS in the DOM and parks itself with `aria-hidden` + `inert` when
     nothing is open, a `pt-shell` that carries the measured `--pfc-host-h`, the
     `panel-tab-bar` strip with its tail (New tab, expand/collapse, Close) and add
     menu, a `pt-body` holding the active pane (or the `pl` launcher when the panel
     has no tabs), and the `pfc-host` layer for floating cards.

     The state lives with the caller: it passes the tab list and the active id and
     hears back through `activate` / `close` / `add` / `toggle-expanded` / `hide`.
     The pane itself is a slot so the data wiring stays where the data lives. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { PANEL_TAB_RULES, type PanelTab } from '../../lib/panelTabs';
import type { IconName } from '../../lib/icons';
import Icon from '../ui/Icon.vue';
import IconButton from '../ui/IconButton.vue';
import Menu from '../ui/Menu.vue';
import MenuItem from '../ui/MenuItem.vue';
import Tooltip from '../ui/Tooltip.vue';

const props = defineProps<{
  tabs: PanelTab[];
  activeTabId: string | null;
  visible: boolean;
  expanded: boolean;
  /** Upstream offers the expand toggle only on a pointer-width layout. */
  canExpand: boolean;
  mobile: boolean;
  previewWidth: number;
  canOpenDiff: boolean;
  canOpenSideChat: boolean;
  /** The drag handle's bounds, upstream's `PREVIEW_MIN` and its computed max. */
  minWidth?: number;
  maxWidth?: number;
  /** Suppress the width transition while the handle is being dragged or the
   *  session is switching, as upstream's `no-anim` class does. */
  noAnim?: boolean;
  /** Titles an agent tab from the agent it shows; upstream resolves the same
   *  name from the live task rows. `undefined` falls back to the i18n label. */
  agentTitle?: (subagentId: string) => string | undefined;
}>();

const emit = defineEmits<{
  activate: [id: string];
  close: [id: string];
  /** Upstream's add menu and launcher offer the same two entries. */
  add: [kind: 'diff' | 'btw'];
  'toggle-expanded': [];
  hide: [];
  'update:preview-width': [width: number];
  dragging: [value: boolean];
}>();

const { t } = useI18n();

const tabsEl = ref<HTMLElement | null>(null);
const pfcHostEl = ref<HTMLElement | null>(null);

/** Upstream drops the Changes entry from the add menu once a diff tab exists:
 *  the diff tab is a singleton, so the entry could only re-focus what is
 *  already open. */
const hasDiffTab = computed(() => props.tabs.some((tab) => tab.kind === 'diff'));
const addOpen = ref(false);
const addBtnRef = ref<InstanceType<typeof IconButton> | null>(null);

/** The host layer's height feeds `--pfc-host-h`, as upstream measures it. */
const hostHeight = ref(0);
let hostObserver: ResizeObserver | null = null;

watch(
  pfcHostEl,
  (el) => {
    hostObserver?.disconnect();
    hostObserver = null;
    hostHeight.value = el?.offsetHeight ?? 0;
    if (el && typeof ResizeObserver !== 'undefined') {
      hostObserver = new ResizeObserver(() => {
        hostHeight.value = el.offsetHeight;
      });
      hostObserver.observe(el);
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => hostObserver?.disconnect());

function iconFor(tab: PanelTab): IconName {
  return PANEL_TAB_RULES[tab.kind].icon;
}

/** Upstream titles the path kinds from their payload (the basename), an agent
 *  tab from the agent itself, and the rest from i18n; a terminal carries its own
 *  title when it has one. */
function titleFor(tab: PanelTab): string {
  switch (tab.kind) {
    case 'file':
    case 'turn-diff':
      return basename(tab.path);
    case 'agent':
      return props.agentTitle?.(tab.subagentId) ?? t(PANEL_TAB_RULES.agent.i18nKey ?? 'panel.tabs.agent');
    case 'term':
      return tab.title ?? t('panel.tabs.term');
    case 'btw':
      return tab.seq === 1 ? t('sideChat.title') : `${t('sideChat.title')} ${tab.seq}`;
    default: {
      const key = PANEL_TAB_RULES[tab.kind].i18nKey;
      return key ? t(key) : tab.kind;
    }
  }
}

function basename(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) ?? path;
}

/** Arrow keys walk the strip, as upstream's does. */
function onTabKey(event: KeyboardEvent, index: number): void {
  const tabs = props.tabs;
  let next: number | null = null;
  if (event.key === 'ArrowLeft') next = Math.max(0, index - 1);
  else if (event.key === 'ArrowRight') next = Math.min(tabs.length - 1, index + 1);
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = tabs.length - 1;
  if (next === null || next === index) return;
  event.preventDefault();
  const tab = tabs[next];
  if (!tab) return;
  emit('activate', tab.id);
  const buttons = tabsEl.value?.querySelectorAll<HTMLElement>('.ptb-tab-main');
  buttons?.[next]?.focus();
}

function toggleAdd(): void {
  addOpen.value = !addOpen.value;
  if (!addOpen.value) return;
  document.addEventListener('mousedown', onDocClick, true);
  window.addEventListener('keydown', onAddKey, true);
}

function closeAdd(refocus = false): void {
  if (!addOpen.value) return;
  addOpen.value = false;
  document.removeEventListener('mousedown', onDocClick, true);
  window.removeEventListener('keydown', onAddKey, true);
  if (refocus) addBtnRef.value?.$el?.focus?.();
}

function onDocClick(event: MouseEvent): void {
  const target = event.target as Node;
  if (tabsEl.value?.contains(target) || addBtnRef.value?.$el?.contains(target)) return;
  closeAdd();
}

function onAddKey(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  event.stopPropagation();
  event.preventDefault();
  closeAdd(true);
}

function pick(kind: 'diff' | 'btw'): void {
  closeAdd(true);
  emit('add', kind);
}

watch(
  () => [props.visible, props.activeTabId],
  () => closeAdd(),
);

/** The resize handle shows on a pointer-width panel that is neither collapsed
 *  nor expanded — upstream's own condition. Its drag mirrors upstream's
 *  `PanelResize`: the handle sits on the panel's left edge, so dragging left
 *  widens (`reverse`), the width applies live, and it is clamped to the bounds
 *  the caller passes. */
const resizeVisible = computed(() => props.visible && !props.mobile && !props.expanded);
const minWidth = computed(() => props.minWidth ?? 320);
const maxWidth = computed(() => props.maxWidth ?? Number.POSITIVE_INFINITY);

let dragStartX = 0;
let dragStartWidth = 0;
let dragging = false;

function clampWidth(width: number): number {
  return Math.min(maxWidth.value, Math.max(minWidth.value, Math.round(width)));
}

function onResizePointerDown(event: PointerEvent): void {
  dragging = true;
  dragStartX = event.clientX;
  dragStartWidth = props.previewWidth;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  emit('dragging', true);
  event.preventDefault();
}

function onResizePointerMove(event: PointerEvent): void {
  if (!dragging) return;
  emit('update:preview-width', clampWidth(dragStartWidth - (event.clientX - dragStartX)));
}

function endResize(event: PointerEvent): void {
  if (!dragging) return;
  dragging = false;
  (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  emit('dragging', false);
}

/** Arrow keys nudge, Home/End jump to the bounds — the handle is a separator. */
function onResizeKey(event: KeyboardEvent): void {
  const step = 16;
  let next: number | null = null;
  if (event.key === 'ArrowLeft') next = props.previewWidth + step;
  else if (event.key === 'ArrowRight') next = props.previewWidth - step;
  else if (event.key === 'Home') next = minWidth.value;
  else if (event.key === 'End') next = maxWidth.value;
  if (next === null) return;
  event.preventDefault();
  emit('update:preview-width', clampWidth(next));
}
</script>

<template>
  <aside
    class="global-preview"
    :class="{ open: visible, mobile, expanded, 'no-anim': noAnim }"
    role="complementary"
    :aria-label="t('layout.detailPanelAria')"
    :aria-hidden="!visible"
    :inert="!visible"
    :style="{ '--preview-w': `${previewWidth}px` }"
  >
    <div
      v-if="resizeVisible"
      class="panel-resize"
      role="separator"
      aria-orientation="vertical"
      :aria-label="t('layout.resizePreviewAria')"
      :tabindex="0"
      @pointerdown="onResizePointerDown"
      @pointermove="onResizePointerMove"
      @pointerup="endResize"
      @pointercancel="endResize"
      @keydown="onResizeKey"
    />
    <div class="pt-shell" :style="{ '--pfc-host-h': `${hostHeight}px` }">
      <div class="panel-tab-bar">
        <div ref="tabsEl" class="ptb-tabs" role="tablist">
          <div
            v-for="(tab, index) in tabs"
            :key="tab.id"
            class="ptb-tab"
            :class="{ on: tab.id === activeTabId }"
          >
            <button
              type="button"
              class="ptb-tab-main"
              role="tab"
              :aria-selected="tab.id === activeTabId"
              :tabindex="tab.id === activeTabId ? 0 : -1"
              :title="titleFor(tab)"
              @click="emit('activate', tab.id)"
              @keydown="onTabKey($event, index)"
            >
              <Icon :name="iconFor(tab)" size="sm" />
              <span>{{ titleFor(tab) }}</span>
            </button>
            <button
              type="button"
              class="ptb-x"
              :aria-label="t('panel.closeTab')"
              :tabindex="tab.id === activeTabId ? 0 : -1"
              @click="emit('close', tab.id)"
            >
              <Icon name="close" size="sm" />
            </button>
          </div>
        </div>
        <div class="ptb-tail">
          <Tooltip :text="t('panel.newTab')">
            <IconButton
              ref="addBtnRef"
              class="ptb-add"
              size="sm"
              :label="t('panel.newTab')"
              :aria-haspopup="'menu'"
              :aria-expanded="addOpen"
              @click="toggleAdd"
            >
              <Icon name="plus" />
            </IconButton>
          </Tooltip>
          <Tooltip v-if="canExpand && tabs.length > 0" :text="expanded ? t('panel.collapse') : t('panel.expand')">
            <IconButton
              class="ptb-expand"
              size="sm"
              :label="expanded ? t('panel.collapse') : t('panel.expand')"
              @click="emit('toggle-expanded')"
            >
              <Icon :name="expanded ? 'collapse' : 'expand'" />
            </IconButton>
          </Tooltip>
          <Tooltip :text="t('panel.hide')">
            <IconButton class="ptb-hide" size="sm" :label="t('panel.hide')" @click="emit('hide')">
              <Icon :name="mobile ? 'close' : 'right-panel'" />
            </IconButton>
          </Tooltip>
        </div>
        <Menu v-if="addOpen" class="panel-add-menu">
          <MenuItem :size="mobile ? 'lg' : 'md'" :disabled="!canOpenSideChat" @click="pick('btw')">
            <Icon name="message" /> {{ t('sideChat.title') }}
          </MenuItem>
          <MenuItem v-if="!hasDiffTab" :size="mobile ? 'lg' : 'md'" :disabled="!canOpenDiff" @click="pick('diff')">
            <Icon name="git-fork" /> {{ t('panel.tabs.diff') }}
          </MenuItem>
        </Menu>
      </div>

      <div class="pt-body">
        <slot v-if="activeTabId" />
        <!-- Upstream composes the launcher from its menu-item primitive, which
             carries its own border and radius. A bare `.ui-button` here picked
             up the user-agent button chrome instead (measured with the glass
             toggle off: `2px outset`, radius 0, against upstream's
             `ui-menu-item` at radius 8 with no border). -->
        <div v-else-if="tabs.length === 0" class="pl" role="group" :aria-label="t('panel.launcherAria')">
          <MenuItem :size="mobile ? 'lg' : 'md'" :disabled="!canOpenDiff" @click="emit('add', 'diff')">
            <Icon name="git-fork" size="sm" /> {{ t('panel.tabs.diff') }}
          </MenuItem>
          <MenuItem :size="mobile ? 'lg' : 'md'" :disabled="!canOpenSideChat" @click="emit('add', 'btw')">
            <Icon name="message" size="sm" /> {{ t('sideChat.title') }}
          </MenuItem>
        </div>
      </div>

      <div ref="pfcHostEl" class="pfc-host" />
    </div>
  </aside>
</template>

<style scoped>
/* Geometry, spacing and type are upstream's own numbers, taken from its
   stylesheet (the `panel-*` tokens above carry them). Upstream places this aside
   in a four-column grid; our layout is a flex row, so the panel keeps upstream's
   width rule and drops the grid placement. */
.global-preview {
  --preview-w: var(--panel-default-w);
  position: relative;
  flex: none;
  min-width: 0;
  min-height: 0;
  width: 0;
  overflow: hidden;
  background: var(--color-bg);
}
.global-preview.open {
  width: var(--preview-w);
}
/* Upstream's panel is a grid item, so its `width: auto` on expand fills the
   rest of the row and the conversation column collapses to nothing. Ours is a
   flex row, where `width: auto` resolves to the content width — the panel
   shrank on expand (measured 585 → 462px against upstream's 585 → 1170). A
   full-width basis reproduces upstream's geometry. */
.global-preview.expanded {
  flex: 1 0 100%;
  width: auto;
}
.global-preview.no-anim {
  transition: none;
}
.global-preview.mobile {
  position: fixed;
  inset: 0;
  z-index: var(--z-sticky);
  width: auto;
  transition: none;
  border-top: var(--p-hairline) solid var(--color-text);
}
/* Closed on a phone, the panel must not exist on screen: the rule above is a
   full-viewport fixed overlay, so a parked (aria-hidden, inert) aside still
   painted an opaque layer over the conversation — you landed inside the panel
   and could not get out. Upstream never shows this state because its mobile
   shell does not mount the conversation pane at landing at all, so there is no
   upstream rule to copy; hiding the closed overlay is the fork's equivalent. */
.global-preview.mobile:not(.open) {
  display: none;
}
.pt-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
}
.global-preview:not(.mobile) .pt-shell {
  width: var(--preview-w);
  border-left: var(--p-hairline) solid var(--color-line);
}
.global-preview:not(.mobile).expanded .pt-shell {
  width: auto;
  border-left: none;
}
.panel-resize {
  position: absolute;
  left: var(--space-05);
  top: 0;
  bottom: 0;
  width: var(--space-2);
  cursor: col-resize;
  z-index: var(--z-sticky);
  touch-action: none;
}
.panel-resize:focus-visible {
  outline: none;
  box-shadow: var(--p-focus-ring);
}
.panel-tab-bar {
  position: relative;
  height: var(--panel-head-h);
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-05);
  padding: 0 var(--space-4) 0 var(--space-2);
  border-bottom: var(--p-hairline) solid var(--color-line);
}
.ptb-tabs {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-05);
  overflow-x: auto;
  scrollbar-width: none;
}
.ptb-tabs::-webkit-scrollbar {
  display: none;
}
.ptb-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1-5);
  height: var(--panel-tab-h);
  max-width: var(--panel-tab-max-w);
  min-width: 0;
  flex: none;
  padding: 0 var(--space-1-5) 0 var(--panel-tab-pad-x);
  border-radius: var(--radius-md);
  background: var(--color-hover);
  color: var(--color-text-muted);
  transition: background var(--duration-base) var(--ease-out), color var(--duration-base) var(--ease-out);
}
.ptb-tab:hover {
  background: var(--color-selected);
  color: var(--color-text);
}
.ptb-tab.on {
  background: var(--color-selected-hover);
  color: var(--color-text);
}
.ptb-tab-main {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1-5);
  flex: 1;
  min-width: 0;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: none;
  cursor: pointer;
}
.ptb-tab-main > span {
  overflow: hidden;
  text-overflow: ellipsis;
}
.ptb-tab-main:focus-visible {
  outline: none;
  border-radius: var(--radius-xs);
  box-shadow: var(--p-focus-ring);
}
.ptb-x {
  /* Upstream positions this button and its touch-target `::after` against
     itself. Without this the `::after` below anchors to `.ptb-tab`, so the
     close control's hit area covered the whole tab and a click on the tab
     closed it (measured: the tab's centre hit-tested to the close button). */
  position: relative;
  width: var(--panel-tab-x-size);
  height: var(--panel-tab-x-size);
  flex: none;
  padding: 0;
  border: none;
  border-radius: var(--radius-xs);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  color: var(--color-text-faint);
  cursor: pointer;
}
.ptb-x:hover {
  background: var(--color-well);
  color: var(--color-text);
}
.ptb-x:focus-visible {
  outline: none;
  box-shadow: var(--p-focus-ring);
}
/* Hit targets stay at the touch minimum even though the glyph is 18px. */
.ptb-x::after {
  content: '';
  position: absolute;
  inset: calc(-1 * (var(--touch-target-min) - var(--panel-tab-x-size)) / 2);
}
.ptb-tail {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-05);
  padding-left: var(--space-1);
}
.ptb-tail :deep(.ui-icon-button) {
  position: relative;
}
.ptb-tail :deep(.ui-icon-button)::after {
  content: '';
  position: absolute;
  inset: calc(-1 * (var(--touch-target-min) - var(--icon-button-sm)) / 2);
}
.panel-add-menu {
  position: absolute;
  top: calc(var(--panel-head-h) - var(--space-1-5));
  right: var(--space-4);
  z-index: var(--z-dropdown);
}
.pt-body {
  flex: 1;
  min-height: 0;
}
.pt-body > * {
  height: 100%;
  box-sizing: border-box;
}
.pl {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-3);
  height: 100%;
  box-sizing: border-box;
  width: min(var(--panel-launcher-w), 100%);
  margin-inline: auto;
  padding: var(--space-2) 0;
}
.pfc-host {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: var(--z-sticky);
  width: 100%;
  max-width: var(--p-content-max);
  margin: 0 auto;
  box-sizing: border-box;
  padding: 0 var(--space-4) var(--space-4);
}
.pfc-host:empty {
  padding: 0;
}
</style>
