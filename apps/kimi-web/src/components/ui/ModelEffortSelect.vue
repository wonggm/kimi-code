<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import Menu from './Menu.vue';
import MenuItem from './MenuItem.vue';

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
};

const props = withDefaults(defineProps<Props>(), { size: 'md' });
const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:effortValue': [value: string];
}>();

const open = ref(false);
const submenuOpen = ref(false);
const activeModel = ref<string | null>(null);
const highlightIndex = ref(0);
const triggerRef = ref<HTMLButtonElement | null>(null);
const menuRef = ref<InstanceType<typeof Menu> | null>(null);
const submenuRef = ref<InstanceType<typeof Menu> | null>(null);
const itemRefs = new Map<string, HTMLElement>();
const menuStyle = ref<Record<string, string>>({});
const submenuStyle = ref<Record<string, string>>({});

const flatOptions = computed(() => props.groups.flatMap((group) => group.options));
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
  <button
    ref="triggerRef"
    type="button"
    class="ui-select ms-trigger"
    :class="[`ms-trigger--${size}`, { 'ms-trigger--placeholder': !hasSelection, 'ms-trigger--open': open }]"
    :disabled="disabled"
    aria-haspopup="menu"
    :aria-expanded="open"
    :aria-label="ariaLabel"
    @click.stop="toggle"
    @keydown.enter.prevent="toggle"
    @keydown.space.prevent="toggle"
  >
    <span class="ms-trigger-label">{{ selectedLabel }}</span>
  </button>

  <Teleport to="body">
    <div v-if="open" class="ms-anchor" :style="menuStyle">
      <Menu ref="menuRef" class="ms-panel">
        <template v-for="(group, gi) in groups" :key="gi">
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
              <span class="ms-option-label">{{ option.label }}</span>
              <span class="ms-submenu-arrow" aria-hidden="true">›</span>
            </MenuItem>
          </div>
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
</template>

<style scoped>
.ms-trigger {
  display: flex;
  align-items: center;
  width: 100%;
  text-align: left;
  cursor: pointer;
  font-family: var(--font-ui);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
  color: var(--color-text);
  border-radius: var(--radius-full);
  padding: 0 var(--space-4);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%236b7280' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right var(--space-4) center;
  background-size: 16px 16px;
}
.ms-trigger--md { height: 38px; }
.ms-trigger--sm { height: 32px; font-size: var(--text-sm); }
.ms-trigger-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: calc(16px + var(--space-2)); }
.ms-trigger--placeholder { color: var(--color-text-faint); }
.ms-trigger--open, .ms-trigger:focus-visible { outline: none; border-color: var(--color-accent); box-shadow: var(--p-focus-ring); }
.ms-trigger:disabled { opacity: 0.5; cursor: not-allowed; }
.ms-anchor { position: fixed; top: 0; left: 0; z-index: calc(var(--z-modal) + 1); }
.ms-panel, .ms-submenu { max-height: min(360px, 50vh); overflow-y: auto; }
.ms-submenu { position: fixed; min-width: 160px; }
.ms-item-anchor { width: 100%; }
.ms-option-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ms-submenu-arrow { color: var(--color-text-muted); font-size: var(--text-lg); line-height: 1; }
.ms-group-label { font-family: var(--font-ui); font-size: var(--text-xs); font-weight: var(--weight-medium); letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-text-muted); padding: var(--space-2) var(--space-2) var(--space-1); }
html[data-color-scheme="dark"] .ms-trigger { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%239aa0a8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E"); }
@media (prefers-color-scheme: dark) { html[data-color-scheme="system"] .ms-trigger { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%239aa0a8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E"); } }
</style>
