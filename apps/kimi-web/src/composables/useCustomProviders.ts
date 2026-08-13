import { computed, reactive, ref, toValue, type MaybeRefOrGetter } from 'vue';
import type { AppConfig, AppConfigProvider } from '../api/types';

export interface CustomProviderForm {
  id: string;
  type: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  models: string;
}

export interface UseCustomProvidersOptions {
  config: MaybeRefOrGetter<AppConfig | null | undefined>;
  updateConfig: (patch: Partial<AppConfig>) => void;
}

export function useCustomProviders(opts: UseCustomProvidersOptions) {
  const config = computed(() => toValue(opts.config));
  const editingId = ref<string | null>(null);
  const adding = ref(false);
  const form = reactive<CustomProviderForm>(emptyForm());
  const error = ref('');

  const providers = computed(() => Object.entries(config.value?.providers ?? {}));

  function emptyForm(): CustomProviderForm {
    return { id: '', type: 'openai', baseUrl: '', apiKey: '', defaultModel: '', models: '' };
  }

  function openAdd(): void {
    Object.assign(form, emptyForm());
    editingId.value = null;
    adding.value = true;
    error.value = '';
  }

  function openEdit(id: string, provider: AppConfigProvider): void {
    Object.assign(form, {
      id,
      type: provider.type || 'openai',
      baseUrl: provider.baseUrl ?? '',
      // The config endpoint intentionally redacts the credential. An empty
      // value means keep the existing credential when the backend supports it.
      apiKey: '',
      defaultModel: provider.defaultModel ?? '',
      models: provider.models?.join(', ') ?? '',
    });
    editingId.value = id;
    adding.value = false;
    error.value = '';
  }

  function cancel(): void {
    editingId.value = null;
    adding.value = false;
    error.value = '';
  }

  function save(): void {
    const id = form.id.trim();
    if (!id) { error.value = 'id'; return; }
    if (adding.value && providers.value.some(([key]) => key === id)) {
      error.value = 'duplicate';
      return;
    }
    const next: Record<string, AppConfigProvider> = {};
    for (const [key, provider] of providers.value) {
      if (key !== editingId.value && key !== id) next[key] = provider;
    }
    const provider: AppConfigProvider = {
      type: form.type.trim() || 'openai',
      baseUrl: form.baseUrl.trim() || undefined,
      defaultModel: form.defaultModel.trim() || undefined,
      models: form.models.split(',').map((model) => model.trim()).filter(Boolean),
      hasApiKey: form.apiKey.trim().length > 0 || (editingId.value !== null && providers.value.find(([key]) => key === editingId.value)?.[1].hasApiKey === true),
      ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : undefined),
    };
    next[id] = provider;
    opts.updateConfig({ providers: next });
    editingId.value = null;
    adding.value = false;
  }

  function remove(id: string): void {
    const next: Record<string, AppConfigProvider> = {};
    for (const [key, provider] of providers.value) {
      if (key !== id) next[key] = provider;
    }
    opts.updateConfig({ providers: next });
    if (editingId.value === id) cancel();
  }

  return reactive({ providers, editingId, adding, form, error, openAdd, openEdit, cancel, save, remove });
}
