import type { TokenUsage } from '#/kosong/contract/usage';

import { isAbortError } from '#/_base/utils/abort';
import {
  type AgentTask,
  type AgentTaskInfoBase,
  type AgentTaskSink,
} from '#/agent/task/types';

type SubagentCompletion = {
  readonly result: string;
  readonly usage?: TokenUsage;
};

export type SubagentHandle = {
  readonly agentId: string;
  readonly profileName: string;
  /** Bound model alias the subagent is actually running on (resolved at
   *  spawn, NOT re-read from `[subagent_models]`). Optional — only known for
   *  fresh spawns; resumed subagents keep their recorded model on the wire. */
  readonly boundModel?: string;
  readonly completion: Promise<SubagentCompletion>;
};

export interface SubagentTaskInfo extends AgentTaskInfoBase {
  readonly kind: 'agent';
  readonly agentId?: string;
  readonly subagentType?: string;
  /** Bound model alias the subagent is actually running on (resolved at
   *  spawn, NOT re-read from `[subagent_models]`). Optional for cross-version
   *  tolerance — older servers do not emit it. */
  readonly model?: string;
}

declare module '#/agent/task/types' {
  interface AgentTaskInfoByKind {
    readonly agent: SubagentTaskInfo;
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createSubagentExecutor(
  handle: SubagentHandle,
  abortController: AbortController,
): (signal: AbortSignal, output: (data: string) => void) => Promise<SubagentCompletion> {
  return async (signal, output) => {
    const requestAbort = (): void => {
      abortController.abort(signal.reason);
    };
    if (signal.aborted) {
      requestAbort();
    } else {
      signal.addEventListener('abort', requestAbort, { once: true });
    }

    try {
      const outcome = await handle.completion;
      output(outcome.result);
      return outcome;
    } catch (error: unknown) {
      if (signal.aborted && (isAbortError(error) || error === signal.reason)) {
        throw error;
      }
      throw error;
    } finally {
      signal.removeEventListener('abort', requestAbort);
    }
  };
}

export class SubagentTask implements AgentTask {
  readonly kind = 'agent' as const;
  readonly idPrefix: string = 'agent';
  readonly agentId: string;
  readonly subagentType: string;
  readonly model: string | undefined;

  constructor(
    private readonly handle: SubagentHandle,
    readonly description: string,
    private readonly abortController: AbortController,
  ) {
    this.agentId = handle.agentId;
    this.subagentType = handle.profileName;
    this.model = handle.boundModel;
  }

  async start(sink: AgentTaskSink): Promise<void> {
    const requestAbort = (): void => {
      this.abortController.abort(sink.signal.reason);
    };
    if (sink.signal.aborted) {
      requestAbort();
    } else {
      sink.signal.addEventListener('abort', requestAbort, { once: true });
    }

    try {
      const outcome = await this.handle.completion;
      sink.appendOutput(outcome.result);
      await sink.settle({ status: 'completed' });
    } catch (error: unknown) {
      if (sink.signal.aborted && (isAbortError(error) || error === sink.signal.reason)) {
        await sink.settle({ status: 'killed' });
        return;
      }
      await sink.settle({ status: 'failed', stopReason: errorMessage(error) });
    } finally {
      sink.signal.removeEventListener('abort', requestAbort);
    }
  }

  toInfo(base: AgentTaskInfoBase): SubagentTaskInfo {
    return {
      ...base,
      kind: 'agent',
      agentId: this.agentId,
      subagentType: this.subagentType,
      model: this.model,
    };
  }
}
