// apps/kimi-web/src/composables/useDetailPanel.ts
// The right panel's data layer and the transcript's entry points into it. The
// panel's own state (its tabs, the active id, the width, visibility) belongs to
// useRightPanel; what is left here is the fork's engine data — what a tab's body
// reads, and the resolution the transcript needs before a tab can be keyed.
//
// The names follow upstream's panel composable, which is where these functions
// come from: `openDiffDetail` / `closeDiffDetail` / `detailDiffMode` /
// `detailDiffPath` / `selectDiffFile` are the diff tab's own list ↔ detail
// drill, and `compactionPanelTextOf` / `agentPanelMemberOf` are the props
// upstream's prop-builder hands to its compaction and agent panes.

import { computed, ref, watch } from 'vue';
import type { AgentMember } from '../types';
import type { useKimiWebClient } from './useKimiWebClient';
import { extractEditPath, findToolCallById } from '../lib/toolDiff';
import { toAgentMember } from './messagesToTurns';
import { useRightPanel } from './useRightPanel';

type KimiWebClient = ReturnType<typeof useKimiWebClient>;

export interface UseDetailPanelOptions {
  client: KimiWebClient;
}

// The diff tab's own list ↔ detail drill is module state, like the panel's tab
// list: the pane that renders the drill and the transcript that opens the tab
// are different components and must read the same value.
const detailDiffMode = ref<'list' | 'detail'>('list');
const detailDiffPath = ref<string | null>(null);

export function useDetailPanel({ client }: UseDetailPanelOptions) {
  const panel = useRightPanel();

  // ---------------------------------------------------------------------------
  // Diff tab: the session's changed files, and one file's diff.
  // ---------------------------------------------------------------------------
  function openDiffDetail(): void {
    detailDiffMode.value = 'list';
    detailDiffPath.value = null;
    panel.openDiff();
    void client.loadGitStatus(client.activeSessionId.value!);
  }

  function closeDiffDetail(): void {
    detailDiffMode.value = 'list';
    detailDiffPath.value = null;
    client.clearFileDiff();
  }

  function selectDiffFile(path: string): Promise<void> {
    detailDiffMode.value = 'detail';
    detailDiffPath.value = path;
    return client.loadFileDiff(path);
  }

  // ---------------------------------------------------------------------------
  // Compaction tab: the summary text of the turn the tab is keyed by.
  // ---------------------------------------------------------------------------
  function compactionPanelTextOf(turnId: string): string | null {
    const turn = client.turns.value.find((tn) => tn.id === turnId);
    return turn?.role === 'compaction' && turn.text ? turn.text : null;
  }

  // ---------------------------------------------------------------------------
  // Agent tab: the live subagent task behind it.
  // ---------------------------------------------------------------------------
  // Sourced from the live subagent task (not the message flow), so the pane
  // keeps streaming a still-running subagent's `outputLines`. The tab is keyed
  // by the subagent task id; the transcript's open entry points are the `Agent`
  // tool card (keyed by its tool-call id) and a background subagent chip in the
  // dock (keyed by the task id).
  const agentTabId = computed(() => {
    const tab = panel.activeTab.value;
    return tab?.kind === 'agent' ? tab.subagentId : null;
  });

  /** Resolve the row the open entry points hand over — a task id, an agent id or
   *  the spawning tool call's id — to the subagent task id the tab is keyed by. */
  function resolveSubagentId(target: string): string | undefined {
    const tasks = client.activeAppTasks.value;
    const task =
      tasks.find((tk) => tk.id === target) ??
      tasks.find((tk) => tk.agentId === target) ??
      tasks.find((tk) => tk.parentToolCallId === target);
    if (task) return task.id;
    // A synthesized subagent task (a missed spawn) has no parentToolCallId; if
    // exactly one exists, open it.
    const unmapped = tasks.filter((tk) => tk.kind === 'subagent' && !tk.parentToolCallId);
    if (unmapped.length === 1) return unmapped[0]!.id;
    return undefined;
  }

  const agentPanelMemberOf = computed<AgentMember | null>(() => {
    const id = agentTabId.value;
    if (id === null) return null;
    const tasks = client.activeAppTasks.value;
    // The open entry points hand over a task id, an agent id or the spawning
    // tool call's id — resolve whichever one the tab was keyed by.
    const task =
      tasks.find((tk) => tk.id === id) ??
      tasks.find((tk) => tk.agentId === id) ??
      tasks.find((tk) => tk.parentToolCallId === id) ??
      tasks.filter((tk) => tk.kind === 'subagent' && !tk.parentToolCallId).at(-1);
    if (!task) return null;
    const member = toAgentMember(task);
    if (member.prompt !== undefined) return member;
    // The task rows carry no prompt; the pane's prompt bubble is fed from the
    // Agent tool call that spawned the subagent.
    const prompt = agentPromptOf(task.parentToolCallId ?? id);
    return prompt === undefined ? member : { ...member, prompt };
  });

  /** The subagent's task text, out of the spawning `Agent` tool call's argument. */
  function agentPromptOf(toolCallId: string): string | undefined {
    const tool = findToolCallById(client.turns.value, toolCallId);
    if (!tool) return undefined;
    try {
      const parsed: unknown = JSON.parse(tool.arg);
      if (parsed === null || typeof parsed !== 'object') return undefined;
      const prompt = (parsed as Record<string, unknown>)['prompt'];
      return typeof prompt === 'string' && prompt.trim().length > 0 ? prompt : undefined;
    } catch {
      return undefined;
    }
  }

  // A background task refresh can transiently drop the row the pane is open
  // for; without a last-known fallback the pane unmounts mid-read. Keep the last
  // resolved member until the user closes the tab.
  const lastAgentMember = ref<AgentMember | null>(null);
  watch(agentPanelMemberOf, (member) => {
    if (member) lastAgentMember.value = member;
  });
  const agentPanelMember = computed<AgentMember | null>(
    () => agentPanelMemberOf.value ?? lastAgentMember.value,
  );

  // Seed an empty-bodied subagent pane from its server transcript. A subagent's
  // body is normally filled ONLY by live progress frames; after a page reload /
  // resync those were missed, so the pane would open with an empty body even
  // though the server holds the full transcript. On open, fetch + seed once per
  // tab when the body is still empty (the reducer no-ops a seed that races live
  // frames that already populated it).
  const seededSubagentIds = new Set<string>();
  watch(agentTabId, (id) => {
    if (id === null) {
      seededSubagentIds.clear();
      return;
    }
    if (seededSubagentIds.has(id)) return;
    seededSubagentIds.add(id);
    const task = client.activeAppTasks.value.find((tk) => tk.id === id);
    const hasBody =
      task !== undefined && ((task.text?.length ?? 0) > 0 || (task.outputLines?.length ?? 0) > 0);
    if (!task || hasBody) return;
    const sid = client.activeSessionId.value;
    if (sid) void client.seedTaskBody(sid, task);
  }, { immediate: true });

  // ---------------------------------------------------------------------------
  // Transcript entry points.
  // ---------------------------------------------------------------------------
  /** An edit/write tool row's "open diff" — upstream's turn-diff tab, keyed by
   *  the file the tool wrote. A tool with no path to key a tab by (a non-edit
   *  call, or an unparsable argument) has no upstream surface: the transcript
   *  already carries its output. */
  function openToolDiff(toolCallId: string): void {
    const tool = findToolCallById(client.turns.value, toolCallId);
    const path = tool ? extractEditPath(tool.arg) : undefined;
    if (path) panel.openTurnDiff(path);
  }

  /** `/btw [<question>]` and the composer's side-chat entry. */
  async function openSideChatTab(prompt?: string): Promise<void> {
    // Empty-composer heal: a side chat started from the new-session screen
    // needs a parent session before openSideChat can start a BTW sub-agent.
    // Create one in the active workspace (same path as the first prompt), then
    // open the side chat on it.
    if (!client.activeSessionId.value && client.activeWorkspaceId.value) {
      await client.startSessionAndOpenSideChat(client.activeWorkspaceId.value, prompt);
    } else {
      await client.openSideChat(prompt);
    }
    panel.openSideChat();
  }

  function closeSideChat(): void {
    client.closeSideChat();
  }

  // A session switch resets the tab-local drill and the last-known agent row;
  // the panel's own tabs are rebuilt by useRightPanel's session binding.
  watch(client.activeSessionId, () => {
    detailDiffMode.value = 'list';
    detailDiffPath.value = null;
    lastAgentMember.value = null;
  });

  return {
    detailDiffMode,
    detailDiffPath,
    openDiffDetail,
    closeDiffDetail,
    selectDiffFile,
    compactionPanelTextOf,
    resolveSubagentId,
    agentPanelMemberOf,
    agentPanelMember,
    openToolDiff,
    openSideChatTab,
    closeSideChat,
  };
}
