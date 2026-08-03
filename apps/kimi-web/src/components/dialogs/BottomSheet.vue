<!-- apps/kimi-web/src/components/dialogs/BottomSheet.vue -->
<!-- Reusable mobile bottom sheet: a fading scrim + a panel that slides up from -->
<!-- the bottom (rounded top, grab handle). v-model controls open state; tapping -->
<!-- the scrim or the grab handle closes it. Restyled to the unified v2 dialog -->
<!-- look (tokened scrim, surface-raised panel, UI font). -->
<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

// Backdrop-filter warm-up: the scrim (blur 10px, full viewport) and the
// frosted panel (blur 34px) are two large blur rasters; stagger them — scrim
// on frame 2, panel on frame 3 — so no single frame pays both. The enter
// transition starts at opacity 0, so both steps land while the sheet is still
// nearly invisible (identical settled pixels, same animation). `step-1`
// gates the scrim filter here; `step-2` gates the panel's `.lg-frost` filter
// via the WS-1B override in style.css.
const settleStep = ref(0);
let settleRaf = 0;

const props = withDefaults(
  defineProps<{
    /** Open state (use with v-model). */
    modelValue: boolean;
    /** Optional sheet title shown in the header strip. */
    title?: string;
  }>(),
  { title: '' },
);

const emit = defineEmits<{
  'update:modelValue': [open: boolean];
  close: [];
}>();

function close(): void {
  emit('update:modelValue', false);
  emit('close');
}

// Close on Escape while open (desktop keyboard / test convenience).
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') close();
}

watch(
  () => props.modelValue,
  (open) => {
    if (typeof document === 'undefined') return;
    if (open) document.addEventListener('keydown', onKeydown);
    else document.removeEventListener('keydown', onKeydown);
  },
  { immediate: true },
);

watch(
  () => props.modelValue,
  (open) => {
    // On close, keep the filters as they are: the leave transition fades the
    // frosted sheet out, so dropping the blur mid-fade would be visible.
    if (!open || typeof window === 'undefined') return;
    cancelAnimationFrame(settleRaf);
    settleStep.value = 0;
    settleRaf = requestAnimationFrame(() => {
      settleStep.value = 1;
      settleRaf = requestAnimationFrame(() => {
        settleStep.value = 2;
      });
    });
  },
  { immediate: true },
);

onUnmounted(() => {
  cancelAnimationFrame(settleRaf);
  if (typeof document !== 'undefined') document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <Transition name="sheet">
    <div
      v-if="modelValue"
      class="sheet-root"
      :class="{ 'step-1': settleStep >= 1, 'step-2': settleStep >= 2 }"
    >
      <div class="sheet-scrim" @click="close" />
      <div class="sheet-panel lg-frost" role="dialog" :aria-label="title || t('mobile.sheetLabel')">
        <button
          type="button"
          class="sheet-grab"
          :aria-label="t('mobile.closeSheet')"
          @click="close"
        />
        <div v-if="title" class="sheet-head">
          <span class="sheet-title">{{ title }}</span>
        </div>
        <div class="sheet-body">
          <slot />
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.sheet-root {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.sheet-scrim {
  position: absolute;
  inset: 0;
  background: rgba(13, 17, 23, 0.32);
  -webkit-backdrop-filter: blur(10px) saturate(140%);
  backdrop-filter: blur(10px) saturate(140%);
}
/* Backdrop-filter warm-up (see `settleStep`): the scrim blur lands on
   frame 2 of the enter transition, the panel's frost on frame 3. */
.sheet-root:not(.step-1) .sheet-scrim {
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}

.sheet-panel {
  position: relative;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-line);
  border-bottom: none;
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  box-shadow: var(--shadow-xl);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  min-height: 0;
  font-family: var(--font-ui);
  color: var(--color-text);
}

/* Grab handle — also a tap target to close. */
.sheet-grab {
  flex: none;
  align-self: center;
  width: 56px;
  height: 18px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  position: relative;
  margin-top: 4px;
}
.sheet-grab::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 7px;
  transform: translateX(-50%);
  width: 38px;
  height: 5px;
  border-radius: var(--radius-full);
  background: var(--color-line);
}

.sheet-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px 10px;
}
.sheet-title {
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  color: var(--color-text);
}

.sheet-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: max(16px, var(--safe-bottom));
}

/* Slide-up + fade transition for the whole sheet (scrim fades, panel slides). */
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity var(--duration-slow) var(--ease-out);
}
.sheet-enter-active .sheet-panel,
.sheet-leave-active .sheet-panel {
  transition: transform var(--duration-slow) var(--ease-out);
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-from .sheet-panel,
.sheet-leave-to .sheet-panel {
  transform: translateY(102%);
}
</style>
