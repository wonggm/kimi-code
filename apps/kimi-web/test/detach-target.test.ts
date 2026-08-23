import { describe, expect, it } from 'vitest';
import { findDetachTarget } from '../src/lib/detachTarget';
import type { DetachCandidateTask } from '../src/lib/detachTarget';

function task(over: Partial<DetachCandidateTask> & { id: string }): DetachCandidateTask {
  return { kind: 'bash', status: 'running', ...over };
}

describe('findDetachTarget', () => {
  const tasks: DetachCandidateTask[] = [
    task({ id: 'bg-1', kind: 'subagent', runInBackground: true }),
    task({ id: 'fg-1', kind: 'subagent', agentId: 'agent-0' }),
    task({ id: 'fg-2', parentToolCallId: 'tool-9' }),
    task({ id: 'fg-3', command: 'sleep 10' }),
    task({ id: 'bg-2', command: 'sleep 5', runInBackground: true }),
    task({ id: 'fg-4', command: 'sleep 5' }),
  ];

  it('matches by wire agent id', () => {
    expect(findDetachTarget(tasks, { agentId: 'agent-0' })).toBe('fg-1');
  });

  it('matches by parent tool call id', () => {
    expect(findDetachTarget(tasks, { toolCallId: 'tool-9' })).toBe('fg-2');
  });

  it('matches bash by exact command', () => {
    expect(findDetachTarget(tasks, { command: 'sleep 10' })).toBe('fg-3');
  });

  it('picks the most recent running foreground command on duplicates', () => {
    const dupes = [
      task({ id: 'old', status: 'running', command: 'sleep 1' }),
      task({ id: 'newer-bg', status: 'running', command: 'sleep 1', runInBackground: true }),
      task({ id: 'newest', status: 'running', command: 'sleep 1' }),
    ];
    expect(findDetachTarget(dupes, { command: 'sleep 1' })).toBe('newest');
  });

  it('never returns an already-background task', () => {
    const onlyBg = [task({ id: 'bg-x', kind: 'subagent', agentId: 'agent-1', runInBackground: true })];
    expect(findDetachTarget(onlyBg, { agentId: 'agent-1' })).toBeUndefined();
    expect(findDetachTarget(onlyBg, { command: undefined })).toBeUndefined();
  });

  it('returns undefined when nothing matches', () => {
    expect(findDetachTarget(tasks, { agentId: 'agent-99' })).toBeUndefined();
    expect(findDetachTarget(tasks, { toolCallId: 'tool-none' })).toBeUndefined();
    expect(findDetachTarget(tasks, { command: 'nope' })).toBeUndefined();
    expect(findDetachTarget([], {})).toBeUndefined();
  });
});
