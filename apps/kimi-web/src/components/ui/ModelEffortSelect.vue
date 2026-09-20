<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Menu from './Menu.vue';
import MenuItem from './MenuItem.vue';
import Icon from './Icon.vue';

export type ModelEffortOption = { value: string; label: string; disabled?: boolean };
export type ModelEffortGroup = { label?: string; options: ModelEffortOption[] };

type Props = {
  modelValue: string;
  effortValue: string;
  groups: ModelEffortGroup[];
  effortGroups: (modelValue: string) => ModelEffortGroup[];
  placeholder?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  ariaLabel?: string;
  /** Render the pinned "More models…" row below the list. It leaves this menu
   *  for the host's full model picker, so the host must handle `@more` — the
   *  row is only shown where that picker exists. */
  showMore?: boolean;
};

const props = withDefaults(defineProps<Props>(), { size: 'md', showMore: false });
const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:effortValue': [value: string];
  more: [];
}>();

const { t } = useI18n();

const open = ref(false);
const submenuOpen = ref(false);
const activeModel = ref<string | null>(null);
const highlightIndex = ref(0);
const triggerRef = ref<HTMLButtonElement | null>(null);
const menuRef = ref<InstanceType<typeof Menu> | null>(null);
const listRef = ref<HTMLElement | null>(null);
const submenuRef = ref<InstanceType<typeof Menu> | null>(null);
const itemRefs = new Map<string, HTMLElement>();
const menuStyle = ref<Record<string, string>>({});
const submenuStyle = ref<Record<string, string>>({});

// The current model's provider group leads; the rest keep the caller's order.
// Groups without a label are caller-side pseudo-entries (the subagent pins'
// leading "Inherit (session model)" row), so they keep their place at the top
// and only the provider groups are reordered. Hoisting the current provider is
// what keeps the common case — a pin in a provider the user already runs — at
// the top of the list instead of below every other provider.
const orderedGroups = computed(() => {
  const plain = props.groups.filter((group) => !group.label);
  const labeled = props.groups.filter((group) => group.label);
  const current = labeled.findIndex((group) =>
    group.options.some((option) => option.value === props.modelValue),
  );
  if (current > 0) {
    const hoisted = labeled.splice(current, 1)[0];
    if (hoisted) labeled.unshift(hoisted);
  }
  return [...plain, ...labeled];
});
const flatOptions = computed(() => orderedGroups.value.flatMap((group) => group.options));
const selectedLabel = computed(() =>
  flatOptions.value.find((option) => option.value === props.modelValue)?.label ?? props.placeholder ?? '',
);
const hasSelection = computed(() => flatOptions.value.some((option) => option.value === props.modelValue));
const activeEffortGroups = computed(() =>
  activeModel.value === null ? [] : props.effortGroups(activeModel.value),
);
const flatEffortOptions = computed(() => activeEffortGroups.value.flatMap((group) => group.options));

function removeListeners(): void {
  document.removeEventListener('mousedown', onDocClick);
  document.removeEventListener('keydown', onKeydown, true);
  window.removeEventListener('resize', onScrollOrResize);
}

function close(): void {
  open.value = false;
  submenuOpen.value = false;
  activeModel.value = null;
  removeListeners();
}

function closeSubmenu(): void {
  submenuOpen.value = false;
  activeModel.value = null;
}

function onDocClick(event: MouseEvent): void {
  const target = event.target as Node;
  if (triggerRef.value?.contains(target)) return;
  if (menuRef.value?.el?.contains(target)) return;
  if (submenuRef.value?.el?.contains(target)) return;
  close();
}

function onScrollOrResize(): void {
  void updatePositions();
}

// The list scrolls inside the panel now, so a row can move under the fixed
// effort submenu. Re-anchor it on the row, and drop it once the row itself has
// scrolled out of the list region — a submenu floating over a row the reader
// can no longer see is worse than no submenu. (Closing on every scroll would
// also break keyboard navigation: ArrowDown focuses a row, the browser scrolls
// it into view, and the event would dismiss the submenu it just opened.)
function onListScroll(): void {
  if (!submenuOpen.value) return;
  const item = activeModel.value === null ? undefined : itemRefs.get(activeModel.value);
  const list = listRef.value;
  if (item && list) {
    const rect = item.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    if (rect.bottom < listRect.top || rect.top > listRect.bottom) {
      closeSubmenu();
      return;
    }
  }
  void updateSubmenuPosition();
}

function focusModel(index: number): void {
  const option = flatOptions.value[index];
  if (!option || option.disabled) return;
  highlightIndex.value = index;
  itemRefs.get(option.value)?.querySelector('button')?.focus();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.target instanceof Element && submenuRef.value?.el?.contains(event.target)) return;
  if (event.key === 'Escape') {
    event.stopPropagation();
    close();
    triggerRef.value?.focus();
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const length = flatOptions.value.length;
    if (length === 0) return;
    let next = highlightIndex.value + step;
    for (let i = 0; i < length; i++) {
      const index = ((next % length) + length) % length;
      const option = flatOptions.value[index];
      if (option && !option.disabled) {
        activateModel(option.value);
        focusModel(index);
        return;
      }
      next += step;
    }
    return;
  }
  if (event.key === 'ArrowRight' && activeModel.value !== null) {
    event.preventDefault();
    focusFirstEffort();
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    // The panel's own controls outside the list (the "More models…" row, the
    // trigger) are plain buttons: Enter/Space there has to reach the browser's
    // activation, not choose the highlighted model.
    if (event.target instanceof Node && !listRef.value?.contains(event.target)) return;
    const option = flatOptions.value[highlightIndex.value];
    if (option && !option.disabled) {
      event.preventDefault();
      selectModel(option.value);
    }
  }
}

function onSubmenuKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' || event.key === 'ArrowLeft') {
    event.preventDefault();
    const model = activeModel.value;
    closeSubmenu();
    itemRefs.get(model ?? '')?.querySelector('button')?.focus();
    return;
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  if (flatEffortOptions.value.length === 0) return;
  event.preventDefault();
  const buttons = submenuRef.value?.el?.querySelectorAll<HTMLButtonElement>('button');
  if (!buttons || buttons.length === 0) return;
  const currentIndex = Array.from(buttons).indexOf(document.activeElement as HTMLButtonElement);
  const step = event.key === 'ArrowDown' ? 1 : -1;
  const nextIndex = ((currentIndex + step + buttons.length) % buttons.length);
  buttons[nextIndex]?.focus();
}

async function updatePositions(): Promise<void> {
  await nextTick();
  const trigger = triggerRef.value;
  const menu = menuRef.value?.el;
  if (!trigger || !menu) return;
  const rect = trigger.getBoundingClientRect();
  const margin = 8;
  const gap = 4;
  const menuWidth = menu.offsetWidth;
  const menuHeight = menu.offsetHeight;
  let top = rect.bottom + gap;
  if (top + menuHeight > window.innerHeight - margin) top = Math.max(margin, rect.top - menuHeight - gap);
  let left = rect.left;
  if (left + menuWidth > window.innerWidth - margin) left = Math.max(margin, rect.right - menuWidth);
  menuStyle.value = { top: `${Math.round(top)}px`, left: `${Math.round(left)}px`, minWidth: `${Math.round(rect.width)}px` };
  await updateSubmenuPosition();
}

async function updateSubmenuPosition(): Promise<void> {
  await nextTick();
  const item = activeModel.value === null ? undefined : itemRefs.get(activeModel.value);
  const submenu = submenuRef.value?.el;
  if (!item || !submenu) return;
  const rect = item.getBoundingClientRect();
  const margin = 8;
  const gap = 4;
  const width = submenu.offsetWidth;
  const height = submenu.offsetHeight;
  const openRight = rect.right + gap + width <= window.innerWidth - margin;
  const left = openRight ? rect.right + gap : Math.max(margin, rect.left - width - gap);
  const top = Math.min(Math.max(margin, rect.top), Math.max(margin, window.innerHeight - height - margin));
  submenuStyle.value = { top: `${Math.round(top)}px`, left: `${Math.round(left)}px` };
}

function activateModel(value: string): void {
  if (activeModel.value === value && submenuOpen.value) return;
  activeModel.value = value;
  submenuOpen.value = true;
  void updateSubmenuPosition();
}

function setItemRef(value: string, element: unknown): void {
  if (element instanceof HTMLElement) itemRefs.set(value, element);
  else itemRefs.delete(value);
}

function focusFirstEffort(): void {
  void nextTick(() => submenuRef.value?.el?.querySelector<HTMLButtonElement>('button')?.focus());
}

function selectModel(value: string): void {
  emit('update:modelValue', value);
  close();
  triggerRef.value?.focus();
}

function selectEffort(effort: string): void {
  const model = activeModel.value;
  if (model === null) return;
  emit('update:modelValue', model);
  emit('update:effortValue', effort);
  close();
  triggerRef.value?.focus();
}

// "More models…" leaves this menu for the host's full picker (the composer's
// own row does the same). The menu closes first so the picker's overlay is not
// fighting the teleported panel for the click.
function openMore(): void {
  close();
  emit('more');
}

async function toggle(): Promise<void> {
  if (props.disabled) return;
  if (open.value) {
    close();
    return;
  }
  open.value = true;
  const index = flatOptions.value.findIndex((option) => option.value === props.modelValue);
  highlightIndex.value = index >= 0 ? index : 0;
  await updatePositions();
  setTimeout(() => document.addEventListener('mousedown', onDocClick), 0);
  document.addEventListener('keydown', onKeydown, true);
  window.addEventListener('resize', onScrollOrResize);
}

watch(flatOptions, (options) => {
  if (highlightIndex.value >= options.length) highlightIndex.value = 0;
});

onBeforeUnmount(() => {
  removeListeners();
});
</script>

<template>
  <div class="sm-picker">
    <button
      ref="triggerRef"
      type="button"
      class="sm-picker__trigger ms-trigger"
      :class="[`ms-trigger--${size}`, { 'ms-trigger--placeholder': !hasSelection, 'ms-trigger--open': open }]"
      :disabled="disabled"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-label="ariaLabel"
      @click.stop="toggle"
      @keydown.enter.prevent="toggle"
      @keydown.space.prevent="toggle"
    >
      <span class="sm-picker__value" :class="{ 'is-placeholder': !hasSelection }">
        <span class="sm-picker__value-text ms-trigger-label">{{ selectedLabel }}</span>
      </span>
      <Icon class="sm-picker__chevron" name="chevron-down" size="sm" />
    </button>

    <Teleport to="body">
      <div v-if="open" class="ms-anchor" :style="menuStyle">
        <Menu ref="menuRef" class="ms-panel">
          <!-- The list owns the scroll. A provider can carry dozens of models,
               so the region is capped and scrolls while the pinned row below it
               (the full picker's entry point) stays put — same split as the
               composer's model menu. The current model's provider group leads
               (orderedGroups) so the usual case sits at the top. -->
          <div ref="listRef" class="ms-list" @scroll="onListScroll">
            <template v-for="(group, gi) in orderedGroups" :key="gi">
              <div v-if="group.label" class="ms-group-label">{{ group.label }}</div>
              <div
                v-for="(option, oi) in group.options"
                :key="`${gi}-${oi}`"
                :ref="(element) => setItemRef(option.value, element)"
                class="ms-item-anchor"
                @mouseenter="activateModel(option.value)"
                @focusin="activateModel(option.value)"
              >
                <MenuItem
                  :active="option.value === modelValue"
                  :disabled="option.disabled"
                  :aria-label="option.label"
                  @click="selectModel(option.value)"
                >
                  <span class="ms-check" aria-hidden="true">
                    <Icon v-if="option.value === modelValue" name="check" size="sm" />
                  </span>
                  <span class="ms-option-label">{{ option.label }}</span>
                  <span class="ms-submenu-arrow" aria-hidden="true">›</span>
                </MenuItem>
              </div>
            </template>
          </div>

          <template v-if="showMore">
            <MenuItem separator />
            <MenuItem class="ms-more" :aria-label="t('status.moreModels')" @click="openMore">
              <span class="ms-check ms-more-icon" aria-hidden="true">
                <Icon name="list-lines" size="sm" />
              </span>
              <span class="ms-option-label">{{ t('status.moreModels') }}</span>
              <Icon class="ms-more-arrow" name="chevron-right" size="sm" />
            </MenuItem>
          </template>
        </Menu>
        <Menu
          v-if="submenuOpen"
          ref="submenuRef"
          class="ms-submenu"
          :style="submenuStyle"
          aria-label="Effort"
          @keydown="onSubmenuKeydown"
        >
          <template v-for="(group, gi) in activeEffortGroups" :key="gi">
            <div v-if="group.label" class="ms-group-label">{{ group.label }}</div>
            <MenuItem
              v-for="(option, oi) in group.options"
              :key="`${gi}-${oi}`"
              :active="option.value === effortValue"
              :disabled="option.disabled"
              :aria-label="option.label"
              @click="selectEffort(option.value)"
            >
              {{ option.label }}
            </MenuItem>
          </template>
        </Menu>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* Wrapper carries the `sm-picker` identity and the radius the glass rim and
   outer shadow in style.css (`.sd .sm-picker`) follow — same pattern as
   ui/MenuSelect.vue. */
.sm-picker {
  position: relative;
  width: 100%;
  border-radius: var(--radius-full);
}
.ms-trigger {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  text-align: left;
  cursor: pointer;
  font-family: var(--font-ui);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
  color: var(--color-text);
  border-radius: var(--radius-full);
  /* Its own hairline, as upstream's select has; the glass rule in style.css
     supplied the rim before and the toggle gates it. */
  border: var(--p-hairline) solid var(--color-line-strong);
  padding: 0 var(--space-4);
}
.ms-trigger--md { height: 38px; }
.ms-trigger--sm { height: 32px; font-size: var(--text-sm); }
.sm-picker__value { flex: 1; display: flex; align-items: center; min-width: 0; overflow: hidden; }
.ms-trigger-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ms-trigger--placeholder, .sm-picker__value.is-placeholder { color: var(--color-text-faint); }
.sm-picker__chevron { flex: none; color: var(--color-text-muted); }
.ms-trigger--open, .ms-trigger:focus-visible { outline: none; border-color: var(--color-accent); box-shadow: var(--p-focus-ring); }
.ms-trigger:disabled { opacity: 0.5; cursor: not-allowed; }
.ms-anchor { position: fixed; top: 0; left: 0; z-index: calc(var(--z-modal) + 1); }
/* The panel does not scroll: the model list inside it does, so the pinned
   "More models…" row below the list stays reachable however many providers
   there are (the composer's model menu splits the same way). */
.ms-panel { max-height: min(400px, 56vh); overflow: hidden; }
.ms-list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: min(320px, 44vh);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.ms-submenu { position: fixed; min-width: 160px; max-height: min(360px, 50vh); overflow-y: auto; }
.ms-item-anchor { width: 100%; }
/* Leading check column, as the composer's model rows carry: a fixed-width slot
   so a model's name starts in the same place whether or not it is the current
   one. */
.ms-check { width: var(--p-ic-sm); flex: none; display: flex; justify-content: center; color: var(--color-accent); }
.ms-option-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ms-submenu-arrow { color: var(--color-text-muted); font-size: var(--text-lg); line-height: 1; }
.ms-more .ms-more-icon { color: var(--color-text-muted); }
.ms-more-arrow { flex: none; color: var(--color-text-muted); }
.ms-group-label { font-family: var(--font-ui); font-size: var(--text-xs); font-weight: var(--weight-medium); letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-text-muted); padding: var(--space-2) var(--space-2) var(--space-1); }
</style>
