// apps/kimi-web/src/lib/rightPanelTabs.ts
// Pure helpers for the right-side multi-tab panel (Changes / Side chat /
// Turn diff / Terminal / Bash / Sub agents / Todos). Lives in lib/ so the tab
// state, persistence, in-panel drill stack, and "scoped" logic can be
// unit-tested without Vue.

import type { AppTask } from '../api/types';
import type { ChatTurn, DiffViewLine, ToolCall } from '../types';
import { buildEditDiffLines } from './toolDiff';
import { normalizeToolName } from './toolMeta';

export const RIGHT_PANEL_TABS = [
  'changes',
  'sideChat',
  'turnDiff',
  'terminal',
  'bash',
  'subagents',
  'todos',
] as const;

export type RightPanelTab = (typeof RIGHT_PANEL_TABS)[number];

export const DEFAULT_RIGHT_PANEL_TAB: RightPanelTab = 'changes';

export function isRightPanelTab(value: string | null | undefined): value is RightPanelTab {
  return typeof value === 'string' && (RIGHT_PANEL_TABS as readonly string[]).includes(value);
}

/** Normalise a persisted string to a valid tab id, falling back to the default
 *  when the saved value is missing, unparsable, or no longer in the tab set. */
export function coerceRightPanelTab(value: string | null | undefined): RightPanelTab {
  return isRightPanelTab(value) ? value : DEFAULT_RIGHT_PANEL_TAB;
}

export interface TurnDiffEntry {
  path: string;
  title: string;
  toolId: string;
  lines: DiffViewLine[] | null;
  output: string[];
  status: string;
}

/** Pull the file path out of an Edit/Write tool call's JSON arg. Mirrors
 *  ConversationPane.changedFilesForTurn but in a pure form that returns
 *  structured entries (path + toolId + lines) so the Turn diff tab can
 *  render per-file diffs. */
export function turnFilesForTurn(turn: ChatTurn): TurnDiffEntry[] {
  const result: TurnDiffEntry[] = [];
  const seen = new Set<string>();
  for (const tool of turn.tools ?? []) {
    const kind = normalizeToolName(tool.name);
    if (kind !== 'edit' && kind !== 'write') continue;
    const path = extractToolPath(tool);
    if (!path) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    result.push({
      path,
      title: toolLabel(tool.name),
      toolId: tool.id,
      lines: tool.status === 'error' ? null : buildEditDiffLines(tool),
      output: tool.output ?? [],
      status: tool.status,
    });
  }
  return result;
}

function extractToolPath(tool: ToolCall): string | undefined {
  const arg = tool.arg;
  if (!arg) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(arg);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const obj = parsed as Record<string, unknown>;
  const value = obj.path ?? obj.file_path ?? obj.filePath ?? obj.filename;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function toolLabel(name: string): string {
  if (name === 'Edit') return 'Edit';
  if (name === 'Write') return 'Write';
  return name;
}

/** Find the latest assistant turn and return its per-file diff entries. */
export function latestTurnDiffEntries(turns: ChatTurn[]): TurnDiffEntry[] {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    if (turn?.role === 'assistant') return turnFilesForTurn(turn);
  }
  return [];
}

// ---------------------------------------------------------------------------
// In-panel drill stack — the panel drills from a tab list into a detail view
// (subagent preview, file preview) without leaving the panel. The stack state
// lives in RightPanelTabs; these pure transitions keep it unit-testable.
// ---------------------------------------------------------------------------

export type PanelDrillView =
  | { kind: 'agent'; taskId: string }
  | { kind: 'file'; path: string; line?: number };

export function samePanelDrill(a: PanelDrillView, b: PanelDrillView): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'agent') return b.kind === 'agent' && a.taskId === b.taskId;
  return b.kind === 'file' && a.path === b.path && a.line === b.line;
}

/** Push a drill view. Re-pushing the view already on top is a no-op (guards
 *  double-fired opens reopening the same detail). Returns a new array so the
 *  caller can assign straight onto a ref. */
export function pushPanelDrill(
  stack: readonly PanelDrillView[],
  view: PanelDrillView,
): PanelDrillView[] {
  const top = stack.at(-1);
  if (top && samePanelDrill(top, view)) return [...stack];
  return [...stack, view];
}

/** Pop one drill level; popping an empty stack stays empty. */
export function popPanelDrill(stack: readonly PanelDrillView[]): PanelDrillView[] {
  return stack.slice(0, Math.max(0, stack.length - 1));
}

/** Resolve an open-agent target (subagent task id, wire agent id, or the
 *  spawning tool-call id) to a task row id. Mirrors the app-level
 *  useDetailPanel.resolveSubagentId, including the single-unmapped fallback
 *  for subagents whose spawn event was missed after a late subscribe. */
export function resolvePanelSubagentTaskId(
  tasks: readonly AppTask[],
  target: string,
): string | undefined {
  const task =
    tasks.find((tk) => tk.id === target) ??
    tasks.find((tk) => tk.agentId === target) ??
    tasks.find((tk) => tk.parentToolCallId === target);
  if (task) return task.id;
  const unmapped = tasks.filter((tk) => tk.kind === 'subagent' && !tk.parentToolCallId);
  if (unmapped.length === 1) return unmapped[0]!.id;
  return undefined;
}

/** Normalize a path opened from inside the panel to the workspace-relative
 *  form the file-read API expects. Same contract as
 *  useFilePreview.normalizePreviewPath (which is welded to the app-level
 *  detail slot), expressed with i18n error-key suffixes so the caller
 *  translates. Without a known workspace root an absolute path passes through
 *  unvalidated and the server decides. */
export type PanelPreviewPathError =
  | 'emptyPath'
  | 'unsupportedPath'
  | 'outsideWorkspace'
  | 'isDirectory';

function splitPathSegments(path: string): string[] {
  return path.split(/[\\/]+/).filter((part) => part.length > 0 && part !== '.');
}

export function normalizePanelPreviewPath(
  inputPath: string,
  workspaceRoot?: string,
): { path: string } | { error: PanelPreviewPathError } {
  const raw = inputPath.trim();
  if (!raw) return { error: 'emptyPath' };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return { error: 'unsupportedPath' };
  if (raw.startsWith('~')) return { error: 'outsideWorkspace' };
  if (raw.startsWith('/')) {
    const root = workspaceRoot && workspaceRoot.length > 1 ? workspaceRoot.replace(/\/+$/, '') : '';
    if (!root) return { path: raw };
    if (raw === root) return { error: 'isDirectory' };
    if (!raw.startsWith(`${root}/`)) return { error: 'outsideWorkspace' };
    const parts = splitPathSegments(raw.slice(root.length));
    if (parts.includes('..')) return { error: 'outsideWorkspace' };
    return parts.length > 0 ? { path: parts.join('/') } : { error: 'isDirectory' };
  }
  const parts = splitPathSegments(raw);
  if (parts.includes('..')) return { error: 'outsideWorkspace' };
  return parts.length > 0 ? { path: parts.join('/') } : { error: 'emptyPath' };
}
