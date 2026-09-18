// apps/kimi-web/src/lib/transcriptPrompts.ts
// User bubbles for prompts the daemon is holding but the session snapshot does
// not carry, rebuilt from the agent's transcript page.
//
// Two daemon states have no user message in the snapshot:
//  - a prompt the daemon accepted and has not started yet — a `turn` item in
//    state `queued` with the prompt text and no steps;
//  - a prompt steered into the turn that was already running — it never opens a
//    turn of its own, and the daemon marks it on its prompt entry with
//    `finishedAt === steeredAt`.
// Upstream rebuilds a bubble from both (a queued turn renders like any other
// turn; a steered prompt becomes an optimistic user message), so a reload does
// not lose the message the user just sent. The two are placed differently: a
// prompt still waiting to run belongs at the tail of the transcript, while one
// steered into a running turn belongs where the user sent it. Appending the
// steered one instead parked it under every later turn, so a message sent
// mid-turn read as the newest thing in the conversation. Pure on purpose: the
// rules are unit-testable without an engine or a browser.

import type {
  AppMessage,
  AppMessageContent,
  TranscriptPage,
  TranscriptPrompt,
} from '../api/types';

/** Metadata key marking a bubble this module rebuilt. The daemon never sends
 *  it, so a later rebuild replaces the bubble instead of duplicating it. */
export const RECOVERED_PROMPT_METADATA_KEY = 'kimiWeb.recoveredPrompt';

export interface RecoveredPromptMessage {
  /** Stable identity of the prompt (its id, or the turn that holds it). */
  key: string;
  text: string;
  createdAt: string;
  /** Where the bubble goes: `tail` for a prompt the daemon has not started (it
   *  runs after everything already transcribed), `chronological` for one folded
   *  into a running turn (the user sent it mid-conversation). */
  placement: 'tail' | 'chronological';
}

/** The plain text of a prompt's content parts. Wire content is a list of typed
 *  parts; only the text ones can be shown in a bubble. */
function contentText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== 'object') continue;
    const record = part as Record<string, unknown>;
    if (record['type'] !== 'text') continue;
    const text = record['text'];
    if (typeof text === 'string' && text.trim().length > 0) parts.push(text.trim());
  }
  return parts.join('\n\n');
}

/** A prompt folded into a turn that was already running: the daemon finishes it
 *  at the moment it was steered, which is what tells it apart from a prompt that
 *  opened a turn of its own. */
function isFoldedSteer(prompt: TranscriptPrompt): boolean {
  return (
    prompt.steeredAt !== undefined &&
    prompt.status === 'completed' &&
    prompt.finishedAt === prompt.steeredAt
  );
}

/** The prompts a session snapshot cannot show: the prompts still waiting in the
 *  daemon's queue (queued turns, in transcript order), then the ones steered into
 *  a turn that has already run — the order upstream renders them in.
 *  `fallbackCreatedAt` stamps a queued prompt the daemon gave no time of its own
 *  (it has not started). */
export function recoveredPromptMessages(
  page: TranscriptPage,
  fallbackCreatedAt: string,
): RecoveredPromptMessage[] {
  const out: RecoveredPromptMessage[] = [];
  const promptById = new Map(page.prompts.map((prompt) => [prompt.promptId, prompt]));
  for (const item of page.items) {
    if (item.kind !== 'turn' || item.state !== 'queued') continue;
    const text = (item.prompt ?? '').trim();
    if (text.length === 0) continue;
    out.push({
      key: item.triggerPromptId ?? `turn:${item.turnId}`,
      text,
      createdAt: promptById.get(item.triggerPromptId ?? '')?.createdAt
        ?? item.startedAt
        ?? fallbackCreatedAt,
      placement: 'tail',
    });
  }
  for (const prompt of page.prompts) {
    if (!isFoldedSteer(prompt)) continue;
    const text = contentText(prompt.content);
    if (text.length === 0) continue;
    out.push({
      key: prompt.promptId,
      text,
      createdAt: prompt.createdAt,
      placement: 'chronological',
    });
  }
  return out;
}

export function isRecoveredPromptMessage(message: AppMessage): boolean {
  return typeof message.metadata?.[RECOVERED_PROMPT_METADATA_KEY] === 'string';
}

function recoveredMessage(sessionId: string, recovered: RecoveredPromptMessage): AppMessage {
  const content: AppMessageContent[] = [{ type: 'text', text: recovered.text }];
  return {
    id: `msg_opt_prompt_${recovered.key}`,
    sessionId,
    role: 'user',
    content,
    createdAt: recovered.createdAt,
    metadata: {
      // Keep it through the next snapshot merge (see mergeSnapshotMessages) —
      // the snapshot cannot contain a prompt that has no message yet.
      'kimiWeb.optimisticUserMessage': true,
      [RECOVERED_PROMPT_METADATA_KEY]: recovered.key,
    },
  };
}

/** Where a message created at `createdAt` belongs: after the last message that
 *  is not newer than it, so a rebuilt bubble lands at the point in the
 *  conversation the user sent it. Equal times keep the newcomer last, which is
 *  where a prompt sent just now belongs. An unparseable time means the end of
 *  the list, the only position that claims nothing. */
function chronologicalIndex(messages: readonly AppMessage[], createdAt: string): number {
  const at = Date.parse(createdAt);
  if (Number.isNaN(at)) return messages.length;
  let index = messages.length;
  while (index > 0) {
    const previous = Date.parse(messages[index - 1]!.createdAt);
    if (Number.isNaN(previous) || previous <= at) break;
    index -= 1;
  }
  return index;
}

/**
 * Replace this session's rebuilt bubbles with the ones the page reports now. A
 * prompt the daemon has meanwhile started (or drained) leaves the list, and a
 * prompt the snapshot already carries as a real message is never doubled. A
 * steered prompt is put back at its own place in the conversation; a queued one
 * is appended, because it runs after everything already transcribed.
 */
export function applyRecoveredPromptMessages(
  messages: readonly AppMessage[],
  recovered: readonly RecoveredPromptMessage[],
  sessionId: string,
): AppMessage[] {
  const hadRebuilt = messages.some(isRecoveredPromptMessage);
  if (recovered.length === 0 && !hadRebuilt) return [...messages];

  const kept = messages.filter((message) => !isRecoveredPromptMessage(message));
  const knownPromptIds = new Set(
    kept.map((message) => message.promptId).filter((id): id is string => id !== undefined),
  );
  const rebuilt = recovered.filter((entry) => !knownPromptIds.has(entry.key));
  if (rebuilt.length === 0) return kept;

  const merged = [...kept];
  const tail: AppMessage[] = [];
  for (const entry of rebuilt) {
    const message = recoveredMessage(sessionId, entry);
    if (entry.placement === 'tail') tail.push(message);
    else merged.splice(chronologicalIndex(merged, entry.createdAt), 0, message);
  }
  return [...merged, ...tail];
}
