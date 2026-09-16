export interface FilePathLink {
  path: string;
  line?: number;
}

export interface FilePathLinkMatch extends FilePathLink {
  start: number;
  end: number;
  text: string;
}

export interface FindFilePathLinksOptions {
  aliases?: ReadonlyMap<string, string>;
}

const COMMON_FILE_EXTENSIONS = [
  'cjs',
  'css',
  'csv',
  'gif',
  'htm',
  'html',
  'jpeg',
  'jpg',
  'js',
  'json',
  'jsx',
  'log',
  'md',
  'mjs',
  'pdf',
  'png',
  'scss',
  'svg',
  'ts',
  'tsx',
  'txt',
  'vue',
  'webp',
  'xml',
  'yaml',
  'yml',
];

const COMMON_FILENAMES = new Set([
  'AGENTS.md',
  'CHANGELOG.md',
  'Dockerfile',
  'LICENSE',
  'Makefile',
  'README.md',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.json',
  'vite.config.ts',
]);

const EXT_PATTERN = [...COMMON_FILE_EXTENSIONS]
  .toSorted((a, b) => b.length - a.length)
  .join('|');
const PATH_RE = new RegExp(
  [
    String.raw`(?:^|[\s([{"'` + '`' + String.raw`])`,
    String.raw`(`,
    String.raw`(?:~|\.{1,2}|/)?(?:[A-Za-z0-9_.@+()[\]-]+/)+[A-Za-z0-9_.@+()[\]-]+(?:\.(?:${EXT_PATTERN}))?`,
    String.raw`|`,
    String.raw`[A-Za-z0-9_.@+()[\]-]+\.(?:${EXT_PATTERN})`,
    String.raw`)`,
    String.raw`(?:#L?(\d+)|:(\d+))?`,
    String.raw`(?=$|[\s)"'\]}>.,;!?，。；！？）])`,
  ].join(''),
  'iy',
);

const TRAILING_PUNCTUATION_RE = /[),.;!?，。；！？）]+$/;

/** A path-shaped token with no extension requirement and no ambiguity. The
 *  main pattern is sticky, so it can only run where one of these tokens starts —
 *  scanning the whole text with it is quadratic on bracket-heavy input. */
const PATH_TOKEN_RE = /~?\/?[A-Za-z0-9_.@+()[\]-]+(?:\/[A-Za-z0-9_.@+()[\]-]+)*/g;

/** The character the main pattern allows before a path. */
const PATH_PREFIX_RE = /[\s([{"'`]/;

function hasCommonFileExtension(path: string): boolean {
  const lower = path.toLowerCase();
  return COMMON_FILE_EXTENSIONS.some((ext) => lower.endsWith(`.${ext}`));
}

export function collectFilePathAliases(text: string): Map<string, string> {
  const aliases = new Map<string, string>();
  const attrPathRe = new RegExp(
    String.raw`\b(?:path|src)=["'](\/[^"']+\.(?:${EXT_PATTERN}))["']`,
    'gi',
  );
  let match: RegExpExecArray | null;
  while ((match = attrPathRe.exec(text)) !== null) {
    const absolutePath = match[1];
    if (!absolutePath) continue;
    const basename = absolutePath.split('/').pop();
    if (basename) aliases.set(basename, absolutePath);
  }
  return aliases;
}

export function parseFilePathLinkCandidate(
  text: string,
  options: FindFilePathLinksOptions = {},
): FilePathLink | null {
  const trimmed = text.trim();
  if (!trimmed || /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return null;

  const match = trimmed.match(/^(.*?)(?:#L?(\d+)|:(\d+))?$/i);
  if (!match) return null;
  let path = (match[1] ?? '').replace(TRAILING_PUNCTUATION_RE, '');
  if (!path) return null;

  const basename = path.split('/').pop() ?? path;
  const hasSeparator = path.includes('/');
  const hasKnownName = COMMON_FILENAMES.has(basename);
  const hasKnownExtension = hasCommonFileExtension(basename);
  if (hasSeparator && !hasKnownName && !hasKnownExtension) return null;
  if (!hasSeparator && !hasKnownName) {
    const alias = options.aliases?.get(basename);
    if (!alias) return null;
    path = alias;
  }

  const lineRaw = match[2] ?? match[3];
  const line = lineRaw ? Number(lineRaw) : undefined;
  return {
    path,
    line: line !== undefined && Number.isFinite(line) && line > 0 ? line : undefined,
  };
}

export function findFilePathLinks(
  text: string,
  options: FindFilePathLinksOptions = {},
): FilePathLinkMatch[] {
  const out: FilePathLinkMatch[] = [];
  let consumed = 0;
  for (const token of text.matchAll(PATH_TOKEN_RE)) {
    const tokenStart = token.index ?? 0;
    const from = Math.max(tokenStart, consumed);
    if (from >= tokenStart + token[0].length) continue;
    if (from === 0 || PATH_PREFIX_RE.test(text[from - 1] ?? '')) {
      PATH_RE.lastIndex = Math.max(0, from - 1);
    } else {
      const offset = token[0].slice(from - tokenStart).search(/[([]/);
      if (offset === -1) continue;
      PATH_RE.lastIndex = from + offset;
    }
    const match = PATH_RE.exec(text);
    if (match === null) continue;
    consumed = PATH_RE.lastIndex;

    const full = match[0] ?? '';
    const rawPath = match[1] ?? '';
    const prefixLength = full.indexOf(rawPath);
    if (prefixLength < 0) continue;

    const lineSuffix = match[2] ?? match[3];
    const linkText = (
      rawPath + (lineSuffix ? full.slice(prefixLength + rawPath.length) : '')
    ).replace(TRAILING_PUNCTUATION_RE, '');

    const parsed = parseFilePathLinkCandidate(linkText, options);
    if (!parsed) continue;

    const start = match.index + prefixLength;
    out.push({
      ...parsed,
      start,
      end: start + linkText.length,
      text: linkText,
    });
  }
  return out;
}
