// apps/kimi-web/src/lib/inlineCodeMath.ts
// Pure helpers for the KaTeX math pipeline in Markdown.vue.
//
// The markdown parser's inline-math rule can break when a paragraph contains
// BOTH an inline code span holding `$` AND another `$` elsewhere: the math
// rule's forward scan starts from the in-span dollar, crosses the code span,
// and destroys the span (it then renders as literal backticked text) while
// treating the stray dollar as math. The parser cannot be patched from the
// app, so we protect the source text instead: every `$` INSIDE an inline code
// span is replaced with a private-use sentinel the math rule ignores, and the
// rendered DOM restores the sentinel back to `$`. Regular math outside code
// spans is untouched.
//
// The sentinel only ever appears inside code spans produced by protect(), so
// the restore pass can run naively over rendered <code> nodes.

/** Private-use placeholder for `$` inside inline code spans. */
export const DOLLAR_SENTINEL = '\uE000';

/**
 * Replace `$` with DOLLAR_SENTINEL inside inline code spans (backtick runs of
 * equal length, mirroring the markdown parser's code-span rule). Multiline
 * backtick regions are skipped — they are fenced code blocks, whose content is
 * never scanned for math. Unbalanced backticks are left alone.
 */
export function protectInlineCodeDollars(src: string): string {
  if (!src.includes('`') || !src.includes('$')) return src;
  let out = '';
  let i = 0;
  while (i < src.length) {
    if (src[i] !== '`') {
      out += src[i];
      i++;
      continue;
    }
    const openStart = i;
    let openLen = 1;
    while (openStart + openLen < src.length && src[openStart + openLen] === '`') openLen++;
    let j = openStart + openLen;
    let closeStart = -1;
    while (j < src.length) {
      if (src[j] !== '`') {
        j++;
        continue;
      }
      let runLen = 1;
      while (j + runLen < src.length && src[j + runLen] === '`') runLen++;
      if (runLen === openLen && !(j + openLen < src.length && src[j + openLen] === '`')) {
        closeStart = j;
        break;
      }
      j += runLen;
    }
    if (closeStart === -1) {
      out += src.slice(openStart, openStart + openLen);
      i = openStart + openLen;
      continue;
    }
    const content = src.slice(openStart + openLen, closeStart);
    if (content.includes('\n')) {
      // Fenced block — copy verbatim.
      out += src.slice(openStart, closeStart + openLen);
    } else {
      out += src.slice(openStart, openStart + openLen);
      out += content.replace(/\$/g, DOLLAR_SENTINEL);
      out += src.slice(closeStart, closeStart + openLen);
    }
    i = closeStart + openLen;
  }
  return out;
}

/**
 * Restore DOLLAR_SENTINEL → `$` in the text nodes of every rendered <code>
 * element under `root` (inline chips and block code both — the sentinel never
 * occurs elsewhere). Idempotent; safe to run on every DOM change.
 */
export function restoreInlineCodeDollars(root: HTMLElement): void {
  if (!root.querySelector('code')) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Text | null = walker.nextNode() as Text | null;
  while (node) {
    const parent = node.parentElement;
    if (parent && parent.tagName === 'CODE' && node.data.includes(DOLLAR_SENTINEL)) {
      node.data = node.data.split(DOLLAR_SENTINEL).join('$');
    }
    node = walker.nextNode() as Text | null;
  }
}