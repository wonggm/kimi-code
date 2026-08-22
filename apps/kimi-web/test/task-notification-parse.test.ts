import { describe, expect, it } from 'vitest';
import { parseTaskNotification } from '../src/lib/taskNotification';

describe('parseTaskNotification', () => {
  it('returns null for missing or non-notification text', () => {
    expect(parseTaskNotification(undefined)).toBeNull();
    expect(parseTaskNotification(null)).toBeNull();
    expect(parseTaskNotification(['plain text'])).toBeNull();
    expect(parseTaskNotification('<notification>broken')).toBeNull();
  });

  it('parses a notification with an output-file child', () => {
    const parsed = parseTaskNotification([
      '<notification id="task:bash-abc123:completed" category="task" type="task.completed" source_kind="background_task" source_id="bash-abc123" agent_id="agent-5">',
      'Title: Background subagent completed',
      'Severity: info',
      'The calibration scan finished.',
      '<output-file path="/home/m/.kimi-code/sessions/wd/logs/output.log" bytes="4801">',
      'Read the output file to retrieve the result: /home/m/.kimi-code/sessions/wd/logs/output.log',
      '</output-file>',
      '</notification>',
    ]);
    expect(parsed).toEqual({
      id: 'task:bash-abc123:completed',
      category: 'task',
      type: 'task.completed',
      sourceKind: 'background_task',
      sourceId: 'bash-abc123',
      agentId: 'agent-5',
      title: 'Background subagent completed',
      severity: 'info',
      body: 'The calibration scan finished.',
      outputFile: { path: '/home/m/.kimi-code/sessions/wd/logs/output.log', bytes: 4801 },
      outputPreview: undefined,
    });
  });

  it('parses a notification with an output-preview child and truncation flag', () => {
    const parsed = parseTaskNotification([
      '<notification id="task:bash-abc123:failed" category="task" type="task.failed" source_kind="background_task" source_id="bash-abc123">',
      'Title: Background subagent failed',
      'Severity: warning',
      'The scan failed. Reason: disk full',
      '<output-preview bytes="2048" total_bytes="4801" truncated="true">',
      'Showing the last 2048 bytes. No persisted full output is available.',
      'line one of the tail',
      'line two of the tail',
      '</output-preview>',
      '</notification>',
    ]);
    expect(parsed).toEqual({
      id: 'task:bash-abc123:failed',
      category: 'task',
      type: 'task.failed',
      sourceKind: 'background_task',
      sourceId: 'bash-abc123',
      agentId: undefined,
      title: 'Background subagent failed',
      severity: 'warning',
      body: 'The scan failed. Reason: disk full',
      outputFile: undefined,
      outputPreview: {
        text: 'line one of the tail\nline two of the tail',
        bytes: 2048,
        totalBytes: 4801,
        truncated: true,
      },
    });
  });

  it('unescapes XML entities and drops the title/severity header lines from the body', () => {
    const parsed = parseTaskNotification([
      '<notification id="n1" category="task" type="task.completed" source_kind="background_task" source_id="t1">',
      'Title: Ran &quot;setup&quot; &amp; prints',
      'Severity: info',
      '',
      'Body with &lt;stuff&gt; kept.',
      '</notification>',
    ]);
    expect(parsed?.title).toBe('Ran "setup" & prints');
    expect(parsed?.severity).toBe('info');
    expect(parsed?.body).toBe('Body with <stuff> kept.');
  });
});