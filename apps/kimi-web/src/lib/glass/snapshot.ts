// apps/kimi-web/src/lib/glass/snapshot.ts
// Rasterizes the page behind the glass panes into an ImageData-sized canvas
// via SVG <foreignObject> serialization: clone the document, inline every
// same-origin stylesheet (external <link>s never load inside an <img>),
// strip resources the image context cannot fetch, hide the registered glass
// surfaces and their WebGL slices (so a pane never refracts itself), then
// draw the resulting SVG through an Image onto a scaled canvas.
//
// Known fidelity trade-offs (acceptable because the result is only ever
// consumed through an 8–34px blur): web fonts do not load in the image
// context (text falls back to system metrics), <img>/<video>/<canvas>
// bitmaps are stripped, and CSS animations are sampled at one instant.
// Every failure path throws SnapshotError so the renderer can degrade the
// frame to the plain CSS blur — nothing here may reject into the app.

import { meanLuminance } from './ambient';

export class SnapshotError extends Error {}

export interface PageSnapshot {
  canvas: HTMLCanvasElement;
  /** Window scroll offsets at capture time (CSS px). */
  scrollX: number;
  scrollY: number;
  /** CSS px per texture pixel — the scale the canvas was rasterized at. */
  scale: number;
  /** Viewport size the snapshot covers, in CSS px. */
  width: number;
  height: number;
  /**
   * Main-thread milliseconds this capture spent, summed over its synchronous
   * segments (document clone + style serialization, then the rasterization
   * draw). Deliberately NOT the wall time of the await: the SVG image decode
   * runs off-thread, so wall time would blame the frame budget for work the
   * user never waited on.
   */
  costMs: number;
}

/** Edge length of the scratch buffer a region is averaged down to: one
 *  drawImage plus a 576-byte readback per surface, which is what keeps the
 *  ambient read affordable at snapshot-regeneration cadence (never per frame). */
const AMBIENT_SAMPLE_SIZE = 12;
let ambientScratch: HTMLCanvasElement | null = null;

/**
 * Mean relative luminance (0…1) of the snapshot region behind a surface rect
 * (CSS px, viewport space). Maps the rect the same way the shader does —
 * viewport coords plus the scroll offsets baked at capture time — so the
 * sampled patch is the one the pane actually refracts. Clamped to the canvas
 * bounds; null when the region is empty or the readback fails, in which case
 * the caller keeps its neutral tint.
 */
export function sampleRegionLuminance(
  snapshot: PageSnapshot,
  rect: { x: number; y: number; w: number; h: number },
): number | null {
  if (rect.w < 1 || rect.h < 1) return null;
  const px = snapshot.scale;
  const x0 = Math.max(0, Math.min((rect.x + snapshot.scrollX) * px, snapshot.canvas.width - 1));
  const y0 = Math.max(0, Math.min((rect.y + snapshot.scrollY) * px, snapshot.canvas.height - 1));
  const w = Math.max(1, Math.min(rect.w * px, snapshot.canvas.width - x0));
  const h = Math.max(1, Math.min(rect.h * px, snapshot.canvas.height - y0));
  return readDownscaledLuminance(snapshot.canvas, x0, y0, w, h);
}

/**
 * The tint reference for a snapshot pass: the whole captured page, one 12×12
 * resample. Measuring the region and the reference from the same rasterization
 * is what makes the comparison mean something — the glass panes are hidden from
 * the clone (see `applySurfaceFixups`), so neither sample is polluted by them.
 */
export function samplePageLuminance(snapshot: PageSnapshot): number | null {
  return readDownscaledLuminance(
    snapshot.canvas,
    0,
    0,
    snapshot.canvas.width,
    snapshot.canvas.height,
  );
}

function readDownscaledLuminance(
  source: HTMLCanvasElement,
  x0: number,
  y0: number,
  w: number,
  h: number,
): number | null {
  if (!ambientScratch) {
    ambientScratch = document.createElement('canvas');
    ambientScratch.width = AMBIENT_SAMPLE_SIZE;
    ambientScratch.height = AMBIENT_SAMPLE_SIZE;
  }
  const ctx = ambientScratch.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, AMBIENT_SAMPLE_SIZE, AMBIENT_SAMPLE_SIZE);
  ctx.drawImage(source, x0, y0, w, h, 0, 0, AMBIENT_SAMPLE_SIZE, AMBIENT_SAMPLE_SIZE);
  try {
    const data = ctx.getImageData(0, 0, AMBIENT_SAMPLE_SIZE, AMBIENT_SAMPLE_SIZE).data;
    const luma = meanLuminance(data, 4, 4);
    return Number.isFinite(luma) ? luma : null;
  } catch {
    return null;
  }
}

const XHTML_NS = 'http://www.w3.org/1999/xhtml';
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Every lens surface is hidden from the clone — registered or not. The
 *  snapshot is shared by all panes, so any pane left visible in it shows up
 *  as a displaced ghost of itself inside its own canvas. Hiding on the
 *  `.lg-lens` CLASS rather than the registration attribute also closes a
 *  race: a capture debounced by an earlier registration can fire in the
 *  window where a just-opened menu exists in the DOM but has not registered
 *  yet — the attribute would miss it, the class does not.
 *  Trade-off: stacked panes (a menu over a dialog) refract the page behind
 *  the lower pane rather than the lower pane's face — accepted, since
 *  self-ghosting is far more visible and stacking is rare and brief. */
const LENS_SELECTOR = '.lg-lens';

function applySurfaceFixups(clone: HTMLElement): void {
  // .chat-header paints above the transcript top region (z 100), but the
  // shared snapshot is paint-order-blind and would otherwise put a copy of
  // the header text into the snapshot any lensed surface samples from. The
  // header overlaps no lensed surface, so hiding it from the clone is safe.
  for (const el of Array.from(clone.querySelectorAll('.lg-gl-pane, .chat-header, ' + LENS_SELECTOR))) {
    (el as HTMLElement).style.visibility = 'hidden';
  }
}

const linkCssCache = new Map<string, Promise<string>>();

async function styleTextForSheet(sheet: CSSStyleSheet): Promise<string> {
  if (sheet.href) {
    // Production builds ship one linked stylesheet; it must be fetched (once)
    // because an <img>-rasterized SVG never loads external CSS.
    let cached = linkCssCache.get(sheet.href);
    if (!cached) {
      cached = fetch(sheet.href)
        .then((res) => (res.ok ? res.text() : ''))
        .catch(() => '');
      linkCssCache.set(sheet.href, cached);
    }
    return cached;
  }
  try {
    return Array.from(sheet.cssRules).map((rule) => rule.cssText).join('\n');
  } catch {
    return ''; // cross-origin rules inaccessible — skip the sheet
  }
}

async function collectInlineStyles(): Promise<string> {
  const chunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    chunks.push(await styleTextForSheet(sheet));
  }
  return chunks.join('\n');
}

async function cloneWithFixups(): Promise<{ clone: HTMLElement; styleText: string }> {
  const clone = document.documentElement.cloneNode(true) as HTMLElement;

  // Images/videos/canvases/object/iframes cannot (or must not) load in the
  // rasterization context — remove them so the SVG stays fetch-free (a
  // blocked-but-referenced resource is a taint/canvas-security risk on some
  // engines) and the backdrop just loses those rectangles under the blur.
  for (const el of Array.from(clone.querySelectorAll('img, video, iframe, object, embed, canvas:not(.lg-gl-pane)'))) {
    el.remove();
  }
  // Stylesheets are re-emitted as ONE inline <style> in buildSvgDocument —
  // drop the originals (links never load in the image context; style tags
  // are inconsistently honored there).
  for (const el of Array.from(clone.querySelectorAll('head style, head link[rel="stylesheet"]'))) {
    el.remove();
  }

  // The panes we are refracting must not appear (hidden) or must appear only
  // as a blurred copy (see applySurfaceFixups).
  applySurfaceFixups(clone);

  // Internal scrollers: a detached clone renders at scrollTop 0. Shift each
  // scroller's children by the live scroll offset with the standalone
  // `translate` property so the clone lays out at the same visual state.
  const liveScrollers: { path: number[]; x: number; y: number }[] = [];
  const rootPath: number[] = [];
  const visit = (node: Element, path: number[]) => {
    const el = node as HTMLElement;
    if (el.scrollTop !== 0 || el.scrollLeft !== 0) {
      liveScrollers.push({ path, x: el.scrollLeft, y: el.scrollTop });
    }
    for (let i = 0; i < node.children.length; i++) visit(node.children[i]!, [...path, i]);
  };
  visit(document.documentElement, rootPath);
  for (const s of liveScrollers) {
    // Document-level scroll is NOT baked into the clone — the renderer maps
    // viewport coords through the live window scroll instead, so skip path [].
    if (s.path.length === 0) continue;
    let node: Element | null = clone;
    for (const idx of s.path) node = node?.children[idx] ?? null;
    if (!node) continue;
    for (const child of Array.from(node.children)) {
      (child as HTMLElement).style.translate = `-${s.x}px -${s.y}px`;
    }
  }

  return { clone, styleText: await collectInlineStyles() };
}

async function buildSvgDocument(
  width: number,
  height: number,
): Promise<{ url: string; cleanup: () => void }> {
  const { clone, styleText } = await cloneWithFixups();
  const styleEl = document.createElementNS(XHTML_NS, 'style');
  styleEl.textContent = styleText;
  const head = clone.querySelector('head');
  if (head) head.prepend(styleEl);
  else clone.prepend(styleEl);
  clone.setAttribute('xmlns', XHTML_NS);

  const bg = getComputedStyle(document.body).backgroundColor;
  const serializer = new XMLSerializer();
  const inner = serializer.serializeToString(clone);

  // The SVG document is assembled as ONE string, not via createElementNS +
  // foreignObject.innerHTML: setting innerHTML on an SVG-namespaced element
  // makes Firefox parse the serialized XHTML as foreign content — the clone
  // then rasterizes as an unstyled document (white background, dark text)
  // and every glass canvas paints a white sheet. A parsed-as-string SVG
  // document keeps the XHTML in the HTML namespace and styles apply.
  const fill = bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : '#ffffff';
  const svgText =
    `<svg xmlns="${SVG_NS}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="100%" height="100%" fill="${fill}"/>` +
    `<foreignObject width="100%" height="100%">${inner}</foreignObject></svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  return { url, cleanup: () => styleEl.remove() };
}

/**
 * Capture the current viewport of the page into a canvas at `scale`
 * (CSS px → texture px). Throws SnapshotError on any serialization, decode
 * or rasterization failure — callers must treat the frame as unavailable.
 */
export async function capturePageSnapshot(scale: number, timeoutMs = 4000): Promise<PageSnapshot> {
  const width = Math.max(1, Math.ceil(window.innerWidth));
  const height = Math.max(1, Math.ceil(window.innerHeight));
  let url: string;
  let cleanup: () => void;
  // Segment 1 of the cost: the clone / serialize / style-collection work is
  // synchronous main-thread time (the stylesheet awaits inside are cached after
  // the first capture, and only that first pass inflates this number).
  const serializeStart = performance.now();
  try {
    const built = await buildSvgDocument(width, height);
    url = built.url;
    cleanup = built.cleanup;
  } catch (e) {
    throw new SnapshotError(`glass snapshot serialization failed: ${String(e)}`, { cause: e });
  }
  const serializeMs = performance.now() - serializeStart;

  try {
    const img = new Image();
    img.decoding = 'sync';
    const loaded = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new SnapshotError('glass snapshot raster timed out')), timeoutMs);
      img.onload = () => { clearTimeout(timer); resolve(); };
      img.onerror = () => { clearTimeout(timer); reject(new SnapshotError('glass snapshot raster failed')); };
    });
    img.src = url;
    await loaded;

    // Segment 2: everything from here is main-thread work the frame waits on.
    const drawStart = performance.now();
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new SnapshotError('2d context unavailable');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    // Touch a pixel so a tainted-canvas SecurityError surfaces HERE rather
    // than inside GL upload.
    try {
      ctx.getImageData(0, 0, 1, 1);
    } catch (e) {
      throw new SnapshotError(`glass snapshot canvas tainted: ${String(e)}`, { cause: e });
    }
    return {
      canvas,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      scale,
      width,
      height,
      costMs: serializeMs + (performance.now() - drawStart),
    };
  } finally {
    cleanup();
  }
}

/**
 * Blurred copy of the snapshot at `blur(v · scale)` texture px, matching the
 * CSS `blur()` tier the pane's material declares. Preferred path: the 2D
 * context's own `filter` (a true Gaussian, exactly the CSS semantics), drawn
 * over an edge-extended pad so the kernel does not sample transparent
 * out-of-bounds pixels and darken the rim. Engines without `ctx.filter`
 * (older Safari) fall back to a stepped down/up resample cascade: each
 * halving+doubling pair is a tent-filter pass and ~log2(3·v) levels approach
 * the Gaussian shape. A single down-up resample is only a box blur of radius
 * ~1/factor px — for small tiers (the 8px glass of menus) it leaves backdrop
 * text legible where the CSS reference blur mutes it completely.
 * Rebuilt only when the snapshot changes, so the fragment shader only ever
 * samples a blurred texture.
 */
export function makeBlurredVariant(source: HTMLCanvasElement, blurCssPx: number, scale: number): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext('2d');
  if (!ctx) return out;
  const blurPx = blurCssPx * scale;
  if (blurPx < 1.2) {
    ctx.drawImage(source, 0, 0);
    return out;
  }
  if (typeof ctx.filter === 'string') {
    // Pad by 3σ with the edge pixels stretched outward, blur the pad, then
    // crop back — the Gaussian tail then samples real content at the borders.
    const pad = Math.ceil(blurPx * 3);
    const tmp = document.createElement('canvas');
    tmp.width = source.width + pad * 2;
    tmp.height = source.height + pad * 2;
    const tctx = tmp.getContext('2d');
    if (tctx) {
      const w = source.width;
      const h = source.height;
      tctx.drawImage(source, pad, pad);
      tctx.drawImage(source, 0, 0, w, 1, pad, 0, w, pad); // top edge
      tctx.drawImage(source, 0, h - 1, w, 1, pad, pad + h, w, pad); // bottom edge
      tctx.drawImage(source, 0, 0, 1, h, 0, pad, pad, h); // left edge
      tctx.drawImage(source, w - 1, 0, 1, h, pad + w, pad, pad, h); // right edge
      tctx.drawImage(source, 0, 0, 1, 1, 0, 0, pad, pad); // corners
      tctx.drawImage(source, w - 1, 0, 1, 1, pad + w, 0, pad, pad);
      tctx.drawImage(source, 0, h - 1, 1, 1, 0, pad + h, pad, pad);
      tctx.drawImage(source, w - 1, h - 1, 1, 1, pad + w, pad + h, pad, pad);
      ctx.filter = `blur(${blurPx}px)`;
      ctx.drawImage(tmp, -pad, -pad);
      ctx.filter = 'none';
      return out;
    }
  }
  const levels = Math.min(7, Math.max(1, Math.round(Math.log2(3 * blurPx))));
  const down: HTMLCanvasElement[] = [];
  for (let i = 1; i <= levels; i++) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(source.width / 2 ** i));
    c.height = Math.max(1, Math.round(source.height / 2 ** i));
    const cctx = c.getContext('2d');
    if (!cctx) break;
    cctx.imageSmoothingEnabled = true;
    cctx.imageSmoothingQuality = 'high';
    cctx.drawImage(i === 1 ? source : down[down.length - 1]!, 0, 0, c.width, c.height);
    down.push(c);
  }
  if (down.length === 0) {
    ctx.drawImage(source, 0, 0);
    return out;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // Upsample back through the chain in reverse so down and up passes pair
  // symmetrically (tent² per level); the final stretch lands in `out`.
  let cur: HTMLCanvasElement = down[down.length - 1]!;
  for (let i = down.length - 2; i >= 0; i--) {
    const target = down[i]!;
    const tctx = target.getContext('2d');
    if (!tctx) break;
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(cur, 0, 0, target.width, target.height);
    cur = target;
  }
  ctx.drawImage(cur, 0, 0, out.width, out.height);
  return out;
}
