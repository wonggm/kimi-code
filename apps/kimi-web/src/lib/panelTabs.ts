// apps/kimi-web/src/lib/panelTabs.ts
// The right panel's tab model, ported from upstream's own registry (`const sm`
// in its bundle) rather than invented here. Each kind declares a policy, a key,
// a glyph and whether the panel rebuilds it on load; the shell renders from
// this, and the state composable persists exactly the restorable kinds.
//
// Pure on purpose: the panel's state and its transitions stay unit-testable
// without Vue (the same reason the previous `rpt-*` model lived in lib/).

import type { IconName } from './icons';

export type PanelTabKind = 'diff' | 'turn-diff' | 'file' | 'agent' | 'compaction' | 'btw' | 'term';

export type PanelTab =
  | { id: string; kind: 'diff' }
  | { id: string; kind: 'turn-diff'; path: string }
  | { id: string; kind: 'file'; path: string; line?: number }
  | { id: string; kind: 'agent'; subagentId: string }
  | { id: string; kind: 'compaction'; turnId: string }
  | { id: string; kind: 'btw'; agentId?: string; seq: number }
  | { id: string; kind: 'term'; title?: string };

/** How a kind joins the strip. `singleton` holds at most one tab; `keyed`
 *  replaces the tab with the same key; `always` appends, replacing only a tab
 *  for the same agent. `restorable` is upstream's flag for tabs the panel
 *  rebuilds from its stored payload on load. */
export interface PanelTabRule {
  policy: 'singleton' | 'keyed' | 'always';
  restorable: boolean;
  icon: IconName;
  /** Kinds whose title is a fixed string; the path kinds title themselves from
   *  the payload (upstream shows the basename). */
  i18nKey?: string;
}

export const PANEL_TAB_RULES: Record<PanelTabKind, PanelTabRule> = {
  diff: { policy: 'singleton', restorable: false, icon: 'git-fork', i18nKey: 'panel.tabs.diff' },
  'turn-diff': { policy: 'singleton', restorable: false, icon: 'file-edit' },
  file: { policy: 'keyed', restorable: false, icon: 'file-text' },
  agent: { policy: 'keyed', restorable: true, icon: 'robot', i18nKey: 'panel.tabs.agent' },
  compaction: { policy: 'keyed', restorable: true, icon: 'list', i18nKey: 'panel.tabs.compaction' },
  btw: { policy: 'always', restorable: true, icon: 'message', i18nKey: 'sideChat.title' },
  // Terminals append like side chats, are never restored, and upstream keeps
  // only the session's own terminal tabs when the session changes.
  term: { policy: 'always', restorable: false, icon: 'terminal', i18nKey: 'panel.tabs.term' },
};

/** The identity a tab is de-duplicated by. Upstream's `keyOf`: the path for the
 *  file-ish kinds, the subagent for an agent tab, the turn for a compaction
 *  summary, the agent for a side chat. `diff` is a singleton and has no key. */
export function panelTabKey(tab: PanelTab): string | null {
  switch (tab.kind) {
    case 'file':
    case 'turn-diff':
      return tab.path;
    case 'agent':
      return tab.subagentId;
    case 'compaction':
      return tab.turnId;
    case 'btw':
      return tab.agentId ?? null;
    default:
      return null;
  }
}

/** Open a tab, replacing whatever the kind's policy says it replaces. Returns a
 *  new array so the caller can assign straight onto a ref. */
export function openPanelTab(tabs: readonly PanelTab[], tab: PanelTab): PanelTab[] {
  const rule = PANEL_TAB_RULES[tab.kind];
  if (rule.policy === 'singleton') {
    return [...tabs.filter((existing) => existing.kind !== tab.kind), tab];
  }
  const key = panelTabKey(tab);
  if (rule.policy === 'keyed') {
    return [...tabs.filter((existing) => existing.kind !== tab.kind || panelTabKey(existing) !== key), tab];
  }
  // `always`: upstream replaces a side chat whose `agentId` matches the one
  // being opened and appends otherwise — two session-level side chats (both
  // `agentId: undefined`) therefore replace each other rather than stacking.
  const kept = tabs.filter((existing) => existing.kind !== 'btw' || panelTabKey(existing) !== key);
  return [...kept, tab];
}

/** The next side-chat sequence number — upstream titles them "Side chat 2", … */
export function nextSideChatSeq(tabs: readonly PanelTab[]): number {
  return tabs.filter((tab) => tab.kind === 'btw').length + 1;
}

/** Close a tab and report the tab that should take focus. Upstream keeps the
 *  position in the strip, falling back to the previous tab. */
export function closePanelTab(
  tabs: readonly PanelTab[],
  id: string,
): { tabs: PanelTab[]; activeId: string | null } {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return { tabs: [...tabs], activeId: null };
  const remaining = tabs.filter((tab) => tab.id !== id);
  const next = remaining[index] ?? remaining[index - 1];
  return { tabs: remaining, activeId: next?.id ?? null };
}

/** The tabs the panel rebuilds on load: the restorable kinds only. */
export function restorablePanelTabs(tabs: readonly PanelTab[]): PanelTab[] {
  return tabs.filter((tab) => PANEL_TAB_RULES[tab.kind].restorable);
}

interface StoredTab {
  kind: PanelTabKind;
  path?: string;
  line?: number;
  subagentId?: string;
  turnId?: string;
  agentId?: string;
  seq?: number;
}

export function serializeRestorableTabs(tabs: readonly PanelTab[]): StoredTab[] {
  return restorablePanelTabs(tabs).map((tab) => {
    switch (tab.kind) {
      case 'file':
        return { kind: tab.kind, path: tab.path, line: tab.line };
      case 'turn-diff':
        return { kind: tab.kind, path: tab.path };
      case 'agent':
        return { kind: tab.kind, subagentId: tab.subagentId };
      case 'compaction':
        return { kind: tab.kind, turnId: tab.turnId };
      case 'btw':
        return { kind: tab.kind, agentId: tab.agentId, seq: tab.seq };
      default:
        return { kind: tab.kind };
    }
  });
}

/** Rebuild stored tabs, dropping anything that no longer has what it needs —
 *  a stored payload the engine has since forgotten is a missing tab, not a
 *  broken panel. */
export function deserializeRestorableTabs(
  raw: readonly StoredTab[],
  nextId: () => string,
): PanelTab[] {
  const out: PanelTab[] = [];
  for (const tab of raw) {
    const id = nextId();
    switch (tab.kind) {
      case 'agent':
        if (tab.subagentId) out.push({ id, kind: 'agent', subagentId: tab.subagentId });
        break;
      case 'compaction':
        if (tab.turnId) out.push({ id, kind: 'compaction', turnId: tab.turnId });
        break;
      case 'btw':
        out.push({ id, kind: 'btw', agentId: tab.agentId, seq: tab.seq ?? 1 });
        break;
      default:
        break;
    }
  }
  return out;
}
