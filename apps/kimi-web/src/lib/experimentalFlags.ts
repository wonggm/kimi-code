import type { AppConfig } from '../api/types';

/** Engine flag id for the steer-interrupt feature, see agent-core-v2 `agent/toolExecutor/flag.ts`. */
export const STEER_INTERRUPT_FLAG_ID = 'steer_interrupt';

/** Read the switch state from the daemon config. A missing key means the feature is off. */
export function steerInterruptEnabled(config: AppConfig | null | undefined): boolean {
  return config?.experimental?.[STEER_INTERRUPT_FLAG_ID] === true;
}

/**
 * Build the config patch for the switch. The whole experimental table goes back so a
 * partial write cannot drop the flags the user already set.
 */
export function withSteerInterrupt(
  config: AppConfig | null | undefined,
  on: boolean,
): Pick<AppConfig, 'experimental'> {
  return { experimental: { ...config?.experimental, [STEER_INTERRUPT_FLAG_ID]: on } };
}
