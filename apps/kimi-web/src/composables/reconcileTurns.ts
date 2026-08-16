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
 * Deep content equality for a JSON-ish value: a turn metadata object
 * (approval / compaction / skillActivation / pluginCommand / cron) or an
 * element of a turn list (tool / block / attachment). Primitives compare by
 * `===`; objects compare per key; arrays compare length then element-by-element.
 * Never stringifies — the old fingerprint JSON.stringify'd every field of every
 * turn twice per reconcile, which dominated app JS CPU while streaming.
 *
 * Both sides of a comparison are produced by the same builder
 * (messagesToTurns), so key presence and order are stable for a given turn
 * role — an exact per-key comparison is equivalent to the old content digest.
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false;
    return sameList(a, b);
  }
  if (Array.isArray(b)) return false;
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  if (aKeys.length !== Object.keys(bObj).length) return false;
  for (const key of aKeys) {
    if (!sameValue(aObj[key], bObj[key])) return false;
  }
  return true;
}

/**
 * List equality: same reference, then same length, then element identity
 * (the common streaming case — unchanged messages keep the same nested arrays
 * by reference across rebuilds), then a deep per-element comparison.
 */
function sameList(a: unknown[] | undefined, b: unknown[] | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (!sameValue(a[i], b[i])) return false;
  }
  return true;
}

/**
 * Content equality for one turn, field by field. Fields are ordered so the
 * ones most likely to differ while streaming (text / thinking) are checked
 * early, giving a fast exit on the changed tail turn. Every ChatTurn field is
 * covered (see src/types.ts); keep this in sync if the type gains a field — a
 * field missing here silently drops updates to it.
 */
function sameTurn(a: ChatTurn, b: ChatTurn): boolean {
  if (a === b) return true;
  if (a.id !== b.id) return false;
  if (a.role !== b.role) return false;
  if (a.no !== b.no) return false;
  if (a.text !== b.text) return false;
  if (a.thinking !== b.thinking) return false;
  if (a.approvalId !== b.approvalId) return false;
  if (a.createdAt !== b.createdAt) return false;
  if (a.durationMs !== b.durationMs) return false;
  if (!sameList(a.tools, b.tools)) return false;
  if (!sameList(a.blocks, b.blocks)) return false;
  if (!sameValue(a.approval, b.approval)) return false;
  if (!sameList(a.attachments, b.attachments)) return false;
  if (!sameValue(a.compaction, b.compaction)) return false;
  if (!sameValue(a.skillActivation, b.skillActivation)) return false;
  if (!sameValue(a.pluginCommand, b.pluginCommand)) return false;
  if (!sameValue(a.cron, b.cron)) return false;
  return true;
}

/**
 * Reconcile a freshly-built turn list against the previous one. For each index,
 * reuse the `prev` turn object when its content matches the `next` turn;
 * otherwise use the `next` object. Callers never mutate turn objects, so
 * reusing `prev` as-is is safe.
 *
 * `reusePrefix` is the streaming fast path: the number of LEADING turns of
 * `next` the caller guarantees to be content-identical to `prev`. Those
 * indices are reused from `prev` without re-comparing, so a pure append/grow
 * skips re-fingerprinting the untouched prefix (the expensive per-turn
 * comparison then only runs over the tail). The hint is an ASSERTION, not a
 * check — the caller must prove the prefix unchanged (useKimiWebClient does
 * this with a message-object identity scan); a wrong hint would reuse a stale
 * turn and freeze it in the UI (v-memo). It is ignored when `next` is shorter
 * than `prev` (a shrink can re-boundary turn content) and clamped to
 * `prev.length`.
 */
export function reconcileTurns(
  prev: ChatTurn[],
  next: ChatTurn[],
  reusePrefix = 0,
): ChatTurn[] {
  if (prev.length === 0 || next.length === 0) return next;
  const start =
    next.length >= prev.length ? Math.min(Math.max(0, reusePrefix), prev.length) : 0;
  return next.map((nextTurn, i) => {
    if (i < start) {
      const prevTurn = prev[i];
      if (prevTurn !== undefined) return prevTurn;
    }
    const prevTurn = prev[i];
    if (prevTurn !== undefined && sameTurn(prevTurn, nextTurn)) {
      return prevTurn;
    }
    return nextTurn;
  });
}
