<!-- apps/kimi-web/src/components/ResizeHandle.vue -->
<!-- A thin (~4px) drag bar used to resize the panel to its LEFT (vertical
     orientation, width) or the panel ABOVE (horizontal orientation, height).
     It owns the size via useResizable and reports changes through
     v-model:width so the parent can drive its grid/flex sizing. Resize cursor,
     subtle accent hover highlight, no text-selection while dragging. -->
<script setup lang="ts">
import { watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useResizable } from '../composables/useResizable';

const props = withDefaults(
  defineProps<{
    storageKey: string;
    defaultWidth: number;
    min: number;
    max: number;
    reverse?: boolean;
    /** 'vertical' = a vertical divider resizing the panel to the LEFT (width);
     *  'horizontal' = a horizontal divider resizing the panel ABOVE (height). */
    orientation?: 'vertical' | 'horizontal';
    ariaLabel?: string;
  }>(),
  { orientation: 'vertical' },
);

const emit = defineEmits<{
  'update:width': [width: number];
  /** True while dragging — parents disable size transitions so the panel
      tracks the pointer without animation lag. */
  'update:dragging': [dragging: boolean];
}>();

const { t } = useI18n();

const horizontal = props.orientation === 'horizontal';

const { width, dragging, onPointerDown } = useResizable({
  storageKey: props.storageKey,
  defaultWidth: props.defaultWidth,
  min: props.min,
  // Pass a getter so the cap stays reactive: a viewport-derived max can grow
  // after the handle mounts and the next drag will use the new limit.
  max: () => props.max,
  reverse: props.reverse,
  axis: horizontal ? 'y' : 'x',
});

// Surface the restored size immediately, then keep the parent in sync on drag.
emit('update:width', width.value);
watch(width, (w) => emit('update:width', w));
watch(dragging, (d) => emit('update:dragging', d));
</script>

<template>
  <div
    class="rh"
    :class="{ dragging, 'rh--horizontal': horizontal }"
    role="separator"
    :aria-orientation="horizontal ? 'horizontal' : 'vertical'"
    :aria-label="ariaLabel ?? t('layout.resizeHandleAria')"
    @pointerdown="onPointerDown"
  >
    <span class="rh-bar" aria-hidden="true"></span>
  </div>
</template>

<style scoped>
.rh {
  width: 4px;
  flex: none;
  cursor: col-resize;
  position: relative;
  align-self: stretch;
  background: transparent;
  touch-action: none;
  /* sits over the 1px column border so the whole 4px strip is grabbable */
  margin: 0 -2px;
  /* above pane-level sticky chrome (chat dock, headers at --z-sticky): its 2px
     overhang into the neighbour pane must stay visible and grabbable */
  z-index: var(--z-dropdown);
}
/* Horizontal divider (resizes the panel above): a full-width strip instead of a
   column. The 4px body sits between the two panels; the visible 2px overhang
   stays in flow via an outer 0 -2px-style trick below. */
.rh.rh--horizontal {
  height: 4px;
  width: auto;
  cursor: row-resize;
  align-self: stretch;
  margin: 0;
}
.rh-bar {
  position: absolute;
  inset: 0;
  background: transparent;
  transition: background 0.12s;
}
.rh:hover .rh-bar,
.rh.dragging .rh-bar {
  background: var(--color-accent);
}
</style>
