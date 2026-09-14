// apps/kimi-web/src/composables/useRightPanel.ts
// The right panel's state, in upstream's shape: a list of tabs with one active
// id, a visibility flag, an expanded flag and a width — plus the typed openers
// upstream's own entry points are named after (`openDiffDetail`, `openTurnDiff`,
// `openFilePreview`, `openAgentPanel`, `openSideChatTab`, the compaction panel,
// a terminal).
//
// Two upstream rules are load-bearing here: the panel is a singleton that keeps
// its state across components (the dock pills, the subagent cards and the
// transcript's compaction divider all open tabs), and only the restorable kinds
// (agent, compaction, side chat) survive a reload — the file/diff summaries do
// not. Terminal tabs belong to the session that opened them and are dropped when
// the session changes.

import { computed, ref, watch } from 'vue';
import { clampPanelWidth, panelMaxWidth, useViewportWidth } from './useViewportWidth';
import {
  closePanelTab,
  deserializeRestorableTabs,
  nextSideChatSeq,
  openPanelTab,
  serializeRestorableTabs,
  type PanelTab,
} from '../lib/panelTabs';
import { STORAGE_KEYS, safeGetString, safeSetString } from '../lib/storage';

const tabs = ref<PanelTab[]>([]);
const activeTabId = ref<string | null>(null);
const visible = ref(false);
const expanded = ref(false);
// Width, as upstream computes it: the panel takes half the room beside the
// sidebar by default, clamped to a 320px floor and to what the viewport can
// spare (`panelMaxWidth`/`clampPanelWidth` are the fork's equivalents of the two
// clamps in upstream's `TWe`). A width the user drags is stored and wins.
export const PANEL_PREVIEW_MIN = 320;
const storedPreviewWidth = ref(Number(safeGetString(STORAGE_KEYS.filePreviewWidth)) || 0);
const sideWidth = ref(0);
const { viewportWidth } = useViewportWidth();
const room = computed(() => Math.max(0, viewportWidth.value - sideWidth.value));
const maxWidth = computed(() => panelMaxWidth(room.value, PANEL_PREVIEW_MIN, PANEL_PREVIEW_MIN));
const defaultWidth = computed(() => clampPanelWidth(Math.round(room.value / 2), PANEL_PREVIEW_MIN, maxWidth.value));
const previewWidth = computed(() =>
  storedPreviewWidth.value > 0
    ? clampPanelWidth(storedPreviewWidth.value, PANEL_PREVIEW_MIN, maxWidth.value)
    : defaultWidth.value,
);

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `panel-tab-${idCounter}`;
}

let currentSessionId: string | null = null;

function activeTabOf(list: readonly PanelTab[], id: string | null): PanelTab | null {
  return list.find((tab) => tab.id === id) ?? null;
}

/** Open a tab: apply the kind's policy, show the panel, focus the new tab. */
function open(tab: PanelTab): void {
  tabs.value = openPanelTab(tabs.value, tab);
  activeTabId.value = tab.id;
  visible.value = true;
  persistTabs();
}

/** The restorable tabs of the current session, as stored. A session's entry is
 *  rewritten whenever the tabs change; other sessions' entries are kept. */
function storedBySession(): Record<string, unknown> {
  const raw = safeGetString(STORAGE_KEYS.rightPanelTabs);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function persistTabs(): void {
  if (currentSessionId === null) return;
  const all = storedBySession();
  const stored = serializeRestorableTabs(tabs.value);
  if (stored.length > 0) all[currentSessionId] = stored;
  else delete all[currentSessionId];
  safeSetString(STORAGE_KEYS.rightPanelTabs, JSON.stringify(all));
}

/** Switch sessions, as upstream's own watcher does: every tab of the previous
 *  session goes (its terminal included — upstream keeps terminals only in the
 *  draft-promotion case, where the "new" session is the same work continuing),
 *  and the new session's restorable tabs are rebuilt from what was stored.
 *  Visibility does NOT follow the tabs: upstream's panel is closed by every
 *  session change and is never persisted, so a session whose panel the user
 *  closed comes back closed (the stored tabs are its tab list, not a statement
 *  that the panel was showing — the header control still reveals them). */
function bindSession(sessionId: string | null): void {
  if (sessionId === currentSessionId) return;
  currentSessionId = sessionId;
  const stored = sessionId ? storedBySession()[sessionId] : undefined;
  const restored =
    sessionId && Array.isArray(stored)
      ? deserializeRestorableTabs(stored as Parameters<typeof deserializeRestorableTabs>[0], nextId)
      : [];
  tabs.value = restored;
  visible.value = false;
  activeTabId.value = restored.at(-1)?.id ?? null;
  persistTabs();
}

watch(storedPreviewWidth, (width) => {
  if (width > 0) safeSetString(STORAGE_KEYS.filePreviewWidth, String(Math.round(width)));
});

export function useRightPanel() {
  return {
    tabs,
    activeTabId,
    visible,
    expanded,
    previewWidth,
    maxWidth,
    activeTab: computed(() => activeTabOf(tabs.value, activeTabId.value)),

    /** Upstream's `openDiffDetail` — the session's changed files. */
    openDiff: (): void => open({ id: nextId(), kind: 'diff' }),
    /** Upstream's `openTurnDiff` — one file's diff, a singleton. */
    openTurnDiff: (path: string): void => open({ id: nextId(), kind: 'turn-diff', path }),
    /** Upstream's `openFilePreview` — keyed by path. */
    openFile: (path: string, line?: number): void => open({ id: nextId(), kind: 'file', path, line }),
    /** Upstream's `openAgentPanel` — one tab per subagent. */
    openAgent: (subagentId: string): void => open({ id: nextId(), kind: 'agent', subagentId }),
    openCompaction: (turnId: string): void => open({ id: nextId(), kind: 'compaction', turnId }),
    /** Upstream's `openSideChatTab`; `agentId` makes it the agent's own chat. */
    openSideChat: (agentId?: string): void =>
      open({ id: nextId(), kind: 'btw', agentId, seq: nextSideChatSeq(tabs.value) }),
    openTerminal: (title?: string): void => open({ id: nextId(), kind: 'term', title }),

    activateTab: (id: string): void => {
      if (!tabs.value.some((tab) => tab.id === id)) return;
      activeTabId.value = id;
      visible.value = true;
    },
    closeTab: (id: string): void => {
      const { tabs: remaining, activeId } = closePanelTab(tabs.value, id);
      tabs.value = remaining;
      activeTabId.value = activeId;
      if (remaining.length === 0) visible.value = false;
      persistTabs();
    },
    toggleExpanded: (): void => {
      expanded.value = !expanded.value;
    },
    hide: (): void => {
      visible.value = false;
    },
    show: (): void => {
      visible.value = true;
    },
    bindSession,
    /** The sidebar's width, which upstream subtracts from the viewport to work
     *  out how much room the panel has. */
    setSideWidth: (width: number): void => {
      sideWidth.value = width;
    },
    setPreviewWidth: (width: number): void => {
      storedPreviewWidth.value = width;
    },
  };
}
