// Detach-target resolution: the web does not know a live foreground task's
// engine task id (WS rows are keyed by agent id; REST /tasks is only loaded at
// session open), so a detach click resolves the engine id from a fresh REST
// task list. Match order: agent id → parent tool call → bash command.

export interface DetachCandidateTask {
  id: string;
  kind: 'subagent' | 'bash' | 'tool';
  status: string;
  command?: string;
  agentId?: string;
  parentToolCallId?: string;
  runInBackground?: boolean;
}

export interface DetachTargetQuery {
  toolCallId?: string;
  agentId?: string;
  command?: string;
}

/** What a detach click site knows about the task it wants to background:
 *  task-list rows carry the REST row id, inline Agent cards the tool call id
 *  (+ wire agent id when resolved), bash surfaces the exact command. */
export interface DetachTaskTarget {
  taskId?: string;
  toolCallId?: string;
  agentId?: string;
  command?: string;
}

/** Find the engine task id to detach for a running foreground task.
 *  `agentId` matches the subagent's wire agent id; `toolCallId` matches the
 *  task's parent tool call; `command` is the bash fallback (exact match,
 *  most recent wins when two identical commands run concurrently). */
export function findDetachTarget(
  restTasks: readonly DetachCandidateTask[],
  opts: DetachTargetQuery,
): string | undefined {
  if (opts.agentId) {
    const hit = restTasks.find(
      (t) => t.agentId === opts.agentId && !isDetached(t),
    );
    if (hit) return hit.id;
  }
  if (opts.toolCallId) {
    const hit = restTasks.find(
      (t) => t.parentToolCallId === opts.toolCallId && !isDetached(t),
    );
    if (hit) return hit.id;
  }
  if (opts.command !== undefined) {
    // Latest wins: REST /tasks is creation-ordered, so findLast picks the
    // most recent matching command.
    const hit = restTasks.findLast(
      (t) =>
        t.kind === 'bash' &&
        t.status === 'running' &&
        !isDetached(t) &&
        t.command === opts.command,
    );
    if (hit) return hit.id;
  }
  return undefined;
}

function isDetached(task: DetachCandidateTask): boolean {
  return task.runInBackground === true;
}
