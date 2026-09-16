// apps/kimi-web/src/lib/turnFold.ts
// Pure helper behind "Auto-fold messages": it splits an assistant turn's render
// blocks into the work that folds away and what the reader keeps. The fold's
// body is everything before the turn's LAST non-empty text; that text and
// whatever follows it stay visible. A turn with no message of its own (a
// tool-only reply) folds up to its first stand-alone tool card or notice
// instead — which leaves the thinking that preceded the tools folded away and
// the tool cards visible, and folds a turn that is nothing but a tool run
// entirely behind its head.
//
// The split runs at the RENDER layer: turn-store objects are never mutated, so
// reconcileTurns, the row-level v-memo and the eviction / height-lock
// bookkeeping in ChatPane keep working untouched.
import type { FoldedRenderBlock } from './toolFold';
import { rendersToolCard } from '../components/chatTurnRendering';

/** Storage key prefix for a turn fold's expansion state — namespaced from the
 *  per-card, per-run and `fold:` keys of the shared fold-state map. */
export const TURN_FOLD_KEY_PREFIX = 'turn-fold:';

export interface TurnFoldSplit {
  /** The turn's work, in order — the fold's body. */
  folded: FoldedRenderBlock[];
  /** What stays visible under the fold: the turn's message. */
  visible: FoldedRenderBlock[];
}

/** The blocks a turn without a message of its own can still unfold from: a
 *  stand-alone tool card, or a notice. A run of tool cards is not one of them
 *  (upstream anchors on the same two shapes), and neither is a tool result the
 *  page shows as media rather than as a card. */
function anchorsVisible(block: FoldedRenderBlock): boolean {
  if (block.kind === 'tool') return rendersToolCard(block);
  return block.kind === 'task';
}

/**
 * Split one turn's render blocks. Pure: the arguments are never mutated and
 * unchanged block objects are reused, so the rows keep their identity.
 */
export function splitTurnBlocks(blocks: readonly FoldedRenderBlock[]): TurnFoldSplit {
  let boundary = -1;
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const block = blocks[i];
    if (block?.kind === 'text' && block.text.trim().length > 0) {
      boundary = i;
      break;
    }
  }
  if (boundary === -1) {
    for (let i = 0; i < blocks.length; i += 1) {
      const block = blocks[i];
      if (block && anchorsVisible(block)) {
        boundary = i;
        break;
      }
    }
  }
  // Nothing to anchor on: the whole turn is the fold's body.
  if (boundary === -1) return { folded: [...blocks], visible: [] };

  const head = blocks.slice(0, boundary);
  const tail = blocks.slice(boundary);
  // A notice is a message from the engine, not work, so it never folds away —
  // it is put back at the top of the visible part, as upstream does.
  const notices = head.filter((block) => block.kind === 'task');
  if (notices.length === 0) return { folded: head, visible: tail };
  return { folded: head.filter((block) => block.kind !== 'task'), visible: [...notices, ...tail] };
}
