// apps/kimi-web/src/lib/snapshotMessages.ts
// Merge an authoritative snapshot tail into already-loaded messages.
//
// The session snapshot returns only the most recent bounded page. After a user
// has loaded older pages, replacing the whole message array with that tail would
// drop the older prefix they already fetched and reset scrollback. Preserve any
// loaded messages older than the snapshot window; the snapshot is authoritative
// for its own window and replaces anything inside it.
import type { AppMessage } from '../api/types';
import { chronologicalIndex } from './transcriptPrompts';

export function mergeSnapshotMessages(
  loaded: AppMessage[],
  snapshot: AppMessage[],
): AppMessage[] {
  if (snapshot.length === 0) return snapshot;
  if (loaded.length === 0) return snapshot;

  const earliestSnapshotMs = Date.parse(snapshot[0]!.createdAt);
  if (Number.isNaN(earliestSnapshotMs)) return snapshot;

  // The optimistic bubble keeps its client-side id to avoid remounting, while
  // submitPrompt stamps the authoritative v2 user-message id into promptId.
  // Match that identity against the snapshot instead of guessing from content:
  // repeated prompts are distinct messages even when their text/media is equal.
  const snapshotIds = new Set(snapshot.map((m) => m.id));
  const snapshotUserIds = new Set(snapshot.filter((m) => m.role === 'user').map((m) => m.id));

  // Optimistic bubbles the snapshot can never confirm: a steer is not persisted
  // as a message, so neither its client id nor its prompt id ever appears in
  // the snapshot — dropping one here is what made a steered message disappear
  // after switching away and back. A normal send does get confirmed (its prompt
  // id lands as a snapshot user message id), so its optimistic copy still gives
  // way to the authoritative one. These float free of the age window and are
  // spliced back by time below, where the user sent them.
  const isUnconfirmedOptimisticUser = (message: AppMessage): boolean =>
    message.role === 'user' &&
    message.metadata?.['kimiWeb.optimisticUserMessage'] === true &&
    (message.promptId === undefined || !snapshotUserIds.has(message.promptId));

  const floating: AppMessage[] = [];
  const older = loaded.filter((message) => {
    if (isUnconfirmedOptimisticUser(message)) {
      floating.push(message);
      return false;
    }
    const createdAtMs = Date.parse(message.createdAt);
    if (Number.isNaN(createdAtMs) || createdAtMs >= earliestSnapshotMs) return false;
    if (snapshotIds.has(message.id)) return false;
    if (
      message.role === 'user' &&
      message.promptId !== undefined &&
      snapshotUserIds.has(message.promptId)
    ) return false;
    return true;
  });

  if (older.length === 0 && floating.length === 0) return snapshot;
  const merged = [...older, ...snapshot];
  for (const message of floating) {
    merged.splice(chronologicalIndex(merged, message.createdAt), 0, message);
  }
  return merged;
}
