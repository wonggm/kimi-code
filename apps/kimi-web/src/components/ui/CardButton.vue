<script setup lang="ts">
import type { IconName } from '../../lib/icons';
import Icon from './Icon.vue';
import Spinner from './Spinner.vue';

withDefaults(defineProps<{
  variant?: 'default' | 'primary';
  hint?: string;
  hintIcons?: IconName[];
  leadingIcon?: IconName;
  trailingIcon?: IconName;
  disabled?: boolean;
  loading?: boolean;
}>(), {
  variant: 'default',
  hint: '',
  hintIcons: () => [],
});
</script>

<template>
  <button
    class="cbtn"
    :class="[`cbtn--${variant}`, { 'is-loading': loading }]"
    type="button"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
  >
    <Spinner v-if="loading" size="sm" class="cbtn-spin" />
    <Icon v-else-if="leadingIcon" class="cbtn-ic" :name="leadingIcon" size="sm" />
    <span class="cbtn-label"><slot /></span>
    <Icon v-if="trailingIcon" class="cbtn-ic" :name="trailingIcon" size="sm" />
    <span
      v-if="hint || hintIcons.length"
      class="cbtn-cap"
      :class="{ 'cbtn-cap--combo': hint ? hintIcons.length > 0 : hintIcons.length > 1 }"
      aria-hidden="true"
    >
      <span v-if="hint" class="cbtn-cap-text">{{ hint }}</span>
      <span v-for="name in hintIcons" :key="name" class="cbtn-cap-key">
        <Icon :name="name" size="md" />
      </span>
    </span>
  </button>
</template>

<style scoped>
.cbtn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border: none;
  border-radius: var(--radius-lg);
  font-family: var(--font-ui);
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  line-height: 20px;
  white-space: nowrap;
  cursor: pointer;
  transition: background var(--duration-base) var(--ease-out),
    opacity var(--duration-base) var(--ease-out);
}
.cbtn:disabled { opacity: 0.5; cursor: not-allowed; }
.cbtn.is-loading { opacity: 1; cursor: progress; }
.cbtn.is-loading .cbtn-label { opacity: 0.7; }
.cbtn:focus-visible { outline: none; box-shadow: var(--p-focus-ring-strong); }

.cbtn--default { background: var(--color-fill-1); color: var(--color-text); }
.cbtn--default:not(:disabled):hover { background: var(--color-fill-2); }
.cbtn--primary { background: var(--color-send-bg); color: var(--color-send-icon); }
.cbtn--primary:not(:disabled):hover { background: var(--color-send-bg-hover); }

.cbtn-cap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  min-width: 24px;
  height: 18px;
  padding: 0 3px;
  border-radius: var(--radius-xs);
  background: var(--color-fill-1);
  font-size: var(--text-xs);
  line-height: 18px;
}
.cbtn--primary .cbtn-cap { background: var(--color-fill-on-inverted); }
.cbtn-ic,
.cbtn-spin { flex: none; }
.cbtn-spin :deep(.ui-spinner__track) { opacity: 0.35; }
.cbtn-cap--combo { padding: 0 4px; }
.cbtn-cap-key { display: inline-flex; justify-content: center; flex: none; }
.cbtn-cap--combo .cbtn-cap-key { width: 12px; }
.cbtn-cap--combo .cbtn-cap-text + .cbtn-cap-key { margin-left: 2px; }
.cbtn-cap :deep(.kw-icon) { flex: none; width: 18px; height: 18px; }
</style>
