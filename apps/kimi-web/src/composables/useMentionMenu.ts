// apps/kimi-web/src/composables/useMentionMenu.ts
import { nextTick, ref, type Ref } from 'vue';
import type { FileItem } from '../types';
import type { AppSkill } from '../api/types';
import { mentionToText, type MentionInsert } from '../lib/mentionTokens';

/** A mention-menu row: a searched file/folder, or a session skill. */
export type MentionItem =
  | { kind: 'file' | 'folder'; name: string; path: string }
  | { kind: 'skill'; name: string; path: '' };

export interface MentionMenuDeps {
  /** The live composer text — the @token is read from it and rewritten on select. */
  text: Ref<string>;
  /** The textarea element, used to read the caret and place it after insertion. */
  textareaRef: Ref<HTMLTextAreaElement | null>;
  /** Re-fit the textarea after its text changes. */
  autosize: () => void;
  /** File search for the @-query (getter; undefined disables the file rows). */
  searchFiles: () => ((q: string) => Promise<FileItem[]>) | undefined;
  /** Session skills offered after the file rows (getter; empty disables them). */
  skills?: () => AppSkill[];
}

interface MentionToken {
  token: string;
  start: number;
  end: number;
}

/** A searched file row: directories are recognizable only by a trailing slash
 *  (the workspace search drops its kind), everything else is a file. */
function itemForFile(file: FileItem): MentionItem {
  return file.path.endsWith('/')
    ? { kind: 'folder', name: file.name, path: file.path }
    : { kind: 'file', name: file.name, path: file.path };
}

function itemForSkill(skill: AppSkill): MentionItem {
  return { kind: 'skill', name: skill.name, path: '' };
}

/** Rank matches: name-prefix hits first, then substring hits (both case-folded). */
function rankSkills(skills: AppSkill[], queryLower: string): AppSkill[] {
  const prefix: AppSkill[] = [];
  const includes: AppSkill[] = [];
  for (const skill of skills) {
    const name = skill.name.toLowerCase();
    if (name.startsWith(queryLower)) prefix.push(skill);
    else if (name.includes(queryLower)) includes.push(skill);
  }
  return [...prefix, ...includes];
}

/**
 * `@` file/skill mention menu: token detection, debounced search, keyboard
 * navigation state, and insertion.
 *
 * The composer keeps the keydown orchestration (arrow keys, Enter/Tab, Escape)
 * because it also juggles the slash menu and history recall; this composable
 * owns the menu's open/items/active/loading state, the search/insert logic,
 * and the shared `insertMention` used by both the menu pick and the
 * paste-a-folder flow.
 */
export function useMentionMenu(deps: MentionMenuDeps) {
  const { text, textareaRef, autosize } = deps;

  const open = ref(false);
  const items = ref<MentionItem[]>([]);
  const active = ref(0);
  const loading = ref(false);

  // Debounce timer for the file search.
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
    if (!mt) {
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
    const queryLower = query.toLowerCase();
    const skills = deps.skills?.() ?? [];
    const skillRows = query === '' ? [] : rankSkills(skills, queryLower);

    const search = deps.searchFiles();
    if (!search) {
      // No file source (e.g. no attach upload): skills alone drive the menu.
      if (timer !== null) clearTimeout(timer);
      active.value = 0;
      open.value = skillRows.length > 0;
      items.value = skillRows.map(itemForSkill);
      loading.value = false;
      return;
    }
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
      const fileRows = result.map(itemForFile);
      items.value = [...fileRows, ...skillRows.map(itemForSkill)];
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

  /**
   * Insert a mention into the composer text and place the caret after it.
   * When the caret sits inside an active `@query` token, the token is replaced
   * (menu pick); otherwise the mention is inserted at the caret with padding
   * spaces (paste-a-folder). Shared by the menu pick and the folder-paste flow.
   */
  function insertMention(mention: MentionInsert): string {
    const insertion = mentionToText(mention);
    const val = text.value;
    const mt = getMentionToken();
    let newPos = 0;
    if (mt) {
      text.value = val.slice(0, mt.start) + insertion + val.slice(mt.end);
      newPos = mt.start + insertion.length;
    } else {
      const pos = textareaRef.value?.selectionStart ?? val.length;
      const lead = pos > 0 && !/\s/.test(val[pos - 1]!) ? ' ' : '';
      const trail = pos < val.length && !/\s/.test(val[pos]!) ? ' ' : '';
      text.value = val.slice(0, pos) + lead + insertion + trail + val.slice(pos);
      newPos = pos + lead.length + insertion.length;
    }
    void nextTick(() => {
      const el = textareaRef.value;
      if (!el) return;
      el.setSelectionRange(newPos, newPos);
      el.focus();
      autosize();
    });
    return insertion;
  }

  function select(item: MentionItem): void {
    if (getMentionToken() === null) return;
    if (item.kind === 'skill') {
      insertMention({ kind: 'skill', name: item.name, path: '' });
    } else {
      insertMention({
        kind: item.kind,
        name: item.name,
        path: item.path,
      });
    }
    close();
  }

  return { open, items, active, loading, update, select, close, insertMention };
}