<!-- apps/kimi-web/src/components/Sidebar.vue -->
<!-- Unified sidebar: session groups with collapsible workspace headers.
     The old workspace rail and workspace tabs have been removed;
     workspace switching, folding and renaming all live in the group header. -->
<script lang="ts">
/**
 * Pure logic extracted from the sidebar so it stays unit-testable: the OS-aware
 * shortcut match and the Apple-platform detection.
 */

export interface ShortcutKeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * Cmd/Ctrl+K search shortcut. OS-aware: Apple platforms require meta (Cmd),
 * everywhere else ctrl — so Ctrl+K on macOS stops being swallowed by the
 * composer's delete-to-end-of-line. Alt/Shift modifiers reject the match.
 */
export function matchSearchShortcut(e: ShortcutKeyLike, isApplePlatform: boolean): boolean {
  if (e.key.toLowerCase() !== 'k') return false;
  if (e.altKey || e.shiftKey) return false;
  return isApplePlatform ? e.metaKey : e.ctrlKey;
}

/**
 * Cmd/Ctrl+Shift+O new-session shortcut: the trailing-edge hint on the
 * "New Session" row. OS-aware like the search shortcut (Shift is required, so
 * it can never collide with plain Ctrl+O); Alt rejects the match.
 */
export function matchNewSessionShortcut(e: ShortcutKeyLike, isApplePlatform: boolean): boolean {
  if (e.key.toLowerCase() !== 'o') return false;
  if (e.altKey || !e.shiftKey) return false;
  return isApplePlatform ? e.metaKey : e.ctrlKey;
}

export function isAppleShortcutPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/Mac|iPod|iPhone|iPad/.test(navigator.platform)) return true;

  const userAgentData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  return userAgentData?.platform === 'macOS' || userAgentData?.platform === 'iOS';
}
</script>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { serverEndpointLabel } from '../api/config';
import { getKimiWebApi } from '../api';
import type { AppSession } from '../api/types';
import {
  fetchDevBackendState,
  initialDevBackendState,
  shortOrigin,
  switchDevBackend,
  type BackendName,
  type DevBackendState,
} from '../api/devBackend';
import { copyTextToClipboard } from '../lib/clipboard';
import {
  loadCollapsedWorkspaces,
  saveCollapsedWorkspaces,
  STORAGE_KEYS,
} from '../lib/storage';
import { moveInOrder, type DropPosition, type WorkspaceSortMode } from '../lib/workspaceOrder';
import { availableLocales, type LocaleCode } from '../i18n';
import type { ColorScheme } from '../composables/client/useAppearance';
import { splitByArchived } from '../composables/client/useWorkspaceState';
import type { Session, WorkspaceGroup as WorkspaceGroupType, WorkspaceView } from '../types';
import SearchSessionsDialog from './dialogs/SearchSessionsDialog.vue';
import WorkspaceGroup from './WorkspaceGroup.vue';
import SessionRow from './SessionRow.vue';
import ResizeHandle from './ResizeHandle.vue';
import { isMacosDesktop } from '../lib/desktopFlag';
import { useSidebarLayout, type SidebarViewMode } from '../composables/useSidebarLayout';
import { useGlassRefraction } from '../composables/useGlassRefraction';
import IconButton from './ui/IconButton.vue';
import Tooltip from './ui/Tooltip.vue';
import Icon from './ui/Icon.vue';
import Kbd from './ui/Kbd.vue';
import Menu from './ui/Menu.vue';
import MenuItem from './ui/MenuItem.vue';
import Pill from './ui/Pill.vue';
import Tabs from './ui/Tabs.vue';
import Spinner from './ui/Spinner.vue';

const { t } = useI18n();

// Dev-only affordance: when the page is served by the Vite dev server, the
// logo turns yellow and a backend pill next to the brand shows the engine
// generation reported by /meta (v1 = older server binary, v2 = kap-server)
// plus the endpoint the dev proxy forwards to — click it to switch presets
// without restarting Vite. In production this is all inert.
const isDev = import.meta.env.DEV;
const devBackend = ref<DevBackendState | null>(isDev ? initialDevBackendState() : null);
if (isDev) {
  onMounted(async () => {
    const live = await fetchDevBackendState();
    if (live) devBackend.value = live;
  });
}
// host:port of the server the dev proxy currently forwards to (fallback: the
// build-time label when the dev endpoints are unavailable).
const endpoint = computed(() => {
  if (!isDev) return '';
  const current = devBackend.value?.current;
  return current ? shortOrigin(current) : serverEndpointLabel();
});
const backendNames: BackendName[] = ['default', 'multi'];
function presetUrl(name: BackendName): string {
  const url = devBackend.value?.presets[name] ?? '';
  return url ? shortOrigin(url) : '';
}
function isCurrentBackend(name: BackendName): boolean {
  const state = devBackend.value;
  return state !== null && state.current === state.presets[name];
}

const props = withDefaults(
  defineProps<{
    activeWorkspace: WorkspaceView | null;
    activeWorkspaceId: string | null;
    sessions: Session[];
    groups: WorkspaceGroupType[];
    activeId: string;
    /** Current workspace sort mode — drives the section-header sort button. */
    workspaceSortMode: WorkspaceSortMode;
    /** Backend engine generation from /meta — dev-only badge next to the brand. */
    backend?: 'v1' | 'v2';
    attentionBySession?: Record<string, number>;
    /** Per-session pending counts split by kind, for the coloured tags. */
    pendingBySession?: Record<string, { approvals: number; questions: number }>;
    unreadBySession?: Record<string, boolean>;
    /** Width (px) of the session column, driven by the App resize handle. */
    colWidth?: number;
    /** True when the sidebar is collapsed: the container animates to width 0
     *  (content keeps `colWidth` and is clipped), then hides itself. */
    collapsed?: boolean;
    /** True while the resize handle is dragged — disables the width transition
     *  so the sidebar follows the pointer 1:1. */
    dragging?: boolean;
    /** Experimental Lab `labSidebarTabs` flag — renders the Open / Done /
     *  Workspaces tab strip above the session list. */
    labSidebarTabs?: boolean;
    /** A managed Kimi Code account is connected — the footer then names the
     *  account instead of reading "Not signed in". */
    signedIn?: boolean;
    /** Current appearance, shown as the value on the footer menu's first row. */
    colorScheme?: ColorScheme;
    /** Current UI language, shown as the value on the footer menu's second row. */
    locale?: LocaleCode;
  }>(),
  {
    activeWorkspace: null,
    activeWorkspaceId: null,
    backend: 'v1',
    attentionBySession: () => ({}),
    pendingBySession: () => ({}),
    unreadBySession: () => ({}),
    colWidth: 220,
    collapsed: false,
    dragging: false,
    labSidebarTabs: false,
    signedIn: false,
    colorScheme: 'system',
    locale: 'en',
  },
);

const emit = defineEmits<{
  select: [sessionId: string];
  create: [];
  createInWorkspace: [workspaceId: string];
  selectWorkspace: [workspaceId: string];
  addWorkspace: [];
  rename: [id: string, title: string];
  archive: [id: string];
  delete: [id: string];
  fork: [id: string];
  export: [id: string];
  setEmoji: [id: string, emoji: string | undefined];
  togglePinned: [id: string, pinned: boolean];
  /** Title regeneration request — passed through from a row's rename field;
   *  the App handler reports back. */
  generateTitle: [id: string, done: (title: string | null) => void];
  renameWorkspace: [id: string, name: string];
  deleteWorkspace: [id: string];
  reorderWorkspaces: [ids: string[]];
  setWorkspaceSortMode: [mode: WorkspaceSortMode];
  loadMoreSessions: [workspaceId: string];
  loadAllSessions: [];
  /** Restore an archived session from the Done tab — the row's kebab shows
   *  the reopen action there (SessionRow labels it "Mark as open" when its
   *  `archived` prop is set; it always emits `archive`, routed here). */
  restore: [id: string];
  /** Lab: open the cross-workspace session admin page (App main view). */
  openSessionAdmin: [];
  /** Un-collapse the (visual) sidebar — used when a search result picks a
   *  workspace while the column is collapsed. */
  expandSidebar: [];
  openSettings: [];
  collapse: [];
  /** Footer account menu: appearance + language pickers, and the sign-in row. */
  setColorScheme: [colorScheme: ColorScheme];
  setLocale: [locale: LocaleCode];
  login: [];
  logout: [];
  /** A folder was dropped on the sidebar. The path comes from the desktop
   *  shell's bridge when one is present; see onFolderDrop. */
  addWorkspacePath: [path: string];
}>();

// --- Folder drop ----------------------------------------------------------
// Upstream shows a "Drop to add workspace" card while an OS folder is dragged
// over the column. Its drop action reads the folder's absolute path through the
// desktop shell (`window.kimiDesktop.getPathForFile`), which a plain browser does
// not expose — a dropped directory only carries a tree-relative
// `webkitRelativePath`. So the card is shown on a folder drag in both apps, and
// the drop registers a workspace only where that bridge exists; upstream's own
// guard behaves the same way in a browser.
const folderDragActive = ref(false);
let folderDragDepth = 0;

/** A dragged folder arrives as a file item with no MIME type. */
function isFolderDrag(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.items ?? []).some(
    (item) => item.kind === 'file' && item.type === '',
  );
}

function onFolderDragEnter(event: DragEvent): void {
  if (!isFolderDrag(event)) return;
  event.preventDefault();
  folderDragDepth += 1;
  folderDragActive.value = true;
}

function onFolderDragOver(event: DragEvent): void {
  if (!folderDragActive.value) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
}

function onFolderDragLeave(): void {
  folderDragDepth = Math.max(0, folderDragDepth - 1);
  if (folderDragDepth === 0) folderDragActive.value = false;
}

function onFolderDrop(event: DragEvent): void {
  if (!folderDragActive.value) return;
  event.preventDefault();
  folderDragDepth = 0;
  folderDragActive.value = false;
  const bridge = (window as { kimiDesktop?: { getPathForFile?: (file: File) => string } })
    .kimiDesktop;
  const getPath = bridge?.getPathForFile;
  if (typeof getPath !== 'function') return;
  const path = Array.from(event.dataTransfer?.files ?? [])
    .map((file) => {
      try {
        return getPath(file);
      } catch {
        return null;
      }
    })
    .find((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0);
  if (path) emit('addWorkspacePath', path);
}

const { sidebarViewMode, loadSidebarViewMode, setSidebarViewMode } = useSidebarLayout();

/** Footer account row: the connected account's name, or the "not signed in"
 *  state — the same pair the settings surface shows. */
const accountName = computed(() => (props.signedIn ? t('sidebar.defaultUserName') : t('sidebar.notSignedIn')));

// Footer account menu (upstream's user menu). Anchored to the trigger, opening
// upward; the appearance / language rows open a second panel beside it.
type UserSubmenu = 'appearance' | 'language';
const userMenuOpen = ref(false);
const userMenuRef = ref<InstanceType<typeof Menu> | null>(null);
const userTriggerRef = ref<HTMLElement | null>(null);
const userMenuStyle = ref<Record<string, string>>({});
const userSubmenu = ref<UserSubmenu | null>(null);
const userSubmenuRef = ref<InstanceType<typeof Menu> | null>(null);
const userSubmenuStyle = ref<Record<string, string>>({});
let userSubmenuAnchor: HTMLElement | null = null;

const colorSchemeLabel = computed(
  () =>
    ({
      light: t('theme.light'),
      dark: t('theme.dark'),
      system: t('theme.system'),
    })[props.colorScheme],
);
const localeLabel = computed(
  () => availableLocales.find((l) => l.code === props.locale)?.label ?? props.locale,
);
const submenuOptions = computed<{ value: string; label: string; active: boolean }[]>(() =>
  userSubmenu.value === 'appearance'
    ? [
        { value: 'light', label: t('theme.light'), active: props.colorScheme === 'light' },
        { value: 'dark', label: t('theme.dark'), active: props.colorScheme === 'dark' },
        { value: 'system', label: t('theme.system'), active: props.colorScheme === 'system' },
      ]
    : availableLocales.map((l) => ({ value: l.code, label: l.label, active: props.locale === l.code })),
);

function onUserMenuDocClick(e: MouseEvent): void {
  const target = e.target as Node;
  if (userMenuRef.value?.el?.contains(target) || userTriggerRef.value?.contains(target)) return;
  if (userSubmenuRef.value?.el?.contains(target)) return;
  closeUserMenu();
}

function onUserMenuKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeUserMenu();
}

function positionUserMenu(): void {
  const trigger = userTriggerRef.value;
  const menu = userMenuRef.value?.el;
  if (!trigger || !menu) return;
  const r = trigger.getBoundingClientRect();
  const gap = 4;
  const margin = 8;
  const menuH = menu.offsetHeight;
  const menuW = menu.offsetWidth;
  const left = Math.min(Math.max(r.left, margin), Math.max(margin, window.innerWidth - margin - menuW));
  const above = r.top - gap - menuH;
  const top = above >= margin ? above : Math.min(r.bottom + gap, window.innerHeight - margin - menuH);
  userMenuStyle.value = {
    left: `${Math.round(left)}px`,
    width: `${Math.round(r.width)}px`,
    top: `${Math.round(top)}px`,
  };
}

function positionUserSubmenu(): void {
  const anchor = userSubmenuAnchor;
  const menu = userSubmenuRef.value?.el;
  if (!anchor || !menu) return;
  const r = anchor.getBoundingClientRect();
  const gap = 4;
  const margin = 8;
  const menuW = menu.offsetWidth;
  const menuH = menu.offsetHeight;
  const left =
    r.right + gap + menuW <= window.innerWidth - margin
      ? r.right + gap
      : Math.max(margin, r.left - gap - menuW);
  const top = Math.min(Math.max(r.top, margin), Math.max(margin, window.innerHeight - margin - menuH));
  userSubmenuStyle.value = { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` };
}

async function toggleUserMenu(): Promise<void> {
  if (userMenuOpen.value) {
    closeUserMenu();
    return;
  }
  userMenuOpen.value = true;
  setTimeout(() => {
    document.addEventListener('mousedown', onUserMenuDocClick);
    document.addEventListener('keydown', onUserMenuKeydown, true);
  }, 0);
  window.addEventListener('resize', closeUserMenu);
  await nextTick();
  positionUserMenu();
}

async function openUserSubmenu(which: UserSubmenu, event: MouseEvent): Promise<void> {
  const row = event.currentTarget as HTMLElement | null;
  if (userSubmenu.value === which) {
    userSubmenu.value = null;
    return;
  }
  userSubmenuAnchor = row;
  userSubmenu.value = which;
  await nextTick();
  positionUserSubmenu();
}

function chooseUserOption(value: string): void {
  if (userSubmenu.value === 'appearance') emit('setColorScheme', value as ColorScheme);
  else emit('setLocale', value as LocaleCode);
  closeUserMenu();
}

function openSettingsFromUserMenu(): void {
  closeUserMenu();
  emit('openSettings');
}

function signInFromUserMenu(): void {
  closeUserMenu();
  emit('login');
}

function signOutFromUserMenu(): void {
  closeUserMenu();
  emit('logout');
}

function closeUserMenu(): void {
  userMenuOpen.value = false;
  userSubmenu.value = null;
  userSubmenuAnchor = null;
  document.removeEventListener('mousedown', onUserMenuDocClick);
  document.removeEventListener('keydown', onUserMenuKeydown, true);
  window.removeEventListener('resize', closeUserMenu);
}

const colRef = ref<HTMLElement | null>(null);
useGlassRefraction(colRef, { transient: false });
const pinnedSessions = computed(() =>
  props.groups
    .flatMap((group) => group.sessions)
    .filter((session) => session.pinned)
    .toSorted((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()),
);
const unpinnedGroups = computed(() =>
  props.groups.map((group) => ({ ...group, sessions: group.sessions.filter((session) => !session.pinned) })),
);
/** Pinned rows per workspace: a group whose sessions are all pinned has no rows
 *  left to render, so it shows upstream's "{count} conversations pinned"
 *  summary instead of the plain empty state. */
const pinnedCountByWorkspace = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {};
  for (const session of pinnedSessions.value) {
    const key = session.workspaceId ?? '';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
});
const flatSessions = computed(() => props.sessions.filter((session) => !session.pinned));

// ---------------------------------------------------------------------------
// Pinned section: resizable height (the divider below the rows, persisted) so
// both the pinned area and the session list share the space; the pinned rows
// scroll inside their own area with top/bottom edge fades when overflowed.
// ---------------------------------------------------------------------------
const PINNED_DEFAULT_HEIGHT = 180;
const PINNED_MIN_HEIGHT = 72;
const PINNED_MAX_HEIGHT = 380;
/** Chrome above the pinned section (brand + New session + search + section head
 *  + footer); the cap keeps at least this much room for the session list. */
const PINNED_RESERVE = 300;
const pinnedHeight = ref(PINNED_DEFAULT_HEIGHT);
const pinnedMax = ref(
  Math.max(PINNED_MIN_HEIGHT, (typeof window === 'undefined' ? 800 : window.innerHeight) - PINNED_RESERVE),
);
function updatePinnedMax(): void {
  pinnedMax.value = Math.max(PINNED_MIN_HEIGHT, window.innerHeight - PINNED_RESERVE);
}
/** True once the pinned rows scrolled down from the top — draws the top fade. */
const pinnedScrolled = ref(false);
/** True while the pinned rows sit at their bottom edge — draws no bottom fade. */
const pinnedAtBottom = ref(true);
function onPinnedScroll(e: Event): void {
  const el = e.target as HTMLElement;
  pinnedScrolled.value = el.scrollTop > 0;
  pinnedAtBottom.value = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
}

function onSetEmoji(id: string, emoji: string | undefined): void {
  emit('setEmoji', id, emoji);
}
function onTogglePinned(id: string, pinned: boolean): void {
  emit('togglePinned', id, pinned);
}

// ---------------------------------------------------------------------------
// Session search dialog (Spotlight-style; filters title + last prompt)
// ---------------------------------------------------------------------------
const showSearch = ref(false);
const sessionSearchKeys = isAppleShortcutPlatform() ? ['⌘', 'K'] : ['Ctrl', 'K'];
// Hints only: like the search row's keycaps they drop out of the narrow-sidebar
// container query below (see the @container rule on .btn-new-chat .ui-kbd).
const newSessionKeys = isAppleShortcutPlatform() ? ['⌘', '⇧', 'O'] : ['Ctrl', 'Shift', 'O'];

function openSearch(): void {
  // Sessions are loaded per-workspace (first page only); lazily drain the rest
  // so the dialog's client-side filter covers everything.
  emit('loadAllSessions');
  showSearch.value = true;
}

function onSidebarKeydown(e: KeyboardEvent): void {
  // OS-aware: Cmd+Shift+O creates a session, Cmd+K opens search. Both shortcuts
  // are advertised as keycaps on their rows, so the handlers and the hints
  // cannot drift apart.
  const isApple = isAppleShortcutPlatform();
  if (matchNewSessionShortcut(e, isApple)) {
    e.preventDefault();
    emit('create');
    return;
  }
  // Cmd+K on Apple platforms, Ctrl+K elsewhere (Ctrl+K on macOS must NOT fire —
  // the composer uses it for delete-to-end-of-line). Alt/Shift held reject the
  // match.
  if (!matchSearchShortcut(e, isApple)) return;
  e.preventDefault();
  openSearch();
}

onMounted(() => {
  loadSidebarViewMode();
  window.addEventListener('keydown', onSidebarKeydown);
  updatePinnedMax();
  window.addEventListener('resize', updatePinnedMax);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onSidebarKeydown);
  window.removeEventListener('resize', updatePinnedMax);
});

// Scroll-linked header seam: the .sidebar-actions bottom border/shadow only
// appears once the session list has actually scrolled, so an unscrolled list
// shows no abrupt boundary.
const sessionsScrolled = ref(false);
const sessionsRef = ref<HTMLElement | null>(null);
function onSessionsScroll(e: Event): void {
  sessionsScrolled.value = (e.target as HTMLElement).scrollTop > 0;
}

/** Picked a workspace from the search dialog: open it, expand the (possibly
 *  collapsed) sidebar, then scroll the workspace's group/rows into view. */
function onSelectWorkspaceFromSearch(workspaceId: string): void {
  showSearch.value = false;
  emit('selectWorkspace', workspaceId);
  if (props.collapsed) emit('expandSidebar');
  void nextTick(() => {
    // data-wsid lands on the group wrappers (grouped mode) and session rows
    // (flat mode); pick the first match and reveal it.
    const root = sessionsRef.value;
    if (!root) return;
    const safeId = workspaceId.replace(/"/g, '');
    const el = root.querySelector<HTMLElement>(`[data-wsid="${safeId}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  });
}

/** Workspaces the search dialog can jump to (registered groups only — derived
 *  ones without a group entry never appear as standalone hits). */
const searchWorkspaces = computed<WorkspaceView[]>(() =>
  props.groups.map((g) => g.workspace),
);

// ---------------------------------------------------------------------------
// Experimental Lab: multi-tab sidebar (Open / Done / Workspaces)
// ---------------------------------------------------------------------------
type SidebarTab = 'open' | 'done' | 'workspaces';
const sidebarTab = ref<SidebarTab>('open');
const tabOptions = computed(() => [
  { value: 'open', label: t('sidebar.tabOpen') },
  { value: 'done', label: t('sidebar.tabDone') },
  { value: 'workspaces', label: t('sidebar.tabWorkspaces') },
]);

/** Page size for the Done (archived) list — a small page keeps the first
 *  activation fast; "load more" drains the rest. */
const DONE_PAGE_SIZE = 50;
const doneSessions = ref<Session[]>([]);
const doneSessionsLoading = ref(false);
const doneSessionsHasMore = ref(false);
let doneCursor: string | undefined;
let doneFetchToken = 0;

/** Relative time for Done rows — mirrors the open list's `time` display. */
function formatDoneTime(iso: string): string {
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffH = diffMs / 3_600_000;
    if (diffMs < 60_000) return t('sessions.justNow');
    if (diffH < 1) return `${Math.round(diffMs / 60_000)}m`;
    if (diffH < 24) return `${Math.round(diffH)}h`;
    const diffD = diffMs / 86_400_000;
    if (diffD < 7) return `${Math.round(diffD)}d`;
    if (diffD < 30) return `${Math.round(diffD / 7)}w`;
    if (diffD < 365) return `${Math.round(diffD / 30)}mo`;
    return `${Math.round(diffD / 365)}y`;
  } catch {
    return iso;
  }
}

/** cwd → workspace lookup from the registered groups, so a done session's
 *  workspace id/name can be resolved for its row + group header. */
const workspaceByRoot = computed<Map<string, WorkspaceGroupType['workspace']>>(() => {
  const map = new Map<string, WorkspaceGroupType['workspace']>();
  for (const g of props.groups) map.set(g.workspace.root, g.workspace);
  return map;
});

function toDoneSessionView(s: AppSession): Session {
  const ws = workspaceByRoot.value.get(s.cwd);
  return {
    id: s.id,
    title: s.title,
    time: formatDoneTime(s.updatedAt),
    updatedAt: s.updatedAt,
    busy: false,
    lastPrompt: s.lastPrompt,
    workspaceId: ws?.id ?? s.cwd,
    workspaceName: ws?.name ?? s.cwd,
    emoji: s.emoji,
    pinned: s.pinned,
  };
}

/** (Re)load the Done list. `reset` clears + refetches from the newest page —
 *  the Done tab calls it on every activation so its rows reflect archives or
 *  restores done elsewhere (admin page, another tab...). Without `reset` it
 *  appends the next page (the "load more" control). Only archived sessions are
 *  added — a stray open row is dropped (defensive invariant, mirrors the
 *  Settings archived panel). */
async function fetchDoneSessions(reset: boolean): Promise<void> {
  if (doneSessionsLoading.value) return;
  if (reset) {
    doneSessions.value = [];
    doneCursor = undefined;
    doneSessionsHasMore.value = false;
  }
  doneSessionsLoading.value = true;
  const token = ++doneFetchToken;
  try {
    const page = await getKimiWebApi().listSessions({
      archivedOnly: true,
      pageSize: DONE_PAGE_SIZE,
      beforeId: doneCursor,
    });
    if (token !== doneFetchToken) return; // superseded by a newer fetch
    const existing = new Set(doneSessions.value.map((s) => s.id));
    const fresh = splitByArchived(page.items).done
      .filter((s) => !existing.has(s.id))
      .map(toDoneSessionView);
    doneSessions.value = [...doneSessions.value, ...fresh];
    const last = page.items.at(-1);
    if (last !== undefined) doneCursor = last.id;
    doneSessionsHasMore.value = page.hasMore;
  } catch (err) {
    console.warn('[kimi-web] done-sessions load failed', err);
  } finally {
    if (token === doneFetchToken) doneSessionsLoading.value = false;
  }
}

watch(sidebarTab, (tab) => {
  // Every activation refetches so the tab always reflects current archive state.
  if (tab === 'done') void fetchDoneSessions(true);
});

/** Done rows grouped by workspace (flat/grouped toggle in the Done tab). */
const doneGroups = computed<{ workspaceId: string; name: string; items: Session[] }[]>(() => {
  const byKey = new Map<string, { workspaceId: string; name: string; items: Session[] }>();
  for (const s of doneSessions.value) {
    const key = s.workspaceId ?? s.workspaceName ?? '';
    let group = byKey.get(key);
    if (group === undefined) {
      group = { workspaceId: key, name: s.workspaceName ?? key, items: [] };
      byKey.set(key, group);
    }
    group.items.push(s);
  }
  return Array.from(byKey.values());
});

// ---------------------------------------------------------------------------
// Collapse groups
// ---------------------------------------------------------------------------
const collapsedIds = ref<Set<string>>(new Set(loadCollapsedWorkspaces()));

function isCollapsed(id: string): boolean {
  return collapsedIds.value.has(id);
}

function toggleCollapse(id: string): void {
  const next = new Set(collapsedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsedIds.value = next;
  saveCollapsedWorkspaces(next);
}

function collapseAllWorkspaces(): void {
  const next = new Set(props.groups.map((g) => g.workspace.id));
  collapsedIds.value = next;
  saveCollapsedWorkspaces(next);
}

function expandAllWorkspaces(): void {
  const next = new Set<string>();
  collapsedIds.value = next;
  saveCollapsedWorkspaces(next);
}

// True when every workspace is collapsed — drives the single toggle button's
// icon (expand when fully collapsed, collapse otherwise) and action.
const allCollapsed = computed(
  () =>
    props.groups.length > 0 &&
    props.groups.every((g) => collapsedIds.value.has(g.workspace.id)),
);

// ---------------------------------------------------------------------------
// In-group expand / collapse (show-more pagination)
// ---------------------------------------------------------------------------
// Tracks which workspace groups are "expanded" past their first page. Ephemeral
// (not persisted): a refresh reloads only the first page, so everything starts
// collapsed. Loading more expands automatically; the user can collapse back to
// the first page without losing the already-loaded data.
const expandedIds = ref<Set<string>>(new Set());

function isExpanded(id: string): boolean {
  return expandedIds.value.has(id);
}

function toggleExpand(id: string): void {
  const next = new Set(expandedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedIds.value = next;
}

function onLoadMore(id: string): void {
  // Loading more should reveal the new rows immediately.
  if (!expandedIds.value.has(id)) {
    const next = new Set(expandedIds.value);
    next.add(id);
    expandedIds.value = next;
  }
  emit('loadMoreSessions', id);
}

// ---------------------------------------------------------------------------
// Workspace drag-to-reorder
// ---------------------------------------------------------------------------
// The header of each group is the drag handle (see WorkspaceGroup). We track
// which group is being dragged and where the insertion marker sits (before or
// after the group under the pointer), then on drop we emit the new id order
// upward — the parent persists it and the computed `groups` re-sorts. Using the
// pointer's position within the target (top half = before, bottom half = after)
// is what lets a workspace be dropped at the very bottom of the list.
const draggingWsId = ref<string | null>(null);
const dragOver = ref<{ id: string; position: DropPosition } | null>(null);

function onWsDragstart(id: string): void {
  draggingWsId.value = id;
}

function onWsDragend(): void {
  draggingWsId.value = null;
  dragOver.value = null;
}

function dropPosition(event: DragEvent): DropPosition {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}

function onGroupDragOver(event: DragEvent, targetId: string): void {
  if (draggingWsId.value === null || draggingWsId.value === targetId) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  dragOver.value = { id: targetId, position: dropPosition(event) };
}

function onGroupDrop(targetId: string): void {
  const fromId = draggingWsId.value;
  const position = dragOver.value?.id === targetId ? dragOver.value.position : 'before';
  dragOver.value = null;
  draggingWsId.value = null;
  if (!fromId || fromId === targetId) return;
  const next = moveInOrder(
    props.groups.map((g) => g.workspace.id),
    fromId,
    targetId,
    position,
  );
  emit('reorderWorkspaces', next);
}

function handleGhClick(wsId: string, e: MouseEvent): void {
  // Ignore clicks that land on the group's action buttons (kebab / add); those
  // have their own handlers and must not also toggle collapse.
  if ((e.target as Element).closest('.gh-more, .gh-add')) return;
  toggleCollapse(wsId);
}

function onSelectSession(sessionId: string): void {
  emit('select', sessionId);
}

// ---------------------------------------------------------------------------
// Rename workspace (inline, like SessionRow)
// ---------------------------------------------------------------------------
const renamingId = ref<string | null>(null);
const renameValue = ref('');
const renameInputRef = ref<HTMLInputElement | null>(null);

// Hand the rename-input ref OBJECT (not its unwrapped value) down to
// WorkspaceGroup: top-level refs are auto-unwrapped in templates, so a getter
// keeps the ref intact. The child writes its input element back, and Sidebar
// keeps owning focus (startRenameWorkspace focuses it on nextTick).
function getRenameInputRef() {
  return renameInputRef;
}

function startRenameWorkspace(id: string, name: string): void {
  renamingId.value = id;
  renameValue.value = name;
  void nextTick().then(() => renameInputRef.value?.focus());
}

function confirmRenameWorkspace(): void {
  const id = renamingId.value;
  const name = renameValue.value.trim();
  if (id && name) {
    emit('renameWorkspace', id, name);
  }
  renamingId.value = null;
}

function cancelRenameWorkspace(): void {
  renamingId.value = null;
}

function onUpdateRenameValue(value: string): void {
  renameValue.value = value;
}

// ---------------------------------------------------------------------------
// Workspace right-click menu (copy path, rename)
// ---------------------------------------------------------------------------
const ghMenuOpen = ref(false);
const ghMenuTarget = ref<WorkspaceView | null>(null);
const ghMenuStyle = ref<Record<string, string>>({});
const ghMenuRef = ref<InstanceType<typeof Menu> | null>(null);

function onGhMenuDocClick(e: MouseEvent): void {
  if (ghMenuRef.value?.el && !ghMenuRef.value.el.contains(e.target as Node)) {
    closeGhMenu();
  }
}

function openGhMenu(ws: WorkspaceView, e: MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
  ghMenuTarget.value = ws;
  ghMenuStyle.value = {
    top: `${e.clientY}px`,
    left: `${e.clientX}px`,
  };
  ghMenuOpen.value = true;
  document.addEventListener('mousedown', onGhMenuDocClick, true);
}

function closeGhMenu(): void {
  ghMenuOpen.value = false;
  document.removeEventListener('mousedown', onGhMenuDocClick, true);
  ghMenuTarget.value = null;
}

function copyPathFromMenu(): void {
  if (ghMenuTarget.value) {
    void copyTextToClipboard(ghMenuTarget.value.root);
  }
  closeGhMenu();
}

function startRenameFromMenu(): void {
  if (ghMenuTarget.value) {
    startRenameWorkspace(ghMenuTarget.value.id, ghMenuTarget.value.name);
  }
  closeGhMenu();
}

function deleteFromMenu(): void {
  const ws = ghMenuTarget.value;
  if (!ws) return;
  closeGhMenu();
  // The modal confirm + async delete live in App.vue (confirmDeleteWorkspace).
  emit('deleteWorkspace', ws.id);
}

// ---------------------------------------------------------------------------
// Workspace inline more-menu (kebab, hover-triggered). Rendered position:fixed
// and anchored to the ⋯ button so the scrolling session list can't clip it.
// It stays open on scroll (so a streaming turn doesn't dismiss it) and closes
// on outside-click or window resize.
// ---------------------------------------------------------------------------
const wsMenuOpenId = ref<string | null>(null);
const wsMenuTarget = ref<WorkspaceView | null>(null);
const wsMenuStyle = ref<Record<string, string>>({});
const wsMenuRef = ref<InstanceType<typeof Menu> | null>(null);

function onWsMenuDocClick(e: MouseEvent): void {
  const target = e.target as Element;
  if (target.closest('.gh-more') || target.closest('.ws-menu')) return;
  closeWsMenu();
}

async function toggleWsMenu(ws: WorkspaceView, e: MouseEvent): Promise<void> {
  if (wsMenuOpenId.value === ws.id) {
    closeWsMenu();
    return;
  }
  const btn = e.currentTarget as HTMLElement;
  wsMenuTarget.value = ws;
  wsMenuOpenId.value = ws.id;
  document.addEventListener('mousedown', onWsMenuDocClick);
  window.addEventListener('resize', closeWsMenu);
  await nextTick();
  const menu = wsMenuRef.value?.el;
  const r = btn.getBoundingClientRect();
  const gap = 4;
  const margin = 8;
  const menuH = menu?.offsetHeight ?? 0;
  const menuW = menu?.offsetWidth ?? 0;
  let top = r.bottom + gap;
  if (top + menuH > window.innerHeight - margin) {
    top = Math.max(margin, r.top - menuH - gap);
  }
  let left = r.right - menuW;
  if (left < margin) left = margin;
  wsMenuStyle.value = {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
  };
}

function closeWsMenu(): void {
  wsMenuOpenId.value = null;
  wsMenuTarget.value = null;
  document.removeEventListener('mousedown', onWsMenuDocClick);
  window.removeEventListener('resize', closeWsMenu);
}

function copyWsPath(ws: WorkspaceView): void {
  void copyTextToClipboard(ws.root);
  closeWsMenu();
}

function startRenameWs(ws: WorkspaceView): void {
  startRenameWorkspace(ws.id, ws.name);
  closeWsMenu();
}

function deleteWs(ws: WorkspaceView): void {
  closeWsMenu();
  // The modal confirm + async delete live in App.vue (confirmDeleteWorkspace).
  emit('deleteWorkspace', ws.id);
}

// ---------------------------------------------------------------------------
// Workspace section overflow menu (the ⋯ in the WORKSPACES header). Holds the
// sort mode and the "show paths" toggle as text items with a check mark for the
// active one. Anchored to the trigger via position:fixed so the scrolling list
// can't clip it.
// ---------------------------------------------------------------------------
const sectionMenuOpen = ref(false);
const sectionMenuStyle = ref<Record<string, string>>({});
const sectionMenuRef = ref<InstanceType<typeof Menu> | null>(null);

function onSectionMenuDocClick(e: MouseEvent): void {
  const target = e.target as Element;
  if (target.closest('.side-section-view') || target.closest('.section-menu')) return;
  closeSectionMenu();
}

async function toggleSectionMenu(e: MouseEvent): Promise<void> {
  if (sectionMenuOpen.value) {
    closeSectionMenu();
    return;
  }
  const btn = e.currentTarget as HTMLElement;
  sectionMenuOpen.value = true;
  document.addEventListener('mousedown', onSectionMenuDocClick);
  window.addEventListener('resize', closeSectionMenu);
  await nextTick();
  const menu = sectionMenuRef.value?.el;
  const r = btn.getBoundingClientRect();
  const gap = 4;
  const margin = 8;
  const menuH = menu?.offsetHeight ?? 0;
  const menuW = menu?.offsetWidth ?? 0;
  let top = r.bottom + gap;
  if (top + menuH > window.innerHeight - margin) {
    top = Math.max(margin, r.top - menuH - gap);
  }
  let left = r.right - menuW;
  if (left < margin) left = margin;
  sectionMenuStyle.value = {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
  };
}

function closeSectionMenu(): void {
  sectionMenuOpen.value = false;
  document.removeEventListener('mousedown', onSectionMenuDocClick);
  window.removeEventListener('resize', closeSectionMenu);
}

function chooseSortMode(mode: WorkspaceSortMode): void {
  emit('setWorkspaceSortMode', mode);
  closeSectionMenu();
}

/** List options: the fork's view mode sits in this menu next to the workspace
 *  sort order. Collapse-all stays a button in the head — one control, one
 *  place. */
function chooseViewMode(mode: SidebarViewMode): void {
  setSidebarViewMode(mode);
  closeSectionMenu();
}

/** Section head title. Without the Lab tab strip the panel heads the session
 *  list itself ("sessions"); with it, the active tab names the list. */
const sectionTitle = computed(() => {
  if (!props.labSidebarTabs) return t('sidebar.sessionsHeader');
  if (sidebarTab.value === 'done') return t('sidebar.tabDone');
  if (sidebarTab.value === 'workspaces') return t('sidebar.workspaces');
  return t('sidebar.tabOpen');
});

/** True while a collapsible workspace-group list is on screen — the collapse-all
 *  button is meaningless for the flat list and for the Done tab's fixed groups. */
const showGroupedControls = computed(() => {
  if (sidebarViewMode.value === 'flat') return false;
  if (!props.labSidebarTabs) return true;
  return sidebarTab.value !== 'done';
});

// ---------------------------------------------------------------------------
// Dev backend switcher menu (the pill next to the brand). Dev-only: repoints
// the Vite dev proxy at the other engine, then reloads so every client state
// (REST, WS, /meta) re-initializes against the new backend.
// ---------------------------------------------------------------------------
const backendMenuOpen = ref(false);
const backendMenuStyle = ref<Record<string, string>>({});
const backendMenuRef = ref<InstanceType<typeof Menu> | null>(null);

function onBackendMenuDocClick(e: MouseEvent): void {
  const target = e.target as Element;
  if (target.closest('.ch-backend') || target.closest('.backend-menu')) return;
  closeBackendMenu();
}

async function toggleBackendMenu(e: MouseEvent): Promise<void> {
  if (devBackend.value === null) return;
  if (backendMenuOpen.value) {
    closeBackendMenu();
    return;
  }
  const btn = e.currentTarget as HTMLElement;
  backendMenuOpen.value = true;
  document.addEventListener('mousedown', onBackendMenuDocClick);
  window.addEventListener('resize', closeBackendMenu);
  await nextTick();
  const menu = backendMenuRef.value?.el;
  const r = btn.getBoundingClientRect();
  const gap = 4;
  const margin = 8;
  const menuH = menu?.offsetHeight ?? 0;
  let top = r.bottom + gap;
  if (top + menuH > window.innerHeight - margin) {
    top = Math.max(margin, r.top - menuH - gap);
  }
  backendMenuStyle.value = {
    top: `${Math.round(top)}px`,
    left: `${Math.round(Math.max(margin, r.left))}px`,
  };
}

function closeBackendMenu(): void {
  backendMenuOpen.value = false;
  document.removeEventListener('mousedown', onBackendMenuDocClick);
  window.removeEventListener('resize', closeBackendMenu);
}

async function chooseBackend(name: BackendName): Promise<void> {
  if (isCurrentBackend(name)) {
    closeBackendMenu();
    return;
  }
  const next = await switchDevBackend(name);
  if (next === null) {
    console.warn('[kimi-web] dev backend switch failed:', name);
    closeBackendMenu();
    return;
  }
  // Full reload: every client channel (REST base state, WS, /meta) must
  // re-initialize against the new backend — a soft swap would leave stale
  // session streams subscribed through the old target.
  window.location.reload();
}

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onGhMenuDocClick, true);
  document.removeEventListener('mousedown', onWsMenuDocClick);
  document.removeEventListener('mousedown', onSectionMenuDocClick);
  document.removeEventListener('mousedown', onBackendMenuDocClick);
  window.removeEventListener('resize', closeWsMenu);
  window.removeEventListener('resize', closeSectionMenu);
  window.removeEventListener('resize', closeBackendMenu);
});

// Logo easter-egg: clicking the Kimi mark plays one quick blink. It's a one-shot
// animation — force a reflow so rapid clicks restart it, then drop the class so
// the idle look/blink loop resumes.
const logoRef = ref<SVGSVGElement | null>(null);
let blinkTimer: ReturnType<typeof setTimeout> | undefined;

// Temporarily hide the new-workspace button while we evaluate the entry point.
const showNewWorkspaceButton = false;

function blinkOnce(): void {
  const el = logoRef.value;
  if (!el) return;
  el.classList.remove('blink-now');
  void el.getBoundingClientRect();
  el.classList.add('blink-now');
  clearTimeout(blinkTimer);
  blinkTimer = setTimeout(() => el.classList.remove('blink-now'), 300);
}

// Logo long-press easter-egg: holding the Kimi mark for 1 second opens the
// design system as a full-screen overlay. A short click still just blinks.
// Pointer capture keeps the hold alive even if the pointer drifts off the mark.
const DesignSystemView = defineAsyncComponent(
  () => import('../views/DesignSystemView.vue'),
);
const showDesignSystem = ref(false);
const EGG_HOLD_MS = 1000;
let logoPressTimer: ReturnType<typeof setTimeout> | undefined;
let logoLongPressed = false;

function onLogoPointerDown(event: PointerEvent): void {
  logoLongPressed = false;
  clearTimeout(logoPressTimer);
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  logoPressTimer = setTimeout(() => {
    logoLongPressed = true;
    showDesignSystem.value = true;
  }, EGG_HOLD_MS);
}

function onLogoPointerUp(event: PointerEvent): void {
  clearTimeout(logoPressTimer);
  const el = event.currentTarget as HTMLElement;
  if (el.hasPointerCapture?.(event.pointerId)) el.releasePointerCapture(event.pointerId);
}

function onLogoClick(): void {
  if (logoLongPressed) {
    logoLongPressed = false;
    return;
  }
  blinkOnce();
}

onBeforeUnmount(() => {
  clearTimeout(logoPressTimer);
});
</script>

<template>
  <aside
    class="side"
    :class="{ 'macos-desktop': isMacosDesktop, collapsed, 'no-anim': dragging }"
    :style="{ width: collapsed ? '0px' : colWidth + 'px' }"
    @dragenter="onFolderDragEnter"
    @dragover="onFolderDragOver"
    @dragleave="onFolderDragLeave"
    @drop="onFolderDrop"
  >
    <!-- Session column -->
    <div ref="colRef" class="col lg-lens" :style="{ width: colWidth + 'px' }">
      <!-- Header: brand + collapse. The collapse button lives INSIDE the header
           on non-mac platforms (right-aligned); on macOS desktop the brand is
           hidden (traffic lights own that corner) and the header is just a
           window-drag strip — there the toggle is App.vue's resident floating
           button beside the traffic lights. -->
      <div class="ch">
        <div class="ch-brand">
          <template v-if="!isMacosDesktop">
            <svg ref="logoRef" class="ch-logo" :class="{ 'is-dev': isDev }" viewBox="0 0 32 22" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Kimi Code" @click="onLogoClick" @pointerdown="onLogoPointerDown" @pointerup="onLogoPointerUp" @pointercancel="onLogoPointerUp">
              <defs>
                <mask id="kimiEyes" maskUnits="userSpaceOnUse">
                  <rect x="0" y="0" width="32" height="22" fill="#fff" />
                  <g class="ch-eyes" fill="#000">
                    <rect class="ch-eye" x="11.8" y="7" width="2.8" height="8" rx="1.4" />
                    <rect class="ch-eye" x="17.4" y="7" width="2.8" height="8" rx="1.4" />
                  </g>
                </mask>
              </defs>
              <rect x="1" y="1" width="30" height="20" rx="6" fill="var(--logo)" mask="url(#kimiEyes)" />
            </svg>
            <span class="ch-name">Kimi Code</span>
            <Pill
              v-if="isDev"
              class="ch-backend"
              :clickable="devBackend !== null"
              :title="t('sidebar.backendTitle', { backend, endpoint })"
              @click="toggleBackendMenu"
            >
              <span class="ch-backend-kind" :class="`is-${backend}`">{{ backend }}</span>
              <span class="ch-backend-ep"> · {{ endpoint }}</span>
              <Icon v-if="devBackend !== null" name="chevron-down" size="sm" />
            </Pill>
          </template>
        </div>
        <div class="ch-tail">
          <Tooltip v-if="!isMacosDesktop" :text="t('sidebar.collapseSidebar')">
            <IconButton
              class="ch-collapse"
              size="sm"
              :label="t('sidebar.collapseSidebar')"
              @click.stop="emit('collapse')"
            >
              <Icon name="left-panel" />
            </IconButton>
          </Tooltip>
        </div>
      </div>

      <!-- Actions: New Session + Search. Both rows stack flush (0 gap, the
           session-row rhythm) and their keycaps are pushed to the trailing
           edge. This block is the last fixed row above the list — it carries
           the scroll-linked seam, whose border/shadow only appear once the
           session list has actually scrolled, so an unscrolled list shows no
           abrupt boundary. -->
      <div class="sidebar-actions" :class="{ 'sidebar-actions--scrolled': sessionsScrolled }">
        <div class="actions-row">
          <button class="btn-new-chat" type="button" @click.stop="emit('create')">
            <Icon name="chat-new" />
            <span>{{ t('sidebar.newSession') }}</span>
            <Kbd :keys="newSessionKeys" />
          </button>
          <IconButton
            v-if="showNewWorkspaceButton"
            size="sm"
            :label="t('sidebar.newWorkspace')"
            @click.stop="emit('addWorkspace')"
          >
            <Icon name="folder" />
          </IconButton>
        </div>
        <button class="search" type="button" @click="openSearch">
          <Icon class="search-icon" name="search" />
          <span class="search-input">{{ t('sidebar.search') }}</span>
          <Kbd :keys="sessionSearchKeys" />
        </button>
      </div>

      <!-- Session list panel: the fixed section head plus the scrolling list.
           The pinned section sits between them (fork-only), so the head titles
           the whole panel rather than only the group list. -->
      <div class="session-list-panel">
        <!-- Experimental Lab: multi-tab sidebar (Open / Done / Workspaces).
             The strip stays above the head, so the head's title names the tab
             that is currently selected. -->
        <div v-if="labSidebarTabs && groups.length > 0" class="sb-tabs-wrap">
          <Tabs
            :model-value="sidebarTab"
            :options="tabOptions"
            @update:model-value="sidebarTab = $event as SidebarTab"
          />
        </div>

        <!-- Section head — the list's title plus its view controls (collapse
             all workspaces, list options). Outside the scroll container, so it
             stays put while the rows scroll. Upstream nests the label inside the
             head (`.sessions-head > .side-section-label`); keeping them on one
             element shifted every child up a level. -->
        <div v-if="groups.length > 0" class="sessions-head">
          <div class="side-section-label">
            <span class="side-section-title">{{ sectionTitle }}</span>
            <div class="side-section-actions">
              <Tooltip
                v-if="showGroupedControls"
                :text="allCollapsed ? t('sidebar.expandAll') : t('sidebar.collapseAll')"
              >
                <IconButton
                  class="side-section-toggle"
                  size="sm"
                  :label="allCollapsed ? t('sidebar.expandAll') : t('sidebar.collapseAll')"
                  @click.stop="allCollapsed ? expandAllWorkspaces() : collapseAllWorkspaces()"
                >
                  <Icon v-if="allCollapsed" name="expand" />
                  <Icon v-else name="collapse" />
                </IconButton>
              </Tooltip>
              <Tooltip :text="t('sidebar.listOptions')">
                <IconButton
                  class="side-section-toggle side-section-view"
                  size="sm"
                  :label="t('sidebar.listOptions')"
                  aria-haspopup="menu"
                  :aria-expanded="sectionMenuOpen"
                  @click.stop="toggleSectionMenu($event)"
                >
                  <Icon name="dots-horizontal" />
                </IconButton>
              </Tooltip>
            </div>
          </div>
        </div>

      <!-- Pinned section — stays above the tabs (Lab mode) / above the list
           (today's mode); not owned by any single tab. Fixed height shared with
           the session list via the divider below (both areas resize); the rows
           scroll inside with top/bottom edge fades when they overflow. -->
      <template v-if="pinnedSessions.length > 0">
        <div class="pinned-wrap" :style="{ height: `${pinnedHeight}px` }">
          <div
            class="pinned-scroll"
            :class="{ 'fade-top': pinnedScrolled, 'fade-bot': !pinnedAtBottom }"
            @scroll.passive="onPinnedScroll"
          >
            <div class="side-section-label pinned-label"><span class="side-section-title">{{ $t('sidebar.pinned') }}</span></div>
            <SessionRow
              v-for="session in pinnedSessions"
              :key="session.id"
              :session="session"
              :active="session.id === activeId"
              :approval-count="pendingBySession[session.id]?.approvals ?? 0"
              :question-count="pendingBySession[session.id]?.questions ?? 0"
              :unread="unreadBySession[session.id] ?? false"
              @select="onSelectSession"
              @rename="(id, title) => emit('rename', id, title)"
              @archive="(id) => emit('archive', id)"
              @delete="(id) => emit('delete', id)"
              @fork="(id) => emit('fork', id)"
              @export="(id) => emit('export', id)"
              @set-emoji="onSetEmoji"
              @toggle-pinned="onTogglePinned"
              @generate-title="(id, done) => emit('generateTitle', id, done)"
            />
          </div>
        </div>
        <ResizeHandle
          class="pinned-resize"
          orientation="horizontal"
          :storage-key="STORAGE_KEYS.pinnedHeight"
          :default-width="PINNED_DEFAULT_HEIGHT"
          :min="PINNED_MIN_HEIGHT"
          :max="Math.min(PINNED_MAX_HEIGHT, pinnedMax)"
          :aria-label="t('layout.pinnedResizeAria')"
          @update:width="pinnedHeight = $event"
        />
      </template>

      <!-- Session list — grouped by workspace. The section head and the Lab tab
           strip above it are fixed chrome; only this list scrolls. -->
      <div class="sessions" ref="sessionsRef" @scroll="onSessionsScroll">
        <!-- Empty state — only when no workspace is registered at all; empty
             workspaces still render their group header (with the + button). -->
        <div v-if="groups.length === 0" class="empty">
          {{ t('workspace.noWorkspace') }}
        </div>

        <template v-else>
          <!-- ══ Experimental Lab: multi-tab sidebar (Open / Done / Workspaces) ══ -->
          <template v-if="labSidebarTabs">
            <!-- Open tab: flat rows when toggled; grouped falls through to the
                 shared group list below. -->
            <template v-if="sidebarTab === 'open'">
              <template v-if="sidebarViewMode === 'flat'">
                <div v-if="flatSessions.length === 0" class="empty">
                  {{ t('sidebar.noOpenSessions') }}
                </div>
                <SessionRow
                  v-for="session in flatSessions"
                  :key="session.id"
                  :data-wsid="session.workspaceId"
                  :session="session"
                  :active="session.id === activeId"
                  :approval-count="pendingBySession[session.id]?.approvals ?? 0"
                  :question-count="pendingBySession[session.id]?.questions ?? 0"
                  :unread="unreadBySession[session.id] ?? false"
                  @select="onSelectSession"
                  @rename="(id, title) => emit('rename', id, title)"
                  @archive="(id) => emit('archive', id)"
                  @delete="(id) => emit('delete', id)"
                  @fork="(id) => emit('fork', id)"
                  @export="(id) => emit('export', id)"
                  @set-emoji="onSetEmoji"
                  @toggle-pinned="onTogglePinned"
                  @generate-title="(id, done) => emit('generateTitle', id, done)"
                />
              </template>
            </template>

            <!-- Workspaces tab: renders the shared group list below — its
                 collapse-all button and list-options menu live in the head. -->

            <!-- Done tab: archived sessions, flat/grouped per the list option -->
            <template v-else-if="sidebarTab === 'done'">
              <div v-if="doneSessionsLoading && doneSessions.length === 0" class="tab-list-loading">
                <Spinner size="sm" />
              </div>
              <template v-else-if="doneSessions.length === 0">
                <div class="empty">{{ t('sidebar.noDoneSessions') }}</div>
              </template>
              <template v-else>
                <template v-if="sidebarViewMode !== 'flat'">
                  <div
                    v-for="g in doneGroups"
                    :key="g.workspaceId"
                    class="done-group"
                    :data-wsid="g.workspaceId"
                  >
                    <div class="done-group-head">
                      <Icon class="done-group-icon" name="folder" size="sm" />
                      <span class="done-group-name">{{ g.name }}</span>
                      <span class="done-group-count">{{ g.items.length }}</span>
                    </div>
                    <SessionRow
                      v-for="session in g.items"
                      :key="session.id"
                      :data-wsid="g.workspaceId"
                      :session="session"
                      :active="session.id === activeId"
                      :archived="true"
                      @select="onSelectSession"
                      @rename="(id, title) => emit('rename', id, title)"
                      @archive="(id) => emit('restore', id)"
                      @delete="(id) => emit('delete', id)"
                      @fork="(id) => emit('fork', id)"
                      @export="(id) => emit('export', id)"
                      @set-emoji="onSetEmoji"
                      @toggle-pinned="onTogglePinned"
                      @generate-title="(id, done) => emit('generateTitle', id, done)"
                    />
                  </div>
                </template>
                <template v-else>
                  <SessionRow
                    v-for="session in doneSessions"
                    :key="session.id"
                    :data-wsid="session.workspaceId"
                    :session="session"
                    :active="session.id === activeId"
                    :archived="true"
                    @select="onSelectSession"
                    @rename="(id, title) => emit('rename', id, title)"
                    @archive="(id) => emit('restore', id)"
                    @delete="(id) => emit('delete', id)"
                    @fork="(id) => emit('fork', id)"
                    @export="(id) => emit('export', id)"
                    @set-emoji="onSetEmoji"
                    @toggle-pinned="onTogglePinned"
                    @generate-title="(id, done) => emit('generateTitle', id, done)"
                  />
                </template>
                <div v-if="doneSessionsHasMore" class="done-more">
                  <button type="button" class="done-more-btn" @click="fetchDoneSessions(false)">
                    <Spinner v-if="doneSessionsLoading" size="sm" />
                    <span v-else>{{ t('sidebar.showMore', { count: DONE_PAGE_SIZE }) }}</span>
                  </button>
                </div>
              </template>
            </template>

            <!-- Shared group list: the Open tab (grouped toggle) and the
                 Workspaces tab both render the workspace groups. -->
            <template v-if="(sidebarTab === 'open' && sidebarViewMode !== 'flat') || sidebarTab === 'workspaces'">
          <div
            v-for="g in unpinnedGroups"
            :key="g.workspace.id"
            class="ws-drop-target"
            :data-wsid="g.workspace.id"
            :class="{
              'drop-before': dragOver?.id === g.workspace.id && dragOver.position === 'before',
              'drop-after': dragOver?.id === g.workspace.id && dragOver.position === 'after',
            }"
            @dragover="onGroupDragOver($event, g.workspace.id)"
            @drop="onGroupDrop(g.workspace.id)"
          >
            <WorkspaceGroup
              :group="g"
              :pinned-count="pinnedCountByWorkspace[g.workspace.id] ?? 0"
              :active-workspace-id="activeWorkspaceId"
              :active-id="activeId"
              :renaming-id="renamingId"
              :rename-value="renameValue"
              :rename-input-ref="getRenameInputRef()"
              :pending-by-session="pendingBySession"
              :unread-by-session="unreadBySession"
              :ws-menu-open-id="wsMenuOpenId"
              :dragging="draggingWsId === g.workspace.id"
              :is-collapsed="isCollapsed"
              :is-expanded="isExpanded"
              @group-click="handleGhClick"
              @group-contextmenu="openGhMenu"
              @toggle-ws-menu="toggleWsMenu"
              @create-in-workspace="(id) => emit('createInWorkspace', id)"
              @select-session="onSelectSession"
              @rename-session="(id, title) => emit('rename', id, title)"
              @archive-session="(id) => emit('archive', id)"
              @delete-session="(id) => emit('delete', id)"
              @fork-session="(id) => emit('fork', id)"
              @export-session="(id) => emit('export', id)"
              @set-emoji-session="onSetEmoji"
              @toggle-pinned-session="onTogglePinned"
              @generate-title-session="(id, done) => emit('generateTitle', id, done)"
              @load-more="onLoadMore"
              @toggle-expand="toggleExpand"
              @confirm-rename="confirmRenameWorkspace"
              @cancel-rename="cancelRenameWorkspace"
              @update-rename-value="onUpdateRenameValue"
              @ws-dragstart="onWsDragstart"
              @ws-dragend="onWsDragend"
            />
          </div>
            </template>
          </template>

          <!-- ══ Today's mode (Lab off): flat/grouped list ══ -->
          <template v-else>
          <template v-if="sidebarViewMode === 'flat'">
            <SessionRow
              v-for="session in flatSessions"
              :key="session.id"
              :data-wsid="session.workspaceId"
              :session="session"
              :active="session.id === activeId"
              :approval-count="pendingBySession[session.id]?.approvals ?? 0"
              :question-count="pendingBySession[session.id]?.questions ?? 0"
              :unread="unreadBySession[session.id] ?? false"
              @select="onSelectSession"
              @rename="(id, title) => emit('rename', id, title)"
              @archive="(id) => emit('archive', id)"
              @delete="(id) => emit('delete', id)"
              @fork="(id) => emit('fork', id)"
              @export="(id) => emit('export', id)"
              @set-emoji="onSetEmoji"
              @toggle-pinned="onTogglePinned"
              @generate-title="(id, done) => emit('generateTitle', id, done)"
            />
          </template>
          <template v-else>
          <div
            v-for="g in unpinnedGroups"
            :key="g.workspace.id"
            class="ws-drop-target"
            :data-wsid="g.workspace.id"
            :class="{
              'drop-before': dragOver?.id === g.workspace.id && dragOver.position === 'before',
              'drop-after': dragOver?.id === g.workspace.id && dragOver.position === 'after',
            }"
            @dragover="onGroupDragOver($event, g.workspace.id)"
            @drop="onGroupDrop(g.workspace.id)"
          >
            <WorkspaceGroup
              :group="g"
              :pinned-count="pinnedCountByWorkspace[g.workspace.id] ?? 0"
              :active-workspace-id="activeWorkspaceId"
              :active-id="activeId"
              :renaming-id="renamingId"
              :rename-value="renameValue"
              :rename-input-ref="getRenameInputRef()"
              :pending-by-session="pendingBySession"
              :unread-by-session="unreadBySession"
              :ws-menu-open-id="wsMenuOpenId"
              :dragging="draggingWsId === g.workspace.id"
              :is-collapsed="isCollapsed"
              :is-expanded="isExpanded"
              @group-click="handleGhClick"
              @group-contextmenu="openGhMenu"
              @toggle-ws-menu="toggleWsMenu"
              @create-in-workspace="(id) => emit('createInWorkspace', id)"
              @select-session="onSelectSession"
              @rename-session="(id, title) => emit('rename', id, title)"
              @archive-session="(id) => emit('archive', id)"
              @delete-session="(id) => emit('delete', id)"
              @fork-session="(id) => emit('fork', id)"
              @export-session="(id) => emit('export', id)"
              @set-emoji-session="onSetEmoji"
              @toggle-pinned-session="onTogglePinned"
              @generate-title-session="(id, done) => emit('generateTitle', id, done)"
              @load-more="onLoadMore"
              @toggle-expand="toggleExpand"
              @confirm-rename="confirmRenameWorkspace"
              @cancel-rename="cancelRenameWorkspace"
              @update-rename-value="onUpdateRenameValue"
              @ws-dragstart="onWsDragstart"
              @ws-dragend="onWsDragend"
            />
          </div>
          </template>
          </template>
        </template>
      </div>
      </div>

      <!-- Footer: account row + settings entry pinned under the session list -->
      <div class="side-footer">
        <div class="side-footer-account">
          <button
            ref="userTriggerRef"
            class="user-menu-trigger"
            type="button"
            aria-haspopup="menu"
            :aria-expanded="userMenuOpen"
            @click.stop="toggleUserMenu"
          >
            <Icon name="user" />
            <span class="user-menu-name">{{ accountName }}</span>
          </button>
          <Tooltip :text="t('settings.title')">
            <IconButton
              size="sm"
              class="side-footer-settings"
              :label="t('settings.title')"
              @click.stop="emit('openSettings')"
            >
              <Icon name="settings" />
            </IconButton>
          </Tooltip>
        </div>
      </div>
    </div>

    <!-- Footer account menu (upstream's user menu): appearance, language,
         settings, then the sign-in row. Opens upward from the trigger; the
         appearance / language rows open a second panel beside it. -->
    <Menu
      v-if="userMenuOpen"
      ref="userMenuRef"
      class="user-menu"
      :style="userMenuStyle"
      @click.stop
    >
      <MenuItem
        aria-haspopup="menu"
        :aria-expanded="userSubmenu === 'appearance'"
        @click="openUserSubmenu('appearance', $event)"
      >
        <span class="user-menu-item-label">{{ t('theme.colorSchemeLabel') }}</span>
        <span class="user-menu-row-value">{{ colorSchemeLabel }}</span>
        <Icon name="chevron-right" size="sm" />
      </MenuItem>
      <MenuItem
        aria-haspopup="menu"
        :aria-expanded="userSubmenu === 'language'"
        @click="openUserSubmenu('language', $event)"
      >
        <span class="user-menu-item-label">{{ t('sidebar.language') }}</span>
        <span class="user-menu-row-value">{{ localeLabel }}</span>
        <Icon name="chevron-right" size="sm" />
      </MenuItem>
      <MenuItem @click="openSettingsFromUserMenu">
        <span class="user-menu-item-label">{{ t('settings.title') }}</span>
      </MenuItem>
      <MenuItem separator />
      <MenuItem v-if="signedIn" @click="signOutFromUserMenu">
        <span class="user-menu-item-label">{{ t('sidebar.signOut') }}</span>
      </MenuItem>
      <MenuItem v-else class="user-menu-login" @click="signInFromUserMenu">
        <span class="user-menu-item-label">{{ t('sidebar.signIn') }}</span>
      </MenuItem>
    </Menu>
    <Menu
      v-if="userSubmenu !== null"
      ref="userSubmenuRef"
      class="user-submenu"
      :style="userSubmenuStyle"
      @click.stop
    >
      <MenuItem v-for="option in submenuOptions" :key="option.value" @click="chooseUserOption(option.value)">
        <span class="user-menu-item-label">{{ option.label }}</span>
        <span class="view-menu-check">
          <Icon v-if="option.active" name="check" size="sm" />
        </span>
      </MenuItem>
    </Menu>

    <!-- Workspace right-click menu (position:fixed) -->
    <Menu
      v-if="ghMenuOpen"
      ref="ghMenuRef"
      class="gh-menu"
      :style="ghMenuStyle"
      @click.stop
    >
      <MenuItem @click="copyPathFromMenu">{{ t('sidebar.copyPath') }}</MenuItem>
      <MenuItem @click="startRenameFromMenu">{{ t('sidebar.rename') }}</MenuItem>
      <MenuItem danger @click="deleteFromMenu">{{ t('sidebar.removeWorkspace') }}</MenuItem>
    </Menu>

    <!-- Workspace kebab menu (position:fixed, anchored to the ⋯ button so the
         scrolling session list cannot clip it) -->
    <Menu
      v-if="wsMenuOpenId !== null && wsMenuTarget"
      ref="wsMenuRef"
      class="ws-menu"
      :style="wsMenuStyle"
      @click.stop
    >
      <MenuItem @click="copyWsPath(wsMenuTarget)">{{ t('sidebar.copyPath') }}</MenuItem>
      <MenuItem separator />
      <MenuItem @click="startRenameWs(wsMenuTarget)">{{ t('sidebar.rename') }}</MenuItem>
      <MenuItem separator />
      <MenuItem danger @click="deleteWs(wsMenuTarget)">{{ t('sidebar.removeWorkspace') }}</MenuItem>
    </Menu>
    <!-- List options menu (position:fixed, anchored to the section head's ⋯
         button): the list's view mode and workspace sort order. -->
    <Menu
      v-if="sectionMenuOpen"
      ref="sectionMenuRef"
      class="view-menu section-menu"
      :style="sectionMenuStyle"
      @click.stop
    >
      <div class="view-menu-label">{{ t('sidebar.viewGroup') }}</div>
      <MenuItem @click="chooseViewMode('flat')">
        <Icon name="view-flat" size="sm" />
        {{ t('sidebar.viewFlat') }}
        <span class="view-menu-check">
          <Icon v-if="sidebarViewMode === 'flat'" name="check" size="sm" />
        </span>
      </MenuItem>
      <MenuItem @click="chooseViewMode('grouped')">
        <Icon name="view-grouped" size="sm" />
        {{ t('sidebar.viewGrouped') }}
        <span class="view-menu-check">
          <Icon v-if="sidebarViewMode === 'grouped'" name="check" size="sm" />
        </span>
      </MenuItem>
      <div class="view-menu-label">{{ t('sidebar.sortGroup') }}</div>
      <MenuItem @click="chooseSortMode('manual')">
        <Icon name="grip" size="sm" />
        {{ t('sidebar.sortManual') }}
        <span class="view-menu-check">
          <Icon v-if="workspaceSortMode === 'manual'" name="check" size="sm" />
        </span>
      </MenuItem>
      <MenuItem @click="chooseSortMode('recent')">
        <Icon name="clock" size="sm" />
        {{ t('sidebar.sortRecent') }}
        <span class="view-menu-check">
          <Icon v-if="workspaceSortMode === 'recent'" name="check" size="sm" />
        </span>
      </MenuItem>
      <MenuItem v-if="labSidebarTabs" separator />
      <!-- Lab entry point: cross-workspace session admin page (App main view). -->
      <MenuItem v-if="labSidebarTabs" @click="emit('openSessionAdmin')">
        {{ t('sidebar.sessionAdmin') }}
      </MenuItem>
    </Menu>
    <!-- Dev backend switcher menu (position:fixed, anchored to the brand pill) -->
    <Menu
      v-if="backendMenuOpen"
      ref="backendMenuRef"
      class="backend-menu"
      :style="backendMenuStyle"
      @click.stop
    >
      <MenuItem v-for="name in backendNames" :key="name" @click="chooseBackend(name)">
        <span class="section-menu-check">
          <Icon v-if="isCurrentBackend(name)" name="check" size="sm" />
        </span>
        <span class="backend-menu-name">{{ name }}</span>
        <span class="backend-menu-url">{{ presetUrl(name) }}</span>
      </MenuItem>
    </Menu>
    <!-- Session search dialog (Cmd/Ctrl+K) -->
    <SearchSessionsDialog
      v-if="showSearch"
      :sessions="sessions"
      :workspaces="searchWorkspaces"
      :active-id="activeId"
      @select="onSelectSession"
      @select-workspace="onSelectWorkspaceFromSearch"
      @close="showSearch = false"
    />
    <!-- Folder drop affordance: upstream shows this card while an OS folder is
         dragged over the column. `pointer-events:none` keeps the overlay from
         swallowing the drag events the root handlers need. -->
    <div class="folder-drop-overlay" :class="{ show: folderDragActive }" aria-hidden="true">
      <div class="folder-drop-card">
        <Icon name="folder" size="lg" />
        <span>{{ t('sidebar.dropToAddWorkspace') }}</span>
      </div>
    </div>
    <!-- Keep inside <aside>: a top-level <Teleport> makes Sidebar multi-root,
         which breaks v-show on the host (Vue can't apply display:none to a
         Fragment). Teleport still renders to body regardless of placement. -->
    <Teleport to="body">
      <DesignSystemView v-if="showDesignSystem" @close="showDesignSystem = false" />
    </Teleport>
  </aside>
</template>

<style scoped>
.side {
  /* Sidebar sits on its own surface (--color-sidebar-bg, one step off --bg);
     the 1px hairline on .col still separates it from the conversation pane. */
  background: var(--color-sidebar-bg);
  display: flex;
  flex-direction: row;
  /* Anchor content to the right edge: while the container width animates to 0
     the fixed-width column slides out to the left and is clipped, instead of
     reflowing. Mirrors the right-side preview panel (App.vue .global-preview). */
  justify-content: flex-end;
  overflow: hidden;
  min-width: 0;
  height: 100%;
  transition:
    width 0.28s cubic-bezier(0.4, 0, 0.2, 1),
    visibility 0.28s;
  /* Alignment contract, inherited by SessionRow and WorkspaceGroup:
     - row boxes (hover/selected pills) sit --sb-inset from the sidebar edges;
     - text/icons start at --sb-pad-x = --sb-inset + 8px row padding;
     - row titles start at --sb-pad-x + --sb-gutter + --sb-gap. */
  --sb-inset: var(--space-3);  /* row box inset from the sidebar edge */
  --sb-pad-x: var(--space-5);  /* content start x (inset + row padding) */
  --sb-gutter: 16px;           /* leading icon slot (matches the 16px folder icon, so the session title aligns under the workspace name) */
  --sb-gap: var(--space-2);    /* gap between the icon slot and the text */
  /* Row hover wash — global --color-hover (lighter than the selected fill;
     both translucent, so they sit on any surface). */
  --sb-hover: var(--color-hover);
}
/* While dragging the resize handle, follow the pointer 1:1 (same pattern as
   .global-preview.no-anim in App.vue). */
.side.no-anim {
  transition: none;
}
/* Fully collapsed: width 0 (animated), then drop out of hit-testing / tab
   order once the transition ends (visibility interpolates to hidden at the
   end when collapsing, and back to visible immediately when expanding). */
.side.collapsed {
  visibility: hidden;
}

/* Session column. Width is set inline from the App resize handle; it stays
   fixed while the collapsing container clips it. Carries the sidebar's right
   hairline so the border is clipped away together with the content. */
.col {
  flex: none;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
  box-sizing: border-box;
  border-right: 1px solid var(--line);
  container-type: inline-size;
  container-name: sidebar-col;
}

/* Header: brand strip (no border — flows into the workspace list). On non-mac
   platforms the brand sits on the left and the collapse button on the right
   (justify-content: space-between); on macOS desktop the brand is hidden and
   the header is a window-drag strip (see below). min-height keeps the 26px
   control row (50px total with padding) so the list below starts at a stable
   y. */
.ch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: var(--space-3);
  min-height: calc(26px + 2 * var(--space-3));
  width: 100%;
  box-sizing: border-box;
}
/* Upstream wraps the brand row's trailing controls in `.ch-tail`
   (display:flex; gap:--space-2; margin-left:auto). With `space-between` on the
   row the placement is unchanged; the wrapper exists so the two trees compare
   element for element. */
.ch-tail {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: none;
  min-width: 0;
  margin-left: auto;
}
/* Folder drop card — upstream's geometry and surface, shown while an OS folder
   is dragged over the column (see onFolderDragEnter in the script). */
.folder-drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-3);
  box-sizing: border-box;
  background: color-mix(in srgb, var(--color-sidebar-bg) 72%, transparent);
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition: opacity var(--duration-base) ease, visibility var(--duration-base);
}
.folder-drop-overlay.show {
  opacity: 1;
  visibility: visible;
}
.folder-drop-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  max-width: 100%;
  box-sizing: border-box;
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  border: 0.5px dashed var(--color-accent);
  background: var(--color-bg);
  color: var(--color-accent);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--weight-medium);
  box-shadow: var(--shadow-md);
}
.folder-drop-card > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* macOS desktop: the window uses a hidden title bar, so the traffic lights
   float over the top-left of the sidebar and the resident toggle sits beside
   them. The header renders no content here (brand hidden) — it is purely a
   window-drag strip. */
.side.macos-desktop .ch {
  padding-left: 80px;
  -webkit-app-region: drag;
}
.side.macos-desktop .ch-brand {
  display: none;
}
.ch-logo {
  height: 22px;
  width: 32px;
  flex: none;
  display: block;
  cursor: pointer;
  user-select: none;
  touch-action: none;
  transition: transform 0.18s ease;
}
.ch-logo:hover {
  transform: scale(1.08);
}
/* Dev-only: tint the mark yellow so a `pnpm dev:web` tab is obvious at a
   glance. `--logo` is read by the mark's `fill`; overriding it on the svg
   recolors just this instance. */
.ch-logo.is-dev {
  --logo: var(--color-logo-dev);
}
.ch-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  /* Take the row's slack so the action buttons group together on the right. */
  flex: 1;
  user-select: none;
  touch-action: none;
}
.ch-name {
  font-size: var(--ui-font-size);
  font-weight: 500;
  line-height: 22px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Dev-only backend pill next to the brand: shows the engine generation from
   /meta (v1 / v2) and opens the dev-proxy preset switcher menu. v2 is
   accent-colored so it reads differently at a glance. */
.ch-backend {
  flex: none;
  min-width: 0;
}
.ch-backend-kind {
  font-family: var(--mono);
  font-weight: 500;
  color: var(--color-text-muted);
}
.ch-backend-kind.is-v2 {
  color: var(--color-accent);
}
.ch-backend-ep {
  font-family: var(--mono);
  color: var(--color-text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Responsive brand row: below 320px the pill's endpoint drops out (the v1/v2
   kind + chevron stay — the full target is one tooltip away); below 250px the
   product name also drops out so the logo and action buttons keep their room. */
@container sidebar-col (max-width: 320px) {
  .ch-backend-ep { display: none; }
}
@container sidebar-col (max-width: 250px) {
  .ch-name { display: none; }
}

/* Actions block — New Session + Search: rows inside the group stack flush
   (0 gap, same rhythm as the session list rows). This block is the last fixed
   row above the list and carries the scroll-linked seam: its bottom
   border/shadow only appear once the session list has actually scrolled, so an
   unscrolled list shows no abrupt boundary. */
.sidebar-actions {
  display: flex;
  flex-direction: column;
  padding: 0 var(--sb-inset);
  position: relative;
  z-index: 1;
  background: var(--color-sidebar-bg);
  border-bottom: 1px solid transparent;
  transition: border-color var(--duration-base) var(--ease-out),
    box-shadow var(--duration-base) var(--ease-out);
}
.sidebar-actions--scrolled {
  border-bottom-color: var(--line);
  box-shadow: var(--shadow-sm);
}
.actions-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.btn-new-chat {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
  padding: 8px calc(var(--sb-pad-x) - var(--sb-inset));
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  font-family: var(--font-ui);
  font-size: var(--ui-font-size-sm);
  line-height: var(--leading-tight);
  cursor: pointer;
  text-align: left;
}
.btn-new-chat:hover { background: var(--sb-hover); }
.btn-new-chat:focus-visible { outline: none; box-shadow: var(--p-focus-ring); }
.btn-new-chat svg { flex: none; }
.btn-new-chat > span:not(.ui-kbd) {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Session search — opens the Spotlight-style search dialog. */
.search {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  margin: 0;
  padding: 8px calc(var(--sb-pad-x) - var(--sb-inset));
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.search:hover { background: var(--sb-hover); }
.search:focus-visible {
  background: var(--sb-hover);
  color: var(--color-text);
  outline: 2px solid var(--color-accent-bd);
  outline-offset: -2px;
}
.search-icon {
  flex: none;
}
.search-input {
  flex: 1;
  min-width: 0;
  color: var(--color-text);
  font-family: var(--font-ui);
  font-size: var(--ui-font-size-sm);
  line-height: var(--leading-tight);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* The keycap chips are laid out at all times and revealed on hover/focus,
   matching upstream (`.btn-new-chat .ui-kbd, .search .ui-kbd { opacity: 0 }` +
   a `:hover`/`:focus-visible` reveal). They used to be dropped with
   `display: none` in a narrow-sidebar container query, which removed them from
   the rendered tree entirely — the label's flex+ellipsis already absorbs their
   width, so the chips no longer crowd the row and the shortcut hint is
   discoverable on hover the way upstream shows it. */
.btn-new-chat .ui-kbd { margin-left: auto; }
.btn-new-chat .ui-kbd,
.search .ui-kbd {
  opacity: 0;
  transition: opacity var(--duration-base) var(--ease-out);
}
.btn-new-chat:hover .ui-kbd,
.btn-new-chat:focus-visible .ui-kbd,
.search:hover .ui-kbd,
.search:focus-visible .ui-kbd {
  opacity: 1;
}

/* Session list panel — the fixed section head plus the scrolling list; the
   pinned section (fork-only) sits between them. */
.session-list-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* Section head — the list's title (left) and its view controls (right). It
   lives outside the scroll container so it stays put while rows scroll; the
   collapse-all / list-options controls are revealed on hover or focus, like
   the other quiet chrome in the column. Same spacing as the pinned label had
   inside the list (12px above, 4px below), so the two label rows keep one
   rhythm. */
.sessions-head {
  padding: var(--space-3) var(--sb-inset) var(--space-1) var(--sb-pad-x);
}

/* Sessions — the scrolling list, inset from the column edges. The section
   head above it owns the top gap; this owns the bottom breathing room.
   Scrolled content clips at the .sidebar-actions seam. The list keeps the
   app's native-scrollbar choice, but the thumb only paints while the pointer
   is over the list (or it is focused): an idle list reads edge-to-edge clean.
   scrollbar-gutter: stable both-edges reserves the same track space on BOTH
   sides so the left/right content insets stay equal whether or not the thumb
   is showing — without it the right-side scrollbar eats into the right
   --sb-inset and the rows look off-center (sidebar-overlay-scrollbar). */
.sessions {
  flex: 1;
  overflow-y: auto;
  padding: 0 var(--sb-inset) var(--space-3);
  min-height: 0;
  scrollbar-gutter: stable both-edges;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
.sessions:hover,
.sessions:focus-within {
  scrollbar-color: var(--color-text-faint) transparent;
}
.sessions::-webkit-scrollbar {
  width: 10px;
}
.sessions::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: var(--radius-full);
}
.sessions:hover::-webkit-scrollbar-thumb,
.sessions:focus-within::-webkit-scrollbar-thumb {
  background: var(--color-text-faint);
}

/* Pinned section — a fixed row block above the tabs/list, not owned by any
   single tab. Height comes from the pinned resize handle (inline style); only
   this area and the session list below scroll. */
.pinned-wrap {
  flex: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.pinned-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-3) var(--sb-inset) var(--space-2);
  /* Same native hover-reveal scrollbar as the session list. */
  scrollbar-gutter: stable both-edges;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  /* Edge-fade hints while the pinned rows overflow. The fade gradients are
     token-defined so the app's no-gradient-text rule (custom-property
     definitions exempt) stays satisfied; they are applied as a mask-image only
     while the corresponding edge is scrolled away. 10px sits inside the 12px
     container padding, so the label/row text itself never fades. */
  --pinned-fade-top: linear-gradient(to bottom, transparent 0, black 10px);
  --pinned-fade-bot: linear-gradient(to top, transparent 0, black 10px);
  --pinned-fade-both: linear-gradient(to bottom, transparent 0, black 10px, black calc(100% - 10px), transparent 100%);
}
.pinned-scroll:hover,
.pinned-scroll:focus-within {
  scrollbar-color: var(--color-text-faint) transparent;
}
.pinned-scroll::-webkit-scrollbar {
  width: 10px;
}
.pinned-scroll::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: var(--radius-full);
}
.pinned-scroll:hover::-webkit-scrollbar-thumb,
.pinned-scroll:focus-within::-webkit-scrollbar-thumb {
  background: var(--color-text-faint);
}
.pinned-scroll.fade-top {
  -webkit-mask-image: var(--pinned-fade-top);
  mask-image: var(--pinned-fade-top);
}
.pinned-scroll.fade-bot {
  -webkit-mask-image: var(--pinned-fade-bot);
  mask-image: var(--pinned-fade-bot);
}
.pinned-scroll.fade-top.fade-bot {
  -webkit-mask-image: var(--pinned-fade-both);
  mask-image: var(--pinned-fade-both);
}

/* The pinned resize divider — ResizeHandle supplies the strip + pointer
   behaviour; this only trims it to the column (the child's own horizontal
   variant handles size/cursor). */
.pinned-resize {
  flex: none;
  align-self: stretch;
}

/* Footer — account row + settings entry pinned under the session list. The
   account trigger is a "list-style" control (left-aligned, hover sunken — not
   a Button); the settings entry is an IconButton on the row's trailing edge. */
.side-footer {
  flex: none;
  padding: var(--space-2) var(--sb-inset);
  border-top: 1px solid var(--line);
}
.side-footer-account {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.user-menu-trigger {
  display: flex;
  align-items: center;
  gap: var(--sb-gap, 8px);
  flex: 1;
  min-width: 0;
  padding: 8px calc(var(--sb-pad-x) - var(--sb-inset));
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  font-family: var(--font-ui);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--weight-medium);
  line-height: var(--leading-tight);
  cursor: pointer;
  text-align: left;
}
.user-menu-trigger:hover,
.user-menu-trigger[aria-expanded='true'] { background: var(--sb-hover); }
.user-menu-trigger:focus-visible { outline: none; box-shadow: var(--p-focus-ring); }
.user-menu-trigger svg { flex: none; color: var(--color-text-muted); }
.user-menu-trigger span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Footer account menu rows: the label takes the slack, the current value and
   the chevron stay flush right. */
.user-menu-item-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.user-menu-row-value {
  flex: none;
  color: var(--color-text-faint);
  font-size: var(--text-sm);
}
/* The sign-in entry is the panel's accent action (upstream tints its label). */
.user-menu-login {
  color: var(--color-accent);
}
.user-menu-login:hover:not(:disabled) {
  background: var(--color-accent-soft);
  color: var(--color-accent-hover);
}

/* Section label — heads a list. Aligns with the rows' leading inset
   (--sb-pad-x) so it reads as the list's title. Padding belongs to the
   placement (the panel head, the pinned block), not to this row. */
.side-section-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  font-weight: var(--weight-regular);
  text-transform: uppercase;
  color: var(--faint);
  user-select: none;
}
/* Label placement inside the padded pinned scroller. */
.pinned-label {
  padding: 0 var(--space-3) var(--space-1) var(--space-2);
}
.side-section-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.side-section-toggle {
  color: var(--faint);
  opacity: 0;
  transition: opacity var(--duration-base) var(--ease-out);
}
.side-section-label:hover .side-section-toggle,
.side-section-label:focus-within .side-section-toggle {
  opacity: 1;
}
.side-section-toggle:hover {
  color: var(--dim);
}
.side-section-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* Workspace drag-to-reorder: a line at the top (drop-before) or bottom
   (drop-after) of the group under the cursor marks where the dragged workspace
   will land. Inset shadows avoid layout shift. */
.ws-drop-target.drop-before { box-shadow: inset 0 2px 0 var(--color-accent); }
.ws-drop-target.drop-after { box-shadow: inset 0 -2px 0 var(--color-accent); }

.empty {
  padding: var(--space-6) var(--space-3);
  text-align: center;
  color: var(--faint);
  font-size: calc(var(--ui-font-size) - 3px);
  line-height: 1.6;
}

/* Lab multi-tab sidebar — the tab strip + per-tab states. The strip is a
   subtle row between the pinned section and the list: the design-system Tabs
   primitive supplies the underline; only the wrapper margins live here. */
.sb-tabs-wrap {
  margin-bottom: var(--space-1);
}
.tab-list-loading {
  padding: var(--space-6) var(--space-3);
  display: flex;
  justify-content: center;
}
/* Done tab (archived sessions) — grouped mode reuses the folder-head style of
   workspace groups, but static (no collapse/drag): the rows carry the actions. */
.done-group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: var(--space-2) var(--space-1);
  user-select: none;
}
.done-group-icon {
  flex: none;
  width: 16px;
  height: 16px;
  color: var(--faint);
}
.done-group-name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  color: var(--dim);
}
.done-group-count {
  flex: none;
  font-size: var(--text-xs);
  color: var(--faint);
}
.done-more {
  padding: var(--space-2) 0;
}
.done-more-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 28px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--dim);
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  cursor: pointer;
}
.done-more-btn:hover { background: var(--sb-hover); color: var(--color-text); }
.done-more-btn:focus-visible { outline: none; box-shadow: var(--p-focus-ring); }

/* Workspace menus — surface + items come from Menu / MenuItem; only the
   fixed positioning stays here (anchored to the ⋯ trigger / cursor). */
.ws-menu,
.gh-menu,
.section-menu,
.user-menu,
.user-submenu,
.backend-menu {
  position: fixed;
  top: 0;
  left: 0;
  z-index: var(--z-dropdown);
}
.user-menu,
.user-submenu {
  max-height: calc(100vh - 16px);
  overflow-y: auto;
  /* Never narrower than the widest row: the panel starts at the trigger's
     width, and the value + chevron on the appearance / language rows would
     otherwise clip their labels. */
  min-width: fit-content;
}

/* Check slot for the section overflow menu — fixed width so unchecked items
   keep their text aligned with the checked one. */
.section-menu-check {
  display: inline-flex;
  flex: none;
  width: 14px;
}

/* List-options menu (upstream's view-menu): group headings for the view mode
   and the sort order, and the trailing check on the selected item of each. */
.view-menu-label {
  padding: var(--space-1) var(--space-2) var(--space-05);
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  color: var(--color-text-faint);
  user-select: none;
}
.view-menu-check {
  margin-left: auto;
  display: inline-flex;
}

/* Backend switcher menu rows: mono engine name + muted preset URL. */
.backend-menu-name {
  font-family: var(--mono);
  font-weight: 500;
}
.backend-menu-url {
  margin-left: 8px;
  font-family: var(--mono);
  color: var(--color-text-muted);
}

</style>
