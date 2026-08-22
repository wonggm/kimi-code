// apps/kimi-web/src/lib/waitForToolParse.ts
// Parse the WaitFor tool's textual output (packages/agent-core-v2 task-wait
// tool). The output is a plain `key: value` object (formatPlainObject) followed
// by optional `[finished]`, `[completed_during_wait]` and `[still_running]`
// sections. Mirrors the upstream web parser. Defensive: never throws.

export interface WaitForParse {
  status: 'completed' | 'timed_out' | 'no_tasks';
  /** `waited_ms` from the head object; 0 when absent/unparseable. */
  waitedMs: number;
  /** `task_id` from the head object; the waited-for task when the wait had one. */
  taskId?: string;
  /** The finished task's `status` value (from the `[finished]` section). */
  finishedStatus?: string;
  /** The finished task's `description` value. */
  finishedDescription?: string;
  /** Number of other tasks that also finished during the wait. */
  extraCount: number;
  /** Number of tasks still running when the wait ended. */
  runningCount: number;
  /** `description` lines of the still-running tasks, capped at 3. */
  runningSamples: string[];
}

const MAX_RUNNING_SAMPLES = 3;
const TASK_OUTPUT_HINT =
  'Use TaskOutput with one of the task_id values above to read the full output.';

/** First `^key: value` line, or undefined. */
function field(text: string, key: string): string | undefined {
  return new RegExp(`^${key}: (.+)$`, 'm').exec(text)?.[1];
}

function fieldNumber(text: string, key: string): number {
  const n = Number(field(text, key) ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/** Indices of every `^[section]$` line at or after `from`. */
function sectionStarts(text: string, name: string, from: number): number[] {
  const re = new RegExp(`^\\[${name}\\]$`, 'gm');
  const indices: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index >= from) indices.push(m.index);
  }
  return indices;
}

/** True when the marker at `index` is preceded by a blank line. */
function precededByBlankLine(text: string, index: number): boolean {
  return index >= 2 && text[index - 1] === '\n' && text[index - 2] === '\n';
}

/** Content of the section opened by `[name]` at `index`: from just past the
    marker line up to the next line starting with `[`, trimmed. */
function sectionBody(text: string, index: number, name: string): string {
  const start = index + name.length + 3; // `[name]\n`
  const rest = text.slice(start);
  const next = /^\[/m.exec(rest);
  const body = next === null ? rest : rest.slice(0, next.index);
  return body.trim();
}

/** `description: …` lines of a still-running task list, capped for display. */
function runningSamplesOf(section: string, count: number): string[] {
  return [...section.matchAll(/^description: (.+)$/gm)]
    .map((m) => m[1] ?? '')
    .slice(0, Math.min(MAX_RUNNING_SAMPLES, count));
}

/** Validate a `[still_running]` section: its `active_background_tasks:` count
    must match the number of `task_id:` rows it lists. */
function isRunningSection(section: string): boolean {
  const count = field(section, 'active_background_tasks');
  if (count === undefined) return false;
  const n = Number(count);
  return Number.isFinite(n) && countMatches(section, /^task_id: /gm) === n;
}

export function parseWaitForOutput(output: string[] | string | undefined | null): WaitForParse | null {
  if (output === undefined || output === null) return null;
  const text = Array.isArray(output) ? output.join('\n') : output;
  if (text.length === 0) return null;

  // The head object runs until the first `[section]` line.
  const firstSection = /^\[/m.exec(text);
  const head = firstSection === null ? text : text.slice(0, firstSection.index);
  const status = field(head, 'wait_status');
  if (status !== 'completed' && status !== 'timed_out' && status !== 'no_tasks') return null;

  const waitedMs = fieldNumber(head, 'waited_ms');
  const taskId = field(head, 'task_id');
  const sectionsFrom = firstSection?.index ?? text.length;

  // `[finished]`: only for a completed wait, and only when it directly follows
  // the head object (the engine emits it as the first section).
  let finishedSection: string | undefined;
  let afterFinished = sectionsFrom;
  if (status === 'completed' && firstSection !== null && text.startsWith('[finished]', firstSection.index)) {
    finishedSection = sectionBody(text, firstSection.index, 'finished');
    afterFinished = firstSection.index + '[finished]'.length + 2;
  }

  // `[completed_during_wait]`: count the `task_id:` rows when the section ends
  // with the tool's "read the full output" hint (i.e. it is a real extras list
  // and not the tail of an unrelated section).
  let extraCount = 0;
  let lastExtraSection = -1;
  for (const idx of sectionStarts(text, 'completed_during_wait', afterFinished)) {
    if (!precededByBlankLine(text, idx)) continue;
    const body = sectionBody(text, idx, 'completed_during_wait');
    if (!body.endsWith(TASK_OUTPUT_HINT)) continue;
    extraCount = countMatches(body, /^task_id: /gm);
    lastExtraSection = idx;
  }

  // `[still_running]`: last section only; the running count and samples come
  // from the task-list block when it validates.
  let runningCount = 0;
  let runningSamples: string[] = [];
  const starts = sectionStarts(text, 'still_running', afterFinished);
  for (const idx of starts) {
    if (lastExtraSection >= 0 && idx < lastExtraSection) continue;
    if (!precededByBlankLine(text, idx)) continue;
    const rest = text.slice(idx + '[still_running]'.length);
    if (/^\[/m.test(rest)) continue; // another section starts immediately — nothing here
    const body = rest.trim();
    if (!isRunningSection(body)) continue;
    runningCount = fieldNumber(body, 'active_background_tasks');
    runningSamples = runningSamplesOf(body, runningCount);
  }

  return {
    status,
    waitedMs: Number.isFinite(waitedMs) ? waitedMs : 0,
    taskId,
    finishedStatus: finishedSection === undefined ? undefined : field(finishedSection, 'status'),
    finishedDescription:
      finishedSection === undefined ? undefined : field(finishedSection, 'description'),
    extraCount,
    runningCount,
    runningSamples,
  };
}