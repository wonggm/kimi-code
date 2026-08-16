// apps/kimi-web/src/composables/reconcileTurns.ts
// Streaming-performance helper: every streamed delta rebuilds the whole
// ChatTurn[] with fresh object identities, so Vue re-renders every transcript
// row (there is no memoization win because the turn objects are never
// referentially stable). This reconciler reuses the previous turn object at the
// same index when its content is unchanged, so unchanged rows keep their
// identity and row-level `v-memo` can skip them.
//
// Pure + dependency-free (no Vue imports). Comparison is INDEX-based: a turn
// inserted at the front shifts every later turn to a new index, so those turns
// get fresh identities (their content is still fully preserved). The returned
// array is always a fresh array (so computed consumers still see a change) —
// only the unchanged turn objects inside it are reused.

import type { ChatTurn } from '../types';

/**
 * Deterministic content digest for one turn, built from EVERY content field of
 * ChatTurn (see src/types.ts): id, role, no, text, thinking, tools, blocks,
 * approval, approvalId, attachments, compaction, createdAt, durationMs,
 * skillActivation, pluginCommand, cron. JSON.stringify covers the nested arrays
 * (tools, blocks, approval, attachments) by content and omits undefined object
 * keys, so a missing optional field and an explicitly-undefined one serialize
 * identically. Both sides of a comparison are produced by the same builder
 * (messagesToTurns), so object key order is stable.
 *
 * Keep this in sync with ChatTurn: if a field is ever added to the type, add it
 * here too — a field missing from the fingerprint silently drops updates to it.
 */
function fingerprintTurn(turn: ChatTurn): string {
  return JSON.stringify({
    id: turn.id,
    role: turn.role,
    no: turn.no,
    text: turn.text,
    thinking: turn.thinking,
    tools: turn.tools,
    blocks: turn.blocks,
    approval: turn.approval,
    approvalId: turn.approvalId,
    attachments: turn.attachments,
    compaction: turn.compaction,
    createdAt: turn.createdAt,
    durationMs: turn.durationMs,
    skillActivation: turn.skillActivation,
    pluginCommand: turn.pluginCommand,
    cron: turn.cron,
  });
}

/**
 * Reconcile a freshly-built turn list against the previous one. For each index,
 * reuse the `prev` turn object when its content fingerprint matches the `next`
 * turn; otherwise use the `next` object. Callers never mutate turn objects, so
 * reusing `prev` as-is is safe.
 */
export function reconcileTurns(prev: ChatTurn[], next: ChatTurn[]): ChatTurn[] {
  if (prev.length === 0 || next.length === 0) return next;
  return next.map((nextTurn, i) => {
    const prevTurn = prev[i];
    if (prevTurn !== undefined && fingerprintTurn(prevTurn) === fingerprintTurn(nextTurn)) {
      return prevTurn;
    }
    return nextTurn;
  });
}
