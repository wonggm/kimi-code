// apps/kimi-web/src/bench/scenarios.ts
// The four bench scenarios. Each receives the BenchContext (reactive state +
// DOM handles exposed by BenchView) and drives the REAL components: deltas go
// through messagesToTurns → ChatPane/Markdown; overlays mount the real Dialog/
// Sheet/BottomSheet/SettingsDialog/ServerAuthDialog; the dock and TOC are the
// real ChatDock/ConversationToc. Sampling is owned by the caller's Sampler.

import type { AppMessage } from '../api/types';
import {
  buildLongConversation,
  chunkTokens,
  streamingMarkdown,
  streamingSeed,
  STREAMING_ASSISTANT_ID,
} from './fixtures';
import { setPhase, waitForStop } from './sampler';
import type { BenchContext, DockPanel, ScenarioName, ScenarioRunner, Theme } from './types';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** rAF-driven scrollTop animation (deterministic; repaints the blur band). */
function animateScroll(ctx: BenchContext, dir: 'down' | 'up', durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    const el = ctx.scroller();
    if (!el) {
      resolve();
      return;
    }
    const start = el.scrollTop;
    const end = dir === 'down' ? el.scrollHeight - el.clientHeight : 0;
    const t0 = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - t0) / durationMs);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      el.scrollTop = start + (end - start) * eased;
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

function setAssistantText(ctx: BenchContext, text: string): void {
  const next: AppMessage[] = ctx.messages.value.map((m) =>
    m.id === STREAMING_ASSISTANT_ID ? { ...m, content: [{ type: 'text', text }] } : m,
  );
  ctx.messages.value = next;
}

// ---------------------------------------------------------------------------
// 1. streaming-replay
// ---------------------------------------------------------------------------
// ~2000-token KaTeX + code fixture replayed as token deltas at ~40 tok/s
// through the real pipeline, auto-follow scroll, glass on, dark theme.

const STREAM_TOKENS_PER_SEC = 40;

async function streamingReplay(ctx: BenchContext): Promise<void> {
  ctx.setTheme('dark');
  ctx.setGlass(true);
  ctx.messages.value = streamingSeed();
  ctx.turnActive.value = true;
  await ctx.settle(400); // let the seed + chrome paint before sampling

  const chunks = chunkTokens(streamingMarkdown());
  ctx.sampler.start();
  const intervalMs = 1000 / STREAM_TOKENS_PER_SEC;
  let acc = '';
  for (const chunk of chunks) {
    acc += chunk;
    setAssistantText(ctx, acc);
    ctx.followScroll();
    await delay(intervalMs);
  }
  ctx.turnActive.value = false;
  await ctx.settle(600); // let the final KaTeX/shiki render land
  ctx.sampler.stop();
}

// ---------------------------------------------------------------------------
// 2. scroll-long
// ---------------------------------------------------------------------------
// 500-turn conversation; programmatic smooth scroll top→bottom→top across the
// glass on/off × dark/light matrix (four combos, sampled in one run).

async function scrollLong(ctx: BenchContext): Promise<void> {
  ctx.messages.value = buildLongConversation(500);
  ctx.turnActive.value = false;
  await ctx.settle(600); // render all 500 turns before sampling

  const combos: Array<[Theme, boolean]> = [
    ['dark', true],
    ['dark', false],
    ['light', true],
    ['light', false],
  ];
  ctx.sampler.start();
  for (const [theme, glass] of combos) {
    ctx.setTheme(theme);
    ctx.setGlass(glass);
    await ctx.settle(350); // let the theme/glass restyle paint
    await animateScroll(ctx, 'down', 3000);
    await animateScroll(ctx, 'up', 3000);
  }
  ctx.sampler.stop();
}

// ---------------------------------------------------------------------------
// 3. dialog-storm
// ---------------------------------------------------------------------------
// SettingsDialog (with MenuSelect), Dialog, Sheet, BottomSheet, ServerAuthDialog
// — 20 open/close cycles over a populated conversation, glass on, dark.

type OverlayKind = 'settings' | 'dialog' | 'sheet' | 'bottomSheet' | 'serverAuth';

const OVERLAY_ORDER: OverlayKind[] = ['settings', 'dialog', 'sheet', 'bottomSheet', 'serverAuth'];

function setOverlay(ctx: BenchContext, kind: OverlayKind, open: boolean): void {
  switch (kind) {
    case 'settings':
      ctx.settingsOpen.value = open;
      break;
    case 'dialog':
      ctx.dialogOpen.value = open;
      break;
    case 'sheet':
      ctx.sheetOpen.value = open;
      break;
    case 'bottomSheet':
      ctx.bottomSheetOpen.value = open;
      break;
    case 'serverAuth':
      ctx.serverAuthOpen.value = open;
      break;
  }
}

async function dialogStorm(ctx: BenchContext): Promise<void> {
  ctx.setTheme('dark');
  ctx.setGlass(true);
  ctx.messages.value = buildLongConversation(40); // populated backdrop
  await ctx.settle(500);

  ctx.sampler.start();
  const cycles = 20;
  for (let i = 0; i < cycles; i++) {
    const kind = OVERLAY_ORDER[i % OVERLAY_ORDER.length]!;
    setOverlay(ctx, kind, true);
    await ctx.settle(240); // entrance animation + backdrop-filter blur paint
    setOverlay(ctx, kind, false);
    await ctx.settle(140);
  }
  ctx.sampler.stop();
}

// ---------------------------------------------------------------------------
// 4. dock-toc
// ---------------------------------------------------------------------------
// ChatDock work-panel open/close (JS-driven) + ConversationToc hover-expand.
// The TOC expand is a pure-CSS :hover, so that half is driver-assisted: the
// page runs the dock cycles, signals phase 'toc', then keeps sampling until the
// driver sweeps a real mouse over the rail and sets window.__benchStop.

async function dockToc(ctx: BenchContext): Promise<void> {
  ctx.setTheme('dark');
  ctx.setGlass(true);
  ctx.messages.value = buildLongConversation(60);
  await ctx.settle(500);

  ctx.sampler.start();
  const panels: Exclude<DockPanel, null>[] = ['bash', 'subagent', 'todos'];
  for (let i = 0; i < 12; i++) {
    ctx.dockPanel.value = panels[i % panels.length]!;
    await ctx.settle(180);
    ctx.dockPanel.value = null;
    await ctx.settle(120);
  }

  // Hand off to the driver for real-mouse TOC hover-expand cycles.
  setPhase('toc');
  await waitForStop();
  await ctx.settle(200);
  ctx.sampler.stop();
}

export const scenarios: Record<ScenarioName, ScenarioRunner> = {
  'streaming-replay': streamingReplay,
  'scroll-long': scrollLong,
  'dialog-storm': dialogStorm,
  'dock-toc': dockToc,
};

export const scenarioNames = Object.keys(scenarios) as ScenarioName[];
