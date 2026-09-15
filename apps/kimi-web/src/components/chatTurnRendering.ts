// apps/kimi-web/src/components/chatTurnRendering.ts
// Pure turn-rendering helpers: pure functions of their arguments (no Vue
// reactivity, no component state). Shared by ChatPane.vue's template and its
// stateful copy/edit helpers.
import type { ChatTurn, TurnBlock } from '../types';

// Shared 1024-based token formatter (lib/formatTokens); re-exported so the
// existing ChatPane import keeps working.
export { formatTokens } from '../lib/formatTokens';

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = ((ms % 60_000) / 1000).toFixed(1);
  return `${m}m${s}s`;
}

// Ordered render blocks for an assistant turn. messagesToTurns supplies `blocks`
// (thinking + text + tool cards in call order); fall back to deriving them from
// the aggregate fields for any turn built without blocks (e.g. unit tests).
export function turnBlocks(turn: ChatTurn): TurnBlock[] {
  if (turn.blocks) return turn.blocks;
  const blocks: TurnBlock[] = [];
  if (turn.thinking) blocks.push({ kind: 'thinking', thinking: turn.thinking });
  if (turn.text) blocks.push({ kind: 'text', text: turn.text });
  for (const tool of turn.tools ?? []) blocks.push({ kind: 'tool', tool });
  return blocks;
}

/** A thinking block. It is always a render block of its own, never a row of an
 *  activity run. */
export type ThinkingItem = {
  kind: 'thinking';
  thinking: string;
  /** The span of the step the block came from, when the transcript page carried
   *  one — the head reads "Thought for 3s" from it. */
  durationMs?: number;
  sourceIndex: number;
};

export type ToolStackItem = {
  kind: 'tool';
  tool: Extract<TurnBlock, { kind: 'tool' }>['tool'];
  sourceIndex: number;
};

/** One row of an activity run — a run wraps tool calls only. */
export type RunItem = ToolStackItem;

/** The run's first tool row. */
export function firstRunTool(items: readonly RunItem[]): ToolStackItem | undefined {
  return items[0];
}

export type AssistantRenderBlock =
  | ThinkingItem
  | { kind: 'text'; text: string; sourceIndex: number }
  | { kind: 'tool'; tool: ToolStackItem['tool']; sourceIndex: number }
  | { kind: 'tool-stack'; items: RunItem[] }
  | { kind: 'task'; text: string; createdAt?: string; sourceIndex: number };

export function rendersToolCard(block: Extract<TurnBlock, { kind: 'tool' }>): boolean {
  return !(block.tool.status === 'ok' && block.tool.media);
}

export function assistantRenderBlocks(turn: ChatTurn): AssistantRenderBlock[] {
  const blocks = turnBlocks(turn);
  const rendered: AssistantRenderBlock[] = [];
  let run: RunItem[] = [];

  // A run of one item is not a run: a lone tool card renders on its own,
  // exactly as upstream's builder emits it.
  const flushRun = () => {
    if (run.length === 1) {
      const [item] = run;
      if (item) rendered.push({ kind: 'tool', tool: item.tool, sourceIndex: item.sourceIndex });
    } else if (run.length > 1) {
      rendered.push({ kind: 'tool-stack', items: run });
    }
    run = [];
  };

  blocks.forEach((block, sourceIndex) => {
    // A thinking block is its own row, outside the run: the run wraps the tool
    // calls only, so a thinking block both ends the run before it and keeps the
    // one after it apart (the same break a text block makes). Upstream instead
    // nests the thinking block in the run's body.
    if (block.kind === 'thinking') {
      flushRun();
      rendered.push({
        kind: 'thinking',
        thinking: block.thinking,
        durationMs: block.durationMs,
        sourceIndex,
      });
      return;
    }

    if (block.kind === 'tool') {
      if (rendersToolCard(block)) {
        run.push({ kind: 'tool', tool: block.tool, sourceIndex });
        return;
      }
      flushRun();
      rendered.push({ kind: 'tool', tool: block.tool, sourceIndex });
      return;
    }

    flushRun();
    if (block.kind === 'text') {
      rendered.push({ kind: 'text', text: block.text, sourceIndex });
    } else if (block.kind === 'task') {
      rendered.push({ kind: 'task', text: block.text, createdAt: block.createdAt, sourceIndex });
    }
  });

  flushRun();
  return rendered;
}

export function turnFinalText(turn: ChatTurn): string {
  return turnBlocks(turn)
    .flatMap((blk) => (blk.kind === 'text' && blk.text ? [blk.text] : []))
    .join('\n\n');
}

/** Convert a single turn to Markdown. */
export function turnToMarkdown(turn: ChatTurn): string {
  const parts: string[] = [];
  for (const blk of turnBlocks(turn)) {
    if (blk.kind === 'thinking' && blk.thinking) {
      parts.push(`> **Thinking**\n> ${blk.thinking.split('\n').join('\n> ')}`);
    } else if (blk.kind === 'text' && blk.text) {
      parts.push(blk.text);
    } else if (blk.kind === 'tool' && blk.tool.output && blk.tool.output.length > 0) {
      const output = blk.tool.output.join('\n');
      parts.push(`\`\`\`\n[${blk.tool.name}]\n${output}\n\`\`\``);
    }
  }
  return parts.join('\n\n');
}

export function toolStackKey(item: ToolStackItem): string {
  return item.tool.id || `tool-${item.sourceIndex}`;
}

export function renderBlockKey(block: AssistantRenderBlock, index: number): string {
  if (block.kind === 'tool-stack') {
    return `tool-stack-${block.items[0]?.sourceIndex ?? index}`;
  }
  if (block.kind === 'tool') return toolStackKey({ kind: 'tool', tool: block.tool, sourceIndex: block.sourceIndex });
  return `${block.kind}-${block.sourceIndex}`;
}

/** Key for a folded tool run (`tool-fold` block from lib/toolFold). The
 *  fold's first-tool id is the stable anchor; falls back to the block's
 *  source index when no id is present (defensive — persisted tools always
 *  carry one). */
export function toolFoldBlockKey(block: { items: RunItem[]; sourceIndex: number }): string {
  const first = firstRunTool(block.items);
  return `tool-fold-${first?.tool.id || `idx-${first?.sourceIndex ?? block.sourceIndex}`}`;
}
