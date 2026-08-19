// apps/kimi-web/src/composables/useMentionMenu.ts
import { nextTick, ref, type Ref } from 'vue';
import type { FileItem } from '../types';

export interface MentionMenuDeps {
  /** The live composer text — the @token is read from it and rewritten on select. */
  text: Ref<string>;
  /** The textarea element, used to read the caret and place it after insertion. */
  textareaRef: Ref<HTMLTextAreaElement | null>;
  /** Re-fit the textarea after its text changes. */
  autosize: () => void;
  /** File search for the @-query (getter; undefined disables the menu). */
  searchFiles: () => ((q: string) => Promise<FileItem[]>) | undefined;
}

interface MentionToken {
  token: string;
  start: number;
  end: number;
}

/**
 * `@` file-mention menu: token detection, debounced search, keyboard navigation
 * state, and insertion.
 *
 * The composer keeps the keydown orchestration (arrow keys, Enter/Tab, Escape)
 * because it also juggles the slash menu and history recall; this composable
 * owns the menu's open/items/active/loading state and the search/insert logic.
 */
export function useMentionMenu(deps: MentionMenuDeps) {
  const { text, textareaRef, autosize, searchFiles } = deps;

  const open = ref(false);
  const items = ref<FileItem[]>([]);
  const active = ref(0);
  const loading = ref(false);

  // Debounce timer for the search.
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Bumped on every update/close; an in-flight search checks it before touching
  // state, so a stale resolve can never reopen a closed (or superseded) menu.
  let searchGeneration = 0;

  /** Find the @token under the cursor in the current text value. Returns null if none. */
  function getMentionToken(): MentionToken | null {
    const val = text.value;
    const pos = textareaRef.value?.selectionStart ?? val.length;
    // Walk backwards from the cursor to find the start of a @token.
    let start = pos - 1;
    while (start >= 0 && !/\s/.test(val[start]!)) {
      start--;
    }
    start++;
    const tokenPart = val.slice(start, pos);
    if (!tokenPart.startsWith('@')) return null;
    // The end of the token is where the cursor is (or after the next space).
    return { token: tokenPart.slice(1), start, end: pos };
  }

  function update(): void {
    const mt = getMentionToken();
    const search = searchFiles();
    if (!mt || !search) {
      // No @token anymore: cancel any pending search so it cannot reopen us.
      searchGeneration++;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      open.value = false;
      return;
    }
    const query = mt.token;
    if (timer !== null) clearTimeout(timer);
    const generation = ++searchGeneration;
    timer = setTimeout(async () => {
      if (generation !== searchGeneration) return;
      loading.value = true;
      open.value = true;
      active.value = 0;
      let result: FileItem[];
      try {
        result = await search(query);
      } catch {
        result = [];
      }
      // A newer update() or close() may have superseded this search while it
      // was in flight — do not touch the menu state then.
      if (generation !== searchGeneration) return;
      items.value = result;
      loading.value = false;
    }, 200);
  }

  /** Close the menu and cancel any pending or in-flight search. */
  function close(): void {
    searchGeneration++;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    open.value = false;
    loading.value = false;
    items.value = [];
  }

  function select(item: FileItem): void {
    const mt = getMentionToken();
    if (!mt) return;
    const val = text.value;
    // Replace the @query token with the file path.
    text.value = val.slice(0, mt.start) + item.path + val.slice(mt.end);
    close();
    void nextTick(() => {
      const el = textareaRef.value;
      if (!el) return;
      const newPos = mt.start + item.path.length;
      el.setSelectionRange(newPos, newPos);
      el.focus();
      autosize();
    });
  }

  return { open, items, active, loading, update, select, close };
}
