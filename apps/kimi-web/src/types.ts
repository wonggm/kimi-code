// apps/kimi-web/src/types.ts

/** File content loaded for preview (text or base64-encoded binary). */
export interface FileData {
  path: string;
  content: string;
  encoding: 'utf-8' | 'base64';
  mime: string;
  sourceUrl?: string;
  languageId?: string;
  isBinary: boolean;
  size: number;
  lineCount?: number;
}

/** A file entry shown in the composer's @-mention menu. */
export interface FileItem {
  path: string;
  name: string;
}

export interface Session {
  id: string;
  title: string;
  time: string;
  /** True while the session shows a "working" indicator — the unified
      condition shared by the sidebar spinner, the chat moon, and the Stop
      button: a prompt submitted but not yet terminated, or a main turn in
      flight. Background tasks and subagent turns do NOT set it. */
  busy: boolean;
  /** List-level fallback for action-required badges on unopened sessions. */
  pendingInteraction?: 'none' | 'approval' | 'question';
  /** Main agent's latest turn outcome — drives the "aborted" tag when the
      session is quiet and the last turn was cancelled/failed. */
  lastTurnReason?: 'completed' | 'cancelled' | 'failed';
  /** ISO timestamp for recency-based filtering (e.g. default visible sessions). */
  updatedAt?: string;
  /** Text of the most recent user prompt, used by sidebar search. */
  lastPrompt?: string;
  /** Workspace id this session belongs to (resolved from cwd / daemon). */
  workspaceId?: string;
  /** Workspace display name, joined from workspacesView. */
  workspaceName?: string;
  /** GitHub pull request for the session's current branch — projected by the
   *  client from the daemon's git status (fs:git_status). Null when unknown,
   *  not a GitHub repo, or the branch has no PR. Drives the sidebar tag. */
  pullRequest?: { number: number; state: string; url: string } | null;
  emoji?: string;
  pinned?: boolean;
}

export interface Workspace {
  name: string;
  branch: string;
}

/**
 * Sidebar-facing workspace entry. The active workspace header + the switcher
 * dropdown both render these.
 */
export interface WorkspaceView {
  id: string;
  /** Display name (defaults to basename of root). */
  name: string;
  /** Absolute path to the project root. */
  root: string;
  /** Home-shortened path for dim display, e.g. `~/code/kimi-code-web`. */
  shortPath: string;
  /** Number of sessions in this workspace. */
  sessionCount: number;
}

/**
 * One workspace group for the "all workspaces" sidebar view: the workspace
 * header plus its sessions.
 */
export interface WorkspaceGroup {
  workspace: WorkspaceView;
  sessions: Session[];
  /** True when the server has more sessions in this workspace than are loaded. */
  hasMore: boolean;
  /** True while the next page of sessions is being fetched for this workspace. */
  loadingMore: boolean;
  /** First-page capacity for the in-group show-less collapse target: the number
   *  of sessions loaded on first paint, floored at one full page so a workspace
   *  that was empty or sparse does not hide sessions created later. */
  initialCount: number;
}

/** Sidebar session-list scope: only the active workspace, or all workspaces. */
export type WorkspaceScope = 'current' | 'all';

export type ToolStatus = 'ok' | 'running' | 'error';

export interface ToolCall {
  id: string;
  name: string; // e.g. 'read' | 'bash'
  arg: string; // e.g. '· src/api/client.ts'
  status: ToolStatus;
  timing?: string; // e.g. '12ms'
  output?: string[]; // shown line by line when expanded
  media?: ToolMedia;
  defaultExpanded?: boolean;
  /** Absolute path of the plan file (ExitPlanMode only) — rendered as a
   *  clickable link that opens the plan in the file preview. */
  planPath?: string;
}

export interface ToolMedia {
  kind: 'image' | 'video' | 'audio';
  url: string;
  path?: string;
  mimeType?: string;
  bytes?: number;
  dimensions?: string;
  /** File-store id when the media is an uploaded file. The preview fetches its
   *  bytes with the Bearer credential (a bare getFileUrl src 401s in <img>). */
  fileId?: string;
  /** True when bytes must be fetched via the session media route
   *  (`/sessions/{id}/media/{fileId}`), which serves prompt-attached media —
   *  the generic `/files/{fileId}` does not resolve those ids. */
  sessionMedia?: boolean;
}

export type AgentPhase = 'queued' | 'working' | 'suspended' | 'completed' | 'failed';

export interface AgentMember {
  id: string;
  /** The wire agent id keying the server's transcript store (e.g. `agent-0`),
   *  when the source row carries it. Distinct from `id` on REST `/tasks`
   *  rows, which are keyed by background-task id. */
  agentId?: string;
  toolCallId?: string;
  name: string;
  /** The task kind behind the member (upstream's `member.kind`). A `bash` row
   *  renders the command/output pane instead of a subagent transcript. */
  kind?: 'subagent' | 'bash' | 'tool';
  subagentType?: string;
  /** Bound model alias the subagent is actually running on (resolved at
   *  spawn, NOT re-read from `[subagent_models]`). Optional — only present
   *  for rows from the snapshot roster; older servers / REST `/tasks` do
   *  not carry it. */
  model?: string;
  /** Thinking effort selected for this subagent, when reported by the daemon. */
  thinkingEffort?: string;
  phase: AgentPhase;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  /** The prompt/task the subagent was given (from the Agent tool input), or a
   *  bash task's command — upstream's `task.command ?? spawningTool.prompt`. */
  prompt?: string;
  summary?: string;
  outputLines?: string[];
  /** The subagent's concatenated live output (assistant deltas) — grows in the
   *  detail panel like a thinking block. */
  text?: string;
  suspendedReason?: string;
  swarmIndex?: number;
}

export type DiffKind = 'ctx' | 'add' | 'rem';

export interface DiffLine {
  kind: DiffKind;
  gutter: string; // gutter (line-number) column text, e.g. '23' or '   13' or '7   7'
  text: string;
}

/**
 * One row of a parsed UNIFIED diff (from the daemon's `fs:diff` action),
 * rendered line-by-line in the ~/diff tab.
 *
 *   - `add`     — an added line (`+...`); has `newNo`.
 *   - `del`     — a removed line (`-...`); has `oldNo`.
 *   - `context` — an unchanged line; has both `oldNo` + `newNo`.
 *   - `hunk`    — a `@@ -a,b +c,d @@` hunk header (no line numbers).
 *
 * `text` is the line content WITHOUT the leading +/-/space marker.
 */
export interface DiffViewLine {
  type: 'add' | 'del' | 'context' | 'hunk';
  text: string;
  oldNo?: number;
  newNo?: number;
}

/**
 * Discriminated ApprovalBlock union.
 *
 * Phase 3 will render each kind differently; for now ApprovalCard.vue handles
 * 'diff' (the original shape) and falls back to 'generic' for everything else.
 */
export type ApprovalBlock =
  | { kind: 'diff'; path: string; diff: DiffLine[] }
  | { kind: 'shell'; command: string; cwd?: string; danger?: string }
  | { kind: 'file'; path: string; content: string; language?: string }
  | { kind: 'fileop'; op: string; path: string; detail?: string }
  | { kind: 'url'; method?: string; url: string }
  | { kind: 'search'; query: string; scope?: string }
  | { kind: 'invocation'; kind2: string; name: string; description?: string }
  | { kind: 'todo'; items: { title: string; status: string }[] }
  | {
      kind: 'plan_review';
      plan: string;
      path?: string;
      options?: { label: string; description?: string }[];
    }
  | { kind: 'generic'; summary: string };

export type TurnRole = 'user' | 'assistant' | 'compaction' | 'cron' | 'task';

export interface FilePreviewRequest {
  path: string;
  line?: number;
}

/**
 * Payload for opening an Edit/Write tool-call diff in the right-side detail
 * panel. `lines` carries the synthesized diff for single edits / new writes;
 * it is null for operations a from-args diff can't represent (replace_all,
 * append, multi-edit, errors), in which case `output` (the tool result) is
 * shown instead.
 */
export interface ToolDiffTarget {
  /** Tool-call id; used so clicking the same card again toggles the panel closed. */
  id: string;
  title: string;
  path?: string;
  lines: DiffViewLine[] | null;
  output?: string[];
}

/** Metadata carried by a cron fire — shared by a standalone cron turn and by a
 *  cron notice embedded inside an assistant turn's blocks. Mirrors the TUI's
 *  CronTranscriptData. `missedCount` present means a missed-fire catch-up. */
export interface CronTurnData {
  jobId?: string;
  cron?: string;
  recurring?: boolean;
  coalescedCount?: number;
  stale?: boolean;
  missedCount?: number;
}

/** One ordered piece of an assistant turn: a thinking segment, a text segment
 * OR a tool card. Built in call order so every piece renders inline where it
 * happened (a turn can think → act → think again — nothing is hoisted).
 *
 * Subagents render as the spawning `Agent` tool card here; their live progress
 * streams in the right-side detail panel, sourced from the task rather than a
 * dedicated block. */
export type TurnBlock =
  | { kind: 'text'; text: string }
  /** A thinking segment. `durationMs` is the span of the step it came from,
   *  read off the agent transcript page — a thinking frame carries no timing of
   *  its own (see `stepDurationMs` on AppMessage). Absent when the page has no
   *  span, so the block falls back to whatever the client measured itself. */
  | { kind: 'thinking'; thinking: string; durationMs?: number }
  | { kind: 'tool'; tool: ToolCall }
  /** Inline background-task notification, folded into the assistant run at the
      position it arrived so it renders in order instead of trailing the turn.
      `text` is the raw `<notification>` payload (parsed at render time). */
  | { kind: 'task'; text: string; createdAt?: string };

/** One attachment on a user turn: an uploaded file, image or video. Images
    and pasted media carry no name; the chip falls back to a generic label.
    `url` is browser-loadable (a data URL, or the authed file URL). */
export interface TurnAttachment {
  kind: 'image' | 'video' | 'file';
  url: string;
  fileId?: string;
  /** True when the bytes come from the session media store (prompt-attached),
   *  not the generic `/files` route. */
  sessionMedia?: boolean;
  name?: string;
  mediaType?: string;
  size?: number;
}

export interface ChatTurn {
  id: string;
  role: TurnRole;
  no: number; // terminal line number
  text: string;
  /** All thinking segments joined — aggregate convenience field; rendering
      uses the ordered `blocks` (a turn can have MULTIPLE thinking blocks). */
  thinking?: string;
  tools?: ToolCall[];
  /** Thinking + text + tool cards in original call order (assistant turns). */
  blocks?: TurnBlock[];
  approval?: ApprovalBlock;
  approvalId?: string; // daemon approval id — present when approval needs a decision
  /** Attachments sent by the user — files, images and videos, rendered as a
      chip row above the text bubble. */
  attachments?: TurnAttachment[];
  /** Compaction divider data (role 'compaction'): the transcript keeps all
      prior turns and renders this as a separator line; `text` holds the
      LLM-generated summary, opened in the right-side panel on click. */
  compaction?: { trigger?: 'manual' | 'auto'; tokensBefore?: number; tokensAfter?: number };
  /** ISO timestamp when the message was created (used for the user bubble timestamp). */
  createdAt?: string;
  /** Client-side measured duration from turn.started to turn.ended (ms). */
  durationMs?: number;
  /** Skill activation metadata: when a user turn was triggered by a slash
      command (/skill), this holds the skill name and args for display. */
  skillActivation?: { name: string; args?: string };
  /** Plugin command metadata: when a user turn was triggered by a plugin slash
      command (/plugin:command), this holds the command identity and args. */
  pluginCommand?: { pluginId: string; commandName: string; args?: string };
  /** Cron fire metadata (role 'cron'): set when an agent turn was triggered by a
      scheduled reminder rather than a real user. Mirrors the TUI's
      CronTranscriptData. `missedCount` present means a missed-fire catch-up. */
  cron?: CronTurnData;
  /** The engine continued an active goal on its own prompt — upstream labels the
      reply with a "Goal continuation" marker above the turn's content. */
  goalContinuation?: boolean;
}

/**
 * One item of the model-maintained todo list (the TodoList tool). Each write
 * replaces the whole list, so the latest tool call IS the current state.
 */
export interface TodoView {
  title: string;
  status: 'pending' | 'in_progress' | 'done';
}

export type TaskState = 'run' | 'done' | 'fail' | 'cancel';

export interface TaskItem {
  id: string;
  name: string;
  kind: string; // 'subagent' | 'task'
  state: TaskState;
  timing: string;
  /** Bare elapsed time ("5m4s"), the form upstream's task rows show; `timing`
   *  carries the state word too and is what the side-panel panes render. Empty
   *  under a second, which is how upstream's rows come to show no time at all. */
  duration?: string;
  meta?: string;
  output?: string[];
  /** Background subagents only — the dock lists these; foreground subagents
   *  render inline as the `Agent` tool card instead. */
  runInBackground?: boolean;
  /** The spawning `Agent` tool-call id — used to resolve a subagent task back
   *  to its inline tool card, so the card's "Open detail" button can be hidden
   *  when the task is no longer available. */
  parentToolCallId?: string;
  /** Bound model alias the subagent is actually running on (resolved at spawn,
   *  NOT re-read from `[subagent_models]`). Surfaced from AppTask.model so the
   *  subagent card grid keeps showing the bound model next to each agent. */
  model?: string;
  /** ISO timestamps for ordering "recently finished" cards in the subagent
   *  grid (falls back to createdAt for rows without a completion time). */
  createdAt?: string;
  completedAt?: string;
}

export interface ConversationStatus {
  /** Friendly display name of the live model (for the toolbar pill). */
  model: string;
  /** Raw model id — the value selection lists compare against. */
  modelId: string;
  ctxUsed: number;
  ctxMax: number;
  cacheHitRate?: number;
  permission: 'manual' | 'auto' | 'yolo';
  branch: string;
  /** Working directory of the active session */
  cwd: string;
  /** True when the active session's cwd is inside a real git repository */
  isGitRepo: boolean;
}

export interface ActivationBadges {
  plan: boolean;
  goal: { status: string; turnsUsed: number; elapsedMs: number } | null;
  swarm: { done: number; total: number } | null;
}

/** A queued prompt as shown inline at the tail of the transcript. */
export interface QueuedPromptView {
  text: string;
  /** Number of attachments waiting with this prompt. */
  attachmentCount: number;
  /** Attachments waiting with this prompt, with resolved URLs for thumbnails
      (file attachments render an icon chip, no thumbnail). */
  attachments?: { fileId: string; kind: 'image' | 'video' | 'file'; url: string; name?: string }[];
}

/** Horizontal alignment of the conversation reading column within the pane. */

/**
 * UI-facing question type, mapped from AppQuestionRequest in the composable.
 */
export interface UIQuestion {
  questionId: string;
  sessionId: string;
  questions: {
    id: string;
    question: string;
    header?: string;
    body?: string;
    options: { id: string; label: string; description?: string; recommended?: boolean }[];
    multiSelect?: boolean;
    allowOther?: boolean;
    otherLabel?: string;
    otherDescription?: string;
  }[];
}

/** Activity state for the active session. */
export type ActivityState =
  | 'idle'
  | 'running'
  | 'awaiting-approval'
  | 'awaiting-question';

/** Connection state for the WebSocket. */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

/** Permission mode (client-side policy). */
export type PermissionMode = 'manual' | 'auto' | 'yolo';
