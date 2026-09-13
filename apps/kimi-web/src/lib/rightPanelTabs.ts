// apps/kimi-web/src/lib/rightPanelTabs.ts
// Pure helpers the right panel's panes read from the transcript: the per-file
// diff entries of a turn, and the path normalisation a pane needs before asking
// the file API for content. Lives in lib/ so both can be unit-tested without
// Vue.

import type { ChatTurn, DiffViewLine, ToolCall } from '../types';
import { buildEditDiffLines } from './toolDiff';
import { normalizeToolName } from './toolMeta';

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

// ---------------------------------------------------------------------------
// Turn-diff header paths — upstream's `uQ` / `cQ` pair, which turn the path a
// tool call wrote into the one the pane's header shows (the tooltip) and the
// one it titles itself with (the same path without its leading slash).
// ---------------------------------------------------------------------------

function isAbsolutePanelPath(path: string): boolean {
  return path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('\\\\');
}

/** Upstream's `uQ({ path, cwd })`: the tool's path resolved against the session
 *  cwd when it is relative, left as-is when it is already absolute. */
export function panelDiffFullPath(path: string, cwd?: string): string {
  if (/^\/(?!\/)/.test(path) && cwd) {
    const root =
      /^([a-zA-Z]:)[\\/]/.exec(cwd)?.[1] ?? /^(\\\\[^\\/]+\\[^\\/]+)(?=[\\/]|$)/.exec(cwd)?.[1];
    if (root !== undefined) return `${root}${path}`;
  }
  const base = isAbsolutePanelPath(path) || !cwd ? '' : cwd;
  if (!base) return path;
  return /[/\\]$/.test(base) ? `${base}${path}` : `${base}/${path}`;
}

/** Upstream's `cQ(uQ(...))`: the header's clipped title. */
export function panelDiffPathLabel(path: string, cwd?: string): string {
  const full = panelDiffFullPath(path, cwd);
  return full.startsWith('/') ? full.slice(1) : full;
}
