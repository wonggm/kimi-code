// apps/kimi-web/src/lib/storage.ts
// Thin, safe wrapper over localStorage: raw read/write/remove plus JSON
// helpers, each guarded with try/catch. No validation, clamping, or enum
// checks here — those stay at call sites. Read helpers return null when the
// key is missing or storage is unavailable, so callers decide their own
// fallback. Centralizes the persisted key strings so each key has a single
// source of truth.

import type { QuestionAnswer } from '../api/types';

export const STORAGE_KEYS = {
  // useKimiWebClient
  permission: 'kimi-web.permission',
  // Per-session permission mode (upstream `default-permission-new-sessions`):
  // key is session id, value is one of 'manual' | 'auto' | 'yolo'. Persisted
  // as a compact JSON map so a fresh session with no entry inherits the
  // daemon config's `defaultPermissionMode` instead of stealing whatever the
  // last user pick was.
  permissionBySession: 'kimi-web.permission-by-session',
  activeWorkspace: 'kimi-active-workspace',
  planMode: 'kimi-web.plan-mode',
  planArmed: 'kimi-web.plan-armed',
  swarmMode: 'kimi-web.swarm-mode',
  goalMode: 'kimi-web.goal-mode',
  uiFontSize: 'kimi-web.ui-font-size',
  starredModels: 'kimi-web.starred-models',
  unread: 'kimi-web.unread',
  onboarded: 'kimi-web.onboarded',
  accent: 'kimi-web.accent',
  colorScheme: 'kimi-web.color-scheme',
  liquidGlass: 'kimi-web.liquid-glass',
  wideMode: 'kimi-web.wide-mode',
  hiddenWorkspaces: 'kimi-web.hidden-workspaces',
  collapsedWorkspaces: 'kimi-web.collapsed-workspaces',
  workspaceOrder: 'kimi-web.workspace-order',
  workspaceNameOverrides: 'kimi-web.workspace-name-overrides',
  workspaceSort: 'kimi-web.workspace-sort',
  // Mobile session switcher view mode: grouped workspace groups vs flat recency.
  switcherView: 'kimi-web.switcher-view',
  // Conversation outline (TOC). The value keeps the legacy `beta-toc` name so
  // users who explicitly turned it off while it was experimental keep their
  // preference after it became on-by-default.
  conversationToc: 'kimi-web.beta-toc',
  notifyOnComplete: 'kimi-web.notify-on-complete',
  notifyOnQuestion: 'kimi-web.notify-on-question',
  notifyOnApproval: 'kimi-web.notify-on-approval',
  soundOnComplete: 'kimi-web.sound-on-complete',
  inputHistory: 'kimi-web.input-history',
  // cross-file
  locale: 'kimi-locale',
  clientId: 'kimi-web.client-id',
  debug: 'kimi-web.debug',
  openInLastTarget: 'kimi-web.open-in.last-target',
  sidebarCollapsed: 'kimi-web.sidebar-collapsed',
  sidebarWidth: 'kimi-web.sidebar-width',
  sidebarViewMode: 'kimi-web.sidebar-view-mode',
  /** Pinned-section height (px) in the sidebar, owned by its resize handle. */
  pinnedHeight: 'kimi-web.pinned-height',
  // Active right-panel tab (multi-tab layout replacing the dock pills).
  rightPanelActiveTab: 'kimi-web.right-panel.active-tab',
  // Code-block rendering preferences in chat messages: word wrap and line-number
  // gutter. Persisted so a user's toggle survives a reload; each block honors
  // the saved preference at render time (Markdown.vue reads these helpers).
  codeWrap: 'kimi-web.code-wrap',
  codeLineNumbers: 'kimi-web.code-line-numbers',
  // Experimental Lab settings (default off): multi-tab sidebar (Open / Done /
  // Workspaces). The admin page shares this flag's Lab gate.
  labSidebarTabs: 'kimi-web.lab.sidebar-tabs',
  // deprecated cleanups (kept so the removals still fire for old users)
  codeFont: 'kimi-web.code-font',
  contentAlign: 'kimi-web.content-align',
  theme: 'kimi-web.theme',
  thinking: 'kimi-web.thinking',
} as const;

/** Per-session composer draft key. */
export function draftStorageKey(sid: string | undefined): string {
  return `kimi-web.draft.${sid && sid.length > 0 ? sid : '__new__'}`;
}

/** Per-session composer attachment-draft key (mirrors draftStorageKey). Stores
 *  upload-ready attachment metadata only (see useAttachmentUpload) so unsent
 *  chips survive a session switch / page refresh just like the text draft. */
export function attachmentDraftStorageKey(sid: string | undefined): string {
  return `kimi-web.attachment-draft.${sid && sid.length > 0 ? sid : '__new__'}`;
}

/** Per-question ask-tool draft key: session id + question id, so a restored
 *  draft can never land on a different question. */
export function questionDraftStorageKey(sessionId: string | undefined, questionId: string): string {
  return `kimi-web.question-draft.${sessionId && sessionId.length > 0 ? sessionId : '__new__'}.${questionId}`;
}

/** In-progress ask-question card state, persisted so leaving the session and
 *  coming back restores what the user had picked/typed (cleared on
 *  submit/dismiss; see QuestionCard). */
export interface QuestionDraft {
  step: number;
  answers: Record<string, QuestionAnswer>;
  otherTexts: Record<string, string>;
}

export function loadQuestionDraft(sessionId: string | undefined, questionId: string): QuestionDraft | null {
  const parsed = safeGetJson<unknown>(questionDraftStorageKey(sessionId, questionId));
  if (!parsed || typeof parsed !== 'object') return null;
  const raw = parsed as Record<string, unknown>;
  const answers = raw.answers;
  const otherTexts = raw.otherTexts;
  if (!answers || typeof answers !== 'object' || !otherTexts || typeof otherTexts !== 'object') return null;
  return {
    step: typeof raw.step === 'number' && Number.isFinite(raw.step) && raw.step >= 0 ? raw.step : 0,
    answers: answers as Record<string, QuestionAnswer>,
    otherTexts: otherTexts as Record<string, string>,
  };
}

export function saveQuestionDraft(sessionId: string | undefined, questionId: string, draft: QuestionDraft): void {
  safeSetJson(questionDraftStorageKey(sessionId, questionId), draft);
}

export function clearQuestionDraft(sessionId: string | undefined, questionId: string): void {
  safeRemove(questionDraftStorageKey(sessionId, questionId));
}

export function safeGetString(key: string): string | null {
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetString(key: string, value: string): void {
  try {
    globalThis.localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode, quota, etc.) — ignore
  }
}

export function safeRemove(key: string): void {
  try {
    globalThis.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function safeGetJson<T>(key: string): T | null {
  const raw = safeGetString(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function safeSetJson(key: string, value: unknown): void {
  try {
    globalThis.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

/**
 * Per-session unread flags: a session id is "unread" when its value is `true`.
 * Persisted as a compact map of only the `true` entries (cleared sessions are
 * dropped). Backed by a single localStorage key so the sidebar's unread dots
 * survive a page refresh — there is no server-side read cursor.
 */
export function loadUnread(): Record<string, boolean> {
  const raw = safeGetString(STORAGE_KEYS.unread);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, boolean> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === true) out[id] = true;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Apply a partial set of unread changes on top of the latest stored value.
 * Passing only the changed entries (rather than a full in-memory map) is what
 * keeps a clear that landed from another tab from being overwritten by this
 * tab's stale state. A `true` entry marks the session unread; a `false` entry
 * deletes the key (clearing the unread dot).
 */
export function saveUnread(changes: Record<string, boolean>): void {
  const current = loadUnread();
  const merged: Record<string, boolean> = { ...current };
  for (const [id, value] of Object.entries(changes)) {
    if (value) merged[id] = true;
    else delete merged[id];
  }
  safeSetString(STORAGE_KEYS.unread, JSON.stringify(merged));
}

/**
 * Collapsed workspace ids in the sidebar. Persisted as a JSON array of ids so
 * the fold state of each workspace group survives a page refresh. There is no
 * server-side source of truth for this UI-only state.
 */
export function loadCollapsedWorkspaces(): string[] {
  const parsed = safeGetJson<unknown>(STORAGE_KEYS.collapsedWorkspaces);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((id): id is string => typeof id === 'string');
}

export function saveCollapsedWorkspaces(ids: Iterable<string>): void {
  safeSetJson(STORAGE_KEYS.collapsedWorkspaces, Array.from(ids));
}

/**
 * Display order of workspace ids in the sidebar. Persisted as a JSON array so
 * the user can drag workspaces into a custom order that survives a page
 * refresh. There is no server-side source of truth for this UI-only ordering;
 * workspaces absent from the list are treated as "not yet placed" and inserted
 * by the caller (newest first).
 */
export function loadWorkspaceOrder(): string[] {
  const parsed = safeGetJson<unknown>(STORAGE_KEYS.workspaceOrder);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((id): id is string => typeof id === 'string');
}

export function saveWorkspaceOrder(ids: Iterable<string>): void {
  safeSetJson(STORAGE_KEYS.workspaceOrder, Array.from(ids));
}

/**
 * Local display-name overrides for workspaces the daemon cannot rename — today
 * that is derived workspaces (a cwd with sessions that was never explicitly
 * registered), which `PATCH /workspaces/:id` rejects with 404. Keyed by
 * workspace root (stable across the derived → registered transition) and
 * applied on top of the daemon list so the rename survives a refresh. Cleared
 * once the daemon accepts a rename for that root.
 */
export function loadWorkspaceNameOverrides(): Record<string, string> {
  const parsed = safeGetJson<unknown>(STORAGE_KEYS.workspaceNameOverrides);
  if (!parsed || typeof parsed !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [root, name] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof name === 'string') out[root] = name;
  }
  return out;
}

export function saveWorkspaceNameOverrides(overrides: Record<string, string>): void {
  safeSetJson(STORAGE_KEYS.workspaceNameOverrides, overrides);
}

/**
 * Sidebar workspace sort mode preference (`'manual'` or `'recent'`). Stored as
 * a raw string with no enum check here — the call site narrows it to
 * `WorkspaceSortMode`. Returns null when unset or storage is unavailable.
 */
export function loadWorkspaceSort(): string | null {
  return safeGetString(STORAGE_KEYS.workspaceSort);
}

export function saveWorkspaceSort(mode: string): void {
  safeSetString(STORAGE_KEYS.workspaceSort, mode);
}

/**
 * Mobile session-switcher view preference (`'grouped'` or `'flat'`). Stored as
 * a raw string with no enum check here — the call site narrows it. Returns
 * null when unset or storage is unavailable.
 */
export function loadSwitcherView(): string | null {
  return safeGetString(STORAGE_KEYS.switcherView);
}

export function saveSwitcherView(view: string): void {
  safeSetString(STORAGE_KEYS.switcherView, view);
}

// ---------------------------------------------------------------------------
// Experimental Lab flags (default off). Persisted as 'true'/'false' strings —
// a missing key (or any other value) means off, so the Lab features never
// sneak in for users who never touched them.
// ---------------------------------------------------------------------------

export function loadLabSidebarTabs(): boolean {
  return safeGetString(STORAGE_KEYS.labSidebarTabs) === 'true';
}

export function saveLabSidebarTabs(on: boolean): void {
  safeSetString(STORAGE_KEYS.labSidebarTabs, on ? 'true' : 'false');
}

// ---------------------------------------------------------------------------
// Code-block rendering preferences (Markdown.vue reads these per render).
//
// Persisted as 'true'/'false' strings. Wrap defaults to false, matching the
// upstream web bundle's code-block default (`wordWrap: "off"`, long lines
// clip and scroll); line-numbers default to false because every chat block
// starts at line 1 and most users prefer the cleaner read. Upstream stores no
// wrap preference at all, so this key is ours; it exists only to remember a
// user's explicit choice.
// ---------------------------------------------------------------------------

/** Word-wrap preference for fenced code blocks in chat markdown. Defaults to
 *  false — long lines clip and scroll horizontally, as upstream renders them;
 *  the header toggle turns wrapping back on and the choice is remembered. */
export function loadCodeWrap(): boolean {
  const raw = safeGetString(STORAGE_KEYS.codeWrap);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return false;
}

export function saveCodeWrap(on: boolean): void {
  safeSetString(STORAGE_KEYS.codeWrap, on ? 'true' : 'false');
}

/** Line-number gutter preference for fenced code blocks. Defaults to false —
 *  the gutter is opt-in via the per-block toggle in the code-block header. */
export function loadCodeLineNumbers(): boolean {
  return safeGetString(STORAGE_KEYS.codeLineNumbers) === 'true';
}

export function saveCodeLineNumbers(on: boolean): void {
  safeSetString(STORAGE_KEYS.codeLineNumbers, on ? 'true' : 'false');
}
