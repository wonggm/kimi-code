// apps/kimi-web/src/lib/mentionTokens.ts
// Mention tokens in Chat: @-mentioned files, folders and skills travel inside
// the plain prompt text as markdown-style links `[name](path)` (the form the
// composer inserts and the daemon records verbatim). This module owns both
// directions:
//   - tokenizeMentions(): split raw message text into text/mention segments;
//   - mentionToText(): serialize a mention back into the inline link form.
//
// The grammar mirrors upstream (`kimi-code://skill/…` skill dests, trailing
// `/`/`\` folder dests, Windows drive letters not treated as URI schemes), so
// messages written by the upstream web UI parse identically here.

export type MentionKind = 'file' | 'folder' | 'skill' | 'attachment' | 'browser';

export interface MentionTextSegment {
  kind: 'text';
  value: string;
}

export interface MentionFileSegment {
  kind: 'file';
  name: string;
  path: string;
}

export interface MentionFolderSegment {
  kind: 'folder';
  name: string;
  path: string;
}

export interface MentionSkillSegment {
  kind: 'skill';
  name: string;
  path: string;
}

/** An image/video attachment mentioned in the prompt text. `path` holds the
 *  full destination (the attachment's identity, not a file path). */
export interface MentionAttachmentSegment {
  kind: 'attachment';
  name: string;
  path: string;
}

/** An element or region captured from a page, mentioned in the prompt text.
 *  `path` holds the reference id the capture is looked up by. */
export interface MentionBrowserSegment {
  kind: 'browser';
  name: string;
  path: string;
}

export type MentionSegment =
  | MentionTextSegment
  | MentionFileSegment
  | MentionFolderSegment
  | MentionSkillSegment
  | MentionAttachmentSegment
  | MentionBrowserSegment;

/** An insertable mention (menu pick, pasted folder, or a media attachment). */
export type MentionInsert =
  | { kind: 'file'; name: string; path: string }
  | { kind: 'folder'; name: string; path: string }
  | { kind: 'skill'; name: string; path: '' }
  | { kind: 'attachment'; name: string; id: string }
  | { kind: 'browser'; name: string; id: string };

export const SKILL_DEST_PREFIX = 'kimi-code://skill/';
export const ATTACHMENT_DEST_PREFIX = 'kimi-code-composer://attachments/';
export const BROWSER_REFERENCE_DEST_PREFIX = 'kimi-code-composer://browser-references/';

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

// Two shapes: `[label](<angle … destination allowed>)` and `[label](plain)`.
// The plain destination cannot contain spaces, parentheses or angle brackets.
const MENTION_LINK_RE = /\[([^[\]]*)\]\(<([^<>]*)>\)|\[([^[\]]*)\]\(([^()\s]*)\)/g;
const WINDOWS_DRIVE_DEST_RE = /^[a-zA-Z]:(?:[\\/]|%5c)/i;
const SCHEME_DEST_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

function decodeLinkLabel(raw: string): string {
  return raw
    .replaceAll(/\\([\\[\]])/g, '$1')
    .replaceAll('%0A', ' ')
    .replaceAll('%0D', '\r')
    .replaceAll('%26', '&')
    .replaceAll('%3C', '<')
    .replaceAll('%3E', '>')
    .replaceAll('%25', '%');
}

function decodeLinkDest(raw: string, angleWrapped: boolean): string {
  const unwrapped = angleWrapped
    ? raw.replaceAll(/\\([\\<>])/g, '$1')
    : raw.replaceAll(/\\([\\()])/g, '$1');
  try {
    return decodeURIComponent(unwrapped);
  } catch {
    return unwrapped;
  }
}

/**
 * Classify a link destination as a mention kind, or null when the destination
 * is not a file/folder/skill reference (URI schemes, fragments, queries,
 * protocol-relative URLs). Windows drive paths (C:\…, C:/…) stay file
 * candidates even though they carry a `letter:` prefix.
 */
export function mentionKindForDest(dest: string): MentionKind | null {
  if (!dest) return null;
  if (dest.startsWith(SKILL_DEST_PREFIX) && dest.length > SKILL_DEST_PREFIX.length) {
    return 'skill';
  }
  if (dest.startsWith(ATTACHMENT_DEST_PREFIX) && dest.length > ATTACHMENT_DEST_PREFIX.length) {
    return 'attachment';
  }
  if (dest.startsWith(BROWSER_REFERENCE_DEST_PREFIX) && dest.length > BROWSER_REFERENCE_DEST_PREFIX.length) {
    return 'browser';
  }
  if (dest.startsWith('#') || dest.startsWith('?') || dest.startsWith('//')) return null;
  if (SCHEME_DEST_RE.test(dest) && !WINDOWS_DRIVE_DEST_RE.test(dest)) return null;
  return /[/\\]$/.test(dest) || /%5c$/i.test(dest) ? 'folder' : 'file';
}

function skillNameFromDest(dest: string): string {
  const raw = dest.slice(SKILL_DEST_PREFIX.length);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Tokenize raw message text into text runs and mention segments. A mention is
 * a markdown-style link `[label](destination)` whose destination classifies as
 * a file/folder/skill/attachment reference; anything else (including ordinary
 * web links) stays a plain text run.
 */
export function tokenizeMentions(text: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  MENTION_LINK_RE.lastIndex = 0;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION_LINK_RE.exec(text)) !== null) {
    const rawLabel = match[1] ?? match[3];
    const rawDest = match[2] ?? match[4];
    const angleWrapped = match[2] !== undefined;
    if (rawLabel === undefined || rawDest === undefined) continue;
    if (rawLabel === '' || rawDest === '') continue;
    const kind = mentionKindForDest(rawDest);
    if (kind === null) continue;
    const start = match.index;
    if (start > cursor) {
      segments.push({ kind: 'text', value: text.slice(cursor, start) });
    }
    if (kind === 'skill') {
      segments.push({ kind, name: skillNameFromDest(rawDest), path: '' });
    } else {
      segments.push({
        kind,
        name: decodeLinkLabel(rawLabel),
        path: decodeLinkDest(rawDest, angleWrapped),
      });
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) {
    segments.push({ kind: 'text', value: text.slice(cursor) });
  }
  return segments;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

function escapeLinkLabel(name: string): string {
  return name
    .replaceAll('%', '%25')
    .replaceAll('&', '%26')
    .replaceAll('<', '%3C')
    .replaceAll('>', '%3E')
    .replaceAll(/([[\]])/g, '\\$1')
    .replaceAll('\n', '%0A')
    .replaceAll('\r', '%0D');
}

/** Percent-encode each path segment so separators stay readable in the link. */
export function encodeMentionDest(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

/** Serialize a mention into the inline `[name](dest)` text form. */
export function mentionToText(mention: MentionInsert): string {
  const label = escapeLinkLabel(mention.name);
  if (mention.kind === 'skill') {
    return `[${label}](${SKILL_DEST_PREFIX}${encodeURIComponent(mention.name)})`;
  }
  if (mention.kind === 'attachment') {
    return `[${label}](${ATTACHMENT_DEST_PREFIX}${encodeURIComponent(mention.id)})`;
  }
  if (mention.kind === 'browser') {
    return `[${label}](${BROWSER_REFERENCE_DEST_PREFIX}${encodeURIComponent(mention.id)})`;
  }
  const path =
    mention.kind === 'folder' && !/[/\\]$/.test(mention.path)
      ? `${mention.path}/`
      : mention.path;
  return `[${label}](${encodeMentionDest(path)})`;
}