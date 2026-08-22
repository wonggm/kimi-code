// apps/kimi-web/src/composables/useViewportClamp.ts
// Shared viewport clamping for floating menus (model dropdown, slash / mention
// panels): pick the side of the anchor that has room for the menu — flipping
// the preferred side when it would overflow — then clamp top/left into the
// viewport. Pure function so it can be unit-tested without mounting anything;
// ModelEffortSelect's inline clamp was the original pattern, this is the
// shared form the composer menus reuse.

export type MenuPlacement = 'above' | 'below';

export interface MenuClampOptions {
  /** Vertical gap between the anchor edge and the menu. */
  gap?: number;
  /** Minimum distance kept from the viewport edges. */
  margin?: number;
}

export interface MenuClampResult {
  top: number;
  left: number;
  placement: MenuPlacement;
}

export function clampMenuPlacement(
  anchor: DOMRect,
  width: number,
  height: number,
  preferred: MenuPlacement = 'above',
  options?: MenuClampOptions,
): MenuClampResult {
  const { gap = 4, margin = 8 } = options ?? {};
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spaceAbove = anchor.top - margin;
  const spaceBelow = vh - margin - anchor.bottom;
  const fits = (side: MenuPlacement): boolean =>
    (side === 'above' ? spaceAbove : spaceBelow) >= height + gap;
  const placement: MenuPlacement = fits(preferred)
    ? preferred
    : fits(preferred === 'above' ? 'below' : 'above')
      ? preferred === 'above'
        ? 'below'
        : 'above'
      : spaceBelow >= spaceAbove
        ? 'below'
        : 'above';
  const top =
    placement === 'above'
      ? Math.max(margin, Math.min(anchor.top - gap - height, vh - margin - height))
      : Math.max(margin, Math.min(anchor.bottom + gap, vh - margin - height));
  const left = Math.max(margin, Math.min(anchor.left, vw - margin - width));
  return { top: Math.round(top), left: Math.round(left), placement };
}
