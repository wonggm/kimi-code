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