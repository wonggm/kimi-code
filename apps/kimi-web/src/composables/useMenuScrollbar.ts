// apps/kimi-web/src/composables/useMenuScrollbar.ts
// Shared scroll-fade state for the autocomplete menus (slash menu, @-mention
// menu). Both menus fade the list edges while scrolled; the scrollbar itself is
// the browser's own, at whatever width the browser draws it.
//
// The fade mask swaps between three token-defined gradients (top / bottom /
// both) depending on the scroll position — the gradients themselves live in
// style.css so the app's design-system guard stays happy.
import { computed, onBeforeUnmount, onMounted, ref, type ComputedRef, type Ref } from 'vue';

export interface MenuScrollbarState {
  /** Inline style for the scroll container (mask-image by scroll position). */
  maskStyle: ComputedRef<Record<string, string>>;
  /** Scroll listener for the container. */
  onScroll: () => void;
}

export function useMenuScrollbar(scrollRef: Ref<HTMLElement | null>): MenuScrollbarState {
  const atTop = ref(true);
  const atBottom = ref(true);

  let observer: ResizeObserver | null = null;

  function update(): void {
    const el = scrollRef.value;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    atTop.value = scrollTop <= 0;
    atBottom.value = scrollTop + clientHeight >= scrollHeight - 1;
  }

  const maskStyle = computed<Record<string, string>>(() => {
    if (!atTop.value && !atBottom.value) return { maskImage: 'var(--menu-scroll-fade-mask-both)' };
    if (!atTop.value) return { maskImage: 'var(--menu-scroll-fade-mask-top)' };
    if (!atBottom.value) return { maskImage: 'var(--menu-scroll-fade-mask-bottom)' };
    return {} as Record<string, string>;
  });

  onMounted(() => {
    update();
    const el = scrollRef.value;
    if (el && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => update());
      observer.observe(el);
    }
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
  });

  return {
    maskStyle,
    onScroll: update,
  };
}
