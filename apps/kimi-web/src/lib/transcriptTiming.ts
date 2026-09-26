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
//
// The prompt is often not among the messages the browser holds at all. The
// snapshot returns the last hundred, and one long turn fills that on its own,
// so after a reload the visible tail of an exchange has no prompt above it. The
// page still says when that turn ran, and the engine never runs two turns at
// once, so the run falls inside the window of exactly one turn: the duration
// comes from there.

import type { AppMessage, TranscriptPage, TranscriptTurn } from '../api/types';
import { isMidRunInjection } from '../composables/messagesToTurns';

export interface TurnTiming {
  /** The turn's own duration in ms — the engine's number off the event that
   *  closed it. Absent when the page carries none. */
  durationMs?: number;
  /** When the turn closed, for the step that has no successor to measure it
   *  against. */
  endedAt?: string;
  /** Step k's span in ms, in step order. `undefined` where the page carries no
   *  span for that step (a step still running, one whose own span is zero —
   *  a zero span is not a duration and must not print as one — or a turn the
   *  server rebuilt from history, which keeps no per-step time at all). */
  stepDurationsMs: (number | undefined)[];
}

/** A page turn's timing plus the window of clock time it ran in, when the page
 *  states both ends. The engine runs one turn at a time, so the windows of
 *  consecutive turns do not overlap and a run of replies falls in exactly one. */
export interface TimedTurn {
  timing: TurnTiming;
  startMs?: number;
  endMs?: number;
}

export interface PageTimings {
  /** The index into `ordered` of the turn a prompt opened. */
  byPrompt: ReadonlyMap<string, number>;
  /** Every timed turn in page order, oldest first. */
  ordered: readonly TimedTurn[];
}

/** A span between two ISO stamps, or undefined when either is missing, does not
 *  parse, or the span is not positive. */
export function durationMsBetween(
  startedAt: string | undefined,
  endedAt: string | undefined,
): number | undefined {
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
  const stepDurationsMs = turn.steps.map((step) => durationMsBetween(step.startedAt, step.endedAt));
  if (
    durationMs === undefined &&
    turn.endedAt === undefined &&
    stepDurationsMs.every((ms) => ms === undefined)
  ) return null;
  return { durationMs, endedAt: turn.endedAt, stepDurationsMs };
}

/** The clock window a turn ran in, from what the page states about it: its own
 *  start where the page carries one, otherwise its end less its duration. Both
 *  ends are needed before a run of replies can be attributed to the turn, and a
 *  turn the page times only one end of contributes neither. */
function turnWindow(turn: TranscriptTurn, timing: TurnTiming): TimedTurn | null {
  const endMs = timing.endedAt === undefined ? Number.NaN : Date.parse(timing.endedAt);
  if (!Number.isFinite(endMs)) return null;
  const startMs = turn.startedAt === undefined
    ? (timing.durationMs === undefined ? Number.NaN : endMs - timing.durationMs)
    : Date.parse(turn.startedAt);
  if (!Number.isFinite(startMs)) return null;
  return { timing, startMs, endMs };
}

/** What the page carries per turn: the timing itself, the prompt that opened the
 *  turn, and the window it ran in. A turn with neither a duration, an end, nor a
 *  step span is left out entirely — the caller then stamps nothing, and the
 *  labels stay off rather than showing a made-up number. `ordered` is the page's
 *  own order, oldest turn first. */
export function pageTurnTimings(page: TranscriptPage): PageTimings {
  const ordered: TimedTurn[] = [];
  const byPrompt = new Map<string, number>();
  for (const item of page.items) {
    if (item.kind !== 'turn') continue;
    const timing = turnTiming(item);
    if (timing === null) continue;
    const index = ordered.length;
    const window = turnWindow(item, timing);
    if (window !== null) ordered.push(window);
    else ordered.push({ timing });
    if (item.triggerPromptId !== undefined) byPrompt.set(item.triggerPromptId, index);
  }
  return { byPrompt, ordered };
}

/** The page's timing stamped onto the messages it belongs to: the turn's
 *  duration onto every reply of the turn, the step's span onto the reply that
 *  step produced (the k-th reply of the turn is its k-th step — the page builds
 *  one step per assistant message). Nothing else about a message is touched, and
 *  a message that already carries the value keeps its identity.
 *
 *  A turn the server rebuilt from history carries the turn's own end but no
 *  per-step span, so a reply the page cannot time is measured from the replies
 *  around it: a step runs until the next one starts, which is the next reply's
 *  timestamp, and the turn's end closes the last step of a run the page counts
 *  in full. The page's own span always wins; a measured one only fills a gap.
 *
 *  The measurement needs no page at all, which matters because the association
 *  is not reliable: the snapshot stamps no prompt id on the reply and the
 *  window that reaches the browser can leave the prompt message out, so a run
 *  is timed from its own replies wherever the page cannot reach it. Only the
 *  closing step of a run stays unmeasured then, since the time that ends it is
 *  the page's alone and none of the run's replies come after it.
 *
 *  A run no prompt names still belongs to a turn, and the page says when that
 *  turn ran: the run's last reply falls inside the window of exactly one of
 *  them, because the engine never runs two turns at once. That is where the
 *  turn's duration goes when the prompt that opened it is older than the
 *  messages the browser holds — the common case after a reload, since a single
 *  long turn outgrows the snapshot's hundred-message window. */
export function applyTranscriptTimings(
  messages: readonly AppMessage[],
  timings: PageTimings,
): AppMessage[] {
  const out: AppMessage[] = [];
  /** The index of the page turn the current assistant run belongs to. */
  let key: number | undefined;
  /** How many replies of that turn have been walked — the run's step index. */
  let stepIndex = 0;
  /** The run's last timed reply, held back so the next reply's timestamp can
   *  measure it once the run ends. */
  let pending: { index: number; createdAt: string } | undefined;
  let pendingTiming: TurnTiming | undefined;
  /** Every reply of the run, for the turn the page names only by its window. */
  const runIndices: number[] = [];
  let runReplies = 0;
  /** The turns already attributed to a run, so two runs cannot claim one. */
  const claimed = new Set<number>();

  const measure = (index: number, startedAt: string, endedAt: string | undefined): void => {
    const stamped = out[index];
    if (stamped === undefined || stamped.stepDurationMs !== undefined) return;
    const span = durationMsBetween(startedAt, endedAt);
    if (span === undefined) return;
    out[index] = { ...stamped, stepDurationMs: span };
  };

  /** The turn whose window holds the run's last reply, if one is left. */
  const turnByWindow = (at: string): TimedTurn | undefined => {
    const atMs = Date.parse(at);
    if (!Number.isFinite(atMs)) return undefined;
    for (const [index, candidate] of timings.ordered.entries()) {
      if (claimed.has(index)) continue;
      if (candidate.startMs === undefined || candidate.endMs === undefined) continue;
      if (candidate.endMs < atMs || candidate.startMs > atMs) continue;
      claimed.add(index);
      return candidate;
    }
    return undefined;
  };

  /** Close the run: the last reply has no successor, so only the turn's own end
   *  can measure it, and only when the page counts the steps the replies cover. */
  const closeRun = (): void => {
    if (pending !== undefined) {
      if (pendingTiming !== undefined && pendingTiming.stepDurationsMs.length === runReplies) {
        measure(pending.index, pending.createdAt, pendingTiming.endedAt);
      } else if (pendingTiming === undefined) {
        const window = turnByWindow(pending.createdAt);
        if (window !== undefined) {
          const { durationMs, endedAt } = window.timing;
          if (durationMs !== undefined) {
            for (const index of runIndices) {
              const stamped = out[index];
              if (stamped === undefined || stamped.durationMs !== undefined) continue;
              out[index] = { ...stamped, durationMs };
            }
          }
          if (window.timing.stepDurationsMs.length === runReplies) {
            measure(pending.index, pending.createdAt, endedAt);
          }
        }
      }
    }
    pending = undefined;
    pendingTiming = undefined;
    runIndices.length = 0;
    runReplies = 0;
  };

  for (const message of messages) {
    if (message.role === 'user') {
      if (isMidRunInjection(message)) {
        // A reminder or hook result the engine fed the model between two steps.
        // It opens no turn and ends none, so the run it landed in carries on.
        out.push(message);
        continue;
      }
      // A prompt message names its own turn: the daemon stamps the prompt id as
      // the user message's id too.
      closeRun();
      key = timings.byPrompt.get(message.id);
      stepIndex = 0;
      out.push(message);
      continue;
    }
    if (message.role === 'system') {
      // Not part of a run the page describes.
      closeRun();
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

    const own = message.promptId !== undefined ? timings.byPrompt.get(message.promptId) : undefined;
    if (own !== undefined && own !== key) {
      closeRun();
      key = own;
      stepIndex = 0;
    }
    if (key !== undefined) claimed.add(key);
    const timing = key === undefined ? undefined : timings.ordered[key]?.timing;
    if (timing === undefined) {
      // The page names no turn for this run, so it has no number of its own to
      // stamp — but the run still measures itself, one reply ending the step the
      // reply before it opened, and the turn it belongs to is found by its
      // window when the run ends.
      out.push(message);
    } else {
      const stepDurationMs = timing.stepDurationsMs[stepIndex] ?? message.stepDurationMs;
      stepIndex += 1;

      // The page's own number wins over a duration this client measured itself;
      // where the page carries none, whatever the message already has stays.
      const durationMs = timing.durationMs ?? message.durationMs;
      out.push(
        durationMs === message.durationMs && stepDurationMs === message.stepDurationMs
          ? message
          : {
              ...message,
              ...(durationMs === undefined ? undefined : { durationMs }),
              ...(stepDurationMs === undefined ? undefined : { stepDurationMs }),
            },
      );
    }

    // This reply starts the step that follows, so it ends the previous one.
    if (pending !== undefined) measure(pending.index, pending.createdAt, message.createdAt);
    pending = { index: out.length - 1, createdAt: message.createdAt };
    pendingTiming = timing;
    runIndices.push(out.length - 1);
    runReplies += 1;
  }
  closeRun();

  return out;
}
