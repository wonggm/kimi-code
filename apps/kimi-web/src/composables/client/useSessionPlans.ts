// apps/kimi-web/src/composables/client/useSessionPlans.ts
// Per-session ExitPlanMode plan history for the dock plan viewer panel. Loaded
// from `GET /sessions/{id}/transcript/plan` (agent_id=main) when a session is
// selected and refreshed after every plan-review approval resolution, so the
// work-bar plan pill and the panel always show the latest plan + review.

import { ref, type Ref } from 'vue';
import { getKimiWebApi } from '../../api';
import type { AppPlanEntry } from '../../api/types';

export interface UseSessionPlans {
  plansBySession: Ref<Record<string, AppPlanEntry[]>>;
  loadSessionPlans: (sessionId: string) => Promise<void>;
}

export function useSessionPlans(): UseSessionPlans {
  const plansBySession = ref<Record<string, AppPlanEntry[]>>({});

  async function loadSessionPlans(sessionId: string): Promise<void> {
    try {
      const api = getKimiWebApi();
      const { plans } = await api.getSessionPlans(sessionId, { agentId: 'main' });
      plansBySession.value = {
        ...plansBySession.value,
        [sessionId]: plans,
      };
    } catch {
      // Plans are side data; a server without plan history (or an unavailable
      // session) must never block the session UI.
    }
  }

  return { plansBySession, loadSessionPlans };
}