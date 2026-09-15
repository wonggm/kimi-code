// apps/kimi-web/src/lib/transcriptTiming.ts
// The engine's own timing for an exchange, read off the agent transcript page
// and stamped onto the snapshot messages the fork builds its transcript from.
//
// Two labels need it and neither survives on its own: "Worked for 1m20s" (the
// turn's duration) and "Thought for 3s" (the span of the step a thinking block
// came from). The snapshot carries no timing at all — its messages have no
// duration and its in-flight turn has no start — so before this the client could
// only time what it watched stream, and a reload or a session switch lost both.
// The transcript page keeps them: a turn carries `durationMs`, a step carries
// its own `startedAt`/`endedAt`, and a thinking frame carries none of its own —
// its block's span IS the span of the step that holds it.
//
// Pure on purpose: the rules are unit-testable without a browser.
//
// A page turn is tied to the fork's own turn through `triggerPromptId`, the
// prompt that opened it. The snapshot does not stamp the prompt id on the reply
// uniformly, so the run of assistant messages the turn produced is found either
// way the wire can state it: a reply carrying that `promptId` (the mock fixture
// and the live projector do this), or the run that follows the user message
// whose id IS the prompt id (the daemon stamps a prompt message with its own
// prompt id, and returns it as the user message's id).

import type { AppMessage, TranscriptPage, TranscriptTurn } from '../api/types';

export interface TurnTiming {
  /** The turn's own duration in ms — the engine's number off the event that
   *  closed it. Absent when the page carries none. */
  durationMs?: number;
  /** Step k's span in ms, in step order. `undefined` where the page carries no
   *  span for that step (a step still running, or one whose own span is zero —
   *  a zero span is not a duration and must not print as one). */
  stepDurationsMs: (number | undefined)[];
}

/** A span between two ISO stamps, or undefined when either is missing, does not
 *  parse, or the span is not positive. */
function spanMs(startedAt: string | undefined, endedAt: string | undefined): number | undefined {
  if (startedAt === undefined || endedAt === undefined) return undefined;
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return undefined;
  const ms = end - start;
  return ms > 0 ? ms : undefined;
}

function turnTiming(turn: TranscriptTurn): TurnTiming | null {
  const durationMs = typeof turn.durationMs === 'number' && turn.durationMs > 0
    ? turn.durationMs
    : undefined;
  const stepDurationsMs = turn.steps.map((step) => spanMs(step.startedAt, step.endedAt));
  if (durationMs === undefined && stepDurationsMs.every((ms) => ms === undefined)) return null;
  return { durationMs, stepDurationsMs };
}

/** What the page carries per turn, keyed by the prompt that opened it. A turn
 *  with neither a duration nor a step span is left out entirely — the caller
 *  then stamps nothing, and the labels stay off rather than showing a made-up
 *  number. */
export function pageTurnTimings(page: TranscriptPage): Map<string, TurnTiming> {
  const out = new Map<string, TurnTiming>();
  for (const item of page.items) {
    if (item.kind !== 'turn') continue;
    const key = item.triggerPromptId;
    if (key === undefined) continue;
    const timing = turnTiming(item);
    if (timing !== null) out.set(key, timing);
  }
  return out;
}

/** The page's timing stamped onto the messages it belongs to: the turn's
 *  duration onto every reply of the turn, the step's span onto the reply that
 *  step produced (the k-th reply of the turn is its k-th step — the page builds
 *  one step per assistant message). Nothing else about a message is touched, and
 *  a message that already carries the value keeps its identity. */
export function applyTranscriptTimings(
  messages: readonly AppMessage[],
  timings: ReadonlyMap<string, TurnTiming>,
): AppMessage[] {
  if (timings.size === 0) return [...messages];
  const out: AppMessage[] = [];
  /** The page turn the current assistant run belongs to. */
  let key: string | undefined;
  /** How many replies of that turn have been walked — the run's step index. */
  let stepIndex = 0;

  for (const message of messages) {
    if (message.role === 'user') {
      // A prompt message names its own turn: the daemon stamps the prompt id as
      // the user message's id too.
      key = timings.has(message.id) ? message.id : undefined;
      stepIndex = 0;
      out.push(message);
      continue;
    }
    if (message.role === 'system') {
      // Not part of a run the page describes.
      key = undefined;
      stepIndex = 0;
      out.push(message);
      continue;
    }
    if (message.role !== 'assistant') {
      // A tool result says nothing about which turn it belongs to; it folds into
      // the run around it, so the run's state carries on.
      out.push(message);
      continue;
    }

    const own = message.promptId !== undefined && timings.has(message.promptId)
      ? message.promptId
      : undefined;
    if (own !== undefined && own !== key) {
      key = own;
      stepIndex = 0;
    }
    const timing = key === undefined ? undefined : timings.get(key);
    if (timing === undefined) {
      out.push(message);
      continue;
    }
    const stepDurationMs = timing.stepDurationsMs[stepIndex] ?? message.stepDurationMs;
    stepIndex += 1;

    // The page's own number wins over a duration this client measured itself;
    // where the page carries none, whatever the message already has stays.
    const durationMs = timing.durationMs ?? message.durationMs;
    if (durationMs === message.durationMs && stepDurationMs === message.stepDurationMs) {
      out.push(message);
      continue;
    }
    out.push({
      ...message,
      ...(durationMs === undefined ? undefined : { durationMs }),
      ...(stepDurationMs === undefined ? undefined : { stepDurationMs }),
    });
  }

  return out;
}
