import { describe, expect, it } from 'vitest';
import { parseWaitForOutput } from '../src/lib/waitForToolParse';

describe('parseWaitForOutput', () => {
  it('returns null for empty or unparseable output', () => {
    expect(parseWaitForOutput(undefined)).toBeNull();
    expect(parseWaitForOutput(null)).toBeNull();
    expect(parseWaitForOutput([])).toBeNull();
    expect(parseWaitForOutput('')).toBeNull();
    expect(parseWaitForOutput('Bash exited with code 1')).toBeNull();
  });

  it('parses the no_tasks head object', () => {
    const parsed = parseWaitForOutput([
      'wait_status: no_tasks',
      'waited_ms: 0',
      'timeout_ms: 300000',
      '',
      'No background tasks are running, so there is nothing to wait for.',
    ]);
    expect(parsed).toEqual({
      status: 'no_tasks',
      waitedMs: 0,
      taskId: undefined,
      finishedStatus: undefined,
      finishedDescription: undefined,
      extraCount: 0,
      runningCount: 0,
      runningSamples: [],
    });
  });

  it('parses a completed wait with extras and still-running tasks', () => {
    const parsed = parseWaitForOutput([
      'wait_status: completed',
      'task_id: bash-abc123',
      'waited_ms: 4231',
      'timeout_ms: 300000',
      '',
      '[finished]',
      'task_id: bash-abc123',
      'kind: process',
      'status: completed',
      'description: Run the experiment',
      'duration_ms: 4120',
      '',
      '[output]',
      'some output line',
      '',
      '[completed_during_wait]',
      'task_id: bash-def456',
      'status: completed',
      'description: Fetch calibration data',
      '---',
      'task_id: bash-ghi789',
      'status: failed',
      'description: Merge result tables',
      'Use TaskOutput with one of the task_id values above to read the full output.',
      '',
      '[still_running]',
      'active_background_tasks: 1',
      'task_id: bash-jkl012',
      'kind: process',
      'status: running',
      'description: Train the model',
    ]);
    expect(parsed).toEqual({
      status: 'completed',
      waitedMs: 4231,
      taskId: 'bash-abc123',
      finishedStatus: 'completed',
      finishedDescription: 'Run the experiment',
      extraCount: 2,
      runningCount: 1,
      runningSamples: ['Train the model'],
    });
  });

  it('parses a timed-out wait and caps the running samples at 3', () => {
    const running = [
      'task_id: bash-1',
      'status: running',
      'description: First task',
      '---',
      'task_id: bash-2',
      'status: running',
      'description: Second task',
      '---',
      'task_id: bash-3',
      'status: running',
      'description: Third task',
      '---',
      'task_id: bash-4',
      'status: running',
      'description: Fourth task',
    ];
    const parsed = parseWaitForOutput([
      'wait_status: timed_out',
      'task_id: bash-abc123',
      'waited_ms: 300000',
      'timeout_ms: 300000',
      '',
      'The wait ended before the task finished — a timeout is not an error.',
      '',
      '[still_running]',
      'active_background_tasks: 4',
      ...running,
    ]);
    expect(parsed).toEqual({
      status: 'timed_out',
      waitedMs: 300000,
      taskId: 'bash-abc123',
      finishedStatus: undefined,
      finishedDescription: undefined,
      extraCount: 0,
      runningCount: 4,
      runningSamples: ['First task', 'Second task', 'Third task'],
    });
  });

  it('ignores a completed_during_wait section that lacks the output hint', () => {
    const parsed = parseWaitForOutput([
      'wait_status: completed',
      'task_id: bash-abc123',
      'waited_ms: 100',
      'timeout_ms: 300000',
      '',
      '[finished]',
      'task_id: bash-abc123',
      'status: completed',
      'description: Run the experiment',
      '',
      '[completed_during_wait]',
      'task_id: bash-def456',
      'status: completed',
      'description: Fetch calibration data',
      'No hint line here — not a real extras list.',
    ]);
    expect(parsed?.extraCount).toBe(0);
    expect(parsed?.status).toBe('completed');
    expect(parsed?.finishedDescription).toBe('Run the experiment');
  });

  it('ignores a still_running section whose task rows do not match its count', () => {
    const parsed = parseWaitForOutput([
      'wait_status: timed_out',
      'waited_ms: 500',
      'timeout_ms: 300000',
      '',
      '[still_running]',
      'active_background_tasks: 5',
      'task_id: bash-1',
      'description: Only one row listed',
    ]);
    expect(parsed).toEqual({
      status: 'timed_out',
      waitedMs: 500,
      taskId: undefined,
      finishedStatus: undefined,
      finishedDescription: undefined,
      extraCount: 0,
      runningCount: 0,
      runningSamples: [],
    });
  });

  it('handles a string input by splitting it on newlines', () => {
    const output = [
      'wait_status: completed',
      'task_id: bash-abc123',
      'waited_ms: 50',
      'timeout_ms: 300000',
      '',
      '[finished]',
      'task_id: bash-abc123',
      'status: completed',
      'description: Run the experiment',
    ].join('\n');
    expect(parseWaitForOutput(output)?.finishedDescription).toBe('Run the experiment');
  });
});