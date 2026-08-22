import { isRecord } from './utils';
import { mergeRefreshedModelAlias, MODELS_DEV_MODEL_FIELDS } from './model-alias-merge';
import type { ManagedKimiConfigShape, ManagedKimiModelAlias } from './managed-kimi-code';

/**
 * Canonical wire protocols a models.dev entry can resolve to. Mirrors the
 * kosong `ProviderType` union in agent-core-v2; kept structural here so this
 * package stays independent of the engine.
 */
export type ModelsDevWireType =
  | 'anthropic'
  | 'openai'
  | 'kimi'
  | 'google-genai'
  | 'openai_responses'
  | 'vertexai';

export interface ModelsDevCapability {
  readonly image_in: boolean;
  readonly video_in: boolean;
  readonly audio_in: boolean;
  readonly thinking: boolean;
  readonly tool_use: boolean;
  readonly max_context_tokens: number;
  readonly max_input_tokens?: number;
  readonly dynamically_loaded_tools?: boolean;
}

export interface ModelsDevModelEntry {
  readonly id?: string;
  readonly name?: string;
  readonly family?: string;
  readonly limit?: { readonly context?: number; readonly input?: number; readonly output?: number };
  readonly tool_call?: boolean;
  readonly reasoning?: boolean;
  readonly reasoning_options?: readonly ModelsDevReasoningOption[];
  readonly status?: string;
  readonly provider?: ModelsDevModelProviderOverride;
  readonly dynamically_loaded_tools?: boolean;
  readonly interleaved?: boolean | { readonly field?: string };
  readonly modalities?: {
    readonly input?: readonly string[];
    readonly output?: readonly string[];
  };
}

export interface ModelsDevReasoningOption {
  readonly type?: string;
  readonly values?: unknown;
}

export interface ModelsDevModelProviderOverride {
  readonly npm?: string;
  readonly api?: string;
}

export interface ModelsDevProviderEntry {
  readonly id?: string;
  readonly name?: string;
  readonly api?: string;
  readonly env?: readonly string[];
  readonly npm?: string;
  readonly type?: string;
  readonly models?: Record<string, ModelsDevModelEntry>;
}

export type ModelsDevCatalog = Record<string, ModelsDevProviderEntry>;

export interface ModelsDevModel {
  readonly id: string;
  readonly name?: string;
  readonly maxOutputSize?: number;
  readonly reasoningKey?: string;
  readonly supportEfforts?: readonly string[];
  readonly offEffort?: string;
  readonly alwaysThinking?: boolean;
  readonly protocol?: 'anthropic';
  readonly baseUrl?: string;
  readonly capability: ModelsDevCapability;
}

const KNOWN_WIRE_TYPES: readonly ModelsDevWireType[] = [
  'anthropic',
  'openai',
  'kimi',
  'google-genai',
  'openai_responses',
  'vertexai',
];

function isWireType(value: unknown): value is ModelsDevWireType {
  return typeof value === 'string' && (KNOWN_WIRE_TYPES as readonly string[]).includes(value);
}

function hasEmbeddingMarker(value: string | undefined): boolean {
  if (value === undefined) return false;
  const lower = value.toLowerCase();
  return lower.includes('embedding') || /(?:^|[-_/])embed(?:$|[-_/])/.test(lower);
}

function isUsableChatModel(model: ModelsDevModelEntry): boolean {
  const outputModalities = model.modalities?.output;
  if (outputModalities !== undefined && !outputModalities.includes('text')) return false;
  if (model.status === 'deprecated' || model.status === 'alpha') return false;
  return (
    !hasEmbeddingMarker(model.family) &&
    !hasEmbeddingMarker(model.id) &&
    !hasEmbeddingMarker(model.name)
  );
}

export type ModelsDevImportInvalidReason =
  | 'unknown-explicit-type'
  | 'proprietary-sdk'
  | 'empty-base-url'
  | 'placeholder-base-url';

export type ModelsDevImportResolution =
  | {
      readonly kind: 'ok';
      readonly wire: ModelsDevWireType;
      readonly guessed: boolean;
      readonly baseUrl?: string;
    }
  | {
      readonly kind: 'needs-base-url';
      readonly wire: ModelsDevWireType;
      readonly guessed: boolean;
    }
  | {
      readonly kind: 'invalid';
      readonly reason: ModelsDevImportInvalidReason;
    };

export function resolveModelsDevImport(
  entry: ModelsDevProviderEntry,
  userBaseUrl?: string,
): ModelsDevImportResolution {
  const wire = resolveModelsDevWire(entry);
  if (wire === undefined) {
    return {
      kind: 'invalid',
      reason:
        typeof entry.type === 'string' && entry.type.length > 0
          ? 'unknown-explicit-type'
          : 'proprietary-sdk',
    };
  }
  const guessed = inferDeclaredWireType(entry) === undefined;

  if (userBaseUrl !== undefined) {
    const trimmed = userBaseUrl.trim();
    if (trimmed.length === 0) return { kind: 'invalid', reason: 'empty-base-url' };
    if (trimmed.includes('${')) return { kind: 'invalid', reason: 'placeholder-base-url' };
    return { kind: 'ok', wire, guessed, baseUrl: adaptBaseUrlForWire(trimmed, wire) };
  }

  const catalogUrl = modelsDevBaseUrl(entry, wire);
  if (catalogUrl !== undefined) return { kind: 'ok', wire, guessed, baseUrl: catalogUrl };
  if (modelsDevEndpointRequired(entry, wire)) return { kind: 'needs-base-url', wire, guessed };
  return { kind: 'ok', wire, guessed };
}

function resolveModelsDevWire(entry: ModelsDevProviderEntry): ModelsDevWireType | undefined {
  if (isWireType(entry.type)) return entry.type;
  if (typeof entry.type === 'string' && entry.type.length > 0) return undefined;
  const declared = inferDeclaredWireType(entry);
  if (declared !== undefined) return declared;
  const npm = (entry.npm ?? '').toLowerCase();
  if (npm.includes('amazon-bedrock') || npm.includes('cohere')) return undefined;
  return 'openai';
}

function inferDeclaredWireType(entry: ModelsDevProviderEntry): ModelsDevWireType | undefined {
  if (isWireType(entry.type)) return entry.type;
  const npm = (entry.npm ?? '').toLowerCase();
  const id = (entry.id ?? '').toLowerCase();
  if (npm.includes('anthropic') || id.includes('anthropic') || id.includes('claude')) {
    return 'anthropic';
  }
  if (id.includes('vertex')) return 'vertexai';
  if (npm.includes('google') || id.includes('google') || id.includes('gemini')) {
    return 'google-genai';
  }
  if (npm.includes('openai') || id.includes('openai')) return 'openai';
  return undefined;
}

export function modelsDevBaseUrl(
  entry: ModelsDevProviderEntry,
  wire: ModelsDevWireType,
): string | undefined {
  const api = entry.api;
  if (typeof api !== 'string' || api.length === 0 || api.includes('${')) return undefined;
  return adaptBaseUrlForWire(api, wire);
}

export function adaptBaseUrlForWire(baseUrl: string, wire: ModelsDevWireType): string {
  return wire === 'anthropic' ? baseUrl.replace(/\/v1\/?$/, '') : baseUrl;
}

function modelsDevEndpointRequired(
  entry: ModelsDevProviderEntry,
  wire: ModelsDevWireType,
): boolean {
  if (typeof entry.api === 'string' && entry.api.length > 0) return true;
  const npm = (entry.npm ?? '').toLowerCase();
  if (wire === 'openai' || wire === 'openai_responses') return npm !== '@ai-sdk/openai';
  if (wire === 'anthropic') return npm !== '@ai-sdk/anthropic';
  return false;
}

export function modelsDevModelToCapability(model: ModelsDevModelEntry): ModelsDevModel | undefined {
  if (typeof model.id !== 'string' || model.id.length === 0) return undefined;
  const context = model.limit?.context;
  if (typeof context !== 'number' || !Number.isInteger(context) || context <= 0) return undefined;
  if (!isUsableChatModel(model)) return undefined;
  const inputs = model.modalities?.input ?? [];
  const output = model.limit?.output;
  const thinking = modelsDevThinkingOptions(model.reasoning_options);
  const input = model.limit?.input;
  const maxInputTokens =
    typeof input === 'number' && Number.isInteger(input) && input > 0
      ? Math.min(input, context)
      : undefined;
  return {
    id: model.id,
    name: typeof model.name === 'string' && model.name.length > 0 ? model.name : undefined,
    maxOutputSize: typeof output === 'number' && output > 0 ? output : undefined,
    reasoningKey: modelsDevReasoningKey(model.interleaved),
    supportEfforts: thinking.efforts,
    offEffort: thinking.offEffort,
    alwaysThinking: thinking.alwaysThinking,
    capability: {
      image_in: inputs.includes('image'),
      video_in: inputs.includes('video'),
      audio_in: inputs.includes('audio'),
      thinking:
        Boolean(model.reasoning) || thinking.efforts !== undefined || thinking.hasToggle,
      tool_use: model.tool_call ?? true,
      max_context_tokens: context,
      max_input_tokens: maxInputTokens,
      dynamically_loaded_tools: model.dynamically_loaded_tools === true,
    },
  };
}

function modelsDevThinkingOptions(options: ModelsDevModelEntry['reasoning_options']): {
  readonly efforts: readonly string[] | undefined;
  readonly offEffort: string | undefined;
  readonly hasToggle: boolean;
  readonly alwaysThinking: boolean | undefined;
} {
  if (!Array.isArray(options)) {
    return { efforts: undefined, offEffort: undefined, hasToggle: false, alwaysThinking: undefined };
  }
  let efforts: readonly string[] | undefined;
  let offEffort: string | undefined;
  let hasToggle = false;
  for (const option of options) {
    if (option?.type === 'toggle') {
      hasToggle = true;
      continue;
    }
    if (option?.type !== 'effort' || !Array.isArray(option.values)) continue;
    const hasNullTier = (option.values as unknown[]).some((value) => value === null);
    const levels = (option.values as unknown[]).filter(
      (value: unknown): value is string => typeof value === 'string' && value.length > 0,
    );
    const off = levels.find((value) => value.toLowerCase() === 'none');
    if (off !== undefined) offEffort = off;
    else if (hasNullTier) offEffort = 'none';
    const selectable = levels.filter((value) => value.toLowerCase() !== 'none');
    if (selectable.length > 0) efforts = selectable;
  }
  const alwaysThinking =
    efforts !== undefined && offEffort === undefined && !hasToggle ? true : undefined;
  return { efforts, offEffort, hasToggle, alwaysThinking };
}

function modelsDevReasoningKey(interleaved: ModelsDevModelEntry['interleaved']): string | undefined {
  if (typeof interleaved !== 'object' || interleaved === null) return undefined;
  const field = interleaved.field?.trim();
  return field !== undefined && field.length > 0 ? field : undefined;
}

// Protocols where thinking cannot be switched off entirely; an "always
// thinking" model on such a protocol keeps its plain `thinking` capability
// instead of an `always_thinking` marker.
function wireHasProtocolThinkingDisable(protocol: string | undefined): boolean {
  return protocol === 'anthropic' || protocol === 'kimi';
}

export function modelsDevProviderModels(entry: ModelsDevProviderEntry): ModelsDevModel[] {
  const providerWire = resolveModelsDevWire(entry);
  return Object.values(entry.models ?? {})
    .map((raw) => applyModelProviderOverride(modelsDevModelToCapability(raw), raw, entry, providerWire))
    .filter((model): model is ModelsDevModel => model !== undefined)
    .map((model) => {
      const protocol = model.protocol ?? providerWire;
      if (model.alwaysThinking === true && wireHasProtocolThinkingDisable(protocol)) {
        const { alwaysThinking: _dropped, ...rest } = model;
        return rest as ModelsDevModel;
      }
      return model;
    });
}

function applyModelProviderOverride(
  model: ModelsDevModel | undefined,
  raw: ModelsDevModelEntry,
  entry: ModelsDevProviderEntry,
  providerWire: ModelsDevWireType | undefined,
): ModelsDevModel | undefined {
  if (model === undefined) return undefined;
  const override = raw.provider;
  if (override === undefined) return model;
  const overrideNpm = typeof override.npm === 'string' ? override.npm.toLowerCase() : undefined;
  if (
    overrideNpm !== undefined &&
    (overrideNpm.includes('amazon-bedrock') || overrideNpm.includes('cohere'))
  ) {
    return undefined;
  }
  const overrideWire =
    overrideNpm !== undefined ? (inferOverrideWire(overrideNpm) ?? 'openai') : providerWire;
  if (overrideWire === undefined) return model;
  const rawApi = override.api;
  const api = rawApi ?? entry.api;
  const usableApi =
    typeof api === 'string' && api.length > 0 && !api.includes('${') ? api : undefined;

  if (overrideWire === providerWire) {
    if (typeof rawApi === 'string' && rawApi.includes('${')) return undefined;
    if (usableApi !== undefined && usableApi !== entry.api) {
      return { ...model, baseUrl: adaptBaseUrlForWire(usableApi, overrideWire) };
    }
    return model;
  }

  if (overrideWire === 'anthropic' && usableApi !== undefined) {
    return { ...model, protocol: 'anthropic', baseUrl: adaptBaseUrlForWire(usableApi, 'anthropic') };
  }
  return undefined;
}

function inferOverrideWire(npm: string): ModelsDevWireType | undefined {
  const normalized = npm.toLowerCase();
  if (normalized.includes('anthropic')) return 'anthropic';
  if (normalized.includes('vertex')) return 'vertexai';
  if (normalized.includes('google')) return 'google-genai';
  if (normalized.includes('openai')) return 'openai';
  return undefined;
}

export const MODELS_DEV_URL = 'https://models.dev/api.json';
const MODELS_DEV_FETCH_TIMEOUT_MS = 10_000;

export interface FetchModelsDevCatalogOptions {
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
  readonly userAgent?: string;
}

export async function fetchModelsDevCatalog(
  options: FetchModelsDevCatalogOptions = {},
): Promise<ModelsDevCatalog> {
  const { signal, fetchImpl = fetch, userAgent } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (userAgent !== undefined) headers['User-Agent'] = userAgent;

  const init: RequestInit = { headers };
  if (signal !== undefined) {
    init.signal = signal;
  } else {
    init.signal = AbortSignal.timeout(MODELS_DEV_FETCH_TIMEOUT_MS);
  }

  const response = await fetchImpl(MODELS_DEV_URL, init);
  if (!response.ok) {
    throw new Error(`Failed to fetch models.dev catalog at ${MODELS_DEV_URL} (HTTP ${response.status}).`);
  }
  const payload: unknown = await response.json();
  if (!isRecord(payload)) {
    throw new Error(`Unexpected models.dev catalog payload at ${MODELS_DEV_URL}.`);
  }
  return payload as ModelsDevCatalog;
}

/**
 * Identifies a provider whose model list is managed by the models.dev catalog.
 * Parked on the provider record by the `:import_catalog` flow; the refresh
 * dispatcher uses it to re-sync aliases from the catalog entry. `baseUrl`
 * records a user-supplied endpoint that must survive re-resolution.
 */
export interface ModelsDevSource {
  readonly kind: 'modelsDev';
  readonly catalogId: string;
  readonly baseUrl?: string;
}

export function readModelsDevSource(source: unknown): ModelsDevSource | undefined {
  if (typeof source !== 'object' || source === null) return undefined;
  const candidate = source as Record<string, unknown>;
  if (candidate['kind'] !== 'modelsDev') return undefined;
  const catalogId = candidate['catalogId'];
  if (typeof catalogId !== 'string' || catalogId.length === 0) return undefined;
  const baseUrl = candidate['baseUrl'];
  if (baseUrl !== undefined && typeof baseUrl !== 'string') return undefined;
  return baseUrl === undefined
    ? { kind: 'modelsDev', catalogId }
    : { kind: 'modelsDev', catalogId, baseUrl };
}

export function modelsDevEntry(
  catalog: ModelsDevCatalog,
  catalogId: string,
): ModelsDevProviderEntry | undefined {
  return Object.prototype.hasOwnProperty.call(catalog, catalogId)
    ? catalog[catalogId]
    : undefined;
}

function modelsDevCapabilitiesFor(model: ModelsDevModel): string[] | undefined {
  const capability = model.capability;
  const caps: string[] = [];
  if (capability.image_in) caps.push('image_in');
  if (capability.video_in) caps.push('video_in');
  if (capability.audio_in) caps.push('audio_in');
  if (capability.thinking) {
    caps.push(model.alwaysThinking === true ? 'always_thinking' : 'thinking');
  }
  if (capability.tool_use) caps.push('tool_use');
  if (capability.dynamically_loaded_tools === true) caps.push('dynamically_loaded_tools');
  return caps.length > 0 ? caps : undefined;
}

function modelsDevModelToAlias(providerId: string, model: ModelsDevModel): ManagedKimiModelAlias {
  const capabilities = modelsDevCapabilitiesFor(model);
  return {
    provider: providerId,
    model: model.id,
    maxContextSize: model.capability.max_context_tokens,
    ...(model.capability.max_input_tokens !== undefined
      ? { maxInputSize: model.capability.max_input_tokens }
      : {}),
    ...(capabilities !== undefined ? { capabilities } : {}),
    displayName: model.name ?? model.id,
    ...(model.reasoningKey !== undefined ? { reasoningKey: model.reasoningKey } : {}),
    ...(model.supportEfforts !== undefined ? { supportEfforts: [...model.supportEfforts] } : {}),
    ...(model.offEffort !== undefined ? { offEffort: model.offEffort } : {}),
    ...(model.protocol !== undefined ? { protocol: model.protocol } : {}),
    ...(model.baseUrl !== undefined ? { baseUrl: model.baseUrl } : {}),
  };
}

/**
 * Writes one models.dev catalog entry into the managed config in place. The
 * provider record is updated in place (credentials and any user-added fields
 * survive; `type`/`baseUrl`/`source` are refreshed), and each upstream model
 * becomes an alias under `config.models[\`${providerId}/${modelId}\`]` merged
 * field-by-field so user additions survive. Aliases the entry no longer lists
 * are removed.
 */
export function applyModelsDevProvider(
  config: ManagedKimiConfigShape,
  providerId: string,
  wire: ModelsDevWireType,
  baseUrl: string | undefined,
  models: readonly ModelsDevModel[],
  source: ModelsDevSource,
): void {
  const previous = config.providers[providerId];
  const previousRecord = isRecord(previous) ? previous : {};
  config.providers[providerId] = {
    ...previousRecord,
    type: wire,
    ...(baseUrl !== undefined
      ? { baseUrl }
      : typeof previousRecord['baseUrl'] === 'string'
        ? { baseUrl: previousRecord['baseUrl'] }
        : {}),
    source,
  };

  const existingModels = config.models ?? {};
  const upstreamKeys = new Set(models.map((model) => `${providerId}/${model.id}`));
  for (const [key, alias] of Object.entries(existingModels)) {
    if (isRecord(alias) && alias['provider'] === providerId && !upstreamKeys.has(key)) {
      delete existingModels[key];
    }
  }

  for (const model of models) {
    const aliasKey = `${providerId}/${model.id}`;
    const existing = isRecord(existingModels[aliasKey]) ? existingModels[aliasKey] : {};
    existingModels[aliasKey] = mergeRefreshedModelAlias(
      existing,
      modelsDevModelToAlias(providerId, model),
      MODELS_DEV_MODEL_FIELDS,
    );
  }

  config.models = existingModels;
}
