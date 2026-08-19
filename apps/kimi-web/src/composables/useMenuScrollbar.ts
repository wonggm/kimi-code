// apps/kimi-web/src/composables/useMenuScrollbar.ts
// Shared scroll-fade + floating-scrollbar state for the autocomplete menus
// (slash menu, @-mention menu). Both menus overlay a custom draggable thumb
// over their native (hidden) scrollbar and fade the list edges while scrolled.
//
// The fade mask swaps between three token-defined gradients (top / bottom /
// both) depending on the scroll position — the gradients themselves live in
// style.css so the app's design-system guard stays happy. Dragging the thumb
// maps the pointer delta onto the scroll range of the list element.
import { computed, onBeforeUnmount, onMounted, ref, type ComputedRef, type Ref } from 'vue';

const TRACK_INSET_VAR = '--menu-scrollbar-track-inset';
const THUMB_MIN_VAR = '--menu-scrollbar-thumb-min';

export interface MenuScrollbarState {
  /** Inline style for the scroll container (mask-image by scroll position). */
  maskStyle: ComputedRef<Record<string, string>>;
  /** Inline style for the thumb; undefined when the list does not overflow. */
  thumbStyle: ComputedRef<Record<string, string> | undefined>;
  /** Scroll listener for the container. */
  onScroll: () => void;
  /** Pointer-down handler for the thumb element. */
  onThumbPointerDown: (event: PointerEvent) => void;
}

export function useMenuScrollbar(scrollRef: Ref<HTMLElement | null>): MenuScrollbarState {
  const atTop = ref(true);
  const atBottom = ref(true);
  const thumb = ref<{ top: number; height: number } | null>(null);

  let observer: ResizeObserver | null = null;
  let dragCleanup: (() => void) | null = null;

  function readInset(el: HTMLElement, value: string): number {
    const parsed = Number.parseFloat(getComputedStyle(el).getPropertyValue(value));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function update(): void {
    const el = scrollRef.value;
    if (!el) {
      thumb.value = null;
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = el;
    atTop.value = scrollTop <= 0;
    atBottom.value = scrollTop + clientHeight >= scrollHeight - 1;
    if (scrollHeight <= clientHeight + 1) {
      thumb.value = null;
      return;
    }
    const inset = readInset(el, TRACK_INSET_VAR);
    const minThumb = readInset(el, THUMB_MIN_VAR);
    const track = clientHeight - inset * 2;
    const height = Math.max(minThumb, (clientHeight / scrollHeight) * track);
    const range = scrollHeight - clientHeight;
    const top = inset + (scrollTop / range) * (track - height);
    thumb.value = { top: Math.round(top), height: Math.round(height) };
  }

  function onThumbPointerDown(event: PointerEvent): void {
    const el = scrollRef.value;
    const thumbValue = thumb.value;
    if (!el || !thumbValue) return;
    event.preventDefault();
    dragCleanup?.();
    const pointerId = event.pointerId;
    (event.target as HTMLElement | null)?.setPointerCapture?.(pointerId);
    const inset = readInset(el, TRACK_INSET_VAR);
    const travel = el.clientHeight - inset * 2 - thumbValue.height;
    const range = el.scrollHeight - el.clientHeight;
    const startY = event.clientY;
    const startScrollTop = el.scrollTop;
    const onMove = (moveEvent: PointerEvent): void => {
      if (moveEvent.pointerId !== pointerId || travel <= 0) return;
      el.scrollTop = startScrollTop + ((moveEvent.clientY - startY) / travel) * range;
    };
    const onUp = (upEvent: PointerEvent): void => {
      if (upEvent.pointerId !== pointerId) return;
      cleanup();
    };
    const cleanup = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (dragCleanup === cleanup) dragCleanup = null;
    };
    dragCleanup = cleanup;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  const maskStyle = computed<Record<string, string>>(() => {
    if (!atTop.value && !atBottom.value) return { maskImage: 'var(--menu-scroll-fade-mask-both)' };
    if (!atTop.value) return { maskImage: 'var(--menu-scroll-fade-mask-top)' };
    if (!atBottom.value) return { maskImage: 'var(--menu-scroll-fade-mask-bottom)' };
    return {} as Record<string, string>;
  });

  const thumbStyle = computed<Record<string, string> | undefined>(() => {
    const value = thumb.value;
    if (!value) return undefined;
    return {
      top: `${value.top}px`,
      height: `${value.height}px`,
    };
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
    dragCleanup?.();
  });

  return {
    maskStyle,
    thumbStyle,
    onScroll: update,
    onThumbPointerDown,
  };
}