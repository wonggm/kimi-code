<!-- apps/kimi-web/src/components/settings/ToolsPanel.vue
     Settings → Tools. Two stacked sections over one GET /api/v1/tools fetch:
     "All sessions" writes the `[tools]` section of config.toml (three modes),
     "This session" writes a denylist through the session profile route. Each
     table lists name, source and the server-computed token estimate for the
     tool's declaration; patterns the checkboxes cannot express go in the text
     field under the table. -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AppConfig, AppToolDescriptor } from '../../api/types';
import {
  splitToolPatterns,
  toolPatch,
  useToolSettings,
  validateToolPattern,
  type GlobalToolMode,
} from '../../composables/useToolSettings';
import Button from '../ui/Button.vue';
import SegmentedControl from '../ui/SegmentedControl.vue';

const props = defineProps<{
  config?: AppConfig | null;
  configSaving?: boolean;
  sessionId?: string;
  sessionDisabledTools?: string[];
  sessionToolsSaving?: boolean;
  /** True while the Tools tab is on screen; the list refetches on open. */
  active?: boolean;
}>();

const emit = defineEmits<{
  updateConfig: [patch: Partial<AppConfig>];
  updateSessionTools: [sessionId: string, names: string[]];
}>();

const { t } = useI18n();

const toolState = useToolSettings({
  config: () => props.config,
  sessionId: () => props.sessionId,
  sessionDisabledTools: () => props.sessionDisabledTools,
});

const MODES: GlobalToolMode[] = ['unrestricted', 'allowlist', 'denylist'];

const mode = ref<GlobalToolMode>(toolState.mode.value);
watch(toolState.mode, (next) => {
  mode.value = next;
});

/** The stored list the current mode owns: the allowlist, or the denylist. */
const globalSaved = computed(() =>
  mode.value === 'allowlist' ? toolState.savedEnabled.value : toolState.savedDisabled.value,
);

const globalPicked = ref<string[]>([...globalSaved.value]);
const globalPatterns = ref<string>(globalSaved.value.join(', '));
const sessionPicked = ref<string[]>([...toolState.sessionSaved.value]);
const sessionPatterns = ref<string>(toolState.sessionSaved.value.join(', '));
const globalError = ref('');
const sessionError = ref('');

watch(globalSaved, (next) => {
  globalPicked.value = [...next];
  globalPatterns.value = next.join(', ');
});
watch(toolState.sessionSaved, (next) => {
  sessionPicked.value = [...next];
  sessionPatterns.value = next.join(', ');
});

const builtinTools = computed(() => toolState.tools.value.filter((t2) => t2.source !== 'mcp'));

const mcpGroups = computed(() => {
  const groups = new Map<string, AppToolDescriptor[]>();
  for (const tool of toolState.tools.value) {
    if (tool.source !== 'mcp') continue;
    const key = tool.mcpServerId ?? tool.name.split('__').slice(0, 2).join('__');
    const list = groups.get(key) ?? [];
    list.push(tool);
    groups.set(key, list);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
});

/** A saved name with no tool behind it: kept in the list, shown greyed. */
function isMissing(name: string): boolean {
  return toolState.missingNames.value.includes(name);
}

function sourceLabel(tool: AppToolDescriptor): string {
  if (tool.source === 'mcp') return tool.mcpServerId ?? 'mcp';
  return tool.source;
}

function toggle(list: string[], name: string, on: boolean): void {
  const at = list.indexOf(name);
  if (on && at === -1) list.push(name);
  if (!on && at !== -1) list.splice(at, 1);
}

/**
 * Merge the ticked boxes with the pattern field, refusing the two shapes that
 * would silently disable everything or nothing. An unknown tool name is not
 * refused here: it depends on the live registry, so it is written and shown
 * greyed instead.
 */
function resolve(picked: readonly string[], patterns: string): string[] | string {
  const merged = [...picked];
  for (const pattern of splitToolPatterns(patterns)) {
    const check = validateToolPattern(pattern);
    if (!check.ok) return t(`settings.tools.refuse.${check.reason}`);
    if (!merged.includes(pattern)) merged.push(pattern);
  }
  return merged;
}

function saveGlobal(): void {
  globalError.value = '';
  const names = resolve(globalPicked.value, globalPatterns.value);
  if (typeof names === 'string') {
    globalError.value = names;
    return;
  }
  const allowed = mode.value === 'allowlist' ? names : [];
  const denied = mode.value === 'allowlist' ? [] : names;
  emit('updateConfig', { tools: toolPatch(mode.value, allowed, denied) });
  void toolState.refresh();
}

function saveSession(): void {
  sessionError.value = '';
  const names = resolve(sessionPicked.value, sessionPatterns.value);
  if (typeof names === 'string') {
    sessionError.value = names;
    return;
  }
  emit('updateSessionTools', props.sessionId as string, names);
}

function clearSession(): void {
  sessionPicked.value = [];
  sessionPatterns.value = '';
  emit('updateSessionTools', props.sessionId as string, []);
}

watch(
  () => props.active,
  (open) => {
    if (open) void toolState.refresh();
  },
  { immediate: true },
);
</script>

<template>
  <section class="sec">
    <div class="sec-head">
      <h3 class="sec-title">{{ t('settings.tools.allSessions') }}</h3>
      <span v-if="configSaving" class="saving">{{ t('settings.saving') }}</span>
    </div>

    <SegmentedControl
      :model-value="mode"
      :options="MODES.map((m) => ({ value: m, label: t(`settings.tools.mode.${m}`) }))"
      :disabled="configSaving"
      @update:model-value="mode = $event as GlobalToolMode"
    />

    <p v-if="toolState.loadError.value" class="tools-error">
      {{ t('settings.tools.loadFailed') }}
    </p>

    <table class="tools-table">
      <thead>
        <tr>
          <th class="col-check"></th>
          <th>{{ t('settings.tools.columnName') }}</th>
          <th>{{ t('settings.tools.columnSource') }}</th>
          <th class="col-tokens">{{ t('settings.tools.columnTokens') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="toolState.tools.value.length === 0" class="group-row">
          <td colspan="4">{{ t('settings.tools.noTools') }}</td>
        </tr>
        <tr v-for="tool in builtinTools" :key="tool.name">
          <td class="col-check">
            <input
              type="checkbox"
              :checked="globalPicked.includes(tool.name)"
              :disabled="configSaving || mode === 'unrestricted'"
              :aria-label="tool.name"
              @change="toggle(globalPicked, tool.name, ($event.target as HTMLInputElement).checked)"
            />
          </td>
          <td :class="{ missing: isMissing(tool.name) }">{{ tool.name }}</td>
          <td>{{ sourceLabel(tool) }}</td>
          <td class="col-tokens">{{ tool.estimatedTokens ?? '—' }}</td>
        </tr>
        <template v-for="[server, list] in mcpGroups" :key="server">
          <tr class="group-row">
            <td colspan="4">{{ server }}</td>
          </tr>
          <tr v-for="tool in list" :key="tool.name">
            <td class="col-check">
              <input
                type="checkbox"
                :checked="globalPicked.includes(tool.name)"
                :disabled="configSaving || mode === 'unrestricted'"
                :aria-label="tool.name"
                @change="toggle(globalPicked, tool.name, ($event.target as HTMLInputElement).checked)"
              />
            </td>
            <td :class="{ missing: isMissing(tool.name) }">{{ tool.name }}</td>
            <td>{{ sourceLabel(tool) }}</td>
            <td class="col-tokens">{{ tool.estimatedTokens ?? '—' }}</td>
          </tr>
        </template>
        <tr v-for="server in toolState.disconnectedServers.value" :key="`off-${server}`" class="group-row">
          <td colspan="4">{{ t('settings.tools.serverDisconnected', { server }) }}</td>
        </tr>
        <tr v-for="name in toolState.missingNames.value" :key="`missing-${name}`" class="group-row">
          <td colspan="4">{{ t('settings.tools.notFound', { name }) }}</td>
        </tr>
      </tbody>
    </table>

    <label class="tools-patterns">
      <span>{{ t('settings.tools.patterns') }}</span>
      <input
        v-model="globalPatterns"
        type="text"
        :placeholder="t('settings.tools.patternsPlaceholder')"
        :disabled="configSaving"
      />
    </label>

    <p v-if="globalError" class="tools-error">{{ globalError }}</p>

    <Button :disabled="configSaving" @click="saveGlobal">
      {{ t('settings.tools.saveAll') }}
    </Button>
  </section>

  <section class="sec">
    <div class="sec-head">
      <h3 class="sec-title">{{ t('settings.tools.thisSession') }}</h3>
      <span v-if="sessionToolsSaving" class="saving">{{ t('settings.saving') }}</span>
    </div>

    <p v-if="!sessionId" class="hint">{{ t('settings.tools.noSession') }}</p>

    <table v-else class="tools-table">
      <thead>
        <tr>
          <th class="col-check"></th>
          <th>{{ t('settings.tools.columnName') }}</th>
          <th>{{ t('settings.tools.columnSource') }}</th>
          <th class="col-tokens">{{ t('settings.tools.columnTokens') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="toolState.tools.value.length === 0" class="group-row">
          <td colspan="4">{{ t('settings.tools.noTools') }}</td>
        </tr>
        <tr v-for="tool in builtinTools" :key="`s-${tool.name}`">
          <td class="col-check">
            <input
              type="checkbox"
              :checked="sessionPicked.includes(tool.name)"
              :disabled="sessionToolsSaving"
              :aria-label="tool.name"
              @change="toggle(sessionPicked, tool.name, ($event.target as HTMLInputElement).checked)"
            />
          </td>
          <td :class="{ missing: isMissing(tool.name) }">{{ tool.name }}</td>
          <td>{{ sourceLabel(tool) }}</td>
          <td class="col-tokens">{{ tool.estimatedTokens ?? '—' }}</td>
        </tr>
        <template v-for="[server, list] in mcpGroups" :key="`s-${server}`">
          <tr class="group-row">
            <td colspan="4">{{ server }}</td>
          </tr>
          <tr v-for="tool in list" :key="`s-${tool.name}`">
            <td class="col-check">
              <input
                type="checkbox"
                :checked="sessionPicked.includes(tool.name)"
                :disabled="sessionToolsSaving"
                :aria-label="tool.name"
                @change="toggle(sessionPicked, tool.name, ($event.target as HTMLInputElement).checked)"
              />
            </td>
            <td :class="{ missing: isMissing(tool.name) }">{{ tool.name }}</td>
            <td>{{ sourceLabel(tool) }}</td>
            <td class="col-tokens">{{ tool.estimatedTokens ?? '—' }}</td>
          </tr>
        </template>
        <tr v-for="name in toolState.missingNames.value" :key="`s-missing-${name}`" class="group-row">
          <td colspan="4">{{ t('settings.tools.notFound', { name }) }}</td>
        </tr>
      </tbody>
    </table>

    <label v-if="sessionId" class="tools-patterns">
      <span>{{ t('settings.tools.patterns') }}</span>
      <input
        v-model="sessionPatterns"
        type="text"
        :placeholder="t('settings.tools.patternsPlaceholder')"
        :disabled="sessionToolsSaving"
      />
    </label>

    <p v-if="sessionError" class="tools-error">{{ sessionError }}</p>

    <div v-if="sessionId" class="tools-actions">
      <Button :disabled="sessionToolsSaving" @click="saveSession">
        {{ t('settings.tools.saveSession') }}
      </Button>
      <Button
        v-if="toolState.sessionSaved.value.length > 0"
        variant="ghost"
        :disabled="sessionToolsSaving"
        @click="clearSession"
      >
        {{ t('settings.tools.clearSession') }}
      </Button>
    </div>
  </section>
</template>

<style scoped>
.sec + .sec {
  margin-top: var(--space-6);
}

.tools-table {
  width: 100%;
  border-collapse: collapse;
  margin: var(--space-3) 0;
  font-size: var(--text-sm);
}

.tools-table th {
  text-align: left;
  font-weight: 500;
  color: var(--color-text-muted);
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--color-line);
}

.tools-table td {
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--color-line);
  color: var(--color-text);
}

.tools-table .col-check {
  width: 28px;
}

.tools-table .col-tokens {
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted);
}

.tools-table .missing {
  color: var(--color-text-faint);
  font-style: italic;
}

.tools-table .group-row td {
  background: var(--color-surface-sunken);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.tools-patterns {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-bottom: var(--space-3);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.tools-patterns input {
  padding: var(--space-2);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.tools-error {
  color: var(--color-danger);
  font-size: var(--text-sm);
  margin: var(--space-2) 0;
}

.tools-actions {
  display: flex;
  gap: var(--space-2);
}
</style>
