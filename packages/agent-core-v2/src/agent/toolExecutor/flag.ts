import { type FlagDefinitionInput, registerFlagDefinition } from '#/app/flag/flagRegistry';

export const STEER_INTERRUPT_FLAG_ID = 'steer_interrupt';
export const STEER_INTERRUPT_FLAG_ENV = 'KIMI_CODE_EXPERIMENTAL_STEER_INTERRUPT';

export const steerInterruptFlag: FlagDefinitionInput = {
  id: STEER_INTERRUPT_FLAG_ID,
  title: 'Steering interrupts running work',
  description:
    'A message sent while the agent is working ends the tool calls that are safe to end, skips the tool calls that have not started, and reaches the model wrapped as a priority interjection.',
  env: STEER_INTERRUPT_FLAG_ENV,
  default: false,
  surface: 'core',
};

registerFlagDefinition(steerInterruptFlag);
