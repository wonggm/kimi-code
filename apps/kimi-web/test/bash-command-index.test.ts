// Scenario: bash-command recovery index + its memoized cache (lib/bashCommandIndex).
// Responsibilities: the pure scan recovers the command for a bash task whose
// tool result mentions `task_id: <id>`; the cache reuses the built index while
// the messages' tool-call content is unchanged, and picks up newly arriving
// bash calls (the TDD requirement: new bash calls MUST still be picked up).
// Run: pnpm --filter @moonshot-ai/kimi-web exec vitest run test/bash-command-index.test.ts

import { describe, expect, it } from 'vitest';
import type { AppMessage, AppMessageContent } from '../src/api/types';
import {
  bashCommandForTask,
  bashScanSignature,
  buildBashCommandIndex,
  createBashCommandIndexCache,
} from '../src/lib/bashCommandIndex';

function message(
  id: string,
  role: AppMessage['role'],
  content: AppMessageContent[],
): AppMessage {
  return { id, sessionId: 'sess_1', role, content, createdAt: '2026-01-01T00:00:00.000Z' };
}

function bashToolUse(toolCallId: string, command: string): AppMessageContent {
  return { type: 'toolUse', toolCallId, toolName: 'Bash', input: { command } };
}

function toolResult(toolCallId: string, output: unknown): AppMessageContent {
  return { type: 'toolResult', toolCallId, output };
}

function bashSessionMessages(taskId: string, command: string): AppMessage[] {
  return [
    message('m1', 'user', [{ type: 'text', text: 'run it' }]),
    message('m2', 'assistant', [
      { type: 'text', text: 'running…' },
      bashToolUse('tool_1', command),
    ]),
    message('m3', 'tool', [toolResult('tool_1', `task_id: ${taskId}\nkind: bash\nstatus: running\n`)]),
  ];
}

describe('buildBashCommandIndex / bashCommandForTask', () => {
  it('recovers the command for a task whose tool result mentions task_id', () => {
    const index = buildBashCommandIndex(bashSessionMessages('bash-abc12345', 'echo hi'));
    expect(bashCommandForTask(index, 'bash-abc12345')).toBe('echo hi');
  });

  it('accepts a lowercase bash tool name', () => {
    const messages = bashSessionMessages('bash-abc12345', 'echo hi');
    messages[1] = message('m2', 'assistant', [
      { type: 'toolUse', toolCallId: 'tool_1', toolName: 'bash', input: { command: 'echo hi' } },
    ]);
    const index = buildBashCommandIndex(messages);
    expect(bashCommandForTask(index, 'bash-abc12345')).toBe('echo hi');
  });

  it('returns undefined when no tool result mentions the task id', () => {
    const messages = bashSessionMessages('bash-abc12345', 'echo hi');
    messages[2] = message('m3', 'tool', [toolResult('tool_1', 'no marker here')]);
    const index = buildBashCommandIndex(messages);
    expect(bashCommandForTask(index, 'bash-abc12345')).toBeUndefined();
  });

  it('does not match a task id that is a substring of a longer id token', () => {
    const index = buildBashCommandIndex(
      bashSessionMessages('bash-abc12345', 'echo hi'),
    );
    expect(bashCommandForTask(index, 'abc12345')).toBeUndefined();
  });

  it('matches the first tool result that mentions the task id', () => {
    const messages = [
      message('m1', 'assistant', [bashToolUse('tool_1', 'echo hi')]),
      message('m2', 'tool', [toolResult('tool_1', 'task_id: bash-aaa\n')]),
      message('m3', 'assistant', [bashToolUse('tool_2', 'echo bye')]),
      message('m4', 'tool', [toolResult('tool_2', 'task_id: bash-aaa again\n')]),
    ];
    const index = buildBashCommandIndex(messages);
    // First result wins even though a later result also mentions the id.
    expect(bashCommandForTask(index, 'bash-aaa')).toBe('echo hi');
  });
});

describe('bashScanSignature', () => {
  it('is unchanged when only non-tool messages change', () => {
    const base = bashSessionMessages('bash-abc12345', 'echo hi');
    const withExtraUser = [
      ...base,
      message('m4', 'user', [{ type: 'text', text: 'another prompt' }]),
    ];
    expect(bashScanSignature(withExtraUser)).toBe(bashScanSignature(base));
  });

  it('is unchanged when streamed outputLines grow (scan does not read them)', () => {
    const base = bashSessionMessages('bash-abc12345', 'echo hi');
    const streaming = [...base];
    streaming[1] = message('m2', 'assistant', [
      { type: 'toolUse', toolCallId: 'tool_1', toolName: 'Bash', input: { command: 'echo hi' }, outputLines: ['line 1', 'line 2'] },
    ]);
    expect(bashScanSignature(streaming)).toBe(bashScanSignature(base));
  });

  it('changes when a bash tool call is added', () => {
    const base = bashSessionMessages('bash-abc12345', 'echo hi');
    const withNewCall = [
      ...base,
      message('m4', 'assistant', [bashToolUse('tool_2', 'ls -la')]),
      message('m5', 'tool', [toolResult('tool_2', 'task_id: bash-zzz\n')]),
    ];
    expect(bashScanSignature(withNewCall)).not.toBe(bashScanSignature(base));
  });
});

describe('createBashCommandIndexCache', () => {
  it('returns the cached result while the messages slice is unchanged', () => {
    const cache = createBashCommandIndexCache();
    const messages = bashSessionMessages('bash-abc12345', 'echo hi');
    expect(cache.commandForTask(messages, 'bash-abc12345')).toBe('echo hi');
    expect(cache.commandForTask(messages, 'bash-abc12345')).toBe('echo hi');
  });

  it('keeps the cached result when the slice changes but tool-call content does not', () => {
    const cache = createBashCommandIndexCache();
    const messages = bashSessionMessages('bash-abc12345', 'echo hi');
    expect(cache.commandForTask(messages, 'bash-abc12345')).toBe('echo hi');

    const withUnrelatedUserMessage = [
      ...messages,
      message('m4', 'user', [{ type: 'text', text: 'unrelated' }]),
    ];
    expect(cache.commandForTask(withUnrelatedUserMessage, 'bash-abc12345')).toBe('echo hi');
  });

  it('picks up a bash call that arrives after the task (new bash calls MUST appear)', () => {
    const cache = createBashCommandIndexCache();
    // Task row exists, but the bash tool call has not streamed in yet.
    expect(cache.commandForTask([], 'bash-abc12345')).toBeUndefined();

    // The tool use + result arrive.
    const messages = bashSessionMessages('bash-abc12345', 'echo hi');
    expect(cache.commandForTask(messages, 'bash-abc12345')).toBe('echo hi');
  });

  it('picks up a newly arriving bash call alongside pre-existing ones', () => {
    const cache = createBashCommandIndexCache();
    const first = bashSessionMessages('bash-aaa', 'echo first');
    expect(cache.commandForTask(first, 'bash-aaa')).toBe('echo first');
    expect(cache.commandForTask(first, 'bash-zzz')).toBeUndefined();

    const withNewCall = [
      ...first,
      message('m4', 'assistant', [bashToolUse('tool_2', 'echo second')]),
      message('m5', 'tool', [toolResult('tool_2', 'task_id: bash-zzz\n')]),
    ];
    expect(cache.commandForTask(withNewCall, 'bash-zzz')).toBe('echo second');
    expect(cache.commandForTask(withNewCall, 'bash-aaa')).toBe('echo first');
  });
});
