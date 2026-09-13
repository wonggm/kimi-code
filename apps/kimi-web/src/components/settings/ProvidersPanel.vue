<!-- apps/kimi-web/src/components/settings/ProvidersPanel.vue
     Settings → Providers, ported from upstream's panel: the same class
     vocabulary (pp / pp-head / pp-item / pp-row / pp-acc), the provider id +
     protocol badge + model count on the collapsed row, and the editor in the
     row's expandable body. The rows come from config.providers; GET /providers
     only supplies the protocol and the model count upstream reads from it. -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { getKimiWebApi } from '../../api';
import type { AppConfig, AppConfigProvider, AppProvider } from '../../api/types';
import { useCustomProviders } from '../../composables/useCustomProviders';
import Badge from '../ui/Badge.vue';
import Button from '../ui/Button.vue';
import Icon from '../ui/Icon.vue';

const props = defineProps<{
  config?: AppConfig | null;
  configSaving?: boolean;
}>();

const emit = defineEmits<{ updateConfig: [patch: Partial<AppConfig>] }>();

const { t } = useI18n();

const customProviders = useCustomProviders({
  config: () => props.config,
  updateConfig: (patch) => emit('updateConfig', patch),
});

const providerInfo = ref<Map<string, AppProvider>>(new Map());

const rows = computed(() =>
  customProviders.providers.map(([id, provider]) => {
    const info = providerInfo.value.get(id);
    return {
      id,
      provider,
      type: info?.type || provider.type,
      modelCount: info?.models?.length ?? provider.models?.length ?? 0,
    };
  }),
);

function toggleAdd(): void {
  if (customProviders.adding) customProviders.cancel();
  else customProviders.openAdd();
}

function toggleRow(id: string, provider: AppConfigProvider): void {
  if (customProviders.editingId === id) customProviders.cancel();
  else customProviders.openEdit(id, provider);
}

onMounted(async () => {
  try {
    const providers = await getKimiWebApi().listProviders();
    providerInfo.value = new Map(providers.map((provider) => [provider.id, provider]));
  } catch {
    // Enrichment only — the config rows render without the protocol and count.
  }
});
</script>

<template>
  <section class="pp">
    <div class="pp-head">
      <h3 class="pp-title">{{ t('settings.tabs.providers') }}</h3>
      <Button variant="secondary" size="sm" @click="toggleAdd">
        <Icon name="plus" size="sm" /> {{ t('providers.addProvider') }}
      </Button>
    </div>
    <div class="pp-group">
      <div v-if="customProviders.adding" class="pp-item pp-add-item open">
        <button type="button" class="pp-row pp-add-row" @click="customProviders.cancel">
          <span class="pp-add-label">{{ t('providers.addProvider') }}</span>
          <span class="grow"></span>
          <span class="pp-chev"><Icon name="chevron-right" size="sm" /></span>
        </button>
        <div class="pp-acc">
          <div class="pp-acc-in">
            <form class="provider-form" @submit.prevent="customProviders.save">
              <label class="provider-field">{{ t('settings.customProviderId') }}<input v-model="customProviders.form.id" :disabled="configSaving" autocomplete="off" /></label>
              <label class="provider-field">{{ t('settings.customProviderType') }}<input v-model="customProviders.form.type" :disabled="configSaving" autocomplete="off" /></label>
              <label class="provider-field">{{ t('settings.customProviderBaseUrl') }}<input v-model="customProviders.form.baseUrl" :disabled="configSaving" type="url" autocomplete="off" /></label>
              <label class="provider-field">{{ t('settings.customProviderApiKey') }}<input v-model="customProviders.form.apiKey" placeholder="••••••••" :disabled="configSaving" type="password" autocomplete="new-password" /></label>
              <label class="provider-field">{{ t('settings.customProviderModels') }}<input v-model="customProviders.form.models" :disabled="configSaving" :placeholder="t('settings.customProviderModelsPlaceholder')" autocomplete="off" /></label>
              <span v-if="customProviders.error" class="provider-error">{{ t(`settings.customProviderError.${customProviders.error}`) }}</span>
              <div class="actions"><Button type="submit" variant="primary" size="sm" :disabled="configSaving">{{ t('settings.customProviderSave') }}</Button><Button type="button" variant="secondary" size="sm" @click="customProviders.cancel">{{ t('common.cancel') }}</Button></div>
            </form>
          </div>
        </div>
      </div>
      <div v-else-if="rows.length === 0" class="pp-empty">{{ t('providers.empty') }}</div>
      <div
        v-for="row in rows"
        :key="row.id"
        class="pp-item"
        :class="{ open: customProviders.editingId === row.id }"
      >
        <button type="button" class="pp-row" @click="toggleRow(row.id, row.provider)">
          <div class="grow">
            <span class="pp-id">{{ row.id }}</span>
            <Badge v-if="row.type" variant="neutral" size="sm">{{ row.type }}</Badge>
          </div>
          <span class="pp-count">{{ t('providers.modelCount', { count: row.modelCount }) }}</span>
          <span class="pp-chev"><Icon name="chevron-right" size="sm" /></span>
        </button>
        <div class="pp-acc">
          <div class="pp-acc-in">
            <div v-if="customProviders.editingId === row.id" class="provider-edit">
              <form class="provider-form" @submit.prevent="customProviders.save">
                <label class="provider-field">{{ t('settings.customProviderId') }}<input v-model="customProviders.form.id" disabled autocomplete="off" /></label>
                <label class="provider-field">{{ t('settings.customProviderType') }}<input v-model="customProviders.form.type" :disabled="configSaving" autocomplete="off" /></label>
                <label class="provider-field">{{ t('settings.customProviderBaseUrl') }}<input v-model="customProviders.form.baseUrl" :disabled="configSaving" type="url" autocomplete="off" /></label>
                <label class="provider-field">{{ t('settings.customProviderApiKey') }}<input v-model="customProviders.form.apiKey" placeholder="••••••••" :disabled="configSaving" type="password" autocomplete="new-password" /></label>
                <label class="provider-field">{{ t('settings.customProviderModels') }}<input v-model="customProviders.form.models" :disabled="configSaving" :placeholder="t('settings.customProviderModelsPlaceholder')" autocomplete="off" /></label>
                <span v-if="customProviders.error" class="provider-error">{{ t(`settings.customProviderError.${customProviders.error}`) }}</span>
                <div class="actions">
                  <Button type="submit" variant="primary" size="sm" :disabled="configSaving">{{ t('settings.customProviderSave') }}</Button>
                  <Button type="button" variant="secondary" size="sm" @click="customProviders.cancel">{{ t('common.cancel') }}</Button>
                  <Button type="button" variant="danger-soft" size="sm" :disabled="configSaving" @click="customProviders.remove(row.id)">{{ t('settings.customProviderRemove') }}</Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.pp { display: flex; flex-direction: column; }
.pp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.pp-title {
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  color: var(--color-text);
}
.pp-group {
  overflow: hidden;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-xl);
  background: var(--color-surface-raised);
}
.pp-group > * + * { border-top: 1px solid var(--color-line); }
.pp-item.open > .pp-row { background: var(--color-surface-sunken); }
.pp-item.open .pp-chev { transform: rotate(90deg); }
.pp-item.open > .pp-acc { grid-template-rows: 1fr; }
.pp-item.open .pp-acc-in { overflow: visible; }
.pp-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 40px;
  padding: var(--space-2) var(--space-4);
  border: none;
  background: transparent;
  text-align: left;
  font-family: var(--font-ui);
  color: var(--color-text);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out);
}
.pp-row:hover { background: var(--color-hover); }
.pp-row .grow { flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--space-2); }
.pp-add-row { gap: var(--space-2); color: var(--color-text); font-size: var(--text-base); font-weight: var(--weight-medium); }
.pp-id {
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pp-count { flex: none; font-size: var(--text-xs); color: var(--color-text-faint); white-space: nowrap; }
.pp-chev { display: inline-flex; flex: none; color: var(--color-text-faint); transition: transform var(--duration-base) var(--ease-out); }
.pp-acc { display: grid; grid-template-rows: 0fr; transition: grid-template-rows var(--duration-slow) var(--ease-out); }
.pp-acc-in { overflow: hidden; min-height: 0; }
.pp-empty {
  padding: var(--space-5) var(--space-4);
  color: var(--color-text-faint);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  text-align: center;
}
.provider-edit { padding: 0 var(--space-4) var(--space-4); }
.actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); }
.provider-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  padding: 0 var(--space-4) var(--space-4);
}
.provider-edit .provider-form { padding: 0; }
.provider-field { display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--text-sm); color: var(--color-text-muted); }
.provider-field input {
  height: 36px;
  padding: 0 var(--space-2);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
  color: var(--color-text);
  font: inherit;
}
.provider-field input:focus { outline: none; border-color: var(--color-accent); box-shadow: var(--p-focus-ring); }
.provider-error { color: var(--color-danger); font-size: var(--text-sm); }
.provider-form .actions { grid-column: 1 / -1; }
</style>
