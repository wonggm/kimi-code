import { describe, expect, it } from 'vitest';

import type { ManagedKimiConfigShape } from '../src/managed-kimi-code';
import {
  adaptBaseUrlForWire,
  applyModelsDevProvider,
  MODELS_DEV_URL,
  modelsDevEntry,
  modelsDevProviderModels,
  readModelsDevSource,
  resolveModelsDevImport,
  type ModelsDevCatalog,
} from '../src/models-dev';

describe('readModelsDevSource', () => {
  it('accepts a well-formed blob', () => {
    expect(readModelsDevSource({ kind: 'modelsDev', catalogId: 'opencode' })).toEqual({
      kind: 'modelsDev',
      catalogId: 'opencode',
    });
    expect(
      readModelsDevSource({ kind: 'modelsDev', catalogId: 'opencode', baseUrl: 'https://x.example' }),
    ).toEqual({ kind: 'modelsDev', catalogId: 'opencode', baseUrl: 'https://x.example' });
  });

  it('rejects other kinds and malformed blobs', () => {
    expect(readModelsDevSource(undefined)).toBeUndefined();
    expect(readModelsDevSource({ kind: 'apiJson', url: 'https://x.example', apiKey: '' })).toBeUndefined();
    expect(readModelsDevSource({ kind: 'modelsDev' })).toBeUndefined();
    expect(readModelsDevSource({ kind: 'modelsDev', catalogId: '' })).toBeUndefined();
    expect(readModelsDevSource({ kind: 'modelsDev', catalogId: 'x', baseUrl: 3 })).toBeUndefined();
  });
});

describe('applyModelsDevProvider', () => {
  const source = { kind: 'modelsDev', catalogId: 'opencode' } as const;

  it('rewrites aliases from upstream while preserving user fields and removing stale entries', () => {
    const config: ManagedKimiConfigShape = {
      providers: {
        opencode: {
          type: 'openai',
          baseUrl: 'https://old.example/v1',
          apiKey: 'sk-keep',
          myCustomField: 'keep-me',
        },
      },
      models: {
        'opencode/old-model': {
          provider: 'opencode',
          model: 'old-model',
          maxContextSize: 1000,
        },
        'opencode/new-model': {
          provider: 'opencode',
          model: 'new-model',
          maxContextSize: 1000,
          displayName: 'My Name Override',
        },
        unrelated: { provider: 'kimi', model: 'k2', maxContextSize: 1000 },
      },
      defaultModel: 'unrelated',
    };

    const entry = {
      id: 'opencode',
      name: 'OpenCode',
      api: 'https://api.opencode.example/v1',
      type: 'openai',
      models: {
        'new-model': { id: 'new-model', name: 'New Model', limit: { context: 262144 } },
        'other-model': { id: 'other-model', limit: { context: 131072, output: 8192 } },
      },
    };
    applyModelsDevProvider(config, 'opencode', 'openai', entry.api, modelsDevProviderModels(entry), source);

    expect(config.providers['opencode']).toEqual({
      type: 'openai',
      baseUrl: 'https://api.opencode.example/v1',
      apiKey: 'sk-keep',
      myCustomField: 'keep-me',
      source,
    });
    expect(config.models?.['opencode/old-model']).toBeUndefined();
    expect(config.models?.['opencode/new-model']).toMatchObject({
      provider: 'opencode',
      model: 'new-model',
      maxContextSize: 262144,
      capabilities: ['tool_use'],
      displayName: 'New Model',
    });
    expect(config.models?.['opencode/other-model']).toMatchObject({
      provider: 'opencode',
      model: 'other-model',
      maxContextSize: 131072,
      displayName: 'other-model',
    });
    expect(config.models?.['unrelated']).toBeDefined();
  });

  it('keeps the previous base URL when resolution has none', () => {
    const config: ManagedKimiConfigShape = {
      providers: { opencode: { type: 'openai', baseUrl: 'https://kept.example/v1' } },
      models: {},
    };
    applyModelsDevProvider(config, 'opencode', 'openai', undefined, [], source);
    expect(config.providers['opencode']?.baseUrl).toBe('https://kept.example/v1');
  });
});

describe('resolveModelsDevImport / modelsDevProviderModels', () => {
  const catalog: ModelsDevCatalog = {
    opencode: {
      id: 'opencode',
      name: 'OpenCode',
      api: 'https://api.opencode.example/v1',
      models: {
        'groovy-1': {
          id: 'groovy-1',
          name: 'Groovy 1',
          limit: { context: 200000, input: 180000, output: 32768 },
          tool_call: true,
          reasoning: true,
          reasoning_options: [{ type: 'effort', values: ['low', null, 'high'] }],
          modalities: { input: ['text', 'image'], output: ['text'] },
        },
        'embed-mini': { id: 'embed-mini', limit: { context: 8000 } },
      },
    },
  };

  it('resolves wire and endpoint from the entry', () => {
    const entry = modelsDevEntry(catalog, 'opencode');
    expect(entry).toBeDefined();
    const resolution = resolveModelsDevImport(entry!);
    expect(resolution).toMatchObject({
      kind: 'ok',
      wire: 'openai',
      baseUrl: 'https://api.opencode.example/v1',
    });
  });

  it('prefers a user-supplied base URL and adapts it for anthropic', () => {
    const entry = modelsDevEntry(catalog, 'opencode');
    expect(
      resolveModelsDevImport(entry!, 'https://proxy.example/v1'),
    ).toMatchObject({ kind: 'ok', baseUrl: 'https://proxy.example/v1' });
    expect(adaptBaseUrlForWire('https://proxy.example/v1', 'anthropic')).toBe(
      'https://proxy.example',
    );
  });

  it('filters unusable models and maps capability metadata', () => {
    const entry = modelsDevEntry(catalog, 'opencode');
    const models = modelsDevProviderModels(entry!);
    expect(models.map((model) => model.id)).toEqual(['groovy-1']);
    expect(models[0]).toMatchObject({
      supportEfforts: ['low', 'high'],
      offEffort: 'none',
      capability: {
        image_in: true,
        thinking: true,
        tool_use: true,
        max_context_tokens: 200000,
        max_input_tokens: 180000,
      },
    });
  });
});
