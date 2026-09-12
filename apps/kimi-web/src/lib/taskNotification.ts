// apps/kimi-web/src/lib/taskNotification.ts
// Parse the `<notification>` payload a background task completion injects as a
// user message (packages/agent-core-v2 .../task/taskService.ts + notificationXml.ts).
// The tag carries identity attributes, `Title:`/`Severity:` header lines, a
// body, and an `<output-file>` or `<output-preview>` child block. The body's
// boilerplate first line is split into status / description / reason (see
// parseTaskNotificationBody) so the card can render one clean body line.
// Defensive: never throws.

export interface TaskNotificationFile {
  path: string;
  bytes?: number;
}

export interface TaskNotificationPreview {
  text: string;
  bytes?: number;
  totalBytes?: number;
  truncated?: boolean;
}

export interface TaskNotification {
  id?: string;
  category?: string;
  /** e.g. `task.completed`. */
  type?: string;
  sourceKind?: string;
  sourceId?: string;
  agentId?: string;
  title?: string;
  severity?: string;
  body?: string;
  outputFile?: TaskNotificationFile;
  outputPreview?: TaskNotificationPreview;
}

/** The engine's boilerplate first body line, split into its parts: `<description>
 *  <status>.` with an optional `Reason: …`, or `<description> was stopped
 *  (by user).`, or the `<description> <status>: <detail>.` question form. */
export interface TaskNotificationBody {
  /** Raw status token: completed | failed | timed_out | killed | lost. */
  status: string;
  description: string;
  reason?: string;
  /** Everything after the first body line (e.g. the subagent recovery hint). */
  rest?: string;
  userStopped?: boolean;
}

const NOTIFICATION_RE = /<notification\b([^>]*)>([\s\S]*?)<\/notification>/;
const ATTR_RE = /([\w-]+)="([^"]*)"/g;
const TITLE_RE = /^Title: (.*)$/m;
const SEVERITY_RE = /^Severity: (.*)$/m;
const OUTPUT_FILE_RE = /<output-file\b([^>]*)>[\s\S]*?<\/output-file>/;
const OUTPUT_PREVIEW_RE = /<output-preview\b([^>]*)>([\s\S]*?)<\/output-preview>/;

function unescape(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(raw)) !== null) {
    attrs[m[1]!] = unescape(m[2]!);
  }
  return attrs;
}

function numAttr(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseOutputFile(raw: string | undefined): TaskNotificationFile | undefined {
  const m = OUTPUT_FILE_RE.exec(raw ?? '');
  if (m === null) return undefined;
  const attrs = parseAttrs(m[1] ?? '');
  const path = attrs['path'];
  if (path === undefined || path === '') return undefined;
  return { path, bytes: numAttr(attrs['bytes']) };
}

function parseOutputPreview(raw: string | undefined): TaskNotificationPreview | undefined {
  const m = OUTPUT_PREVIEW_RE.exec(raw ?? '');
  if (m === null) return undefined;
  const attrs = parseAttrs(m[1] ?? '');
  const content = (m[2] ?? '').replace(/^\n/, '');
  // The block's first line is a header (e.g. "Showing the last N bytes …");
  // the preview text is everything after it.
  const newline = content.indexOf('\n');
  const text = unescape(newline === -1 ? '' : content.slice(newline + 1)).replace(/\n$/, '');
  const truncatedFlag = attrs['truncated'];
  return {
    text,
    bytes: numAttr(attrs['bytes']),
    totalBytes: numAttr(attrs['total_bytes']),
    truncated: truncatedFlag === 'true' ? true : truncatedFlag === 'false' ? false : undefined,
  };
}

export function parseTaskNotification(
  text: string | string[] | undefined | null,
): TaskNotification | null {
  if (text === undefined || text === null) return null;
  const joined = Array.isArray(text) ? text.join('\n') : text;
  const m = NOTIFICATION_RE.exec(joined);
  if (m === null) return null;

  const attrs = parseAttrs(m[1] ?? '');
  const inner = m[2] ?? '';
  const title = unescape(TITLE_RE.exec(inner)?.[1]?.trim() ?? '');
  const severity = unescape(SEVERITY_RE.exec(inner)?.[1]?.trim() ?? '');
  let body = inner
    .split('\n')
    .filter((line) => !line.startsWith('Title: ') && !line.startsWith('Severity: '))
    .join('\n');
  const firstTag = body.search(/^<\w/m);
  if (firstTag !== -1) body = body.slice(0, firstTag);
  body = unescape(body.trim());

  return {
    id: attrs['id'] ?? '',
    category: attrs['category'] ?? '',
    type: attrs['type'] ?? '',
    sourceKind: attrs['source_kind'] ?? '',
    sourceId: attrs['source_id'] ?? '',
    agentId: attrs['agent_id'],
    title,
    severity,
    body,
    outputFile: parseOutputFile(inner),
    outputPreview: parseOutputPreview(inner),
  };
}

/** The task status carried by the notification `type` (e.g. `task.completed`),
 *  or `info` when the type names no known terminal status. */
export function taskStatusFromType(type: string | undefined): string {
  for (const key of ['completed', 'failed', 'timed_out', 'killed', 'lost']) {
    if (type?.endsWith(`.${key}`)) return key;
  }
  return 'info';
}

const BOILERPLATE_TITLE_RE = /^Background (?:process|agent) (completed|failed|timed[_ ]out|killed|lost)$/i;
const DONE_BODY_RE = /^(.+?) (completed|failed|timed out|lost)\.(?: Reason: ([\s\S]+))?$/;
const STOPPED_BODY_RE = /^(.+?) was stopped( by user)?\.(?: Reason: ([\s\S]+))?$/;
const QUESTION_BODY_RE = /^(.+?) (completed|failed|timed out|lost|was killed): ([\s\S]+)\.$/;

/** Whether `title` is the engine's `<kind> <status>` boilerplate (rather than a
 *  meaning-carrying title such as a background-question outcome). */
export function isBackgroundTaskTitle(title: string | undefined): boolean {
  return BOILERPLATE_TITLE_RE.test((title ?? '').trim());
}

function normalizeStatus(raw: string): string {
  if (raw === 'timed out') return 'timed_out';
  if (raw === 'was killed') return 'killed';
  return raw;
}

/** Split the engine's first body line into status / description / reason, and
 *  return the remaining lines as `rest`. Returns null when the body is not the
 *  boilerplate `<description> <status>.` shape. */
export function parseTaskNotificationBody(body: string | undefined): TaskNotificationBody | null {
  const raw = body ?? '';
  const newline = raw.indexOf('\n');
  const first = (newline === -1 ? raw : raw.slice(0, newline)).trim();
  const tail = newline === -1 ? '' : raw.slice(newline + 1).trim();
  const rest = tail === '' ? undefined : tail;

  const done = DONE_BODY_RE.exec(first);
  if (done?.[1] !== undefined && done[2] !== undefined) {
    const description = done[1] === 'Background process' || done[1] === 'Background agent' ? '' : done[1];
    return { status: normalizeStatus(done[2]), description, reason: done[3], rest };
  }
  const stopped = STOPPED_BODY_RE.exec(first);
  if (stopped?.[1] !== undefined) {
    const description = stopped[1] === 'Background process' || stopped[1] === 'Background agent' ? '' : stopped[1];
    return { status: 'killed', description, reason: stopped[3], rest, userStopped: stopped[2] !== undefined };
  }
  const question = QUESTION_BODY_RE.exec(first);
  if (question?.[1] !== undefined && question[2] !== undefined) {
    const description = question[1] === 'Background process' || question[1] === 'Background agent' ? '' : question[1];
    return { status: normalizeStatus(question[2]), description, reason: question[3], rest };
  }
  return null;
}