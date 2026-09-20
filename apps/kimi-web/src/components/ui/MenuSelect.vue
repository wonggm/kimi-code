<!-- apps/kimi-web/src/components/ui/MenuSelect.vue -->
<!-- Design-system §03 MenuSelect: settings-style dropdown that renders the
     open list as a teleported HTML panel. Native <select> popups are OS
     widgets and cannot be styled, so a styled component is the answer for
     the settings dialog. Position the panel with fixed coordinates computed
     from the trigger's bounding rect and <Teleport> to <body> so an ancestor
     with `overflow: hidden` cannot clip it. -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import Menu from './Menu.vue';
import MenuItem from './MenuItem.vue';
import Icon from './Icon.vue';

type Option = { value: string; label: string; disabled?: boolean };
type Group = { label?: string; options: Option[] };

const props = withDefaults(defineProps<{
  modelValue: string;
  groups: Group[];
  placeholder?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}>(), { size: 'md' });

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const open = ref(false);
const triggerRef = ref<HTMLButtonElement | null>(null);
const menuRef = ref<InstanceType<typeof Menu> | null>(null);
const menuStyle = ref<Record<string, string>>({});
const highlightIndex = ref(0);

// While the dropdown is open, freeze the dialog content behind it with `inert`
// so pointer events can't reach interactive controls under the panel (the dialog
// root is found by walking up from the trigger; the teleported menu panel lives
// outside it and is never trapped). No-op for use sites that are not inside a
// dialog (sidebar, session admin view, …).
let inertDialog: HTMLElement | null = null;

function setDialogInert(on: boolean): void {
  if (on) {
    const dialog = triggerRef.value?.closest<HTMLElement>('.ui-dialog');
    if (!dialog) return;
    inertDialog = dialog;
    dialog.inert = true;
  } else if (inertDialog) {
    inertDialog.inert = false;
    inertDialog = null;
  }
}

const flatOptions = computed<Option[]>(() => {
  const out: Option[] = [];
  for (const group of props.groups) {
    for (const opt of group.options) out.push(opt);
  }
  return out;
});

const selectedLabel = computed(() => {
  for (const opt of flatOptions.value) {
    if (opt.value === props.modelValue) return opt.label;
  }
  return props.placeholder ?? '';
});

const hasSelection = computed(() => flatOptions.value.some((opt) => opt.value === props.modelValue));

function close(): void {
  setDialogInert(false);
  open.value = false;
  document.removeEventListener('mousedown', onDocClick);
  window.removeEventListener('resize', onScrollOrResize);
  document.removeEventListener('keydown', onKeydown, true);
}

function onDocClick(e: MouseEvent): void {
  const t = e.target as Node;
  if (triggerRef.value?.contains(t)) return;
  if (menuRef.value?.el?.contains(t)) return;
  close();
}

function onScrollOrResize(): void {
  // Reposition so the panel stays anchored; close if it would go off-screen.
  void updatePosition();
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.stopPropagation();
    close();
    triggerRef.value?.focus();
    return;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const step = e.key === 'ArrowDown' ? 1 : -1;
    const len = flatOptions.value.length;
    if (len === 0) return;
    let next = highlightIndex.value + step;
    // Skip disabled entries.
    for (let i = 0; i < len; i++) {
      const idx = ((next % len) + len) % len;
      const opt = flatOptions.value[idx];
      if (opt && !opt.disabled) {
        highlightIndex.value = idx;
        return;
      }
      next += step;
    }
    return;
  }
  if (e.key === 'Enter' || e.key === ' ') {
    const opt = flatOptions.value[highlightIndex.value];
    if (opt && !opt.disabled) {
      e.preventDefault();
      select(opt.value);
    }
  }
}

async function updatePosition(): Promise<void> {
  await nextTick();
  const btn = triggerRef.value;
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
  let left = r.left;
  if (left + menuW > window.innerWidth - margin) {
    left = Math.max(margin, r.right - menuW);
  }
  menuStyle.value = {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    minWidth: `${Math.round(r.width)}px`,
  };
}

function setHighlight(option: Option): void {
  const idx = flatOptions.value.indexOf(option);
  if (idx >= 0) highlightIndex.value = idx;
}

async function toggle(): Promise<void> {
  if (props.disabled) return;
  if (open.value) {
    close();
    return;
  }
  open.value = true;
  setDialogInert(true);
  // Seed the highlight on the current selection, else the first enabled row.
  const idx = flatOptions.value.findIndex((o) => o.value === props.modelValue);
  if (idx >= 0) highlightIndex.value = idx;
  else {
    const first = flatOptions.value.findIndex((o) => !o.disabled);
    highlightIndex.value = first >= 0 ? first : 0;
  }
  await updatePosition();
  // Defer outside-click so the opening click doesn't immediately close it.
  setTimeout(() => document.addEventListener('mousedown', onDocClick), 0);
  window.addEventListener('resize', onScrollOrResize);
  document.addEventListener('keydown', onKeydown, true);
}

function select(value: string): void {
  emit('update:modelValue', value);
  close();
  triggerRef.value?.focus();
}

// Keep highlight in range if the option list shrinks underneath us.
watch(flatOptions, (list) => {
  if (highlightIndex.value >= list.length) highlightIndex.value = 0;
});

onBeforeUnmount(() => {
  close();
});
</script>

<template>
  <div class="ui-select" :class="`ui-select--${size}`">
    <button
      ref="triggerRef"
      type="button"
      class="ui-select__trigger ms-trigger"
      :class="[`ms-trigger--${size}`, { 'ms-trigger--placeholder': !hasSelection, 'ms-trigger--open': open }]"
      :disabled="disabled"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-label="ariaLabel"
      @click.stop="toggle"
      @keydown.enter.prevent="toggle"
      @keydown.space.prevent="toggle"
    >
      <span class="ui-select__value">
        <span class="ui-select__value-text ms-trigger-label">{{ selectedLabel }}</span>
      </span>
      <Icon class="ui-select__chevron" name="chevron-down" size="sm" />
    </button>

    <Teleport to="body">
      <div v-if="open" class="ms-anchor" :style="menuStyle">
        <Menu ref="menuRef" class="ms-panel">
          <template v-for="(group, gi) in groups" :key="gi">
            <div v-if="group.label" class="ms-group-label">{{ group.label }}</div>
            <MenuItem
              v-for="(opt, oi) in group.options"
              :key="`${gi}-${oi}`"
              :active="opt.value === modelValue"
              :disabled="opt.disabled"
              @click="select(opt.value)"
              @mouseenter="setHighlight(opt)"
            >
              {{ opt.label }}
            </MenuItem>
          </template>
        </Menu>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* Wrapper carries only the `ui-select` identity and the capsule radius; the
   trigger below paints the visible control, exactly as before. */
.ui-select {
  position: relative;
  width: 100%;
  border-radius: var(--radius-full);
}

/* Trigger: visual twin of ui/Select.vue so the closed state is identical.
   Select.vue's styles are scoped and don't reach this component, so we
   reproduce them here. */
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
  border: var(--p-hairline) solid var(--color-line-strong);
  padding: 0 var(--space-4);
}
.ms-trigger--md { height: 38px; }
.ms-trigger--sm { height: 32px; font-size: var(--text-sm); }
.ui-select__value {
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
  overflow: hidden;
}
.ms-trigger-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ms-trigger--placeholder { color: var(--color-text-faint); }
.ui-select__chevron { flex: none; color: var(--color-text-muted); }
.ms-trigger--open { border-color: var(--color-accent); box-shadow: var(--p-focus-ring); }
.ms-trigger:focus-visible { outline: none; border-color: var(--color-accent); box-shadow: var(--p-focus-ring); }
.ms-trigger:disabled { opacity: 0.5; cursor: not-allowed; }

/* Teleported anchor — menu surface sits inside this so position:fixed works
   against the viewport. The Menu primitive provides the surface styling.
   z-index must clear --z-modal (400): every current use site is inside the
   settings Dialog, and a panel teleported to <body> with the plain
   --z-dropdown (200) paints UNDER the dialog overlay and looks like the
   dropdown never opens. */
.ms-anchor {
  position: fixed;
  top: 0;
  left: 0;
  z-index: calc(var(--z-modal) + 1);
}
.ms-panel {
  max-height: min(360px, 50vh);
  overflow-y: auto;
}
/* Group header: small, muted, non-interactive (matches the .sec-title style
   used elsewhere in settings). */
.ms-group-label {
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  padding: var(--space-2) var(--space-2) var(--space-1);
}
</style>