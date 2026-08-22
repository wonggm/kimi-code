<!-- apps/kimi-web/src/components/ui/Menu.vue -->
<!-- Design-system §03 Menu: raised dropdown panel. Positioning is left to the
     consumer; this provides the surface + item layout. Consumers mount it only
     while open (v-if), so mount/unmount doubles as the menu's open state for
     the Tooltip suppression flag (src/composables/useMenuOpen). -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { setMenuOpen } from '../../composables/useMenuOpen';

// Expose the panel element so call sites can anchor / outside-click against the
// menu surface (positioning is intentionally left to the consumer).
const el = ref<HTMLElement>();
defineExpose({ el });

onMounted(() => setMenuOpen(true));
onBeforeUnmount(() => setMenuOpen(false));
</script>

<template>
  <div ref="el" class="ui-menu lg-glass" role="menu">
    <slot />
  </div>
</template>

<style scoped>
.ui-menu {
  min-width: 180px;
  padding: var(--space-1);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
}
/* Concentric corners: the frame is radius-lg with space-1 padding, so the
   outermost items pick up radius-md (frame radius minus padding) on their
   outer corners to stay concentric with the frame. */
.ui-menu > :deep(button:first-child),
.ui-menu > :deep(.ui-menu-item:first-child) {
  border-top-left-radius: var(--radius-md);
  border-top-right-radius: var(--radius-md);
}
.ui-menu > :deep(button:last-child),
.ui-menu > :deep(.ui-menu-item:last-child) {
  border-bottom-left-radius: var(--radius-md);
  border-bottom-right-radius: var(--radius-md);
}
/* A single item doubles as first and last — all four corners. */
.ui-menu > :deep(button:first-child:last-child),
.ui-menu > :deep(.ui-menu-item:first-child:last-child) {
  border-top-left-radius: var(--radius-md);
  border-top-right-radius: var(--radius-md);
  border-bottom-left-radius: var(--radius-md);
  border-bottom-right-radius: var(--radius-md);
}
</style>
