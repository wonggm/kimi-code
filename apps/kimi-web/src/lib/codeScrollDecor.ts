// apps/kimi-web/src/lib/codeScrollDecor.ts
// Pure geometry for the markdown scroll decor (the code block's edge fade and
// floating scrollbars, and the wide-table fade): where the thumb sits on its
// track and how long it is, and which of the four edges are still scrollable.

export interface ScrollThumb {
  start: number;
  size: number;
}

export function scrollThumb(
  offset: number,
  total: number,
  viewport: number,
  inset = 0,
  minSize = 24,
): ScrollThumb | null {
  if (total <= viewport + 1) return null;
  const track = viewport - inset * 2;
  if (track <= 0) return null;
  const size = Math.min(track, Math.max(minSize, (viewport / total) * track));
  const range = total - viewport;
  const position = Math.max(0, Math.min(range, offset));
  return { start: inset + (position / range) * (track - size), size };
}

export interface ScrollBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export function scrollEdges(box: ScrollBox, threshold = 1): ScrollBox {
  return {
    top: box.top > threshold ? 1 : 0,
    bottom: box.bottom > threshold ? 1 : 0,
    left: box.left > threshold ? 1 : 0,
    right: box.right > threshold ? 1 : 0,
  };
}

export function scrollBoxOf(element: HTMLElement): ScrollBox {
  return {
    top: element.scrollTop,
    bottom: element.scrollHeight - element.clientHeight - element.scrollTop,
    left: element.scrollLeft,
    right: element.scrollWidth - element.clientWidth - element.scrollLeft,
  };
}

export function tableVisibleEnd(element: HTMLElement): number {
  return element.scrollLeft + element.clientWidth;
}
