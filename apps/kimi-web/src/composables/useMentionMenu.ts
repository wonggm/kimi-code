// apps/kimi-web/src/composables/useMentionMenu.ts
import { nextTick, ref, watch, type Ref } from 'vue';
import type { FileItem } from '../types';
import type { AppSkill } from '../api/types';
import { mentionToText, type MentionInsert } from '../lib/mentionTokens';

/** A file row as returned by the workspace search: the engine also reports the
 *  entry kind, a 0–1 match score and the per-character match positions (offsets
 *  into `path`). The optional fields are absent on the legacy fs:search path. */
export type MentionFileItem = FileItem & {
  kind?: 'file' | 'directory' | 'symlink';
  score?: number;
  matchPositions?: number[];
};

/** A mention-menu row: a searched file/folder, or a session skill. */
export type MentionItem =
  | { kind: 'file' | 'folder'; name: string; path: string; score?: number; matchPositions?: number[] }
  | { kind: 'skill'; name: string; path: ''; score?: number };

export interface MentionMenuDeps {
  /** The live composer text — the @token is read from it and rewritten on select. */
  text: Ref<string>;
  /** The textarea element, used to read the caret and place it after insertion. */
  textareaRef: Ref<HTMLTextAreaElement | null>;
  /** Re-fit the textarea after its text changes. */
  autosize: () => void;
  /** File search for the @-query (getter; undefined disables the file rows).
   *  Should feed fs:suggest-ranked results (score + match_positions). */
  searchFiles: () => ((q: string) => Promise<MentionFileItem[]>) | undefined;
  /** Session skills offered in the mention list (getter; empty disables them). */
  skills?: () => AppSkill[];
}

interface MentionToken {
  token: string;
  start: number;
  end: number;
}

/** A searched file row: directories are recognized by the engine kind, with a
 *  trailing-slash fallback for search results that drop the kind. */
function itemForFile(file: MentionFileItem): MentionItem {
  const folder =
    file.kind === 'directory' || file.path.endsWith('/');
  return folder
    ? { kind: 'folder', name: file.name, path: file.path, score: file.score, matchPositions: file.matchPositions }
    : { kind: 'file', name: file.name, path: file.path, score: file.score, matchPositions: file.matchPositions };
}

/** Rank matches: name-prefix hits first, then substring hits (both case-folded).
 *  Returns the ranked rows with a synthetic 0–1 score so skills can be merged
 *  into the file rows by match quality. */
function rankedSkillRows(skills: AppSkill[], queryLower: string): { item: MentionItem; score: number }[] {
  const prefix: AppSkill[] = [];
  const includes: AppSkill[] = [];
  for (const skill of skills) {
    const name = skill.name.toLowerCase();
    if (name.startsWith(queryLower)) prefix.push(skill);
    else if (name.includes(queryLower)) includes.push(skill);
  }
  return [...prefix, ...includes].map((skill, i) => ({
    item: itemForSkill(skill),
    score: Math.max(0.55, 1 - i * 0.15),
  }));
}

function itemForSkill(skill: AppSkill): MentionItem {
  return { kind: 'skill', name: skill.name, path: '' };
}

/**
 * `@` file/skill mention menu: token detection, debounced search, keyboard
 * navigation state, and insertion.
 *
 * The composer keeps the keydown orchestration (arrow keys, Enter, Escape)
 * because it also juggles the slash menu and history recall; this composable
 * owns the menu's open/items/active/loading state, the search/insert logic,
 * and the shared `insertMention` used by both the menu pick and the
 * paste-a-folder flow. Tab is the exception: it is intercepted on the textarea
 * in the capture phase here, so it can complete the active candidate in place
 * while the composer's handler keeps Enter's select-and-close.
 *
 * File rows arrive ranked by the engine's fs:suggest score (fuzzy name +
 * path-fragment matches); skills get a synthetic score from their prefix /
 * substring rank, and the two lists merge into one score-ordered list. Rows
 * without a score (legacy search fallback) sort last, in arrival order.
 */
export function useMentionMenu(deps: MentionMenuDeps) {
  const { text, textareaRef, autosize } = deps;

  const open = ref(false);
  const items = ref<MentionItem[]>([]);
  const active = ref(0);
  const loading = ref(false);
  /** The raw `@token` currently driving the menu — lets the renderer fall back
   *  to substring highlighting when results carry no match positions. */
  const query = ref('');

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
    const rawToken = mt.token;
    const queryLower = rawToken.toLowerCase();
    query.value = rawToken;
    const skills = deps.skills?.() ?? [];
    const skillRows = rawToken === '' ? [] : rankedSkillRows(skills, queryLower);

    const search = deps.searchFiles();
    if (!search) {
      // No file source (e.g. no attach upload): skills alone drive the menu.
      if (timer !== null) clearTimeout(timer);
      active.value = 0;
      open.value = skillRows.length > 0;
      items.value = skillRows.map((row) => row.item);
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
      let result: MentionFileItem[];
      try {
        result = await search(rawToken);
      } catch {
        result = [];
      }
      // A newer update() or close() may have superseded this search while it
      // was in flight — do not touch the menu state then.
      if (generation !== searchGeneration) return;
      const fileRows = result.map(itemForFile);
      items.value = [...fileRows, ...skillRows.map((row) => row.item)].sort(
        (a, b) => (b.score ?? 0) - (a.score ?? 0),
      );
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
    query.value = '';
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

  /**
   * Tab completion: rewrite the active `@token` to the candidate's path
   * (files/folders; folders keep a trailing slash) or name (skills), leaving
   * the `@` in place and keeping the menu open so the query can be narrowed
   * further. A candidate whose text cannot live in a bare `@token` (spaces,
   * brackets, backslash) falls back to a full mention insert.
   */
  function complete(item: MentionItem): void {
    const mt = getMentionToken();
    if (mt === null) return;
    const completion =
      item.kind === 'skill'
        ? item.name
        : item.path.replace(/\/+$/, '') + (item.kind === 'folder' ? '/' : '');
    if (/[\s[\]\\]/u.test(completion)) {
      select(item);
      return;
    }
    const alreadyComplete =
      item.kind === 'skill'
        ? completion === mt.token
        : completion.replace(/\/+$/, '') === mt.token.replace(/\/+$/, '') &&
          (item.kind !== 'folder' || mt.token.endsWith('/'));
    if (alreadyComplete) return;

    // Replace only the text after the '@' so the token stays live; the debounced
    // update() then re-searches with the completed query and the menu stays open.
    const start = mt.start + 1;
    text.value = text.value.slice(0, start) + completion + text.value.slice(mt.end);
    const caret = start + completion.length;
    void nextTick(() => {
      const el = textareaRef.value;
      if (!el) return;
      el.setSelectionRange(caret, caret);
      el.focus();
      autosize();
      update();
    });
  }

  // The composer owns keydown orchestration but routes Tab through the same
  // select() as Enter. Intercept Tab in the capture phase while this menu is
  // open so Tab completes in place (menu stays open) and Enter keeps its
  // select-and-close behaviour.
  function onTabKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Tab' || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;
    if (!open.value || loading.value) return;
    const item = items.value[active.value];
    if (!item) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    complete(item);
  }

  let tabBoundEl: HTMLTextAreaElement | null = null;
  function unbindTabKeydown(): void {
    if (tabBoundEl !== null) {
      tabBoundEl.removeEventListener('keydown', onTabKeydown, true);
      tabBoundEl = null;
    }
  }
  watch(
    textareaRef,
    (el) => {
      unbindTabKeydown();
      if (el && typeof el.addEventListener === 'function') {
        el.addEventListener('keydown', onTabKeydown, true);
        tabBoundEl = el;
      }
    },
    { immediate: true },
  );

  return { open, items, active, loading, query, update, select, complete, close, insertMention };
}
