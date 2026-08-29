import { z } from 'zod';

import { type EnvBindings, envBindings, stripEnvBoundFields } from '#/app/config/config';
import { registerConfigSection } from '#/app/config/configSectionContributions';
import {
  camelToSnake,
  cloneRecord,
  isPlainObject,
  plainObjectToToml,
  setDefined,
  transformPlainObject,
} from '#/app/config/toml';

export const LOOP_CONTROL_SECTION = 'loopControl';

export const LOOP_MAX_STEPS_PER_TURN_ENV = 'KIMI_LOOP_MAX_STEPS_PER_TURN';
export const LOOP_MAX_ATTEMPTS_PER_STEP_ENV = 'KIMI_LOOP_MAX_ATTEMPTS_PER_STEP';
export const LOOP_MAX_RETRIES_PER_STEP_ENV = 'KIMI_LOOP_MAX_RETRIES_PER_STEP';

export const LoopControlSchema = z.object({
  maxStepsPerTurn: z.number().int().min(0).optional(),
  maxAttemptsPerStep: z.number().int().min(0).optional(),
  maxRalphIterations: z.number().int().min(-1).optional(),
  reservedContextSize: z.number().int().min(0).optional(),
  compactionTriggerRatio: z.number().min(0.5).max(0.99).optional(),
  compactionMaxAttempts: z.number().int().min(1).optional(),
});

export type LoopControl = z.infer<typeof LoopControlSchema>;

function parseNonNegativeInt(raw: string): number | undefined {
  const value = raw.trim();
  if (value.length === 0 || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

export const loopControlEnvBindings: EnvBindings<LoopControl> = envBindings(LoopControlSchema, {
  maxStepsPerTurn: { env: LOOP_MAX_STEPS_PER_TURN_ENV, parse: parseNonNegativeInt },
  maxAttemptsPerStep: {
    env: LOOP_MAX_ATTEMPTS_PER_STEP_ENV,
    deprecatedEnv: LOOP_MAX_RETRIES_PER_STEP_ENV,
    parse: parseNonNegativeInt,
  },
});

export const stripLoopControlEnv = stripEnvBoundFields(loopControlEnvBindings);

export const loopControlToToml = (value: unknown, rawSnake: unknown): unknown => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  return plainObjectToToml(value as Record<string, unknown>, rawSnake);
};

registerConfigSection(LOOP_CONTROL_SECTION, LoopControlSchema, {
  toToml: loopControlToToml,
  env: loopControlEnvBindings,
  stripEnv: stripLoopControlEnv,
  deprecations: [
    { key: 'max_retries_per_step', replacement: 'max_attempts_per_step' },
    { key: 'max_steps_per_run', replacement: 'max_steps_per_turn' },
  ],
});

export const SUBAGENT_COMPACTION_SECTION = 'subagentCompaction';

/**
 * `[subagent_compaction]` on disk: agent profile name → per-profile compaction
 * overrides, e.g. `[subagent_compaction.explore]` with `trigger_ratio` and
 * `reserved_context_size` fields. Profile-name keys are matched verbatim, so
 * the custom fromToml/toToml hooks below keep them intact while the entry
 * fields camelCase/snakeCase one level down.
 */
export const SubagentCompactionEntrySchema = z.object({
  triggerRatio: z.number().min(0.5).max(0.99).optional(),
  reservedContextSize: z.number().int().min(0).optional(),
  thinkingEffort: z.string().optional(),
  maxOutputSize: z.number().int().min(0).optional(),
});

export type SubagentCompactionEntry = z.infer<typeof SubagentCompactionEntrySchema>;

export const SubagentCompactionConfigSchema = z.record(z.string(), SubagentCompactionEntrySchema);

export type SubagentCompactionConfig = z.infer<typeof SubagentCompactionConfigSchema>;

export const subagentCompactionFromToml = (rawSnake: unknown): unknown => {
  if (!isPlainObject(rawSnake)) return rawSnake;
  const out: Record<string, unknown> = {};
  for (const [profileName, entry] of Object.entries(rawSnake)) {
    if (!isPlainObject(entry)) {
      out[profileName] = entry;
      continue;
    }
    out[profileName] = transformPlainObject(entry);
  }
  return out;
};

export const subagentCompactionToToml = (value: unknown, rawSnake: unknown): unknown => {
  if (!isPlainObject(value)) return value;
  const rawSub = cloneRecord(rawSnake);
  const out: Record<string, unknown> = {};
  for (const [profileName, entry] of Object.entries(value)) {
    if (!isPlainObject(entry)) {
      out[profileName] = entry;
      continue;
    }
    const merged = cloneRecord(rawSub[profileName]);
    for (const [key, field] of Object.entries(entry)) {
      setDefined(merged, camelToSnake(key), field);
    }
    out[profileName] = merged;
  }
  return out;
};

registerConfigSection(SUBAGENT_COMPACTION_SECTION, SubagentCompactionConfigSchema, {
  fromToml: subagentCompactionFromToml,
  toToml: subagentCompactionToToml,
});
