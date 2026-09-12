// apps/kimi-web/src/lib/conversationPrefs.ts
// Conversation display preferences that live in the browser rather than in the
// daemon config. Upstream keeps the tool-call summary under
// `kimi-web.activity-run-folding` (absent or anything but "0" means on), so the
// fork reads and writes the same key — a browser that has used either build
// sees the same state.
//
// Upstream's companion preference, `kimi-web.turn-folding` ("Auto-fold
// messages"), is deliberately NOT implemented: the fork rejected folding a
// finished turn's work away in the 0.36.1 round (see ToolFoldRow.vue and
// PLANS/web-port-0.39.md).
import { ref } from 'vue';

const ACTIVITY_RUN_FOLDING_KEY = 'kimi-web.activity-run-folding';

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
