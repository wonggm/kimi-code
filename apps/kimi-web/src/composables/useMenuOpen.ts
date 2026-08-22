// apps/kimi-web/src/composables/useMenuOpen.ts
// App-wide "is any menu open" flag. Tooltip consults it to suppress hover
// bubbles whose trigger sits OUTSIDE an open menu (upstream behaviour: while a
// menu is open, the tooltips of other buttons stay hidden). The shared
// ui/Menu panel self-reports via setMenuOpen on mount/unmount (consumers mount
// it only while open); owners of custom glass menus (the composer's model /
// permission / add dropdowns) track their open ref with trackMenuOpen.

import { onBeforeUnmount, ref, watch, type Ref } from 'vue';

export const menuOpenCount = ref(0);

/** True while at least one menu panel is open. */
export function isAnyMenuOpen(): boolean {
  return menuOpenCount.value > 0;
}

/** Increment / decrement the open-menu counter (ui/Menu self-reports). */
export function setMenuOpen(open: boolean): void {
  menuOpenCount.value += open ? 1 : -1;
  if (menuOpenCount.value < 0) menuOpenCount.value = 0;
}

/** Keep the counter in step with an open ref for this component's lifetime. */
export function trackMenuOpen(open: Ref<boolean>): void {
  watch(open, (value) => setMenuOpen(value));
  onBeforeUnmount(() => {
    if (open.value) setMenuOpen(false);
  });
}
