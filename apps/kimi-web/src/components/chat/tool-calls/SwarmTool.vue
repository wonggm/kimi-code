<!-- apps/kimi-web/src/components/chat/tool-calls/SwarmTool.vue -->
<!-- A single AgentSwarm tool call: a tool line counting the finished members
     over a card whose head is the swarm itself (avatar, description, the shared
     model line, the done/total count in accent) and whose body lists one row
     per member — avatar, name, the activity line, the phase tail (close + word
     when a member failed, a progress meter otherwise, and the member's ordinal)
     and, for a settled member with a result, the accordion's saved-result
     toggle over the member's own text.
     While the swarm runs the rows come from the AppTask store
     (`resolveSwarmMembers`); after the tool result lands — and after a refresh
     drops the live tasks — the same rows come from the parsed
     `<agent_swarm_result>` payload. See §04 tool-calls. -->
<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FilePreviewRequest, ToolCall, ToolMedia } from '../../../types';
import type { AppSubagentPhase } from '../../../api/types';
import type { SwarmMember } from '../../../composables/swarmGroups';
import { effortLabel } from '../../../lib/modelThinking';
import { toolGlyph, toolLabel } from '../../../lib/toolMeta';
import { parseSwarmResult } from '../../../lib/parseSwarmResult';
import { buildSwarmCardRows, type SwarmCardRow } from '../../../lib/swarmCardRows';
import Icon from '../../ui/Icon.vue';
import Tooltip from '../../ui/Tooltip.vue';
import ToolRow from '../ToolRow.vue';
import ToolPanel from './ToolPanel.vue';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    tool: ToolCall;
    mobile?: boolean;
    toolDiffPanel?: boolean;
  }>(),
  { mobile: false, toolDiffPanel: false },
);

const emit = defineEmits<{
  openMedia: [media: ToolMedia];
  openFile: [target: FilePreviewRequest];
  openToolDiff: [id: string];
  openAgent: [agentId: string];
}>();

interface SwarmInput {
  description?: string;
  itemCount?: number;
}

function parseInput(arg: string): SwarmInput {
  if (!arg) return {};
  try {
    const obj = JSON.parse(arg) as Record<string, unknown>;
    const items = Array.isArray(obj['items']) ? obj['items'] : undefined;
    return {
      description: typeof obj['description'] === 'string' ? obj['description'] : undefined,
      itemCount: items?.length,
    };
  } catch {
    return {};
  }
}

const resolveSwarmMembers =
  inject<(toolCallId: string) => SwarmMember[] | undefined>('resolveSwarmMembers');

const input = computed(() => parseInput(props.tool.arg));
const label = computed(() => toolLabel(props.tool.name));
const glyph = computed(() => toolGlyph(props.tool.name));
const description = computed(() => input.value.description ?? '');
const members = computed(() => resolveSwarmMembers?.(props.tool.id) ?? []);
const result = computed(() => parseSwarmResult(props.tool.output));

const status = computed<'running' | 'ok' | 'error'>(() => props.tool.status as 'running' | 'ok' | 'error');

// Rows are the single source of truth: phase counts and totals derive from the
// live members and any not-yet-spawned result entries merged together (see
// buildSwarmCardRows). Without that merge an interrupted swarm could drop
// `state="not_started"` / `outcome="aborted"` rows when at least one live
// AppTask still exists.
const rows = computed<SwarmCardRow[]>(() => buildSwarmCardRows(members.value, result.value));

const counts = computed<Record<AppSubagentPhase, number>>(() => {
  const c: Record<AppSubagentPhase, number> = {
    queued: 0,
    working: 0,
    suspended: 0,
    completed: 0,
    failed: 0,
  };
  for (const r of rows.value) c[r.phase]++;
  return c;
});

const total = computed(() => rows.value.length || input.value.itemCount || 0);
const done = computed(() => counts.value.completed + counts.value.failed);
const inProgress = computed(() => counts.value.working + counts.value.suspended + counts.value.queued);
const countText = computed(() => `${done.value} / ${total.value}`);

const aggregateStatus = computed<'running' | 'ok' | 'error'>(() => {
  if (status.value === 'running') return 'running';
  if (status.value === 'error' || counts.value.failed > 0) return 'error';
  return 'ok';
});

const modelLine = computed(() => {
  let agreed: string | undefined;
  for (const member of members.value) {
    const alias = member.model ?? '';
    const display = alias.length > 0 ? alias.slice(alias.lastIndexOf('/') + 1) : '';
    const effort =
      member.thinkingEffort && member.thinkingEffort !== 'off' && member.thinkingEffort !== 'on'
        ? effortLabel(member.thinkingEffort)
        : '';
    const parts = [display, effort].filter(Boolean);
    if (parts.length === 0) continue;
    const text = parts.join(' · ');
    if (agreed === undefined) agreed = text;
    else if (agreed !== text) return '';
  }
  return agreed ?? '';
});

// Running swarms start expanded; the persisted user choice overrides that on
// re-mount after a row eviction (see ChatPane's toolExpandState). Only manual
// toggles persist — the auto-expand default does not.
const toolExpandState = inject<Map<string, boolean>>('toolExpandState');
const expandKey = props.tool.id;
const persisted = expandKey ? toolExpandState?.get(expandKey) : undefined;
const open = ref(persisted ?? (status.value === 'running' || inProgress.value > 0));
function toggle(): void {
  open.value = !open.value;
  if (expandKey && toolExpandState) toolExpandState.set(expandKey, open.value);
}

// When AgentSwarm produces no structured result but the tool is no longer
// running — e.g. argument validation bailing before renderSwarmResults, or an
// unrecognized legacy output — show the raw tool output instead of the
// "waiting" placeholder so the user sees the final text / failure cause.
const fallbackOutput = computed(() => {
  if (rows.value.length > 0 || result.value) return '';
  if (status.value === 'running') return '';
  return (props.tool.output ?? []).join('\n').trim();
});

// Per-row accordion: each member expands on its own, leaving the rest folded.
const openRows = ref<Set<string>>(new Set());
function toggleRow(id: string): void {
  const next = new Set(openRows.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  openRows.value = next;
}
function isRowOpen(id: string): boolean {
  return openRows.value.has(id);
}

function phaseLabel(phase: AppSubagentPhase): string {
  return t(`tools.swarm.phase${phase[0]!.toUpperCase()}${phase.slice(1)}`);
}

function canSave(row: SwarmCardRow): boolean {
  const settled = row.phase === 'completed' || row.phase === 'failed';
  return row.agentId !== undefined && settled && row.body.length > 0;
}

function onRowClick(row: SwarmCardRow): void {
  if (row.agentId !== undefined) {
    emit('openAgent', row.agentId);
    return;
  }
  if (row.body.length > 0) toggleRow(row.id);
}

const PHASE_VALUE: Partial<Record<AppSubagentPhase, number>> = {
  queued: 0,
  working: 0.25,
  suspended: 0.25,
  completed: 1,
};
const DOT_COLUMNS = 14;

function filledColumns(phase: AppSubagentPhase): number {
  const value = Math.min(1, Math.max(0, PHASE_VALUE[phase] ?? 0));
  return Math.round(value * DOT_COLUMNS);
}

const columns = Array.from({ length: DOT_COLUMNS }, (_, i) => i);

function ordinal(index: number): string {
  return String(index + 1).padStart(2, '0');
}
</script>

<template>
  <ToolRow
    :status="aggregateStatus"
    :icon="glyph"
    :name="description || label"
    :faint="total > 0 ? countText : ''"
    :open="open"
    expandable
    @toggle="toggle"
  >
    <div class="sw-content">
      <ToolPanel>
        <div class="sw-head">
          <span class="sw-avatar" aria-hidden="true"><Icon name="robot" size="lg" /></span>
          <span class="sw-text">
            <span class="sw-title">{{ description || label }}</span>
            <span v-if="modelLine" class="sw-model">{{ modelLine }}</span>
          </span>
          <span v-if="total > 0" class="sw-count">{{ countText }}</span>
        </div>
      </ToolPanel>

      <div v-if="rows.length > 0" class="sw-members">
        <div v-for="(row, i) in rows" :key="row.id" class="sw-member">
          <button
            type="button"
            class="sw-row"
            :disabled="row.agentId === undefined && row.body.length === 0"
            :aria-label="row.agentId !== undefined ? t('tasks.openDetail') : undefined"
            :aria-expanded="row.agentId === undefined && row.body.length > 0 ? isRowOpen(row.id) : undefined"
            :title="phaseLabel(row.phase)"
            @click="onRowClick(row)"
          >
            <span class="sw-ic" aria-hidden="true"><Icon name="robot" size="md" /></span>
            <Tooltip :text="row.name">
              <span class="sw-name">{{ row.name }}</span>
            </Tooltip>
            <Tooltip v-if="row.activity" :text="row.activity">
              <span class="sw-act">{{ row.activity }}</span>
            </Tooltip>
            <span class="sw-tail">
              <span v-if="row.phase === 'failed'" class="sw-state" :class="row.phase">
                <Icon name="close" size="sm" aria-hidden="true" />
                <span>{{ phaseLabel(row.phase) }}</span>
              </span>
              <span v-else class="sw-dots" aria-hidden="true">
                <span
                  v-for="column in columns"
                  :key="column"
                  class="sw-dot-col"
                  :class="{ on: column < filledColumns(row.phase) }"
                >
                  <span class="sw-dot" />
                  <span class="sw-dot" />
                  <span class="sw-dot" />
                </span>
              </span>
              <span class="sw-idx">{{ ordinal(i) }}</span>
            </span>
          </button>

          <button
            v-if="canSave(row)"
            type="button"
            class="sw-saved"
            :aria-expanded="isRowOpen(row.id)"
            @click="toggleRow(row.id)"
          >
            <Icon
              class="sw-saved-car"
              :class="{ open: isRowOpen(row.id) }"
              name="chevron-right"
              size="sm"
              aria-hidden="true"
            />
            <span>{{ t('tools.output.saved') }}</span>
          </button>

          <div
            v-if="row.body.length > 0 && (row.agentId === undefined || canSave(row))"
            v-show="isRowOpen(row.id)"
            class="sw-body"
          >{{ row.body }}</div>
        </div>
      </div>

      <div v-else-if="fallbackOutput" class="sw-fallback">{{ fallbackOutput }}</div>

      <div v-else class="sw-waiting">{{ t('tools.swarm.waiting') }}</div>
    </div>
  </ToolRow>
</template>

<style scoped>
.sw-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.sw-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-width: 0;
}
.sw-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: var(--color-fill-1);
  color: var(--color-text);
}
.sw-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  font-family: var(--font-ui);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
}
.sw-title {
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sw-model {
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sw-count {
  flex: none;
  color: var(--color-accent);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
}

.sw-members {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--color-fill-1);
  border-radius: var(--radius-lg);
  max-height: 300px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.sw-member {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.sw-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  font-family: var(--font-ui);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
  color: inherit;
  cursor: pointer;
}
.sw-row:disabled { cursor: default; }
.sw-row:focus-visible { outline: none; border-radius: var(--radius-xs); box-shadow: var(--p-focus-ring); }
.sw-ic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 20px;
  height: 20px;
  color: var(--color-text);
}
.sw-name {
  display: block;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 46%;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--color-text);
  white-space: nowrap;
}
.sw-act {
  min-width: 0;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sw-tail {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: none;
}
.sw-state {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text-faint);
}
.sw-state.failed { color: var(--color-danger); }
.sw-idx {
  width: 30px;
  text-align: right;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.sw-dots {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  flex: none;
}
.sw-dot-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: none;
}
.sw-dot {
  width: 3px;
  height: 3px;
  border-radius: 0;
  background: var(--color-line);
}
.sw-dot-col.on .sw-dot { background: var(--color-accent); }

.sw-saved {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin-top: var(--space-1);
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-faint);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  cursor: pointer;
}
.sw-saved:focus-visible { outline: none; border-radius: var(--radius-xs); box-shadow: var(--p-focus-ring); }
.sw-saved-car { transition: transform var(--duration-base) var(--ease-out); }
.sw-saved-car.open { transform: rotate(90deg); }
.sw-body {
  margin-top: var(--space-1);
  padding-left: calc(20px + var(--space-2));
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: var(--content-font-size);
  line-height: 1.571;
  white-space: pre-wrap;
  word-break: break-word;
}
.sw-fallback {
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: var(--content-font-size);
  line-height: 1.571;
  white-space: pre-wrap;
  word-break: break-word;
}
.sw-waiting {
  color: var(--color-text-faint);
  font-family: var(--font-ui);
  font-size: var(--text-base);
}
</style>
