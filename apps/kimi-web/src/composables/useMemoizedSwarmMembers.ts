// apps/kimi-web/src/composables/useMemoizedSwarmMembers.ts
// Memoized wrapper around swarmMembersByToolCall for the inline AgentSwarm
// card. The client's own swarmMembersByToolCallId computed re-derives from the
// active task list, which is re-filtered on every event (each event re-assigns
// tasksBySession), so the member map used to be rebuilt per event. This
// memoizes it keyed on the identity of the underlying tasks: the map is
// rebuilt only when a swarm-relevant task field actually changed.

import { computed, type ComputedRef } from 'vue';
import type { AppTask } from '../api/types';
import { swarmMembersByToolCall, type SwarmMember } from './swarmGroups';

/**
 * All AppTask fields swarmMembersByToolCall reads, compared by reference. Long
 * values (text, outputLines, outputPreview, description) are immutable strings
 * or copied by reference into the members, so reference equality is exact and
 * far cheaper than rebuilding the member map per event.
 */
function swarmInputsEqual(a: readonly AppTask[], b: readonly AppTask[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    if (x === undefined || y === undefined) return false;
    if (
      x.id !== y.id ||
      x.kind !== y.kind ||
      x.status !== y.status ||
      x.subagentPhase !== y.subagentPhase ||
      x.parentToolCallId !== y.parentToolCallId ||
      x.swarmIndex !== y.swarmIndex ||
      x.model !== y.model ||
      x.thinkingEffort !== y.thinkingEffort ||
      x.subagentType !== y.subagentType ||
      x.suspendedReason !== y.suspendedReason ||
      x.description !== y.description ||
      x.outputPreview !== y.outputPreview ||
      x.text !== y.text ||
      x.outputLines !== y.outputLines
    ) {
      return false;
    }
  }
  return true;
}

export function useMemoizedSwarmMembers(
  activeAppTasks: ComputedRef<AppTask[]>,
): ComputedRef<Map<string, SwarmMember[]>> {
  let lastInput: readonly AppTask[] | undefined;
  let lastMap: Map<string, SwarmMember[]> | undefined;

  return computed(() => {
    const input = activeAppTasks.value;
    if (lastMap !== undefined && lastInput !== undefined && swarmInputsEqual(lastInput, input)) {
      return lastMap;
    }
    lastInput = input;
    lastMap = swarmMembersByToolCall(input);
    return lastMap;
  });
}
