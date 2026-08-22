// apps/kimi-web/src/composables/useResizable.ts
// A small reusable hook for a drag-to-resize handle. It owns the size value,
// clamps it to [min, max], persists it to localStorage, and wires up pointer
// events (pointerdown/move/up with capture, no text-selection while dragging).
// The default axis is X (a vertical divider resizing width); axis 'y' follows
// the pointer's Y instead, for a horizontal divider resizing a panel's height.
// Used by the sidebar session-column drag handle and the pinned-section
// divider.

import { onBeforeUnmount, ref, toValue, type MaybeRefOrGetter, type Ref } from 'vue';
import { safeGetString, safeSetString } from '../lib/storage';

export interface UseResizableOptions {
  /** localStorage key the chosen size is persisted under. */
  storageKey: string;
  /** Size to fall back to when nothing is stored / value is invalid. */
  defaultWidth: number;
  /** Smallest allowed size (px). */
  min: number;
  /** Largest allowed size (px). Accepts a ref/getter so a cap derived from the
   *  viewport keeps working as the window is resized after the handle mounts. */
  max: MaybeRefOrGetter<number>;
  /** True when dragging right should shrink the controlled size. */
  reverse?: boolean;
  /** Drag axis: 'x' follows the pointer's X (a vertical divider), 'y' its Y
   *  (a horizontal divider resizing a panel's height). */
  axis?: 'x' | 'y';
}

export interface UseResizable {
  /** Current size in px along the drag axis (already clamped). */
  width: Ref<number>;
  /** True while a drag is in progress. */
  dragging: Ref<boolean>;
  /** Clamp a value to [min, max]. */
  clamp: (value: number) => number;
  /** Set the size (clamped + persisted). */
  setWidth: (value: number) => void;
  /** pointerdown handler to attach to the drag handle. */
  onPointerDown: (event: PointerEvent) => void;
}

function readStored(key: string): number | null {
  try {
    const raw = safeGetString(key);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: number): void {
  try {
    safeSetString(key, String(value));
  } catch {
    // localStorage unavailable (e.g. private mode) — width still works in-memory
  }
}

export function useResizable(options: UseResizableOptions): UseResizable {
  const { storageKey, defaultWidth, min, max, reverse = false, axis = 'x' } = options;

  function clamp(value: number): number {
    if (!Number.isFinite(value)) return defaultWidth;
    return Math.min(toValue(max), Math.max(min, Math.round(value)));
  }

  const width = ref<number>(clamp(readStored(storageKey) ?? defaultWidth));
  const dragging = ref(false);

  function setWidth(value: number): void {
    const next = clamp(value);
    width.value = next;
    writeStored(storageKey, next);
  }

  // Drag bookkeeping — captured at pointerdown so we resize relative to the
  // start point rather than absolute cursor coordinates.
  let startX = 0;
  let startY = 0;
  let startWidth = 0;
  let activeEl: HTMLElement | null = null;
  let activePointerId = -1;

  function onPointerMove(event: PointerEvent): void {
    if (!dragging.value) return;
    const delta = axis === 'y' ? event.clientY - startY : event.clientX - startX;
    setWidth(startWidth + (reverse ? -delta : delta));
  }

  function endDrag(): void {
    if (!dragging.value) return;
    dragging.value = false;
    if (typeof document !== 'undefined') {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
    if (activeEl) {
      try {
        activeEl.releasePointerCapture(activePointerId);
      } catch {
        // pointer capture may already be released
      }
      activeEl.removeEventListener('pointermove', onPointerMove);
      activeEl.removeEventListener('pointerup', endDrag);
      activeEl.removeEventListener('pointercancel', endDrag);
    }
    activeEl = null;
    activePointerId = -1;
  }

  function onPointerDown(event: PointerEvent): void {
    event.preventDefault();
    dragging.value = true;
    startX = event.clientX;
    startY = event.clientY;
    // The stored size can exceed the current cap (e.g. after the window narrows
    // or a panel opens). Clamp the drag start so the handle responds
    // immediately instead of first covering an invisible delta.
    startWidth = clamp(width.value);
    activeEl = event.currentTarget as HTMLElement;
    activePointerId = event.pointerId;
    // Suppress text selection / show a resize cursor for the whole drag.
    if (typeof document !== 'undefined') {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = axis === 'y' ? 'row-resize' : 'col-resize';
    }
    try {
      activeEl.setPointerCapture(activePointerId);
    } catch {
      // setPointerCapture may be unavailable in some test environments
    }
    activeEl.addEventListener('pointermove', onPointerMove);
    activeEl.addEventListener('pointerup', endDrag);
    activeEl.addEventListener('pointercancel', endDrag);
  }

  onBeforeUnmount(endDrag);

  return { width, dragging, clamp, setWidth, onPointerDown };
}
