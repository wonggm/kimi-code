// apps/kimi-web/src/lib/exchangeTiming.ts
// The wall-clock start of the exchange the working moon is counting, kept per
// session and persisted, so the elapsed time beside the moon is continuous
// across a reload and across a session switch.
//
// Why the client's own stamp and not a server time: the snapshot's in-flight
// turn (`WireInFlightTurn`) carries no start time, and the fork builds its
// transcript from the snapshot's messages, so nothing it re-reads on boot names
// the start of the exchange already running (the mock's live-exchange fixture
// carries no running turn on its transcript page either — see MOCK_LIVE_EXCHANGE
// in webdiff/mock-server.mjs). The stamp this client took when it saw the
// exchange begin is the one source that survives a reload.
//
// `turnId` ties a stamp to the daemon turn it belongs to, once the client
// learns that turn id from a snapshot: a stamp left over from an exchange that
// ended while the page was closed must not be applied to a later one.
// Pure on purpose — the rules are unit-testable without a browser.

import { safeGetJson, safeRemove, safeSetString, STORAGE_KEYS } from './storage';

export interface ExchangeStart {
  /** Epoch ms at which the client saw this exchange begin. */
  at: number;
  /** The daemon turn this stamp belongs to, when the client knows it. Absent
   *  for an exchange whose first signal was this client's own submit. */
  turnId?: number;
}

function parseStart(value: unknown): ExchangeStart | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const at = raw['at'];
  if (typeof at !== 'number' || !Number.isFinite(at)) return null;
  const turnId = raw['turnId'];
  if (typeof turnId === 'number' && Number.isFinite(turnId)) return { at, turnId };
  return { at };
}

/** The persisted starts, keyed by session id. Entries that do not parse are
 *  dropped rather than repaired with a guessed time. */
export function loadExchangeStarts(): Record<string, ExchangeStart> {
  const parsed = safeGetJson<unknown>(STORAGE_KEYS.exchangeStart);
  if (!parsed || typeof parsed !== 'object') return {};
  const out: Record<string, ExchangeStart> = {};
  for (const [sessionId, value] of Object.entries(parsed as Record<string, unknown>)) {
    const start = parseStart(value);
    if (start !== null) out[sessionId] = start;
  }
  return out;
}

/** Write one session's start (null clears it), merged over the latest stored
 *  value so another tab's entries are not clobbered by this tab's copy. */
export function saveExchangeStart(sessionId: string, start: ExchangeStart | null): void {
  const current = loadExchangeStarts();
  if (start === null) {
    if (current[sessionId] === undefined) return;
    delete current[sessionId];
  } else {
    current[sessionId] = start;
  }
  if (Object.keys(current).length === 0) {
    safeRemove(STORAGE_KEYS.exchangeStart);
    return;
  }
  safeSetString(STORAGE_KEYS.exchangeStart, JSON.stringify(current));
}

/**
 * The start to count from, given what the client already remembers and the
 * turn a snapshot reports in flight (`turnId === undefined`: no exchange is
 * running, so the answer is null — clear it).
 *
 * A remembered stamp is kept only when it belongs to that turn: one with no
 * turn id yet is the same exchange before the daemon named its turn, and one
 * naming another turn belongs to an exchange this page never saw end.
 */
export function reconcileExchangeStart(
  existing: ExchangeStart | undefined,
  turnId: number | undefined,
  now: number,
): ExchangeStart | null {
  if (turnId === undefined) return null;
  if (existing === undefined || (existing.turnId !== undefined && existing.turnId !== turnId)) {
    return { at: now, turnId };
  }
  return { at: existing.at, turnId };
}
