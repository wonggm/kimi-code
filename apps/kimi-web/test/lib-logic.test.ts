import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bucketPastedData } from '../src/composables/useAttachmentUpload';
import { mentionToText, tokenizeMentions } from '../src/lib/mentionTokens';
import {
  collectFilePathAliases,
  findFilePathLinks,
  parseFilePathLinkCandidate,
} from '../src/lib/filePathLinks';
import { parseDiff } from '../src/lib/parseDiff';
import { extractFrontmatter } from '../src/lib/frontmatter';
import { buildDiffLines } from '../src/lib/diffLines';
import { buildEditDiffLines } from '../src/lib/toolDiff';
import { createCoalescedAsyncRunner } from '../src/lib/snapshotSync';
import { mergeSnapshotMessages } from '../src/lib/snapshotMessages';
import {
  applyRecoveredPromptMessages,
  recoveredPromptMessages,
} from '../src/lib/transcriptPrompts';
import {
  applyTranscriptTimings,
  pageTurnTimings,
} from '../src/lib/transcriptTiming';
import { keepLiveSubagents, mergeSnapshotSubagents } from '../src/lib/taskMerge';
import { normalizeToolName, toolSummary } from '../src/lib/toolMeta';
import { collapsePrompt, humanizeCron } from '../src/lib/cronHumanize';
import {
  currentValidatedWorkspacePath,
  isWorkspacePathInput,
  joinWorkspacePathCandidate,
  parseWorkspacePathInput,
} from '../src/lib/workspacePathInput';
import {
  commitLevel,
  defaultThinkingLevelFor,
  effortLabel,
  modelThinkingAvailability,
  segmentsFor,
} from '../src/lib/modelThinking';
import type { AppMessage, AppModel, AppTask, TranscriptItem, TranscriptPage, TranscriptPrompt } from '../src/api/types';
import { resolveToolRenderer } from '../src/components/chat/tool-calls/toolRegistry';
import AgentTool from '../src/components/chat/tool-calls/AgentTool.vue';
import EditTool from '../src/components/chat/tool-calls/EditTool.vue';
import GenericTool from '../src/components/chat/tool-calls/GenericTool.vue';
import type { ToolCall } from '../src/types';
import {
  clearTrace,
  installClientErrorCapture,
  sanitizeForTrace,
  sessionExportTraceToJsonl,
  traceEntries,
  traceKeyEvent,
  tracePaused,
  traceRestRequest,
  traceToJsonl,
  traceWsIn,
} from '../src/debug/trace';
import { composePageTitle } from '../src/composables/usePageTitle';
import {
  loadExchangeStarts,
  reconcileExchangeStart,
  saveExchangeStart,
} from '../src/lib/exchangeTiming';
import { STORAGE_KEYS } from '../src/lib/storage';

// The trace tests exercise its exported recording/serialization contract:
// session exports receive only bounded, explicitly selected metadata.

describe('bounded Web trace', () => {
  beforeEach(() => {
    tracePaused.value = false;
    clearTrace();
  });

  afterEach(() => {
    clearTrace();
    vi.unstubAllGlobals();
  });

  it('copies only allowlisted key-path metadata into the independent export ring', () => {
    const secret = 'PROMPT_TEXT_MUST_NOT_BE_EXPORTED';
    const metadata = {
      sessionId: 'sess_1',
      contentCount: 2,
      mediaCount: 1,
      text: secret,
      apiKey: secret,
    };
    traceKeyEvent('prompt:start', metadata);

    metadata.sessionId = 'changed_after_recording';

    expect(traceEntries()).toHaveLength(1);
    expect(JSON.parse(sessionExportTraceToJsonl())).toEqual({
      ts: expect.any(Number),
      event: 'prompt:start',
      sessionId: 'sess_1',
      contentCount: 2,
      mediaCount: 1,
    });
    expect(sessionExportTraceToJsonl()).not.toContain(secret);
  });

  it('records export metadata even while the full debug panel is paused', () => {
    tracePaused.value = true;

    traceKeyEvent('ws:connection', { status: 'connected' });

    expect(traceEntries()).toHaveLength(0);
    expect(JSON.parse(sessionExportTraceToJsonl())).toMatchObject({
      event: 'ws:connection',
      status: 'connected',
    });
  });

  it('caps object keys and reports how many were omitted', () => {
    const input = Object.fromEntries(Array.from({ length: 60 }, (_, index) => [`key${index}`, index]));

    const result = sanitizeForTrace(input) as Record<string, unknown>;

    expect(result['_truncatedKeys']).toBe(10);
    expect(Object.keys(result)).toHaveLength(51);
  });

  it('keeps at most 500 of the newest export entries', () => {
    for (let index = 0; index < 501; index++) {
      traceKeyEvent('ws:connection', { status: String(index) });
    }

    const exported = sessionExportTraceToJsonl().split('\n').map((line) => JSON.parse(line));
    expect(exported).toHaveLength(500);
    expect(exported[0]).toMatchObject({ status: '1' });
    expect(exported.at(-1)).toMatchObject({ status: '500' });
  });

  it('keeps export JSONL within the 256 KiB UTF-8 budget including newlines', () => {
    for (let index = 0; index < 500; index++) {
      traceKeyEvent('export:failed', {
        sessionId: `sess-${index}-${'😀'.repeat(200)}`,
        status: '😀'.repeat(200),
        promptId: '😀'.repeat(200),
        errorName: '😀'.repeat(200),
        requestId: '😀'.repeat(200),
        phase: '😀'.repeat(200),
      });
    }

    const jsonl = sessionExportTraceToJsonl();
    expect(new TextEncoder().encode(jsonl).byteLength).toBeLessThanOrEqual(256 * 1024);
    expect(JSON.parse(jsonl.split('\n').at(-1)!)).toMatchObject({
      sessionId: expect.stringMatching(/^sess-499-/),
    });
  });

  it('never copies prompt, WebSocket, or console content from the full debug trace', () => {
    vi.stubGlobal('location', { search: '?debug=1' });
    const promptSecret = 'PROMPT_SECRET_9fdb1a';
    const wsSecret = 'WS_PAYLOAD_SECRET_b84c7e';
    const consoleSecret = 'CONSOLE_SECRET_a2d693';

    traceRestRequest({
      method: 'POST',
      path: '/sessions/sess_1/prompts',
      url: 'http://daemon.test/api/v1/sessions/sess_1/prompts',
      requestId: 'req_1',
      body: { prompt: promptSecret },
    });
    traceWsIn({
      type: 'event',
      session_id: 'sess_1',
      seq: 4,
      payload: { text: wsSecret },
    });

    const originalLog = console.log;
    console.log = vi.fn();
    const dispose = installClientErrorCapture();
    try {
      console.log(consoleSecret, { value: consoleSecret });
    } finally {
      dispose();
      console.log = originalLog;
    }

    traceKeyEvent('prompt:start', {
      sessionId: 'sess_1',
      contentCount: 1,
      mediaCount: 0,
      text: promptSecret,
    });

    const fullDebugTrace = traceToJsonl();
    expect(fullDebugTrace).toContain(promptSecret);
    expect(fullDebugTrace).toContain(wsSecret);
    expect(fullDebugTrace).toContain(consoleSecret);

    const sessionExportTrace = sessionExportTraceToJsonl();
    expect(sessionExportTrace).not.toContain(promptSecret);
    expect(sessionExportTrace).not.toContain(wsSecret);
    expect(sessionExportTrace).not.toContain(consoleSecret);
    expect(JSON.parse(sessionExportTrace)).toEqual({
      ts: expect.any(Number),
      event: 'prompt:start',
      sessionId: 'sess_1',
      contentCount: 1,
      mediaCount: 0,
    });
  });
});

describe('workspace path input', () => {
  it('recognizes the supported absolute path forms', () => {
    expect(isWorkspacePathInput('/tmp/project')).toBe(true);
    expect(isWorkspacePathInput('~/project')).toBe(true);
    expect(isWorkspacePathInput('C:\\project')).toBe(true);
    expect(isWorkspacePathInput('C:/project')).toBe(true);
    expect(isWorkspacePathInput('\\\\server\\share')).toBe(true);
    expect(isWorkspacePathInput('project')).toBe(false);
  });

  it('normalizes separators without changing UNC roots or POSIX backslashes', () => {
    expect(parseWorkspacePathInput('/tmp//project/', '').target).toBe('/tmp/project');
    expect(parseWorkspacePathInput('//server//share/project/', '').target).toBe('//server/share/project');
    expect(parseWorkspacePathInput('///tmp//project/', '').target).toBe('/tmp/project');
    expect(parseWorkspacePathInput('/tmp/project\\', '').target).toBe('/tmp/project\\');
    expect(parseWorkspacePathInput('~/project', '/home/alice').target).toBe('/home/alice/project');
  });

  it('preserves Windows root separators in parent paths', () => {
    expect(parseWorkspacePathInput('C:\\Use', '')).toMatchObject({
      parent: 'C:\\',
      base: 'Use',
      separator: '\\',
    });
    expect(parseWorkspacePathInput('C:/Use', '')).toMatchObject({
      parent: 'C:/',
      base: 'Use',
      separator: '/',
    });
    expect(parseWorkspacePathInput('\\\\server\\share\\pro', '')).toMatchObject({
      parent: '\\\\server\\share',
      base: 'pro',
      separator: '\\',
    });
    expect(parseWorkspacePathInput('//server/share/pro', '')).toMatchObject({
      parent: '//server/share',
      base: 'pro',
      separator: '/',
    });
  });

  it('treats backslashes as literal characters in POSIX paths', () => {
    expect(parseWorkspacePathInput('/tmp/foo\\bar', '')).toMatchObject({
      parent: '/tmp',
      base: 'foo\\bar',
      separator: '/',
    });
  });

  it('builds completion paths from the lexical parent', () => {
    const parsed = parseWorkspacePathInput('/tmp/link/proje', '');
    expect(joinWorkspacePathCandidate(parsed.parent, 'project', parsed.separator)).toBe('/tmp/link/project');
  });

  it('only returns a validated path while it still matches the current input', () => {
    expect(currentValidatedWorkspacePath('/var', '', '/tmp')).toBeNull();
    expect(currentValidatedWorkspacePath('/tmp/', '', '/tmp')).toBe('/tmp');
  });
});

describe('parseDiff', () => {
  it('parses multiple files and keeps hunk line numbers', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 1111111..2222222 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,2 +1,3 @@',
      ' const a = 1;',
      '-const b = 2;',
      '+const b = 3;',
      '+const c = 4;',
      'diff --git a/src/comment.sql b/src/comment.sql',
      '@@ -5,1 +5,1 @@',
      '--- old comment',
      '+++ new comment',
    ].join('\n');

    expect(parseDiff(diff)).toEqual([
      { type: 'hunk', text: '@@ -1,2 +1,3 @@' },
      { type: 'context', text: 'const a = 1;', oldNo: 1, newNo: 1 },
      { type: 'del', text: 'const b = 2;', oldNo: 2 },
      { type: 'add', text: 'const b = 3;', newNo: 2 },
      { type: 'add', text: 'const c = 4;', newNo: 3 },
      { type: 'hunk', text: '@@ -5,1 +5,1 @@' },
      { type: 'del', text: '-- old comment', oldNo: 5 },
      { type: 'add', text: '++ new comment', newNo: 5 },
    ]);
  });
});

describe('buildDiffLines', () => {
  it('lines up context, deletions and additions with old/new line numbers', () => {
    const before = 'a\nb\nc';
    const after = 'a\nB\nc\nd';
    expect(buildDiffLines(before, after)).toEqual([
      { type: 'context', text: 'a', oldNo: 1, newNo: 1 },
      { type: 'del', text: 'b', oldNo: 2 },
      { type: 'add', text: 'B', newNo: 2 },
      { type: 'context', text: 'c', oldNo: 3, newNo: 3 },
      { type: 'add', text: 'd', newNo: 4 },
    ]);
  });

  it('treats an empty before as an all-addition write', () => {
    expect(buildDiffLines('', 'x\ny')).toEqual([
      { type: 'add', text: 'x', newNo: 1 },
      { type: 'add', text: 'y', newNo: 2 },
    ]);
  });

  it('returns all context for identical texts and empty for two empties', () => {
    expect(buildDiffLines('a\nb', 'a\nb')).toEqual([
      { type: 'context', text: 'a', oldNo: 1, newNo: 1 },
      { type: 'context', text: 'b', oldNo: 2, newNo: 2 },
    ]);
    expect(buildDiffLines('', '')).toEqual([]);
  });

  it('returns null when the LCS matrix would be too large', () => {
    const big = Array.from({ length: 2000 }, (_, i) => `line${i}`).join('\n');
    expect(buildDiffLines(big, `${big}\nextra`)).toBeNull();
  });

  it('returns null when one side is huge even though the matrix is small', () => {
    const huge = Array.from({ length: 6000 }, (_, i) => `line${i}`).join('\n');
    expect(buildDiffLines('one line', huge)).toBeNull();
  });
});

describe('buildEditDiffLines', () => {
  it('builds a diff for a single Edit', () => {
    const arg = JSON.stringify({ path: 'a.ts', old_string: 'a\nb', new_string: 'a\nB' });
    expect(buildEditDiffLines({ name: 'Edit', arg })).toEqual([
      { type: 'context', text: 'a', oldNo: 1, newNo: 1 },
      { type: 'del', text: 'b', oldNo: 2 },
      { type: 'add', text: 'B', newNo: 2 },
    ]);
  });

  it('falls back to output for replace_all edits', () => {
    const arg = JSON.stringify({ path: 'a.ts', old_string: 'a', new_string: 'b', replace_all: true });
    expect(buildEditDiffLines({ name: 'Edit', arg })).toBeNull();
  });

  it('falls back to output for every Write (new file or overwrite)', () => {
    expect(buildEditDiffLines({ name: 'Write', arg: JSON.stringify({ path: 'a.ts', content: 'x' }) })).toBeNull();
    expect(
      buildEditDiffLines({ name: 'Write', arg: JSON.stringify({ path: 'a.ts', content: 'x', mode: 'append' }) }),
    ).toBeNull();
  });

  it('returns null for non-edit/write tools', () => {
    expect(buildEditDiffLines({ name: 'Bash', arg: JSON.stringify({ command: 'ls' }) })).toBeNull();
  });
});

describe('filePathLinks', () => {
  it('rejects URLs and bare unknown filenames', () => {
    expect(parseFilePathLinkCandidate('https://example.com/a.ts')).toBeNull();
    expect(parseFilePathLinkCandidate('e2e-success.png')).toBeNull();
  });

  it('finds path links with line numbers and resolves aliases', () => {
    const aliases = collectFilePathAliases('<img src="/assets/demo.png">');
    expect(aliases.get('demo.png')).toBe('/assets/demo.png');

    expect(
      findFilePathLinks('Open src/a.ts#L12 and demo.png.', { aliases }),
    ).toMatchObject([
      { path: 'src/a.ts', line: 12, text: 'src/a.ts#L12' },
      { path: '/assets/demo.png', text: 'demo.png' },
    ]);
  });
});

describe('toolMeta', () => {
  it('normalizes common tool aliases', () => {
    expect(normalizeToolName('WebFetch')).toBe('web_fetch');
    expect(normalizeToolName('MultiEdit')).toBe('multi_edit');
    expect(normalizeToolName('TodoWrite')).toBe('todo');
    expect(normalizeToolName('rg')).toBe('grep');
  });

  it('summarizes tool arguments for card headers', () => {
    expect(
      toolSummary('Read', JSON.stringify({ path: 'src/a.ts', offset: 10, limit: 5 })),
    ).toBe('src/a.ts:10-15');
    expect(toolSummary('Read', '{}')).toBe('');
    expect(toolSummary('Bash', JSON.stringify({ command: 'pnpm test' }))).toBe('pnpm test');
    expect(
      toolSummary('WebFetch', JSON.stringify({ url: 'https://example.com/path/to' })),
    ).toBe('example.com/path');
  });
});

describe('resolveToolRenderer', () => {
  // Minimal ToolCall factory — resolveToolRenderer only reads `name`, `status`
  // and `media`, so the rest is filled with placeholders.
  const tool = (name: string, status: ToolCall['status'] = 'running'): ToolCall => ({
    id: 't1',
    name,
    arg: '',
    status,
  });

  // Regression: normalizeToolName() folds `agent`/`subagent` into the canonical
  // `task` kind, so the renderer must match on `task`. If it matched on the raw
  // `agent` string these calls would fall through to GenericTool and lose the
  // inline "Open" button for the subagent detail panel.
  it('routes Agent / subagent calls to the Agent renderer', () => {
    expect(resolveToolRenderer(tool('agent'))).toBe(AgentTool);
    expect(resolveToolRenderer(tool('Agent'))).toBe(AgentTool);
    expect(resolveToolRenderer(tool('subagent'))).toBe(AgentTool);
    expect(resolveToolRenderer(tool('task'))).toBe(AgentTool);
  });

  it('routes edit-like calls to the Edit renderer', () => {
    expect(resolveToolRenderer(tool('edit'))).toBe(EditTool);
    expect(resolveToolRenderer(tool('write'))).toBe(EditTool);
    expect(resolveToolRenderer(tool('multi_edit'))).toBe(EditTool);
  });

  it('falls back to the Generic renderer for unknown tools', () => {
    expect(resolveToolRenderer(tool('bash'))).toBe(GenericTool);
    expect(resolveToolRenderer(tool('read'))).toBe(GenericTool);
  });
});

describe('createCoalescedAsyncRunner', () => {
  it('reuses the in-flight promise for the same key', async () => {
    let runs = 0;
    let resolveRun!: () => void;
    const runner = createCoalescedAsyncRunner(async (_key: string) => {
      runs += 1;
      await new Promise<void>((resolve) => {
        resolveRun = resolve;
      });
      return runs;
    });

    const first = runner.run('session-a');
    const second = runner.run('session-a');

    expect(runs).toBe(1);
    resolveRun();
    await expect(Promise.all([first, second])).resolves.toEqual([1, 1]);
    expect(runs).toBe(1);
  });

  it('queues at most one rerun requested while a run is in flight', async () => {
    let runs = 0;
    const resolvers: Array<() => void> = [];
    const runner = createCoalescedAsyncRunner(async (_key: string) => {
      runs += 1;
      await new Promise<void>((resolve) => {
        resolvers.push(resolve);
      });
      return runs;
    });

    const first = runner.run('session-a');
    runner.request('session-a');
    runner.request('session-a');
    expect(runs).toBe(1);

    resolvers[0]!();
    await first;
    await Promise.resolve();

    expect(runs).toBe(2);
    resolvers[1]!();
    await Promise.resolve();
    expect(runs).toBe(2);
  });
});

describe('modelThinking', () => {
  const effortModel = (over: Partial<AppModel> = {}): AppModel => ({
    id: 'k',
    provider: 'p',
    model: 'k',
    maxContextSize: 1,
    capabilities: ['thinking'],
    supportEfforts: ['low', 'high', 'max'],
    defaultEffort: 'high',
    ...over,
  });
  const booleanModel = (capabilities: string[] = ['thinking']): AppModel => ({
    id: 'b',
    provider: 'p',
    model: 'b',
    maxContextSize: 1,
    capabilities,
  });
  const unsupportedModel = (): AppModel => ({
    id: 'u',
    provider: 'p',
    model: 'u',
    maxContextSize: 1,
    capabilities: [],
  });

  describe('modelThinkingAvailability', () => {
    it('toggle when model has thinking capability', () => {
      expect(modelThinkingAvailability(booleanModel())).toBe('toggle');
    });
    it('always-on when model has always_thinking', () => {
      expect(modelThinkingAvailability(booleanModel(['always_thinking']))).toBe('always-on');
    });
    it('unsupported when model lacks thinking capability', () => {
      expect(modelThinkingAvailability(unsupportedModel())).toBe('unsupported');
    });
    it('toggle when adaptiveThinking is set', () => {
      expect(modelThinkingAvailability({ ...unsupportedModel(), adaptiveThinking: true })).toBe('toggle');
    });
  });

  describe('defaultThinkingLevelFor', () => {
    it('effort model returns defaultEffort', () => {
      expect(defaultThinkingLevelFor(effortModel())).toBe('high');
    });
    it('effort model without defaultEffort returns middle effort', () => {
      expect(defaultThinkingLevelFor(effortModel({ defaultEffort: undefined }))).toBe('high');
    });
    it('boolean model returns on', () => {
      expect(defaultThinkingLevelFor(booleanModel())).toBe('on');
    });
    it('unsupported model returns off', () => {
      expect(defaultThinkingLevelFor(unsupportedModel())).toBe('off');
    });
  });

  describe('segmentsFor', () => {
    it('effort toggle → off + efforts (off left)', () => {
      expect(segmentsFor(effortModel())).toEqual(['off', 'low', 'high', 'max']);
    });
    it('effort always-on → efforts only (no off)', () => {
      expect(segmentsFor(effortModel({ capabilities: ['thinking', 'always_thinking'] }))).toEqual([
        'low',
        'high',
        'max',
      ]);
    });
    it('boolean toggle → on/off (on left)', () => {
      expect(segmentsFor(booleanModel())).toEqual(['on', 'off']);
    });
    it('boolean always-on → on', () => {
      expect(segmentsFor(booleanModel(['always_thinking']))).toEqual(['on']);
    });
    it('unsupported → off', () => {
      expect(segmentsFor(unsupportedModel())).toEqual(['off']);
    });
  });

  describe('commitLevel', () => {
    it('on normalizes to the model default', () => {
      expect(commitLevel(effortModel(), 'on')).toBe('high');
      expect(commitLevel(booleanModel(), 'on')).toBe('on');
    });
    it('off stays off', () => {
      expect(commitLevel(effortModel(), 'off')).toBe('off');
    });
    it('concrete effort passes through', () => {
      expect(commitLevel(effortModel(), 'max')).toBe('max');
    });
  });

  describe('effortLabel', () => {
    it('capitalizes the first letter', () => {
      expect(effortLabel('max')).toBe('Max');
      expect(effortLabel('off')).toBe('Off');
      expect(effortLabel('xhigh')).toBe('Xhigh');
    });
  });
});

describe('humanizeCron', () => {
  const dict: Record<string, string> = {
    'conversation.cron.everyMinute': 'Every minute',
    'conversation.cron.everyNMinutes': 'Every {n} minutes',
    'conversation.cron.everyHour': 'Every hour',
    'conversation.cron.everyNHours': 'Every {n} hours',
    'conversation.cron.dailyAt': 'Daily at {time}',
    'conversation.cron.weekdaysAt': 'Weekdays at {time}',
  };
  const t = (key: string, params?: Record<string, unknown>): string => {
    let s = dict[key] ?? key;
    if (params) for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
    return s;
  };

  it('labels the common cadences', () => {
    expect(humanizeCron('* * * * *', t)).toBe('Every minute');
    expect(humanizeCron('*/5 * * * *', t)).toBe('Every 5 minutes');
    expect(humanizeCron('*/1 * * * *', t)).toBe('Every minute');
    expect(humanizeCron('0 * * * *', t)).toBe('Every hour');
    expect(humanizeCron('0 */2 * * *', t)).toBe('Every 2 hours');
  });

  it('labels fixed daily and weekday times', () => {
    expect(humanizeCron('5 9 * * *', t)).toBe('Daily at 9:05');
    expect(humanizeCron('0 9 * * 1-5', t)).toBe('Weekdays at 9:00');
  });

  it('falls back to the raw expression for unrecognized shapes', () => {
    expect(humanizeCron('0 9 1 * *', t)).toBe('0 9 1 * *');
    expect(humanizeCron('bad', t)).toBe('bad');
  });
});

describe('collapsePrompt', () => {
  it('keeps a short single-line prompt intact with no expand toggle', () => {
    expect(collapsePrompt('Check the deploy status')).toEqual({
      text: 'Check the deploy status',
      hasMore: false,
    });
  });

  it('truncates a long one-line prompt with an ellipsis and reports hasMore', () => {
    const long = 'a'.repeat(150);
    const result = collapsePrompt(long, 120);
    expect(result.hasMore).toBe(true);
    expect(result.text.length).toBeLessThan(long.length);
    expect(result.text.endsWith('…')).toBe(true);
  });

  it('shows only the first line for a multi-line prompt', () => {
    expect(collapsePrompt('first line\nsecond line\nthird line')).toEqual({
      text: 'first line',
      hasMore: true,
    });
  });
});

describe('mergeSnapshotMessages', () => {
  it('keeps optimistic steer echoes that the snapshot can never dedupe', () => {
    const steerEcho: AppMessage = {
      id: 'optimistic-1',
      sessionId: 'sess_1',
      role: 'user',
      content: [{ type: 'text', text: 'steer!' }],
      createdAt: new Date().toISOString(),
      metadata: { 'kimiWeb.optimisticUserMessage': true },
    };
    const snap: AppMessage[] = [
      {
        id: 'server-1',
        sessionId: 'sess_1',
        role: 'assistant',
        content: [{ type: 'text', text: 'working' }],
        createdAt: new Date().toISOString(),
      },
    ];
    const merged = mergeSnapshotMessages([steerEcho], snap);
    expect(merged.some((m) => m.id === 'optimistic-1')).toBe(true);
  });

  function msg(id: string, createdAt: string): AppMessage {
    return { id, sessionId: 's1', role: 'assistant', content: [], createdAt };
  }

  it('keeps loaded messages older than the snapshot window', () => {
    const loaded = [
      msg('old-1', '2026-01-01T00:00:00.000Z'),
      msg('old-2', '2026-01-02T00:00:00.000Z'),
      msg('recent-live', '2026-01-03T00:00:00.000Z'),
    ];
    const snapshot = [
      msg('m0', '2026-01-03T00:00:00.000Z'),
      msg('m1', '2026-01-04T00:00:00.000Z'),
    ];
    expect(mergeSnapshotMessages(loaded, snapshot).map((m) => m.id)).toEqual([
      'old-1',
      'old-2',
      'm0',
      'm1',
    ]);
  });

  it('returns the snapshot when there is no older loaded prefix', () => {
    const loaded = [msg('recent-live', '2026-01-03T00:00:00.000Z')];
    const snapshot = [
      msg('m0', '2026-01-03T00:00:00.000Z'),
      msg('m1', '2026-01-04T00:00:00.000Z'),
    ];
    expect(mergeSnapshotMessages(loaded, snapshot)).toBe(snapshot);
  });

  it('returns the snapshot when either side is empty', () => {
    const snapshot = [msg('m0', '2026-01-03T00:00:00.000Z')];
    expect(mergeSnapshotMessages([], snapshot)).toBe(snapshot);
    expect(mergeSnapshotMessages(snapshot, [])).toEqual([]);
  });

  function optimisticUser(id: string, createdAt: string, text: string, promptId: string): AppMessage {
    return {
      id,
      sessionId: 's1',
      role: 'user',
      content: [{ type: 'text', text }],
      createdAt,
      promptId,
      metadata: { 'kimiWeb.optimisticUserMessage': true },
    };
  }

  function realUser(id: string, createdAt: string, text: string): AppMessage {
    return {
      id,
      sessionId: 's1',
      role: 'user',
      content: [{ type: 'text', text }],
      createdAt,
    };
  }

  it('drops an optimistic user message when its promptId is the snapshot message id', () => {
    const loaded = [optimisticUser('msg_opt_1', '2026-01-02T23:59:59.000Z', 'hello', 'msg_9')];
    const snapshot = [realUser('msg_9', '2026-01-03T00:00:00.000Z', 'hello')];
    expect(mergeSnapshotMessages(loaded, snapshot).map((m) => m.id)).toEqual(['msg_9']);
  });

  it('keeps an optimistic user message when a different snapshot message repeats its content', () => {
    const loaded = [optimisticUser('msg_opt_1', '2026-01-02T23:59:59.000Z', 'hello', 'msg_8')];
    const snapshot = [realUser('msg_9', '2026-01-03T00:00:00.000Z', 'hello')];
    expect(mergeSnapshotMessages(loaded, snapshot).map((m) => m.id)).toEqual(['msg_opt_1', 'msg_9']);
  });
});

describe('recoveredPromptMessages', () => {
  const NOW = '2026-01-01T00:10:00.000Z';

  function page(over: Partial<TranscriptPage> = {}): TranscriptPage {
    return { agentId: 'main', items: [], hasMore: false, prompts: [], ...over };
  }

  function queuedTurn(turnId: string, prompt: string, triggerPromptId?: string): TranscriptItem {
    return { kind: 'turn', turnId, ordinal: 0, state: 'queued', prompt, triggerPromptId, steps: [] };
  }

  function prompt(over: Partial<TranscriptPrompt> & { promptId: string }): TranscriptPrompt {
    return { status: 'completed', createdAt: NOW, ...over };
  }

  it('reads a prompt the daemon has accepted but not started', () => {
    const recovered = recoveredPromptMessages(
      page({
        items: [queuedTurn('t3', 'Queued behind the running turn.', 'pr_q1')],
        prompts: [prompt({ promptId: 'pr_q1', status: 'queued', content: [{ type: 'text', text: 'Queued behind the running turn.' }] })],
      }),
      NOW,
    );
    expect(recovered).toEqual([
      { key: 'pr_q1', text: 'Queued behind the running turn.', createdAt: NOW, placement: 'tail' },
    ]);
  });

  it('reads a prompt steered into the turn that was already running', () => {
    const recovered = recoveredPromptMessages(
      page({
        prompts: [
          prompt({ promptId: 'pr_s1', steeredAt: NOW, finishedAt: NOW, content: [{ type: 'text', text: 'steered' }] }),
        ],
      }),
      NOW,
    );
    expect(recovered).toEqual([
      { key: 'pr_s1', text: 'steered', createdAt: NOW, placement: 'chronological' },
    ]);
  });

  it('ignores a started turn, a running prompt and a prompt that ran its own turn', () => {
    const recovered = recoveredPromptMessages(
      page({
        items: [
          { kind: 'turn', turnId: 't1', ordinal: 0, state: 'completed', prompt: 'done', steps: [] },
          { kind: 'turn', turnId: 't2', ordinal: 1, state: 'running', prompt: 'running', steps: [] },
        ],
        prompts: [
          prompt({ promptId: 'pr_run', status: 'running', content: [{ type: 'text', text: 'running' }] }),
          // Steered, then ran to completion on its own — it has a turn already.
          prompt({ promptId: 'pr_own', steeredAt: NOW, finishedAt: '2026-01-01T00:20:00.000Z', content: [{ type: 'text', text: 'own turn' }] }),
        ],
      }),
      NOW,
    );
    expect(recovered).toEqual([]);
  });

  it('reports the queued prompt before the steered one, and skips empty text', () => {
    const recovered = recoveredPromptMessages(
      page({
        items: [
          queuedTurn('t9', '   '),
          queuedTurn('t8', 'second', 'pr_2'),
        ],
        prompts: [
          // An attachment-only steer has no text to show.
          prompt({ promptId: 'pr_1', steeredAt: NOW, finishedAt: NOW, content: [{ type: 'image' }] }),
          prompt({ promptId: 'pr_3', steeredAt: NOW, finishedAt: NOW, content: [{ type: 'text', text: 'steered' }] }),
        ],
      }),
      NOW,
    );
    // The queued prompt comes first, then the steered one — the order upstream
    // renders them in (the queued turn is part of the transcript, the steered
    // prompt is rebuilt after it).
    expect(recovered).toEqual([
      { key: 'pr_2', text: 'second', createdAt: NOW, placement: 'tail' },
      { key: 'pr_3', text: 'steered', createdAt: NOW, placement: 'chronological' },
    ]);
  });

  describe('applyRecoveredPromptMessages', () => {
    function userMessage(id: string, text: string, over: Partial<AppMessage> = {}): AppMessage {
      return {
        id,
        sessionId: 's1',
        role: 'user',
        content: [{ type: 'text', text }],
        createdAt: NOW,
        ...over,
      };
    }

    it('appends the rebuilt bubble and keeps it across a snapshot merge', () => {
      const rebuilt = recoveredPromptMessages(
        page({ items: [queuedTurn('t3', 'queued text', 'pr_q1')] }),
        NOW,
      );
      const applied = applyRecoveredPromptMessages([userMessage('m1', 'hello')], rebuilt, 's1');
      expect(applied.map((m) => m.id)).toEqual(['m1', 'msg_opt_prompt_pr_q1']);
      expect(applied[1]?.metadata?.['kimiWeb.optimisticUserMessage']).toBe(true);
      // A later snapshot merge keeps the rebuilt bubble (the snapshot cannot
      // carry a prompt that has no message yet).
      const merged = mergeSnapshotMessages(applied, [userMessage('m2', 'reply')]);
      expect(merged.some((m) => m.id === 'msg_opt_prompt_pr_q1')).toBe(true);
    });

    it('replaces a stale bubble when the prompt is no longer held', () => {
      const held = applyRecoveredPromptMessages(
        [],
        recoveredPromptMessages(page({ items: [queuedTurn('t3', 'queued text', 'pr_q1')] }), NOW),
        's1',
      );
      expect(applyRecoveredPromptMessages(held, [], 's1')).toEqual([]);
    });

    it('never doubles a prompt the snapshot already carries as a message', () => {
      const held = recoveredPromptMessages(page({ items: [queuedTurn('t3', 'queued text', 'pr_q1')] }), NOW);
      const messages = [userMessage('um_1', 'queued text', { promptId: 'pr_q1' })];
      expect(applyRecoveredPromptMessages(messages, held, 's1').map((m) => m.id)).toEqual(['um_1']);
    });

    it('puts a steered prompt back where it was sent, not under every later turn', () => {
      const steered = recoveredPromptMessages(
        page({
          prompts: [
            prompt({ promptId: 'pr_s1', steeredAt: NOW, finishedAt: NOW, content: [{ type: 'text', text: 'steered' }] }),
          ],
        }),
        NOW,
      );
      const earlier = userMessage('m1', 'hello', { createdAt: '2026-01-01T00:09:00.000Z' });
      const later = userMessage('m2', 'reply', { createdAt: '2026-01-01T00:11:00.000Z' });
      expect(
        applyRecoveredPromptMessages([earlier, later], steered, 's1').map((m) => m.id),
      ).toEqual(['m1', 'msg_opt_prompt_pr_s1', 'm2']);
    });

    it('leaves a steer sent after everything else at the end', () => {
      const steered = recoveredPromptMessages(
        page({
          prompts: [
            prompt({ promptId: 'pr_s1', steeredAt: NOW, finishedAt: NOW, content: [{ type: 'text', text: 'steered' }] }),
          ],
        }),
        NOW,
      );
      const earlier = userMessage('m1', 'hello', { createdAt: '2026-01-01T00:09:00.000Z' });
      expect(applyRecoveredPromptMessages([earlier], steered, 's1').map((m) => m.id)).toEqual([
        'm1',
        'msg_opt_prompt_pr_s1',
      ]);
    });

    it('keeps a queued prompt at the tail even when it was typed mid-turn', () => {
      const held = recoveredPromptMessages(
        page({ items: [queuedTurn('t3', 'queued text', 'pr_q1')] }),
        NOW,
      );
      const earlier = userMessage('m1', 'hello', { createdAt: '2026-01-01T00:09:00.000Z' });
      const later = userMessage('m2', 'reply', { createdAt: '2026-01-01T00:11:00.000Z' });
      expect(
        applyRecoveredPromptMessages([earlier, later], held, 's1').map((m) => m.id),
      ).toEqual(['m1', 'm2', 'msg_opt_prompt_pr_q1']);
    });
  });
});

describe('transcriptTiming', () => {
  const NOW = Date.parse('2026-01-01T00:10:00.000Z');
  const iso = (ms: number) => new Date(NOW + ms).toISOString();

  function page(items: TranscriptItem[]): TranscriptPage {
    return { agentId: 'main', items, hasMore: false, prompts: [] };
  }

  function turn(
    triggerPromptId: string | undefined,
    over: Partial<Extract<TranscriptItem, { kind: 'turn' }>> = {},
  ): TranscriptItem {
    return {
      kind: 'turn',
      turnId: 't2',
      ordinal: 1,
      state: 'completed',
      steps: [],
      triggerPromptId,
      ...over,
    };
  }

  function step(startedAt?: string, endedAt?: string) {
    return { kind: 'step' as const, stepId: 's1', frames: [], startedAt, endedAt };
  }

  function message(over: Partial<AppMessage> & { id: string; role: AppMessage['role'] }): AppMessage {
    return { sessionId: 's1', content: [], createdAt: iso(0), ...over };
  }

  describe('pageTurnTimings', () => {
    it('reads the turn duration and the span of each of its steps', () => {
      const timings = pageTurnTimings(
        page([turn('pr_1', { durationMs: 80_000, steps: [step(iso(0), iso(3000))] })]),
      );
      expect(timings.get('pr_1')).toEqual({ durationMs: 80_000, stepDurationsMs: [3000] });
    });

    it('leaves out a turn the page carries no timing for', () => {
      // The mock's default page: both ends of every span are the same instant,
      // so the span is zero — a label printed from it would be invented.
      const timings = pageTurnTimings(
        page([
          turn('pr_1', { steps: [step(iso(0), iso(0))] }),
          turn('pr_2', { durationMs: 0, steps: [] }),
        ]),
      );
      expect(timings.size).toBe(0);
    });

    it('keeps the steps it can time and leaves the others out', () => {
      const timings = pageTurnTimings(
        page([turn('pr_1', { steps: [step(iso(0), iso(3000)), step(iso(4000)), step(undefined, iso(9000))] })]),
      );
      expect(timings.get('pr_1')?.stepDurationsMs).toEqual([3000, undefined, undefined]);
    });

    it('ignores turns the page carries no opening prompt for, and non-turns', () => {
      const timings = pageTurnTimings(
        page([
          turn(undefined, { durationMs: 5000 }),
          { kind: 'marker', markerId: 'm1', marker: 'skill' },
        ]),
      );
      expect(timings.size).toBe(0);
    });
  });

  describe('applyTranscriptTimings', () => {
    const timings = pageTurnTimings(
      page([turn('pr_reply', { durationMs: 80_000, steps: [step(iso(0), iso(3000))] })]),
    );

    it('stamps the turn duration and the step span on the reply that named the prompt', () => {
      // The shape the mock fixture serves: the snapshot stamps `prompt_id` on
      // the assistant message.
      const messages = [
        message({ id: 'm1', role: 'user', content: [{ type: 'text', text: 'hi' }] }),
        message({ id: 'm2', role: 'assistant', promptId: 'pr_reply' }),
      ];
      const stamped = applyTranscriptTimings(messages, timings);
      expect(stamped[0]).toBe(messages[0]);
      expect(stamped[1]).toMatchObject({ durationMs: 80_000, stepDurationMs: 3000 });
    });

    it('stamps replies that follow the user message whose id is the prompt id', () => {
      // The shape the daemon serves: a prompt message carries the prompt id as
      // its own id, and the assistant reply carries nothing to match on.
      const messages = [
        message({ id: 'msg_prompt_1', role: 'user' }),
        message({ id: 'm2', role: 'assistant' }),
      ];
      const stamped = applyTranscriptTimings(
        messages,
        pageTurnTimings(page([turn('msg_prompt_1', { durationMs: 80_000, steps: [step(iso(0), iso(3000))] })])),
      );
      expect(stamped[1]).toMatchObject({ durationMs: 80_000, stepDurationMs: 3000 });
    });

    it('gives each reply of the turn its own step span, tool results in between', () => {
      const multi = pageTurnTimings(
        page([
          turn('msg_prompt_1', {
            durationMs: 80_000,
            steps: [step(iso(0), iso(3000)), step(iso(3000), iso(7000))],
          }),
        ]),
      );
      const stamped = applyTranscriptTimings(
        [
          message({ id: 'msg_prompt_1', role: 'user' }),
          message({ id: 'm2', role: 'assistant' }),
          message({ id: 'm3', role: 'tool' }),
          message({ id: 'm4', role: 'assistant' }),
        ],
        multi,
      );
      expect(stamped.map((m) => m.stepDurationMs)).toEqual([undefined, 3000, undefined, 4000]);
      expect(stamped.filter((m) => m.role === 'assistant').map((m) => m.durationMs)).toEqual([
        80_000, 80_000,
      ]);
    });

    it('stamps nothing on a reply no page turn names', () => {
      const messages = [
        message({ id: 'msg_prompt_1', role: 'user' }),
        message({ id: 'm2', role: 'assistant' }),
      ];
      const stamped = applyTranscriptTimings(messages, timings);
      expect(stamped[1]?.durationMs).toBeUndefined();
      expect(stamped[1]?.stepDurationMs).toBeUndefined();
    });

    it('prefers the page\'s own duration and keeps one already measured when the page has none', () => {
      const measured = [
        message({ id: 'msg_prompt_1', role: 'user' }),
        message({ id: 'm2', role: 'assistant', durationMs: 75_000 }),
      ];
      // Page carries no duration for the turn: the client's own number stays.
      expect(
        applyTranscriptTimings(
          measured,
          pageTurnTimings(page([turn('msg_prompt_1', { steps: [step(iso(0), iso(3000))] })])),
        )[1],
      ).toMatchObject({ durationMs: 75_000, stepDurationMs: 3000 });
      // Page carries one: it wins.
      expect(
        applyTranscriptTimings(
          measured,
          pageTurnTimings(
            page([turn('msg_prompt_1', { durationMs: 80_000, steps: [step(iso(0), iso(3000))] })]),
          ),
        )[1],
      ).toMatchObject({ durationMs: 80_000 });
    });

    it('returns the messages untouched when the page carries no timing at all', () => {
      const messages = [message({ id: 'm1', role: 'user' }), message({ id: 'm2', role: 'assistant' })];
      const stamped = applyTranscriptTimings(messages, new Map());
      expect(stamped).toEqual(messages);
      expect(stamped[1]).toBe(messages[1]);
    });
  });
});

describe('mergeSnapshotSubagents', () => {
  function subagent(id: string, overrides: Partial<AppTask> = {}): AppTask {
    return {
      id,
      sessionId: 's1',
      kind: 'subagent',
      description: `task ${id}`,
      busy: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('seeds an empty store from the roster', () => {
    const roster = [
      subagent('a1', { subagentPhase: 'working', swarmIndex: 0, parentToolCallId: 'call-1' }),
      subagent('a2', { subagentPhase: 'queued', swarmIndex: 1, parentToolCallId: 'call-1' }),
    ];
    expect(mergeSnapshotSubagents(roster, [])).toEqual(roster);
  });

  it('keeps reducer-owned accumulated output from an already-live task', () => {
    const live = subagent('a1', {
      subagentPhase: 'queued',
      outputLines: ['line 1'],
      text: 'partial answer',
    });
    const roster = [subagent('a1', { subagentPhase: 'working' })];
    const [merged] = mergeSnapshotSubagents(roster, [live]);
    // Roster is authoritative for identity/status/phase…
    expect(merged?.subagentPhase).toBe('working');
    // …but the accumulated output survives the seed.
    expect(merged?.outputLines).toEqual(['line 1']);
    expect(merged?.text).toBe('partial answer');
  });

  it('keeps tasks the roster does not know about', () => {
    const background: AppTask = {
      id: 'bash-1',
      sessionId: 's1',
      kind: 'bash',
      description: 'npm test',
      busy: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const roster = [subagent('a1')];
    const merged = mergeSnapshotSubagents(roster, [background, subagent('a1')]);
    expect(merged.map((t) => t.id)).toEqual(['a1', 'bash-1']);
  });

  it('returns the existing list untouched when the roster is empty', () => {
    const existing = [subagent('a1')];
    expect(mergeSnapshotSubagents([], existing)).toBe(existing);
  });
});


describe('keepLiveSubagents', () => {
  function subagent(id: string, overrides: Partial<AppTask> = {}): AppTask {
    return {
      id,
      sessionId: 's1',
      kind: 'subagent',
      description: `task ${id}`,
      status: 'running',
      createdAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('returns the REST list untouched when no live-only subagent exists', () => {
    const rest = [subagent('a1')];
    expect(keepLiveSubagents(rest, [subagent('a1')])).toBe(rest);
  });

  it('keeps WS-only swarm subagents that REST omits', () => {
    const rest: AppTask[] = [];
    const merged = keepLiveSubagents(rest, [subagent('a1')]);
    expect(merged.map((t) => t.id)).toEqual(['a1']);
  });

  it('folds a REST background-subagent row into the WS row keyed by agent id', () => {
    // The same background subagent: WS keys it by agent id, REST by task id.
    const live = subagent('agent-1', {
      runInBackground: true,
      backgroundTaskId: 'task-9',
      outputLines: ['step 1'],
      text: 'partial',
    });
    const rest = [subagent('task-9', { runInBackground: true })];
    const merged = keepLiveSubagents(rest, [live]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('agent-1');
    expect(merged[0]?.outputLines).toEqual(['step 1']);
    expect(merged[0]?.text).toBe('partial');
    expect(merged[0]?.backgroundTaskId).toBe('task-9');
  });

  it('lets REST complete a live row whose finish event was missed', () => {
    const live = subagent('agent-1', {
      runInBackground: true,
      backgroundTaskId: 'task-9',
      subagentPhase: 'working',
    });
    const rest = [
      subagent('task-9', {
        runInBackground: true,
        status: 'completed',
        completedAt: '2026-01-01T00:01:00.000Z',
        outputPreview: 'done',
      }),
    ];
    const [merged] = keepLiveSubagents(rest, [live]);
    expect(merged?.status).toBe('completed');
    // The detail panel prefers subagentPhase over status — it must follow too.
    expect(merged?.subagentPhase).toBe('completed');
    expect(merged?.completedAt).toBe('2026-01-01T00:01:00.000Z');
    expect(merged?.outputPreview).toBe('done');
  });

  it('maps a REST-cancelled row to the failed phase (the enum has no cancelled)', () => {
    const live = subagent('agent-1', {
      runInBackground: true,
      backgroundTaskId: 'task-9',
      subagentPhase: 'working',
    });
    const rest = [subagent('task-9', { runInBackground: true, status: 'cancelled' })];
    const [merged] = keepLiveSubagents(rest, [live]);
    expect(merged?.status).toBe('cancelled');
    expect(merged?.subagentPhase).toBe('failed');
  });

  it('never lets a lagging poll flip a finished row back to running', () => {
    const live = subagent('agent-1', {
      runInBackground: true,
      backgroundTaskId: 'task-9',
      status: 'completed',
      completedAt: '2026-01-01T00:01:00.000Z',
    });
    const rest = [subagent('task-9', { runInBackground: true, status: 'running' })];
    const [merged] = keepLiveSubagents(rest, [live]);
    expect(merged?.status).toBe('completed');
  });

  it('keeps newer REST output flowing into an already-folded row', () => {
    // The live row carries a preview folded in by an earlier poll; the fresh
    // REST row has the final persisted output and must win.
    const live = subagent('agent-1', {
      runInBackground: true,
      backgroundTaskId: 'task-9',
      outputPreview: 'stale tail',
      outputBytes: 100,
    });
    const rest = [
      subagent('task-9', {
        runInBackground: true,
        status: 'completed',
        outputPreview: 'final result',
        outputBytes: 200,
      }),
    ];
    const [merged] = keepLiveSubagents(rest, [live]);
    expect(merged?.outputPreview).toBe('final result');
    expect(merged?.outputBytes).toBe(200);
  });
});

describe('extractFrontmatter', () => {
  it('splits a leading ---fenced block from the body', () => {
    expect(extractFrontmatter('---\nkey: value\n---\nrest of message')).toEqual({
      frontmatter: 'key: value\n',
      body: 'rest of message',
    });
  });

  it('returns no frontmatter for a plain message', () => {
    expect(extractFrontmatter('plain text')).toEqual({ frontmatter: null, body: 'plain text' });
    expect(extractFrontmatter('')).toEqual({ frontmatter: null, body: '' });
  });

  it('treats an unterminated opening fence as plain body', () => {
    expect(extractFrontmatter('---\nkey: value\n')).toEqual({
      frontmatter: null,
      body: '---\nkey: value\n',
    });
  });

  it('treats an empty ---/--- block as plain body', () => {
    expect(extractFrontmatter('---\n---\nrest')).toEqual({
      frontmatter: null,
      body: '---\n---\nrest',
    });
  });

  it('handles CRLF line endings in both fences', () => {
    expect(extractFrontmatter('---\r\nkey: value\r\n---\r\nrest')).toEqual({
      frontmatter: 'key: value\r\n',
      body: 'rest',
    });
  });

  it('does not treat a --- fence later in the message as frontmatter', () => {
    expect(extractFrontmatter('text before\n---\nkey: value\n---\nrest')).toEqual({
      frontmatter: null,
      body: 'text before\n---\nkey: value\n---\nrest',
    });
  });

  it('tolerates trailing whitespace on the fence lines', () => {
    expect(extractFrontmatter('---  \nkey: value\n--- \nrest')).toEqual({
      frontmatter: 'key: value\n',
      body: 'rest',
    });
  });

  it('returns an empty body when the message is only frontmatter', () => {
    expect(extractFrontmatter('---\nkey: value\n---')).toEqual({ frontmatter: 'key: value\n', body: '' });
    expect(extractFrontmatter('---\nkey: value\n---\n')).toEqual({ frontmatter: 'key: value\n', body: '' });
  });
});

// ---------------------------------------------------------------------------
// Paste bucketing — useAttachmentUpload.bucketPastedData (pure helper).
// ---------------------------------------------------------------------------

interface FakeItem {
  kind: string;
  file?: File | null;
  isDirectory?: boolean;
}

function fakeFile(name: string, type = '', size = 10): File {
  return { name, type, size } as unknown as File;
}

function source(items: FakeItem[], files: File[] = []): { items: unknown; files: unknown } {
  return {
    items: items.map((item) => ({
      kind: item.kind,
      getAsFile: () => item.file ?? null,
      ...(item.isDirectory !== undefined
        ? { webkitGetAsEntry: () => (item.isDirectory ? { isDirectory: true } : null) }
        : {}),
    })),
    files,
  };
}

describe('bucketPastedData', () => {
  it('buckets a pasted folder into folderNames and never uploads it', () => {
    const bucket = bucketPastedData(source([{ kind: 'file', file: fakeFile('assets'), isDirectory: true }]));
    expect(bucket.hasFolders).toBe(true);
    expect(bucket.folderNames).toEqual(['assets']);
    expect(bucket.files).toEqual([]);
  });

  it('keeps files alongside folders and strips the folder twin from FileList', () => {
    const items = [
      { kind: 'file', file: fakeFile('assets'), isDirectory: true },
      { kind: 'file', file: fakeFile('a.png', 'image/png') },
    ];
    const files = [fakeFile('assets'), fakeFile('screenshot.png', 'image/png')];
    const bucket = bucketPastedData(source(items, files));
    expect(bucket.hasFolders).toBe(true);
    expect(bucket.folderNames).toEqual(['assets']);
    expect(bucket.files.map((f) => f.name)).toEqual(['a.png', 'screenshot.png']);
  });

  it('reports hasFolders when a directory entry yields no name', () => {
    const bucket = bucketPastedData(source([{ kind: 'file', file: null, isDirectory: true }]));
    expect(bucket.hasFolders).toBe(true);
    expect(bucket.folderNames).toEqual([]);
    expect(bucket.files).toEqual([]);
  });

  it('ignores non-file items and dedupes repeated entries', () => {
    const items = [
      { kind: 'string', file: fakeFile('x.png') },
      { kind: 'file', file: fakeFile('a.png', 'image/png') },
      { kind: 'file', file: fakeFile('a.png', 'image/png') },
      { kind: 'file', file: fakeFile('b.txt', 'text/plain') },
    ];
    const bucket = bucketPastedData(source(items));
    expect(bucket.hasFolders).toBe(false);
    expect(bucket.folderNames).toEqual([]);
    expect(bucket.files.map((f) => f.name)).toEqual(['a.png', 'b.txt']);
  });

  it('falls back to plain files when webkitGetAsEntry is unavailable', () => {
    const items = [{ kind: 'file', file: fakeFile('folder') }];
    const bucket = bucketPastedData(source(items));
    expect(bucket.hasFolders).toBe(false);
    expect(bucket.files.map((f) => f.name)).toEqual(['folder']);
  });

  it('a pasted folder name round-trips into a folder mention token', () => {
    const text = mentionToText({ kind: 'folder', name: 'assets', path: 'assets/' });
    const segments = tokenizeMentions(text);
    expect(segments).toEqual([{ kind: 'folder', name: 'assets', path: 'assets/' }]);
  });
});

describe('composePageTitle', () => {
  it('uses the --web-title override verbatim when set', () => {
    expect(
      composePageTitle({ webTitle: 'My Dev Box', workspaceName: 'muon-sim', sessionTitle: 'scan' }),
    ).toBe('My Dev Box');
  });

  it('treats an empty web_title as unset', () => {
    expect(
      composePageTitle({ webTitle: '', workspaceName: 'muon-sim', sessionTitle: 'scan' }),
    ).toBe('muon-sim · scan');
  });

  it('joins the workspace dir name and session title when both are known', () => {
    expect(composePageTitle({ workspaceName: 'muon-sim', sessionTitle: 'fitting' })).toBe('muon-sim · fitting');
  });

  it('falls back to the bare workspace name without a session title', () => {
    expect(composePageTitle({ workspaceName: 'muon-sim', sessionTitle: null })).toBe('muon-sim');
    expect(composePageTitle({ workspaceName: 'muon-sim', sessionTitle: '' })).toBe('muon-sim');
  });

  it('falls back to the product name when nothing is known', () => {
    expect(composePageTitle({})).toBe('Kimi Code Web');
    expect(composePageTitle({ workspaceName: null, sessionTitle: null })).toBe('Kimi Code Web');
    expect(composePageTitle({ webTitle: null })).toBe('Kimi Code Web');
  });
});

// The exchange clock behind the working moon: a reload and a session switch
// must both keep counting the same exchange, and a stamp left over from an
// exchange this page never saw end must not be applied to a later one.
describe('exchange timing', () => {
  function installMemoryStorage(): void {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
      clear: () => {
        data.clear();
      },
      key: (index: number) => Array.from(data.keys()).at(index) ?? null,
      get length() {
        return data.size;
      },
    });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('reconcileExchangeStart', () => {
    it('has nothing to count when no turn is in flight', () => {
      expect(reconcileExchangeStart({ at: 1000, turnId: 3 }, false, undefined, 5000)).toBeNull();
      expect(reconcileExchangeStart(undefined, false, undefined, 5000)).toBeNull();
    });

    it('starts the count now when nothing is remembered', () => {
      expect(reconcileExchangeStart(undefined, true, 7, 5000)).toEqual({ at: 5000, turnId: 7 });
    });

    it('keeps the remembered start of the same turn (reload / session switch)', () => {
      expect(reconcileExchangeStart({ at: 1000, turnId: 7 }, true, 7, 5000)).toEqual({
        at: 1000,
        turnId: 7,
      });
    });

    it('adopts the turn id of a start stamped before the daemon named the turn', () => {
      expect(reconcileExchangeStart({ at: 1000 }, true, 7, 5000)).toEqual({ at: 1000, turnId: 7 });
    });

    it('restarts for a turn the remembered start does not belong to', () => {
      expect(reconcileExchangeStart({ at: 1000, turnId: 3 }, true, 7, 5000)).toEqual({
        at: 5000,
        turnId: 7,
      });
    });

    it('keeps the remembered start while a running turn is not named yet', () => {
      expect(reconcileExchangeStart({ at: 1000 }, true, undefined, 5000)).toEqual({ at: 1000 });
      expect(reconcileExchangeStart({ at: 1000, turnId: 3 }, true, undefined, 5000)).toEqual({
        at: 1000,
        turnId: 3,
      });
    });

    it('starts the count now for an unnamed running turn with nothing remembered', () => {
      expect(reconcileExchangeStart(undefined, true, undefined, 5000)).toEqual({ at: 5000 });
    });
  });

  describe('persistence', () => {
    beforeEach(() => {
      installMemoryStorage();
    });

    it('round-trips a start per session', () => {
      saveExchangeStart('s1', { at: 1000, turnId: 3 });
      saveExchangeStart('s2', { at: 2000 });
      expect(loadExchangeStarts()).toEqual({ s1: { at: 1000, turnId: 3 }, s2: { at: 2000 } });
    });

    it('clears one session without touching the others', () => {
      saveExchangeStart('s1', { at: 1000, turnId: 3 });
      saveExchangeStart('s2', { at: 2000, turnId: 4 });
      saveExchangeStart('s1', null);
      expect(loadExchangeStarts()).toEqual({ s2: { at: 2000, turnId: 4 } });
    });

    it('drops the whole key once nothing is left to remember', () => {
      saveExchangeStart('s1', { at: 1000, turnId: 3 });
      saveExchangeStart('s1', null);
      expect(localStorage.getItem(STORAGE_KEYS.exchangeStart)).toBeNull();
      expect(loadExchangeStarts()).toEqual({});
    });

    it('ignores entries that do not parse instead of guessing a time', () => {
      localStorage.setItem(
        STORAGE_KEYS.exchangeStart,
        JSON.stringify({ good: { at: 10, turnId: 1 }, noTime: { turnId: 2 }, bad: 'x' }),
      );
      expect(loadExchangeStarts()).toEqual({ good: { at: 10, turnId: 1 } });
    });

    it('survives a corrupted value', () => {
      localStorage.setItem(STORAGE_KEYS.exchangeStart, '{not json');
      expect(loadExchangeStarts()).toEqual({});
    });
  });
});
