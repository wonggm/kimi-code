<!-- apps/kimi-web/src/components/ui/Textarea.vue -->
<!-- Design-system §03 Textarea: same surface/focus as Input, multi-line. -->
<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

const props = withDefaults(defineProps<{
  modelValue?: string;
  rows?: number;
  size?: 'sm' | 'md';
  placeholder?: string;
  disabled?: boolean;
  readonly?: boolean;
  error?: boolean;
  /** Allow the user to drag the box taller; off for a box that autosizes. */
  resize?: boolean;
  /** Fit the box to its content height on every value change. */
  autosize?: boolean;
}>(), {
  rows: 3,
  size: 'md',
  resize: true,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
}>();

const el = ref<HTMLTextAreaElement>();

function fit(): void {
  const node = el.value;
  if (!props.autosize || !node) return;
  node.style.height = 'auto';
  node.style.height = `${node.scrollHeight + node.offsetHeight - node.clientHeight}px`;
}

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value);
  if (props.autosize) fit();
}

let observer: ResizeObserver | undefined;
let lastWidth = 0;

watch(() => [props.modelValue, props.autosize], () => nextTick(fit));

onMounted(() => {
  if (!el.value) return;
  observer = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width ?? 0;
    if (width === lastWidth) return;
    lastWidth = width;
    fit();
  });
  observer.observe(el.value);
  document.fonts?.ready.then(fit);
  fit();
});

onUnmounted(() => observer?.disconnect());

defineExpose({ el });
</script>

<template>
  <textarea
    ref="el"
    class="ui-textarea"
    :class="[
      { 'has-error': error, 'no-resize': !resize || autosize, 'is-autosize': autosize },
      `ui-textarea--${size}`,
    ]"
    :value="modelValue"
    :rows="rows"
    :placeholder="placeholder"
    :disabled="disabled"
    :readonly="readonly"
    @input="onInput"
    @focus="$emit('focus', $event)"
    @blur="$emit('blur', $event)"
  />
</template>

<style scoped>
.ui-textarea {
  width: 100%;
  min-height: 84px;
  resize: vertical;
  border: 1px solid var(--color-line-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
  box-shadow: var(--shadow-xs);
  color: var(--color-text);
  font-family: var(--font-ui);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
  padding: 10px 12px;
  transition: border-color var(--duration-base) var(--ease-out),
    box-shadow var(--duration-base) var(--ease-out);
}
.ui-textarea--sm { min-height: 4rem; padding: var(--space-2); font-size: var(--text-sm); }
.ui-textarea::placeholder { color: var(--color-text-faint); }
.ui-textarea.is-autosize { overflow: hidden; }
.ui-textarea.no-resize { resize: none; }
.ui-textarea:hover:not(:disabled):not(:focus) { border-color: var(--color-line-strong); }
.ui-textarea:focus { outline: none; border-color: var(--color-accent); box-shadow: var(--p-focus-ring); }
.ui-textarea:disabled { opacity: 0.5; cursor: not-allowed; }
.ui-textarea[readonly] { background: var(--color-surface-sunken); }
.ui-textarea.has-error { border-color: var(--color-danger); }
.ui-textarea.has-error:focus { box-shadow: 0 0 0 3px var(--color-danger-soft); }
</style>
