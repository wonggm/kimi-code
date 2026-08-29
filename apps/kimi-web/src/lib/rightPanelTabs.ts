// apps/kimi-web/src/lib/rightPanelTabs.ts
// Pure helpers for the right-side multi-tab panel (Changes / Side chat /
// Turn diff / Terminal / Bash / Sub agents / Todos). Lives in lib/ so the tab
// state, persistence, and "scoped" logic can be unit-tested without Vue.

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
