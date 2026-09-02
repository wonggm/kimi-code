import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  coerceRightPanelTab,
  DEFAULT_RIGHT_PANEL_TAB,
  isRightPanelTab,
  latestTurnDiffEntries,
  normalizePanelPreviewPath,
  popPanelDrill,
  pushPanelDrill,
  resolvePanelSubagentTaskId,
  RIGHT_PANEL_TABS,
  samePanelDrill,
  turnFilesForTurn,
  type PanelDrillView,
} from '../src/lib/rightPanelTabs';
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

describe('rightPanelTabs helpers', () => {
  it('exposes a stable tab order', () => {
    expect(RIGHT_PANEL_TABS).toEqual([
      'changes',
      'sideChat',
      'turnDiff',
      'terminal',
      'bash',
      'subagents',
      'todos',
    ]);
  });

  it('coerces unknown / nullish values to the default tab', () => {
    expect(coerceRightPanelTab(null)).toBe(DEFAULT_RIGHT_PANEL_TAB);
    expect(coerceRightPanelTab(undefined)).toBe(DEFAULT_RIGHT_PANEL_TAB);
    expect(coerceRightPanelTab('')).toBe(DEFAULT_RIGHT_PANEL_TAB);
    expect(coerceRightPanelTab('bogus')).toBe(DEFAULT_RIGHT_PANEL_TAB);
    expect(coerceRightPanelTab('turnDiff')).toBe('turnDiff');
  });

  it('narrows valid strings via isRightPanelTab', () => {
    expect(isRightPanelTab('changes')).toBe(true);
    expect(isRightPanelTab('todos')).toBe(true);
    expect(isRightPanelTab('nope')).toBe(false);
    expect(isRightPanelTab(null)).toBe(false);
    expect(isRightPanelTab(undefined)).toBe(false);
  });
});

describe('rightPanelTabs persistence', () => {
  let original: Storage;
  beforeEach(() => {
    original = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage(), configurable: true });
  });
  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { value: original, configurable: true });
  });

  it('round-trips a saved tab through safeGetString + coerceRightPanelTab', () => {
    safeSetString(STORAGE_KEYS.rightPanelActiveTab, 'turnDiff');
    const stored = safeGetString(STORAGE_KEYS.rightPanelActiveTab);
    expect(coerceRightPanelTab(stored)).toBe('turnDiff');
  });

  it('falls back to default when storage returns an unknown tab', () => {
    safeSetString(STORAGE_KEYS.rightPanelActiveTab, 'mystery');
    const stored = safeGetString(STORAGE_KEYS.rightPanelActiveTab);
    expect(coerceRightPanelTab(stored)).toBe(DEFAULT_RIGHT_PANEL_TAB);
  });
});

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

// ---------------------------------------------------------------------------
// In-panel drill stack (RightPanelTabs list → detail navigation)
// ---------------------------------------------------------------------------

function agentView(taskId: string): PanelDrillView {
  return { kind: 'agent', taskId };
}

function fileView(path: string, line?: number): PanelDrillView {
  return { kind: 'file', path, line };
}

describe('panel drill stack transitions', () => {
  it('pushes new views and pops one level at a time', () => {
    let stack: PanelDrillView[] = [];
    stack = pushPanelDrill(stack, agentView('a1'));
    stack = pushPanelDrill(stack, fileView('src/x.ts'));
    expect(stack).toEqual([agentView('a1'), fileView('src/x.ts')]);
    stack = popPanelDrill(stack);
    expect(stack).toEqual([agentView('a1')]);
    stack = popPanelDrill(stack);
    expect(stack).toEqual([]);
    expect(popPanelDrill(stack)).toEqual([]);
  });

  it('ignores re-pushing the view already on top', () => {
    const base = pushPanelDrill([], agentView('a1'));
    expect(samePanelDrill(base[0]!, agentView('a1'))).toBe(true);
    expect(pushPanelDrill(base, agentView('a1'))).toEqual(base);
    // Same agent re-opened below the top still stacks; so does a different
    // line of the same file.
    const withFile = pushPanelDrill(base, fileView('src/x.ts', 3));
    expect(pushPanelDrill(withFile, fileView('src/x.ts', 7))).toHaveLength(3);
    expect(pushPanelDrill(withFile, fileView('src/x.ts', 3))).toEqual(withFile);
  });
});

function appTask(overrides: Partial<AppTask> & { id: string }): AppTask {
  return {
    sessionId: 's1',
    kind: 'subagent',
    description: 'task',
    status: 'running',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('resolvePanelSubagentTaskId', () => {
  const tasks: AppTask[] = [
    appTask({ id: 'task-1', parentToolCallId: 'call-1' }),
    appTask({ id: 'task-2', agentId: 'agent-0' }),
    appTask({ id: 'task-3', kind: 'bash', parentToolCallId: undefined }),
  ];

  it('resolves by task id, wire agent id, then parent tool-call id', () => {
    expect(resolvePanelSubagentTaskId(tasks, 'task-1')).toBe('task-1');
    expect(resolvePanelSubagentTaskId(tasks, 'agent-0')).toBe('task-2');
    expect(resolvePanelSubagentTaskId(tasks, 'call-1')).toBe('task-1');
  });

  it('falls back to the single unmapped subagent row', () => {
    const withUnmapped = [...tasks, appTask({ id: 'orphan', parentToolCallId: undefined })];
    expect(resolvePanelSubagentTaskId(withUnmapped, 'unknown')).toBeUndefined();
    expect(
      resolvePanelSubagentTaskId(
        [appTask({ id: 'only', parentToolCallId: undefined })],
        'unknown',
      ),
    ).toBe('only');
  });

  it('returns undefined when nothing matches', () => {
    expect(resolvePanelSubagentTaskId([], 'anything')).toBeUndefined();
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
