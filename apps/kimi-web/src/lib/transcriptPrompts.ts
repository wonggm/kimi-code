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
// A steered prompt's own entry can reach the page without its text (the
// `prompt.submitted` event sometimes misses the transcript store), and a cold
// or backfilled page rebuilds with no prompt entries at all. Both states still
// carry the steered text as a user-role text frame whose `promptIds` name the
// steered prompt, so the frame is the fallback text source, and a frame with no
// prompt entry of its own (the cold page) yields the entry outright.
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
  TranscriptFrame,
  TranscriptPage,
  TranscriptPrompt,
  TranscriptStep,
} from '../api/types';

/** Metadata key marking a bubble this module rebuilt. The daemon never sends
 *  it, so a later rebuild replaces the bubble instead of duplicating it. */
export const RECOVERED_PROMPT_METADATA_KEY = 'kimiWeb.recoveredPrompt';

export type RecoveredPromptAnchor =
  | { kind: 'text'; text: string; afterPromptId?: string }
  | { kind: 'tool'; toolCallId: string; afterPromptId?: string };

export interface RecoveredPromptMessage {
  /** Stable identity of the prompt (its id, or the turn that holds it). */
  key: string;
  text: string;
  createdAt: string;
  /** Where the bubble goes: `tail` for a prompt the daemon has not started (it
   *  runs after everything already transcribed), `chronological` for one folded
   *  into a running turn (the user sent it mid-conversation). */
  placement: 'tail' | 'chronological';
  anchor?: RecoveredPromptAnchor;
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

interface SteeredFrame {
  text: string;
  at?: string;
  anchor?: RecoveredPromptAnchor;
}

function outputAnchorAfter(
  steps: readonly TranscriptStep[],
  stepIndex: number,
  frameIndex: number,
  afterPromptId: string | undefined,
): RecoveredPromptAnchor | undefined {
  for (let i = stepIndex; i < steps.length; i += 1) {
    const frames = steps[i]!.frames;
    for (let j = i === stepIndex ? frameIndex + 1 : 0; j < frames.length; j += 1) {
      const frame: TranscriptFrame = frames[j]!;
      if (frame.kind === 'text' && frame.role === 'user') return undefined;
      if (frame.kind === 'text' && frame.role === 'assistant') {
        const text = frame.text.trim();
        if (text.length > 0) return { kind: 'text', text, afterPromptId };
      }
      if (frame.kind === 'tool') {
        return { kind: 'tool', toolCallId: frame.toolCallId, afterPromptId };
      }
    }
  }
  return undefined;
}

/** The steered text the turn items carry: a user-role text frame whose
 *  `promptIds` name the steered prompt. Keyed by prompt id, first frame wins.
 *  The frame sits in the step it landed in, so that step's start is the time
 *  the user sent it (falling back to the turn's start). The turn's own opener
 *  is excluded — it is the turn's prompt, not a steer. */
function steeredFramesByPromptId(page: TranscriptPage): Map<string, SteeredFrame> {
  const out = new Map<string, SteeredFrame>();
  for (const item of page.items) {
    if (item.kind !== 'turn') continue;
    for (const [stepIndex, step] of item.steps.entries()) {
      for (const [frameIndex, frame] of step.frames.entries()) {
        if (frame.kind !== 'text' || frame.role !== 'user') continue;
        const text = frame.text.trim();
        if (text.length === 0) continue;
        const anchor = outputAnchorAfter(item.steps, stepIndex, frameIndex, item.triggerPromptId);
        for (const promptId of frame.promptIds ?? []) {
          if (promptId.length === 0 || promptId === item.triggerPromptId) continue;
          if (!out.has(promptId)) {
            out.set(promptId, { text, at: step.startedAt ?? item.startedAt, anchor });
          }
        }
      }
    }
  }
  return out;
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
  const frames = steeredFramesByPromptId(page);
  for (const prompt of page.prompts) {
    if (!isFoldedSteer(prompt)) continue;
    const frame = frames.get(prompt.promptId);
    const text = contentText(prompt.content) || frame?.text || '';
    if (text.length === 0) continue;
    out.push({
      key: prompt.promptId,
      text,
      createdAt: prompt.createdAt,
      placement: 'chronological',
      ...(frame?.anchor ? { anchor: frame.anchor } : {}),
    });
  }
  for (const [promptId, frame] of frames) {
    if (promptById.has(promptId)) continue;
    out.push({
      key: promptId,
      text: frame.text,
      createdAt: frame.at ?? fallbackCreatedAt,
      placement: 'chronological',
      ...(frame.anchor ? { anchor: frame.anchor } : {}),
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
export function chronologicalIndex(messages: readonly AppMessage[], createdAt: string): number {
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

function recoveredPromptIndex(
  messages: readonly AppMessage[],
  recovered: RecoveredPromptMessage,
): number | undefined {
  const anchor = recovered.anchor;
  if (!anchor) return chronologicalIndex(messages, recovered.createdAt);
  let start = 0;
  if (anchor.afterPromptId) {
    const triggerIndex = messages.findIndex((message) => message.promptId === anchor.afterPromptId);
    if (triggerIndex >= 0) start = triggerIndex + 1;
  }
  for (let index = start; index < messages.length; index += 1) {
    const message = messages[index]!;
    if (message.role !== 'assistant') continue;
    if (anchor.kind === 'tool') {
      const matches = message.content.some(
        (part) => part.type === 'toolUse' && part.toolCallId === anchor.toolCallId,
      );
      if (matches) return index;
      continue;
    }
    const text = message.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n');
    if (text.includes(anchor.text)) return index;
  }
  return undefined;
}

/**
 * Replace this session's rebuilt bubbles with the ones the page reports now. A
 * prompt the daemon has meanwhile started (or drained) leaves the list, and a
 * prompt the snapshot already carries as a real message is never doubled. A
 * steered prompt is put back at its own place in the conversation; a queued one
 * is appended, because it runs after everything already transcribed.
 */
export interface RecoveredPromptApplyOptions {
  allowUnanchoredFallback?: boolean;
}

export function applyRecoveredPromptMessages(
  messages: readonly AppMessage[],
  recovered: readonly RecoveredPromptMessage[],
  sessionId: string,
  options: RecoveredPromptApplyOptions = {},
): AppMessage[] {
  const hadRebuilt = messages.some(isRecoveredPromptMessage);
  if (recovered.length === 0 && !hadRebuilt) return [...messages];

  const kept = messages.filter((message) => !isRecoveredPromptMessage(message));
  const persistedUserIds = new Set(
    kept.flatMap((message) => {
      if (message.role !== 'user') return [];
      return [message.id, message.promptId].filter((id): id is string => id !== undefined);
    }),
  );
  const rebuilt = recovered.filter((entry) => !persistedUserIds.has(entry.key));
  if (rebuilt.length === 0) return kept;

  const merged = [...kept];
  const tail: AppMessage[] = [];
  for (const entry of rebuilt) {
    const message = recoveredMessage(sessionId, entry);
    if (entry.placement === 'tail') {
      tail.push(message);
      continue;
    }
    const index = recoveredPromptIndex(merged, entry)
      ?? (options.allowUnanchoredFallback ? chronologicalIndex(merged, entry.createdAt) : undefined);
    if (index !== undefined) merged.splice(index, 0, message);
  }
  return [...merged, ...tail];
}
