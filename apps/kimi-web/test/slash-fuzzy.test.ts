import { describe, expect, it } from 'vitest';
import {
  hanziPinyin,
  filterSlashFuzzy,
  matchName,
  pinyinRangeToTextRange,
} from '../src/lib/slashFuzzy';
import { filterSlashCommands, SLASH_COMMANDS } from '../src/lib/slashCommands';

interface Item {
  name: string;
  desc: string;
}

const ITEMS: Item[] = [
  { name: '/new', desc: '创建新会话' },
  { name: '/plan', desc: '切换计划模式 开/关' },
  { name: '/export', desc: '将当前会话和排障日志下载为 ZIP 压缩包' },
  { name: '/deploy', desc: '部署到生产环境' },
];

describe('hanziPinyin', () => {
  it('maps hanzi to tone-less syllables and initials', () => {
    const info = hanziPinyin('创建新会话');
    expect(info.full).toBe('chuangjianxinhuihua');
    expect(info.first).toBe('cjxhh');
    expect(info.segments.map((s) => s.text)).toEqual(['chuang', 'jian', 'xin', 'hui', 'hua']);
    expect(info.segments.map((s) => s.charIndex)).toEqual([0, 1, 2, 3, 4]);
  });

  it('keeps non-hanzi runs as literal segments', () => {
    const info = hanziPinyin('下载为 ZIP 包');
    expect(info.full).toContain('zip');
    // 下(0) 载(1) 为(2) " zip "(skip spaces) 包(7)
    expect(info.segments.map((s) => s.text)).toEqual(['xia', 'zai', 'wei', 'zip', 'bao']);
  });

  it('skips characters outside the map (no pinyin, no ASCII)', () => {
    const info = hanziPinyin('鲧禹');
    expect(info.full).toBe('');
    expect(info.segments).toEqual([]);
  });
});

describe('pinyinRangeToTextRange', () => {
  it('maps a syllable range back to original char offsets', () => {
    const info = hanziPinyin('创建新会话');
    // "chuangjian" covers 创 (0-6) + 建 (6-10)
    expect(pinyinRangeToTextRange(info, 0, 10)).toEqual([0, 2]);
    // "jianxin" covers 建 (6-10) + 新 (10-13)
    expect(pinyinRangeToTextRange(info, 6, 13)).toEqual([1, 3]);
  });
});

describe('matchName', () => {
  it('ranks exact, prefix, then substring', () => {
    expect(matchName('/new', '/new')?.rank).toBe(0);
    expect(matchName('/new', '/ne')?.rank).toBe(1);
    expect(matchName('/skill:deploy', '/depl')?.rank).toBe(2);
    expect(matchName('/new', '/zzz')).toBeNull();
  });
});

describe('filterSlashFuzzy — self-contained pinyin search', () => {
  it('returns everything for an empty query', () => {
    const matches = filterSlashFuzzy('', ITEMS);
    expect(matches.map((m) => m.item.name)).toEqual(['/new', '/plan', '/export', '/deploy']);
  });

  it('matches by full pinyin of the description', () => {
    const matches = filterSlashFuzzy('/chuangjianxinhuihua', ITEMS);
    expect(matches.map((m) => m.item.name)).toEqual(['/new']);
  });

  it('matches by pinyin initials of the description', () => {
    const matches = filterSlashFuzzy('/qhjhmskg', ITEMS);
    expect(matches.map((m) => m.item.name)).toEqual(['/plan']);
  });

  it('matches by literal CJK in the description', () => {
    const matches = filterSlashFuzzy('/会话', ITEMS);
    expect(matches.map((m) => m.item.name)).toContain('/new');
  });

  it('matches by ASCII text inside the description', () => {
    const matches = filterSlashFuzzy('/zip', ITEMS);
    expect(matches.map((m) => m.item.name)).toEqual(['/export']);
  });

  it('matches by plain description text for unknown hanzi', () => {
    const matches = filterSlashFuzzy('/生产', ITEMS);
    expect(matches.map((m) => m.item.name)).toEqual(['/deploy']);
  });

  it('provides highlight ranges for pinyin matches', () => {
    const matches = filterSlashFuzzy('/chuangjian', ITEMS);
    const m = matches.find((x) => x.item.name === '/new')!;
    expect(m.ranges.desc?.[0]).toEqual([0, 2]);
  });

  it('ranks name prefix matches above description matches', () => {
    const matches = filterSlashFuzzy('/plan', ITEMS);
    expect(matches.map((m) => m.item.name)).toEqual(['/plan']);
  });

  it('filters nothing when there is no match', () => {
    expect(filterSlashFuzzy('/qqqqqq', ITEMS)).toEqual([]);
  });
});

describe('filterSlashCommands — wiring', () => {
  it('strips ranges for the plain filterCommands view', () => {
    // Like production, the resolver turns the i18n key into localized text;
    // pinyin search then matches that text, and the returned item is the
    // original SLASH_COMMANDS entry.
    const resolveLocalized = (item: { name: string; desc: string }): string =>
      item.name === '/new' ? '创建新会话' : item.desc;
    const items = filterSlashCommands('/chuangjianxinhuihua', SLASH_COMMANDS, resolveLocalized);
    expect(items.map((m) => m.item.name)).toContain('/new');
  });

  it('matches built-in names without a resolver', () => {
    const items = filterSlashCommands('/compact', SLASH_COMMANDS);
    expect(items.map((m) => m.item.name)).toEqual(['/compact']);
  });
});