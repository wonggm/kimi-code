// apps/kimi-web/src/lib/slashFuzzy.ts
// Pure TS — no Vue, no side effects. Self-contained fuzzy matching for slash
// commands: commands are found by name, by their (localized) description text,
// or by the pinyin / pinyin initials of a Chinese description. Kept dependency-
// free — the hanzi→pinyin map below covers the characters used by the zh
// command descriptions (plus a small common set); characters outside it fall
// back to plain substring matching, so ASCII descriptions and skill names keep
// working without the map.
//
// Matches carry highlight ranges: [start, end) offsets INTO the original
// command name / description text, so the menu can bold the matched fragment.

/** A half-open [start, end) offset range into some string. */
export type OffsetRange = [number, number];

/** Per-item highlight ranges. `name` indexes into the command name (without
 *  the leading `/`), `desc` into the resolved description text. */
export interface SlashMatchRanges {
  name?: OffsetRange[];
  desc?: OffsetRange[];
}

/** A command + the ranges to highlight for the current query. */
export interface SlashMatch<T> {
  item: T;
  ranges: SlashMatchRanges;
}

// ---------------------------------------------------------------------------
// hanzi → tone-less pinyin (full syllable + first letter)
// ---------------------------------------------------------------------------

/** Full syllable per hanzi. Covers every character in the zh command
 *  descriptions so pinyin search works for the built-in menu. */
const HANZI_PINYIN: Readonly<Record<string, string>> = {
  创: 'chuang', 建: 'jian', 新: 'xin', 会: 'hui', 话: 'hua',
  清: 'qing', 空: 'kong', 并: 'bing',
  在: 'zai', 浏: 'liu', 览: 'lan', 器: 'qi', 中: 'zhong', 登: 'deng', 录: 'lu',
  切: 'qie', 换: 'huan', 计: 'ji', 划: 'hua', 模: 'mo', 式: 'shi',
  开: 'kai', 关: 'guan',
  任: 'ren', 务: 'wu', 直: 'zhi', 接: 'jie', 下: 'xia', 执: 'zhi', 行: 'xing',
  控: 'kong', 制: 'zhi', 目: 'mu', 标: 'biao',
  侧: 'ce', 边: 'bian', 聊: 'liao', 天: 'tian', 问: 'wen', 题: 'ti',
  向: 'xiang', 的: 'de', 提: 'ti',
  自: 'zi', 动: 'dong', 批: 'pi', 准: 'zhun', 工: 'gong', 具: 'ju',
  操: 'cao', 作: 'zuo', 仍: 'reng', 可: 'ke', 能: 'neng',
  完: 'wan', 全: 'quan', 主: 'zhu', 不: 'bu', 再: 'zai',
  设: 'she', 置: 'zhi', 思: 'si', 考: 'kao', 强: 'qiang', 度: 'du',
  压: 'ya', 缩: 'suo', 历: 'li', 史: 'shi',
  把: 'ba', 当: 'dang', 前: 'qian', 出: 'chu', 一: 'yi', 个: 'ge',
  将: 'jiang', 和: 'he', 排: 'pai', 障: 'zhang', 日: 'ri', 志: 'zhi',
  载: 'zai', 为: 'wei', 包: 'bao', 含: 'han',
  查: 'cha', 看: 'kan', 状: 'zhuang', 态: 'tai',
  撤: 'che', 销: 'xiao', 上: 'shang', 条: 'tiao', 消: 'xiao', 息: 'xi',
  重: 'chong', 加: 'jia', 配: 'pei', 插: 'cha', 件: 'jian', 启: 'qi',
  添: 'tian',
};

interface PinyinSegment {
  /** The syllable (hanzi) or literal run (ASCII etc.), normalized to
   *  lowercase — matches the normalized query. */
  text: string;
  /** Offset in the ORIGINAL text where this segment starts. */
  charIndex: number;
  /** Length of the segment in the ORIGINAL text (1 for hanzi, run length
   *  for literals). */
  textLen: number;
}

export interface PinyinInfo {
  segments: PinyinSegment[];
  /** Concatenated syllables / literals — no separators, lowercase. */
  full: string;
  /** First letter of each hanzi syllable, literals kept verbatim. */
  first: string;
}

/**
 * Split text into pinyin segments. Hanzi map to their tone-less syllable;
 * whitespace and punctuation are skipped; runs of ASCII letters/digits become
 * literal segments (kept verbatim, so ASCII descriptions and command args
 * still match by plain substring). Skipping punctuation ("开/关" → kai guan)
 * keeps full-pinyin and initials matching contiguous.
 */
export function hanziPinyin(text: string): PinyinInfo {
  const segments: PinyinSegment[] = [];
  const fullParts: string[] = [];
  const firstParts: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    const syllable = HANZI_PINYIN[ch];
    if (syllable !== undefined) {
      segments.push({ text: syllable, charIndex: i, textLen: 1 });
      fullParts.push(syllable);
      firstParts.push(syllable[0]!);
      i++;
      continue;
    }
    if (!/[a-z0-9]/i.test(ch)) {
      i++;
      continue;
    }
    let j = i;
    while (j < text.length && /[a-z0-9]/i.test(text[j]!)) j++;
    const literal = text.slice(i, j).toLowerCase();
    segments.push({ text: literal, charIndex: i, textLen: j - i });
    fullParts.push(literal);
    firstParts.push(literal);
    i = j;
  }
  return { segments, full: fullParts.join(''), first: firstParts.join('') };
}

/** Map a [start, end) range in a pinyin string back to a range in the ORIGINAL
 *  text, via the segment table. Returns [0, 0] when the range falls outside
 *  every segment (should not happen for ranges produced by this module). */
export function pinyinRangeToTextRange(
  info: PinyinInfo,
  start: number,
  end: number,
): OffsetRange {
  let segStart = -1;
  let segEnd = -1;
  let acc = 0;
  for (let k = 0; k < info.segments.length; k++) {
    const seg = info.segments[k]!;
    const segStartPos = acc;
    const segEndPos = acc + seg.text.length;
    if (segStart === -1 && segEndPos > start) segStart = k;
    if (segStart !== -1 && segStartPos < end) segEnd = k;
    acc = segEndPos;
  }
  if (segStart === -1 || segEnd === -1) return [0, 0];
  const last = info.segments[segEnd]!;
  return [info.segments[segStart]!.charIndex, last.charIndex + last.textLen];
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

function stripSpaces(s: string): string {
  return s.replace(/\s+/g, '');
}

/** First [start, end) of `needle` in `haystack` (case-insensitive, ignoring
 *  whitespace in both), or null. */
function findSubstring(haystack: string, needle: string): OffsetRange | null {
  const h = stripSpaces(haystack).toLowerCase();
  const n = stripSpaces(needle).toLowerCase();
  if (n === '') return null;
  const idx = h.indexOf(n);
  if (idx === -1) return null;
  // Map back to offsets in the whitespace-preserving haystack: find the
  // position of the (idx + 1)-th non-space character…
  let start = -1;
  let seen = 0;
  for (let i = 0; i < haystack.length; i++) {
    if (/\s/.test(haystack[i]!)) continue;
    if (seen === idx) {
      start = i;
      break;
    }
    seen++;
  }
  if (start === -1) return null;
  // …then walk n.length non-space characters from there for the end offset.
  let end = start;
  let matched = 0;
  for (let i = start; i < haystack.length && matched < n.length; i++) {
    if (/\s/.test(haystack[i]!)) continue;
    matched++;
    end = i + 1;
  }
  return [start, end];
}

export interface NameMatch {
  rank: number; // 0 exact, 1 prefix, 2 substring
}

/** Score the command NAME against the query (without leading `/`). */
export function matchName(name: string, query: string): NameMatch | null {
  const n = name.toLowerCase().replace(/^\//, '');
  const q = query.toLowerCase().replace(/^\//, '');
  if (q === '') return null;
  if (n === q) return { rank: 0 };
  if (n.startsWith(q)) return { rank: 1 };
  if (n.includes(q)) return { rank: 2 };
  return null;
}

export interface DescMatch {
  /** Highlight range in the description text, when a contiguous match exists. */
  range: OffsetRange | null;
}

/**
 * Match the query against a description (resolved localized text). Tries, in
 * order: plain substring → pinyin full-string substring → pinyin initials
 * substring. A plain-text match wins (takes precedence for highlighting);
 * otherwise the pinyin matches highlight the corresponding hanzi range.
 */
export function matchDescription(query: string, desc: string, info: PinyinInfo): DescMatch | null {
  const q = stripSpaces(query).toLowerCase();
  if (q === '') return null;
  // Plain description text first — a CJK or literal query matches characters
  // as written, with the exact range for highlighting.
  const rawRange = findSubstring(desc, q);
  if (rawRange !== null) return { range: rawRange };
  const literal = findSubstring(info.full, q);
  if (literal !== null) {
    const range = pinyinRangeToTextRange(info, literal[0], literal[1]);
    return { range: range[1] > range[0] ? range : null };
  }
  const firstIdx = info.first.indexOf(q);
  if (firstIdx !== -1) {
    const range = pinyinRangeToTextRange(info, firstIdx, firstIdx + q.length);
    return { range: range[1] > range[0] ? range : null };
  }
  return null;
}

export interface SlashFilterItem {
  /** Command name, e.g. `/compact` or `/skill:deploy`. */
  name: string;
  /** Resolved description text (localized). */
  desc: string;
}

export interface SlashFilterScore {
  /** Sorting rank: 0 exact name, 1 name prefix, 2 name substring / desc or
   *  pinyin match. */
  rank: number;
  /** Higher is better within a rank. */
  points: number;
  /** Original list index — tie-breaker to keep a stable order. */
  index: number;
}

/**
 * Filter + rank an item list for a slash-command query. `query` keeps an
 * optional leading `/`. Returns matches with highlight ranges; an empty query
 * returns every item with no ranges.
 */
export function filterSlashFuzzy<T extends SlashFilterItem>(
  query: string,
  items: readonly T[],
): Array<{ item: T; ranges: SlashMatchRanges; score: SlashFilterScore }> {
  const q = query.trim().replace(/^\//, '');
  if (q === '') {
    return items.map((item, index) => ({
      item,
      ranges: {},
      score: { rank: 0, points: 0, index },
    }));
  }

  const out: Array<{ item: T; ranges: SlashMatchRanges; score: SlashFilterScore }> = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index]!;
    const nameMatch = matchName(item.name, q);
    if (nameMatch !== null) {
      const nameQ = q.toLowerCase().replace(/^\//, '');
      const nameN = item.name.toLowerCase().replace(/^\//, '');
      const idx = nameN.indexOf(nameQ);
      const ranges: SlashMatchRanges =
        idx !== -1 ? { name: [[idx, idx + nameQ.length]] } : {};
      out.push({
        item,
        ranges,
        score: {
          rank: nameMatch.rank,
          points: 3 - nameMatch.rank, // 3 / 2 / 1
          index,
        },
      });
      continue;
    }

    const descMatch = matchDescription(q, item.desc, hanziPinyin(item.desc));
    if (descMatch === null) continue;
    out.push({
      item,
      ranges: descMatch.range ? { desc: [descMatch.range] } : {},
      score: { rank: 2, points: 1, index },
    });
  }

  out.sort((a, b) => {
    if (a.score.rank !== b.score.rank) return a.score.rank - b.score.rank;
    if (a.score.points !== b.score.points) return b.score.points - a.score.points;
    return a.score.index - b.score.index;
  });
  return out;
}