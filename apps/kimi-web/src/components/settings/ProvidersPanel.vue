<!-- apps/kimi-web/src/components/settings/ProvidersPanel.vue
     Settings → Providers. The fork's own custom-provider manager (add / edit /
     remove OpenAI-compatible providers), lifted out of the Agent tab so the
     settings nav carries upstream's Providers tab. Upstream's tab is a
     catalogue-driven manager; this one edits config.providers directly. -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { AppConfig } from '../../api/types';
import { useCustomProviders } from '../../composables/useCustomProviders';
import Button from '../ui/Button.vue';

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
</script>

<template>
  <section class="sec">
    <div class="sec-head">
      <h3 class="sec-title">{{ t('settings.customProviders') }}</h3>
      <Button variant="primary" size="sm" :disabled="configSaving" @click="customProviders.openAdd">{{ t('settings.customProviderAdd') }}</Button>
    </div>
    <p class="hint provider-desc">{{ t('settings.customProvidersHint') }}</p>
    <div v-if="!config" class="empty-config">{{ t('settings.configUnavailable') }}</div>
    <div v-else-if="customProviders.providers.length === 0 && !customProviders.adding" class="provider-empty">{{ t('settings.customProvidersEmpty') }}</div>
    <div v-else class="provider-list">
      <div v-for="[id, provider] in customProviders.providers" :key="id" class="provider-card">
        <div class="provider-card-main">
          <strong>{{ id }}</strong>
          <span class="hint">{{ provider.type }} · {{ provider.baseUrl || t('settings.customProviderNoUrl') }}</span>
          <span class="hint">{{ provider.hasApiKey ? t('settings.customProviderKeySet') : t('settings.customProviderKeyMissing') }}<template v-if="provider.models?.length"> · {{ t('settings.customProviderModelCount', { count: provider.models.length }) }}</template></span>
        </div>
        <div class="actions">
          <Button variant="secondary" size="sm" :disabled="configSaving" @click="customProviders.openEdit(id, provider)">{{ t('settings.customProviderEdit') }}</Button>
          <Button variant="danger-soft" size="sm" :disabled="configSaving" @click="customProviders.remove(id)">{{ t('settings.customProviderRemove') }}</Button>
        </div>
        <form v-if="customProviders.editingId === id" class="provider-form" @submit.prevent="customProviders.save">
          <label class="provider-field">{{ t('settings.customProviderId') }}<input v-model="customProviders.form.id" disabled autocomplete="off" /></label>
          <label class="provider-field">{{ t('settings.customProviderType') }}<input v-model="customProviders.form.type" :disabled="configSaving" autocomplete="off" /></label>
          <label class="provider-field">{{ t('settings.customProviderBaseUrl') }}<input v-model="customProviders.form.baseUrl" :disabled="configSaving" type="url" autocomplete="off" /></label>
          <label class="provider-field">{{ t('settings.customProviderApiKey') }}<input v-model="customProviders.form.apiKey" placeholder="••••••••" :disabled="configSaving" type="password" autocomplete="new-password" /></label>
          <label class="provider-field">{{ t('settings.customProviderModels') }}<input v-model="customProviders.form.models" :disabled="configSaving" :placeholder="t('settings.customProviderModelsPlaceholder')" autocomplete="off" /></label>
          <span v-if="customProviders.error" class="provider-error">{{ t(`settings.customProviderError.${customProviders.error}`) }}</span>
          <div class="actions"><Button type="submit" variant="primary" size="sm" :disabled="configSaving">{{ t('settings.customProviderSave') }}</Button><Button type="button" variant="secondary" size="sm" @click="customProviders.cancel">{{ t('common.cancel') }}</Button></div>
        </form>
      </div>
    </div>
    <span v-if="customProviders.error && !customProviders.adding && customProviders.editingId === null" class="provider-error">{{ t(`settings.customProviderError.${customProviders.error}`) }}</span>
    <form v-if="customProviders.adding" class="provider-form" @submit.prevent="customProviders.save">
      <label class="provider-field">{{ t('settings.customProviderId') }}<input v-model="customProviders.form.id" :disabled="configSaving" autocomplete="off" /></label>
      <label class="provider-field">{{ t('settings.customProviderType') }}<input v-model="customProviders.form.type" :disabled="configSaving" autocomplete="off" /></label>
      <label class="provider-field">{{ t('settings.customProviderBaseUrl') }}<input v-model="customProviders.form.baseUrl" :disabled="configSaving" type="url" autocomplete="off" /></label>
      <label class="provider-field">{{ t('settings.customProviderApiKey') }}<input v-model="customProviders.form.apiKey" placeholder="••••••••" :disabled="configSaving" type="password" autocomplete="new-password" /></label>
      <label class="provider-field">{{ t('settings.customProviderModels') }}<input v-model="customProviders.form.models" :disabled="configSaving" :placeholder="t('settings.customProviderModelsPlaceholder')" autocomplete="off" /></label>
      <span v-if="customProviders.error" class="provider-error">{{ t(`settings.customProviderError.${customProviders.error}`) }}</span>
      <div class="actions"><Button type="submit" variant="primary" size="sm" :disabled="configSaving">{{ t('settings.customProviderSave') }}</Button><Button type="button" variant="secondary" size="sm" @click="customProviders.cancel">{{ t('common.cancel') }}</Button></div>
    </form>
  </section>
</template>

<style scoped>
/* Shared settings-panel rules repeated here because scoped styles do not
   cross the component boundary; the provider-specific rules moved with the
   markup out of SettingsDialog. */
.sec { padding: var(--space-4) 0; border-bottom: 1px solid var(--color-line); }
.sec:last-child { border-bottom: none; }
.sec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.sec-title {
  margin: 0 0 var(--space-3);
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.sec-head .sec-title { margin-bottom: 0; }
.hint { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--color-text-faint); }
.empty-config {
  font-family: var(--font-ui);
  font-size: var(--text-base);
  color: var(--color-text-muted);
  padding: var(--space-1) 0;
}
.actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); }
.provider-desc { margin: calc(var(--space-3) * -1) 0 var(--space-3); }
.provider-empty { padding: var(--space-4); border: 1px solid var(--color-line); border-radius: var(--radius-md); color: var(--color-text-faint); text-align: center; }
.provider-list { display: flex; flex-direction: column; gap: var(--space-2); }
.provider-card { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--color-line); border-radius: var(--radius-md); }
.provider-card-main { min-width: 0; display: flex; flex-direction: column; gap: var(--space-1); overflow: hidden; }
.provider-card-main strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.provider-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); margin-top: var(--space-3); padding: var(--space-3); border: 1px solid var(--color-line); border-radius: var(--radius-md); }
.provider-field { display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--text-sm); color: var(--color-text-muted); }
.provider-field input { height: 36px; padding: 0 var(--space-2); border: 1px solid var(--color-line); border-radius: var(--radius-md); background: var(--color-surface-raised); color: var(--color-text); font: inherit; }
.provider-field input:focus { outline: none; border-color: var(--color-accent); box-shadow: var(--p-focus-ring); }
.provider-error { color: var(--color-danger); font-size: var(--text-sm); }
.provider-form .actions { grid-column: 1 / -1; }
</style>
