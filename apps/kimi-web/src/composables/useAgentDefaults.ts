// apps/kimi-web/src/composables/useAgentDefaults.ts
// Shared "Agent defaults" logic behind the desktop Settings Agent tab and the
// mobile settings sheet's Agent sub-view: default model, per-profile subagent
// model/effort pins (v2 backend only), default permission / thinking / plan
// mode, merge-skills, and the compaction threshold. All reads go through the
// daemon config (`GET /api/v1/config`); every setter emits a config patch for
// the caller to POST.
import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AgentProfileInfo, AppConfig, AppModel, AppSubagentCompactionEntry } from '../api/types';
import { getKimiWebApi } from '../api';
import {
  effortLabel,
  modelThinkingInfoFromConfig,
  representativeModelForSubagent,
  subagentEffortOptions,
  type ModelThinkingInfo,
} from '../lib/modelThinking';

export const PERMISSION_MODES = ['manual', 'yolo', 'auto'] as const;
export type DefaultPermissionMode = (typeof PERMISSION_MODES)[number];

export interface UseAgentDefaultsOptions {
  config: MaybeRefOrGetter<AppConfig | null | undefined>;
  models: MaybeRefOrGetter<AppModel[] | undefined>;
  backend: MaybeRefOrGetter<'v1' | 'v2' | undefined>;
  updateConfig: (patch: Partial<AppConfig>) => void;
}

export function useAgentDefaults(opts: UseAgentDefaultsOptions) {
  const { t } = useI18n();
  const config = computed(() => toValue(opts.config));
  const models = computed(() => toValue(opts.models) ?? []);
  const backend = computed(() => toValue(opts.backend));

  // Reuse the Composer's permission labels (status.permission*) so the
  // default-permission names stay in sync with the toolbar.
  const permissionLabelKey: Record<DefaultPermissionMode, string> = {
    manual: 'status.permissionManual',
    auto: 'status.permissionAuto',
    yolo: 'status.permissionYolo',
  };

  type ModelOption = { id: string; label: string; provider: string };

  const modelOptions = computed<ModelOption[]>(() => {
    const byId = new Map<string, ModelOption>();
    for (const model of models.value) {
      byId.set(model.id, {
        id: model.id,
        label: model.displayName ?? model.model ?? model.id,
        provider: model.provider,
      });
    }
    for (const [id, raw] of Object.entries(config.value?.models ?? {})) {
      if (byId.has(id)) continue;
      const provider = extractConfigModelProvider(raw);
      byId.set(id, {
        id,
        label: formatConfigModelLabel(id, raw, provider),
        provider: provider ?? id,
      });
    }
    return Array.from(byId.values());
  });

  const modelGroups = computed<Array<{ provider: string; options: ModelOption[] }>>(() => {
    const map = new Map<string, ModelOption[]>();
    for (const option of modelOptions.value) {
      const list = map.get(option.provider) ?? [];
      list.push(option);
      map.set(option.provider, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.label.localeCompare(b.label));
    }
    return Array.from(map.entries())
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([provider, options]) => ({ provider, options }));
  });

  // MenuSelect shape — [{ label?, options: [{ value, label }] }]. modelGroups is
  // already provider-grouped; just project the fields. Used by both the default-
  // model picker and the per-profile subagent picker.
  function toMenuGroups(
    groups: Array<{ provider: string; options: ModelOption[] }>,
  ): { label: string; options: { value: string; label: string }[] }[] {
    return groups.map((g) => ({
      label: g.provider,
      options: g.options.map((m) => ({ value: m.id, label: m.label })),
    }));
  }

  const defaultModelGroups = computed(() => toMenuGroups(modelGroups.value));

  // The global subagent-model picker lists models only: an unset value is its
  // placeholder state (`settings.noSecondaryModel`), so it carries no inherit
  // entry of its own.
  const secondaryModelGroups = computed(() => toMenuGroups(modelGroups.value));

  // Subagent pins get an unlabeled leading "Inherit (session model)" row whose
  // value is '' (setSubagentModel treats '' the same as null: delete the key).
  const subagentModelGroups = computed(() => [
    { options: [{ value: '', label: t('settings.inheritSessionModel') }] },
    ...toMenuGroups(modelGroups.value),
  ]);

  function modelThinkingInfoForAlias(alias: string | undefined): ModelThinkingInfo | undefined {
    if (alias === undefined) return undefined;
    const catalogModel = models.value.find((model) => model.id === alias);
    if (catalogModel !== undefined) return catalogModel;
    return modelThinkingInfoFromConfig(config.value?.models?.[alias]);
  }

  function representativeModelFor(profile: AgentProfileInfo): ModelThinkingInfo | undefined {
    const cfg = config.value;
    const secondary = cfg?.secondaryModel;
    return representativeModelForSubagent(
      profile.modelPreference,
      cfg?.subagentModels?.[profile.name],
      modelThinkingInfoForAlias(cfg?.defaultModel),
      modelThinkingInfoForAlias(secondary?.model) ?? secondary,
      (alias) => modelThinkingInfoForAlias(alias),
    );
  }

  function subagentEffortGroups(
    profile: AgentProfileInfo,
    modelAlias = config.value?.subagentModels?.[profile.name] ?? '',
  ): { options: { value: string; label: string }[] }[] {
    const storedEffort = config.value?.subagentEfforts?.[profile.name];
    const representative = modelAlias === ''
      ? representativeModelFor(profile)
      : modelThinkingInfoForAlias(modelAlias);
    return [
      {
        options: [
          { value: '', label: t('settings.inheritSubagentEffort') },
          ...subagentEffortOptions(representative, storedEffort).map((effort) => ({
            value: effort,
            label: effort === storedEffort && !representative?.supportEfforts?.includes(effort)
              ? `${effortLabel(effort)} (${t('settings.unsupportedEffort')})`
              : effortLabel(effort),
          })),
        ],
      },
    ];
  }

  function effortGroupsForProfile(profile: AgentProfileInfo, modelAlias: string): { options: { value: string; label: string }[] }[] {
    return subagentEffortGroups(profile, modelAlias);
  }

  // Global subagent-model default (`[secondary_model]`): the model every
  // unpinned subagent uses. Empty alias means the subagent inherits the primary
  // model, which is what the picker's placeholder shows.
  const secondaryModelAlias = computed(() => config.value?.secondaryModel?.model ?? '');
  const secondaryModelEffort = computed(() => config.value?.secondaryModel?.defaultEffort ?? '');

  function secondaryEffortGroups(modelAlias: string): { options: { value: string; label: string }[] }[] {
    const stored = config.value?.secondaryModel;
    // With no alias pinned, the stored entry is the only description of what
    // subagents run, so its capability block stays the reference.
    const representative = modelAlias === '' ? stored : modelThinkingInfoForAlias(modelAlias);
    return [
      {
        options: [
          { value: '', label: t('settings.secondaryModelEffortAuto') },
          ...subagentEffortOptions(representative, stored?.defaultEffort).map((effort) => ({
            value: effort,
            label: effortLabel(effort),
          })),
        ],
      },
    ];
  }

  function setSecondaryModel(alias: string, effort?: string): void {
    const nextEffort = effort ?? secondaryModelEffort.value;
    if (alias === secondaryModelAlias.value && nextEffort === secondaryModelEffort.value) return;
    // The API rejects null, so an unset effort is an absent key.
    opts.updateConfig({
      secondaryModel: nextEffort ? { model: alias, defaultEffort: nextEffort } : { model: alias },
    });
  }

  const defaultPermissionMode = computed<DefaultPermissionMode>(() => {
    const mode = config.value?.defaultPermissionMode;
    return mode === 'auto' || mode === 'yolo' || mode === 'manual' ? mode : 'manual';
  });

  function extractConfigModelProvider(raw: unknown): string | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const source = raw as Record<string, unknown>;
    const provider = typeof source['provider'] === 'string' ? source['provider'] : undefined;
    return provider;
  }

  function formatConfigModelLabel(id: string, raw: unknown, provider?: string): string {
    if (!raw || typeof raw !== 'object') return id;
    const source = raw as Record<string, unknown>;
    const model = typeof source['model'] === 'string' ? source['model'] : undefined;
    const resolvedProvider = provider ?? extractConfigModelProvider(raw);
    if (model && resolvedProvider) return `${id} (${resolvedProvider}/${model})`;
    if (model) return `${id} (${model})`;
    return id;
  }

  function configBool(value: boolean | undefined): boolean {
    return value === true;
  }

  function setDefaultModel(value: string): void {
    if (!value || value === config.value?.defaultModel) return;
    opts.updateConfig({ defaultModel: value });
  }

  // Per-profile subagent model pin. Copies the current table and sets or deletes
  // the key — the backend Zod schema rejects null values, so an unpinned profile
  // is an absent key, and the full updated table (possibly {}) is sent.
  function setSubagentModel(profileName: string, alias: string | null): void {
    const table = { ...(config.value?.subagentModels ?? {}) };
    if (alias === null || alias === '') delete table[profileName];
    else table[profileName] = alias;
    opts.updateConfig({ subagentModels: table });
  }

  function setSubagentEffort(profileName: string, effort: string | null): void {
    const table = { ...(config.value?.subagentEfforts ?? {}) };
    if (effort === null || effort === '') delete table[profileName];
    else table[profileName] = effort;
    opts.updateConfig({ subagentEfforts: table });
  }

  // Per-profile compaction overrides (`[subagent_compaction]` on disk). A null
  // value deletes the profile's whole entry (inherit the global `[loop_control]`
  // values); a partial entry merges onto the existing one so setting one field
  // never drops the other, and undefined fields remove themselves.
  function setSubagentCompaction(
    profileName: string,
    value: Partial<AppSubagentCompactionEntry> | null,
  ): void {
    const table = { ...(config.value?.subagentCompaction ?? {}) };
    if (value === null) {
      delete table[profileName];
    } else {
      const merged: AppSubagentCompactionEntry = { ...(table[profileName] ?? {}) };
      if (value.triggerRatio === undefined) delete merged.triggerRatio;
      else merged.triggerRatio = value.triggerRatio;
      if (value.reservedContextSize === undefined) delete merged.reservedContextSize;
      else merged.reservedContextSize = value.reservedContextSize;
      if (Object.keys(merged).length === 0) delete table[profileName];
      else table[profileName] = merged;
    }
    opts.updateConfig({ subagentCompaction: table });
  }

  function subagentCompactionFor(profileName: string): AppSubagentCompactionEntry | undefined {
    return config.value?.subagentCompaction?.[profileName];
  }

  function subagentTriggerRatioPercent(profileName: string): string {
    const ratio = subagentCompactionFor(profileName)?.triggerRatio;
    return ratio === undefined ? '' : String(Math.round(ratio * 100));
  }

  function subagentReservedSize(profileName: string): string {
    const size = subagentCompactionFor(profileName)?.reservedContextSize;
    return size === undefined ? '' : String(size);
  }

  // Per-profile trigger-ratio input, whole percent, clamped to the schema range
  // 50–99 like the global threshold; empty clears the field (inherit global).
  function setSubagentTriggerRatio(profileName: string, raw: string): void {
    const trimmed = raw.trim();
    if (trimmed === '') {
      setSubagentCompaction(profileName, { triggerRatio: undefined });
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(99, Math.max(50, Math.round(parsed)));
    setSubagentCompaction(profileName, { triggerRatio: clamped / 100 });
  }

  // Per-profile reserved-size input, non-negative integer tokens; empty clears
  // the field (inherit global).
  function setSubagentReservedSize(profileName: string, raw: string): void {
    const trimmed = raw.trim();
    if (trimmed === '') {
      setSubagentCompaction(profileName, { reservedContextSize: undefined });
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setSubagentCompaction(profileName, { reservedContextSize: Math.round(parsed) });
  }

  function setDefaultPermissionMode(mode: DefaultPermissionMode): void {
    if (mode === defaultPermissionMode.value) return;
    opts.updateConfig({ defaultPermissionMode: mode });
  }

  function toggleConfigBoolean(key: 'defaultPlanMode' | 'mergeAllAvailableSkills'): void {
    const current = config.value?.[key];
    opts.updateConfig({ [key]: !configBool(current) } as Partial<AppConfig>);
  }

  // Context compaction triggers at `compactionTriggerRatio` of the model's
  // context window (engine default 0.85, schema range 0.5–0.99). Callers show
  // it as a whole percentage and commit on `change` (blur/Enter) so
  // intermediate keystrokes never hit POST /config.
  const DEFAULT_COMPACTION_TRIGGER_RATIO = 0.85;

  const compactionThresholdPercent = computed(() =>
    Math.round((config.value?.loopControl?.compactionTriggerRatio ?? DEFAULT_COMPACTION_TRIGGER_RATIO) * 100),
  );

  function setCompactionThreshold(raw: string): void {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(99, Math.max(50, Math.round(parsed)));
    if (clamped === compactionThresholdPercent.value) return;
    opts.updateConfig({ loopControl: { compactionTriggerRatio: clamped / 100 } });
  }

  // "Default thinking" lives at config.thinking.enabled on the daemon — the legacy
  // top-level defaultThinking field was removed. Read/write it there so the toggle
  // actually persists (the old field was silently stripped by the server).
  //
  // Mirror the core resolver: thinking is on unless explicitly disabled
  // (enabled === false). An absent thinking section — or one with an effort but no
  // enabled field — falls through to the model/default effort (on for
  // thinking-capable models), so the toggle reflects that as on.
  function thinkingEnabled(): boolean {
    const thinking = config.value?.thinking;
    if (!thinking || typeof thinking !== 'object') return true;
    return (thinking as { enabled?: boolean }).enabled !== false;
  }

  function toggleDefaultThinking(): void {
    opts.updateConfig({ thinking: { enabled: !thinkingEnabled() } } as Partial<AppConfig>);
  }

  // Subagent-model pins (v2 backend only) — the profile catalog comes from
  // GET /agent_profiles, fetched once when the Agent view first shows. On error
  // (or a v1 backend, which lacks the route) the section stays hidden.
  const agentProfiles = ref<AgentProfileInfo[] | null>(null);
  let agentProfilesLoaded = false;

  async function loadAgentProfiles(): Promise<void> {
    if (agentProfilesLoaded || backend.value !== 'v2') return;
    agentProfilesLoaded = true;
    try {
      agentProfiles.value = await getKimiWebApi().listAgentProfiles();
    } catch (err) {
      console.warn('loadAgentProfiles failed', err);
    }
  }

  return {
    config,
    modelGroups,
    defaultModelGroups,
    secondaryModelGroups,
    subagentModelGroups,
    effortGroupsForProfile,
    secondaryModelAlias,
    secondaryModelEffort,
    secondaryEffortGroups,
    setSecondaryModel,
    defaultPermissionMode,
    permissionLabelKey,
    configBool,
    setDefaultModel,
    setSubagentModel,
    setSubagentEffort,
    setSubagentCompaction,
    subagentCompactionFor,
    subagentTriggerRatioPercent,
    subagentReservedSize,
    setSubagentTriggerRatio,
    setSubagentReservedSize,
    setDefaultPermissionMode,
    toggleConfigBoolean,
    compactionThresholdPercent,
    setCompactionThreshold,
    thinkingEnabled,
    toggleDefaultThinking,
    agentProfiles,
    loadAgentProfiles,
  };
}
