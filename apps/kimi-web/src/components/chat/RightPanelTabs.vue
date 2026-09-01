<!-- apps/kimi-web/src/components/chat/RightPanelTabs.vue -->
<!-- Right-side multi-tab panel — replaces the dock pills with a tabbed panel.
     Tabs: Changes / Side chat / Turn diff / Terminal / Bash / Sub agents /
     Todos. The tab bar is glass; each tab content is a frost panel. Active
     tab persists in localStorage via STORAGE_KEYS.rightPanelActiveTab. -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ChatTurn, FilePreviewRequest, TaskItem, TodoView } from '../../types';
import type { AppPlanEntry } from '../../api/types';
import type { DetachTaskTarget } from '../../lib/detachTarget';
import ChangedFilesCard from './ChangedFilesCard.vue';
import SideChatPanel from './SideChatPanel.vue';
import TasksPane from './TasksPane.vue';
import SubagentGrid from './SubagentGrid.vue';
import TodoCard from './TodoCard.vue';
import PlanPanel from './PlanPanel.vue';
import Terminal from '../Terminal.vue';
import DiffLines from './DiffLines.vue';
import PanelHeader from '../ui/PanelHeader.vue';
import IconButton from '../ui/IconButton.vue';
import Icon from '../ui/Icon.vue';
import Tooltip from '../ui/Tooltip.vue';
import { STORAGE_KEYS, safeGetString, safeSetString } from '../../lib/storage';
import { useGlassRefraction } from '../../composables/useGlassRefraction';
import {
  coerceRightPanelTab,
  latestTurnDiffEntries,
  RIGHT_PANEL_TABS,
  type RightPanelTab,
} from '../../lib/rightPanelTabs';

const { t } = useI18n();

const rootRef = ref<HTMLElement | null>(null);
useGlassRefraction(rootRef, { transient: false });

const props = defineProps<{
  /** Tab requested from outside (workbar squares). When it changes, the
   *  panel switches to it — without this the workbar opens the panel on
   *  whichever tab was last persisted. */
  activeTab?: RightPanelTab | null;
  turns: ChatTurn[];
  changedFiles: string[];
  /** Latest ExitPlanMode plan entry of the active session (plan viewer tab
   *  reuses the same PlanPanel as the old dock). */
  planEntry?: AppPlanEntry | null;
  planMode?: boolean;
  todos?: TodoView[];
  bashTasks: TaskItem[];
  subagentTasks: TaskItem[];
  /** Open a file in the file preview side panel. */
  openFile?: (target: FilePreviewRequest) => void;
  // ---- Side chat (BTW) tab -------------------------------------------------
  sideChat: {
    turns: ChatTurn[];
    running: boolean;
    sending: boolean;
  };
  // ---- Terminal tab --------------------------------------------------------
  /** The kap-server keeps PTY routes loopback-bound in some builds. When the
   *  preview endpoint is unreachable we render a friendly unavailable state
   *  instead of letting the xterm host spin forever. */
  terminalAvailable: boolean;
  sessionId?: string;
}>();

const emit = defineEmits<{
  /** Selected tab changed (used by the workbar above the composer to sync
   *  its active state). */
  'update:activeTab': [tab: RightPanelTab];
  close: [];
  // Side chat tab events.
  'side-chat-send': [text: string];
  // Task list events (mirror ChatDock's existing wire so the parent can keep
  // its emit-based architecture).
  'cancel-task': [taskId: string];
  'detach-task': [target: DetachTaskTarget];
  'open-agent': [taskId: string];
  // Open a file in the right-side preview (from ChangedFilesCard click).
  'open-changed-file': [target: FilePreviewRequest];
}>();

// ---------------------------------------------------------------------------
// Active tab state — persisted via localStorage so the user's choice survives
// page refreshes. Loaded once on mount; writes are debounced via watch.
// ---------------------------------------------------------------------------
const activeTab = ref<RightPanelTab>(coerceRightPanelTab(safeGetString(STORAGE_KEYS.rightPanelActiveTab)));

// PTY availability probe (per session, cached). Upstream 0.39 restricts
// terminal routes to loopback-bound servers; when kimi web binds 0.0.0.0 the
// daemon answers 403/404 and the tab must say so instead of a dead terminal.
// Must stay below the props declaration: the immediate callback reads
// props.sessionId synchronously during setup.
const terminalProbe = ref<'pending' | 'ok' | 'unavailable'>('pending');
let probedSession: string | undefined;
watch(
  () => props.sessionId,
  async (sid) => {
    if (sid === undefined || sid === probedSession) return;
    probedSession = sid;
    terminalProbe.value = 'pending';
    try {
      const r = await fetch(
        `/api/v1/sessions/${encodeURIComponent(sid)}/terminals`,
        { headers: { authorization: `Bearer ${(location.hash.match(/token=([^&]+)/)?.[1]) ?? ''}` } },
      );
      terminalProbe.value = r.ok ? 'ok' : 'unavailable';
    } catch {
      terminalProbe.value = 'ok';
    }
  },
  { immediate: true },
);

watch(
  () => props.activeTab,
  (requested) => {
    if (requested !== undefined && requested !== null && requested !== activeTab.value) {
      activeTab.value = requested;
    }
  },
  { immediate: true },
);

watch(activeTab, (next) => {
  safeSetString(STORAGE_KEYS.rightPanelActiveTab, next);
  emit('update:activeTab', next);
});

interface TabSpec {
  id: RightPanelTab;
  labelKey: string;
  /** Optional icon for the workbar/tab buttons. */
  icon: 'file-edit' | 'file-text' | 'message' | 'code' | 'terminal' | 'clock' | 'sparkles' | 'check-list' | 'target';
  /** When true, the tab content is rendered (so the tab is always
   *  available, even when empty). */
  alwaysAvailable?: boolean;
  /** Returns true when the tab has content (drives the active highlight in
   *  the workbar above the composer). */
  hasContent: () => boolean;
}

const tabs = computed<TabSpec[]>(() => [
  {
    id: 'changes',
    labelKey: 'panel.tabs.changes',
    icon: 'file-edit',
    alwaysAvailable: true,
    hasContent: () => props.changedFiles.length > 0,
  },
  {
    id: 'sideChat',
    labelKey: 'panel.tabs.sideChat',
    icon: 'message',
    alwaysAvailable: true,
    hasContent: () => props.sideChat.turns.length > 0 || props.sideChat.sending,
  },
  {
    id: 'turnDiff',
    labelKey: 'panel.tabs.turnDiff',
    icon: 'code',
    alwaysAvailable: true,
    hasContent: () => latestTurnDiffEntries(props.turns).length > 0,
  },
  {
    id: 'terminal',
    labelKey: 'panel.tabs.terminal',
    icon: 'terminal',
    alwaysAvailable: true,
    // "Has content" only once the PTY probe confirms reachability — a plain
    // session id is not enough when the daemon is loopback-bound.
    hasContent: () => props.terminalAvailable && terminalProbe.value !== 'unavailable',
  },
  {
    id: 'bash',
    labelKey: 'panel.tabs.bash',
    icon: 'clock',
    hasContent: () => props.bashTasks.length > 0,
  },
  {
    id: 'subagents',
    labelKey: 'panel.tabs.subagents',
    icon: 'sparkles',
    hasContent: () => props.subagentTasks.length > 0,
  },
  {
    id: 'todos',
    labelKey: 'panel.tabs.todos',
    icon: 'check-list',
    hasContent: () => (props.todos?.length ?? 0) > 0,
  },
]);

// Always render all tabs in the order declared above (visible affordance).
// The workbar above the composer uses `hasContent` to hide entries whose
// backing list is empty; the right panel itself never collapses a tab so
// the user can navigate to an empty state without surprise.
const orderedTabs = computed(() => tabs.value);


function selectTab(id: RightPanelTab): void {
  if (RIGHT_PANEL_TABS.includes(id)) activeTab.value = id;
}

// Side chat / terminal / turn-diff content computations.
const turnDiffEntries = computed(() => latestTurnDiffEntries(props.turns));
const turnDiffSelected = ref<string | null>(null);

// Default the selected file in the turn-diff tab to the first entry whenever
// the active tab switches on, or whenever the entries change underneath it.
watch(
  [activeTab, turnDiffEntries],
  ([next, entries]) => {
    if (next !== 'turnDiff') return;
    if (entries.length === 0) {
      turnDiffSelected.value = null;
      return;
    }
    if (!entries.some((entry) => entry.path === turnDiffSelected.value)) {
      turnDiffSelected.value = entries[0]?.path ?? null;
    }
  },
  { immediate: true },
);

const turnDiffActiveEntry = computed(() => {
  const selected = turnDiffSelected.value;
  if (selected === null) return null;
  return turnDiffEntries.value.find((entry) => entry.path === selected) ?? null;
});

function openSideChatSend(text: string): void {
  emit('side-chat-send', text);
}

function openChangedFile(path: string): void {
  emit('open-changed-file', { path });
}
</script>

<template>
  <div ref="rootRef" class="rpt lg-lens">
    <header class="rpt-bar lg-glass">
      <Tooltip
        v-for="tab in orderedTabs"
        :key="tab.id"
        :text="t(tab.labelKey)"
      >
        <button
          type="button"
          class="rpt-tab ptb-"
          :class="{ 'is-on': tab.id === activeTab, 'has-content': tab.hasContent() }"
          role="tab"
          :aria-selected="tab.id === activeTab"
          :aria-label="t(tab.labelKey)"
          @click="selectTab(tab.id)"
        >
          <Icon :name="tab.icon" size="md" />
          <span v-if="tab.hasContent()" class="rpt-tab-dot" aria-hidden="true" />
        </button>
      </Tooltip>
      <span class="rpt-bar-sep" />
      <Tooltip :text="t('panel.close')">
        <IconButton
          size="sm"
          class="rpt-close"
          :label="t('panel.close')"
          @click="emit('close')"
        >
          <Icon name="close" size="sm" />
        </IconButton>
      </Tooltip>
    </header>

    <section
      v-show="activeTab === 'changes'"
      class="rpt-pane lg-frost"
      role="tabpanel"
    >
      <PanelHeader
        :title="t('panel.tabs.changes')"
        :subtitle="changedFiles.length > 0 ? `${changedFiles.length}` : ''"
        :close-label="t('panel.close')"
        @close="emit('close')"
      />
      <div class="rpt-pane-body">
        <ChangedFilesCard
          v-if="changedFiles.length > 0"
          :files="changedFiles"
          @open="openChangedFile"
        />
        <div v-else class="rpt-empty">{{ t('conversation.changedFiles.title') }}</div>
      </div>
    </section>

    <section
      v-show="activeTab === 'sideChat'"
      class="rpt-pane lg-frost"
      role="tabpanel"
    >
      <SideChatPanel
        :turns="sideChat.turns"
        :running="sideChat.running"
        :sending="sideChat.sending"
        @send="openSideChatSend"
        @close="emit('close')"
      />
    </section>

    <section
      v-show="activeTab === 'turnDiff'"
      class="rpt-pane lg-frost"
      role="tabpanel"
    >
      <PanelHeader
        :title="t('panel.tabs.turnDiff')"
        :subtitle="turnDiffEntries.length > 0 ? `${turnDiffEntries.length}` : ''"
        :close-label="t('panel.close')"
        @close="emit('close')"
      />
      <div class="rpt-pane-body rpt-turndiff">
        <div v-if="turnDiffEntries.length === 0" class="rpt-empty">{{ t('panel.turnDiffEmpty') }}</div>
        <template v-else>
          <ul class="rpt-turndiff-list">
            <li
              v-for="entry in turnDiffEntries"
              :key="entry.path"
              class="rpt-turndiff-row"
              :class="{ 'is-on': entry.path === turnDiffSelected }"
              :title="entry.path"
              @click="turnDiffSelected = entry.path"
            >
              <span class="rpt-turndiff-path">{{ entry.path }}</span>
              <span class="rpt-turndiff-state">{{ entry.status }}</span>
            </li>
          </ul>
          <div class="rpt-turndiff-detail">
            <div v-if="!turnDiffActiveEntry" class="rpt-empty">{{ t('panel.turnDiffUnavailable') }}</div>
            <template v-else>
              <DiffLines
                v-if="turnDiffActiveEntry.lines && turnDiffActiveEntry.lines.length > 0"
                :lines="turnDiffActiveEntry.lines"
              />
              <div
                v-else-if="turnDiffActiveEntry.output && turnDiffActiveEntry.output.length > 0"
                class="rpt-turndiff-output"
              >
                <div v-for="(line, i) in turnDiffActiveEntry.output" :key="i">{{ line }}</div>
              </div>
              <div v-else class="rpt-empty">{{ t('panel.turnDiffUnavailable') }}</div>
            </template>
          </div>
        </template>
      </div>
    </section>

    <section
      v-show="activeTab === 'terminal'"
      class="rpt-pane lg-frost"
      role="tabpanel"
    >
      <PanelHeader
        :title="t('panel.tabs.terminal')"
        :close-label="t('panel.close')"
        @close="emit('close')"
      />
      <div class="rpt-pane-body">
        <Terminal v-if="terminalAvailable && sessionId && terminalProbe !== 'unavailable'" :session-id="sessionId" />
        <div v-else class="rpt-empty">
          {{ terminalProbe === 'unavailable' ? t('panel.terminalLoopbackOnly') : t('panel.terminalUnavailable') }}
        </div>
      </div>
    </section>

    <section
      v-show="activeTab === 'bash'"
      class="rpt-pane lg-frost"
      role="tabpanel"
    >
      <PanelHeader
        :title="t('panel.tabs.bash')"
        :subtitle="`${bashTasks.length}`"
        :close-label="t('panel.close')"
        @close="emit('close')"
      />
      <div class="rpt-pane-body">
        <TasksPane
          :tasks="bashTasks"
          @cancel="emit('cancel-task', $event)"
          @detach="emit('detach-task', $event)"
        />
      </div>
    </section>

    <section
      v-show="activeTab === 'subagents'"
      class="rpt-pane lg-frost"
      role="tabpanel"
    >
      <PanelHeader
        :title="t('panel.tabs.subagents')"
        :subtitle="`${subagentTasks.length}`"
        :close-label="t('panel.close')"
        @close="emit('close')"
      />
      <div class="rpt-pane-body">
        <SubagentGrid
          :tasks="subagentTasks"
          @cancel="emit('cancel-task', $event)"
          @open="emit('open-agent', $event)"
        />
      </div>
    </section>

    <section
      v-show="activeTab === 'todos'"
      class="rpt-pane lg-frost"
      role="tabpanel"
    >
      <PanelHeader
        :title="t('panel.tabs.todos')"
        :subtitle="`${(todos ?? []).length}`"
        :close-label="t('panel.close')"
        @close="emit('close')"
      />
      <div class="rpt-pane-body">
        <TodoCard :todos="todos ?? []" />
        <div v-if="!todos || todos.length === 0">
          <PlanPanel
            v-if="planEntry || planMode"
            class="rpt-plan"
            :plan="planEntry ?? null"
            :plan-mode="planMode"
            :open-file="openFile"
          />
        </div>
        <PlanPanel
          v-else-if="planEntry || planMode"
          class="rpt-plan"
          :plan="planEntry ?? null"
          :plan-mode="planMode"
          :open-file="openFile"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.rpt {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* Tab bar: glass strip pinned at the top. Rhythm mirrors the upstream
   PanelTabBar: 28px tabs (their --panel-tab-h) centred in the shared
   --panel-head-h (48px) header row, tight --space-1 gaps (upstream uses
   2px between its labeled tabs; 4px keeps icon-only targets separable). */
.rpt-bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  height: var(--panel-head-h, 48px);
  box-sizing: border-box;
  padding: 0 var(--space-3);
  border-bottom: 1px solid var(--color-line);
  background: var(--color-surface);
}

.rpt-tab {
  position: relative;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    background var(--duration-base) var(--ease-out),
    color var(--duration-base) var(--ease-out),
    border-color var(--duration-base) var(--ease-out);
}
.rpt-tab:hover:not(.is-on) {
  background: var(--color-surface-sunken);
  color: var(--color-text);
}
.rpt-tab.is-on {
  background: color-mix(in srgb, var(--color-accent) 18%, transparent);
  color: var(--color-accent);
  border-color: color-mix(in srgb, var(--color-accent) 40%, var(--color-line));
}
.rpt-tab:focus-visible {
  outline: none;
  box-shadow: var(--p-focus-ring);
}
.rpt-tab-dot {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-accent);
  box-shadow: 0 0 0 2px var(--color-surface);
}

.rpt-bar-sep {
  flex: 1 1 auto;
}

.rpt-close {
  flex: none;
}

/* Each tab panel sits underneath the bar and fills the rest of the panel.
   Use v-show (not v-if) so the children preserve state across switches —
   e.g. the terminal WebSocket and side chat draft stay alive. */
.rpt-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-radius: 0;
  border: none;
  border-top: 0;
  overflow: hidden;
}

.rpt-pane-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-3);
}

.rpt-empty {
  padding: var(--space-6) var(--space-4);
  text-align: center;
  color: var(--color-text-faint);
  font-size: var(--text-sm);
}

.rpt-turndiff {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.rpt-turndiff-list {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 30%;
  overflow-y: auto;
}
.rpt-turndiff-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}
.rpt-turndiff-row:hover {
  background: var(--color-surface-sunken);
}
.rpt-turndiff-row.is-on {
  background: color-mix(in srgb, var(--color-accent) 14%, transparent);
  color: var(--color-accent);
}
.rpt-turndiff-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rpt-turndiff-state {
  flex: none;
  color: var(--color-text-faint);
  font-size: var(--text-xs);
}
.rpt-turndiff-detail {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: var(--color-surface-sunken);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
}
.rpt-turndiff-output {
  padding: 8px 12px;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Plan viewer tucked under todos: identical visual treatment as the old
   dock-work-panel. */
.rpt-plan {
  margin-top: var(--space-3);
}
</style>
