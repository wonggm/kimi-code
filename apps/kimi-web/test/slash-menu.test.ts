import { describe, expect, it } from 'vitest';
import { nextTick, ref, type Ref } from 'vue';
import type { AppSkill } from '../src/api/types';
import { useSlashMenu } from '../src/composables/useSlashMenu';

// Public slash-menu contract: matching built-ins (by name, description text,
// pinyin, pinyin initials), highlight ranges, and dispatching selected
// commands without coupling tests to component internals.

interface MockTextarea {
  value: string;
  selectionStart: number;
  setSelectionRange: (start: number, end: number) => void;
  focus: () => void;
}

function setup(initialText = '', skills: AppSkill[] = [], resolveDesc?: (name: string) => string) {
  const textarea: MockTextarea = {
    value: initialText,
    selectionStart: 0,
    setSelectionRange(start: number) {
      this.selectionStart = start;
    },
    focus: () => {},
  };
  const text = ref(initialText);
  const textareaRef = ref(textarea as unknown as HTMLTextAreaElement) as Ref<HTMLTextAreaElement | null>;
  const emitted: string[] = [];
  const pushed: string[] = [];
  const slash = useSlashMenu({
    text,
    textareaRef,
    autosize: () => {},
    skills: () => skills,
    emitCommand: (cmd) => emitted.push(cmd),
    historyPush: (entry) => pushed.push(entry),
    resolveDesc: resolveDesc ? (item) => resolveDesc(item.name) : undefined,
  });
  return { text, textarea, emitted, pushed, slash };
}

describe('useSlashMenu — update', () => {
  it('stays closed for empty text', () => {
    const { slash } = setup('');
    slash.update();
    expect(slash.open.value).toBe(false);
  });

  it('opens and lists commands for a lone slash', () => {
    const { slash } = setup('/');
    slash.update();
    expect(slash.open.value).toBe(true);
    expect(slash.items.value.length).toBeGreaterThan(0);
    expect(slash.active.value).toBe(0);
  });

  it('filters to matching commands', () => {
    const { slash } = setup('/com');
    slash.update();
    expect(slash.open.value).toBe(true);
    expect(slash.items.value.map((i) => i.name)).toContain('/compact');
  });

  it('offers the /reload command for a reload prefix', () => {
    const { slash } = setup('/rel');
    slash.update();
    expect(slash.items.value.map((i) => i.name)).toContain('/reload');
  });

  it('offers the /add-dir command for an add-dir prefix', () => {
    const { slash } = setup('/add-d');
    slash.update();
    expect(slash.items.value.map((i) => i.name)).toContain('/add-dir');
  });

  it('/add-dir accepts input so the user can type the path', () => {
    const { slash } = setup('/add-d');
    slash.update();
    const item = slash.items.value.find((i) => i.name === '/add-dir');
    expect(item?.acceptsInput).toBe(true);
  });

  it('offers the session export command for an export prefix', () => {
    const { slash } = setup('/exp');
    slash.update();
    expect(slash.items.value.map((item) => item.name)).toContain('/export');
  });

  it('stays open with an empty list when nothing matches', () => {
    const { slash } = setup('/zzzznotacommand');
    slash.update();
    // A bare slash token keeps the menu up so it can show the "no commands"
    // empty state; only a non-slash token or an explicit close dismisses it.
    expect(slash.open.value).toBe(true);
    expect(slash.items.value).toEqual([]);
  });

  it('close() dismisses the menu', () => {
    const { slash } = setup('/com');
    slash.update();
    expect(slash.open.value).toBe(true);
    slash.close();
    expect(slash.open.value).toBe(false);
  });

  it('closes once the token contains a space', () => {
    const { slash } = setup('/goal some task');
    slash.update();
    expect(slash.open.value).toBe(false);
  });

  it('closes for text that does not start with a slash', () => {
    const { slash } = setup('hello');
    slash.update();
    expect(slash.open.value).toBe(false);
  });

  it('includes session skills as /skill:<skill-name>', () => {
    const { slash } = setup('/', [{ name: 'deploy', description: 'deploy stuff', source: 'project', path: '/skills/deploy/SKILL.md' } as AppSkill]);
    slash.update();
    const names = slash.items.value.map((i) => i.name);
    expect(names).toContain('/skill:deploy');
  });

  it('keeps builtin-sourced skills unprefixed', () => {
    const { slash } = setup('/', [{ name: 'update-config', description: 'edit config', source: 'builtin', path: '/skills/update-config/SKILL.md' } as AppSkill]);
    slash.update();
    const names = slash.items.value.map((i) => i.name);
    expect(names).toContain('/update-config');
    expect(names).not.toContain('/skill:update-config');
  });

  it('matches a prefixed skill when filtering by its bare name', () => {
    const { slash } = setup('/depl', [{ name: 'deploy', description: 'deploy stuff', source: 'project', path: '/skills/deploy/SKILL.md' } as AppSkill]);
    slash.update();
    expect(slash.items.value.map((i) => i.name)).toContain('/skill:deploy');
  });
});

const ZH_DESC: Record<string, string> = {
  '/new': '创建新会话',
  '/clear': '清空并新建会话',
  '/plan': '切换计划模式 开/关',
  '/export': '将当前会话和排障日志下载为 ZIP 压缩包',
};
const zhDesc = (name: string): string => ZH_DESC[name] ?? '';

describe('useSlashMenu — fuzzy description / pinyin search', () => {
  it('finds a command by a substring of its localized description text', () => {
    const { slash } = setup('/会话', [], zhDesc);
    slash.update();
    expect(slash.items.value.map((i) => i.name)).toContain('/new');
    expect(slash.items.value.map((i) => i.name)).toContain('/clear');
  });

  it('finds a command by full pinyin of its description', () => {
    const { slash } = setup('/chuangjianxinhuihua', [], zhDesc);
    slash.update();
    expect(slash.items.value.map((i) => i.name)).toEqual(['/new']);
  });

  it('finds a command by pinyin initials of its description', () => {
    const { slash } = setup('/qhjhmskg', [], zhDesc);
    slash.update();
    expect(slash.items.value.map((i) => i.name)).toEqual(['/plan']);
  });

  it('a pinyin query outranks a same-length description match', () => {
    const { slash } = setup('/plan', [], zhDesc);
    slash.update();
    const names = slash.items.value.map((i) => i.name);
    expect(names[0]).toBe('/plan'); // exact name match first
  });

  it('carries highlight ranges for name and description matches', () => {
    const { slash } = setup('/com', [], zhDesc);
    slash.update();
    const index = slash.items.value.findIndex((i) => i.name === '/compact');
    expect(index).toBeGreaterThanOrEqual(0);
    const range = slash.ranges.value[index]!;
    // Name "/compact" → stripped "compact", "com" matched at offset 0.
    expect(range.name?.[0]).toEqual([0, 3]);
  });

  it('carries highlighted hanzi ranges for a pinyin match', () => {
    const { slash } = setup('/chuangjian', [], zhDesc);
    slash.update();
    expect(slash.ranges.value[0]?.desc?.[0]).toEqual([0, 2]); // 创建
  });
});

describe('useSlashMenu — select', () => {
  it('non-acceptsInput: clears text, pushes history, emits the command', () => {
    const { text, emitted, pushed, slash } = setup('/new');
    slash.select({ name: '/new', desc: '' });
    expect(text.value).toBe('');
    expect(pushed).toEqual(['/new']);
    expect(emitted).toEqual(['/new']);
    expect(slash.open.value).toBe(false);
  });

  it('acceptsInput: keeps the command in the box and does not emit yet', async () => {
    const { text, emitted, pushed, slash } = setup('/goal');
    slash.select({ name: '/goal', desc: '', acceptsInput: true });
    expect(text.value).toBe('/goal ');
    expect(emitted).toEqual([]);
    expect(pushed).toEqual([]);
    expect(slash.open.value).toBe(false);
    await nextTick();
  });
});
