// apps/kimi-web/src/lib/taskCopy.ts
// Payload composition for the task detail copy menu (dock "Bash" panel).
// Kept as a pure function so the command + output + all composition is
// unit-testable without mounting the component.

export type TaskCopyKind = 'command' | 'output' | 'all';

export interface TaskCopyPayload {
  /** The command text (`task.meta`), verbatim; '' when absent. */
  command: string;
  /** The output lines joined with newlines; '' when absent. */
  output: string;
  /** Command + output joined with a blank line; the absent parts drop out. */
  all: string;
}

/**
 * Build the three copyable texts of a task row from its command (`meta`) and
 * output lines.
 */
export function composeTaskCopyPayload(
  meta: string | undefined,
  output: string[] | undefined,
): TaskCopyPayload {
  const command = meta ?? '';
  const outputText = output?.join('\n') ?? '';
  const all = command
    ? outputText
      ? `${command}\n\n${outputText}`
      : command
    : outputText;
  return { command, output: outputText, all };
}