// apps/kimi-web/src/lib/linkifyCjkBoundary.ts
// Fix for auto-linked bare URLs swallowing immediately-following CJK text.
//
// The linkify rule treats neighbouring CJK characters as part of the URL
// (path characters get percent-encoded into href, or domain characters get
// punycoded), so "see http://example.com中文" comes out as one broken link.
// We cut the trailing CJK run out of the anchor — both the displayed text and
// the href — and move it back into the surrounding text flow. Explicit
// [label](url) links are never touched: their label is not a bare URL, so the
// scheme check below leaves them alone.

/** Chinese / fullwidth punctuation runs: CJK unified ideographs, CJK
 *  extensions, compatible ideographs, kana, hangul, and fullwidth forms — the
 *  characters linkify-it swallows into a URL. */
const TRAILING_CJK_RE = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]+$/;

const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Split trailing CJK text off a bare-URL string. Returns null when the string
 * is not a scheme-bearing URL or has no trailing CJK.
 */
export function splitTrailingCjk(text: string): { url: string; tail: string } | null {
  if (!URL_SCHEME_RE.test(text)) return null;
  const match = text.match(TRAILING_CJK_RE);
  if (!match) return null;
  const tail = match[0];
  const cut = text.length - tail.length;
  if (cut <= 0) return null;
  return { url: text.slice(0, cut), tail };
}

/**
 * Walk the rendered markdown and repair auto-linked anchors whose text ends
 * with CJK: strip the trailing run from the anchor text + href and re-emit it
 * as a plain text node right after the anchor. Idempotent per anchor
 * (data-cjk-fixed). Only runs on settled trees (never while streaming).
 */
export function fixLinkifyCjkBoundary(root: HTMLElement): void {
  const anchors = root.querySelectorAll<HTMLAnchorElement>('a[href]');
  for (const anchor of anchors) {
    if (anchor.dataset.cjkFixed === 'true') continue;
    if (anchor.closest('svg')) continue;
    if (anchor.querySelector('img, svg, code')) continue;
    const text = anchor.textContent ?? '';
    const split = splitTrailingCjk(text);
    if (split === null) continue;
    const textNode = [...anchor.childNodes].find(
      (node): node is Text => node.nodeType === Node.TEXT_NODE,
    );
    if (!textNode) continue;
    anchor.dataset.cjkFixed = 'true';
    textNode.data = split.url;
    anchor.setAttribute('href', split.url);
    const tail = document.createTextNode(split.tail);
    if (anchor.nextSibling) {
      anchor.parentNode?.insertBefore(tail, anchor.nextSibling);
    } else {
      anchor.parentNode?.appendChild(tail);
    }
  }
}