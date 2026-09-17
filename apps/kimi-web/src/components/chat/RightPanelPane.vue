<!-- apps/kimi-web/src/components/chat/RightPanelPane.vue -->
<!-- What the right panel shows for the active tab. One pane per upstream kind:
     the changed-files view (which drills into one file's diff in place), the
     turn diff, the file preview, the agent pane (a subagent's transcript, or a
     bash task's command and output), a compaction summary, a side chat, a
     terminal. The tab strip and the panel's chrome live in PanelTabs.vue; this
     file only renders the body, so each pane can be re-shaped against upstream's
     component on its own. -->
<script setup lang="ts">
import { computed, inject } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ChatTurn, FilePreviewRequest, ToolMedia } from '../../types';
import type { AppTask } from '../../api/types';
import { useKimiWebClient } from '../../composables/useKimiWebClient';
import { useDetailPanel } from '../../composables/useDetailPanel';
import { latestTurnDiffEntries } from '../../lib/rightPanelTabs';
import { FILE_PREVIEW_STATE_KEY } from '../../composables/useFilePreview';
import type { PanelTab } from '../../lib/panelTabs';
import DiffView from './DiffView.vue';
import ThinkingPanel from './ThinkingPanel.vue';
import SideChatPanel from './SideChatPanel.vue';
import AgentDetailPanel from './AgentDetailPanel.vue';
import BashTaskPanel from './BashTaskPanel.vue';
import TurnDiffPanel from './TurnDiffPanel.vue';
import FilePreview from '../FilePreview.vue';
import Terminal from '../Terminal.vue';
import Icon from '../ui/Icon.vue';

const props = defineProps<{
  tab: PanelTab;
  turns: ChatTurn[];
  changedFiles: string[];
  appTasks?: AppTask[];
  sideChat: { turns: ChatTurn[]; running: boolean; sending: boolean };
  sessionId?: string;
  terminalAvailable: boolean;
}>();

const emit = defineEmits<{
  'side-chat-send': [text: string];
  'open-media': [media: ToolMedia];
  'cancel-task': [taskId: string];
  'open-file': [target: FilePreviewRequest];
  'open-agent': [target: string];
}>();

const { t } = useI18n();

// The pane reads the same singleton client state the rest of the app does: the
// diff tab's file list, git info and loaded diff, and the session's cwd.
const client = useKimiWebClient();
const {
  detailDiffMode,
  detailDiffPath,
  selectDiffFile,
  closeDiffDetail,
  agentPanelMember,
} = useDetailPanel({ client });

// ---- diff: the session's changed files, drilling into one file's diff ------
function openDiffFile(path: string): void {
  void selectDiffFile(path);
}

// Back returns to the list without closing the tab (upstream's `onBack`).
function closeDiffDetailView(): void {
  closeDiffDetail();
}

function refreshDiff(): void {
  const path = detailDiffPath.value;
  if (path !== null) void client.loadFileDiff(path);
}

// ---- turn diff: one file of the latest turn --------------------------------
const turnDiffTab = computed(() => (props.tab.kind === 'turn-diff' ? props.tab : null));
const fileTab = computed(() => (props.tab.kind === 'file' ? props.tab : null));
const compactionTab = computed(() => (props.tab.kind === 'compaction' ? props.tab : null));
const termTab = computed(() => (props.tab.kind === 'term' ? props.tab : null));

const diffEntries = computed(() => latestTurnDiffEntries(props.turns));
const diffEntry = computed(() =>
  turnDiffTab.value ? diffEntries.value.find((entry) => entry.path === turnDiffTab.value?.path) : undefined,
);
const turnDiffLoading = computed(() => diffEntry.value?.status === 'running');

// ---- file preview: the same state the app-level preview owns, provided by
// useFilePreview so the panel does not keep a second copy of it alive.
const preview = inject(FILE_PREVIEW_STATE_KEY, null);

// ---- agent transcript -------------------------------------------------------
/** The member behind the tab, resolved by the panel's data layer (task id,
 *  agent id or the spawning tool call's id — the pane does not care which),
 *  with the subagent's prompt filled in from its `Agent` tool call. */
const agentMember = agentPanelMember;

// ---- compaction summary -----------------------------------------------------
const compactionText = computed(() => {
  const turnId = compactionTab.value?.turnId;
  if (turnId === undefined) return '';
  return props.turns.find((entry) => entry.id === turnId)?.text ?? '';
});
</script>

<template>
  <DiffView
    v-if="tab.kind === 'diff'"
    :changes="client.changes.value"
    :git-info="client.gitInfo.value"
    :file-diff="client.fileDiff.value"
    :selected-diff-path="detailDiffPath"
    :file-diff-loading="client.fileDiffLoading.value"
    :mode="detailDiffMode"
    @open="openDiffFile"
    @back="closeDiffDetailView"
    @refresh="refreshDiff"
  />

  <TurnDiffPanel
    v-else-if="tab.kind === 'turn-diff'"
    :path="tab.path"
    :cwd="client.status.value.cwd"
    :lines="diffEntry?.lines"
    :loading="turnDiffLoading"
    @open-file="emit('open-file', { path: $event })"
  />

  <FilePreview
    v-else-if="tab.kind === 'file'"
    :file="preview?.previewFile.value ?? null"
    :loading="preview?.previewLoading.value ?? false"
    :error="preview?.previewError.value ?? null"
    :line="fileTab?.line"
    :download-url="preview?.previewDownloadUrl.value ?? null"
    :display-path="preview?.previewTarget.value?.path"
    :closable="false"
    :external-actions="preview?.previewExternalActions.value ?? false"
    :stale="preview?.previewStale.value ?? false"
    :refreshing="preview?.previewRefreshing.value ?? false"
    :open-file="(target: FilePreviewRequest) => emit('open-file', target)"
    @close="preview?.closeFilePreview()"
    @open-external="preview?.openPreviewInEditor()"
    @reveal="preview?.revealPreviewFile()"
    @refresh="preview?.refreshPreview()"
  />

  <BashTaskPanel
    v-else-if="tab.kind === 'agent' && agentMember?.kind === 'bash'"
    :member="agentMember"
  />

  <AgentDetailPanel
    v-else-if="tab.kind === 'agent' && agentMember"
    :member="agentMember"
    :session-id="sessionId"
    :tasks="appTasks"
    @open-file="emit('open-file', $event)"
    @open-media="emit('open-media', $event)"
    @open-agent="emit('open-agent', $event)"
  />
  <div v-else-if="tab.kind === 'agent'" class="pane-empty">{{ t('panel.agentGone') }}</div>

  <!-- Upstream renders its compaction tab with the ThinkingPanel component
       (`compaction: put`, where `put` wraps `__name:"ThinkingPanel"`), and the
       fork's own panel is built for exactly this double duty. -->
  <ThinkingPanel
    v-else-if="tab.kind === 'compaction'"
    :text="compactionText"
  />

  <SideChatPanel
    v-else-if="tab.kind === 'btw'"
    :turns="sideChat.turns"
    :running="sideChat.running"
    :sending="sideChat.sending"
    @send="emit('side-chat-send', $event)"
    @open-media="emit('open-media', $event)"
  />

  <Terminal
    v-else-if="termTab && terminalAvailable && sessionId"
    :session-id="sessionId"
  />
  <div v-else-if="tab.kind === 'term'" class="pane-empty">{{ t('panel.terminalUnavailable') }}</div>

  <!-- The browser's own pane. Its page lives in the desktop shell's browser;
       a web session has none, which is what upstream's own text says. -->
  <div v-else-if="tab.kind === 'browser'" class="browser-pane">
    <Icon name="browser" size="lg" class="browser-pane-icon" />
    <div class="browser-pane-text">{{ t('browser.unavailable') }}</div>
  </div>
</template>

<style scoped>
/* The pane element itself is the body's direct child (upstream's shape), so the
   fill comes from PanelTabs' `.pt-body > *` rule — no wrapper of our own. Only
   the two "gone" fallbacks need their own box. */
.pane-empty {
  height: 100%;
  box-sizing: border-box;
  padding: var(--space-6) var(--space-4);
  color: var(--color-text-faint);
  font-size: var(--text-sm);
  text-align: center;
}
/* The browser pane's own empty state: no page, and nothing the web app can do
   about it — the shell that renders it is the desktop app's. */
.browser-pane {
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-6) var(--space-4);
  color: var(--color-text-faint);
  text-align: center;
}
.browser-pane-icon {
  color: var(--color-text-faint);
}
.browser-pane-text {
  font-size: var(--text-sm);
}
</style>
