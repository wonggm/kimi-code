// apps/kimi-web/src/composables/usePanelTabReorder.ts
import { computed, onBeforeUnmount, ref, type Ref } from 'vue';

export interface TabRect {
  id: string;
  start: number;
  size: number;
}

interface DragState {
  id: string;
  pointerId: number;
  button: HTMLElement;
  grabOffset: number;
  x: number;
  y: number;
}

export function panelTabDropIndex(rects: readonly TabRect[], draggedId: string, offset: number): number {
  let index = 0;
  for (const rect of rects) {
    if (rect.id === draggedId) continue;
    if (offset < rect.start + rect.size / 2) return index;
    index += 1;
  }
  return index;
}

export function panelTabShift(
  itemIndex: number,
  fromIndex: number,
  toIndex: number,
  draggedSize: number,
  gap: number,
): number {
  if (fromIndex < toIndex && itemIndex > fromIndex && itemIndex <= toIndex) return -(draggedSize + gap);
  if (fromIndex > toIndex && itemIndex >= toIndex && itemIndex < fromIndex) return draggedSize + gap;
  return 0;
}

export function panelTabDropCenter(
  rects: readonly TabRect[],
  fromIndex: number,
  toIndex: number,
): number {
  const from = rects[fromIndex];
  const to = rects[toIndex];
  if (!from || !to) return from?.start ?? 0;
  return fromIndex < toIndex ? to.start + to.size - from.size : to.start;
}

export function panelTabEdgeScroll(pointer: number, box: { top: number; bottom: number; left: number; right: number }): number {
  if (pointer < box.top || pointer > box.bottom) return 0;
  const ramp = Math.min(48, (box.right - box.left) / 3);
  if (ramp <= 0) return 0;
  const entering = Math.max(0, Math.min(1, (box.left + ramp - pointer) / ramp));
  const leaving = Math.max(0, Math.min(1, (pointer - box.right + ramp) / ramp));
  return (leaving - entering) * 720;
}

export function usePanelTabReorder(options: {
  container: Ref<HTMLElement | null>;
  enabled: Ref<boolean>;
  move: (id: string, toIndex: number) => void;
  onDragStart?: () => void;
}) {
  const draggingId = ref<string | null>(null);
  const dropIndex = ref<number | null>(null);
  const indicatorLeft = ref<number | null>(null);
  const offsets = ref<Record<string, number>>({});

  let drag: DragState | null = null;
  let rects: TabRect[] = [];
  let gap = 0;
  let dragOffset = 0;
  let pointerX = 0;
  let pointerY = 0;
  let frame = 0;
  let lastFrame = 0;
  let suppressClick = false;
  let suppressTimer: ReturnType<typeof setTimeout> | undefined;

  function measure(): void {
    const container = options.container.value;
    if (!container) {
      rects = [];
      return;
    }
    const box = container.getBoundingClientRect();
    rects = Array.from(container.querySelectorAll<HTMLElement>('[data-panel-tab-id]')).map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        id: el.dataset.panelTabId ?? '',
        start: rect.left - box.left + container.scrollLeft,
        size: rect.width,
      };
    });
    const parsed = Number.parseFloat(getComputedStyle(container).columnGap);
    gap = Number.isFinite(parsed) ? parsed : 0;
  }

  function indexOf(id: string): number {
    return rects.findIndex((rect) => rect.id === id);
  }

  function update(): void {
    const container = options.container.value;
    const current = drag;
    if (!container || !current || draggingId.value === null) return;
    const box = container.getBoundingClientRect();
    const from = indexOf(current.id);
    const dragged = rects[from];
    const first = rects[0];
    const last = rects.at(-1);
    if (!dragged || !first || !last) return;
    const clamped = Math.max(box.left, Math.min(box.right, pointerX));
    const wanted = clamped - box.left + container.scrollLeft - current.grabOffset - dragged.start;
    const min = first.start - dragged.start;
    const max = last.start + last.size - dragged.start - dragged.size;
    dragOffset = Math.max(min, Math.min(max, wanted));
    const to = panelTabDropIndex(rects, current.id, clamped - box.left + container.scrollLeft);
    dropIndex.value = to;
    indicatorLeft.value = Math.max(gap / 2, panelTabDropCenter(rects, from, to) - gap / 2);
    const next: Record<string, number> = {};
    for (let i = 0; i < rects.length; i += 1) {
      const rect = rects[i]!;
      next[rect.id] =
        rect.id === current.id ? dragOffset : panelTabShift(i, from, to, dragged.size, gap);
    }
    offsets.value = next;
  }

  function tick(time: number): void {
    frame = 0;
    const container = options.container.value;
    if (!drag || !container) return;
    const delta = lastFrame === 0 ? 1000 / 60 : Math.min(32, time - lastFrame);
    lastFrame = time;
    const velocity = panelTabEdgeScroll(pointerY, container.getBoundingClientRect());
    const before = container.scrollLeft;
    const next = Math.max(
      0,
      Math.min(container.scrollWidth - container.clientWidth, before + (velocity * delta) / 1000),
    );
    if (next !== before) container.scrollLeft = next;
    update();
    if (velocity === 0) {
      lastFrame = 0;
      return;
    }
    schedule();
  }

  function schedule(): void {
    if (frame !== 0) return;
    frame = requestAnimationFrame(tick);
  }

  function clear(): void {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('keydown', onKeydown);
    window.removeEventListener('blur', onBlur);
    if (frame !== 0) cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
    rects = [];
    const current = drag;
    if (current) {
      current.button.removeEventListener('lostpointercapture', onBlur);
      if (current.button.hasPointerCapture?.(current.pointerId)) {
        current.button.releasePointerCapture(current.pointerId);
      }
    }
    drag = null;
  }

  function onPointerMove(event: PointerEvent): void {
    const current = drag;
    if (!current || event.pointerId !== current.pointerId) return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (draggingId.value === null) {
      if (Math.hypot(pointerX - current.x, pointerY - current.y) <= 4) return;
      measure();
      if (indexOf(current.id) < 0) {
        clear();
        return;
      }
      draggingId.value = current.id;
      current.button.blur();
      options.onDragStart?.();
      update();
    }
    event.preventDefault();
    schedule();
  }

  function onPointerUp(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const current = drag;
    const wasDragging = draggingId.value !== null;
    if (wasDragging) {
      pointerX = event.clientX;
      pointerY = event.clientY;
      const box = options.container.value?.getBoundingClientRect();
      if (box) {
        update();
        const to = dropIndex.value;
        const from = indexOf(current.id);
        if (to !== null && from >= 0 && to !== from && pointerY >= box.top && pointerY <= box.bottom) {
          options.move(current.id, to);
        }
      }
      suppressClick = true;
      clearTimeout(suppressTimer);
      suppressTimer = setTimeout(() => {
        suppressClick = false;
      }, 0);
    }
    clear();
    draggingId.value = null;
    dropIndex.value = null;
    indicatorLeft.value = null;
    offsets.value = {};
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || event.isComposing || !drag) return;
    event.preventDefault();
    event.stopPropagation();
    onPointerUpCancel();
  }

  function onBlur(): void {
    if (drag) onPointerUpCancel();
  }

  function onPointerUpCancel(): void {
    clear();
    draggingId.value = null;
    dropIndex.value = null;
    indicatorLeft.value = null;
    offsets.value = {};
  }

  function onPointerDown(event: PointerEvent, id: string): void {
    if (!options.enabled.value || event.button !== 0 || drag) return;
    const button = event.currentTarget as HTMLElement | null;
    if (!button) return;
    const container = options.container.value;
    if (!container) return;
    const tab = button.closest<HTMLElement>('[data-panel-tab-id]');
    if (!tab) return;
    const tabBox = tab.getBoundingClientRect();
    drag = {
      id,
      pointerId: event.pointerId,
      button,
      grabOffset: event.clientX - tabBox.left,
      x: event.clientX,
      y: event.clientY,
    };
    pointerX = event.clientX;
    pointerY = event.clientY;
    button.setPointerCapture?.(event.pointerId);
    button.addEventListener('lostpointercapture', onBlur);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('keydown', onKeydown, true);
    window.addEventListener('blur', onBlur);
  }

  function consumeClick(): boolean {
    if (!suppressClick) return false;
    suppressClick = false;
    return true;
  }

  function styleFor(id: string): Record<string, string> | undefined {
    const rect = rects.find((entry) => entry.id === id);
    if (!rect) return undefined;
    const offset = offsets.value[id] ?? 0;
    return {
      width: `${rect.size}px`,
      minWidth: `${rect.size}px`,
      maxWidth: `${rect.size}px`,
      transform: `translate3d(${offset}px, 0, 0)`,
    };
  }

  onBeforeUnmount(() => {
    clear();
    clearTimeout(suppressTimer);
  });

  return {
    draggingId,
    indicatorLeft,
    reordering: computed(() => draggingId.value !== null),
    styleFor,
    onPointerDown,
    consumeClick,
  };
}
