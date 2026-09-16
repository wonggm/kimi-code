// apps/kimi-web/src/lib/conversationPrefs.ts
// Conversation display preferences that live in the browser rather than in the
// daemon config. Both keys are upstream's, so a browser that has used either
// build sees the same state:
//   `kimi-web.activity-run-folding` — the tool-call summary; absent or anything
//   but "0" means on.
//   `kimi-web.turn-folding` — "Auto-fold messages"; only "1" means on, so a
//   browser that never touched the switch keeps today's unfolded transcript.
import { ref } from 'vue';

const ACTIVITY_RUN_FOLDING_KEY = 'kimi-web.activity-run-folding';
const TURN_FOLDING_KEY = 'kimi-web.turn-folding';

function readFoldingPref(): boolean {
  try {
    const raw = globalThis.localStorage?.getItem(ACTIVITY_RUN_FOLDING_KEY);
    return raw === null || raw === undefined ? true : raw !== '0';
  } catch {
    return true;
  }
}

export const activityRunFolding = ref(readFoldingPref());

export function setActivityRunFolding(value: boolean): void {
  activityRunFolding.value = value;
  try {
    globalThis.localStorage?.setItem(ACTIVITY_RUN_FOLDING_KEY, value ? '1' : '0');
  } catch {
    // Private mode or storage disabled: keep the in-memory value.
  }
}

function readTurnFoldingPref(): boolean {
  try {
    return globalThis.localStorage?.getItem(TURN_FOLDING_KEY) === '1';
  } catch {
    return false;
  }
}

/** Whether a turn's work folds away once the turn ends, leaving its head and
 *  the final message. Off unless the browser opted in. */
export const turnFolding = ref(readTurnFoldingPref());

export function setTurnFolding(value: boolean): void {
  turnFolding.value = value;
  try {
    globalThis.localStorage?.setItem(TURN_FOLDING_KEY, value ? '1' : '0');
  } catch {
    // Private mode or storage disabled: keep the in-memory value.
  }
}
