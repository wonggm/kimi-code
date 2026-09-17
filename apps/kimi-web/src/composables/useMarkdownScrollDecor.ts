// apps/kimi-web/src/composables/useMarkdownScrollDecor.ts
import { onBeforeUnmount, onMounted, type Ref } from 'vue';
import { scrollBoxOf, scrollEdges, scrollThumb, tableVisibleEnd } from '../lib/codeScrollDecor';

const VIEWPORT_CLASS = 'md-code-scroll-viewport';
const CODE_HOST_CLASS = 'md-code-scroll-host';
const TABLE_HOST_CLASS = 'md-table-scroll-host';
const TABLE_OVERFLOW_CLASS = 'md-table-scroll-overflow';
const SCROLLBAR_EDGE = 'var(--code-scrollbar-edge, var(--menu-scrollbar-edge))';
const THUMB_MIN = 24;
const TARGETS = '.code-block-container, .diff-wrap, .table-node-wrapper, .node-content > pre[data-markstream-pre]';

interface Track {
  axis: 'horizontal' | 'vertical';
  el: HTMLDivElement;
  thumb: HTMLSpanElement;
  dragging: { pointerId: number; pointer: number; scroll: number; travel: number } | null;
}

interface Decor {
  host: HTMLElement;
  scroller: HTMLElement | null;
  edges: HTMLDivElement;
  tracks: Track[];
  table: boolean;
  update: () => void;
  destroy: () => void;
}

function findScroller(key: HTMLElement, table: boolean): HTMLElement | null {
  if (table) return key;
  const shadow = (key.querySelector('diffs-container') as HTMLElement | null)?.shadowRoot;
  const shadowCode = shadow?.querySelector('code[data-code]') as HTMLElement | null;
  return shadowCode ?? key.querySelector<HTMLElement>('pre');
}

function createTrack(axis: 'horizontal' | 'vertical'): Track {
  const el = document.createElement('div');
  el.className = `md-code-scrollbar md-code-scrollbar--${axis}`;
  el.hidden = true;
  el.setAttribute('aria-hidden', 'true');
  const thumb = document.createElement('span');
  thumb.className = 'md-code-scrollbar-thumb';
  el.append(thumb);
  return { axis, el, thumb, dragging: null };
}

export function useMarkdownScrollDecor(root: Ref<HTMLElement | null>) {
  const decorations = new Map<HTMLElement, Decor>();
  const observed = new Set<HTMLElement>();
  let frame = 0;
  let resize: ResizeObserver | null = null;
  let mutation: MutationObserver | null = null;

  function makeDecorator(key: HTMLElement): Decor {
    const table = key.classList.contains('table-node-wrapper');
    const standalone = !table && key.matches('.node-content > pre[data-markstream-pre]');
    const host = table || standalone ? key.parentElement ?? key : key;
    if (standalone) host.classList.add(CODE_HOST_CLASS);
    if (table) host.classList.add(TABLE_HOST_CLASS);

    const edges = document.createElement('div');
    edges.className = 'md-code-edges';
    edges.setAttribute('aria-hidden', 'true');
    host.append(edges);

    const tracks = [createTrack('horizontal'), createTrack('vertical')];
    const decorator: Decor = {
      host,
      scroller: null,
      edges,
      tracks,
      table,
      update: () => undefined,
      destroy: () => undefined,
    };

    function rangeOf(vertical: boolean): number {
      const scroller = decorator.scroller;
      if (!scroller) return 0;
      return vertical ? scroller.scrollHeight - scroller.clientHeight : scroller.scrollWidth - scroller.clientWidth;
    }

    function onTrackPointerDown(track: Track, event: PointerEvent): void {
      const scroller = decorator.scroller;
      if (!scroller || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const vertical = track.axis === 'vertical';
      const box = track.el.getBoundingClientRect();
      const pointer = vertical ? event.clientY : event.clientX;
      const thumbSize = vertical ? track.thumb.offsetHeight : track.thumb.offsetWidth;
      const trackSize = vertical ? box.height : box.width;
      const travel = Math.max(1, trackSize - thumbSize);
      if (event.target !== track.thumb) {
        const ratio = (pointer - (vertical ? box.top : box.left) - thumbSize / 2) / travel;
        const next = ratio * rangeOf(vertical);
        if (vertical) scroller.scrollTop = next;
        else scroller.scrollLeft = next;
      }
      track.dragging = {
        pointerId: event.pointerId,
        pointer,
        scroll: vertical ? scroller.scrollTop : scroller.scrollLeft,
        travel,
      };
      track.el.setPointerCapture(event.pointerId);
      track.el.classList.add('is-dragging');
      decorator.update();
    }

    function onTrackPointerMove(track: Track, event: PointerEvent): void {
      const scroller = decorator.scroller;
      const drag = track.dragging;
      if (!scroller || !drag || event.pointerId !== drag.pointerId) return;
      const vertical = track.axis === 'vertical';
      const pointer = vertical ? event.clientY : event.clientX;
      const delta = ((pointer - drag.pointer) / drag.travel) * rangeOf(vertical);
      if (vertical) scroller.scrollTop = drag.scroll + delta;
      else scroller.scrollLeft = drag.scroll + delta;
    }

    function endTrackDrag(track: Track, event: PointerEvent): void {
      if (!track.dragging || event.pointerId !== track.dragging.pointerId) return;
      track.dragging = null;
      track.el.classList.remove('is-dragging');
      if (track.el.hasPointerCapture?.(event.pointerId)) track.el.releasePointerCapture(event.pointerId);
      decorator.update();
    }

    for (const track of tracks) {
      host.append(track.el);
      track.el.addEventListener('pointerdown', (event) => onTrackPointerDown(track, event));
      track.el.addEventListener('pointermove', (event) => onTrackPointerMove(track, event));
      track.el.addEventListener('pointerup', (event) => endTrackDrag(track, event));
      track.el.addEventListener('pointercancel', (event) => endTrackDrag(track, event));
      track.el.addEventListener('lostpointercapture', (event) => endTrackDrag(track, event));
    }

    const onScroll = (): void => schedule();

    decorator.update = (): void => {
      const previous = decorator.scroller;
      const next = findScroller(key, table);
      if (next !== previous) {
        previous?.removeEventListener('scroll', onScroll);
        previous?.classList.remove(VIEWPORT_CLASS);
        decorator.scroller = next;
        if (next) {
          next.classList.add(VIEWPORT_CLASS);
          next.addEventListener('scroll', onScroll, { passive: true });
        }
      }
      const scroller = decorator.scroller;
      const horizontal = tracks[0]!;
      const vertical = tracks[1]!;
      if (!scroller) {
        edges.hidden = true;
        horizontal.el.hidden = true;
        vertical.el.hidden = true;
        return;
      }

      if (table) {
        key.classList.toggle(TABLE_OVERFLOW_CLASS, scroller.scrollWidth > scroller.clientWidth + 1);
        key.style.setProperty('--md-table-visible-end', `${tableVisibleEnd(scroller)}px`);
        key.style.setProperty(
          '--md-table-fade-width',
          scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft > 1 ? 'var(--markdown-table-fade-size)' : '0px',
        );
      }

      const box = scroller.getBoundingClientRect();
      const hostBox = host.getBoundingClientRect();
      const radius = Number.parseFloat(getComputedStyle(key).borderBottomLeftRadius) || 0;
      const inset = table ? 0 : radius;
      const width = box.width;
      const height = box.height;
      if (!width || !height) {
        edges.hidden = true;
        horizontal.el.hidden = true;
        vertical.el.hidden = true;
        return;
      }

      edges.hidden = table;
      edges.style.left = `${box.left - hostBox.left}px`;
      edges.style.top = `${box.top - hostBox.top}px`;
      edges.style.width = `${width}px`;
      edges.style.height = `${height}px`;
      const flags = scrollEdges(scrollBoxOf(scroller));
      edges.style.setProperty('--markdown-edge-top', `${flags.top}`);
      edges.style.setProperty('--markdown-edge-bottom', `${flags.bottom}`);
      edges.style.setProperty('--markdown-edge-left', `${flags.left}`);
      edges.style.setProperty('--markdown-edge-right', `${flags.right}`);

      const left = box.left - hostBox.left;
      const top = box.top - hostBox.top;
      horizontal.el.style.left = `${left + inset}px`;
      horizontal.el.style.width = `${Math.max(0, width - inset * 2)}px`;
      horizontal.el.style.top = `calc(${top + height}px - var(--code-scrollbar-width, var(--menu-scrollbar-width)))`;
      vertical.el.style.top = `${top + inset}px`;
      vertical.el.style.height = `${Math.max(0, height - inset * 2)}px`;
      vertical.el.style.left = `calc(${left + width}px - var(--code-scrollbar-width, var(--menu-scrollbar-width)) - ${SCROLLBAR_EDGE})`;

      const horizontalThumb = scrollThumb(scroller.scrollLeft, scroller.scrollWidth, scroller.clientWidth, 0, THUMB_MIN);
      const verticalThumb = scrollThumb(scroller.scrollTop, scroller.scrollHeight, scroller.clientHeight, 0, THUMB_MIN);
      horizontal.el.hidden = !horizontalThumb;
      vertical.el.hidden = !verticalThumb;
      if (horizontalThumb) {
        horizontal.thumb.style.width = `${horizontalThumb.size}px`;
        horizontal.thumb.style.transform = `translateX(${horizontalThumb.start}px)`;
      }
      if (verticalThumb) {
        vertical.thumb.style.height = `${verticalThumb.size}px`;
        vertical.thumb.style.transform = `translateY(${verticalThumb.start}px)`;
      }
    };

    decorator.destroy = (): void => {
      decorator.scroller?.removeEventListener('scroll', onScroll);
      decorator.scroller?.classList.remove(VIEWPORT_CLASS);
      for (const track of tracks) track.el.remove();
      edges.remove();
      if (standalone) host.classList.remove(CODE_HOST_CLASS);
      if (table) {
        host.classList.remove(TABLE_HOST_CLASS);
        key.classList.remove(TABLE_OVERFLOW_CLASS);
        key.style.removeProperty('--md-table-visible-end');
        key.style.removeProperty('--md-table-fade-width');
      }
    };

    return decorator;
  }

  function sync(): void {
    const element = root.value;
    if (!element) return;
    const keys = new Set(element.querySelectorAll<HTMLElement>(TARGETS));
    for (const [key, decorator] of decorations) {
      if (keys.has(key)) continue;
      decorator.destroy();
      decorations.delete(key);
    }
    for (const key of keys) {
      const existing = decorations.get(key);
      if (existing) existing.update();
      else decorations.set(key, makeDecorator(key));
    }
    const targets = new Set<HTMLElement>();
    for (const decorator of decorations.values()) {
      targets.add(decorator.host);
      if (decorator.scroller) targets.add(decorator.scroller);
    }
    for (const el of observed) {
      if (targets.has(el)) continue;
      resize?.unobserve(el);
      observed.delete(el);
    }
    for (const el of targets) {
      if (observed.has(el)) continue;
      resize?.observe(el);
      observed.add(el);
    }
  }

  function schedule(): void {
    if (frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      sync();
    });
  }

  onMounted(() => {
    if (typeof ResizeObserver !== 'undefined') {
      resize = new ResizeObserver(() => schedule());
    }
    if (root.value && typeof MutationObserver !== 'undefined') {
      mutation = new MutationObserver(() => schedule());
      mutation.observe(root.value, { childList: true, subtree: true, characterData: true });
    }
    sync();
  });

  onBeforeUnmount(() => {
    if (frame !== 0) cancelAnimationFrame(frame);
    frame = 0;
    mutation?.disconnect();
    mutation = null;
    resize?.disconnect();
    resize = null;
    for (const decorator of decorations.values()) decorator.destroy();
    decorations.clear();
    observed.clear();
  });

  return { sync: schedule };
}
