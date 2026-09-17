<!-- apps/kimi-web/src/App.vue -->
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, provide, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Sidebar from './components/Sidebar.vue';
import ResizeHandle from './components/ResizeHandle.vue';
import ConversationPane from './components/chat/ConversationPane.vue';
import SessionAdminView from './views/SessionAdminView.vue';
import MediaPreview from './components/media/MediaPreview.vue';
import ModelPicker from './components/settings/ModelPicker.vue';
import ProviderManager from './components/settings/ProviderManager.vue';
import LoginDialog from './components/dialogs/LoginDialog.vue';
import SettingsDialog from './components/settings/SettingsDialog.vue';
import AddWorkspaceDialog from './components/dialogs/AddWorkspaceDialog.vue';
import ConfirmDialogHost from './components/dialogs/ConfirmDialogHost.vue';
import BrowserReferenceDialogHost from './components/chat/BrowserReferenceDialogHost.vue';
import StatusPanel from './components/chat/StatusPanel.vue';
import WarningToasts from './components/WarningToasts.vue';
import MobileTopBar from './components/mobile/MobileTopBar.vue';
import MobileSwitcherSheet from './components/mobile/MobileSwitcherSheet.vue';
import MobileSettingsSheet from './components/mobile/MobileSettingsSheet.vue';
import Onboarding from './components/settings/Onboarding.vue';
import GlobalLoading from './components/GlobalLoading.vue';
import DebugPanel from './debug/DebugPanel.vue';
import { isTraceEnabled } from './debug/trace';
import { useKimiWebClient } from './composables/useKimiWebClient';
import { setLocale, type LocaleCode } from './i18n';
import { useConfirmDialog } from './composables/useConfirmDialog';
import type { PromptAttachment } from './composables/useKimiWebClient';
import type { ToolMedia, TurnAttachment } from './types';
import { useAuthGate } from './composables/useAuthGate';
import { usePageTitle } from './composables/usePageTitle';
import { useSidebarLayout } from './composables/useSidebarLayout';
import { useFilePreview } from './composables/useFilePreview';
import { ensureGlassEngine } from './lib/glass/gl-renderer';
import { useDetailPanel } from './composables/useDetailPanel';
import { useRightPanel } from './composables/useRightPanel';
import { useIsMobile } from './composables/useIsMobile';
import { useMemoizedSwarmMembers } from './composables/useMemoizedSwarmMembers';
import { useGlassRefraction } from './composables/useGlassRefraction';
import type { SwarmMember } from './composables/swarmGroups';
import ServerAuthDialog from './components/ServerAuthDialog.vue';
import { initServerAuth, onAuthRequired } from './api/daemon/serverAuth';
import { getKimiWebApi } from './api';
import type { AppConfig, ManagedUsageResult, ThinkingLevel } from './api/types';
import { effectiveThinkingLevel } from './lib/modelThinking';
import { stripSkillPrefix } from './lib/slashCommands';
import Button from './components/ui/Button.vue';
import GlassDefs from './components/ui/GlassDefs.vue';
import IconButton from './components/ui/IconButton.vue';
import Icon from './components/ui/Icon.vue';
import Spinner from './components/ui/Spinner.vue';
import { isMacosDesktop } from './lib/desktopFlag';

// Hydrate the server-transport credential (fragment token or localStorage)
// BEFORE the client connects, so the first REST/WS calls already carry it.
initServerAuth();
// Stays false until the server actually rejects us with 401/40101. Starting
// from "no credential ⇒ prompt" flashed the token dialog for a frame in
// `--dangerous-bypass-auth` mode, before /meta had advertised the bypass.
const authRequired = ref(false);
let offAuthRequired: (() => void) | null = null;

const client = useKimiWebClient();
// Liquid-glass WebGL refraction fallback (Firefox/Safari; no-op on Blink).
// The renderer is a module singleton — this only ties its lifecycle to the
// mounted app (see lib/glass/gl-renderer.ts).
onUnmounted(ensureGlassEngine());
// When the server runs with `--dangerous-bypass-auth`, `/meta` advertises it
// and we skip the token prompt entirely — there is no credential to enter.
const showServerAuth = computed(
  () => !client.dangerousBypassAuth.value && authRequired.value,
);
provide('resolveImage', client.resolveImageUrl);
// Live swarm member roster for the inline AgentSwarm tool card. Sourced from the
// AppTask store so the card shows each subagent's live phase; on refresh the
// tasks are gone and the card falls back to the parsed tool result. Includes
// single-member "swarms" (e.g. AgentSwarm with one resume_agent_ids entry),
// which buildSwarmGroups filters out for the badge counter.
// Memoized on the active task slice's identity: every event re-assigns
// tasksBySession (and thus re-derives the client's swarm map), so without this
// the member map would be rebuilt per event.
const memoizedSwarmMembersByToolCallId = useMemoizedSwarmMembers(client.activeAppTasks);
provide(
  'resolveSwarmMembers',
  (toolCallId: string): SwarmMember[] => memoizedSwarmMembersByToolCallId.value.get(toolCallId) ?? [],
);
const { t, locale } = useI18n();
const { confirm } = useConfirmDialog();

// KAP/daemon debug panel — opt-in via ?debug=1 or localStorage kimi-web.debug=1.
const debugEnabled = isTraceEnabled();

// Narrow viewports (≤640px) render the single-column mobile shell; desktop is
// unchanged. Falls back to desktop when matchMedia is unavailable.
const isMobile = useIsMobile();

// Mobile sheet visibility
const showMobileSwitcher = ref(false);
const showMobileSettings = ref(false);

// Active session title for the mobile top bar.
const activeSessionTitle = computed<string>(() => {
  const id = client.activeSessionId.value;
  return client.sessions.value.find((s) => s.id === id)?.title ?? '';
});

// Whether the active session is pinned — drives the chat header's Pin/Unpin.
const activeSessionPinned = computed<boolean>(() => {
  const id = client.activeSessionId.value;
  return client.sessions.value.find((s) => s.id === id)?.pinned ?? false;
});

// Number of sessions in the active workspace (mobile top-bar sub-line).
const activeWorkspaceSessionCount = computed<number>(
  () => client.visibleWorkspace.value?.sessionCount ?? 0,
);

// running: true when activity is not idle
const running = computed(() => client.activity.value !== 'idle');

// Auth readiness gates the main app. Once the first load finishes and auth is
// still missing, show a full-page login entry instead of an in-app banner.
const authLogoRef = ref<SVGSVGElement | null>(null);
const { showAuthGate, blinkAuthLogo } = useAuthGate({ client, authLogoRef });


// Static page title (app name only). The session title and workspace name are
// intentionally excluded so the tab title stays stable. Prefixes an animated
// spinner while the agent is running so activity is visible at a glance.
usePageTitle({ running, showAuthGate });

// Status panel (/status) renders current client state only — show the
// effective thinking level so "no preference" reads as the model default that
// will actually run, not a blank.
const statusPanelThinking = computed<ThinkingLevel>(() => {
  const model = client.models.value.find((m) => m.id === client.status.value.modelId);
  return effectiveThinkingLevel(model, client.thinking.value);
});

// First-run onboarding (language + welcome greeting). Shown until the user
// finishes it once; re-openable from the settings popover.
const showOnboarding = ref(!client.onboarded.value);
function completeOnboarding(): void {
  client.setOnboarded(true);
  showOnboarding.value = false;
}
function openOnboarding(): void {
  showOnboarding.value = true;
}

// iOS Safari does not shrink `dvh` for the on-screen keyboard. Instead it pans
// the visual viewport (offsetTop > 0) to reveal the focused field, which a
// 100dvh in-flow shell cannot follow: the dock ends up behind the keyboard, or
// the page shows a blank band past the shell's bottom edge. Pin the shell to
// the VISUAL viewport instead: position:fixed + top/height mirrored from
// visualViewport (height shrinks with the keyboard, offsetTop tracks the pan).
// No-ops on desktop, where offsetTop is 0 and height equals innerHeight.
let appHeightRaf = 0;
function setAppHeight(): void {
  const vv = window.visualViewport;
  const root = document.documentElement.style;
  root.setProperty('--app-height', `${vv?.height ?? window.innerHeight}px`);
  root.setProperty('--app-top', `${vv?.offsetTop ?? 0}px`);
}
function syncAppHeight(): void {
  if (appHeightRaf) return;
  appHeightRaf = requestAnimationFrame(() => {
    appHeightRaf = 0;
    setAppHeight();
  });
}

onMounted(() => {
  // Register the 401 listener before the first requests go out, so a token
  // rejection during the initial load() can never be missed.
  offAuthRequired = onAuthRequired(() => {
    authRequired.value = true;
    // The server now demands a token, so any cached "bypass" state from a
    // previous mode is stale — drop it so the token prompt can show.
    client.clearDangerousBypassAuth();
  });
  void client.load();
  loadSidebarCollapsed();
  setAppHeight();
  window.visualViewport?.addEventListener('resize', syncAppHeight);
  window.visualViewport?.addEventListener('scroll', syncAppHeight);
  window.addEventListener('resize', syncAppHeight);
});

onUnmounted(() => {
  window.visualViewport?.removeEventListener('resize', syncAppHeight);
  window.visualViewport?.removeEventListener('scroll', syncAppHeight);
  window.removeEventListener('resize', syncAppHeight);
  if (appHeightRaf) {
    cancelAnimationFrame(appHeightRaf);
    appHeightRaf = 0;
  }
  document.documentElement.style.removeProperty('--app-height');
  document.documentElement.style.removeProperty('--app-top');
  closeMediaPreview();
  if (offAuthRequired !== null) {
    offAuthRequired();
    offAuthRequired = null;
  }
});

// ---------------------------------------------------------------------------
// The right panel. Its state is upstream's (useRightPanel): a list of tabs, one
// active id, a width and a visibility flag — the panel owns all of it and the
// transcript only opens tabs on it. Escape is not a way out of it (upstream
// closes the panel from its own Close control), so there is no global handler.
// ---------------------------------------------------------------------------
const panel = useRightPanel();

// Tabs are per session: switching restores the incoming session's restorable
// tabs (agent, compaction, side chat) and drops the rest, terminals included.
watch(client.activeSessionId, (id) => panel.bindSession(id), { immediate: true });

const {
  requestFilePreview,
  loadFilePreview,
  closeFilePreview,
} = useFilePreview({ client });

// The panel's file tab IS the preview: opening it loads the file, closing it or
// switching away resets the preview state (upstream wires the same pair).
watch(
  [() => panel.activeTab.value?.id ?? null, () => panel.visible.value] as const,
  () => {
    const tab = panel.activeTab.value;
    if (panel.visible.value && tab?.kind === 'file') {
      void loadFilePreview({ path: tab.path, line: tab.line });
    } else {
      closeFilePreview();
    }
  },
  { immediate: true },
);

const mediaPreview = ref<ToolMedia | null>(null);
const mediaPreviewSrc = ref<string | null>(null);
const mediaPreviewLoading = ref(false);
let mediaPreviewObjectUrl: string | null = null;
let mediaPreviewRequest = 0;

function revokeMediaPreviewUrl(): void {
  if (mediaPreviewObjectUrl !== null) {
    URL.revokeObjectURL(mediaPreviewObjectUrl);
    mediaPreviewObjectUrl = null;
  }
}

function closeMediaPreview(): void {
  mediaPreviewRequest += 1;
  revokeMediaPreviewUrl();
  mediaPreview.value = null;
  mediaPreviewSrc.value = null;
  mediaPreviewLoading.value = false;
}

function openMediaPreview(media: ToolMedia): void {
  if (media.kind !== 'image' && media.kind !== 'video') return;
  const request = ++mediaPreviewRequest;
  revokeMediaPreviewUrl();
  mediaPreview.value = media;
  mediaPreviewSrc.value = null;
  const fileId = media.fileId;
  const fallbackSrc = /^(?:https?:|blob:|data:)/i.test(media.url) ? media.url : null;

  if (!fileId) {
    mediaPreviewLoading.value = false;
    mediaPreviewSrc.value = fallbackSrc;
    return;
  }

  mediaPreviewLoading.value = true;
  const sid = client.activeSessionId.value;
  // Prompt-attached media ids only resolve on the session-scoped route; without
  // an active session id the generic /files call is a guaranteed 404, so skip
  // straight to the fallback instead of waiting for it.
  const fetchBlob = media.sessionMedia
    ? sid
      ? () => getKimiWebApi().getSessionMediaBlob(sid, fileId)
      : undefined
    : () => getKimiWebApi().getFileBlob(fileId);
  if (!fetchBlob) {
    mediaPreviewSrc.value = fallbackSrc;
    mediaPreviewLoading.value = false;
    return;
  }
  // Staleness is guarded by the request counter alone — every open/close bumps
  // it. Comparing mediaPreview.value against the passed object is NOT a valid
  // guard: the ref wraps object values in a reactive proxy, so a freshly-built
  // media literal never compares equal and both settle branches would be
  // discarded, leaving the overlay stuck on "Loading preview…" forever.
  void Promise.resolve()
    .then(fetchBlob)
    .then((blob: Blob) => {
      if (request !== mediaPreviewRequest) return;
      mediaPreviewObjectUrl = URL.createObjectURL(blob);
      mediaPreviewSrc.value = mediaPreviewObjectUrl;
    })
    .catch(() => {
      if (request !== mediaPreviewRequest) return;
      mediaPreviewSrc.value = fallbackSrc;
    })
    .finally(() => {
      if (request === mediaPreviewRequest) mediaPreviewLoading.value = false;
    });
}

// True while the right-side slot is actually occupied, so the sidebar reserves
// room for it and the conversation can never be squeezed.
const previewOpen = computed(() => panel.visible.value);

// ---------------------------------------------------------------------------
// Layout: resizable session column. ResizeHandle owns the column width (with
// localStorage persistence); we mirror it here to drive the App grid.
// ---------------------------------------------------------------------------
const {
  SIDEBAR_WIDTH_KEY,
  SIDEBAR_DEFAULT,
  SIDEBAR_MIN,
  sidebarMax,
  sessionColWidth,
  sidebarCollapsed,
  sidebarDragging,
  sideWidth,
  loadSidebarCollapsed,
  toggleSidebarCollapse,
} = useSidebarLayout({ previewOpen });

// The panel's width is half the room left beside the sidebar (upstream's own
// rule), so the sidebar's width is what it needs to know.
watch(sideWidth, (width) => panel.setSideWidth(width), { immediate: true });

// ---------------------------------------------------------------------------
// The panel's data layer: what a tab's body reads, and the transcript's openers.
// ---------------------------------------------------------------------------
const {
  openToolDiff,
  openDiffDetail,
  openSideChatTab,
  closeSideChat,
} = useDetailPanel({ client });

// Reference to ConversationPane so we can imperatively switch tabs
const conversationPaneRef = ref<InstanceType<typeof ConversationPane> | null>(null);

// Dialog visibility refs
const showModelPicker = ref(false);
const showProviders = ref(false);

const showLogin = ref(false);
const showAddWorkspace = ref(false);
const showStatusPanel = ref(false);
const showSettings = ref(false);

const planUsage = ref<ManagedUsageResult | null>(null);
const planUsageLoading = ref(false);
let usageLoadedForAuth = false;
watch(client.authReady, (ready) => {
  if (!ready) {
    usageLoadedForAuth = false;
    planUsage.value = null;
    return;
  }
  if (usageLoadedForAuth) return;
  usageLoadedForAuth = true;
  planUsageLoading.value = true;
  void getKimiWebApi().getManagedUsage().then((usage) => {
    planUsage.value = usage;
  }).catch(() => {
    planUsage.value = { kind: 'error', message: 'Unable to load plan usage' };
  }).finally(() => {
    planUsageLoading.value = false;
  });
}, { immediate: true });

type SubmitPayload = {
  text: string;
  attachments: PromptAttachment[];
};
const pendingWorkspaceSubmit = ref<SubmitPayload | null>(null);
// Inline error shown inside the add-workspace picker after the daemon rejects
// a path. Kept separate from the global toast so the feedback is visible above
// the picker's backdrop and persists until the user retries or closes.
const addWorkspaceError = ref<string | null>(null);

// ---------------------------------------------------------------------------
// Main view (the app has no router): the chat pane or the experimental Lab
// session-admin page. The admin page owns its own Escape handler (its close
// resets this to 'chat'); anyOverlayOpen below keeps the global Escape from
// closing side panels underneath it.
// ---------------------------------------------------------------------------
const mainView = ref<'chat' | 'sessionAdmin'>('chat');

function openSessionAdmin(): void {
  mainView.value = 'sessionAdmin';
}

/** Open a session picked from the admin table: leave the admin view and select
 *  it in the chat pane. */
function openSessionFromAdmin(sessionId: string): void {
  mainView.value = 'chat';
  client.selectSession(sessionId);
}

/** The search dialog can land on a workspace while the sidebar is collapsed;
 *  expand it so the selection is visible. */
function expandSidebar(): void {
  if (sidebarCollapsed.value) toggleSidebarCollapse();
}

// Loading state for model/provider fetches
const modelsLoading = ref(false);
const modelsUnavailable = ref(false);
const providersLoading = ref(false);
const providersUnavailable = ref(false);
const configSaving = ref(false);

async function openModelPicker(): Promise<void> {
  modelsLoading.value = true;
  modelsUnavailable.value = false;
  showModelPicker.value = true;
  try {
    // Full refresh first (every refreshable provider, not just OAuth), so the
    // list always reflects the live catalog — the WS model-catalog event that
    // used to keep the cache warm is no longer forwarded by the daemon.
    await client.refreshAllProviders();
  } catch {
    modelsUnavailable.value = true;
  } finally {
    modelsLoading.value = false;
  }
}

async function openProviders(): Promise<void> {
  providersLoading.value = true;
  providersUnavailable.value = false;
  showProviders.value = true;
  try {
    await client.loadProviders();
  } catch {
    providersUnavailable.value = true;
  } finally {
    providersLoading.value = false;
  }
}

function openLogin(): void {
  showLogin.value = true;
}

async function handleSelectModel(modelId: string): Promise<void> {
  showModelPicker.value = false;
  // Same semantics as the composer dropdown rows: the overlay is just the
  // "more models" continuation of the same flow, so it must also bump the
  // global default (see handleComposerSelectModel).
  await handleComposerSelectModel(modelId);
}

async function handleComposerSelectModel(modelId: string): Promise<void> {
  // Primary action: switch the active session's model via POST /sessions/{id}/profile
  // (same as the model picker overlay). Awaited so the model pill reflects the
  // result and failures surface. In the onboarding draft this just stores the
  // pick for the first session.
  const switched = await client.setModel(modelId);

  // Side effect: also bump the daemon-wide default model via POST /config so
  // new sessions inherit the choice. Fire-and-forget — it must not block the UI
  // or mask the session switch. Only after a confirmed switch (a stale/invalid
  // alias must not become the global default), and skip when it already
  // matches the default.
  if (switched && modelId !== client.defaultModel.value) {
    void client.updateConfig({ defaultModel: modelId });
  }
}

async function handleAddProvider(input: { type: string; apiKey?: string; baseUrl?: string; defaultModel?: string }): Promise<void> {
  await client.addProvider(input);
}

async function handleRefreshProvider(id: string): Promise<void> {
  await client.refreshProvider(id);
}

// Destructive session/workspace/provider actions confirm through the shared
// modal here (the menu components only emit the intent). Each passes its work
// as the dialog `action`, so the dialog stays open with a loading state until
// the operation settles. Every client call here toasts its own errors and never
// rejects.
async function confirmArchiveSession(id: string): Promise<void> {
  await confirm({
    title: t('sidebar.archive'),
    message: t('sidebar.archiveConfirm'),
    variant: 'danger',
    action: () => client.archiveSession(id),
  });
}

// Permanent delete: a danger confirm naming the session, then the success toast
// (nothing was archived, so the archive flow's undo affordance would be a lie).
// The action captures the client's own result — the dialog's boolean only says
// the user confirmed — and the client call surfaces its failures itself.
async function confirmDeleteSession(id: string): Promise<void> {
  const title =
    client.sessions.value.find((s) => s.id === id)?.title ??
    client.doneSessions.value.find((s) => s.id === id)?.title ??
    id;
  let deleted = false;
  const confirmed = await confirm({
    title: t('sidebar.deleteConfirmTitle'),
    message: t('sidebar.deleteConfirmMessage', { title }),
    confirmLabel: t('sidebar.deleteConfirmButton'),
    cancelLabel: t('common.cancel'),
    variant: 'danger',
    action: async () => {
      deleted = await client.deleteSession(id);
    },
  });
  if (confirmed && deleted) client.pushNotice(t('sidebar.deleteToast'), 'info');
}

async function confirmDeleteWorkspace(id: string): Promise<void> {
  const name = client.workspacesView.value.find((w) => w.id === id)?.name ?? id;
  await confirm({
    title: t('sidebar.removeWorkspace'),
    message: t('workspace.removeWorkspaceConfirm', { name }),
    variant: 'danger',
    action: () => client.deleteWorkspace(id),
  });
}

async function confirmDeleteProvider(id: string): Promise<void> {
  await confirm({
    title: t('providers.delete'),
    message: t('providers.confirmDelete'),
    variant: 'danger',
    action: () => client.deleteProvider(id),
  });
}

async function handleUpdateConfig(patch: Partial<AppConfig>): Promise<void> {
  configSaving.value = true;
  try {
    const saved = await client.updateConfig(patch);
    if (saved) {
      await client.checkAuth();
    }
  } finally {
    configSaving.value = false;
  }
}

// LoginDialog callbacks — delegates to composable
async function handleStartOAuthLogin() {
  return client.startOAuthLogin();
}

async function handlePollOAuthLogin() {
  return client.pollOAuthLogin();
}

async function handleCancelOAuthLogin() {
  return client.cancelOAuthLogin();
}

async function handleLoginSuccess(): Promise<void> {
  showLogin.value = false;
  // Re-check auth state and reload sessions now that we're authenticated
  await client.checkAuth();
  await client.load();
}

// Edit + resend the last user message: undo the latest exchange on the daemon,
// then drop that message's text back into the composer for editing.
async function handleEditMessage(payload: {
  text: string;
  attachments?: TurnAttachment[];
}): Promise<void> {
  await client.undo(1);
  await nextTick();
  conversationPaneRef.value?.loadComposerForEdit(payload.text, payload.attachments);
}

// Handler for slash commands emitted by Composer (via ConversationPane).
// `attachments` carries the composer chips for skill commands — the Composer
// already cleared them, so they must ride along or they'd be dropped.
function handleCommand(cmd: string, attachments?: PromptAttachment[]): void {
  // `/compact <text>` carries an optional free-text instruction steering what
  // the summary should focus on (TUI parity).
  if (cmd === '/compact' || cmd.startsWith('/compact ')) {
    client.compact(cmd.slice('/compact'.length).trim() || undefined);
    return;
  }
  // `/swarm` toggles swarm mode; `/swarm on|off` sets it; `/swarm <task>` enables
  // swarm and runs the task right away (TUI parity).
  if (cmd === '/swarm' || cmd.startsWith('/swarm ')) {
    const arg = cmd.slice('/swarm'.length).trim();
    if (arg === 'on') client.setSwarmMode(true);
    else if (arg === 'off') client.setSwarmMode(false);
    else if (arg) { client.setSwarmMode(true); void client.sendPrompt(arg); }
    else void client.toggleSwarmMode();
    return;
  }
  // `/goal <objective>` creates a goal (and submits it); `/goal pause|resume|cancel`
  // controls the active one; bare `/goal` toggles goal mode for the next message.
  if (cmd === '/goal' || cmd.startsWith('/goal ')) {
    const arg = cmd.slice('/goal'.length).trim();
    if (arg === 'pause' || arg === 'resume' || arg === 'cancel') client.controlGoal(arg);
    else if (arg) void client.createGoal(arg);
    else client.toggleGoalMode();
    return;
  }
  // `/btw <question>` opens (creating if needed) the side chat and asks it; bare
  // `/btw` toggles the side-chat tab for the active session.
  if (cmd === '/btw' || cmd.startsWith('/btw ')) {
    const arg = cmd.slice('/btw'.length).trim();
    if (!arg && client.sideChatVisible.value) {
      // Use the detail-layer close so detailTarget is cleared too; the bare
      // client.closeSideChat() only hides the panel and leaves detailTarget set.
      closeSideChat();
    } else {
      void openSideChatTab(arg || undefined);
    }
    return;
  }
  // `/add-dir <path>` adds an additional workspace directory for this session
  // only (TUI parity, minus the persist chooser).
  if (cmd === '/add-dir' || cmd.startsWith('/add-dir ')) {
    const arg = cmd.slice('/add-dir'.length).trim();
    if (arg) void client.addDir(arg);
    return;
  }
  // `/title <text>` renames the active session (TUI /title with an argument).
  // A bare `/title` is a no-op — the web shows the title in the header and
  // sidebar already.
  if (cmd === '/title' || cmd.startsWith('/title ')) {
    const arg = cmd.slice('/title'.length).trim();
    const sid = client.activeSessionId.value;
    if (arg && sid) void client.renameSession(sid, arg);
    return;
  }
  switch (cmd) {
    // `/new` and `/clear` are aliases: both open the onboarding composer. The
    // session is only created when the user sends the first message.
    case '/new':
    case '/clear':
      handleCreateSession();
      break;
    case '/fork':
      void client.forkSession();
      break;
    case '/export':
      void client.exportSession();
      break;
    case '/undo':
      void client.undo();
      break;
    case '/reload':
      void client.reload();
      break;
    case '/init':
      client.initSession();
      break;
    case '/plan':
      client.togglePlanArmed();
      break;
    case '/model':
    case '/effort':
      conversationPaneRef.value?.openComposerModelMenu();
      break;
    case '/permission':
      conversationPaneRef.value?.openComposerPermissionMenu();
      break;
    // `/yolo` jumps straight to YOLO (the pill menu's second row); the picker
    // itself stays `/permission`.
    case '/yolo':
      client.setPermission('yolo');
      break;
    // `/usage` is the TUI's usage view — here the status panel carries tokens +
    // context window, so it is an alias of `/status`.
    case '/status':
    case '/usage':
      showStatusPanel.value = true;
      break;
    case '/login':
      openLogin();
      break;
    case '/logout':
      void client.logout();
      break;
    case '/version':
      client.pushNotice(t('commands.version.notice', { version: client.serverVersion.value }));
      break;
    // Desktop keeps the session list always visible in the sidebar, so the
    // command only does something on mobile (opens the switcher sheet).
    case '/sessions':
      if (isMobile.value) showMobileSwitcher.value = true;
      break;
    default: {
      // Not a built-in command → treat it as a session skill activation
      // (the user picked `/skill:<skill>` from the menu, or typed
      // `/<skill> args`). Strip the `skill:` display prefix — the REST API
      // takes the bare skill name. The daemon answers an unknown name with
      // skill.not_found, surfaced as a warning, so a stray slash is harmless.
      // With no active session, create one first (same path as the first
      // prompt) so the activation isn't silently dropped on the new-session
      // screen.
      const space = cmd.indexOf(' ');
      const name = stripSkillPrefix((space === -1 ? cmd : cmd.slice(0, space)).slice(1));
      const args = space === -1 ? undefined : cmd.slice(space + 1).trim() || undefined;
      if (!name) break;
      if (!client.activeSessionId.value && client.activeWorkspaceId.value) {
        void client.startSessionAndActivateSkill(client.activeWorkspaceId.value, name, args, attachments);
      } else {
        void client.activateSkill(name, args, undefined, attachments);
      }
      break;
    }
  }
}

function handleUnqueue(index: number): void {
  client.unqueue(index);
}

// Editing a queued message: the Composer already loaded the text into its
// textarea; here we just remove it from the queue so it isn't sent twice.
function handleEditQueued(index: number): void {
  client.unqueue(index);
}

function handleReorderQueue(payload: { from: number; to: number }): void {
  client.reorderQueue(payload.from, payload.to);
}

async function handleSubmit(payload: SubmitPayload): Promise<void> {
  const wsId = client.activeWorkspaceId.value;
  if (!client.activeSessionId.value && wsId) {
    await client.startSessionAndSendPrompt(wsId, payload.text, payload.attachments);
    return;
  }
  if (!client.activeSessionId.value && !wsId) {
    pendingWorkspaceSubmit.value = payload;
    showAddWorkspace.value = true;
    return;
  }
  void client.sendPrompt(payload.text, payload.attachments);
}

async function handleResumeFailure(): Promise<void> {
  const turn = [...client.turns.value].reverse().find((item) => item.role === 'user');
  if (!turn || !turn.text.trim()) return;
  const attachments = (turn.attachments ?? [])
    .filter((attachment): attachment is TurnAttachment & { fileId: string } => typeof attachment.fileId === 'string')
    .map((attachment) => ({
      fileId: attachment.fileId,
      kind: attachment.kind,
      name: attachment.name,
      mediaType: attachment.mediaType,
      size: attachment.size,
    }));
  await handleSubmit({ text: turn.text, attachments });
}

async function handleSessionUpdate(id: string, patch: { emoji?: string; pinned?: boolean }): Promise<void> {
  await getKimiWebApi().updateSession(id, patch);
  await client.load();
}

/** On-demand session title regeneration from a row's rename field. Runs the
   *  daemon call, reports the title back to the row (so its field settles),
   *  and surfaces an info toast when generation is unavailable. The server
   *  publishes session.meta.updated on success, so the list/header titles
   *  refresh by themselves. */
async function handleGenerateSessionTitle(
  id: string,
  done: (title: string | null) => void,
): Promise<void> {
  const title = await client.generateSessionTitle(id, { force: true, source: 'digest' });
  if (title === null) client.pushNotice(t('sidebar.genTitleUnavailable'));
  done(title);
}

// Top-center export confirmation toast: 'running' while the ZIP is generated,
// 'done' once the download starts (auto-dismisses). Failures route through the
// regular warning stack from client.exportSession.
const exportToastVisible = ref(false);
const exportToastDone = ref(false);
const exportToastEl = ref<HTMLElement | null>(null);
// WebGL rim-refraction fallback (Firefox/Safari): like the design-system toast,
// this one rests over live content for seconds, so non-transient — the page
// snapshot keeps refreshing underneath (see ui/Toast.vue).
useGlassRefraction(exportToastEl, { transient: false });
let exportToastTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => client.exportState.value,
  (state, previous) => {
    if (exportToastTimer !== null) {
      clearTimeout(exportToastTimer);
      exportToastTimer = null;
    }
    if (state === 'running') {
      exportToastDone.value = false;
      exportToastVisible.value = true;
    } else if (state === 'done') {
      exportToastDone.value = true;
      exportToastVisible.value = true;
      exportToastTimer = setTimeout(() => {
        exportToastVisible.value = false;
        client.resetExportState();
      }, 3000);
    } else if (state === 'idle' && (previous === 'running' || previous === 'done')) {
      exportToastVisible.value = false;
    }
  },
);
onUnmounted(() => {
  if (exportToastTimer !== null) clearTimeout(exportToastTimer);
});

async function handleAddWorkspace(root: string): Promise<void> {
  addWorkspaceError.value = null;
  const added = await client.addWorkspaceByPath(root);
  // Keep the picker open (and the pending submission intact) when the daemon
  // rejects the path so the user can retry with a valid one. The error is shown
  // inline in the picker. Closing via Escape goes through handleCloseAddWorkspace,
  // which drops the pending prompt.
  if (!added) {
    addWorkspaceError.value = t('workspace.addFailed');
    return;
  }
  showAddWorkspace.value = false;
  const pending = pendingWorkspaceSubmit.value;
  pendingWorkspaceSubmit.value = null;
  const wsId = client.activeWorkspaceId.value;
  if (pending && wsId) {
    await client.startSessionAndSendPrompt(wsId, pending.text, pending.attachments);
  }
}

function handleCloseAddWorkspace(): void {
  pendingWorkspaceSubmit.value = null;
  addWorkspaceError.value = null;
  showAddWorkspace.value = false;
}

function focusComposerAfterDraft(): void {
  void nextTick(() => {
    conversationPaneRef.value?.focusComposer();
  });
}

// Primary "+ New": enter the draft state in the current workspace so the
// right pane shows the onboarding composer. The session is only created when
// the user sends the first message.
function handleCreateSession(): void {
  const wsId = client.activeWorkspaceId.value;
  if (wsId) {
    client.openWorkspaceDraft(wsId);
  } else {
    client.clearActiveSession();
  }
  focusComposerAfterDraft();
}

// Workspace-level "+ New" (sidebar group or mobile switcher): enter the draft
// state in the chosen workspace. No backend session is created until the user
// actually sends a message.
function handleCreateSessionInWorkspace(workspaceId: string): void {
  client.openWorkspaceDraft(workspaceId);
  focusComposerAfterDraft();
}

// Chat header: open a GitHub PR in a new tab.
function openPr(url: string): void {
  if (url) window.open(url, '_blank', 'noopener');
}
</script>

<template>
  <div class="app-shell">
    <!-- SVG defs for the liquid-glass refraction layer (zero-footprint; see
         components/ui/GlassDefs.vue). -->
    <GlassDefs />
    <ServerAuthDialog v-if="showServerAuth" />
    <section v-if="showAuthGate" class="auth-page">
      <div class="auth-page-inner">
        <svg ref="authLogoRef" class="auth-page-logo ch-logo" viewBox="0 0 32 22" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Kimi Code" @mousedown.prevent @click="blinkAuthLogo">
          <defs>
            <mask id="authKimiEyes" maskUnits="userSpaceOnUse">
              <rect x="0" y="0" width="32" height="22" fill="#fff" />
              <g class="ch-eyes" fill="#000">
                <rect class="ch-eye" x="11.8" y="7" width="2.8" height="8" rx="1.4" />
                <rect class="ch-eye" x="17.4" y="7" width="2.8" height="8" rx="1.4" />
              </g>
            </mask>
          </defs>
          <rect x="1" y="1" width="30" height="20" rx="6" fill="var(--logo)" mask="url(#authKimiEyes)" />
        </svg>
        <div class="auth-page-copy">
          <h1>{{ t('app.authPageTitle') }}</h1>
          <p>{{ t('app.authPageMessage') }}</p>
        </div>
        <Button class="auth-page-btn" variant="primary" @click="openLogin">
          <Icon name="log-in" size="md" />
          <span>{{ t('app.authPageLogin') }}</span>
        </Button>
      </div>
    </section>
    <div
      v-else
      class="app"
      :class="{
        mobile: isMobile,
        'sidebar-collapsed': sidebarCollapsed && !isMobile,
        'macos-desktop': isMacosDesktop,
        'right-panel-open': panel.visible.value,
      }"
    >
    <!-- Desktop navigation: workspace rail + resizable session column. -->
    <template v-if="!isMobile">
      <Sidebar
        :collapsed="sidebarCollapsed"
        :dragging="sidebarDragging"
        :col-width="sideWidth"
        :active-workspace="client.visibleWorkspace.value"
        :active-workspace-id="client.activeWorkspaceId.value"
        :sessions="client.sessionsForView.value"
        :groups="client.workspaceGroups.value"
        :active-id="client.activeSessionId.value"
        :attention-by-session="client.attentionBySession.value"
        :pending-by-session="client.pendingBySession.value"
        :unread-by-session="client.unreadBySession.value"
        :workspace-sort-mode="client.workspaceSortMode.value"
        :backend="client.backend.value"
        :lab-sidebar-tabs="client.labSidebarTabs.value"
        :signed-in="client.managedProviderStatus.value === 'authenticated'"
        :color-scheme="client.colorScheme.value"
        :locale="locale as LocaleCode"
        @select="client.selectSession($event)"
        @create="handleCreateSession"
        @create-in-workspace="handleCreateSessionInWorkspace($event)"
        @select-workspace="client.openWorkspace($event)"
        @add-workspace="showAddWorkspace = true"
        @add-workspace-path="handleAddWorkspace"
        @rename="(id, title) => client.renameSession(id, title)"
        @set-emoji="(id, emoji) => handleSessionUpdate(id, { emoji })"
        @toggle-pinned="(id, pinned) => handleSessionUpdate(id, { pinned })"
        @generate-title="handleGenerateSessionTitle"
        @archive="confirmArchiveSession($event)"
        @delete="confirmDeleteSession($event)"
        @restore="client.restoreSession($event)"
        @fork="(id) => client.forkSession(id)"
        @export="(id) => client.exportSession(id)"
        @rename-workspace="(id, name) => client.renameWorkspace(id, name)"
        @delete-workspace="confirmDeleteWorkspace($event)"
        @reorder-workspaces="client.reorderWorkspaces($event)"
        @set-workspace-sort-mode="client.setWorkspaceSortMode($event)"
        @load-more-sessions="(id) => void client.loadMoreSessions(id)"
        @load-all-sessions="void client.loadAllSessions()"
        @open-session-admin="openSessionAdmin"
        @expand-sidebar="expandSidebar"
        @open-settings="showSettings = true"
        @set-color-scheme="client.setColorScheme($event)"
        @set-locale="setLocale($event as LocaleCode)"
        @login="openLogin()"
        @logout="client.logout"
        @collapse="toggleSidebarCollapse"
      />
      <ResizeHandle
        v-show="!sidebarCollapsed"
        class="side-handle"
        :storage-key="SIDEBAR_WIDTH_KEY"
        :default-width="SIDEBAR_DEFAULT"
        :min="SIDEBAR_MIN"
        :max="sidebarMax"
        @update:width="sessionColWidth = $event"
        @update:dragging="sidebarDragging = $event"
      />
    </template>

    <!-- Mobile navigation: slim top bar (switcher + settings sheets). -->
    <MobileTopBar
      v-else
      :workspace="client.visibleWorkspace.value"
      :session-title="activeSessionTitle"
      :running="running"
      :branch="client.status.value.branch"
      :session-count="activeWorkspaceSessionCount"
      @open-switcher="showMobileSwitcher = true"
      @open-settings="showMobileSettings = true"
    />

    <!-- Main chat pane — swapped for the session-admin main view when open. -->
    <ConversationPane
      v-if="mainView === 'chat' || isMobile"
      ref="conversationPaneRef"
      :mobile="isMobile"
      :turns="client.turns.value"
      :session-id="client.activeSessionId.value"
      :side-chat-turns="client.sideChatTurns.value"
      :side-chat-running="client.sideChatRunning.value"
      :side-chat-sending="client.sideChatSending.value"
      :approvals="client.pendingApprovals.value"
      :changes="client.changes.value"
      :git-info="client.gitInfo.value"
      :tasks="client.tasks.value"
      :app-tasks="client.activeAppTasks.value"
      :plans="client.activePlans.value"
      :todos="client.todos.value"
      :goal="client.goal.value"
      :activation-badges="client.activationBadges.value"
      :status="client.status.value"
      :thinking="client.thinking.value"
      :plan-mode="client.planMode.value"
      :plan-armed="client.planArmed.value"
      :swarm-mode="client.swarmMode.value"
      :goal-mode="client.goalMode.value"
      :models="client.models.value"
      :starred-ids="client.starredModelIds.value"
      :skills="client.skills.value"
      :questions="client.questions.value"
      :pending-question-actions="client.pendingQuestionActions"
      :pending-approval-actions="client.pendingApprovalActions"
      :running="running"
      :turn-active="client.turnActive.value"
      :queued="client.queued.value"
      :retry-progress="client.retryBySession.value[client.activeSessionId.value]"
      :failure="client.failureBySession.value[client.activeSessionId.value]"
      :search-files="client.searchFiles"
      :upload-image="client.uploadImage"
      :working="client.working.value"
      :exchange-started-at="client.exchangeStartedAt.value ?? undefined"
      :starting="client.isStartingFirstPrompt.value"
      :fast-moon="client.fastMoon.value"
      :file-reload-key="client.activeSessionId.value"
      :session-loading="client.sessionLoading.value"
      :compaction="client.compaction.value"
      :has-more-messages="client.hasMoreMessages.value"
      :loading-more="client.loadingMoreMessages.value"
      :loading-more-error="client.loadMoreMessagesError.value"
      :load-older-messages="client.loadOlderMessages"
      :workspace-name="client.visibleWorkspace.value?.name"
      :workspace-root="client.visibleWorkspace.value?.root ?? client.status.value.cwd"
      :git-diff-stats="client.gitDiffStats.value"
      :workspaces="client.workspacesView.value"
      :active-workspace-id="client.activeWorkspaceId.value"
      :session-title="activeSessionTitle"
      :session-pinned="activeSessionPinned"
      :pr="client.activePullRequest.value"
      :conversation-toc="client.conversationToc.value"
      @open-changes="openDiffDetail()"
      @select-workspace="handleCreateSessionInWorkspace($event)"
      @add-workspace="showAddWorkspace = true"
      @open-pr="openPr"
      @submit="handleSubmit($event)"
      @steer="client.steerPrompt($event.text, $event.attachments)"
      @approval="(approvalId, response) => client.respondApproval(approvalId, response)"
      @cancel-task="client.cancelTask($event)"
      @detach-task="client.detachTask($event)"
      @side-chat-send="(text: string) => { closeSideChat(); client.sendSideChatPrompt(text); }"
      @answer="(questionId, response) => client.respondQuestion(questionId, response)"
      @dismiss="(questionId) => client.dismissQuestion(questionId)"
      @command="handleCommand"
      @interrupt="client.abortCurrentPrompt()"
      @unqueue="handleUnqueue"
      @edit-queued="handleEditQueued"
      @reorder-queue="handleReorderQueue"
      @steer-queued="client.steerQueued($event)"
      @send-queued="client.sendQueued($event)"
      @toggle-pin-session="(id, pinned) => handleSessionUpdate(id, { pinned })"
      @set-permission="client.setPermission($event)"
      @set-thinking="client.setThinking($event)"
      @toggle-plan="client.togglePlanMode()"
      @toggle-plan-armed="client.togglePlanArmed()"
      @toggle-swarm="client.toggleSwarmMode()"
      @toggle-goal="client.toggleGoalMode()"
      @create-goal="client.createGoal($event)"
      @control-goal="client.controlGoal($event)"
      @refresh-git-status="client.activeSessionId.value && client.loadGitStatus(client.activeSessionId.value)"
      @rename-session="(id, title) => client.renameSession(id, title)"
      @fork-session="(id) => client.forkSession(id)"
      @archive-session="confirmArchiveSession($event)"
      @export-session="(id) => client.exportSession(id)"
      @compact="client.compact()"
      @pick-model="openModelPicker()"
      @select-model="handleComposerSelectModel($event)"
      @open-file="requestFilePreview($event)"
      @open-media="openMediaPreview($event)"
      @open-compaction="panel.openCompaction($event.turnId)"
      @open-agent="panel.openAgent($event)"
      @open-tool-diff="openToolDiff($event)"
      @open-side-chat="openSideChatTab()"
      @edit-message="handleEditMessage"
      @resume-failure="handleResumeFailure"
    />
    <SessionAdminView
      v-else
      :workspaces="client.workspacesView.value"
      @open-session="openSessionFromAdmin"
      @close="mainView = 'chat'"
    />

    <!-- Sidebar toggle — floating only when the in-header control can't serve:
         on macOS desktop it's RESIDENT (always rendered beside the traffic
         lights, the sidebar slides underneath and only the glyph swaps, so it
         never moves or flashes); on Windows/web the collapse button lives
         inside the sidebar header, so this floating button only appears while
         COLLAPSED (to re-expand the sidebar). It must come AFTER
         ConversationPane in the DOM: Electron computes the window-drag region
         in tree order (drag rects union, no-drag rects subtract), so a no-drag
         element placed before the ChatHeader drag region would have its hole
         painted back over — making the button an inert drag area. -->
    <IconButton
      v-if="!isMobile && (isMacosDesktop || sidebarCollapsed)"
      class="sidebar-toggle-btn"
      size="sm"
      :label="sidebarCollapsed ? t('sidebar.expandSidebar') : t('sidebar.collapseSidebar')"
      @click="toggleSidebarCollapse"
    >
      <Icon :name="sidebarCollapsed ? 'left-panel-expand' : 'left-panel'" />
    </IconButton>

    <!-- Right-panel toggle — the panel's single desktop opening/closing control,
         pinned to the top-right corner so it stays in the same place whether the
         panel is open (over the tab strip's tail) or closed (over the chat
         header). The three in-pane controls upstream keeps in the DOM for the
         mobile shell are hidden on desktop by the rules in the global block. It
         sits after ConversationPane for the same Electron window-drag reason as
         the sidebar toggle. -->
    <IconButton
      v-if="!isMobile"
      class="right-panel-toggle"
      size="sm"
      :label="panel.visible.value ? t('panel.hide') : t('panel.openPanel')"
      :aria-expanded="panel.visible.value"
      @click="panel.visible.value ? panel.hide() : panel.show()"
    >
      <Icon :name="panel.visible.value ? 'panel-collapse-right' : 'right-panel-expand'" />
    </IconButton>

    <!-- Model Picker overlay -->
    <ModelPicker
      v-if="showModelPicker"
      :models="client.models.value"
      :current="client.status.value.modelId"
      :starred-ids="client.starredModelIds.value"
      :loading="modelsLoading"
      :unavailable="modelsUnavailable"
      @select="handleSelectModel($event)"
      @toggle-star="client.toggleStarModel($event)"
      @close="showModelPicker = false"
    />

    <!-- Settings page (modal) -->
    <SettingsDialog
      v-if="showSettings"
      :color-scheme="client.colorScheme.value"
      :accent="client.accent.value"
      :ui-font-size="client.uiFontSize.value"
      :managed-provider-status="client.managedProviderStatus.value"
      :account-model="client.defaultModel.value"
      :plan-usage="planUsage"
      :plan-usage-loading="planUsageLoading"
      :notify="client.notifyOnComplete.value"
      :notify-question="client.notifyOnQuestion.value"
      :notify-approval="client.notifyOnApproval.value"
      :notify-permission="client.notifyPermission.value"
      :sound="client.soundOnComplete.value"
      :conversation-toc="client.conversationToc.value"
      :liquid-glass="client.liquidGlass.value"
      :wide-mode="client.wideMode.value"
      :lab-sidebar-tabs="client.labSidebarTabs.value"
      :config="client.config.value"
      :models="client.models.value"
      :config-saving="configSaving"
      :server-version="client.serverVersion.value"
      :backend="client.backend.value"
      @set-color-scheme="client.setColorScheme($event)"
      @set-accent="client.setAccent($event)"
      @set-ui-font-size="client.setUiFontSize($event)"
      @set-notify="client.setNotifyOnComplete($event)"
      @set-notify-question="client.setNotifyOnQuestion($event)"
      @set-notify-approval="client.setNotifyOnApproval($event)"
      @set-sound="client.setSoundOnComplete($event)"
      @set-conversation-toc="client.setConversationToc($event)"
      @set-liquid-glass="client.setLiquidGlass($event)"
      @set-wide-mode="client.setWideMode($event)"
      @set-lab-sidebar-tabs="client.setLabSidebarTabs"
      @update-config="handleUpdateConfig($event)"
      @login="() => { showSettings = false; openLogin(); }"
      @logout="client.logout"
      @open-onboarding="() => { showSettings = false; openOnboarding(); }"
      @open-providers="() => { showSettings = false; openProviders(); }"
      @close="showSettings = false"
    />

    <!-- Provider Manager overlay -->
    <ProviderManager
      v-if="showProviders"
      :providers="client.providers.value"
      :loading="providersLoading"
      :unavailable="providersUnavailable"
      @add="handleAddProvider($event)"
      @refresh="handleRefreshProvider($event)"
      @delete="confirmDeleteProvider($event)"
      @open-login="() => { showProviders = false; openLogin(); }"
      @close="showProviders = false"
    />

    <!-- Status panel overlay (/status) — renders current client state, no daemon call -->
    <StatusPanel
      v-if="showStatusPanel"
      :status="client.status.value"
      :thinking="statusPanelThinking"
      :plan-mode="client.planMode.value"
      :swarm-mode="client.swarmMode.value"
      :cost-usd="client.sessionCost.value"
      @close="showStatusPanel = false"
    />

    <!-- Add Workspace overlay (daemon folder browser + paste-path fallback) -->
    <AddWorkspaceDialog
      v-if="showAddWorkspace"
      :browse-fs="client.browseFs"
      :get-fs-home="client.getFsHome"
      :default-path="client.visibleWorkspace.value?.root ?? client.status.value.cwd"
      :error="addWorkspaceError"
      @add="handleAddWorkspace($event)"
      @close="handleCloseAddWorkspace"
    />

    <!-- Global connecting splash on first load (until the daemon round-trips) -->
    <Transition name="gload-fade">
      <GlobalLoading v-if="!client.initialized.value" :issue="client.connectIssue.value" />
    </Transition>

    <!-- First-run onboarding overlay (language + welcome greeting). Held back
         until the first load settled so it can't cover the connecting splash
         (it teleports to <body> and would float above the retry error). -->
    <Onboarding
      v-if="client.initialized.value && showOnboarding && !showAuthGate"
      @complete="completeOnboarding"
      @skip="completeOnboarding"
    />

    <!-- Floating warnings / agent errors (e.g. a 403 from the model provider) -->
    <WarningToasts :warnings="client.warnings.value" @dismiss="client.dismissWarning" />

    <!-- Top-center export confirmation: "Exporting session…" while the ZIP is
         generated, "Session exported." once the download starts. -->
    <Transition name="export-toast">
      <div
        v-if="exportToastVisible"
        ref="exportToastEl"
        class="export-toast lg-glass lg-lens"
        role="status"
        aria-live="polite"
      >
        <Spinner v-if="!exportToastDone" size="sm" />
        <Icon v-else name="check" size="sm" />
        <span class="export-toast-text">
          {{ exportToastDone ? t('commands.export.done') : t('commands.export.started') }}
        </span>
      </div>
    </Transition>

    <!-- KAP/daemon debug panel (opt-in, ?debug=1) -->
    <DebugPanel v-if="debugEnabled" />

    <!-- Global modal-confirmation host (driven by useConfirmDialog) -->
    <ConfirmDialogHost />

    <!-- Browser-reference dialog host (driven by useBrowserReferences) -->
    <BrowserReferenceDialogHost />

    <!-- Mobile switcher bottom-sheet: workspace groups + sessions (mirrors the
         desktop sidebar) -->
    <MobileSwitcherSheet
      v-if="isMobile"
      v-model="showMobileSwitcher"
      :groups="client.workspaceGroups.value"
      :active-workspace-id="client.activeWorkspaceId.value"
      :active-id="client.activeSessionId.value"
      :attention-by-session="client.attentionBySession.value"
      :attention-by-workspace="client.attentionByWorkspace.value"
      @select="client.selectSession($event)"
      @create="handleCreateSession"
      @create-in-workspace="handleCreateSessionInWorkspace($event)"
      @add-workspace="showAddWorkspace = true"
      @rename="(id, title) => client.renameSession(id, title)"
      @set-emoji="(id, emoji) => handleSessionUpdate(id, { emoji })"
      @toggle-pinned="(id, pinned) => handleSessionUpdate(id, { pinned })"
      @archive="confirmArchiveSession($event)"
      @delete="confirmDeleteSession($event)"
      @delete-workspace="confirmDeleteWorkspace($event)"
      @load-more="(id) => void client.loadMoreSessions(id)"
    />

    <!-- Mobile settings bottom-sheet: session controls + app prefs + auth -->
    <MobileSettingsSheet
      v-if="isMobile"
      v-model="showMobileSettings"
      :status="client.status.value"
      :thinking="client.thinking.value"
      :models="client.models.value"
      :plan-mode="client.planMode.value"
      :goal-mode="client.goalMode.value"
      :swarm-mode="client.swarmMode.value"
      :color-scheme="client.colorScheme.value"
      :ui-font-size="client.uiFontSize.value"
      :auth-ready="client.authReady.value"
      :account-model="client.defaultModel.value"
      :plan-usage="planUsage"
      :plan-usage-loading="planUsageLoading"
      :conversation-toc="client.conversationToc.value"
      :server-version="client.serverVersion.value"
      :config="client.config.value"
      :config-saving="configSaving"
      :backend="client.backend.value"
      @pick-model="openModelPicker()"
      @set-thinking="client.setThinking($event)"
      @toggle-plan="client.togglePlanMode()"
      @toggle-goal="client.toggleGoalMode()"
      @toggle-swarm="client.toggleSwarmMode()"
      @set-permission="client.setPermission($event)"
      @set-color-scheme="client.setColorScheme($event)"
      @set-ui-font-size="client.setUiFontSize($event)"
      @set-conversation-toc="client.setConversationToc($event)"
      @update-config="handleUpdateConfig($event)"
      @login="() => { showMobileSettings = false; openLogin(); }"
      @logout="client.logout"
    />
    </div>
    <MediaPreview
      v-if="mediaPreview"
      :media="mediaPreview"
      :src="mediaPreviewSrc"
      :loading="mediaPreviewLoading"
      @close="closeMediaPreview"
    />
    <!-- Login Dialog overlay. It is outside `.app` so `/login` can open it too. -->
    <LoginDialog
      v-if="showLogin"
      :on-start-o-auth-login="handleStartOAuthLogin"
      :on-poll-o-auth-login="handlePollOAuthLogin"
      :on-cancel-o-auth-login="handleCancelOAuthLogin"
      @success="handleLoginSuccess"
      @close="showLogin = false"
    />
  </div>
</template>

<style scoped>
/* Global connecting splash fade-out (only the leave matters; it mounts instantly). */
.gload-fade-leave-active { transition: opacity 0.28s ease; }
.gload-fade-leave-to { opacity: 0; }

.app-shell {
  /* Pinned to the visual viewport (see setAppHeight): --app-top tracks iOS's
     keyboard pan and --app-height shrinks with the keyboard, so the shell
     always covers exactly the visible area. Fixed positioning keeps it out of
     the document flow that iOS pans. */
  position: fixed;
  top: var(--app-top, 0px);
  left: 0;
  right: 0;
  height: 100vh;
  height: 100dvh;
  height: var(--app-height, 100dvh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}
.auth-page {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: var(--bg);
  color: var(--color-text);
  box-sizing: border-box;
}
.auth-page-inner {
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 18px;
}
.auth-page-logo {
  width: 64px;
  height: 44px;
  flex: none;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  transition: transform 0.18s ease;
}
.auth-page-logo:hover {
  transform: scale(1.06);
}
.auth-page-copy {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.auth-page-copy h1 {
  margin: 0;
  font-family: var(--sans);
  font-size: 30px;
  line-height: 1.15;
  font-weight: 500;
  letter-spacing: 0;
  color: var(--color-text);
}
.auth-page-copy p {
  margin: 0;
  font-family: var(--sans);
  font-size: var(--ui-font-size-lg);
  line-height: 1.55;
  color: var(--dim);
}
.app {
  flex: 1;
  min-height: 0;
  position: relative;
  display: grid;
  /* sidebar | 0-width handle | conversation. The panel is a column INSIDE the
     conversation (upstream's shape), so it needs no track of its own.
     Both side tracks are PERMANENT (auto = follows the aside's width, 0 when
     closed/collapsed) — collapsing animates the aside's width, so the
     conversation column is squeezed over smoothly instead of snapping to a new
     template. Every column is pinned explicitly so a display:none handle can't
     shift auto-placement. */
  grid-template-columns: auto 0 minmax(0, 1fr);
  background: var(--bg);
  color: var(--color-text);
  overflow: hidden;
  box-sizing: border-box;
}
/* Grid children must be allowed to shrink below content height so that only
   the inner scroll containers (.panes / .sessions) scroll — otherwise the
   whole .app overflows and the page (incl. sidebar) scrolls together. */
.app > * {
  min-height: 0;
  min-width: 0;
}

/* Pin every desktop grid child to its track so auto-placement can never
   reshuffle columns when a handle is display:none (v-show/v-if). */
.app > .side { grid-column: 1; }
.side-handle { grid-column: 2; }
.app:not(.mobile) > .con { grid-column: 3; }

/* Sidebar toggle — floating button pinned to the top-left corner. On macOS
   desktop it is resident (rendered in both states beside the traffic lights);
   on Windows/web it only appears while the sidebar is collapsed (the collapse
   button lives inside the sidebar header). While collapsed the conversation
   header pads left so its content clears the button (global block below). */
.sidebar-toggle-btn {
  position: absolute;
  /* Vertically centered in the 48px conversation header. */
  top: 11px;
  left: 16px;
  z-index: var(--z-sticky);
  /* Fade in on appearance (Windows/web: only rendered while collapsed, so
     this plays as the sidebar finishes sliding away). macOS disables it. */
  animation: sidebar-toggle-btn-in 0.18s var(--ease-out) 0.12s backwards;
  /* Floats over the macOS-desktop window-drag header; keep it clickable. */
  -webkit-app-region: no-drag;
}
/* macOS desktop (hidden title bar): resident beside the floating traffic
   lights (green light's right edge ≈ 68px; 72 keeps a gap that matches the
   lights' own 8px rhythm); no entrance animation since it never appears. */
.app.macos-desktop .sidebar-toggle-btn {
  left: 72px;
  animation: none;
}
@keyframes sidebar-toggle-btn-in {
  from { opacity: 0; }
}

/* Mobile single-column shell: slim top bar (auto) over the full-width
   conversation pane (1fr). No rail, no session column, no resize handle. */
.app.mobile {
  grid-template-columns: 1fr;
  grid-template-rows: auto 1fr;
}

@media (max-width: 640px) {
  .auth-page {
    align-items: flex-start;
    padding:
      max(48px, var(--safe-top))
      max(20px, var(--safe-right))
      max(24px, var(--safe-bottom))
      max(20px, var(--safe-left));
  }
  .auth-page-copy h1 {
    font-size: 26px;
  }
  .auth-page-btn {
    width: 100%;
  }
}

/* Top-center export toast (success / in-flight). Fixed so it floats above the
   whole app; lg-glass treatment keeps it on the design-system float language. */
.export-toast {
  position: fixed;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-toast);
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-full);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text);
  box-shadow: var(--shadow-md);
  pointer-events: none;
}
.export-toast-text { white-space: nowrap; }
.export-toast-enter-active,
.export-toast-leave-active {
  transition: opacity var(--duration-base) var(--ease-out),
    transform var(--duration-base) var(--ease-out);
}
.export-toast-enter-from,
.export-toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-8px);
}
</style>

<style>
:root {
  /* Right-side panel headers (ThinkingPanel / FilePreview / DiffView / SideChatPanel)
     share the same 48px height as the conversation header so the hairline reads as
     one continuous line across the layout. */
  --panel-head-h: 48px;
}

/* Sidebar collapsed (desktop): the conversation header pads left so its
   content clears the floating sidebar toggle (.sidebar-toggle-btn) — and the
   macOS traffic lights on desktop builds. Animated in step with the sidebar
   width transition. Cross-component rule (ChatHeader renders the header), so
   it lives in this global block. */
.app:not(.mobile) .chat-header {
  transition: padding-left 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}
.app.sidebar-collapsed .chat-header {
  padding-left: 52px;
}
.app.sidebar-collapsed.macos-desktop .chat-header {
  padding-left: 108px;
}

/* Right-panel toggle (desktop): floats over the top-right corner — the panel's
   tab-strip tail while the panel is open, the chat header while it is closed.
   The panel's own close button, the chat header's opener and the empty-session
   opener stay in the DOM for the mobile shell and are hidden here, so exactly
   one control is visible at a time. Cross-component rules (ChatHeader,
   ConversationPane and PanelTabs render those elements), so they live in this
   global block. */
.right-panel-toggle {
  position: absolute;
  top: calc((var(--panel-head-h) - var(--icon-button-sm)) / 2);
  right: var(--space-4);
  z-index: var(--z-sticky);
  /* Floats over the macOS-desktop window-drag header; keep it clickable. */
  -webkit-app-region: no-drag;
}
.app:not(.mobile) .panel-tab-bar,
.app:not(.mobile):not(.right-panel-open) .chat-header {
  padding-right: calc(var(--space-4) + var(--icon-button-sm) + var(--space-2));
}
.app:not(.mobile) .chat-header .ch-panel,
.app:not(.mobile) .empty-panel-btn,
.app:not(.mobile) .ptb-hide {
  display: none;
}
</style>
