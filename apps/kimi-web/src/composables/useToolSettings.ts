// apps/kimi-web/src/composables/useToolSettings.ts
// Shared "Tools" logic behind the desktop Settings Tools tab and the mobile
// settings sheet's Tools sub-view. The global half writes the `[tools]` section
// of config.toml; the per-session half writes a denylist through the session
// profile route. Both read the tool list from one GET /api/v1/tools call, so
// the two tables cannot disagree about what exists.
import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue';
import { getKimiWebApi } from '../api';
import type { AppConfig, AppToolDescriptor, AppToolsConfig } from '../api/types';

export type GlobalToolMode = 'unrestricted' | 'allowlist' | 'denylist';

const MCP_PREFIX = 'mcp__';
const MCP_SEPARATOR = '__';
const GLOB_MAGIC = /[*?[\]{}]/;

export interface ToolPatternCheck {
  ok: boolean;
  reason?: 'bareWildcard' | 'incompleteMcpName' | 'empty';
}

/**
 * Which of the three modes a stored `[tools]` section represents. An allowlist
 * wins when a hand-written config.toml holds both lists; the next save
 * normalizes it to one list. The engine reads an empty list as no constraint,
 * so `{ enabled: [] }` is unrestricted.
 */
export function globalModeOf(section: AppToolsConfig | undefined): GlobalToolMode {
  if (section?.enabled !== undefined && section.enabled.length > 0) return 'allowlist';
  if (section?.disabled !== undefined && section.disabled.length > 0) return 'denylist';
  return 'unrestricted';
}

/**
 * Two shapes are refused before a list is sent, because each silently disables
 * everything or nothing: a bare `*` on a non-MCP name, and an `mcp__` name with
 * no tool segment. An unknown tool name is deliberately not refused here — it
 * depends on the live registry, so the write goes through and the tab shows the
 * name greyed.
 */
export function validateToolPattern(pattern: string): ToolPatternCheck {
  if (pattern.length === 0) return { ok: false, reason: 'empty' };
  if (pattern.startsWith(MCP_PREFIX)) {
    const rest = pattern.slice(MCP_PREFIX.length);
    if (rest.length === 0 || rest.indexOf(MCP_SEPARATOR) <= 0) {
      return { ok: false, reason: 'incompleteMcpName' };
    }
    return { ok: true };
  }
  if (GLOB_MAGIC.test(pattern)) return { ok: false, reason: 'bareWildcard' };
  return { ok: true };
}

/**
 * The body of a config write. Both keys always travel together: the server
 * merges the patch into the stored section, so the key belonging to the mode
 * being left has to be sent as an empty list to clear it.
 */
export function toolPatch(
  mode: GlobalToolMode,
  enabled: readonly string[],
  disabled: readonly string[],
): AppToolsConfig {
  return {
    enabled: mode === 'allowlist' ? [...enabled] : [],
    disabled: mode === 'denylist' ? [...disabled] : [],
  };
}

export function splitToolPatterns(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(/[\s,]+/)) {
    const trimmed = part.trim();
    if (trimmed.length > 0) seen.add(trimmed);
  }
  return [...seen];
}

export function knownToolNames(tools: readonly AppToolDescriptor[]): string[] {
  return tools.map((t) => t.name).toSorted();
}

/**
 * Saved entries with no tool behind them. A glob or an mcp pattern is never
 * reported missing, because its tool may simply not be connected right now.
 */
export function missingToolNames(
  saved: readonly string[],
  tools: readonly AppToolDescriptor[],
): string[] {
  const known = new Set(knownToolNames(tools));
  return saved
    .filter((name) => !known.has(name) && !GLOB_MAGIC.test(name) && !name.startsWith(MCP_PREFIX))
    .toSorted();
}

export interface UseToolSettingsOptions {
  config: MaybeRefOrGetter<AppConfig | null | undefined>;
  sessionId: MaybeRefOrGetter<string | undefined>;
  sessionDisabledTools: MaybeRefOrGetter<readonly string[] | undefined>;
}

export function useToolSettings(opts: UseToolSettingsOptions) {
  const config = computed(() => toValue(opts.config));
  const sessionId = computed(() => toValue(opts.sessionId));
  const sessionDisabledTools = computed(() => toValue(opts.sessionDisabledTools) ?? []);

  const tools = ref<AppToolDescriptor[]>([]);
  const disconnectedServers = ref<string[]>([]);
  const loading = ref(false);
  const loadError = ref(false);

  const mode = computed<GlobalToolMode>(() => globalModeOf(config.value?.tools));
  const savedEnabled = computed(() => config.value?.tools?.enabled ?? []);
  const savedDisabled = computed(() => config.value?.tools?.disabled ?? []);
  const sessionSaved = computed<string[]>(() => [...sessionDisabledTools.value]);
  const missingNames = computed(() => missingToolNames(sessionSaved.value, tools.value));

  async function refresh(): Promise<void> {
    loading.value = true;
    loadError.value = false;
    try {
      const [list, servers] = await Promise.all([
        getKimiWebApi().listTools(sessionId.value),
        getKimiWebApi().listMcpServers(),
      ]);
      tools.value = list;
      disconnectedServers.value = servers
        .filter((s) => s.status !== 'connected')
        .map((s) => s.id);
    } catch {
      loadError.value = true;
    } finally {
      loading.value = false;
    }
  }

  return {
    tools,
    disconnectedServers,
    loading,
    loadError,
    mode,
    savedEnabled,
    savedDisabled,
    sessionSaved,
    missingNames,
    refresh,
  };
}
