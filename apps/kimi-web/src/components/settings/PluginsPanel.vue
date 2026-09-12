<!-- apps/kimi-web/src/components/settings/PluginsPanel.vue
     Settings → Plugins, ported from upstream's panel: same class vocabulary,
     same sections (Official / Third-party / Installed), same row actions
     (Update / Switch / trash, Install) and the same capability line
     ("GitHub · 1 skill · 1 MCP server · 1 hook · 1 command"). Data comes from
     the fork's own client — GET /plugins, GET /plugins/marketplace, and the
     action-suffix routes for enable / disable / remove / install. -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { getKimiWebApi } from '../../api';
import type { AppPlugin, AppPluginMarketplaceEntry } from '../../api/types';
import Button from '../ui/Button.vue';
import EmptyState from '../ui/EmptyState.vue';
import Icon from '../ui/Icon.vue';
import IconButton from '../ui/IconButton.vue';
import Input from '../ui/Input.vue';
import Spinner from '../ui/Spinner.vue';
import Switch from '../ui/Switch.vue';

const { t } = useI18n();

const installed = ref<AppPlugin[]>([]);
const entries = ref<AppPluginMarketplaceEntry[]>([]);
const loading = ref(true);
const loaded = ref(false);
const error = ref<string | null>(null);
const customOpen = ref(false);
const customSource = ref('');
const busy = ref<string | null>(null);
const rowErrors = ref<Record<string, string>>({});

const installedById = computed(() => new Map(installed.value.map((plugin) => [plugin.id, plugin])));

/** Marketplace entries with their install state folded in, as upstream does. */
const catalogue = computed<AppPluginMarketplaceEntry[]>(() =>
  entries.value.map((entry) => {
    const current = installedById.value.get(entry.id);
    if (!current) return { ...entry, installed: undefined, updateAvailable: undefined };
    const versionDiverges =
      current.version !== undefined && entry.version !== undefined && current.version !== entry.version;
    return {
      ...entry,
      installed: { version: current.version, enabled: current.enabled },
      updateAvailable: versionDiverges ? true : entry.updateAvailable,
    };
  }),
);

const officialEntries = computed(() => catalogue.value.filter((entry) => entry.tier === 'official'));
const thirdPartyEntries = computed(() => catalogue.value.filter((entry) => entry.tier !== 'official'));
const isEmpty = computed(() => catalogue.value.length === 0 && installed.value.length === 0);

/** Upstream's summary line: source label plus the capability counts it has. */
function capabilityLine(plugin: AppPlugin): string {
  const parts: string[] = [t(`settings.plugins.source.${plugin.source}`)];
  if (plugin.skillCount > 0) parts.push(t('settings.plugins.counts.skill', plugin.skillCount));
  if (plugin.mcpServerCount > 0) {
    const enabled =
      plugin.enabledMcpServerCount < plugin.mcpServerCount
        ? ` (${t('settings.plugins.counts.mcpEnabled', plugin.enabledMcpServerCount)})`
        : '';
    parts.push(t('settings.plugins.counts.mcp', plugin.mcpServerCount) + enabled);
  }
  if (plugin.hookCount > 0) parts.push(t('settings.plugins.counts.hook', plugin.hookCount));
  if (plugin.commandCount > 0) parts.push(t('settings.plugins.counts.command', plugin.commandCount));
  return parts.join(' · ');
}

function entrySummary(entry: AppPluginMarketplaceEntry): AppPlugin | undefined {
  return installedById.value.get(entry.id);
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const api = getKimiWebApi();
    const [pluginList, marketEntries] = await Promise.all([
      api.listPlugins(),
      api.listPluginMarketplace(),
    ]);
    installed.value = pluginList;
    entries.value = marketEntries;
    rowErrors.value = {};
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
    loaded.value = true;
  }
}

async function run(id: string, action: () => Promise<unknown>): Promise<void> {
  busy.value = id;
  try {
    await action();
    await load();
  } catch (err) {
    rowErrors.value = { ...rowErrors.value, [id]: err instanceof Error ? err.message : String(err) };
  } finally {
    busy.value = null;
  }
}

function install(source: string): void {
  const trimmed = source.trim();
  if (trimmed.length === 0) return;
  void getKimiWebApi()
    .installPlugin(trimmed)
    .then(() => {
      customSource.value = '';
      customOpen.value = false;
      return load();
    })
    .catch((err: unknown) => {
      error.value = err instanceof Error ? err.message : String(err);
    });
}

function installEntry(entry: AppPluginMarketplaceEntry): void {
  void run(entry.id, () => getKimiWebApi().installPlugin(entry.source));
}

onMounted(load);
</script>

<template>
  <section class="sec plugins-panel">
    <h3 class="pp-panel-title">{{ t('settings.tabs.plugins') }}</h3>

    <div class="pp-group pp-custom" :class="{ open: customOpen }">
      <button type="button" class="pp-custom-row" @click="customOpen = !customOpen">
        <Icon name="plus" size="md" />
        <span class="pp-custom-label">{{ t('settings.plugins.customInstall') }}</span>
        <span class="pp-chev" :class="{ open: customOpen }"><Icon name="chevron-right" size="sm" /></span>
      </button>
      <div v-if="customOpen">
        <form class="pp-custom-form" @submit.prevent="install(customSource)">
          <Input
            v-model="customSource"
            class="pp-custom-input"
            :placeholder="t('settings.plugins.customInstallPlaceholder')"
            :aria-label="t('settings.plugins.customInstall')"
          />
          <Button size="sm" variant="primary" type="submit" :disabled="customSource.trim() === ''">
            {{ t('settings.plugins.install') }}
          </Button>
        </form>
        <p class="pp-custom-hint">{{ t('settings.plugins.customInstallHint') }}</p>
      </div>
    </div>

    <div v-if="loading && !loaded" class="pp-loading">
      <Spinner size="sm" />
      <span>{{ t('common.loading') }}</span>
    </div>

    <div v-else-if="error" class="pp-load-error" role="alert">
      <span class="pp-load-error-text">{{ error }}</span>
      <Button size="sm" variant="secondary" @click="load">{{ t('settings.plugins.retry') }}</Button>
    </div>

    <EmptyState v-else-if="isEmpty" :title="t('settings.plugins.empty')" />

    <template v-else>
      <section v-for="group in [{ key: 'official', title: t('settings.plugins.official'), rows: officialEntries }, { key: 'third-party', title: t('settings.plugins.thirdParty'), rows: thirdPartyEntries }]" v-show="group.rows.length > 0" :key="group.key" class="pp-section">
        <h3 class="pp-sec-title">{{ group.title }}</h3>
        <div class="pp-group">
          <article v-for="entry in group.rows" :key="entry.id" class="pp-row">
            <div class="pp-main">
              <div class="pp-title">
                <span class="pp-name">{{ entry.displayName }}</span>
                <span v-if="entry.installed?.version ?? entry.version" class="pp-version">{{ entry.installed?.version ?? entry.version }}</span>
                <span v-if="entrySummary(entry)?.hasErrors === true" class="pp-badge">{{ t('settings.plugins.hasErrors') }}</span>
                <a v-if="entry.homepage" class="pp-homepage" :href="entry.homepage" target="_blank" rel="noopener noreferrer" :aria-label="t('settings.plugins.homepage')"><Icon name="external-link" size="sm" /></a>
              </div>
              <p v-if="entry.description" class="pp-desc">{{ entry.description }}</p>
              <p v-if="entrySummary(entry)" class="pp-desc">{{ capabilityLine(entrySummary(entry)!) }}</p>
              <p v-if="rowErrors[entry.id]" class="pp-desc pp-row-error">{{ rowErrors[entry.id] }}</p>
            </div>
            <div class="pp-actions">
              <template v-if="entry.installed">
                <Button
                  v-if="entry.updateAvailable === true"
                  size="sm"
                  variant="primary"
                  :loading="busy === entry.id"
                  :disabled="busy === entry.id"
                  @click="installEntry(entry)"
                >
                  {{ t('settings.plugins.update') }}
                </Button>
                <Switch
                  :model-value="entry.installed.enabled"
                  :label="t('settings.plugins.enabled')"
                  :disabled="busy === entry.id"
                  @update:model-value="run(entry.id, () => getKimiWebApi().setPluginEnabled(entry.id, $event))"
                />
                <IconButton
                  size="sm"
                  :label="t('settings.plugins.remove')"
                  :disabled="busy === entry.id"
                  @click="run(entry.id, () => getKimiWebApi().removePlugin(entry.id))"
                >
                  <Icon name="trash" size="md" />
                </IconButton>
              </template>
              <Button
                v-else
                size="sm"
                variant="secondary"
                :loading="busy === entry.id"
                :disabled="busy === entry.id"
                @click="installEntry(entry)"
              >
                {{ t('settings.plugins.install') }}
              </Button>
            </div>
          </article>
        </div>
      </section>

      <section v-if="installed.length > 0" class="pp-section">
        <h3 class="pp-sec-title">{{ t('settings.plugins.installed') }}</h3>
        <div class="pp-group">
          <article v-for="plugin in installed" :key="plugin.id" class="pp-row">
            <div class="pp-main">
              <div class="pp-title">
                <span class="pp-name">{{ plugin.displayName }}</span>
                <span v-if="plugin.version" class="pp-version">{{ plugin.version }}</span>
                <span v-if="plugin.hasErrors" class="pp-badge">{{ t('settings.plugins.hasErrors') }}</span>
              </div>
              <p class="pp-desc">{{ capabilityLine(plugin) }}</p>
              <p v-if="rowErrors[plugin.id]" class="pp-desc pp-row-error">{{ rowErrors[plugin.id] }}</p>
            </div>
            <div class="pp-actions">
              <Switch
                :model-value="plugin.enabled"
                :label="t('settings.plugins.enabled')"
                :disabled="busy === plugin.id"
                @update:model-value="run(plugin.id, () => getKimiWebApi().setPluginEnabled(plugin.id, $event))"
              />
              <IconButton
                size="sm"
                :label="t('settings.plugins.remove')"
                :disabled="busy === plugin.id"
                @click="run(plugin.id, () => getKimiWebApi().removePlugin(plugin.id))"
              >
                <Icon name="trash" size="md" />
              </IconButton>
            </div>
          </article>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.plugins-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.pp-panel-title {
  margin: 0;
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  color: var(--color-text);
}
.pp-group {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.pp-custom-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px dashed var(--color-line);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
  text-align: left;
}
.pp-custom-row:hover {
  background: var(--color-hover);
}
.pp-custom-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pp-chev {
  display: inline-flex;
  color: var(--color-text-muted);
  transition: transform var(--duration-base) var(--ease-out);
}
.pp-chev.open {
  transform: rotate(90deg);
}
.pp-custom-form {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) 0 0;
}
.pp-custom-input {
  flex: 1;
  min-width: 0;
}
.pp-custom-hint {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}
.pp-loading,
.pp-load-error {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
.pp-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.pp-sec-title {
  margin: 0;
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.pp-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}
.pp-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pp-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.pp-name {
  font-weight: var(--weight-medium);
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pp-version {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}
.pp-homepage {
  display: inline-flex;
  color: var(--color-text-muted);
}
.pp-badge {
  padding: 0 var(--space-1);
  border-radius: var(--radius-sm);
  background: var(--color-danger-soft);
  color: var(--color-danger);
  font-size: var(--text-xs);
}
.pp-desc {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pp-row-error {
  color: var(--color-danger);
}
.pp-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: none;
}
</style>
