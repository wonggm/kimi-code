<!-- apps/kimi-web/src/components/chat/RightPanelTabs.vue -->
<!-- Right-side multi-tab panel — replaces the dock pills with a tabbed panel.
     Tabs: Changes / Side chat / Turn diff / Terminal / Bash / Sub agents /
     Todos. The tab bar is glass; the tab panes and the drill views are solid
     (content, not controls). The tab bar's ✕ is the panel's only close — the
     panes and the drill views render no close of their own, and the tab bar's
     back chevron (visible only while drilled in) is the only way to unwind a
     drill. Active tab persists in localStorage via STORAGE_KEYS.rightPanelActiveTab.
     Drill-downs started inside the panel (subagent card, plan file link)
     push a detail view onto an in-panel stack instead of opening the
     app-level right-side detail layer; the tab bar's back chevron or Escape
     while focus is inside the panel pops one level, and focus follows the
     stack in and back out. -->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AgentMember, ChatTurn, FileData, FilePreviewRequest, TaskItem, TodoView, ToolMedia } from '../../types';
import type { AppPlanEntry, AppTask } from '../../api/types';
import type { DetachTaskTarget } from '../../lib/detachTarget';
import ChangedFilesCard from './ChangedFilesCard.vue';
import SideChatPanel from './SideChatPanel.vue';
import TasksPane from './TasksPane.vue';
import SubagentGrid from './SubagentGrid.vue';
import TodoCard from './TodoCard.vue';
import PlanPanel from './PlanPanel.vue';
import AgentDetailPanel from './AgentDetailPanel.vue';
import FilePreview from '../FilePreview.vue';
import Terminal from '../Terminal.vue';
import DiffLines from './DiffLines.vue';
import PanelHeader from '../ui/PanelHeader.vue';
import IconButton from '../ui/IconButton.vue';
import Icon from '../ui/Icon.vue';
import Tooltip from '../ui/Tooltip.vue';
import { getKimiWebApi } from '../../api';
import { toAgentMember } from '../../composables/messagesToTurns';
import { STORAGE_KEYS, safeGetString, safeSetString } from '../../lib/storage';
import { useGlassRefraction } from '../../composables/useGlassRefraction';
import {
  coerceRightPanelTab,
  latestTurnDiffEntries,
  normalizePanelPreviewPath,
  popPanelDrill,
  pushPanelDrill,
  resolvePanelSubagentTaskId,
  RIGHT_PANEL_TABS,
  type PanelDrillView,
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
  /** Live session task rows in wire shape — the in-panel subagent drill reads
   *  these to rebuild the AgentMember the detail view renders (the TaskItem
   *  projections lack the phase / output / agent-id fields). */
  appTasks?: AppTask[];
  /** Absolute workspace root — normalizes absolute paths opened from the
   *  in-panel file drill. */
  workspaceRoot?: string;
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
  // Media opened from the in-panel subagent drill — no in-panel media viewer,
  // so it bubbles up to the app-level lightbox.
  'open-media': [media: ToolMedia];
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
  // Switching tabs leaves any drill detail behind: the stack always belongs
  // to the tab it was opened from.
  resetDrill();
});

// ---------------------------------------------------------------------------
// In-panel drill stack — a detail view (subagent preview, file preview)
// opened from inside a tab renders on top of the tab pane instead of
// replacing the transcript-area side pane: list → detail → back. Tab switches
// reset the stack (see the activeTab watch); nested opens push further
// entries; close / back pop one level at a time.
//
// Focus follows the stack. Opening a drill moves it into the (labelled) detail
// section, popping hands it back to the element that opened that level. The
// list panes are v-show'd, so the trigger is captured when the level is pushed
// — after that its pane is hidden and cannot be looked up again.
// ---------------------------------------------------------------------------
const drillStack = ref<PanelDrillView[]>([]);
const drillTriggers: (HTMLElement | null)[] = [];
let lastDrillPointerTarget: HTMLElement | null = null;
const drillTop = computed<PanelDrillView | null>(
  () => drillStack.value.at(-1) ?? null,
);
const drillAgentView = computed(() =>
  drillTop.value?.kind === 'agent' ? drillTop.value : null,
);
const drillFileView = computed(() =>
  drillTop.value?.kind === 'file' ? drillTop.value : null,
);
/** A subagent transcript needs more room than a list, so the panel widens while
 *  an agent view is on top of the stack (the width rule lives with .right-panel
 *  in ConversationPane). A file drill keeps the default width. */
const drillWidensPanel = computed(() => drillTop.value?.kind === 'agent');

function pushDrill(view: PanelDrillView): void {
  const trigger = currentDrillTrigger();
  const next = pushPanelDrill(drillStack.value, view);
  // Re-pushing what is already on top is a no-op — it must not stack a second
  // trigger or pull focus out of the list again.
  if (next.length === drillStack.value.length) return;
  drillStack.value = next;
  drillTriggers.push(trigger);
  void nextTick(focusDrillSection);
}

function popDrill(): void {
  if (drillStack.value.length === 0) return;
  const trigger = drillTriggers.pop() ?? null;
  drillStack.value = popPanelDrill(drillStack.value);
  void nextTick(() => {
    if (drillStack.value.length > 0) {
      focusDrillSection();
      return;
    }
    focusListTrigger(trigger);
  });
}

function resetDrill(): void {
  drillStack.value = [];
  drillTriggers.length = 0;
}

/** Where focus came from when a drill opened: the focused element inside the
 *  panel (keyboard), else whatever the pointer last went down on — a mouse
 *  click does not focus a button in every engine, and the subagent rows are
 *  non-focusable `role="button"` divs. */
function currentDrillTrigger(): HTMLElement | null {
  const active = document.activeElement;
  if (
    active instanceof HTMLElement
    && active !== document.body
    && rootRef.value?.contains(active)
  ) {
    return active;
  }
  return lastDrillPointerTarget;
}

function onPanelPointerdown(event: PointerEvent): void {
  const target = event.target;
  lastDrillPointerTarget =
    target instanceof Element
      ? target.closest<HTMLElement>('button, a[href], [role="button"], [tabindex]')
      : null;
}

/** The detail section currently on top (only one of the two drill views is
 *  mounted at a time); focusing it announces the region under a screen reader. */
function focusDrillSection(): void {
  rootRef.value?.querySelector<HTMLElement>('.rpt-drill')?.focus();
}

/** Hand focus back to the row that opened the popped level. A trigger in a
 *  `display:none` pane (null offsetParent) cannot take focus, and a level that
 *  sat inside a drill view is gone when that view re-renders — either way the
 *  selected tab in the always-visible bar is the landing spot. */
function focusListTrigger(trigger: HTMLElement | null): void {
  if (trigger?.isConnected && trigger.offsetParent !== null) {
    trigger.focus();
    // A trigger that is not actually focusable swallows the call (the subagent
    // rows are `role="button"` divs without a tabindex) — then the tab button
    // is the only place left that a keyboard user can carry on from.
    if (document.activeElement === trigger) return;
  }
  rootRef.value?.querySelector<HTMLElement>('.rpt-tab.is-on')?.focus();
}

/** Escape unwinds one drill level at a time while focus is inside the panel.
 *  In capture phase so it lands before the conversation pane's document-level
 *  Escape → interrupt, and inert on an empty stack, which leaves the
 *  app-level detail layer's Escape handling in App.vue alone. */
function onPanelKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || drillStack.value.length === 0) return;
  // An IME composition owns Escape (cancel the candidate window).
  if (event.isComposing) return;
  event.preventDefault();
  event.stopPropagation();
  popDrill();
}

function openAgentInPanel(target: string): void {
  pushDrill({
    kind: 'agent',
    taskId: resolvePanelSubagentTaskId(props.appTasks ?? [], target) ?? target,
  });
}

function openFileInPanel(target: FilePreviewRequest): void {
  pushDrill({ kind: 'file', path: target.path, line: target.line });
}

// Subagent drill view model: rebuild the AgentMember from the live task row.
// A background refresh can transiently drop the row while the panel is open,
// so keep the last resolved member keyed by task id (same guard as the
// app-level panel).
const drillAgentTaskId = computed(() => drillAgentView.value?.taskId ?? null);
const lastDrillAgentMember = ref<AgentMember | null>(null);
const drillAgentMember = computed<AgentMember | null>(() => {
  const id = drillAgentTaskId.value;
  if (!id) {
    lastDrillAgentMember.value = null;
    return null;
  }
  const task = (props.appTasks ?? []).find((tk) => tk.id === id);
  const member = task ? toAgentMember(task) : null;
  if (member) lastDrillAgentMember.value = member;
  return member ?? (lastDrillAgentMember.value?.id === id ? lastDrillAgentMember.value : null);
});

// File drill view model: read through the same REST route the app-level
// preview uses, request-sequence-guarded so a slow earlier read cannot
// overwrite the newest drill entry.
const panelFile = ref<FileData | null>(null);
const panelFileLoading = ref(false);
const panelFileError = ref<string | null>(null);
const panelFileDownloadUrl = ref<string | null>(null);
let panelFileSeq = 0;

watch(
  () => [drillFileView.value?.path, drillFileView.value?.line, props.sessionId] as const,
  async ([path, , sid]) => {
    const requestSeq = ++panelFileSeq;
    panelFile.value = null;
    panelFileError.value = null;
    panelFileDownloadUrl.value = null;
    if (path === undefined) {
      panelFileLoading.value = false;
      return;
    }
    const normalized = normalizePanelPreviewPath(path, props.workspaceRoot);
    if ('error' in normalized) {
      panelFileLoading.value = false;
      panelFileError.value = t(`filePreview.errors.${normalized.error}`);
      return;
    }
    if (!sid) {
      panelFileLoading.value = false;
      panelFileError.value = t('filePreview.errors.loadFailed');
      return;
    }
    panelFileLoading.value = true;
    try {
      const result = await getKimiWebApi().readFile(sid, { path: normalized.path });
      if (requestSeq !== panelFileSeq) return;
      panelFile.value = {
        path: result.path || normalized.path,
        content: result.content,
        encoding: result.encoding,
        mime: result.mime,
        languageId: result.languageId,
        isBinary: result.isBinary,
        size: result.size,
        lineCount: result.lineCount,
      };
      panelFileDownloadUrl.value = getKimiWebApi().getFileDownloadUrl(sid, normalized.path);
    } catch (error) {
      if (requestSeq !== panelFileSeq) return;
      panelFileError.value =
        error instanceof Error ? error.message : t('filePreview.errors.loadFailed');
    } finally {
      if (requestSeq === panelFileSeq) panelFileLoading.value = false;
    }
  },
  { immediate: true },
);

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
  if (!RIGHT_PANEL_TABS.includes(id)) return;
  // Re-clicking the tab that a drill was opened from must also drop the
  // drill (activeTab would not change, so the reset watch never fires).
  resetDrill();
  activeTab.value = id;
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
  openFileInPanel({ path });
}
</script>

<template>
  <div
    ref="rootRef"
    class="rpt lg-lens"
    :class="{ 'right-panel-wide': drillWidensPanel }"
    @keydown.capture="onPanelKeydown"
    @pointerdown="onPanelPointerdown"
  >
    <header class="rpt-bar lg-glass">
      <Tooltip v-if="drillStack.length > 0" :text="t('panel.back')">
        <IconButton
          size="sm"
          class="rpt-back"
          :label="t('panel.back')"
          @click="popDrill()"
        >
          <Icon name="chevron-left" size="sm" />
        </IconButton>
      </Tooltip>
      <!-- aria-selected drops while drilled: the selected tab's panel is hidden
           behind the detail view, so the tab must not claim it. -->
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
          :aria-selected="tab.id === activeTab && drillStack.length === 0"
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
      v-show="activeTab === 'changes' && drillStack.length === 0"
      class="rpt-pane"
      role="tabpanel"
    >
      <PanelHeader
        :title="t('panel.tabs.changes')"
        :subtitle="changedFiles.length > 0 ? `${changedFiles.length}` : ''"
        :closable="false"
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
      v-show="activeTab === 'sideChat' && drillStack.length === 0"
      class="rpt-pane"
      role="tabpanel"
    >
      <SideChatPanel
        :turns="sideChat.turns"
        :running="sideChat.running"
        :sending="sideChat.sending"
        :closable="false"
        @send="openSideChatSend"
      />
    </section>

    <section
      v-show="activeTab === 'turnDiff' && drillStack.length === 0"
      class="rpt-pane"
      role="tabpanel"
    >
      <PanelHeader
        :title="t('panel.tabs.turnDiff')"
        :subtitle="turnDiffEntries.length > 0 ? `${turnDiffEntries.length}` : ''"
        :closable="false"
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
      v-show="activeTab === 'terminal' && drillStack.length === 0"
      class="rpt-pane"
      role="tabpanel"
    >
      <PanelHeader
        :title="t('panel.tabs.terminal')"
        :closable="false"
      />
      <div class="rpt-pane-body">
        <Terminal v-if="terminalAvailable && sessionId && terminalProbe !== 'unavailable'" :session-id="sessionId" />
        <div v-else class="rpt-empty">
          {{ terminalProbe === 'unavailable' ? t('panel.terminalLoopbackOnly') : t('panel.terminalUnavailable') }}
        </div>
      </div>
    </section>

    <section
      v-show="activeTab === 'bash' && drillStack.length === 0"
      class="rpt-pane"
      role="tabpanel"
    >
      <PanelHeader
        :title="t('panel.tabs.bash')"
        :subtitle="`${bashTasks.length}`"
        :closable="false"
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
      v-show="activeTab === 'subagents' && drillStack.length === 0"
      class="rpt-pane"
      role="tabpanel"
    >
      <PanelHeader
        :title="t('panel.tabs.subagents')"
        :subtitle="`${subagentTasks.length}`"
        :closable="false"
      />
      <div class="rpt-pane-body">
        <SubagentGrid
          :tasks="subagentTasks"
          @cancel="emit('cancel-task', $event)"
          @open="openAgentInPanel"
        />
      </div>
    </section>

    <section
      v-show="activeTab === 'todos' && drillStack.length === 0"
      class="rpt-pane"
      role="tabpanel"
    >
      <PanelHeader
        :title="t('panel.tabs.todos')"
        :subtitle="`${(todos ?? []).length}`"
        :closable="false"
      />
      <div class="rpt-pane-body">
        <TodoCard :todos="todos ?? []" />
        <div v-if="!todos || todos.length === 0">
          <PlanPanel
            v-if="planEntry || planMode"
            class="rpt-plan"
            :plan="planEntry ?? null"
            :plan-mode="planMode"
            :open-file="openFileInPanel"
          />
        </div>
        <PlanPanel
          v-else-if="planEntry || planMode"
          class="rpt-plan"
          :plan="planEntry ?? null"
          :plan-mode="planMode"
          :open-file="openFileInPanel"
        />
      </div>
    </section>

    <!-- In-panel drill views: rendered on top of the tab panes (the panes'
         v-show goes off while the stack is non-empty). The tab bar's back
         chevron (and Escape while focus is inside the panel) pops one level.
         Nested opens (file link / nested agent inside the subagent detail)
         push further entries onto the same stack. -->
    <section
      v-if="drillAgentView"
      class="rpt-pane rpt-drill"
      role="region"
      tabindex="-1"
      :aria-label="t('panel.drillAgentLabel')"
    >
      <AgentDetailPanel
        v-if="drillAgentMember"
        :member="drillAgentMember"
        :session-id="sessionId"
        :tasks="appTasks"
        :closable="false"
        @open-file="openFileInPanel"
        @open-media="emit('open-media', $event)"
        @open-agent="openAgentInPanel"
      />
      <div v-else class="rpt-empty">{{ t('panel.agentGone') }}</div>
    </section>

    <section
      v-else-if="drillFileView"
      class="rpt-pane rpt-drill"
      role="region"
      tabindex="-1"
      :aria-label="t('panel.drillFileLabel')"
    >
      <FilePreview
        :file="panelFile"
        :loading="panelFileLoading"
        :error="panelFileError"
        :line="drillFileView.line"
        :download-url="panelFileDownloadUrl"
        :closable="false"
        :external-actions="false"
        :open-file="openFileInPanel"
      />
    </section>
  </div>
</template>

<style scoped>
/* The root is the flex column that stacks the bar over the current pane. It
   carries no height of its own: as the floating card it is absolutely
   positioned by ConversationPane's .right-panel insets, and a height:100% here
   over-constrains top + bottom — the browser then drops `bottom` and the card
   runs down behind the composer. */
.rpt {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* Tab bar: glass strip pinned at the top. Rhythm mirrors the upstream
   PanelTabBar: 28px tabs (their --panel-tab-h) centred in the shared
   --panel-head-h (48px) header row, tight --space-1 gaps (upstream uses
   2px between its labeled tabs; 4px keeps icon-only targets separable).
   Transparent like the panes, so the root frost material runs through the
   whole panel; the bottom hairline is the only separator. */
.rpt-bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  height: var(--panel-head-h, 48px);
  box-sizing: border-box;
  padding: 0 var(--space-3);
  border-bottom: 1px solid var(--color-line);
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

.rpt-back {
  flex: none;
}

.rpt-close {
  flex: none;
}

/* Each tab panel sits underneath the bar and fills the rest of the panel.
   Use v-show (not v-if) so the children preserve state across switches —
   e.g. the terminal WebSocket and side chat draft stay alive. Panes and drill
   views are transparent: the blur comes from the panel root's own frost
   backdrop-filter, so the content area shows the same material as the frame
   (a backdrop-filter of their own would nest inside the panel's and render
   nothing). In the non-glass and opaque-demoted regimes the root carries a
   solid background, which shows through the same way. The tab bar keeps its
   bottom hairline, so the detail views need no separator of their own. */
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
