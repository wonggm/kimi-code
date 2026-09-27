import { createDecorator } from '#/_base/di/instantiation';
import type { Event } from '#/_base/event';

export interface ISessionCompactionConfig {
  readonly _serviceBrand: undefined;
  readonly ready: Promise<void>;
  readonly onDidChange: Event<void>;
  triggerRatio(): number | undefined;
  setTriggerRatio(value: number | undefined): Promise<void>;
}

export const ISessionCompactionConfig = createDecorator<ISessionCompactionConfig>(
  'sessionCompactionConfig',
);
