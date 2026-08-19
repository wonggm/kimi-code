// apps/kimi-web/src/composables/useSlashMenu.ts
import { nextTick, ref, type Ref } from 'vue';
import type { AppSkill } from '../api/types';
import {
  buildSlashItems,
  filterSlashCommands,
  type SlashCommand,
} from '../lib/slashCommands';
import type { SlashMatchRanges } from '../lib/slashFuzzy';

export interface SlashMenuDeps {
  /** The live composer text — drives filtering and is rewritten on select. */
  text: Ref<string>;
  /** The textarea element, used to focus and place the caret for acceptsInput. */
  textareaRef: Ref<HTMLTextAreaElement | null>;
  /** Re-fit the textarea after its text changes. */
  autosize: () => void;
  /** Current session skills (getter, so the menu stays reactive). */
  skills: () => AppSkill[];
  /** Emit a chosen slash command up to the parent. */
  emitCommand: (cmd: string) => void;
  /** Record a sent command for ↑/↓ recall. */
  historyPush: (entry: string) => void;
  /**
   * Synchronously clear the persisted draft when a bare command is chosen.
   * Mirrors the explicit clear in Composer's submit/steer paths so a draft
   * is not left behind if the Composer unmounts before the text watcher flushes.
   */
  clearDraft?: () => void;
  /**
   * Resolve a command's description text (localized for built-ins, raw for
   * skills). Driving fuzzy description/pinyin search. When omitted, only the
   * command name is searched.
   */
  resolveDesc?: (item: SlashCommand) => string;
}

/**
 * `/` slash-command menu: fuzzy filtering (name, description text, pinyin,
 * pinyin initials), highlight ranges, keyboard navigation state, and selection.
 *
 * The menu stays open for any bare `/token` — even with zero matches it shows
 * an empty state (see SlashMenu) — so closing is driven explicitly by the
 * composer (blur, Escape, session switch) or by selecting an item.
 *
 * The composer keeps the keydown orchestration (arrow keys, Enter/Tab, Escape)
 * because it also juggles the mention menu and history recall; this composable
 * owns the menu's open/items/ranges/active state, the filter logic, and what
 * happens when an item is chosen.
 */
export function useSlashMenu(deps: SlashMenuDeps) {
  const { text, textareaRef, autosize, skills, emitCommand, historyPush, clearDraft, resolveDesc } = deps;

  const open = ref(false);
  const items = ref<SlashCommand[]>([]);
  const ranges = ref<SlashMatchRanges[]>([]);
  const query = ref('');
  const active = ref(0);

  function update(): void {
    const val = text.value;
    // Only show if the value starts with `/` and has no space yet (single token).
    if (val.startsWith('/') && !val.includes(' ')) {
      // Built-in commands + the active session's skills (shown as /<skill-name>).
      const matches = filterSlashCommands(val, buildSlashItems(skills()), resolveDesc);
      items.value = matches.map((m) => m.item);
      ranges.value = matches.map((m) => m.ranges);
      query.value = val;
      active.value = 0;
      open.value = true;
    } else {
      open.value = false;
      items.value = [];
      ranges.value = [];
      query.value = '';
    }
  }

  /** Close the menu (blur, Escape, session switch…). */
  function close(): void {
    open.value = false;
  }

  function select(item: SlashCommand): void {
    open.value = false;
    if (item.acceptsInput) {
      text.value = `${item.name} `;
      void nextTick(() => {
        const el = textareaRef.value;
        if (!el) return;
        const pos = text.value.length;
        el.setSelectionRange(pos, pos);
        el.focus();
        autosize();
      });
      return;
    }
    text.value = '';
    clearDraft?.();
    // Menu-selected bare commands (e.g. /model, /login) reach here directly and
    // never go through handleSubmit, so record them for recall too. acceptsInput
    // commands are pushed later by handleSubmit together with their argument.
    historyPush(item.name);
    emitCommand(item.name);
  }

  return { open, items, ranges, query, active, update, select, close };
}