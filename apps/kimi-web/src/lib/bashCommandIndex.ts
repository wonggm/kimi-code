// apps/kimi-web/src/lib/bashCommandIndex.ts
// Bash-tool-call recovery for background tasks, extracted from
// useKimiWebClient's findBashCommandForTask into a pure index that can be
// memoized per messages slice.
//
// The recovery logic: a background bash task's command lives in the matching
// `Bash` tool_use message whose tool result mentions `task_id: <id>`. Scanning
// the whole message list per task per recompute was measured at ~148 ms, so the
// index is built once per messages slice and only rebuilt when the slice's
// tool-call content actually changed.

import type { AppMessage } from '../api/types';

export interface BashCommandIndex {
  /** toolCallId → bash command, from assistant `Bash`/`bash` tool_use parts. */
  commandsByToolCallId: Map<string, string>;
  /** task id → toolCallId of the FIRST tool result whose output mentions
   *  `task_id: <id>` (first-wins, matching the original scan). */
  toolCallIdByTaskId: Map<string, string>;
}

const TASK_ID_MARKER = 'task_id: ';

function toolOutputText(output: unknown): string {
  if (typeof output === 'string') return output;
  return output === undefined ? '' : JSON.stringify(output);
}

/**
 * Pure extraction of the bash-command index from a session's messages. Builds
 * the toolCallId → command map from assistant tool_use parts, then the
 * taskId → toolCallId map by scanning tool results for `task_id: <id>`
 * markers. Mirrors findBashCommandForTask exactly (same role filters, same
 * marker match, first tool result wins).
 */
export function buildBashCommandIndex(messages: readonly AppMessage[]): BashCommandIndex {
  const commandsByToolCallId = new Map<string, string>();
  for (const msg of messages) {
    if (msg.role !== 'assistant') continue;
    for (const part of msg.content) {
      if (part.type !== 'toolUse') continue;
      if (part.toolName !== 'Bash' && part.toolName !== 'bash') continue;
      const input = part.input as { command?: unknown } | undefined;
      const command = input && typeof input.command === 'string' ? input.command : undefined;
      if (command) commandsByToolCallId.set(part.toolCallId, command);
    }
  }

  const toolCallIdByTaskId = new Map<string, string>();
  if (commandsByToolCallId.size > 0) {
    for (const msg of messages) {
      if (msg.role !== 'tool') continue;
      for (const part of msg.content) {
        if (part.type !== 'toolResult') continue;
        const text = toolOutputText(part.output);
        let idx = text.indexOf(TASK_ID_MARKER);
        while (idx !== -1) {
          const rest = text.slice(idx + TASK_ID_MARKER.length);
          const taskId = /^\S+/.exec(rest)?.[0];
          if (taskId && !toolCallIdByTaskId.has(taskId)) {
            toolCallIdByTaskId.set(taskId, part.toolCallId);
          }
          idx = text.indexOf(TASK_ID_MARKER, idx + TASK_ID_MARKER.length);
        }
      }
    }
  }
  return { commandsByToolCallId, toolCallIdByTaskId };
}

/** Look up the recovered bash command for a task id in a built index. */
export function bashCommandForTask(
  index: BashCommandIndex,
  taskId: string,
): string | undefined {
  const toolCallId = index.toolCallIdByTaskId.get(taskId);
  if (toolCallId === undefined) return undefined;
  return index.commandsByToolCallId.get(toolCallId);
}

/**
 * Cheap fingerprint of the message content the bash-command scan depends on:
 * assistant `Bash`/`bash` tool_use parts (toolCallId + command) and tool
 * tool_result parts (toolCallId + output length proxy). Non-tool messages and
 * tool parts the scan ignores (other tool calls, streamed outputLines) do not
 * appear, so unrelated message updates keep the same signature and the cached
 * index stays valid.
 *
 * Outputs are proxied by length (never JSON.stringified here — that is the
 * expensive part of a full re-scan). In this pipeline tool-result outputs are
 * immutable once a message lands, so a length proxy only misses a same-length
 * replacement, which the daemon never produces.
 */
export function bashScanSignature(messages: readonly AppMessage[] | undefined): string {
  if (!messages || messages.length === 0) return '';
  let signature = '';
  for (const msg of messages) {
    if (msg.role !== 'assistant' && msg.role !== 'tool') continue;
    for (const part of msg.content) {
      if (part.type === 'toolUse') {
        if (part.toolName !== 'Bash' && part.toolName !== 'bash') continue;
        const input = part.input as { command?: unknown } | undefined;
        const command = input && typeof input.command === 'string' ? input.command : '';
        signature += `${part.toolCallId}|${part.toolName}|${command}\n`;
      } else if (part.type === 'toolResult') {
        const proxy =
          typeof part.output === 'string'
            ? part.output.length
            : part.output === undefined
              ? 0
              : -1;
        signature += `${part.toolCallId}|r|${proxy}\n`;
      }
    }
  }
  return signature;
}

export interface BashCommandIndexCache {
  /**
   * Recover the bash command for a task id, reusing the cached index while the
   * messages slice identity and tool-call signature are unchanged. Newly
   * arriving bash calls (new tool_use or tool_result content) invalidate the
   * cache and are picked up on the next call.
   */
  commandForTask(
    messages: readonly AppMessage[] | undefined,
    taskId: string,
  ): string | undefined;
}

/**
 * Single-slot memoized cache for one session's bash-command index: O(1) skip
 * when the messages slice reference is unchanged, a cheap signature walk when
 * the slice changed (unrelated updates keep the signature), and a full
 * re-scan only when tool-call content actually changed.
 */
export function createBashCommandIndexCache(): BashCommandIndexCache {
  let lastMessages: readonly AppMessage[] | undefined;
  let lastSignature: string | undefined;
  let index: BashCommandIndex | null = null;

  return {
    commandForTask(messages, taskId) {
      if (messages !== lastMessages) {
        lastMessages = messages;
        const signature = bashScanSignature(messages);
        if (signature !== lastSignature) {
          lastSignature = signature;
          index = buildBashCommandIndex(messages ?? []);
        }
      }
      return index === null ? undefined : bashCommandForTask(index, taskId);
    },
  };
}
