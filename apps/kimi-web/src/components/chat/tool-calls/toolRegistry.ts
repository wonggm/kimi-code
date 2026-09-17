// apps/kimi-web/src/components/chat/tool-calls/toolRegistry.ts
import type { Component } from 'vue';
import type { ToolCall } from '../../../types';
import { normalizeToolName } from '../../../lib/toolMeta';
import { isBrowserToolName } from '../../../lib/browserTool';
import AgentTool from './AgentTool.vue';
import AskUserTool from './AskUserTool.vue';
import BackgroundTaskTool from './BackgroundTaskTool.vue';
import BrowserTool from './BrowserTool.vue';
import EditTool from './EditTool.vue';
import GenericTool from './GenericTool.vue';
import GoalTool from './GoalTool.vue';
import MediaTool from './MediaTool.vue';
import SwarmTool from './SwarmTool.vue';
import TodoTool from './TodoTool.vue';
import WaitForTool from './WaitForTool.vue';

type ToolRenderer = Component;

/** Pick the renderer for a tool call. */
export function resolveToolRenderer(tool: ToolCall): ToolRenderer {
  // The browser tool is matched on its raw MCP name, as upstream does: its
  // `display.kind` is `browser` but the name is what identifies it.
  if (isBrowserToolName(tool.name)) return BrowserTool;
  if (tool.media && tool.status === 'ok') return MediaTool;
  const name = normalizeToolName(tool.name);
  if (name === 'edit' || name === 'write' || name === 'multi_edit') return EditTool;
  // NOTE: normalizeToolName() folds `agent`/`subagent` into the canonical
  // `task` kind (see lib/toolMeta.ts NAME_ALIASES), so the match must be on
  // `task` — `agent` here would be dead code and route subagent calls to
  // GenericTool, dropping the inline "Open" button for the detail panel.
  if (name === 'task') return AgentTool;
  if (name === 'agentswarm') return SwarmTool;
  if (name === 'askuserquestion') return AskUserTool;
  if (name === 'todo') return TodoTool;
  if (name === 'waitfor') return WaitForTool;
  if (name === 'tasklist' || name === 'taskoutput' || name === 'taskstop') return BackgroundTaskTool;
  if (name === 'creategoal' || name === 'getgoal' || name === 'setgoalbudget' || name === 'updategoal') return GoalTool;
  return GenericTool;
}
