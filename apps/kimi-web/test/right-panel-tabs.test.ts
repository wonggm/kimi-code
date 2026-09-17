import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  latestTurnDiffEntries,
  normalizePanelPreviewPath,
  turnFilesForTurn,
} from '../src/lib/rightPanelTabs';
import {
  agentTabTitle,
  closeOtherPanelTabs,
  closePanelTab,
  closePanelTabsToRight,
  deserializeRestorableTabs,
  nextSideChatSeq,
  openPanelTab,
  PANEL_TAB_RULES,
  reorderPanelTabs,
  restorablePanelTabs,
  serializeRestorableTabs,
} from '../src/lib/panelTabs';
import { useRightPanel } from '../src/composables/useRightPanel';
import { STORAGE_KEYS, safeGetString, safeSetString } from '../src/lib/storage';
import type { AppTask } from '../src/api/types';
import type { ChatTurn, ToolCall } from '../src/types';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    key(index) {
      return Array.from(data.keys())[index] ?? null;
    },
    getItem(key) {
      return data.has(key) ? data.get(key)! : null;
    },
    removeItem(key) {
      data.delete(key);
    },
    setItem(key, value) {
      data.set(key, value);
    },
  };
}

function editTool(id: string, path: string, extra: Partial<ToolCall> = {}): ToolCall {
  return {
    id,
    name: 'Edit',
    arg: JSON.stringify({ path, old_string: 'a', new_string: 'b' }),
    status: 'done',
    output: [],
    ...extra,
  };
}

function assistantTurn(id: string, tools: ToolCall[], extra: Partial<ChatTurn> = {}): ChatTurn {
  return { id, role: 'assistant', text: '', tools, ...extra };
}

function userTurn(id: string, text: string): ChatTurn {
  return { id, role: 'user', text };
}

describe('latestTurnDiffEntries', () => {
  it('scopes to the most recent assistant turn', () => {
    const turns: ChatTurn[] = [
      userTurn('u1', 'edit something'),
      assistantTurn('a1', [editTool('t1', 'src/old.ts')]),
      userTurn('u2', 'now do this'),
      assistantTurn('a2', [editTool('t2', 'src/new.ts'), editTool('t3', 'src/other.ts')]),
    ];
    const result = latestTurnDiffEntries(turns);
    expect(result.map((r) => r.path)).toEqual(['src/new.ts', 'src/other.ts']);
  });

  it('returns [] when there is no assistant turn yet', () => {
    const turns: ChatTurn[] = [userTurn('u1', 'hello')];
    expect(latestTurnDiffEntries(turns)).toEqual([]);
  });

  it('deduplicates paths across multiple edits to the same file', () => {
    const turns: ChatTurn[] = [
      assistantTurn('a1', [
        editTool('t1', 'src/x.ts'),
        editTool('t2', 'src/x.ts'),
      ]),
    ];
    const result = latestTurnDiffEntries(turns);
    expect(result).toHaveLength(1);
    expect(result[0]?.path).toBe('src/x.ts');
  });

  it('ignores non-edit/write tools and unparsable args', () => {
    const turns: ChatTurn[] = [
      assistantTurn('a1', [
        { id: 'r1', name: 'read', arg: JSON.stringify({ path: 'src/skip.ts' }), status: 'done' },
        { id: 'b1', name: 'bash', arg: JSON.stringify({ command: 'ls' }), status: 'done' },
        { id: 'b2', name: 'Edit', arg: 'not-json', status: 'done' },
        { id: 'e1', name: 'Edit', arg: JSON.stringify({}), status: 'done' },
        editTool('e2', 'src/keep.ts'),
      ]),
    ];
    const result = latestTurnDiffEntries(turns);
    expect(result).toHaveLength(1);
    expect(result[0]?.path).toBe('src/keep.ts');
  });

  it('drops lines when the tool errored (matches ToolDiffPanel behaviour)', () => {
    const turns: ChatTurn[] = [
      assistantTurn('a1', [
        editTool('e1', 'src/errored.ts', { status: 'error', output: ['boom'] }),
        editTool('e2', 'src/ok.ts', { status: 'done' }),
      ]),
    ];
    const result = latestTurnDiffEntries(turns);
    expect(result).toHaveLength(2);
    expect(result[0]?.lines).toBeNull();
    expect(result[1]?.lines).not.toBeNull();
  });
});

describe('turnFilesForTurn', () => {
  it('keeps insertion order and surfaces toolId / title per entry', () => {
    const turn = assistantTurn('a1', [
      editTool('first', 'src/a.ts'),
      editTool('second', 'src/b.ts'),
    ]);
    const result = turnFilesForTurn(turn);
    expect(result.map((r) => r.toolId)).toEqual(['first', 'second']);
    expect(result.map((r) => r.title)).toEqual(['Edit', 'Edit']);
    expect(result.map((r) => r.path)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('accepts alternate path keys (file_path / filePath / filename)', () => {
    const tools: ToolCall[] = [
      { id: 'a', name: 'Edit', arg: JSON.stringify({ file_path: 'src/fp.ts' }), status: 'done' },
      { id: 'b', name: 'Edit', arg: JSON.stringify({ filePath: 'src/fP.ts' }), status: 'done' },
      { id: 'c', name: 'Edit', arg: JSON.stringify({ filename: 'src/fn.ts' }), status: 'done' },
    ];
    const result = turnFilesForTurn(assistantTurn('a1', tools));
    expect(result.map((r) => r.path)).toEqual(['src/fp.ts', 'src/fP.ts', 'src/fn.ts']);
  });
});

describe('normalizePanelPreviewPath', () => {
  it('passes relative paths through, collapsing . and empty segments', () => {
    expect(normalizePanelPreviewPath('src/a.ts')).toEqual({ path: 'src/a.ts' });
    expect(normalizePanelPreviewPath('./src//a.ts')).toEqual({ path: 'src/a.ts' });
    expect(normalizePanelPreviewPath('   ')).toEqual({ error: 'emptyPath' });
  });

  it('strips the workspace root from absolute paths', () => {
    expect(normalizePanelPreviewPath('/w/root/src/a.ts', '/w/root')).toEqual({ path: 'src/a.ts' });
    expect(normalizePanelPreviewPath('/w/root/src/a.ts', '/w/root/')).toEqual({ path: 'src/a.ts' });
    expect(normalizePanelPreviewPath('/w/root', '/w/root')).toEqual({ error: 'isDirectory' });
  });

  it('rejects paths outside the workspace, URLs, and ~ homes', () => {
    expect(normalizePanelPreviewPath('/etc/passwd', '/w/root')).toEqual({ error: 'outsideWorkspace' });
    expect(normalizePanelPreviewPath('../escape.ts')).toEqual({ error: 'outsideWorkspace' });
    expect(normalizePanelPreviewPath('src/../escape.ts')).toEqual({ error: 'outsideWorkspace' });
    expect(normalizePanelPreviewPath('https://example.com/a.ts')).toEqual({ error: 'unsupportedPath' });
    expect(normalizePanelPreviewPath('~/a.ts')).toEqual({ error: 'outsideWorkspace' });
  });

  it('lets absolute paths through unvalidated when no root is known', () => {
    expect(normalizePanelPreviewPath('/abs/file.ts')).toEqual({ path: '/abs/file.ts' });
  });
});

// ---------------------------------------------------------------------------
// The tab model the complete-merge round adopted, ported from upstream's own
// registry (`const sm` in its bundle). The panel holds at most one `diff` and
// one `turn-diff`, replaces by key for the file/agent/compaction kinds, numbers
// side-chat tabs, and rebuilds only the restorable kinds on load.
// ---------------------------------------------------------------------------
describe('panelTabs model', () => {
  it('keeps a singleton kind to one tab', () => {
    const first = openPanelTab([], { id: 'a', kind: 'diff' });
    const second = openPanelTab(first, { id: 'b', kind: 'diff' });
    expect(second.map((tab) => tab.id)).toEqual(['b']);
  });

  it('replaces by key for the keyed kinds and keeps the others', () => {
    const tabs = openPanelTab(
      openPanelTab([], { id: 'a', kind: 'file', path: 'src/a.ts' }),
      { id: 'b', kind: 'file', path: 'src/b.ts' },
    );
    const reopened = openPanelTab(tabs, { id: 'c', kind: 'file', path: 'src/a.ts' });
    expect(reopened.map((tab) => tab.id)).toEqual(['b', 'c']);
  });

  it('replaces a side chat for the same agent, appends for a new one', () => {
    const sessionLevel = openPanelTab([], { id: 'a', kind: 'btw', seq: 1 });
    // Upstream replaces a side chat whose `agentId` matches the one being
    // opened — and two session-level side chats both carry `undefined`, so the
    // second replaces the first.
    expect(openPanelTab(sessionLevel, { id: 'b', kind: 'btw', seq: 2 }).map((tab) => tab.id)).toEqual(['b']);
    const forAgent = openPanelTab(sessionLevel, { id: 'c', kind: 'btw', agentId: 'agent-1', seq: 2 });
    expect(forAgent.map((tab) => tab.id)).toEqual(['a', 'c']);
    expect(
      openPanelTab(forAgent, { id: 'd', kind: 'btw', agentId: 'agent-1', seq: 3 }).map((tab) => tab.id),
    ).toEqual(['a', 'd']);
  });

  it('numbers the next side chat', () => {
    expect(nextSideChatSeq([])).toBe(1);
    expect(nextSideChatSeq([{ id: 'a', kind: 'btw', seq: 1 }])).toBe(2);
    expect(nextSideChatSeq([{ id: 'a', kind: 'file', path: 'x' }])).toBe(1);
  });

  it('closes a tab and hands focus to the next one, then the previous', () => {
    const tabs = [
      { id: 'a', kind: 'diff' as const },
      { id: 'b', kind: 'file' as const, path: 'src/b.ts' },
      { id: 'c', kind: 'compaction' as const, turnId: 't1' },
    ];
    expect(closePanelTab(tabs, 'b')).toEqual({
      tabs: [tabs[0], tabs[2]],
      activeId: 'c',
    });
    expect(closePanelTab(tabs, 'c').activeId).toBe('b');
    expect(closePanelTab(tabs, 'a').activeId).toBe('b');
    expect(closePanelTab(tabs, 'nope').activeId).toBeNull();
  });

  it('appends terminals and never restores them', () => {
    const one = openPanelTab([], { id: 'a', kind: 'term', title: 'zsh' });
    const two = openPanelTab(one, { id: 'b', kind: 'term' });
    expect(two.map((tab) => tab.id)).toEqual(['a', 'b']);
    expect(restorablePanelTabs(two)).toEqual([]);
    expect(PANEL_TAB_RULES.term).toMatchObject({ policy: 'always', restorable: false, icon: 'terminal' });
  });

  it('restores only the restorable kinds and keeps their payloads', () => {
    const tabs = [
      { id: 'a', kind: 'diff' as const },
      { id: 'b', kind: 'file' as const, path: 'src/b.ts' },
      { id: 'c', kind: 'agent' as const, subagentId: 'agent-2' },
      { id: 'd', kind: 'btw' as const, seq: 2 },
    ];
    expect(restorablePanelTabs(tabs).map((tab) => tab.id)).toEqual(['c', 'd']);
    const stored = serializeRestorableTabs(tabs);
    expect(stored).toEqual([
      { kind: 'agent', subagentId: 'agent-2' },
      { kind: 'btw', agentId: undefined, seq: 2 },
    ]);
    let n = 0;
    const rebuilt = deserializeRestorableTabs(stored, () => `r${n++}`);
    expect(rebuilt).toEqual([
      { id: 'r0', kind: 'agent', subagentId: 'agent-2' },
      { id: 'r1', kind: 'btw', agentId: undefined, seq: 2 },
    ]);
  });

  it('drops a stored tab that lost what it needs instead of failing', () => {
    const rebuilt = deserializeRestorableTabs(
      [{ kind: 'agent' }, { kind: 'compaction', turnId: 't9' }, { kind: 'diff' }],
      () => 'x',
    );
    expect(rebuilt).toEqual([{ id: 'x', kind: 'compaction', turnId: 't9' }]);
  });

  it('titles an agent tab with the agent it shows', () => {
    const task = (over: Partial<AppTask>): AppTask => ({
      id: 'agent-1',
      sessionId: 's1',
      kind: 'subagent',
      description: 'Explore the repo layout',
      status: 'running',
      createdAt: '2026-01-01T00:00:00.000Z',
      ...over,
    });
    expect(agentTabTitle([task({})], 'agent-1')).toBe('Explore the repo layout');
    // The tab key can be the wire agent id or the spawning tool call's id.
    expect(agentTabTitle([task({ id: 't9', agentId: 'agent-1' })], 'agent-1')).toBe('Explore the repo layout');
    expect(agentTabTitle([task({ id: 't9', parentToolCallId: 'tc1' })], 'tc1')).toBe('Explore the repo layout');
    // A bash task's tab carries its description too.
    expect(agentTabTitle([task({ id: 'b1', kind: 'bash', description: 'Run the test suite' })], 'b1')).toBe(
      'Run the test suite',
    );
    // No row (or no description) leaves the pane on its i18n label.
    expect(agentTabTitle([], 'agent-1')).toBeUndefined();
    expect(agentTabTitle([task({ description: '' })], 'agent-1')).toBeUndefined();
  });

  it('moves a tab to another position in the strip', () => {
    const tabs = [
      { id: 'a', kind: 'diff' as const },
      { id: 'b', kind: 'file' as const, path: 'src/b.ts' },
      { id: 'c', kind: 'compaction' as const, turnId: 't1' },
    ];
    expect(reorderPanelTabs(tabs, 'a', 2).map((tab) => tab.id)).toEqual(['b', 'c', 'a']);
    expect(reorderPanelTabs(tabs, 'c', 0).map((tab) => tab.id)).toEqual(['c', 'a', 'b']);
    expect(reorderPanelTabs(tabs, 'b', 1).map((tab) => tab.id)).toEqual(['a', 'b', 'c']);
    expect(tabs.map((tab) => tab.id)).toEqual(['a', 'b', 'c']);
  });

  it('clamps a drag past either end and ignores an unknown tab', () => {
    const tabs = [
      { id: 'a', kind: 'diff' as const },
      { id: 'b', kind: 'file' as const, path: 'src/b.ts' },
    ];
    expect(reorderPanelTabs(tabs, 'a', 9).map((tab) => tab.id)).toEqual(['b', 'a']);
    expect(reorderPanelTabs(tabs, 'b', -4).map((tab) => tab.id)).toEqual(['b', 'a']);
    expect(reorderPanelTabs(tabs, 'nope', 0).map((tab) => tab.id)).toEqual(['a', 'b']);
  });

  it('closes the other tabs, the tabs to the right, and all of them', () => {
    const tabs = [
      { id: 'a', kind: 'diff' as const },
      { id: 'b', kind: 'file' as const, path: 'src/b.ts' },
      { id: 'c', kind: 'compaction' as const, turnId: 't1' },
    ];
    expect(closeOtherPanelTabs(tabs, 'b')).toEqual({ tabs: [tabs[1]], activeId: 'b' });
    expect(closePanelTabsToRight(tabs, 'b')).toEqual({ tabs: [tabs[0], tabs[1]], activeId: 'b' });
    expect(closePanelTabsToRight(tabs, 'c')).toEqual({ tabs, activeId: 'c' });
    expect(closeOtherPanelTabs(tabs, 'nope')).toBeNull();
    expect(closePanelTabsToRight(tabs, 'nope')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The panel's state layer: only the restorable kinds survive a reload, and a
// terminal belongs to the session that opened it (upstream drops terminal tabs
// when the session changes).
// ---------------------------------------------------------------------------
describe('useRightPanel state', () => {
  let storage: Storage;
  // The panel is a module-level singleton (the dock pills, the agent cards and
  // the transcript all open tabs on it), so each case starts from empty.
  function clearPanel(): void {
    const panel = useRightPanel();
    panel.bindSession(null);
    for (const tab of [...panel.tabs.value]) panel.closeTab(tab.id);
  }
  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    clearPanel();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the restorable tabs and drops the rest across a session rebind', () => {
    clearPanel();
    const panel = useRightPanel();
    panel.bindSession('session-a');
    panel.openAgent('agent-1');
    panel.openFile('src/a.ts');
    panel.openTerminal('zsh');
    expect(panel.tabs.value.map((tab) => tab.kind)).toEqual(['agent', 'file', 'term']);

    // Same session: nothing is dropped.
    panel.bindSession('session-a');
    expect(panel.tabs.value.map((tab) => tab.kind)).toEqual(['agent', 'file', 'term']);

    // A new session: everything of the old one goes (upstream clears the list
    // rather than carrying tabs across), and a session with nothing stored
    // leaves the panel empty.
    panel.bindSession('session-b');
    expect(panel.tabs.value).toEqual([]);
    expect(panel.visible.value).toBe(false);

    // Coming back, the restorable tab is rebuilt and the rest are not. The
    // panel itself stays closed: upstream closes it on every session change and
    // persists nothing, so a session whose panel the user closed comes back
    // closed — the stored tab is revealed again only when the panel is opened.
    panel.bindSession('session-a');
    expect(panel.tabs.value.map((tab) => tab.kind)).toEqual(['agent']);
    expect(panel.tabs.value[0]).toMatchObject({ kind: 'agent', subagentId: 'agent-1' });
    expect(panel.visible.value).toBe(false);
  });

  it('persists only what it can rebuild', () => {
    clearPanel();
    const panel = useRightPanel();
    panel.bindSession('session-c');
    panel.openDiff();
    panel.openCompaction('turn-7');
    const raw = storage.getItem(STORAGE_KEYS.rightPanelTabs);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toEqual({ 'session-c': [{ kind: 'compaction', turnId: 'turn-7' }] });
  });

  it('hides itself when the last tab closes', () => {
    clearPanel();
    const panel = useRightPanel();
    panel.bindSession('session-d');
    panel.openSideChat();
    const id = panel.activeTabId.value!;
    panel.closeTab(id);
    expect(panel.tabs.value).toEqual([]);
    expect(panel.visible.value).toBe(false);
    expect(panel.activeTabId.value).toBeNull();
  });
});
