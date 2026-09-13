// apps/kimi-web/src/lib/toolFold.ts
// Pure helper that collapses runs of consecutive tool render rows into a single
// summary chip ("N tool calls · last: <name>"). The fold runs only at the
// RENDER layer — turn-store objects (ChatTurn, blocks, tools[]) are never
// mutated, so reconcileTurns / messagesToTurns / the row-level v-memo
// machinery keep working untouched.
//
// Distinct from TurnFold (rejected): TurnFold hides whole turns / message
// text; this only folds the per-turn tool cards list inside ONE assistant
// message, and only when there are ≥ THRESHOLD consecutive tool render rows.
//
// Expanded folds are tracked by the caller (typically via the shared
// `toolExpandState` injection in ChatPane) and passed back as `expandedFolds`:
// a fold whose key is in the set is rendered as a normal tool-stack instead
// of collapsing, so the user can drill back into the individual cards.

import type { AssistantRenderBlock, RunItem, ToolStackItem } from '../components/chatTurnRendering';
import { firstRunTool } from '../components/chatTurnRendering';

/** Number of consecutive tool render rows required before we offer a fold.
 *  Below this the run is short enough to keep the cards individually visible. */
export const TOOL_FOLD_THRESHOLD = 3;

/** Storage key prefix for fold expansion state. The full key is
 *  `fold:<first-tool-id>`, namespaced from the per-card and per-stack keys. */
export const TOOL_FOLD_KEY_PREFIX = 'fold:';

/** A folded run of tool render rows collapsed into one summary chip. The
 *  expanded view is a regular `tool-stack` re-emitted by the helper, so this
 *  block only exists in the COLLAPSED state. */
export interface ToolFoldBlock {
  kind: 'tool-fold';
  items: RunItem[];
  sourceIndex: number;
}

/** All render-block shapes ChatPane may render. `tool-fold` is the only
 *  shape introduced by this helper; the rest are unchanged. */
export type FoldedRenderBlock =
  | AssistantRenderBlock
  | ToolFoldBlock;

/** Build the fold key for a run. Falls back to the first tool's source index
 *  when the tool has no id (defensive — every persisted tool should have one). */
function foldKeyFor(items: RunItem[]): string {
  const first = firstRunTool(items);
  if (!first) return TOOL_FOLD_KEY_PREFIX + 'empty';
  return TOOL_FOLD_KEY_PREFIX + (first.tool.id || `idx-${first.sourceIndex}`);
}

/**
 * Walk a turn's render blocks, collapsing each run of ≥ THRESHOLD consecutive
 * tool render rows into one `tool-fold` chip. Runs shorter than THRESHOLD
 * pass through unchanged. A fold whose key is in `expandedFolds` is rendered
 * as a normal `tool-stack` (or single `tool` when only one item remains)
 * instead of collapsing, so a user-driven expansion survives the next
 * streaming render.
 *
 * The helper is pure: it does not mutate `blocks` or anything reachable from
 * it. The returned array is always a fresh array (Vue reactivity safe), but
 * element references are reused so unchanged rows keep their identity.
 */
export function foldRenderBlocks(
  blocks: readonly AssistantRenderBlock[],
  expandedFolds: ReadonlySet<string>,
  /** When false the run is left as-is: the user turned off the tool-call
   *  summary in settings (upstream's `activity-run-folding`). */
  enabled = true,
): FoldedRenderBlock[] {
  if (blocks.length === 0) return [];

  const result: FoldedRenderBlock[] = [];
  let runItems: RunItem[] = [];
  let runFirstSourceIndex = -1;
  let runKey: string | null = null;

  const flush = (): void => {
    if (runItems.length === 0) {
      runKey = null;
      runFirstSourceIndex = -1;
      return;
    }
    const items = runItems;
    const firstIdx = runFirstSourceIndex;
    const key = runKey ?? foldKeyFor(items);
    runItems = [];
    runKey = null;
    runFirstSourceIndex = -1;

    const toolCount = items.filter((item) => item.kind === 'tool').length;
    if (enabled && toolCount >= TOOL_FOLD_THRESHOLD) {
      // Always emit the chip — even when expanded — so the user has a stable
      // affordance to re-collapse. The expanded view also emits a tool-stack
      // immediately after, so the chips + the cards render side-by-side.
      result.push({ kind: 'tool-fold', items, sourceIndex: firstIdx });
      if (!expandedFolds.has(key)) return;
      result.push({ kind: 'tool-stack', items });
      return;
    }
    const only = items[0];
    if (items.length === 1 && only?.kind === 'tool') {
      result.push({ kind: 'tool', tool: only.tool, sourceIndex: only.sourceIndex });
      return;
    }
    result.push({ kind: 'tool-stack', items });
  };

  for (const block of blocks) {
    if (block.kind === 'tool') {
      if (runKey === null) {
        runKey = TOOL_FOLD_KEY_PREFIX + (block.tool.id || `idx-${block.sourceIndex}`);
        runFirstSourceIndex = block.sourceIndex;
      }
      runItems.push({ kind: 'tool', tool: block.tool, sourceIndex: block.sourceIndex });
      continue;
    }
    if (block.kind === 'tool-stack') {
      const first = firstRunTool(block.items);
      if (runKey === null && first) {
        runKey = TOOL_FOLD_KEY_PREFIX + (first.tool.id || `idx-${first.sourceIndex}`);
        runFirstSourceIndex = first.sourceIndex;
      }
      for (const item of block.items) runItems.push(item);
      continue;
    }
    flush();
    result.push(block);
  }
  flush();
  return result;
}

/** Status rollup of a fold group for the chip glyph (running spinner, error
 *  dot, done check). Mirrors the activity-run head's aggregate-status semantics. */
export type FoldStatus = 'running' | 'error' | 'done';

export function foldAggregateStatus(tools: readonly ToolStackItem[]): FoldStatus {
  if (tools.some((t) => t.tool.status === 'running')) return 'running';
  if (tools.some((t) => t.tool.status === 'error')) return 'error';
  return 'done';
}

/** Display label for the "last" call in the chip — the canonical tool name
 *  (Bash, Read, …) of the LAST item in the fold group. */
export function foldLastLabel(lastName: string): string {
  // Importing toolLabel would pull i18n into the helper, which keeps the
  // helper test-friendly but couples it to the i18n instance. The label is
  // expected to come pre-normalized from the caller (ChatPane imports
  // toolLabel from lib/toolMeta); this is the identity-pass-through.
  return lastName;
}