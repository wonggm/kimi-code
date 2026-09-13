import { describe, expect, it } from 'vitest';
import type { ChatTurn, ToolCall, TurnBlock } from '../src/types';
import {
  assistantRenderBlocks,
  formatDuration,
  formatTokens,
  rendersToolCard,
  renderBlockKey,
  toolFoldBlockKey,
  turnBlocks,
  turnFinalText,
  turnToMarkdown,
} from '../src/components/chatTurnRendering';
import {
  foldAggregateStatus,
  foldRenderBlocks,
  TOOL_FOLD_KEY_PREFIX,
  TOOL_FOLD_THRESHOLD,
} from '../src/lib/toolFold';

function tool(id: string, over: Partial<ToolCall> = {}): ToolCall {
  return { id, name: 'read', arg: `· ${id}.ts`, status: 'ok', ...over };
}

function toolBlock(id: string, over: Partial<ToolCall> = {}): Extract<TurnBlock, { kind: 'tool' }> {
  return { kind: 'tool', tool: tool(id, over) };
}

function assistantTurn(blocks: TurnBlock[], over: Partial<ChatTurn> = {}): ChatTurn {
  return { id: 't1', role: 'assistant', no: 1, text: '', blocks, ...over };
}

describe('formatTokens', () => {
  it('keeps counts under 1024 verbatim and uses 1024-based k / M units', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(999)).toBe('999');
    expect(formatTokens(1000)).toBe('1000');
    expect(formatTokens(1500)).toBe('1.5k');
    expect(formatTokens(1_000_000)).toBe('977k');
    expect(formatTokens(2_500_000)).toBe('2.4M');
  });
});

describe('formatDuration', () => {
  it('switches units at the 1s and 1m boundaries', () => {
    expect(formatDuration(999)).toBe('999ms');
    expect(formatDuration(1000)).toBe('1.0s');
    expect(formatDuration(59_999)).toBe('60.0s');
    expect(formatDuration(60_000)).toBe('1m0.0s');
    expect(formatDuration(90_500)).toBe('1m30.5s');
  });
});

describe('turnBlocks', () => {
  it('returns the ordered blocks as-is when present', () => {
    const blocks: TurnBlock[] = [{ kind: 'text', text: 'hi' }];
    expect(turnBlocks(assistantTurn(blocks))).toBe(blocks);
  });

  it('falls back to thinking -> text -> tools order when blocks are absent', () => {
    const turn: ChatTurn = {
      id: 't1',
      role: 'assistant',
      no: 1,
      text: 'answer',
      thinking: 'plan',
      tools: [tool('a')],
    };
    expect(turnBlocks(turn)).toEqual([
      { kind: 'thinking', thinking: 'plan' },
      { kind: 'text', text: 'answer' },
      { kind: 'tool', tool: tool('a') },
    ]);
  });
});

describe('rendersToolCard', () => {
  it('hides the card only for a successful tool that carries inline media', () => {
    expect(rendersToolCard(toolBlock('a'))).toBe(true);
    expect(rendersToolCard(toolBlock('r', { status: 'running' }))).toBe(true);
    expect(
      rendersToolCard(toolBlock('m', { status: 'ok', media: { kind: 'image', url: 'x' } })),
    ).toBe(false);
    // media but errored -> still rendered as a card
    expect(
      rendersToolCard(toolBlock('e', { status: 'error', media: { kind: 'image', url: 'x' } })),
    ).toBe(true);
  });
});

describe('assistantRenderBlocks', () => {
  it('groups consecutive renderable tools into one tool-stack', () => {
    const rendered = assistantRenderBlocks(assistantTurn([toolBlock('a'), toolBlock('b')]));
    expect(rendered).toHaveLength(1);
    expect(rendered[0]).toMatchObject({ kind: 'tool-stack' });
    if (rendered[0]?.kind === 'tool-stack') {
      expect(rendered[0].tools.map((t) => t.tool.id)).toEqual(['a', 'b']);
      expect(rendered[0].tools.map((t) => t.sourceIndex)).toEqual([0, 1]);
    }
  });

  it('renders a lone tool as a standalone tool, not a stack', () => {
    const rendered = assistantRenderBlocks(assistantTurn([toolBlock('a')]));
    expect(rendered).toEqual([{ kind: 'tool', tool: tool('a'), sourceIndex: 0 }]);
  });

  it('breaks the stack when a non-tool block interrupts the run', () => {
    const rendered = assistantRenderBlocks(
      assistantTurn([toolBlock('a'), { kind: 'text', text: 'x' }, toolBlock('b')]),
    );
    expect(rendered.map((b) => b.kind)).toEqual(['tool', 'text', 'tool']);
  });

  it('breaks the stack when a media tool (no card) interrupts the run', () => {
    const rendered = assistantRenderBlocks(
      assistantTurn([
        toolBlock('a'),
        toolBlock('b'),
        toolBlock('c', { status: 'ok', media: { kind: 'image', url: 'x' } }),
      ]),
    );
    expect(rendered.map((b) => b.kind)).toEqual(['tool-stack', 'tool']);
    if (rendered[0]?.kind === 'tool-stack') {
      expect(rendered[0].tools.map((t) => t.tool.id)).toEqual(['a', 'b']);
    }
  });

  it('preserves thinking/text order with their source indexes', () => {
    const rendered = assistantRenderBlocks(
      assistantTurn([
        { kind: 'thinking', thinking: 'plan' },
        { kind: 'text', text: 'answer' },
      ]),
    );
    expect(rendered).toEqual([
      { kind: 'thinking', thinking: 'plan', sourceIndex: 0 },
      { kind: 'text', text: 'answer', sourceIndex: 1 },
    ]);
  });
});

describe('turnFinalText', () => {
  it('joins only the text blocks, dropping thinking and tools', () => {
    const turn = assistantTurn([
      { kind: 'thinking', thinking: 'plan' },
      { kind: 'text', text: 'first' },
      toolBlock('a'),
      { kind: 'text', text: 'second' },
    ]);
    expect(turnFinalText(turn)).toBe('first\n\nsecond');
  });
});

describe('turnToMarkdown', () => {
  it('renders thinking as a quote, text verbatim, and tool output as a fenced block', () => {
    const turn = assistantTurn([
      { kind: 'thinking', thinking: 'line1\nline2' },
      { kind: 'text', text: 'hello' },
      toolBlock('a', { name: 'bash', output: ['out1', 'out2'] }),
    ]);
    expect(turnToMarkdown(turn)).toBe(
      ['> **Thinking**\n> line1\n> line2', 'hello', '```\n[bash]\nout1\nout2\n```'].join('\n\n'),
    );
  });
});

describe('renderBlockKey', () => {
  it('derives stable keys per block kind', () => {
    expect(renderBlockKey({ kind: 'text', text: 'x', sourceIndex: 2 }, 0)).toBe('text-2');
    expect(renderBlockKey({ kind: 'tool', tool: tool('a'), sourceIndex: 3 }, 0)).toBe('a');
    expect(
      renderBlockKey({ kind: 'tool-stack', tools: [{ tool: tool('a'), sourceIndex: 5 }] }, 0),
    ).toBe('tool-stack-5');
  });
});

describe('toolFoldBlockKey', () => {
  it('keys the fold on the first tool id', () => {
    expect(
      toolFoldBlockKey({
        tools: [
          { tool: tool('first'), sourceIndex: 2 },
          { tool: tool('second'), sourceIndex: 3 },
        ],
        sourceIndex: 2,
      }),
    ).toBe('tool-fold-first');
  });

  it('falls back to the first tool source index when no id is present', () => {
    expect(
      toolFoldBlockKey({
        tools: [{ tool: { ...tool('x'), id: '' }, sourceIndex: 7 }],
        sourceIndex: 7,
      }),
    ).toBe('tool-fold-idx-7');
  });
});

// ---------------------------------------------------------------------------
// foldRenderBlocks (tool-call summary fold)
// ---------------------------------------------------------------------------
//
// The fold is a RENDER-LAYER concern — it never mutates the turn store
// (ChatTurn / blocks / tools[]). These tests exercise the helper directly.

function stackItem(id: string, sourceIndex: number, over: Partial<ToolCall> = {}) {
  return { tool: tool(id, over), sourceIndex };
}

function stackBlock(ids: string[], sourceIndex = 0): Extract<ReturnType<typeof assistantRenderBlocks>, { kind: 'tool-stack' }>[number] {
  return { kind: 'tool-stack', tools: ids.map((id, i) => stackItem(id, sourceIndex + i)) };
}

describe('foldRenderBlocks', () => {
  it('returns the input unchanged when empty', () => {
    expect(foldRenderBlocks([], new Set())).toEqual([]);
  });

  it('passes a lone tool through as a single tool block', () => {
    const rendered = assistantRenderBlocks(assistantTurn([toolBlock('a')]));
    const folded = foldRenderBlocks(rendered, new Set());
    expect(folded).toEqual(rendered);
  });

  it('does not fold a 2-tool run (under THRESHOLD)', () => {
    expect(TOOL_FOLD_THRESHOLD).toBe(3);
    const rendered = assistantRenderBlocks(assistantTurn([toolBlock('a'), toolBlock('b')]));
    const folded = foldRenderBlocks(rendered, new Set());
    expect(folded).toHaveLength(1);
    expect(folded[0]?.kind).toBe('tool-stack');
  });

  it('folds exactly THRESHOLD consecutive tool rows into one tool-fold block', () => {
    const rendered = assistantRenderBlocks(
      assistantTurn([toolBlock('a'), toolBlock('b'), toolBlock('c')]),
    );
    const folded = foldRenderBlocks(rendered, new Set());
    expect(folded).toHaveLength(1);
    expect(folded[0]?.kind).toBe('tool-fold');
    if (folded[0]?.kind === 'tool-fold') {
      expect(folded[0].tools.map((t) => t.tool.id)).toEqual(['a', 'b', 'c']);
    }
  });

  it('leaves the run unfolded when the tool-call summary preference is off', () => {
    const rendered = assistantRenderBlocks(
      assistantTurn([toolBlock('a'), toolBlock('b'), toolBlock('c')]),
    );
    const folded = foldRenderBlocks(rendered, new Set(), false);
    expect(folded.some((block) => block.kind === 'tool-fold')).toBe(false);
    expect(folded).toHaveLength(1);
    expect(folded[0]?.kind).toBe('tool-stack');
    if (folded[0]?.kind === 'tool-stack') {
      expect(folded[0].tools.map((t) => t.tool.id)).toEqual(['a', 'b', 'c']);
    }
  });

  it('folds longer consecutive runs (5 cards, including a pre-grouped stack)', () => {
    // a, b are adjacent → tool-stack; c, d, e stay as singles. Together: 5.
    const rendered: ReturnType<typeof assistantRenderBlocks> = [
      stackBlock(['a', 'b'], 0),
      { kind: 'tool', tool: tool('c'), sourceIndex: 2 },
      { kind: 'tool', tool: tool('d'), sourceIndex: 3 },
      { kind: 'tool', tool: tool('e'), sourceIndex: 4 },
    ];
    const folded = foldRenderBlocks(rendered, new Set());
    expect(folded).toHaveLength(1);
    expect(folded[0]?.kind).toBe('tool-fold');
    if (folded[0]?.kind === 'tool-fold') {
      expect(folded[0].tools.map((t) => t.tool.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    }
  });

  it('breaks the fold when a non-tool block interrupts the run', () => {
    const rendered = assistantRenderBlocks(
      assistantTurn([
        toolBlock('a'),
        toolBlock('b'),
        toolBlock('c'),
        { kind: 'text', text: 'between' },
        toolBlock('d'),
        toolBlock('e'),
        toolBlock('f'),
      ]),
    );
    const folded = foldRenderBlocks(rendered, new Set());
    // First three → tool-fold, text → text, last three → tool-fold
    expect(folded.map((b) => b.kind)).toEqual(['tool-fold', 'text', 'tool-fold']);
  });

  it('does not fold a run the user has expanded (passes through as tool-stack)', () => {
    const rendered = assistantRenderBlocks(
      assistantTurn([toolBlock('a'), toolBlock('b'), toolBlock('c')]),
    );
    const expanded = new Set<string>([`${TOOL_FOLD_KEY_PREFIX}a`]);
    const folded = foldRenderBlocks(rendered, expanded);
    // Expanded fold → chip + underlying stack, side by side.
    expect(folded.map((b) => b.kind)).toEqual(['tool-fold', 'tool-stack']);
    if (folded[1]?.kind === 'tool-stack') {
      expect(folded[1].tools.map((t) => t.tool.id)).toEqual(['a', 'b', 'c']);
    }
  });

  it('does not mutate the input array or its blocks', () => {
    const rendered = assistantRenderBlocks(
      assistantTurn([toolBlock('a'), toolBlock('b'), toolBlock('c')]),
    );
    const before = JSON.stringify(rendered);
    foldRenderBlocks(rendered, new Set());
    expect(JSON.stringify(rendered)).toBe(before);
  });

  it('emits the same identity for unchanged elements (ref-equality)', () => {
    const rendered = assistantRenderBlocks(
      assistantTurn([
        toolBlock('a'),
        toolBlock('b'),
        toolBlock('c'),
        { kind: 'text', text: 'between' },
      ]),
    );
    const folded = foldRenderBlocks(rendered, new Set());
    // The text block (no fold around it) keeps its identity.
    const textOriginal = rendered.find((b) => b.kind === 'text');
    const textFolded = folded.find((b) => b.kind === 'text');
    expect(textFolded).toBe(textOriginal);
  });
});

describe('foldAggregateStatus', () => {
  it('reports running if any tool is running', () => {
    expect(
      foldAggregateStatus([
        stackItem('a', 0, { status: 'ok' }),
        stackItem('b', 1, { status: 'running' }),
      ]),
    ).toBe('running');
  });

  it('reports error when no tool is running but at least one is error', () => {
    expect(
      foldAggregateStatus([
        stackItem('a', 0, { status: 'ok' }),
        stackItem('b', 1, { status: 'error' }),
      ]),
    ).toBe('error');
  });

  it('reports done when every tool succeeded', () => {
    expect(
      foldAggregateStatus([stackItem('a', 0, { status: 'ok' }), stackItem('b', 1, { status: 'ok' })]),
    ).toBe('done');
  });
});
