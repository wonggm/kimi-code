<!-- apps/kimi-web/src/components/dialogs/BottomSheet.vue -->
<!-- Reusable mobile bottom sheet: a fading scrim + a panel that slides up from -->
<!-- the bottom (rounded top, grab handle). v-model controls open state; tapping -->
<!-- the scrim or the grab handle closes it. Restyled to the unified v2 dialog -->
<!-- look (tokened scrim, surface-raised panel, UI font). -->
<script setup lang="ts">
import { onUnmounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { openDialogCount } from '../../composables/dialogStack';

const { t } = useI18n();

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

// A sheet is an overlay like the dialog, and the toast host anchors below an
// open overlay: WarningToasts reads this count to decide its `below-overlay`
// class. Upstream's toasts carry that class while the mobile settings sheet is
// open, so the sheet registers here the same way Dialog does.
watch(
  () => props.modelValue,
  (open, wasOpen) => {
    if (open === wasOpen) return;
    openDialogCount.value = Math.max(0, openDialogCount.value + (open ? 1 : -1));
  },
  { immediate: true },
);
onUnmounted(() => {
  if (props.modelValue) openDialogCount.value = Math.max(0, openDialogCount.value - 1);
});

watch(
  () => props.modelValue,
  (open) => {
    if (typeof document === 'undefined') return;
    if (open) document.addEventListener('keydown', onKeydown);
    else document.removeEventListener('keydown', onKeydown);
  },
  { immediate: true },
);

onUnmounted(() => {
  if (typeof document !== 'undefined') document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <Transition name="sheet">
    <div v-if="modelValue" class="sheet-root">
      <div class="sheet-scrim" @click="close" />
      <div class="sheet-panel" role="dialog" :aria-label="title || t('mobile.sheetLabel')">
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

/* Slide-up + fade transition for the whole sheet (scrim fades, panel slides).
   Both the scrim and the panel take `gentle`: a spring that overshoots by 10%
   of a 100vh slide would lift the panel off the bottom edge, so large-travel
   surfaces get the near-critical curve, and the extra settle time is what
   reads as weight. `prefers-reduced-motion` collapses the presets to a still
   curve in style.css, so no component checks the media feature itself. */
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity var(--duration-spring-gentle) var(--spring-gentle);
}
.sheet-enter-active .sheet-panel,
.sheet-leave-active .sheet-panel {
  transition: transform var(--duration-spring-gentle) var(--spring-gentle);
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
