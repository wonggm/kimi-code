export type TaskFields = Record<string, string>;

export interface TaskListParse {
  activeOnly: boolean;
  count: number;
  tasks: TaskFields[];
}

export interface TaskOutputParse {
  fields: TaskFields;
  truncated: boolean;
  output: string[];
}

const LIST_HEADER = /^(active_background_tasks|background_tasks): (\d+)$/;
const FIELD_LINE = /^([a-z][a-z0-9_]*): (.*)$/;
const OUTPUT_MARKER = '[output]';
const NO_OUTPUT = '[no output available]';
const TRUNCATED_PREFIX = '[Truncated.';

export function taskOutputLines(output: string[] | undefined): string[] {
  return (output ?? []).flatMap((line) => line.split('\n'));
}

function parseFields(lines: string[]): TaskFields {
  const fields: TaskFields = {};
  let key: string | undefined;
  for (const line of lines) {
    const match = FIELD_LINE.exec(line);
    if (match) {
      key = match[1]!;
      fields[key] = match[2]!;
    } else if (key !== undefined) {
      fields[key] += `\n${line}`;
    }
  }
  return fields;
}

export function parseTaskListOutput(output: string[] | undefined): TaskListParse | null {
  const lines = taskOutputLines(output);
  const header = LIST_HEADER.exec(lines[0] ?? '');
  if (!header) return null;
  const tasks: TaskFields[] = [];
  let block: string[] = [];
  const flush = (): void => {
    const fields = parseFields(block);
    if (fields['task_id']) tasks.push(fields);
    block = [];
  };
  for (const line of lines.slice(1)) {
    if (line === '---') flush();
    else block.push(line);
  }
  flush();
  return { activeOnly: header[1] === 'active_background_tasks', count: Number(header[2]), tasks };
}

export function parseTaskOutputOutput(output: string[] | undefined): TaskOutputParse | null {
  const lines = taskOutputLines(output);
  const marker = lines.indexOf(OUTPUT_MARKER);
  if (marker < 0) return null;
  const blank = lines.indexOf('');
  const fields = parseFields(lines.slice(0, blank >= 0 && blank < marker ? blank : marker));
  if (!fields['task_id'] || !fields['status']) return null;
  const truncated = lines.slice(0, marker).some((line) => line.startsWith(TRUNCATED_PREFIX));
  const rest = lines.slice(marker + 1);
  while (rest.length > 0 && rest.at(-1) === '') rest.pop();
  return {
    fields,
    truncated,
    output: rest.length === 1 && rest[0] === NO_OUTPUT ? [] : rest,
  };
}

export function parseTaskStopOutput(output: string[] | undefined): TaskFields | null {
  const fields = parseFields(taskOutputLines(output));
  return fields['task_id'] && fields['status'] ? fields : null;
}
