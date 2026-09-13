<!-- apps/kimi-web/src/components/chat/ConversationPane.vue -->
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, provide, ref, watch, type ComponentPublicInstance } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ActivationBadges, ApprovalBlock, ChatTurn, ConversationStatus, FilePreviewRequest, PermissionMode, QueuedPromptView, TaskItem, TodoView, ToolMedia, TurnAttachment, UIQuestion, WorkspaceView } from '../../types';
import type { AppGoal, AppModel, AppPlanEntry, AppSkill, AppTask, QuestionResponse, ThinkingLevel } from '../../api/types';
import type { FileItem } from './MentionMenu.vue';
import type { DetachTaskTarget } from '../../lib/detachTarget';
import type { PromptAttachment } from '../../composables/useKimiWebClient';
import ChatPane from './ChatPane.vue';
import ChatHeader from './ChatHeader.vue';
import Composer from './Composer.vue';
import ChatDock from './ChatDock.vue';
import PanelTabs from './PanelTabs.vue';
import RightPanelPane from './RightPanelPane.vue';
import { normalizePanelPreviewPath } from '../../lib/rightPanelTabs';
import { PANEL_PREVIEW_MIN, useRightPanel } from '../../composables/useRightPanel';
import ConversationToc, { type ConversationTocItem } from './ConversationToc.vue';
import EmptyDoodle from './EmptyDoodle.vue';
import SelectionQuoteBubble from './SelectionQuoteBubble.vue';
import Icon from '../ui/Icon.vue';
import IconButton from '../ui/IconButton.vue';
import Spinner from '../ui/Spinner.vue';
import Tooltip from '../ui/Tooltip.vue';
import { isMacosDesktop } from '../../lib/desktopFlag';
import { getVisibleWorkspaces } from '../../lib/workspacePicker';
import { safeRemove, STORAGE_KEYS } from '../../lib/storage';
import { normalizeToolName } from '../../lib/toolMeta';
import { useComposerQuoteRequest } from '../../composables/useSelectionQuote';

const { t } = useI18n();

const props = defineProps<{
  turns: ChatTurn[];
  sessionId?: string;
  sideChatTurns?: ChatTurn[];
  sideChatRunning?: boolean;
  sideChatSending?: boolean;
  approvals?: { approvalId: string; block: ApprovalBlock; agentName?: string }[];
  gitInfo?: { branch: string; ahead: number; behind: number } | null;
  tasks: TaskItem[];
  /** Live session task rows in wire shape — forwarded to the right panel, whose
   *  in-panel subagent drill rebuilds AgentMember records from them. */
  appTasks?: AppTask[];
  /** ExitPlanMode plan history of the active session, timeline order — the
   *  dock's plan pill shows the latest entry; the plan panel renders it. */
  plans?: AppPlanEntry[];
  /** Model-maintained todo list (TodoList tool) — shown as a floating card. */
  todos?: TodoView[];
  goal?: AppGoal | null;
  goalLive?: { elapsedMs: number; turnsUsed: number; tokensTotal: number } | null;
  activationBadges?: ActivationBadges;
  status: ConversationStatus;
  thinking?: ThinkingLevel;
  planMode?: boolean;
  /** Plan mode staged for the next send (+ menu / `/plan`) — local only. */
  planArmed?: boolean;
  swarmMode?: boolean;
  goalMode?: boolean;
  questions?: UIQuestion[];
  /** Question ids with an in-flight respond/dismiss (drives the card loading
   *  state). Keyed by questionId with the action kind. */
  pendingQuestionActions?: Record<string, 'answer' | 'dismiss'>;
  /** Approval ids with an in-flight respond (drives the card loading state). */
  pendingApprovalActions?: Record<string, true>;
  /** Session busy (any agent, incl. background work) — Stop/Escape affordances. */
  running?: boolean;
  /** MAIN agent turn in flight — the conversation's streaming state (streaming
   *  reveal, turn-end scroll settle). Background-only work does NOT set this. */
  turnActive?: boolean;
  queued?: QueuedPromptView[];
  searchFiles?: (q: string) => Promise<FileItem[]>;
  uploadImage?: (file: Blob, name?: string) => Promise<{ fileId: string; name: string; mediaType: string } | null>;
  /** Git changed files (only used for the header diff counter dot). */
  changes?: { path: string; status: string }[];
  /** Cache-buster that remounts the chat pane when the active session changes. */
  fileReloadKey?: string | number;
  /** The main conversation has an unfinished prompt (submitted or a main turn
   *  in flight) — the working moon. */
  working?: boolean;
  /** Frontend-only automatic retry progress. */
  retryProgress?: { attempt: number; maxAttempts: number } | null;
  /** Persistent failed-turn state restored from the session snapshot when present. */
  failure?: { message?: string; promptId?: string } | null;
  /** True while the empty-composer first prompt is being created + submitted.
   *  Drives the empty-session "starting conversation…" loading state. */
  starting?: boolean;
  fastMoon?: boolean;
  /** Mobile shell: compact chrome. */
  mobile?: boolean;
  /** True while switching sessions and the turns array is not yet loaded. */
  sessionLoading?: boolean;
  /** Live compaction state of the active session (non-null while running). */
  compaction?: { status: 'running' } | null;
  /** Whether there are older messages available to load when scrolling up. */
  hasMoreMessages?: boolean;
  /** True while older messages are being fetched (scroll-up lazy load). */
  loadingMore?: boolean;
  /** True when the last older-message fetch failed; blocks sentinel auto-retry. */
  loadingMoreError?: boolean;
  /** Callback to fetch the next older page of messages. */
  loadOlderMessages?: (sessionId: string) => Promise<void>;
  /** Available models for the quick-switch dropdown in the composer toolbar. */
  models?: AppModel[];
  /** Starred model ids shown at the top of the composer's quick-switch dropdown. */
  starredIds?: string[];
  /** Session skills shown in the composer `/` menu. */
  skills?: AppSkill[];
  /** Workspace name shown in the empty-session hint above the centred composer. */
  workspaceName?: string;
  /** Absolute workspace root path. */
  workspaceRoot?: string;
  /** Git diff line stats for the header diff counter (mirrors kimi-cli/web). */
  gitDiffStats?: { totalAdditions: number; totalDeletions: number } | null;
  /** Workspaces for the empty-composer picker (start a conversation elsewhere). */
  workspaces?: WorkspaceView[];
  /** Active workspace id, to highlight the current entry in the picker. */
  activeWorkspaceId?: string | null;
  /** Active session title, shown in the chat header. */
  sessionTitle?: string;
  /** Whether the active session is pinned in the sidebar — drives the ⋮ menu's
   *  Pin/Unpin entry. */
  sessionPinned?: boolean;
  /** GitHub PR for the current branch, when known (shown in the chat header). */
  pr?: { number: number; state: string; url: string } | null;
  /** Conversation outline: proportional bubbles, viewport indicator, hover tooltip. */
  conversationToc?: boolean;
}>();

const emit = defineEmits<{
  submit: [payload: { text: string; attachments: PromptAttachment[] }];
  steer: [payload: { text: string; attachments: PromptAttachment[] }];
  approval: [approvalId: string, response: { decision: 'approved' | 'rejected' | 'cancelled'; scope?: 'session'; feedback?: string }];
  cancelTask: [taskId: string];
  sideChatSend: [text: string];
  answer: [questionId: string, response: QuestionResponse];
  dismiss: [questionId: string];
  command: [cmd: string, attachments?: PromptAttachment[]];
  interrupt: [];
  unqueue: [index: number];
  editQueued: [index: number];
  reorderQueue: [payload: { from: number; to: number }];
  setPermission: [mode: PermissionMode];
  setThinking: [level: ThinkingLevel];
  togglePlan: [];
  togglePlanArmed: [];
  toggleSwarm: [];
  toggleGoal: [];
  createGoal: [objective: string];
  controlGoal: [action: 'pause' | 'resume' | 'cancel'];
  compact: [];
  pickModel: [];
  selectModel: [modelId: string];
  openFile: [target: FilePreviewRequest];
  openMedia: [media: ToolMedia];
  openCompaction: [target: { turnId: string }];
  openAgent: [toolCallId: string];
  openToolDiff: [id: string];
  /** Panel's New-tab menu → Side chat: start one (creating the session when the
   *  composer is still empty) and open its tab. */
  openSideChat: [];
  /** Send a running foreground task (card or task-list row) to the background. */
  detachTask: [target: DetachTaskTarget];
  /** Chat header / files pane: focus the diff detail layer and refresh git status. */
  openChanges: [];
  refreshGitStatus: [];
  /** Edit + resend the last user message (App undoes, then refills composer). */
  editMessage: [payload: { text: string; attachments?: TurnAttachment[] }];
  /** Resume the last failed model request using the parent's normal retry path. */
  resumeFailure: [];
  /** Empty-composer workspace picker: start a new conversation elsewhere. */
  selectWorkspace: [workspaceId: string];
  /** Empty-composer workspace picker: create a new workspace. */
  addWorkspace: [];
  /** Chat header: open the GitHub PR in a new tab. */
  openPr: [url: string];
  /** Chat header / session row: rename current session. */
  renameSession: [id: string, title: string];
  /** Chat header / session row: fork current session. */
  forkSession: [id: string];
  /** Chat header / session row: archive current session. */
  archiveSession: [id: string];
  /** Chat header: export current session. */
  exportSession: [id: string];
  /** Chat header: flip the current session's pinned state. */
  togglePinSession: [id: string, pinned: boolean];
  /** Inline queue: steer one queued message into the running turn. */
  steerQueued: [index: number];
  /** Inline queue: send one queued message immediately. */
  sendQueued: [index: number];
}>();

// Empty-composer workspace picker.
const wsPickOpen = ref(false);
const wsPickExpanded = ref(false);

const activeWorkspaceLabel = computed(() => {
  const w = props.workspaces?.find((ws) => ws.id === props.activeWorkspaceId);
  return w?.name ?? props.workspaceName ?? '';
});

const hasWorkspaces = computed(() => (props.workspaces?.length ?? 0) > 0);

const visibleWorkspaces = computed(() =>
  getVisibleWorkspaces(props.workspaces ?? [], props.activeWorkspaceId, wsPickExpanded.value),
);

const hiddenWorkspaceCount = computed(
  () => (props.workspaces?.length ?? 0) - visibleWorkspaces.value.length,
);

// Collapse the expanded list when the dropdown closes so it doesn't stay open
// the next time the user opens the menu.
watch(wsPickOpen, (open) => {
  if (!open) wsPickExpanded.value = false;
});

function pickWorkspace(id: string): void {
  wsPickOpen.value = false;
  if (id !== props.activeWorkspaceId) emit('selectWorkspace', id);
}

// The align toggle was removed with its UI (6e50cb7) — reading layout is
// always centered now. Drop the old persisted preference so users who once
// picked 'left' aren't frozen on it with no way back.
safeRemove(STORAGE_KEYS.contentAlign);

const chatPaneRef = ref<InstanceType<typeof ChatPane> | null>(null);
const emptyComposerRef = ref<ComposerHandle | null>(null);
const dockedComposerRef = ref<ComposerHandle | null>(null);
const copyConversationCopied = ref(false);
const goalExpandSignal = ref(0);
let copyConversationCopiedTimer: ReturnType<typeof setTimeout> | null = null;

/** Load text (and any attachments) into whichever composer is currently mounted
    (docked vs the empty-session composer). Used by App for "edit & resend the
    last message", and by the queue when a pending prompt is loaded for edit.
    Returns false when no composer is actually able to receive the content (e.g.
    the dock is showing a pending question/approval and the composer is hidden),
    so the caller can avoid dropping the prompt. */
function loadComposerForEdit(
  value: string,
  attachments?: TurnAttachment[],
): boolean {
  const composer = dockedComposerRef.value ?? emptyComposerRef.value;
  if (!composer) return false;
  // loadForEdit returns false when the dock's nested Composer is hidden; the
  // empty composer's loadForEdit returns void (treat as success).
  const ok = composer.loadForEdit(value);
  if (ok === false) return false;
  composer.loadAttachmentsForEdit(attachments ?? []);
  return true;
}

function handleCopyConversationCopied(): void {
  copyConversationCopied.value = true;
  if (copyConversationCopiedTimer !== null) clearTimeout(copyConversationCopiedTimer);
  copyConversationCopiedTimer = setTimeout(() => {
    copyConversationCopiedTimer = null;
    copyConversationCopied.value = false;
  }, 2000);
}

function focusGoal(): void {
  goalExpandSignal.value++;
}

const bashTasks = computed(() => props.tasks.filter((t) => t.kind !== 'subagent'));
// The dock lists only BACKGROUND subagents. Foreground subagents render inline
// in the message flow as the `Agent` tool card, so showing them here too would
// duplicate them (and foreground ones can't be cancelled from the dock anyway).
const subagentTasks = computed(() =>
  props.tasks.filter((t) => t.kind === 'subagent' && t.runInBackground),
);
const bashRunning = computed(() => bashTasks.value.filter((t) => t.state === 'run').length);
const subagentRunning = computed(() => subagentTasks.value.filter((t) => t.state === 'run').length);

// Let AgentTool cards know whether their spawning tool-call has a matching live
// or background subagent task, so the "Open detail" button can be hidden when
// the task is gone (e.g. a completed foreground subagent after a page refresh).
function resolveAgentTaskId(toolCallId: string): string | undefined {
  return resolveAgentTask(toolCallId)?.id;
}

// Full task lookup for the Agent tool card: the card labels itself with the
// subagent's foreground/background mode read from this task.
function resolveAgentTask(toolCallId: string): (typeof props.tasks)[number] | undefined {
  const tasks = props.tasks;
  const task =
    tasks.find((tk) => tk.id === toolCallId) ?? tasks.find((tk) => tk.parentToolCallId === toolCallId);
  if (task) return task;
  // A subagent task synthesized from a text delta (client subscribed after the
  // spawn, so the lifecycle parentToolCallId was missed) has no parentToolCallId.
  // When exactly one such unmapped subagent task exists, attribute it to this
  // Agent tool call so the Open-detail button stays reachable.
  const unmapped = tasks.filter((tk) => tk.kind === 'subagent' && !tk.parentToolCallId);
  if (unmapped.length === 1) return unmapped[0]!;
  return undefined;
}
provide('resolveAgentTaskId', resolveAgentTaskId);
provide('resolveAgentTask', resolveAgentTask);
provide('pinScroll', pinScrollFor);

function changedFilesForTurn(turn: ChatTurn): string[] {
  const files: string[] = [];
  for (const tool of turn.tools ?? []) {
    const kind = normalizeToolName(tool.name);
    if (kind !== 'edit' && kind !== 'write') continue;
    try {
      const input = JSON.parse(tool.arg) as unknown;
      if (!input || typeof input !== 'object' || Array.isArray(input)) continue;
      const value = (input as Record<string, unknown>).path ??
        (input as Record<string, unknown>).file_path ??
        (input as Record<string, unknown>).filePath ??
        (input as Record<string, unknown>).filename;
      if (typeof value === 'string' && value.length > 0 && !files.includes(value)) files.push(value);
    } catch {
      // Tool arguments may be opaque strings on older daemon versions.
    }
  }
  return files;
}

const changedFiles = computed<string[]>(() => {
  for (let i = props.turns.length - 1; i >= 0; i -= 1) {
    const turn = props.turns[i];
    if (turn?.role === 'assistant') return changedFilesForTurn(turn);
  }
  return [];
});

const todoDoneCount = computed(() => (props.todos ?? []).filter((td) => td.status === 'done').length);
const hasDockWork = computed(() =>
  bashTasks.value.length > 0 ||
  subagentTasks.value.length > 0 ||
  (props.todos?.length ?? 0) > 0 ||
  (props.queued?.length ?? 0) > 0 ||
  props.planMode === true ||
  (props.plans?.length ?? 0) > 0,
);
/** Latest plan entry — the dock's plan viewer panel shows it. */
const latestPlan = computed<AppPlanEntry | null>(() => {
  const plans = props.plans;
  if (!plans || plans.length === 0) return null;
  return plans[plans.length - 1]!;
});
const panel = useRightPanel();
const panelDragging = ref(false);
const changesCount = computed(() => (props.gitInfo ? props.changes?.length ?? 0 : 0));

/** The panel's New-tab menu — upstream's own two kinds (`openDiffDetail` and
 *  its side-chat opener). The side chat needs a session, which only the app
 *  layer can create, so that half is an emit. */
function addPanelTab(kind: 'diff' | 'btw'): void {
  if (kind === 'diff') panel.openDiff();
  else emit('openSideChat');
}

/** A file opened from a pane (a changed-file row, a link inside a diff, a trace
 *  link) becomes a file tab, normalized the way the preview API expects. */
function openFileInPanel(event: unknown): void {
  const candidate =
    typeof event === 'string'
      ? event
      : event && typeof event === 'object' && 'path' in event
        ? (event as { path?: unknown }).path
        : undefined;
  if (typeof candidate !== 'string' || candidate.length === 0) return;
  const normalized = normalizePanelPreviewPath(candidate, props.workspaceRoot);
  if ('error' in normalized) return;
  panel.openFile(normalized.path);
}

/** Header affordance: reveal the panel. A session with nothing restorable shows
 *  upstream's launcher (Quick open) rather than a tab it never opened. */
function openPanelFromHeader(): void {
  panel.show();
}

/** An agent opened from inside a pane (a trace link, a nested spawn) becomes
 *  its own agent tab, and still reaches the app-level consumers. */
function openAgentTab(target: string): void {
  panel.openAgent(target);
  emit('openAgent', target);
}

function tocTitle(turn: ChatTurn): string {
  if (turn.role === 'compaction') return t('conversation.compactedPlain');
  if (turn.role === 'user') {
    if (turn.skillActivation) return `/${turn.skillActivation.name}`;
    if (turn.pluginCommand) return `/${turn.pluginCommand.pluginId}:${turn.pluginCommand.commandName}`;
    const text = turn.text.trim().replaceAll(/\s+/g, ' ');
    return text.length > 0 ? text : 'user';
  }
  const text = (turn.text || turn.thinking || '').trim().replaceAll(/\s+/g, ' ');
  if (text.length > 0) return text;
  if ((turn.tools?.length ?? 0) > 0) return `${turn.tools!.length} tools`;
  return 'kimi';
}

// The TOC is keyed by user query: one entry per user turn, not per turn/block.
const conversationTocItems = computed<ConversationTocItem[]>(() =>
  props.turns
    .filter((turn) => turn.role === 'user')
    .map((turn, index) => ({
      id: turn.id,
      role: turn.role,
      no: index + 1,
      title: tocTitle(turn),
    })),
);

const activeTurnId = ref<string | null>(null);

// TOC active-item tracking: the full pass below forces layout (one
// getBoundingClientRect per anchor). Per-delta triggers (scroll events and the
// scrollKey watcher while streaming) go through scheduleActiveTocQuery(), which
// allows at most one pass per 100 ms and coalesces pending triggers into a
// single trailing pass. Session switches and the initial mount call
// updateActiveTocQuery() directly so the highlight lands immediately.
const TOC_QUERY_THROTTLE_MS = 100;
let lastTocQueryAt = 0;
let tocQueryTimer: ReturnType<typeof setTimeout> | null = null;

function updateActiveTocQuery(): void {
  lastTocQueryAt = Date.now();
  const pane = panesRef.value;
  if (!pane) return;
  const anchors = pane.querySelectorAll<HTMLElement>('.turn-anchor[data-turn-id]');
  if (anchors.length === 0) return;
  const items = conversationTocItems.value;
  if (items.length === 0) return;
  const userIds = new Set(items.map((item) => item.id));

  // When pinned to the bottom (auto-follow / short content), the latest query is
  // the active one even if its message sits below the pane's vertical middle —
  // otherwise the highlight would lag one query behind at the bottom.
  if (distanceFromBottom() <= BOTTOM_THRESHOLD) {
    activeTurnId.value = items[items.length - 1]!.id;
    return;
  }

  const paneRect = pane.getBoundingClientRect();
  const paneMiddle = paneRect.height / 2;
  // Otherwise the active highlight tracks the query that owns the current
  // viewport: the last user-turn anchor at or above the middle.
  let bestId: string | null = null;
  anchors.forEach((el) => {
    const id = el.dataset.turnId;
    if (!id || !userIds.has(id)) return;
    const top = el.getBoundingClientRect().top - paneRect.top;
    if (top <= paneMiddle) bestId = id;
  });
  activeTurnId.value = bestId ?? items[0]!.id;
}

/** Throttled/coalesced variant for high-frequency triggers: run immediately
    when the gate is open, otherwise fold the trigger into a single pending
    trailing pass for the rest of the window. */
function scheduleActiveTocQuery(): void {
  const now = Date.now();
  const elapsed = now - lastTocQueryAt;
  if (elapsed >= TOC_QUERY_THROTTLE_MS) {
    if (tocQueryTimer !== null) {
      clearTimeout(tocQueryTimer);
      tocQueryTimer = null;
    }
    updateActiveTocQuery();
    return;
  }
  if (tocQueryTimer !== null) return;
  tocQueryTimer = setTimeout(() => {
    tocQueryTimer = null;
    updateActiveTocQuery();
  }, TOC_QUERY_THROTTLE_MS - elapsed);
}

// --- TOC occlusion by wide tables -------------------------------------------
// Wide markdown tables (up to --p-table-max) can extend past the TOC rail,
// which stays anchored to the reading-column edge. While a table actually
// covers the rail we hide the TOC temporarily so the table stays fully
// interactive (clicks, text selection, horizontal scroll). The user's TOC
// setting is untouched and the rail returns as soon as the table scrolls away.
const tocOccludedByTable = ref(false);
let tocHitTestRaf = 0;

function scheduleTocTableHitTest(): void {
  if (tocHitTestRaf) return;
  tocHitTestRaf = raf(() => {
    tocHitTestRaf = 0;
    updateTocTableOcclusion();
  });
}

function updateTocTableOcclusion(): void {
  const pane = panesRef.value;
  const toc =
    !props.mobile && props.conversationToc && pane
      ? pane.closest('.con')?.querySelector<HTMLElement>('.conversation-toc')
      : null;
  // The hit x is the centre of the fixed rail bar: `.toc-bar` keeps a stable x
  // even when hover expands the labels rightward, so hovering the TOC itself
  // never flips the state (the nav centre would).
  const bar = toc?.querySelector<HTMLElement>('.toc-bar');
  let covered = false;
  if (pane && toc && bar) {
    const barRect = bar.getBoundingClientRect();
    const tocRect = toc.getBoundingClientRect();
    const railX = barRect.left + barRect.width / 2;
    // Plain geometric overlap: the rail paints above the content, so any table
    // wrapper that covers the bar's x AND overlaps the rail vertically would
    // have its pointer events intercepted by the rail — hide the TOC until the
    // table scrolls away. Rect overlap is exact (no sampling gap) and ignores
    // paint-order quirks. Only wrappers inside THIS pane count; other panes
    // (side chat, preview) are outside `pane`.
    covered = Array.from(
      pane.querySelectorAll<HTMLElement>('.table-node-wrapper'),
    ).some((wrapper) => {
      const rect = wrapper.getBoundingClientRect();
      return (
        rect.left <= railX &&
        railX <= rect.right &&
        rect.top < tocRect.bottom &&
        rect.bottom > tocRect.top
      );
    });
  }
  if (tocOccludedByTable.value !== covered) {
    tocOccludedByTable.value = covered;
  }
}

// The first pending question (if any)
const pendingQuestion = computed<UIQuestion | undefined>(() =>
  props.questions && props.questions.length > 0 ? props.questions[0] : undefined,
);

// Action kind currently in flight for the visible question card, if any. Drives
// the submit/dismiss loading state and disables the buttons while the daemon
// processes the response.
const questionBusyKind = computed<'answer' | 'dismiss' | undefined>(() => {
  const q = pendingQuestion.value;
  if (!q) return undefined;
  return props.pendingQuestionActions?.[q.questionId];
});

// The first pending approval (if any). Rendered in the SAME bottom-dock slot as
// the question (replacing the composer) so both "agent is blocked on you"
// prompts live in one consistent place instead of approvals scrolling away at
// the end of the transcript while questions stay pinned.
const pendingApproval = computed(() =>
  props.approvals && props.approvals.length > 0 ? props.approvals[0] : undefined,
);

// True while the visible approval card has a respond in flight. Drives the
// action buttons' loading/disabled state and blocks duplicate decisions.
const approvalBusy = computed<boolean>(() => {
  const a = pendingApproval.value;
  if (!a) return false;
  return !!props.pendingApprovalActions?.[a.approvalId];
});

// ---------------------------------------------------------------------------
// Auto-scroll: "following" state machine + "new messages" pill
// ---------------------------------------------------------------------------

const panesRef = ref<HTMLElement | null>(null);
const dockRef = ref<HTMLElement | null>(null);
const chatLayoutRef = ref<HTMLElement | null>(null);
const panesScrollbarWidth = ref(0);
const dockHeight = ref(0);
/** Distance from the bottom of .chat-layout up to the composer card's bottom
 *  edge — the floating right panel shares the composer card's bottom margin, so
 *  the card and the panel sit flush along the same line rather than the panel
 *  hovering above the message box. -1 means "not measurable" (no composer
 *  mounted — the question / approval card replaced it), which falls back to
 *  --dock-height the panel's column uses. */
const composerClearance = ref(-1);
const chatLayoutStyle = computed(() => ({
  '--dock-height': `${dockHeight.value}px`,
  // -1 = not measurable (no composer card mounted): drop the property so the
  // panel column falls back to --dock-height.
  '--composer-clearance': composerClearance.value >= 0 ? `${composerClearance.value}px` : undefined,
}));
const chatDockStyle = computed(() => ({
  '--panes-scrollbar-width': `${panesScrollbarWidth.value}px`,
}));
type ComposerHandle = {
  loadForEdit: (value: string) => boolean | void;
  loadAttachmentsForEdit: (atts: { fileId?: string; kind: 'image' | 'video' | 'file'; url: string; name?: string }[]) => void;
  focus: () => void;
  openModelMenu: () => void;
  openPermissionMenu: () => void;
};
type RefArg = Element | (ComponentPublicInstance & Partial<ComposerHandle>) | null;

function toHtmlEl(el: RefArg): HTMLElement | null {
  if (el instanceof HTMLElement) return el;
  if (el && '$el' in el && el.$el instanceof HTMLElement) return el.$el;
  return null;
}

function updatePanesScrollbarWidth(): void {
  const el = panesRef.value;
  panesScrollbarWidth.value = el ? Math.max(0, el.offsetWidth - el.clientWidth) : 0;
  dockHeight.value = dockRef.value?.offsetHeight ?? 0;
  updateComposerClearance();
}

/** The composer card lives inside the dock's nested Composer, which the dock
 *  swaps out for a question / approval card — so the element comes and goes and
 *  is looked up from the dock root rather than through a ref chain. */
function currentComposerCard(): HTMLElement | null {
  return dockRef.value?.querySelector<HTMLElement>('.composer-card') ?? null;
}

function updateComposerClearance(): void {
  const layout = chatLayoutRef.value;
  const card = ensureComposerCardObserved();
  if (!layout || !card) {
    composerClearance.value = -1;
    return;
  }
  const gap = layout.getBoundingClientRect().bottom - card.getBoundingClientRect().bottom;
  composerClearance.value = Number.isFinite(gap) ? Math.max(0, Math.ceil(gap)) : -1;
}

function bindChatPane(el: RefArg): void {
  const node = toHtmlEl(el);
  panesRef.value = node;
  if (node) rebindScrollObservers();
}

function bindChatDock(el: RefArg): void {
  const node = toHtmlEl(el);
  dockRef.value = node ?? null;
  if (
    el &&
    'loadForEdit' in el && typeof el.loadForEdit === 'function' &&
    'focus' in el && typeof el.focus === 'function'
  ) {
    dockedComposerRef.value = {
      loadForEdit: el.loadForEdit.bind(el),
      loadAttachmentsForEdit:
        'loadAttachmentsForEdit' in el && typeof el.loadAttachmentsForEdit === 'function'
          ? el.loadAttachmentsForEdit.bind(el)
          : () => {},
      focus: el.focus.bind(el),
      openModelMenu:
        'openModelMenu' in el && typeof el.openModelMenu === 'function'
          ? el.openModelMenu.bind(el)
          : () => {},
      openPermissionMenu:
        'openPermissionMenu' in el && typeof el.openPermissionMenu === 'function'
          ? el.openPermissionMenu.bind(el)
          : () => {},
    };
  } else {
    dockedComposerRef.value = null;
  }
  ensureDockObserved();
  updateComposerClearance();
}

// Silence noUnusedLocals: both are used as :ref callbacks in the template.
void bindChatPane;
void bindChatDock;

const following = ref(true);
const showPill = ref(false);

/** Within this many pixels from the bottom counts as "at the bottom" —
    scrolling DOWN into this zone re-enables the follow. */
const BOTTOM_THRESHOLD = 80;
const USER_ACTION_FOLLOW_LOCK_MS = 1000;

function distanceFromBottom(): number {
  const el = panesRef.value;
  if (!el) return 0;
  return el.scrollHeight - el.scrollTop - el.clientHeight;
}

let lastScrollTop = 0;
let lastEventScrollHeight = 0;
let userActionFollowUntil = 0;
let lastSmoothScroll = 0;
// While a smooth scroll is in flight, instant `scrollToBottom(false)` calls
// (e.g. from the streaming follow) are skipped so they don't cancel the
// animation — see scrollToBottom().
let smoothScrollUntil = 0;
const SMOOTH_SCROLL_GUARD_MS = 420;
let stableFollowRaf = 0;
let stableFollowToken = 0;

function hasUserActionFollowLock(): boolean {
  return Date.now() < userActionFollowUntil;
}

function onPanesScroll(): void {
  scheduleTocTableHitTest();
  const el = panesRef.value;
  if (!el) return;
  const top = el.scrollTop;
  const scrollHeight = el.scrollHeight;

  // A document that shrank since the last event clamps scrollTop down on its
  // own; that is the browser absorbing a height correction (eviction or
  // KaTeX/shiki estimate settling), not the user scrolling up. Treating it as
  // a user scroll drops the follow and lets the tail drift while a fresh
  // session's rows finish rendering.
  if (scrollHeight < lastEventScrollHeight - 1) {
    lastScrollTop = top;
    lastEventScrollHeight = scrollHeight;
    return;
  }
  lastEventScrollHeight = scrollHeight;

  if (isPinned()) {
    lastScrollTop = top;
    return;
  }

  if (performance.now() - lastSmoothScroll < 100) {
    lastScrollTop = top;
    return;
  }

  const dist = distanceFromBottom();
  if (hasUserActionFollowLock()) {
    following.value = true;
    showPill.value = false;
    lastScrollTop = top;
    return;
  }
  if (top < lastScrollTop - 1 && dist > 1) {
    following.value = false;
    showPill.value = true;
    userScrolledSincePendingArm = true;
  } else if (dist <= BOTTOM_THRESHOLD && top > lastScrollTop + 1) {
    following.value = true;
    showPill.value = false;
    userScrolledSincePendingArm = true;
  }
  lastScrollTop = top;
  scheduleActiveTocQuery();
}

function scrollToBottom(smooth = false): void {
  const el = panesRef.value;
  following.value = true;
  showPill.value = false;
  if (!el) return;
  // A smooth scroll (e.g. right after sending a message) needs time to play;
  // skip instant jumps during the guard window so the streaming follow doesn't
  // immediately snap to the bottom and cancel the animation.
  if (!smooth && performance.now() < smoothScrollUntil) return;
  if (smooth && typeof el.scrollTo === 'function') {
    lastSmoothScroll = performance.now();
    smoothScrollUntil = performance.now() + SMOOTH_SCROLL_GUARD_MS;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  } else {
    el.scrollTop = el.scrollHeight;
  }
  lastScrollTop = el.scrollTop;
}

type ScrollAnchor = { kind: 'turn' | 'tool'; id: string; top: number };

function scrollAnchorTop(container: HTMLElement, node: HTMLElement): number {
  // Tool calls inside a collapsed group still exist under an inert, clipped
  // body. Anchor them to the visible group row so hidden content cannot create
  // a fake layout delta while the stable tool id remains usable.
  const inert = node.closest<HTMLElement>('[inert]');
  const positionNode = inert?.closest<HTMLElement>('.tool-group') ?? node;
  return (
    positionNode.getBoundingClientRect().top -
    container.getBoundingClientRect().top +
    container.scrollTop
  );
}

function findTopAnchors(
  container: HTMLElement,
  scrollTop: number,
): ScrollAnchor[] {
  const anchors = Array.from(
    container.querySelectorAll<HTMLElement>('.turn-anchor[data-turn-id], [data-scroll-anchor-id]'),
  ).map((node) => ({ node, top: scrollAnchorTop(container, node) }));
  const firstAfterTop = anchors.findIndex((anchor) => anchor.top >= scrollTop);
  const start = firstAfterTop < 0 ? Math.max(0, anchors.length - 1) : firstAfterTop;
  // The first id can be rebuilt when a page boundary splits an assistant turn;
  // a nearby turn or tool call retains a stable fallback.
  return anchors.slice(start, start + 2).flatMap((anchor) => {
    const toolId = anchor.node.dataset.scrollAnchorId;
    const id = toolId ?? anchor.node.dataset.turnId;
    return id ? [{ kind: toolId ? 'tool' : 'turn', id, top: anchor.top }] : [];
  });
}

type HistoryScrollSnapshot = {
  anchors: ScrollAnchor[];
  oldHeight: number;
};

const pendingHistoryRestoreBySession = new Map<string, HistoryScrollSnapshot>();

function historyScrollDelta(container: HTMLElement, snapshot: HistoryScrollSnapshot): number {
  for (const anchor of snapshot.anchors) {
    const attr = anchor.kind === 'tool' ? 'data-scroll-anchor-id' : 'data-turn-id';
    const newAnchor = container.querySelector<HTMLElement>(
      `[${attr}="${attrEscape(anchor.id)}"]`,
    );
    if (newAnchor) return scrollAnchorTop(container, newAnchor) - anchor.top;
  }
  // If the page boundary split an assistant/tool turn, messagesToTurns may
  // rebuild that turn with a new id. Fall back to the overall height delta.
  return container.scrollHeight - snapshot.oldHeight;
}

function restoreHistoryScroll(
  container: HTMLElement,
  snapshot: HistoryScrollSnapshot,
  currentTop = container.scrollTop,
): number {
  container.scrollTop = currentTop + historyScrollDelta(container, snapshot);
  lastScrollTop = container.scrollTop;
  return container.scrollTop;
}

async function handleLoadOlderMessages(): Promise<void> {
  if (
    !props.sessionId ||
    !props.loadOlderMessages ||
    props.loadingMore ||
    historyLoadInProgress.value ||
    !props.hasMoreMessages
  ) {
    return;
  }
  const requestedSessionId = props.sessionId;
  const el = panesRef.value;
  const oldTop = el?.scrollTop ?? 0;
  const snapshot: HistoryScrollSnapshot = {
    anchors: el ? findTopAnchors(el, oldTop) : [],
    oldHeight: el?.scrollHeight ?? 0,
  };

  setHistoryLoadInProgress(requestedSessionId, true);
  cancelScheduledFollow();
  try {
    // Flush the class that disables native scroll anchoring before Vue prepends
    // history. The explicit delta restoration below owns this one mutation;
    // native anchoring resumes afterwards for late Markdown/media layout shifts.
    await nextTick();
    await props.loadOlderMessages(requestedSessionId);
    await nextTick();

    // If the user switched sessions while the request was in flight, do not
    // restore the newly selected pane. Save the original anchor so the deferred
    // per-session scroll state can be adjusted when this session mounts again.
    if (props.sessionId !== requestedSessionId) {
      pendingHistoryRestoreBySession.set(requestedSessionId, snapshot);
      return;
    }

    const el2 = panesRef.value;
    if (!el2) return;

    // Restore scroll position using a stable anchor near the old viewport top.
    // This isolates height inserted above the anchor and ignores any new bottom
    // content (e.g. streaming assistant turns) that arrived during the request.
    // Apply the delta to the CURRENT scrollTop, not the pre-fetch oldTop: the
    // user may have kept scrolling (e.g. trackpad momentum) while the request
    // was in flight, and snapping back to oldTop would yank the viewport down.
    restoreHistoryScroll(el2, snapshot);
    pendingHistoryRestoreBySession.delete(requestedSessionId);
  } finally {
    setHistoryLoadInProgress(requestedSessionId, false);
  }
}

function attrEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replaceAll(/["\\]/g, '\\$&');
}

function scrollToTurn(turnId: string): void {
  const el = panesRef.value;
  if (!el) return;
  const target = el.querySelector<HTMLElement>(`.turn-anchor[data-turn-id="${attrEscape(turnId)}"]`);
  if (!target) return;
  cancelActiveScrollWrites();
  following.value = false;
  showPill.value = distanceFromBottom() > BOTTOM_THRESHOLD;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function currentLayoutKey(): string {
  const el = panesRef.value;
  if (!el) return 'none';
  const content = el.firstElementChild;
  const contentHeight = content instanceof HTMLElement ? content.offsetHeight : 0;
  const dockHeight = dockRef.value?.offsetHeight ?? 0;
  return `${el.scrollHeight}:${el.clientHeight}:${contentHeight}:${dockHeight}`;
}

function raf(cb: () => void): number {
  return (typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(cb)
    : setTimeout(cb, 16)) as unknown as number;
}

function cancelRaf(id: number): void {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
  else clearTimeout(id);
}

// --- Scroll anchoring for expand/collapse interactions ----------------------
// Toggling a tool row/group grows or shrinks its body, which would otherwise move
// the viewport: a collapse near the bottom shrinks scrollHeight and lets the
// browser clamp scrollTop, and the auto-follow may snap to the tail. While the
// transition runs we pin the toggled row's viewport position and suppress the
// auto-follow, so the row stays put and only its body opens downward / collapses
// upward.
let pinUntil = 0;
let pinRaf = 0;
let pinEl: HTMLElement | null = null;
let pinTargetTop = 0;

function isPinned(): boolean {
  return performance.now() < pinUntil;
}

function pinScrollFor(el: HTMLElement, ms = 260): void {
  const panes = panesRef.value;
  if (!panes) return;
  pinEl = el;
  pinTargetTop = el.getBoundingClientRect().top;
  pinUntil = performance.now() + ms;
  if (pinRaf) return;
  const tick = () => {
    pinRaf = 0;
    if (performance.now() >= pinUntil || !pinEl) {
      pinEl = null;
      return;
    }
    const delta = pinEl.getBoundingClientRect().top - pinTargetTop;
    if (delta) panes.scrollTop += delta;
    pinRaf = raf(tick);
  };
  pinRaf = raf(tick);
}

function scheduleStableFollow(maxFrames = 36): void {
  if (!following.value && !hasUserActionFollowLock()) return;
  const token = ++stableFollowToken;
  let lastKey = '';
  let stableFrames = 0;
  let frames = 0;
  if (stableFollowRaf) {
    cancelRaf(stableFollowRaf);
    stableFollowRaf = 0;
  }

  const tick = () => {
    stableFollowRaf = 0;
    if (token !== stableFollowToken) return;
    if (!following.value && !hasUserActionFollowLock()) return;
    scrollToBottom(false);
    const key = currentLayoutKey();
    stableFrames = key === lastKey ? stableFrames + 1 : 0;
    lastKey = key;
    frames++;
    if (stableFrames < 3 && frames < maxFrames) {
      stableFollowRaf = raf(tick);
    }
  };

  stableFollowRaf = raf(tick);
}

type ScrollKey = {
  length: number;
  firstId: string;
  lastId: string;
  lastTextLen: number;
  lastThinkingLen: number;
  lastToolsLen: number;
  approvalIds: string;
};

function isHistoryPrependOnly(prev: ScrollKey | undefined, next: ScrollKey): boolean {
  return (
    prev !== undefined &&
    prev.length > 0 &&
    next.length >= prev.length &&
    prev.firstId !== next.firstId &&
    prev.lastId === next.lastId &&
    prev.lastTextLen === next.lastTextLen &&
    prev.lastThinkingLen === next.lastThinkingLen &&
    prev.lastToolsLen === next.lastToolsLen &&
    prev.approvalIds === next.approvalIds
  );
}

const scrollKey = computed<ScrollKey>(() => {
  const approvalIds = (props.approvals ?? []).map((a) => a.approvalId).join(',');
  const t = props.turns;
  const last = t.at(-1);
  const thinkingLen = last?.thinking?.length ?? 0;
  const toolsLen =
    last?.tools?.reduce((n, tool) => {
      // Sum the output part lengths instead of join('').length: identical
      // value (output is string[]), but no per-delta joined-string allocation.
      const outputLen = tool.output?.reduce((sum, part) => sum + part.length, 0) ?? 0;
      return n + tool.name.length + (tool.arg?.length ?? 0) + outputLen;
    }, 0) ?? 0;
  return {
    length: t.length,
    firstId: t[0]?.id ?? '',
    lastId: last?.id ?? '',
    lastTextLen: last?.text.length ?? 0,
    lastThinkingLen: thinkingLen,
    lastToolsLen: toolsLen,
    approvalIds,
  };
});

watch(scrollKey, async (next, prev) => {
  // Refresh the fingerprint of the content the user last saw in the active
  // session; it is captured by the per-session scroll state on switch-away.
  const activeSid = props.sessionId;
  if (activeSid) {
    fingerprintBySession.set(activeSid, {
      length: next.length,
      firstId: next.firstId,
      lastId: next.lastId,
      lastTextLen: next.lastTextLen,
    });
  }
  // Prepending older history changes this key; suppress only that exact case so
  // concurrent bottom appends still raise the new-message pill.
  if (historyLoadInProgress.value && isHistoryPrependOnly(prev, next)) {
    scheduleActiveTocQuery();
    return;
  }
  await nextTick();
  if (following.value || hasUserActionFollowLock()) {
    // An undo or compaction shortens the transcript — glide to the new
    // bottom smoothly; growth (new turns / streaming) snaps instantly so the
    // follow keeps up with the tail. The write itself is deferred into the
    // shared rAF follow pass so the watcher and the mutation observer coalesce
    // into at most one scroll write per animation frame.
    scheduleFollow(next.length < prev.length);
  } else showPill.value = true;
  scheduleActiveTocQuery();
});

watch(dockRef, () => {
  ensureDockObserved();
  updateComposerClearance();
});

// The dock swaps the composer card out for a question / approval card, which
// changes what the floating right panel has to clear — re-measure once the
// replacement (or the composer, on the way back) is in the DOM.
watch([pendingQuestion, pendingApproval], async () => {
  await nextTick();
  updateComposerClearance();
});

watch(
  () => props.mobile,
  async () => {
    await nextTick();
    updatePanesScrollbarWidth();
  },
);

// Per-session scroll state: switching back to a session restores both the scroll
// position and whether the user was following the bottom, instead of always
// jumping to the bottom (which replayed the conversation when the session was
// already there) or getting yanked to the bottom by a new message after
// restoring a scrolled-up position. The fingerprint is the transcript shape the
// user last saw: a session that gained new content since then lands at the
// latest exchange instead of the old position.
type SavedScrollState = {
  top: number;
  following: boolean;
  length: number;
  firstId: string;
  lastId: string;
  lastTextLen: number;
};

type ScrollFingerprint = { length: number; firstId: string; lastId: string; lastTextLen: number };

const scrollStateBySession = new Map<string, SavedScrollState>();

// Latest content fingerprint per session, refreshed whenever the active
// session's transcript changes (see the scrollKey watcher).
const fingerprintBySession = new Map<string, ScrollFingerprint>();

// Deferred scroll decision for the session being switched to. The reopen
// refetch replaces the transcript right after the switch, so the final
// position is re-evaluated once the snapshot has actually landed (see
// consumePendingScroll) instead of being applied against soon-to-be-stale
// content and never corrected.
const PENDING_SCROLL_WINDOW_MS = 5000;
const pendingScrollBySession = new Map<
  string,
  { kind: 'bottom'; expiresAt: number } | { kind: 'restore'; saved: SavedScrollState; expiresAt: number }
>();
let pendingScrollTimer: ReturnType<typeof setTimeout> | null = null;
// Set when the user manually scrolls after a session switch armed a pending
// scroll decision; consumePendingScroll then drops the deferred landing so it
// cannot yank the viewport away from where the user moved it. Programmatic
// writes (scrollToBottom, restore, history delta) update lastScrollTop /
// lastSmoothScroll first, so their follow-up scroll events do not set this.
let userScrolledSincePendingArm = false;

function grewSinceSaved(saved: SavedScrollState): boolean {
  const t = props.turns;
  const last = t.at(-1);
  // "Grew" means new content arrived at the tail (or content was replaced):
  // a different last turn, a longer last turn, or more turns while the first
  // turn is unchanged. Prepended older history keeps the tail intact and does
  // not count as new content.
  return (
    (last !== undefined && last.id !== saved.lastId) ||
    (last?.text.length ?? 0) !== saved.lastTextLen ||
    (t.length > saved.length && (t[0]?.id ?? '') === saved.firstId)
  );
}

/**
 * Apply the deferred scroll decision for `key` (the session being switched
 * to). Re-evaluated on every turns-identity change within the intent window —
 * the reopen snapshot merge always yields a new turns array, and the LAST
 * such change carries the final content, so an early application against the
 * pre-snapshot (cached) transcript is corrected by the later one. The
 * sessionLoading transition and the intent-window expiry are fallback
 * triggers. If a later switch superseded this key, the pending decision is
 * dropped untouched. Returns true when a decision was applied.
 */
function consumePendingScroll(key: string): boolean {
  const pending = pendingScrollBySession.get(key);
  if (!pending) return false;
  if (props.sessionId !== key || Date.now() > pending.expiresAt) {
    pendingScrollBySession.delete(key);
    return false;
  }
  if (userScrolledSincePendingArm) {
    // The user took manual control after the switch (wheel / touch / scrollbar
    // / keyboard / TOC click / tool toggle); drop the deferred landing instead
    // of yanking the viewport away from where they scrolled to.
    pendingScrollBySession.delete(key);
    return true;
  }
  const el = panesRef.value;
  if (!el) return false;
  if (pending.kind === 'bottom') {
    // First open (or a locally created empty session): land at the tail.
    following.value = true;
    lastScrollTop = 0;
    scrollToBottom(false);
    scheduleStableFollow();
    return true;
  }
  const saved = pending.saved;
  const grew = grewSinceSaved(saved);
  if (grew) {
    // The session gained content since the user left: land at the latest
    // exchange and keep the follow armed while the new content renders.
    // Unchanged content leaves the restored position in place.
    following.value = true;
    scrollToBottom(false);
    scheduleStableFollow();
    return true;
  }
  const pendingRestore = pendingHistoryRestoreBySession.get(key);
  const top = pendingRestore ? restoreHistoryScroll(el, pendingRestore, saved.top) : saved.top;
  if (pendingRestore) pendingHistoryRestoreBySession.delete(key);
  following.value = saved.following;
  el.scrollTop = top;
  lastScrollTop = el.scrollTop;
  showPill.value = !saved.following && distanceFromBottom() > 1;
  if (saved.following) {
    scheduleStableFollow();
  }
  return true;
}

// Re-apply the active session's pending scroll decision on every turns-identity
// change within its intent window (see consumePendingScroll). Created once for
// the component's lifetime; harmless no-op when no decision is pending.
watch(
  () => props.turns,
  () => {
    const key = props.sessionId ? String(props.sessionId) : null;
    if (key !== null) consumePendingScroll(key);
  },
  { flush: 'post' },
);

watch(
  () => props.fileReloadKey,
  async (newKey, oldKey) => {
    const el = panesRef.value;
    if (oldKey && el) {
      const fp = fingerprintBySession.get(String(oldKey));
      scrollStateBySession.set(String(oldKey), {
        top: el.scrollTop,
        following: following.value,
        length: fp?.length ?? 0,
        firstId: fp?.firstId ?? '',
        lastId: fp?.lastId ?? '',
        lastTextLen: fp?.lastTextLen ?? 0,
      });
    }
    if (pendingScrollTimer !== null) {
      clearTimeout(pendingScrollTimer);
      pendingScrollTimer = null;
    }
    cancelActiveScrollWrites();
    await nextTick();
    // Defer the final scroll decision: the transcript is replaced right after
    // the switch (reopenSession's snapshot refetch), so applying a restore now
    // would land on content that is about to be swapped out. The decision is
    // recorded here and re-evaluated by the turns-identity watcher above each
    // time the transcript changes within the window; the timeout below is the
    // fallback when no identity change ever arrives (e.g. failed snapshot).
    const key = newKey ? String(newKey) : null;
    if (key !== null) {
      userScrolledSincePendingArm = false;
      const saved = scrollStateBySession.get(key);
      if (saved) {
        pendingScrollBySession.set(key, {
          kind: 'restore',
          saved,
          expiresAt: Date.now() + PENDING_SCROLL_WINDOW_MS,
        });
      } else {
        pendingScrollBySession.set(key, {
          kind: 'bottom',
          expiresAt: Date.now() + PENDING_SCROLL_WINDOW_MS,
        });
      }
      pendingScrollTimer = setTimeout(() => {
        pendingScrollTimer = null;
        consumePendingScroll(key);
      }, PENDING_SCROLL_WINDOW_MS);
    } else {
      following.value = true;
      lastScrollTop = 0;
      scrollToBottom(false);
      scheduleStableFollow();
    }
    updateActiveTocQuery();
  },
);

watch(
  () => props.sessionLoading,
  async (loading, was) => {
    if (loading || !was) return;
    const key = props.sessionId ? String(props.sessionId) : null;
    if (key !== null) {
      await nextTick();
      if (consumePendingScroll(key)) {
        updateActiveTocQuery();
        return;
      }
    }
    following.value = true;
    await nextTick();
    scheduleStableFollow();
    updateActiveTocQuery();
  },
);

watch(
  // Settle the scroll-follow when the conversation's turn finishes (not when
  // background-only work ends — the transcript didn't move then).
  () => props.turnActive,
  async (now, was) => {
    if (now || !was) return;
    if (!following.value && !hasUserActionFollowLock()) return;
    await nextTick();
    scheduleStableFollow(48);
    scheduleActiveTocQuery();
  },
);

function followAfterUserAction(): void {
  following.value = true;
  showPill.value = false;
  userActionFollowUntil = Date.now() + USER_ACTION_FOLLOW_LOCK_MS;
  void nextTick(() => {
    scrollToBottom(true);
    scheduleStableFollow(16);
  });
}

function handleComposerSubmit(payload: { text: string; attachments: PromptAttachment[] }): void {
  followAfterUserAction();
  emit('submit', payload);
}

// Undo ("edit & resend") shortens the transcript asynchronously — the server
// round-trip in App.vue's handleEditMessage truncates the turns after this emit
// returns. Scrolling here would target the pre-undo bottom and fight the
// bubble-exit animation, so we only arm the follow state; the scrollKey watcher
// smooth-scrolls once the truncated turns actually land.
// Quote-to-chat (0.39 `code comment/quote` port): a turn's text lands in the
// active composer as a markdown blockquote; the user adds their own comment
// and sends. Local bridge — no undo/resend semantics like edit.
function handleQuote(text: string): void {
  following.value = true;
  showPill.value = false;
  userActionFollowUntil = Date.now() + USER_ACTION_FOLLOW_LOCK_MS;
  const composer = dockedComposerRef.value ?? emptyComposerRef.value;
  if (!composer) return;
  if (composer.loadForEdit(text) === false) return;
  composer.focus();
}

// Selection quoting (messages, file preview, diff panels, terminal) goes
// through the same handler as the outline rail's quote button: the shared
// SelectionQuoteBubble recomposes the selection as a markdown blockquote and
// asks here for insertion, so both sources share one composer path.
const composerQuoteRequest = useComposerQuoteRequest();
watch(composerQuoteRequest, (request) => {
  if (request === null) return;
  handleQuote(request.text);
});

function handleEditMessage(payload: {
  text: string;
  attachments?: TurnAttachment[];
}): void {
  following.value = true;
  showPill.value = false;
  userActionFollowUntil = Date.now() + USER_ACTION_FOLLOW_LOCK_MS;
  emit('editMessage', payload);
}

// A queued message was clicked for editing: load its text (and any attachments)
// back into the active composer, then let the parent dequeue it (mirrors the old
// dock-queue flow). Only dequeue when the load actually succeeds — if the dock is
// showing a pending question/approval the composer is hidden and the load no-ops,
// so dequeuing would drop the prompt instead of making it editable.
function handleEditQueued(index: number): void {
  const item = props.queued?.[index];
  const text = item?.text ?? '';
  const loaded = loadComposerForEdit(text, item?.attachments);
  if (loaded) emit('editQueued', index);
}

function handleReorderQueue(payload: { from: number; to: number }): void {
  emit('reorderQueue', payload);
}

function handleQuestionAnswer(qid: string, resp: QuestionResponse): void {
  followAfterUserAction();
  emit('answer', qid, resp);
}

function handleApproval(
  id: string | undefined,
  response: { decision: 'approved' | 'rejected' | 'cancelled'; scope?: 'session'; feedback?: string } | undefined,
): void {
  if (!id || !response) return;
  emit('approval', id, response);
}

let contentObserver: MutationObserver | null = null;
let resizeObserver: ResizeObserver | null = null;
let observedContent: Element | null = null;
let observedDock: HTMLElement | null = null;
// The composer card is a grandchild of the dock and unmounts when the dock swaps
// it for a question / approval card, so it is tracked like the dock itself: the
// floating right panel measures its bottom inset against the card's top edge.
let observedComposerCard: HTMLElement | null = null;
let lastObservedScrollHeight = 0;
let lastObservedClientHeight = 0;
let scrollRaf = 0;
const historyLoadingSessions = ref<ReadonlySet<string>>(new Set());
const historyLoadInProgress = computed(
  () => !!props.sessionId && historyLoadingSessions.value.has(props.sessionId),
);

function setHistoryLoadInProgress(sessionId: string, inProgress: boolean): void {
  const next = new Set(historyLoadingSessions.value);
  if (inProgress) next.add(sessionId);
  else next.delete(sessionId);
  historyLoadingSessions.value = next;
}

// Smooth-scroll intent for the next follow pass. The scrollKey watcher passes
// `true` when an undo/compaction shortens the transcript; the flag survives
// until the tick consumes it so a later instant trigger cannot downgrade it.
let pendingFollowSmooth = false;

function scheduleFollow(smooth = false): void {
  if (historyLoadInProgress.value) return;
  if (smooth) pendingFollowSmooth = true;
  if (scrollRaf) return;
  scrollRaf = raf(() => {
    scrollRaf = 0;
    const doSmooth = pendingFollowSmooth;
    pendingFollowSmooth = false;
    if (historyLoadInProgress.value) return;
    if (isPinned()) return;
    if (following.value || hasUserActionFollowLock()) scrollToBottom(doSmooth);
  });
}

function cancelScheduledFollow(): void {
  stableFollowToken++;
  pendingFollowSmooth = false;
  if (stableFollowRaf) {
    cancelRaf(stableFollowRaf);
    stableFollowRaf = 0;
  }
  if (scrollRaf) {
    cancelRaf(scrollRaf);
    scrollRaf = 0;
  }
}

function cancelActiveScrollWrites(): void {
  const el = panesRef.value;

  userActionFollowUntil = 0;
  cancelScheduledFollow();
  pinUntil = 0;
  pinEl = null;

  if (el) {
    const top = el.scrollTop;
    if (typeof el.scrollTo === 'function') el.scrollTo({ top, behavior: 'auto' });
    else el.scrollTop = top;
  }
  smoothScrollUntil = 0;
  lastSmoothScroll = Number.NEGATIVE_INFINITY;
  if (el) lastScrollTop = el.scrollTop;
}

// Wheel, touch, and scrollbar input arrive before the browser dispatches
// `scroll`. Stop queued writers before they can overwrite the user's movement.
function stopFollowingForUserIntent(): void {
  const el = panesRef.value;
  if (!el || (el.scrollHeight - el.clientHeight <= 1 && !props.hasMoreMessages)) return;

  userScrolledSincePendingArm = true;
  following.value = false;
  cancelActiveScrollWrites();
  if (el.scrollHeight - el.clientHeight > 1) showPill.value = true;
}

function nestedScrollerCanMoveUp(event: Event): boolean {
  const pane = panesRef.value;
  if (!pane) return false;
  for (const target of event.composedPath()) {
    if (target === pane) return false;
    if (
      target instanceof HTMLElement &&
      target.scrollHeight > target.clientHeight + 1 &&
      target.scrollTop > 1
    ) {
      return true;
    }
  }
  return false;
}

function onPanesWheel(event: WheelEvent): void {
  if (
    event.defaultPrevented ||
    event.ctrlKey ||
    event.shiftKey ||
    event.deltaY >= 0 ||
    nestedScrollerCanMoveUp(event)
  ) {
    return;
  }
  stopFollowingForUserIntent();
}

function onPanesPointerDown(event: PointerEvent): void {
  const el = panesRef.value;
  if (!el || event.defaultPrevented || event.button !== 0 || event.pointerType === 'touch') return;
  const rect = el.getBoundingClientRect();
  const gutterWidth = el.offsetWidth - el.clientWidth;
  const hitWidth = gutterWidth > 0 ? gutterWidth : 12;
  if (event.target === el && event.clientX >= rect.right - hitWidth) {
    stopFollowingForUserIntent();
  }
}

let lastTouchY: number | null = null;

function onPanesTouchStart(event: TouchEvent): void {
  lastTouchY = event.touches.length === 1 ? event.touches[0]!.clientY : null;
}

function onPanesTouchMove(event: TouchEvent): void {
  const y = event.touches.length === 1 ? event.touches[0]!.clientY : null;
  // The finger moving down means the scroll container is moving up.
  if (
    y !== null &&
    lastTouchY !== null &&
    y > lastTouchY + 2 &&
    !nestedScrollerCanMoveUp(event)
  ) {
    stopFollowingForUserIntent();
  }
  lastTouchY = y;
}

function ensureContentObserved(): void {
  if (!resizeObserver) return;
  const el = panesRef.value?.firstElementChild ?? null;
  if (el === observedContent) return;
  if (observedContent) resizeObserver.unobserve(observedContent);
  observedContent = el;
  if (el) resizeObserver.observe(el);
}

function ensureDockObserved(): void {
  if (!resizeObserver) return;
  const el = dockRef.value;
  if (el === observedDock) return;
  if (observedDock) resizeObserver.unobserve(observedDock);
  observedDock = el;
  if (el) resizeObserver.observe(el);
}

/** Bind the shared observer to the composer card (it comes and goes when the
 *  dock swaps the composer for a question / approval card) and hand back the
 *  element the caller should measure. */
function ensureComposerCardObserved(): HTMLElement | null {
  const el = currentComposerCard();
  if (!resizeObserver || el === observedComposerCard) return el;
  if (observedComposerCard) resizeObserver.unobserve(observedComposerCard);
  observedComposerCard = el;
  if (el) resizeObserver.observe(el);
  return el;
}

function rebindScrollObservers(): void {
  const el = panesRef.value;
  updatePanesScrollbarWidth();
  if (contentObserver) {
    contentObserver.disconnect();
    if (el) contentObserver.observe(el, { childList: true, subtree: true, characterData: true });
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    observedContent = null;
    observedDock = null;
    observedComposerCard = null;
    if (el) resizeObserver.observe(el);
    ensureContentObserved();
    ensureDockObserved();
    ensureComposerCardObserved();
  }
  lastObservedScrollHeight = el?.scrollHeight ?? 0;
  lastObservedClientHeight = el?.clientHeight ?? 0;
  scheduleTocTableHitTest();
}

function onContentMutated(): void {
  ensureContentObserved();
  scheduleFollow();
}

function onVisibilityChange(): void {
  if (typeof document === 'undefined') return;
  if (document.visibilityState === 'visible' && following.value) {
    scheduleStableFollow();
  }
}

// ---------------------------------------------------------------------------
// Manual-abort toast: shown when the user presses Escape to stop the prompt
// ---------------------------------------------------------------------------
const abortToastVisible = ref(false);
let abortToastTimer: ReturnType<typeof setTimeout> | null = null;
const ABORT_TOAST_DURATION = 3000;

function showAbortToast(): void {
  abortToastVisible.value = true;
  if (abortToastTimer !== null) clearTimeout(abortToastTimer);
  abortToastTimer = setTimeout(() => {
    abortToastVisible.value = false;
  }, ABORT_TOAST_DURATION);
}

function handleInterrupt(): void {
  showAbortToast();
  emit('interrupt');
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && (props.running || props.working)) {
    event.preventDefault();
    handleInterrupt();
  }
}

// When the on-screen keyboard opens, browsers without interactive-widget support
// fire a visualViewport resize instead of shrinking the layout viewport. Re-follow
// the tail so the latest turn stays visible above the keyboard. No-op while the
// user has manually scrolled away (following === false).
function onVisualViewportResize(): void {
  if (following.value) scheduleFollow();
}

onMounted(() => {
  nextTick(() => {
    if (typeof MutationObserver === 'function') {
      contentObserver = new MutationObserver(onContentMutated);
    }
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(() => {
        scheduleTocTableHitTest();
        updatePanesScrollbarWidth();
        const el = panesRef.value;
        if (!el) return;
        const { scrollHeight, clientHeight } = el;
        const grew = scrollHeight > lastObservedScrollHeight + 1;
        const viewportShrank = clientHeight < lastObservedClientHeight - 1;
        lastObservedScrollHeight = scrollHeight;
        lastObservedClientHeight = clientHeight;
        // Follow the tail on genuine growth (new turns, streaming, or late-loading
        // media that gain height after scrollKey has already run) or a shrinking
        // viewport (composer dock growing and hiding the last message). While a tool
        // row/group is being toggled (the pinned window) suppress follow entirely,
        // so the row opens downward / collapses upward without moving the viewport.
        if (!isPinned() && (grew || viewportShrank)) scheduleFollow();
      });
    }
    rebindScrollObservers();
    scheduleStableFollow(48);
    updateActiveTocQuery();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
      document.addEventListener('keydown', onKeyDown);
    }
    window.visualViewport?.addEventListener('resize', onVisualViewportResize);
  });
});

onUnmounted(() => {
  if (pendingScrollTimer !== null) clearTimeout(pendingScrollTimer);
  if (tocQueryTimer !== null) {
    clearTimeout(tocQueryTimer);
    tocQueryTimer = null;
  }
  if (contentObserver) contentObserver.disconnect();
  if (resizeObserver) resizeObserver.disconnect();
  if (scrollRaf) cancelRaf(scrollRaf);
  if (stableFollowRaf) cancelRaf(stableFollowRaf);
  if (pinRaf) cancelRaf(pinRaf);
  if (tocHitTestRaf) cancelRaf(tocHitTestRaf);
  if (abortToastTimer !== null) clearTimeout(abortToastTimer);
  if (copyConversationCopiedTimer !== null) {
    clearTimeout(copyConversationCopiedTimer);
    copyConversationCopiedTimer = null;
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    document.removeEventListener('keydown', onKeyDown);
  }
  window.visualViewport?.removeEventListener('resize', onVisualViewportResize);
});

function focusComposer(): void {
  (dockedComposerRef.value ?? emptyComposerRef.value)?.focus();
}

// Slash-command entry points (`/model`, `/effort`, `/permission`): open the
// active composer's toolbar menus. No-op while the dock shows a question /
// approval card instead of the composer, or before the first status lands.
function openComposerModelMenu(): void {
  (dockedComposerRef.value ?? emptyComposerRef.value)?.openModelMenu();
}

function openComposerPermissionMenu(): void {
  (dockedComposerRef.value ?? emptyComposerRef.value)?.openPermissionMenu();
}

defineExpose({ loadComposerForEdit, focusComposer, openComposerModelMenu, openComposerPermissionMenu });
</script>

<template>
  <section class="con" :class="{ mobile }">
    <!-- Empty session: the chat header carries both the macOS window-drag region
         and the right-panel opener, and it is not rendered here — upstream ships
         the two counterparts below, outside `.chat-layout`. -->
    <template v-if="!mobile && turns.length === 0 && !sessionLoading">
      <div class="empty-drag" :class="{ 'macos-desktop': isMacosDesktop }" />
      <IconButton
        class="empty-panel-btn"
        :label="t('panel.openPanel')"
        @click="openPanelFromHeader"
      >
        <Icon name="panel-right" size="sm" />
      </IconButton>
    </template>
    <div ref="chatLayoutRef" class="chat-layout" :style="chatLayoutStyle">
      <!-- Chat column: header + transcript + dock. A sibling wrapper so the
           floating right panel (absolutely positioned over .chat-layout)
           never participates in the column's flex layout. -->
      <div class="chat-main">
      <!-- Chat context header: workspace/session, git status, open-in-editor,
           copy-all, PR. Hidden for the empty-composer (no session context yet). -->
      <ChatHeader
      v-if="!mobile && !(turns.length === 0 && !sessionLoading)"
      :session-id="sessionId"
      :workspace-name="workspaceName"
      :workspace-root="workspaceRoot"
      :session-title="sessionTitle"
      :pinned="sessionPinned"
      :branch="gitInfo?.branch"
      :ahead="gitInfo?.ahead"
      :behind="gitInfo?.behind"
      :changes-count="changesCount"
      :git-diff-stats="gitDiffStats"
      :is-git-repo="!!gitInfo"
      :pr="pr"
      :copied="copyConversationCopied"
      @open-changes="emit('openChanges')"
      @open-panel="openPanelFromHeader"
      @copy-all="chatPaneRef?.copyConversation()"
      @copy-final-summary="chatPaneRef?.copyFinalSummary()"
      @open-pr="pr && emit('openPr', pr.url)"
      @rename-session="(id, title) => emit('renameSession', id, title)"
      @fork-session="(id) => emit('forkSession', id)"
      @archive-session="(id) => emit('archiveSession', id)"
      @export-session="(id) => emit('exportSession', id)"
      @toggle-pin-session="(id, pinned) => emit('togglePinSession', id, pinned)"
    />

    <!-- Conversation outline: right edge rail of vertical bars (one per user
         query); hover to expand a labeled panel. -->
    <ConversationToc
      v-if="conversationToc"
      :items="conversationTocItems"
      :active-turn-id="activeTurnId"
      :mobile="mobile"
      :session-loading="sessionLoading"
      :occluded="tocOccludedByTable"
      @select="scrollToTurn"
    />

      <div
        :ref="bindChatPane"
        class="panes chat-scroll"
        :class="{
          'is-following': following,
          'history-prepending': historyLoadInProgress,
          'has-header': !mobile && !(turns.length === 0 && !sessionLoading),
        }"
        @scroll.passive="onPanesScroll"
        @wheel.passive="onPanesWheel"
        @pointerdown.passive="onPanesPointerDown"
        @touchstart.passive="onPanesTouchStart"
        @touchmove.passive="onPanesTouchMove"
      >
        <div class="content-wrap" :class="[mobile ? 'align-mobile' : 'align-center']">
          <template v-if="turns.length === 0 && !sessionLoading">
            <!-- Empty session: Composer rendered in the centre of the pane -->
            <div class="empty-spacer" />
            <div class="empty-hint">
              <span class="empty-hint-title" :class="{ 'is-starting': starting }">
                <Spinner v-if="starting" size="sm" />
                <EmptyDoodle v-else />
              </span>
              <span v-if="!starting" class="empty-hint-text">{{ t('composer.emptyConversation') }}</span>
              <button
                v-else-if="!starting"
                type="button"
                class="empty-add-workspace"
                @click="emit('addWorkspace')"
              >
                <Icon name="folder-plus" size="sm" />
                <span>{{ t('conversation.addWorkspace') }}</span>
              </button>
            </div>
            <Composer
              ref="emptyComposerRef"
              class="empty-composer"
              :session-id="sessionId"
              :running="running"
              :queued="queued"
              :search-files="searchFiles"
              :upload-image="uploadImage"
              :status="status"
              :thinking="thinking"
              :plan-mode="planMode"
              :plan-armed="planArmed"
              :swarm-mode="swarmMode"
              :goal-mode="goalMode"
              :goal="goal"
              :activation-badges="activationBadges"
              :models="models"
              :starred-ids="starredIds"
              :skills="skills"
              :starting="starting"
              @submit="handleComposerSubmit"
              @steer="emit('steer', $event)"
              @command="(cmd, attachments) => emit('command', cmd, attachments)"
              @interrupt="handleInterrupt"
              @unqueue="emit('unqueue', $event)"
              @edit-queued="emit('editQueued', $event)"
              @set-permission="emit('setPermission', $event)"
              @set-thinking="emit('setThinking', $event)"
              @toggle-plan="emit('togglePlan')"
              @toggle-plan-armed="emit('togglePlanArmed')"
              @toggle-swarm="emit('toggleSwarm')"
              @toggle-goal="emit('toggleGoal')"
              @open-btw="emit('command', '/btw')"
              @create-goal="emit('createGoal', $event)"
              @control-goal="emit('controlGoal', $event)"
              @focus-goal="focusGoal"
              @compact="emit('compact')"
              @pick-model="emit('pickModel')"
              @select-model="emit('selectModel', $event)"
            >
              <template #footer>
                <div v-if="hasWorkspaces && !starting" class="ws-bar">
                  <div class="ws-anchor">
                    <Tooltip :text="t('conversation.switchWorkspace')">
                      <button
                        type="button"
                        class="ws-chip"
                        :class="{ open: wsPickOpen }"
                        :aria-expanded="wsPickOpen"
                        @click.stop="wsPickOpen = !wsPickOpen"
                      >
                        <Icon name="folder" size="sm" />
                        <span class="ws-chip-name">{{ activeWorkspaceLabel }}</span>
                        <Icon class="ws-chip-chev" :class="{ open: wsPickOpen }" name="chevron-down" size="sm" />
                      </button>
                    </Tooltip>
<div v-if="wsPickOpen" class="ws-pick-backdrop" @click="wsPickOpen = false" />
                <div v-if="wsPickOpen" class="ws-pick-menu">
                  <button
                    v-for="w in visibleWorkspaces"
                    :key="w.id"
                    type="button"
                    class="ws-pick-item"
                    :class="{ on: w.id === activeWorkspaceId }"
                    @click.stop="pickWorkspace(w.id)"
                  >
                    <span class="ws-pick-item-name">{{ w.name }}</span>
                    <span class="ws-pick-item-path">{{ w.shortPath }}</span>
                  </button>
                  <button
                    v-if="hiddenWorkspaceCount > 0"
                    type="button"
                    class="ws-pick-item ws-pick-more"
                    @click.stop="wsPickExpanded = !wsPickExpanded"
                  >
                    <span>{{ t('conversation.moreWorkspaces', { count: hiddenWorkspaceCount }) }}</span>
                  </button>
                  <div class="ws-pick-divider" />
                  <button
                    type="button"
                    class="ws-pick-action"
                    @click.stop="wsPickOpen = false; emit('addWorkspace')"
                  >
                    <Icon name="plus" size="sm" />
                    <span>{{ t('conversation.addWorkspace') }}</span>
                  </button>
                </div>
              </div>
                </div>
              </template>
            </Composer>
            <!-- Trailing spacer: upstream marks the tail one with `empty-tail`
                 (the head spacer stays plain); the fork had the element but not the
                 class, so the walk read it as an extra upstream element. -->
            <div class="empty-spacer empty-tail" />
          </template>
          <template v-else>
            <ChatPane
              ref="chatPaneRef"
              :key="fileReloadKey ?? 'no-session'"
              :turns="turns"
              :approvals="approvals"
              :turn-active="turnActive"
              :working="working"
              :retry-progress="retryProgress"
              :failure="failure"
              :fast-moon="fastMoon"
              :session-loading="sessionLoading"
              :compaction="compaction"
              :has-more-messages="hasMoreMessages"
              :loading-more="loadingMore"
              :loading-more-error="loadingMoreError"
              :is-following="following"
              :tool-diff-panel="true"
              :queued="queued"
              :skills="skills"
              @open-file="emit('openFile', $event)"
              @open-media="emit('openMedia', $event)"
              @copy-conversation-copied="handleCopyConversationCopied"
              @open-compaction="emit('openCompaction', $event)"
              @open-agent="emit('openAgent', $event)"
              @open-tool-diff="emit('openToolDiff', $event)"
              @detach-task="emit('detachTask', $event)"
              @quote="handleQuote"
              @edit-message="handleEditMessage"
              @resume-failure="emit('resumeFailure')"
              @load-older-messages="handleLoadOlderMessages"
              @unqueue="emit('unqueue', $event)"
              @edit-queued="handleEditQueued"
              @reorder-queue="handleReorderQueue"
              @steer-queued="emit('steerQueued', $event)"
              @send-queued="emit('sendQueued', $event)"
            />
          </template>
        </div>
      </div>
      <!-- Right-side multi-tab panel (0.39 port): Changes / Side chat /
           Turn diff / Terminal / task lists. Docked second column, moved
           after the dock — see the end of .chat-layout. -->
      <ChatDock
        v-if="!(turns.length === 0 && !sessionLoading)"
        :ref="bindChatDock"
        :style="chatDockStyle"
        :session-id="sessionId"
        :running="running"
        :starting="starting"
        :queued="queued"
        :search-files="searchFiles"
        :upload-image="uploadImage"
        :status="status"
        :thinking="thinking"
        :plan-mode="planMode"
        :plan-armed="planArmed"
        :swarm-mode="swarmMode"
        :goal-mode="goalMode"
        :activation-badges="activationBadges"
        :models="models"
        :starred-ids="starredIds"
        :skills="skills"
        :goal="goal"
        :goal-live="goalLive"
        :goal-expand-signal="goalExpandSignal"
        :bash-tasks="bashTasks"
        :subagent-tasks="subagentTasks"
        :plan-entry="latestPlan"
        :open-file="(target) => emit('openFile', target)"
        :bash-running="bashRunning"
        :subagent-running="subagentRunning"
        :todo-done-count="todoDoneCount"
        :has-dock-work="hasDockWork"
        :todos="todos"
        :pending-question="pendingQuestion"
        :question-busy-kind="questionBusyKind"
        :pending-approval="pendingApproval"
        :approval-busy="approvalBusy"
        :mobile="mobile"
        @show-panel="panel.show()"
        @open-agent="openAgentTab($event)"
        @detach-task="emit('detachTask', $event)"
        @answer="handleQuestionAnswer"
        @dismiss="emit('dismiss', $event)"
        @approval="handleApproval"
        @cancel-task="emit('cancelTask', $event)"
        @control-goal="emit('controlGoal', $event)"
        @submit="handleComposerSubmit"
        @steer="emit('steer', $event)"
        @command="(cmd, attachments) => emit('command', cmd, attachments)"
        @interrupt="handleInterrupt"
        @set-permission="emit('setPermission', $event)"
        @set-thinking="emit('setThinking', $event)"
        @toggle-plan="emit('togglePlan')"
        @toggle-plan-armed="emit('togglePlanArmed')"
        @toggle-swarm="emit('toggleSwarm')"
        @toggle-goal="emit('toggleGoal')"
          @open-btw="emit('command', '/btw')"
          @create-goal="emit('createGoal', $event)"
          @focus-goal="focusGoal"
          @compact="emit('compact')"
          @pick-model="emit('pickModel')"
          @select-model="emit('selectModel', $event)"
      />

      <!-- "New messages" pill — only visible when scrolled up and new content arrives. -->
      <Transition name="pill">
        <button
          v-if="showPill"
          class="newmsg-pill"
          :style="{ bottom: `${dockHeight + 12}px` }"
          :aria-label="t('conversation.jumpToLatestAria')"
          @click="scrollToBottom(true)"
        >
          <Icon class="pill-chevron" name="chevron-down" size="md" />
          {{ t('conversation.newMessages') }}
        </button>
      </Transition>

      <!-- Manual-abort toast: shown when the user presses Escape to stop a prompt -->
      <Transition name="abort-toast">
        <div
          v-if="abortToastVisible"
          class="abort-toast"
          role="status"
          aria-live="polite"
        >
          <span class="abort-toast-text">{{ t('conversation.manuallyAborted') }}</span>
        </div>
      </Transition>
      </div>

      <!-- Right-side multi-tab panel (0.39 port): Changes / Side chat /
           Turn diff / Terminal / task lists. Floating card over the
           transcript: it is a column of the layout, as upstream's is, and the
           panel's own component carries its geometry (see PanelTabs.vue). -->
        <!-- Upstream's panel: always in the DOM, parked with aria-hidden + inert
             while nothing is open, so the tab strip's tail (New tab, Close) is
             present in the resting state too. -->
        <PanelTabs
          :tabs="panel.tabs.value"
          :active-tab-id="panel.activeTabId.value"
          :visible="panel.visible.value"
          :expanded="panel.expanded.value"
          :can-expand="!mobile"
          :mobile="mobile"
          :preview-width="panel.previewWidth.value"
          :min-width="PANEL_PREVIEW_MIN"
          :max-width="panel.maxWidth.value"
          :no-anim="panelDragging"
          :can-open-diff="changedFiles.length > 0"
          :can-open-side-chat="sessionId !== undefined"
          @activate="panel.activateTab($event)"
          @close="panel.closeTab($event)"
          @add="addPanelTab($event)"
          @update:preview-width="panel.setPreviewWidth($event)"
          @dragging="panelDragging = $event"
          @toggle-expanded="panel.toggleExpanded()"
          @hide="panel.hide()"
        >
          <RightPanelPane
            v-if="panel.activeTab.value"
            :tab="panel.activeTab.value"
            :turns="turns"
            :changed-files="changedFiles"
            :app-tasks="appTasks"
            :side-chat="{
              turns: props.sideChatTurns ?? [],
              running: props.sideChatRunning ?? false,
              sending: props.sideChatSending ?? false,
            }"
            :terminal-available="sessionId !== undefined"
            :session-id="sessionId"
            @open-file="openFileInPanel"
            @open-agent="openAgentTab($event)"
            @side-chat-send="emit('sideChatSend', $event)"
            @open-media="emit('openMedia', $event)"
          />
        </PanelTabs>
    </div>

    <!-- Single app-wide selection popover (comment + quote-to-chat) for every
         surface that registers a selection via useSelectionCapture. -->
    <SelectionQuoteBubble />
  </section>
</template>

<style scoped>
.con {
  --read-max: 760px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  position: relative;
  container-type: inline-size;
}

.panes {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  /* No native scroll anchoring. While the user browses history (not
     following), assistant rows above the viewport change height as the
     eviction/content-visibility machinery skips and re-renders them, and the
     browser's anchor correction then yanks scrollTop back down mid-scroll.
     Bottom following and history prepend use explicit scroll writes. */
  overflow-anchor: none;
  scrollbar-gutter: stable;
}
/* Edge vignette — fade the transcript to invisible at the top and bottom so
   messages "scroll under" the floating top bar and composer instead of being
   hard-clipped. Pure compositing (mask is paint-only, no layout or input
   impact, no backdrop-filter). Gated behind the liquid-glass toggle.
   The bottom fade is short on purpose: the frost layer below
   (.chat-main::after) makes text illegible before the mask makes it
   invisible, so a long eased tail here would only re-introduce the grey
   ghost-text look the frost replaced. */
html[data-liquid-glass="on"] .panes {
  --con-pane-vignette: linear-gradient(
    to bottom,
    transparent 0,
    black 28px,
    black calc(100% - 28px),
    rgb(0 0 0 / 45%) calc(100% - 14px),
    transparent 100%
  );
  -webkit-mask-image: var(--con-pane-vignette);
  mask-image: var(--con-pane-vignette);
}

/* Top blur band — the top bar is a transparent overlay (style.css) and the
   scroller extends beneath it, so message text physically passes under the
   bar. This band blurs that underlaying text: full strength across the
   48px header zone, then fading out over the next 48px so it blends into
   the vignette instead of ending in a hard edge. An overlay on .chat-main
   (not a .panes pseudo, which would scroll with the content), so it spans
   the chat column only and never blurs the docked right panel; the header
   itself stays filter-free so it never captures fixed-position menus.
   Blur runs a step stronger than the .lg-glass dropdowns (14px vs 8px) —
   the band is the one place the user asked to read as clearly blurred. */
html[data-liquid-glass="on"] .chat-main::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 96px;
  pointer-events: none;
  z-index: 2;
  -webkit-backdrop-filter: blur(14px) saturate(170%) brightness(1.04);
  backdrop-filter: blur(14px) saturate(170%) brightness(1.04);
  -webkit-mask-image: linear-gradient(to bottom, black 0, transparent 100%);
  mask-image: linear-gradient(to bottom, black 0, transparent 100%);
}

/* Bottom frost layer — one continuous glass slab that the dock sits inside
   of, instead of a discrete blur strip parked above it. Spans from the very
   bottom of the layout up to 72px into the transcript: blur strength ramps
   0 → full over that top strip (eased pixel stops, so the ramp thickness is
   independent of dock height), then holds at full strength behind the dock,
   where the chips and composer read as embedded in the frost. Anchored via
   --dock-height (set inline from the measured dockHeight ref). Paints above
   the transcript (z-index 2) and below the dock (.chat-dock is z-sticky);
   the dock opts into transparency in liquid-glass mode so the frost shows
   through. Perf: the dock region blurs only the static page background (the
   transcript never extends under the dock — sibling layout), so the
   per-frame raster cost of the backdrop-filter stays confined to the top
   72px strip — the same cost class as the top band (style.css perf: WS-1A).
   Same placement rule as the top band: on .chat-main, never on .panes
   (a .panes pseudo would scroll with the content). The blur material is
   owned by the shared band rule in style.css; this block keeps geometry
   and the ramp mask only. */
html[data-liquid-glass="on"] .chat-main::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: calc(var(--dock-height, 0px) + 72px);
  pointer-events: none;
  z-index: 2;
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0,
    rgb(0 0 0 / 20%) 20px,
    rgb(0 0 0 / 55%) 44px,
    black 72px
  );
  mask-image: linear-gradient(
    to bottom,
    transparent 0,
    rgb(0 0 0 / 20%) 20px,
    rgb(0 0 0 / 55%) 44px,
    black 72px
  );
}

/* With the header overlaid, clear its height at rest so the first message
   and the load-older sentinel are not parked behind the bar; content still
   scrolls under it. Only when the header actually renders (never on mobile
   or the empty session, where the extra height would add a stray scrollbar). */
html[data-liquid-glass="on"] .panes.has-header {
  padding-top: var(--panel-head-h, 48px);
}

/* Chat tab layout: the chat column (header + message list + dock) sits in
   .chat-main; the right panel is a floating card positioned absolutely over
   it, so opening the panel shifts the transcript
   instead of squeezing the chat column. */
.chat-layout {
  display: flex;
  flex-direction: row;
  height: 100%;
  min-height: 0;
  position: relative;
}

.chat-main {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  /* Query container for everything in the chat column (ChatPane's
     @container rules, the TOC's cqi cap). The floating right panel is not
     part of this column, so the chat keeps its full width when the panel
     opens. */
  container-type: inline-size;
}

/* Right-side multi-tab panel — a floating card over the transcript: detached
   from the layout edges, rounded on all four corners, elevated with the lg
   drop shadow. It overlays instead of squeezing the chat column; the top
   edge sits flush with the 48px chat header's bottom hairline (any gap read
   as a detached stripe under the commit pills), the bottom inset shares
   the composer card's own bottom margin (measured --composer-clearance on
   .chat-layout, falling back to --dock-height when no composer is mounted).
   Width matches the upstream panel's --panel-default-w (460px). Tint-only
   controls inside (no nested backdrop-filter in Firefox or Chromium). Width
   is a layout property, so the drill-driven resize below eases with the
   gentle spring (no overshoot). */
.chat-scroll {
  flex: 1;
  min-height: 0;
  position: relative;
}

/* Chat reading column max-width + alignment. */
.content-wrap {
  width: 100%;
  max-width: var(--read-max);
  min-height: 100%;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.content-wrap.align-center { margin-left: auto; margin-right: auto; }
.content-wrap.align-left { margin-left: 0; margin-right: auto; }
/* Mobile: bubbles span the full pane width; no reading-column constraint. */
.content-wrap.align-mobile { max-width: none; }
@media (max-width: 640px) {
  .con.mobile {
    min-width: 0;
    overflow: hidden;
  }
  .con.mobile .panes {
    scrollbar-gutter: auto;
    -webkit-overflow-scrolling: touch;
  }
  .content-wrap.align-mobile {
    width: 100%;
    min-width: 0;
  }
}

/* Empty-workspace spacers: push the centred Composer to the vertical middle. */
.empty-spacer { flex: 1; }

/* Empty-session counterparts of the header. With no header there is nothing to
   drag the macOS window by and no header control to open the right panel with,
   so both live directly under `.con` (offsets and sizes are upstream's). */
.empty-drag {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: var(--panel-head-h, 48px);
}
.empty-drag.macos-desktop {
  -webkit-app-region: drag;
}
.empty-panel-btn {
  position: absolute;
  top: var(--space-3);
  right: var(--space-4);
  z-index: var(--z-sticky);
  width: var(--space-6);
  height: var(--space-6);
  border-radius: var(--radius-sm);
  -webkit-app-region: no-drag;
}
.empty-panel-btn svg {
  width: var(--p-ic-sm);
  height: var(--p-ic-sm);
}

/* Empty-session hint above the centred composer */
.empty-hint {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  padding: 0 16px 16px;
  color: var(--color-text);
  font-family: var(--font-ui);
}
.empty-hint-title {
  font-size: calc(var(--ui-font-size) + 16px);
  font-optical-sizing: auto;
  font-weight: 600;
}
.empty-hint-title.is-starting {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: var(--dim);
  font-weight: 400;
}
.empty-hint-text {
  display: inline-block;
  font-size: var(--text-base);
  color: var(--dim);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.empty-add-workspace {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 34px;
  padding: 7px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  color: var(--dim);
  font-family: var(--mono);
  font-size: var(--ui-font-size-sm);
  cursor: pointer;
}
.empty-add-workspace:hover {
  border-color: var(--color-accent-bd);
  color: var(--color-text);
}
.empty-add-workspace:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.empty-add-workspace svg {
  flex: none;
}

/* Empty-composer workspace picker */
/* Workspace chip — upstream's rules verbatim (ws-bar / ws-anchor / ws-chip and
   its name and chevron), so the new-session footer matches upstream's markup and
   geometry. The dropdown below it is the fork's own panel. */
.ws-bar {
  margin-top: calc(-1 * var(--space-4));
  padding: calc(var(--space-4) + var(--space-2)) var(--space-2) var(--space-2);
  background: color-mix(in srgb, var(--color-hover) 60%, transparent);
  border-radius: 0 0 var(--radius-2xl) var(--radius-2xl);
  font-family: var(--font-ui);
}
.ws-anchor { position: relative; }
.ws-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  max-width: 100%;
  padding: var(--space-2) var(--space-3);
  background: none;
  border: none;
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  font-family: inherit;
  font-size: var(--ui-font-size-sm);
  cursor: pointer;
  transition: background var(--duration-base) var(--ease-out);
}
.ws-chip:hover,
.ws-chip.open { background: var(--color-selected); color: var(--color-text); }
.ws-chip:focus-visible { outline: none; box-shadow: var(--p-focus-ring); }
.ws-chip > .kw-icon { flex: none; }
.ws-chip-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: var(--weight-option-label);
}
.ws-chip-chev { flex: none; transition: transform var(--duration-base) var(--ease-out); }
.ws-chip-chev.open { transform: rotate(180deg); }
.ws-pick-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-sticky);
}
.ws-pick-menu {
  position: absolute;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  left: 50%;
  transform: translateX(-50%);
  top: calc(100% + 6px);
  z-index: var(--z-dropdown);
  width: max-content;
  min-width: min(180px, calc(100cqw - var(--space-8)));
  max-width: calc(100cqw - var(--space-8));
  max-height: 50vh;
  overflow: hidden auto;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 4px;
}
.ws-pick-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
  font-family: var(--font-ui);
}
.ws-pick-item:hover { background: var(--panel2); }
.ws-pick-item.on { background: var(--color-accent-soft); }
.ws-pick-item-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  color: var(--color-text);
}
.ws-pick-item.on .ws-pick-item-name { color: var(--color-accent-hover); }
.ws-pick-item-path {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-xs);
  font-weight: 475;
  color: var(--muted);
}
.ws-pick-item.ws-pick-more {
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  color: var(--dim);
}
.ws-pick-item.ws-pick-more:hover { color: var(--color-text); }
.ws-pick-item.ws-pick-more span,
.ws-pick-action span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ws-pick-divider {
  height: 1px;
  margin: 4px 6px;
  background: var(--line);
}
.ws-pick-action {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  border-radius: 6px;
  padding: 7px 10px;
  cursor: pointer;
  font-family: var(--font-ui);
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  color: var(--dim);
}
.ws-pick-action:hover { background: var(--panel2); color: var(--color-text); }
.ws-pick-action svg { flex: none; }

/* Chat scroll area: owns only messages; the dock is the bottom sibling. */
.chat-scroll {
  display: flex;
  flex-direction: column;
}

/* Mobile shell: the outer .panes is just a flex host; the actual chat scroll is
   .chat-scroll inside it. Avoid a double scrollbar gutter on the chat tab. */
.mobile .panes:has(> .chat-layout) {
  overflow: hidden;
  scrollbar-gutter: auto;
}

.newmsg-pill {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--panel);
  color: var(--color-text);
  font-size: var(--ui-font-size-sm);
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  /* Positioned after the message flow, so it floats above content and above
     the top/bottom blur bands (z-index 2) while staying below composer
     dropdowns. */
  z-index: 3;
}
.newmsg-pill:hover { background: var(--panel2); }
/* Liquid glass: the pill floats over the bottom vignette/blur zone, so it
   consumes the shared glass material from the consuming rule in style.css
   (.newmsg-pill is on its selector list) with a denser tint than a dropdown
   — faded moving text must not read through it. Sibling of the bands (not
   nested), so the backdrop-filter is safe in Firefox and Chromium. */
html[data-liquid-glass="on"] .newmsg-pill.newmsg-pill {
  --lg-tint: color-mix(in srgb, var(--panel) 68%, transparent);
  --lg-tint-top: color-mix(in srgb, var(--panel) 68%, transparent);
}
html[data-liquid-glass="on"] .newmsg-pill.newmsg-pill:hover {
  --lg-tint: color-mix(in srgb, var(--panel2) 78%, transparent);
  --lg-tint-top: color-mix(in srgb, var(--panel2) 78%, transparent);
}
.pill-chevron {
  width: 12px;
  height: 12px;
}
.pill-enter-active,
.pill-leave-active {
  transition:
    opacity var(--duration-spring-gentle) var(--spring-gentle),
    transform var(--duration-spring-responsive) var(--spring-responsive);
}
.pill-enter-from,
.pill-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

.abort-toast {
  position: absolute;
  left: 50%;
  top: 60px;
  transform: translateX(-50%);
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  background: var(--color-text);
  color: var(--bg);
  font-size: var(--ui-font-size-sm);
  z-index: var(--z-sticky);
  box-shadow: var(--shadow-sm);
}
.abort-toast-text {
  display: flex;
  align-items: center;
  gap: 8px;
}
.abort-toast-enter-active,
.abort-toast-leave-active {
  transition:
    opacity var(--duration-spring-gentle) var(--spring-gentle),
    transform var(--duration-spring-responsive) var(--spring-responsive);
}
.abort-toast-enter-from,
.abort-toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-6px);
}

.con { background: var(--bg); }
.newmsg-pill { font-family: var(--sans); }
</style>
