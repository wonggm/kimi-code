<!-- apps/kimi-web/src/components/chat/RightPanelPane.vue -->
<!-- What the right panel shows for the active tab. One pane per upstream kind:
     the changed-files view, one file's turn diff, the file preview, the agent
     transcript, a compaction summary, a side chat, a terminal. The tab strip and
     the panel's chrome live in PanelTabs.vue; this file only renders the body,
     so each pane can be re-shaped against upstream's component on its own. -->
<script setup lang="ts">
import { computed, inject } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AgentMember, ChatTurn, FilePreviewRequest, ToolMedia } from '../../types';
import type { AppTask } from '../../api/types';
import { toAgentMember } from '../../composables/messagesToTurns';
import { latestTurnDiffEntries } from '../../lib/rightPanelTabs';
import { FILE_PREVIEW_STATE_KEY } from '../../composables/useFilePreview';
import type { PanelTab } from '../../lib/panelTabs';
import ChangedFilesCard from './ChangedFilesCard.vue';
import ThinkingPanel from './ThinkingPanel.vue';
import SideChatPanel from './SideChatPanel.vue';
import AgentDetailPanel from './AgentDetailPanel.vue';
import DiffLines from './DiffLines.vue';
import FilePreview from '../FilePreview.vue';
import Terminal from '../Terminal.vue';

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

// ---- diff: the session's changed files --------------------------------------
function onChangedFile(event: unknown): void {
  if (typeof event === 'string') emit('open-file', { path: event });
  else if (event && typeof event === 'object' && 'path' in event) {
    const path = (event as { path?: unknown }).path;
    if (typeof path === 'string') emit('open-file', { path });
  }
}

// ---- turn diff: one file of the latest turn --------------------------------
const turnDiffTab = computed(() => (props.tab.kind === 'turn-diff' ? props.tab : null));
const fileTab = computed(() => (props.tab.kind === 'file' ? props.tab : null));
const agentTab = computed(() => (props.tab.kind === 'agent' ? props.tab : null));
const compactionTab = computed(() => (props.tab.kind === 'compaction' ? props.tab : null));
const termTab = computed(() => (props.tab.kind === 'term' ? props.tab : null));

const diffEntries = computed(() => latestTurnDiffEntries(props.turns));
const diffEntry = computed(() =>
  turnDiffTab.value ? diffEntries.value.find((entry) => entry.path === turnDiffTab.value?.path) : undefined,
);

// ---- file preview: the same state the app-level preview owns, provided by
// useFilePreview so the panel does not keep a second copy of it alive.
const preview = inject(FILE_PREVIEW_STATE_KEY, null);

// ---- agent transcript -------------------------------------------------------
/** The card hands over a task id, an agent id or the spawning tool call's id;
 *  the detail view renders the member behind whichever one matches. */
const agentMember = computed<AgentMember | null>(() => {
  const target = agentTab.value?.subagentId;
  if (target === undefined) return null;
  const tasks = props.appTasks ?? [];
  const task =
    tasks.find((tk) => tk.id === target) ??
    tasks.find((tk) => tk.agentId === target) ??
    tasks.find((tk) => tk.parentToolCallId === target) ??
    tasks.filter((tk) => tk.kind === 'subagent' && !tk.parentToolCallId).at(-1);
  return task ? toAgentMember(task) : null;
});

// ---- compaction summary -----------------------------------------------------
const compactionText = computed(() => {
  const turnId = compactionTab.value?.turnId;
  if (turnId === undefined) return '';
  return props.turns.find((entry) => entry.id === turnId)?.text ?? '';
});
</script>

<template>
  <div class="pane">
    <ChangedFilesCard
      v-if="tab.kind === 'diff'"
      :files="changedFiles"
      @open="onChangedFile"
    />

    <div v-else-if="tab.kind === 'turn-diff'" class="pane-scroll">
      <DiffLines v-if="diffEntry?.lines && diffEntry.lines.length > 0" :lines="diffEntry.lines" />
      <div v-else-if="diffEntry?.output && diffEntry.output.length > 0" class="pane-output">
        <div v-for="(line, index) in diffEntry.output" :key="index">{{ line }}</div>
      </div>
      <div v-else class="pane-empty">{{ t('panel.turnDiffUnavailable') }}</div>
    </div>

    <FilePreview
      v-else-if="tab.kind === 'file'"
      :file="preview?.previewFile.value ?? null"
      :loading="preview?.previewLoading.value ?? false"
      :error="preview?.previewError.value ?? null"
      :line="fileTab?.line"
      :download-url="preview?.previewDownloadUrl.value ?? null"
      :closable="false"
      :external-actions="preview?.previewExternalActions.value ?? false"
      :open-file="(target: FilePreviewRequest) => emit('open-file', target)"
      @close="preview?.closeFilePreview()"
      @open-external="preview?.openPreviewInEditor()"
      @reveal="preview?.revealPreviewFile()"
    />

    <AgentDetailPanel
      v-else-if="tab.kind === 'agent' && agentMember"
      :member="agentMember"
      :session-id="sessionId"
      :tasks="appTasks"
      :closable="false"
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
      :subtitle="t('panel.tabs.compaction')"
    />

    <SideChatPanel
      v-else-if="tab.kind === 'btw'"
      :turns="sideChat.turns"
      :running="sideChat.running"
      :sending="sideChat.sending"
      :closable="false"
      @send="emit('side-chat-send', $event)"
    />

    <Terminal
      v-else-if="termTab && terminalAvailable && sessionId"
      :session-id="sessionId"
    />
    <div v-else-if="tab.kind === 'term'" class="pane-empty">{{ t('panel.terminalUnavailable') }}</div>
  </div>
</template>

<style scoped>
.pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}
.pane-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-3);
}
.pane-output {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.pane-empty {
  padding: var(--space-6) var(--space-4);
  color: var(--color-text-faint);
  font-size: var(--text-sm);
  text-align: center;
}
</style>
