// apps/kimi-web/src/composables/useSelectionQuote.ts
// Text-selection quoting: any surface that can hold a text selection registers
// itself with `useSelectionCapture`, which hands the selection to the single
// app-wide SelectionQuoteBubble (mounted by ConversationPane). Confirming the
// bubble routes the quoted text through the composer's existing quote-to-chat
// path (ConversationPane.handleQuote). A module-level ref is used because the
// quoting surfaces and the composer are not always in the same component
// subtree (the app-level file preview and diff panel are siblings of
// ConversationPane).

import { onBeforeUnmount, onMounted, ref } from 'vue';

/** Viewport-space anchor for a selection that can be quoted into the chat. */
export interface SelectionAnchor {
  text: string;
  top: number;
  bottom: number;
  centerX: number;
}

/** The live selection the app-wide bubble shows; null when nothing is selected. */
export const selectionAnchor = ref<SelectionAnchor | null>(null);

export function clearSelectionAnchor(): void {
  selectionAnchor.value = null;
}

/** Markdown blockquote form of quoted text (shared with the outline rail). */
export function toQuoteBlock(text: string): string {
  return text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

export interface ComposerQuoteRequest {
  text: string;
}

// A fresh object per request so repeat quotes of the same text still notify
// the watcher.
const composerQuoteRequest = ref<ComposerQuoteRequest | null>(null);

/** Ask the active composer to load this markdown text (ConversationPane.handleQuote). */
export function requestComposerQuote(text: string): void {
  const value = text.trim();
  if (value === '') return;
  composerQuoteRequest.value = { text: value };
}

export function useComposerQuoteRequest() {
  return composerQuoteRequest;
}

/** Quote a selection, with an optional comment, into the chat composer. */
export function quoteSelectionIntoChat(quote: string, comment = ''): void {
  const selected = quote.trim();
  if (selected === '') return;
  const block = toQuoteBlock(selected);
  const body = comment.trim();
  requestComposerQuote(body === '' ? block : `${block}\n\n${body}`);
}

export interface SelectionSource {
  text: string;
  rect: DOMRect;
}

function domSelection(host: HTMLElement): SelectionSource | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!host.contains(range.commonAncestorContainer)) return null;
  const text = selection.toString();
  if (text.trim() === '') return null;
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { text, rect };
}

/**
 * Capture a text selection inside `getHost()` on mouse-up — never mid-drag, so
 * a slow drag does not pop the bubble before the button is released. `extract`
 * overrides the DOM-selection read for surfaces that own their selection (the
 * xterm terminal).
 */
export function useSelectionCapture(
  getHost: () => HTMLElement | null,
  extract?: () => SelectionSource | null,
): void {
  function onMouseUp(event: MouseEvent): void {
    if (event.button !== 0) return;
    const host = getHost();
    if (!host) return;
    if (!(event.target instanceof Node) || !host.contains(event.target)) return;
    const found = extract ? extract() : domSelection(host);
    if (!found) return;
    selectionAnchor.value = {
      text: found.text,
      top: found.rect.top,
      bottom: found.rect.bottom,
      centerX: found.rect.left + found.rect.width / 2,
    };
  }

  onMounted(() => document.addEventListener('mouseup', onMouseUp));
  onBeforeUnmount(() => document.removeEventListener('mouseup', onMouseUp));
}
