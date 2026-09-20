import chalk from 'chalk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FooterComponent } from '#/tui/components/chrome/footer';
import { setRainbowDance, type RainbowDanceController } from '#/tui/easter-eggs/dance';
import { currentTheme, darkColors, lightColors } from '#/tui/theme';
import type { ModelAlias } from '@moonshot-ai/kimi-code-sdk';
import type { AppState } from '#/tui/types';

const TRUECOLOR_PATTERN = /\[38;2;(\d+);(\d+);(\d+)m/g;

function truecolorCodes(text: string): Set<string> {
  const codes = new Set<string>();
  for (const match of text.matchAll(TRUECOLOR_PATTERN)) {
    codes.add(`${match[1]},${match[2]},${match[3]}`);
  }
  return codes;
}

// Dark dance colors the footer never uses outside of /dance.
const RAINBOW_CYAN = '91,192,190';
const RAINBOW_GREEN = '78,200,126';

function setDanceView(colored: boolean, phase: number): void {
  const dance: RainbowDanceController = {
    colored,
    phase,
    start: () => {},
    stop: () => {},
    dispose: () => {},
  };
  setRainbowDance(dance);
}

const appState: AppState = {
  version: '1.2.3',
  workDir: '/tmp/project',
  additionalDirs: [],
  sessionId: 'ses-1',
  sessionTitle: null,
  model: 'kimi-k2',
  permissionMode: 'manual',
  thinkingEffort: 'off',
  contextUsage: 0,
  contextTokens: 0,
  maxContextTokens: 0,
  cache: { reporting: 'none' },
  isCompacting: false,
  isReplaying: false,
  streamingPhase: 'idle',
  streamingStartTime: 0,
  stepRetry: null,
  planMode: false,
  inputMode: 'prompt',
  swarmMode: false,
  towerMode: false,
  theme: 'dark',
  editorCommand: null,
  notifications: { enabled: true, condition: 'unfocused' },
  upgrade: { autoInstall: true },
  availableModels: {},
  availableProviders: {},
  mcpServersSummary: null,
};

describe('FooterComponent', () => {
  const previousChalkLevel = chalk.level;

  beforeEach(() => {
    chalk.level = 3;
  });

  afterEach(() => {
    chalk.level = previousChalkLevel;
    setRainbowDance(undefined);
  });

  it('paints the model name in rainbow while colored', () => {
    setDanceView(true, 0);
    const footer = new FooterComponent(appState);

    const codes = truecolorCodes(footer.render(120).join('\n'));

    // "kimi-k2" spreads across the palette, pulling in colors the footer
    // never renders on its own.
    expect(codes.has(RAINBOW_CYAN)).toBe(true);
    expect(codes.has(RAINBOW_GREEN)).toBe(true);
  });

  it('renders the model name in its normal color when not dancing', () => {
    const footer = new FooterComponent(appState);

    const codes = truecolorCodes(footer.render(120).join('\n'));

    expect(codes.has(RAINBOW_CYAN)).toBe(false);
    expect(codes.has(RAINBOW_GREEN)).toBe(false);
  });

  it('repaints from the active palette on the next render (no setColors needed)', () => {
    const footer = new FooterComponent(appState);
    const before = footer.render(120).join('\n');

    currentTheme.setPalette(lightColors);
    try {
      const after = footer.render(120).join('\n');
      // Reads currentTheme live, so a palette swap changes the emitted colours.
      expect(after).not.toBe(before);
    } finally {
      currentTheme.setPalette(darkColors);
    }
  });

  it('shows the effort for an effort-capable model', () => {
    const effortModel: ModelAlias = {
      provider: 'managed:kimi-code',
      model: 'kimi-k2',
      maxContextSize: 262144,
      supportEfforts: ['low', 'high', 'max'],
      defaultEffort: 'high',
    };
    const state: AppState = {
      ...appState,
      thinkingEffort: 'max',
      availableModels: { 'kimi-k2': effortModel },
    };
    const footer = new FooterComponent(state);

    expect(footer.render(120).join('\n')).toContain('thinking: max');
  });

  it('does not show the effort for a legacy boolean model', () => {
    const plainModel: ModelAlias = {
      provider: 'managed:kimi-code',
      model: 'kimi-k2',
      maxContextSize: 262144,
      capabilities: ['thinking'],
    };
    const state: AppState = {
      ...appState,
      thinkingEffort: 'high',
      availableModels: { 'kimi-k2': plainModel },
    };
    const footer = new FooterComponent(state);
    const rendered = footer.render(120).join('\n');

    expect(rendered).toContain('thinking');
    expect(rendered).not.toContain('thinking:high');
  });

  it('shows the tower mode chip only when tower mode is on', () => {
    const on = new FooterComponent({ ...appState, towerMode: true });
    expect(on.render(120).join('\n')).toContain('tower');

    const off = new FooterComponent(appState);
    expect(off.render(120).join('\n')).not.toContain('tower');
  });
});

describe('FooterComponent overrides', () => {
  it('shows the overridden effort list', () => {
    const effortModelWithOverride: ModelAlias = {
      provider: 'managed:kimi-code',
      model: 'kimi-k2',
      maxContextSize: 262144,
      supportEfforts: ['low', 'high', 'max'],
      defaultEffort: 'max',
      overrides: { supportEfforts: ['low', 'high'], defaultEffort: 'high' },
    };
    const state: AppState = {
      ...appState,
      thinkingEffort: 'high',
      availableModels: { 'kimi-k2': effortModelWithOverride },
    };
    const footer = new FooterComponent(state);

    expect(footer.render(120).join('\n')).toContain('thinking: high');
  });
});

describe('FooterComponent displayName override', () => {
  it('renders the overridden display name', () => {
    const state: AppState = {
      ...appState,
      model: 'kimi-k2',
      availableModels: {
        'kimi-k2': {
          provider: 'managed:kimi-code',
          model: 'kimi-k2',
          maxContextSize: 262144,
          displayName: 'Remote Name',
          overrides: { displayName: 'Custom Name' },
        },
      },
    };
    const footer = new FooterComponent(state);

    expect(footer.render(120).join('\n')).toContain('Custom Name');
    expect(footer.render(120).join('\n')).not.toContain('Remote Name');
  });
});

describe('FooterComponent line-2 hints', () => {
  function stripAnsi(text: string): string {
    return text.replaceAll(/\[[0-9;]*m/g, '');
  }

  it('shows the warning hint on line 2', () => {
    const footer = new FooterComponent(appState);
    footer.setWarningHint('Goal objective is too long');

    const line2 = stripAnsi(footer.render(120)[1] ?? '');

    expect(line2).toContain('Goal objective is too long');
  });

  it('gives the transient hint precedence, then restores the warning hint', () => {
    const footer = new FooterComponent(appState);
    footer.setWarningHint('Goal objective is too long');

    footer.setTransientHint('Press Ctrl+C again to exit');
    expect(stripAnsi(footer.render(120)[1] ?? '')).toContain('Press Ctrl+C again to exit');
    expect(stripAnsi(footer.render(120)[1] ?? '')).not.toContain('Goal objective is too long');

    footer.setTransientHint(null);
    expect(stripAnsi(footer.render(120)[1] ?? '')).toContain('Goal objective is too long');
  });

  it('clears the warning hint with null', () => {
    const footer = new FooterComponent(appState);
    footer.setWarningHint('Goal objective is too long');
    footer.setWarningHint(null);

    expect(stripAnsi(footer.render(120)[1] ?? '')).not.toContain('Goal objective is too long');
  });
});

describe('FooterComponent ctrl+o hint', () => {
  function plain(text: string): string {
    return text.replaceAll(/\[[0-9;]*m/g, '');
  }
  function line1(footer: FooterComponent, width = 160): string {
    return plain(footer.render(width)[0] ?? '');
  }

  it('shows no hint while there is no tool output to toggle', () => {
    const footer = new FooterComponent(appState);
    footer.setExpandHintProvider(() => null);
    expect(line1(footer)).not.toContain('ctrl+o');
    footer.dispose();
  });

  it('offers expand while collapsed output exists and collapse once it is shown', () => {
    const footer = new FooterComponent(appState);
    let hint: 'expand' | 'collapse' | null = 'expand';
    footer.setExpandHintProvider(() => hint);
    expect(line1(footer)).toContain('ctrl+o expand');
    hint = 'collapse';
    expect(line1(footer)).toContain('ctrl+o collapse');
    footer.dispose();
  });

  it('keeps the hint and drops the rotating tip when only one of them fits', () => {
    // Same left-hand slots without the tips: measures the space the hint competes for.
    const noTips = new FooterComponent({
      ...appState,
      statusLine: { items: ['mode', 'model', 'cwd'], command: null },
    });
    const leftWidth = plain(noTips.render(200)[0] ?? '').trimEnd().length;
    noTips.dispose();

    const footer = new FooterComponent(appState);
    footer.setExpandHintProvider(() => 'expand');
    const narrow = line1(footer, leftWidth + 2 + 'ctrl+o expand'.length);
    expect(narrow.endsWith('ctrl+o expand')).toBe(true);
    expect(narrow).not.toContain(' | ');
    footer.dispose();
  });
});

describe('FooterComponent ctrl+o hint with a status_line command', () => {
  it('moves the hint to line 2 when a command owns line 1', async () => {
    const footer = new FooterComponent({
      ...appState,
      statusLine: { items: null, command: 'printf "my-custom-status"' },
    });
    footer.setExpandHintProvider(() => 'expand');
    footer.render(120);
    await new Promise((resolve) => setTimeout(resolve, 200));

    const [line1, line2] = footer.render(120).map((line) => line.replaceAll(/\[[0-9;]*m/g, ''));
    expect(line1).toContain('my-custom-status');
    expect(line1).not.toContain('ctrl+o');
    expect(line2).toContain('ctrl+o expand');
    expect(line2).toContain('context:');
    footer.dispose();
  });

  const plainLines = (footer: FooterComponent): string[] =>
    footer.render(120).map((line) => line.replaceAll(/\[[0-9;]*m/g, ''));

  /** Truecolor is what the colour assertions read, and chalk drops to a lower
   *  level inside this file's later blocks unless it is set here. At truecolor
   *  level the escape sequences are real, so the plain-text assertions need the
   *  leading ESC in the pattern — `plainLines` above assumes it is absent. */
  function withTruecolor(run: () => void): void {
    const previous = chalk.level;
    chalk.level = 3;
    try {
      run();
    } finally {
      chalk.level = previous;
    }
  }

  function stripAnsi(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replaceAll(/\u001B\[[0-9;]*m/g, '');
  }

  it('shows the cache rate in two decimals', () => {
    const footer = new FooterComponent({
      ...appState,
      cache: { reporting: 'reads+writes', lastRequestPercent: 61.87, sessionPercent: 72.14 },
    });

    expect(plainLines(footer)[1]).toContain('cache: 61.87%');
    footer.dispose();
  });

  it('shows a genuine zero rather than hiding it', () => {
    const footer = new FooterComponent({
      ...appState,
      cache: { reporting: 'reads+writes', lastRequestPercent: 0, sessionPercent: 0 },
    });

    expect(plainLines(footer)[1]).toContain('cache: 0.00%');
    footer.dispose();
  });

  it('omits the cache clause when the provider reports no cache', () => {
    const footer = new FooterComponent({
      ...appState,
      cache: { reporting: 'none' },
    });

    const line2 = plainLines(footer)[1]!;
    expect(line2).toContain('context:');
    expect(line2).not.toContain('cache');
    footer.dispose();
  });

  it('falls back to the session rate when no request has been scored yet', () => {
    const footer = new FooterComponent({
      ...appState,
      cache: { reporting: 'reads', sessionPercent: 41.5 },
    });

    expect(plainLines(footer)[1]).toContain('cache: 41.50%');
    footer.dispose();
  });

  it('shows the rolling window rather than the last request', () => {
    const footer = new FooterComponent({
      ...appState,
      cache: {
        reporting: 'reads+writes',
        lastRequestPercent: 99.92,
        recentPercent: 88.41,
        recentRequestCount: 20,
        sessionPercent: 99.13,
      },
    });

    withTruecolor(() => {
      const line2 = footer.render(120)[1]!;
      expect(stripAnsi(line2)).toContain('cache: 88.41%');
      expect(stripAnsi(line2)).not.toContain('cache: 99.92');
      expect(truecolorCodes(line2).has('136,136,136')).toBe(true);
    });
    footer.dispose();
  });

  it('paints the rolling window in the warning colour below the mid band', () => {
    const footer = new FooterComponent({
      ...appState,
      cache: {
        reporting: 'reads+writes',
        lastRequestPercent: 99.92,
        recentPercent: 61.5,
        recentRequestCount: 20,
        sessionPercent: 99.13,
      },
    });

    withTruecolor(() => {
      const line2 = footer.render(120)[1]!;
      expect(stripAnsi(line2)).toContain('cache: 61.50%');
      expect(truecolorCodes(line2).has('232,168,56')).toBe(true);
    });
    footer.dispose();
  });

  it('leaves a healthy rolling window in the text colour', () => {
    const footer = new FooterComponent({
      ...appState,
      cache: {
        reporting: 'reads+writes',
        lastRequestPercent: 99.92,
        recentPercent: 99.5,
        recentRequestCount: 20,
        sessionPercent: 99.13,
      },
    });

    withTruecolor(() => {
      const line2 = footer.render(120)[1]!;
      expect(stripAnsi(line2)).toContain('cache: 99.50%');
      expect(stripAnsi(line2)).not.toContain('avg');
      expect(truecolorCodes(line2).has('136,136,136')).toBe(false);
    });
    footer.dispose();
  });
});

describe('FooterComponent ctrl+o hint beside an inline tips slot', () => {
  function plain(text: string): string {
    return text.replaceAll(/\[[0-9;]*m/g, '');
  }

  it('drops the inline tip when the hint would not fit beside it', () => {
    const noTips = new FooterComponent({
      ...appState,
      statusLine: { items: ['mode', 'model', 'cwd'], command: null },
    });
    const leftWidth = plain(noTips.render(200)[0] ?? '').trimEnd().length;
    noTips.dispose();

    const footer = new FooterComponent({
      ...appState,
      statusLine: { items: ['mode', 'tips', 'model', 'cwd'], command: null },
    });
    footer.setExpandHintProvider(() => 'expand');
    const width = leftWidth + 2 + 'ctrl+o expand'.length;
    const line1 = plain(footer.render(width)[0] ?? '');
    expect(line1.endsWith('ctrl+o expand')).toBe(true);
    expect(line1.length).toBeLessThanOrEqual(width);
    footer.dispose();
  });
});
