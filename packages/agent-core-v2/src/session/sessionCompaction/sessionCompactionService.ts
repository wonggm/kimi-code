import { Emitter, type Event } from '#/_base/event';
import { Disposable } from '#/_base/di/lifecycle';
import { LifecycleScope } from '#/app/scopes';
import { registerScopedService, ScopeActivation } from '#/_base/di/scope';
import { defineState } from '#/state/state';
import { IAtomicDocumentStore } from '#/persistence/interface/atomicDocumentStore';
import { ISessionContext } from '#/session/sessionContext/sessionContext';
import { ISessionStateService } from '#/session/state/sessionState';

import { ISessionCompactionConfig } from './sessionCompaction';

interface SessionCompactionState {
  readonly triggerRatio?: number;
}

export const sessionCompactionStateKey = defineState<SessionCompactionState>(
  'sessionCompaction.state',
  (): SessionCompactionState => ({}),
);

const STATE_KEY = 'state.json';
const MIN_TRIGGER_RATIO = 0.5;
const MAX_TRIGGER_RATIO = 0.99;

function isValidTriggerRatio(value: unknown): value is number {
  return typeof value === 'number' && value >= MIN_TRIGGER_RATIO && value <= MAX_TRIGGER_RATIO;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class SessionCompactionService extends Disposable implements ISessionCompactionConfig {
  declare readonly _serviceBrand: undefined;
  readonly ready: Promise<void>;
  readonly onDidChange: Event<void>;

  private readonly changeEmitter = this._register(new Emitter<void>());
  private readonly scope: string;
  private updateQueue: Promise<void> = Promise.resolve();

  constructor(
    @ISessionStateService private readonly states: ISessionStateService,
    @ISessionContext sessionContext: ISessionContext,
    @IAtomicDocumentStore private readonly store: IAtomicDocumentStore,
  ) {
    super();
    this.states.contributeState(sessionCompactionStateKey);
    this.scope = sessionContext.scope('compaction');
    this.onDidChange = this.changeEmitter.event;
    this.ready = this.load();
  }

  private get state(): SessionCompactionState {
    return this.states.get(sessionCompactionStateKey);
  }

  private set state(value: SessionCompactionState) {
    this.states.set(sessionCompactionStateKey, value);
  }

  triggerRatio(): number | undefined {
    return this.state.triggerRatio;
  }

  setTriggerRatio(value: number | undefined): Promise<void> {
    if (value !== undefined && !isValidTriggerRatio(value)) {
      return Promise.reject(new RangeError(`compaction trigger ratio must be between 0.5 and 0.99`));
    }
    const run = this.updateQueue.then(() => this.replace(value));
    this.updateQueue = run.catch(() => undefined);
    return run;
  }

  private async load(): Promise<void> {
    const stored = await this.store.get<unknown>(this.scope, STATE_KEY);
    if (!isRecord(stored) || !isValidTriggerRatio(stored['triggerRatio'])) return;
    this.state = { triggerRatio: stored['triggerRatio'] };
  }

  private async replace(value: number | undefined): Promise<void> {
    await this.ready;
    if (value === this.state.triggerRatio) return;
    const next = value === undefined ? {} : { triggerRatio: value };
    await this.store.set(this.scope, STATE_KEY, next);
    this.state = next;
    this.changeEmitter.fire(undefined);
  }
}

registerScopedService(
  LifecycleScope.Session,
  ISessionCompactionConfig,
  SessionCompactionService,
  ScopeActivation.OnScopeCreated,
  'sessionCompaction',
);
