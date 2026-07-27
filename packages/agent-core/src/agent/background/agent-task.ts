import { errorMessage, isAbortError } from '../../loop/errors';
import {
  type BackgroundTask,
  type BackgroundTaskInfoBase,
  type BackgroundTaskSink,
} from './task';
import type { SessionSubagentHost, SubagentHandle } from '../../session/subagent-host';

export interface AgentBackgroundTaskInfo extends BackgroundTaskInfoBase {
  readonly kind: 'agent';
  /** Subagent identifier accepted by Agent(resume=...). */
  readonly agentId?: string;
  /** Subagent profile name. */
  readonly subagentType?: string;
  /**
   * Model alias the subagent was pinned to at spawn / resume / retry time.
   * Optional on the persisted shape: legacy snake_case records and any task
   * started before model plumbing existed will not carry one.
   */
  readonly model?: string;
}

export class AgentBackgroundTask implements BackgroundTask {
  readonly kind = 'agent' as const;
  readonly idPrefix: string = 'agent';
  readonly agentId: string;
  readonly subagentType: string;

  constructor(
    private readonly handle: SubagentHandle,
    readonly description: string,
    private readonly subagentHost: Pick<SessionSubagentHost, 'markActiveChildDetached'>,
    private readonly abortController: AbortController,
  ) {
    this.agentId = handle.agentId;
    this.subagentType = handle.profileName;
  }

  /** Subagent model alias resolved once when the handle was produced. */
  get model(): string | undefined {
    return this.handle.model;
  }

  async start(sink: BackgroundTaskSink): Promise<void> {
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

  onDetach(): void {
    this.subagentHost.markActiveChildDetached(this.agentId);
  }

  toInfo(base: BackgroundTaskInfoBase): AgentBackgroundTaskInfo {
    return {
      ...base,
      kind: 'agent',
      agentId: this.agentId,
      subagentType: this.subagentType,
      model: this.handle.model,
    };
  }
}
