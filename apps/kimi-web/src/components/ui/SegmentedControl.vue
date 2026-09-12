<!-- apps/kimi-web/src/components/ui/SegmentedControl.vue -->
<!-- Design-system §03 SegmentedControl: 2-4 mutually exclusive options.
     A single sliding indicator (ui-seg__indicator) carries the selected state
     instead of a background per item; it is measured from the active item's box
     on mount, on selection change, and on resize, and stays hidden until that
     first measurement lands (is-ready). Options may carry an icon and/or a
     colour swatch ahead of the label. -->
<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { IconName } from '../../lib/icons';
import Icon from './Icon.vue';

const props = defineProps<{
  modelValue: string;
  options: { value: string; label: string; icon?: IconName; swatch?: string }[];
  size?: 'sm' | 'md';
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const root = ref<HTMLElement | null>(null);
const itemEls = ref<(HTMLElement | null)[]>([]);
const indicatorReady = ref(false);
const indicatorStyle = ref<Record<string, string>>({});
let observer: ResizeObserver | null = null;

function setItemRef(el: unknown, index: number): void {
  itemEls.value[index] = el instanceof HTMLElement ? el : null;
}

async function measure(): Promise<void> {
  await nextTick();
  const index = props.options.findIndex((option) => option.value === props.modelValue);
  const active = itemEls.value[index];
  if (!active) return;
  indicatorStyle.value = {
    width: `${active.offsetWidth}px`,
    height: `${active.offsetHeight}px`,
    transform: `translate(${active.offsetLeft}px, ${active.offsetTop}px)`,
  };
  indicatorReady.value = true;
}

watch(() => [props.modelValue, props.options.length], measure, { immediate: true });

onMounted(() => {
  observer = new ResizeObserver(() => {
    void measure();
  });
  if (root.value) observer.observe(root.value);
  for (const el of itemEls.value) if (el) observer.observe(el);
  void measure();
});

onUnmounted(() => {
  observer?.disconnect();
});
</script>

<template>
  <div ref="root" class="ui-seg" :class="`ui-seg--${size ?? 'md'}`" role="tablist">
    <span
      class="ui-seg__indicator"
      :class="{ 'is-ready': indicatorReady }"
      :style="indicatorStyle"
      aria-hidden="true"
    />
    <button
      v-for="(opt, index) in options"
      :key="opt.value"
      :ref="(el) => setItemRef(el, index)"
      class="ui-seg__item"
      :class="{ 'is-on': opt.value === modelValue }"
      :data-icon="opt.icon"
      type="button"
      role="tab"
      :aria-selected="opt.value === modelValue"
      @click="emit('update:modelValue', opt.value)"
    >
      <Icon v-if="opt.icon" class="ui-seg__icon" :name="opt.icon" size="sm" />
      <span v-if="opt.swatch" class="ui-seg__swatch" :style="{ backgroundColor: opt.swatch }" />
      {{ opt.label }}
    </button>
  </div>
</template>

<style scoped>
.ui-seg {
  position: relative;
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: var(--color-surface-sunken);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
}
.ui-seg__indicator {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 0;
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
  box-shadow: var(--shadow-sm);
  opacity: 0;
  pointer-events: none;
  transition: transform var(--duration-base) var(--ease-out), width var(--duration-base) var(--ease-out),
    height var(--duration-base) var(--ease-out), opacity var(--duration-fast) var(--ease-out);
}
.ui-seg__indicator.is-ready { opacity: 1; }
.ui-seg__item {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-family: var(--font-ui);
  font-weight: var(--weight-medium);
  cursor: pointer;
  line-height: 1;
  white-space: nowrap;
  transition: background var(--duration-base) var(--ease-out), color var(--duration-base) var(--ease-out),
    box-shadow var(--duration-base) var(--ease-out);
}
.ui-seg__swatch {
  width: 7px;
  height: 7px;
  border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
  border-radius: 50%;
  flex: none;
}
.ui-seg__icon { flex: none; }
.ui-seg--md .ui-seg__item { padding: 5px var(--space-3); font-size: var(--text-sm); }
.ui-seg--sm .ui-seg__item { height: 24px; padding: 0 var(--space-2); font-size: var(--text-sm); }
.ui-seg__item:hover:not(.is-on) { color: var(--color-text); }
.ui-seg__item.is-on { color: var(--color-text); }
.ui-seg__item:focus-visible { outline: none; box-shadow: var(--p-focus-ring); }

/* Phone widths: both sizes land at 23-24px tall, under the touch target floor
   the design system sets for touch surfaces. Every consumer at this width is a
   phone surface (the mobile sheets), so the widening lives here rather than in
   each caller; desktop sizing is untouched. */
@media (max-width: 640px) {
  .ui-seg--sm .ui-seg__item { height: 44px; }
  .ui-seg--md .ui-seg__item { min-height: 44px; padding-block: 9px; }
}
</style>
