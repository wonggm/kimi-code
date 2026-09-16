// apps/kimi-web/src/lib/frontmatter.ts
// YAML frontmatter extraction for chat messages. A message that starts with a
// `---`-fenced YAML block (an opening `---` on line 1 and a later `---` closing
// line) gets that block split off from the body so the UI can render it as a
// small meta block instead of feeding it to the markdown parser — where the
// bare `key: value` lines would render as a giant heading.

export interface ExtractedFrontmatter {
  /** Raw YAML content between the fences (including its trailing newline), or null when the source has no leading frontmatter block. */
  frontmatter: string | null;
  /** The remainder of the source after the closing fence (the full source when there is no frontmatter block). */
  body: string;
}

// Opening fence: line 1 must be `---` (trailing horizontal whitespace allowed)
// followed by a newline. `^` anchors on the start of the source, so a `---`
// later in the message is never treated as frontmatter.
const OPEN_FENCE_RE = /^---[ \t]*(?:\r\n|\n)/;
// Closing fence: a line that is exactly `---` (trailing whitespace allowed).
const CLOSE_FENCE_RE = /^---[ \t]*$/;

/** One entry of a frontmatter block, with its value already turned into display text. */
export interface FrontmatterEntry {
  key: string;
  /** The value as written (an em dash stands for an empty or null value), or the item texts of an array value. */
  value: string;
  /** Item texts when the value is a non-empty array of scalars, otherwise null. */
  tags: string[] | null;
}

export function extractFrontmatter(src: string): ExtractedFrontmatter {
  const open = OPEN_FENCE_RE.exec(src);
  if (open === null) return { frontmatter: null, body: src };
  let lineStart = open[0].length;
  const contentStart = lineStart;
  for (;;) {
    let lineEnd = src.indexOf('\n', lineStart);
    if (lineEnd === -1) lineEnd = src.length;
    let line = src.slice(lineStart, lineEnd);
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (CLOSE_FENCE_RE.test(line)) {
      const frontmatter = src.slice(contentStart, lineStart);
      // An empty block (`---\n---`) conveys no metadata — leave the whole
      // source as body rather than showing an empty meta block.
      if (frontmatter === '') return { frontmatter: null, body: src };
      const body = lineEnd < src.length ? src.slice(lineEnd + 1) : '';
      return { frontmatter, body };
    }
    // No closing fence before the end of the source → not a frontmatter block.
    if (lineEnd === src.length) break;
    lineStart = lineEnd + 1;
  }
  return { frontmatter: null, body: src };
}

// ---------------------------------------------------------------------------
// Frontmatter block → entries for the metadata card.
//
// Only the shape a message header actually uses is understood: a flat block map
// of scalar keys whose values are scalars or arrays of scalars, within 64 KiB.
// Anything else — nested maps, block scalars, anchors, aliases, tags, quoted
// keys, indented continuations — returns null so the caller can show the raw
// block instead of dropping information.
// ---------------------------------------------------------------------------

const MAX_BLOCK_LENGTH = 65536;
const EMPTY_VALUE = '—';

// `key:` or `key: value`. The key must start with an ASCII letter, digit or
// underscore and must not contain a YAML indicator character, and the colon must
// be followed by whitespace or end the line — so a sequence item (`- x`), a
// quoted key, or the plain scalar `key:value` is not mistaken for an entry.
const ENTRY_RE = /^([A-Za-z0-9_][^:#"'[\]{}&*!|>%@`,]*?):(?:[ \t]+(.*))?$/;
// A block-sequence item: `- value`, at any indentation.
const SEQUENCE_ITEM_RE = /^[ \t]*-[ \t]+(.*)$/;
// Values starting with one of these characters are not plain scalars.
const NON_SCALAR_START_RE = /^[&*!|>%@`[{]/;
// A plain scalar cannot contain `: `; such a value is a nested map.
const NESTED_MAP_RE = /:[ \t]/;
const NULL_SCALAR_RE = /^(?:~|null|Null|NULL)$/;

export function parseFrontmatterEntries(source: string): FrontmatterEntry[] | null {
  if (source.length > MAX_BLOCK_LENGTH) return null;
  const lines = source.split(/\r\n|\n|\r/);
  const entries: FrontmatterEntry[] = [];
  // A repeated key keeps its first position and its last value, like a YAML map.
  const positions = new Map<string, number>();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    i += 1;
    // Blank lines and whole-line comments carry no entry.
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    // An indented line belongs to something we do not model (a nested map, a
    // block scalar, a wrapped value), so the whole block goes to the caller.
    if (/^[ \t]/.test(line)) return null;
    const entry = ENTRY_RE.exec(line);
    if (entry === null) return null;
    const key = entry[1]!.trim();
    const text = (entry[2] ?? '').trim();
    let value = text === '' ? EMPTY_VALUE : text;
    let tags: string[] | null = null;
    if (text === '') {
      // `key:` with nothing after it can open a block sequence. The item lines
      // are consumed here so the entry loop never sees them.
      while (i < lines.length) {
        const item = SEQUENCE_ITEM_RE.exec(lines[i]!);
        if (item === null) break;
        const itemText = scalarText(item[1] ?? '');
        if (itemText === null) return null;
        tags ??= [];
        tags.push(itemText);
        i += 1;
      }
      if (tags !== null) value = tags.join(', ');
    } else if (text.startsWith('[')) {
      const items = parseFlowSequence(text);
      if (items === null) return null;
      if (items.length > 0) {
        tags = items;
        value = items.join(', ');
      }
    } else {
      const scalar = scalarText(text);
      if (scalar === null) return null;
      value = scalar;
    }
    const at = positions.get(key);
    if (at === undefined) {
      positions.set(key, entries.length);
      entries.push({ key, value, tags });
    } else {
      entries[at] = { key, value, tags };
    }
  }
  return entries.length === 0 ? null : entries;
}

// The items of an inline `[a, b]` sequence, or null when it is not a sequence of
// scalars we understand.
function parseFlowSequence(text: string): string[] | null {
  if (!text.endsWith(']')) return null;
  const inner = text.slice(1, -1).trim();
  if (inner === '') return [];
  const parts = splitFlowItems(inner);
  if (parts === null) return null;
  const items: string[] = [];
  for (const part of parts) {
    const item = scalarText(part);
    if (item === null) return null;
    items.push(item);
  }
  return items;
}

// Split a flow sequence body on the commas that sit outside quotes.
function splitFlowItems(inner: string): string[] | null {
  const items: string[] = [];
  let current = '';
  let quote = '';
  for (const char of inner) {
    if (quote !== '') {
      current += char;
      if (char === quote) quote = '';
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === ',') {
      items.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (quote !== '') return null;
  items.push(current);
  return items;
}

// The display text of one scalar: the text as written, an em dash for an empty
// or null value, or null when the token is not a scalar we understand.
function scalarText(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '' || NULL_SCALAR_RE.test(trimmed)) return EMPTY_VALUE;
  if (trimmed.startsWith("'") || trimmed.startsWith('"')) return unquote(trimmed);
  if (NON_SCALAR_START_RE.test(trimmed) || NESTED_MAP_RE.test(trimmed)) return null;
  return trimmed;
}

// The inner text of a quoted scalar, or null when the quotes do not close on the
// same line or the text relies on an escape we do not expand.
function unquote(text: string): string | null {
  const quote = text[0];
  if (text.length < 2 || text.at(-1) !== quote) return null;
  const inner = text.slice(1, -1);
  if (quote === "'") return inner.replaceAll(/''/g, "'");
  if (/\\[^"\\]/.test(inner)) return null;
  return inner.replaceAll(/\\"/g, '"').replaceAll(/\\\\/g, '\\');
}