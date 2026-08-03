// apps/kimi-web/bench/scenes.mjs
// Pixel-capture scene definitions, shared by capture.mjs (render) and diff.mjs
// (compare). Each scene navigates to a static BenchView pose (`scene=`), then
// optionally drives a real input interaction (hover/click/type) to reach an
// open state that pure CSS/JS can't be posed from the page side. Captures run
// with `prefers-reduced-motion: reduce` emulated so poses are deterministic.

import { sleep } from './util.mjs';

export const SCENES = [
  {
    name: 'conversation-math-code-dark',
    query: 'scene=conversation&theme=dark&glass=on',
  },
  {
    name: 'conversation-math-code-light',
    query: 'scene=conversation&theme=light&glass=on',
  },
  {
    name: 'conversation-glassoff-dark',
    query: 'scene=conversation&theme=dark&glass=off',
  },
  {
    name: 'settings-dialog',
    query: 'scene=settings&theme=dark&glass=on',
  },
  {
    name: 'slash-menu',
    query: 'scene=composer&theme=dark&glass=on',
    settleMs: 500,
    interact: async (cdp) => {
      await cdp.typeInto('.composer-card textarea', '/');
    },
  },
  {
    name: 'model-dropdown',
    query: 'scene=composer&theme=dark&glass=on',
    settleMs: 500,
    interact: async (cdp) => {
      const pill = await cdp.elementCenter('.model-pill');
      if (!pill) throw new Error('model pill not found (is `status` passed to the dock?)');
      await cdp.click(pill.x, pill.y);
    },
  },
  {
    name: 'toast-tooltip',
    query: 'scene=toast-tooltip&theme=dark&glass=on',
    settleMs: 500,
    interact: async (cdp) => {
      // Push warnings late so the 6s auto-dismiss timer starts just before the
      // screenshot, not before the render-settle wait.
      await cdp.evaluate(`window.__benchPushWarnings([
        { severity: 'warning', title: 'Bench warning', message: 'Toast stack over the conversation.' },
        { severity: 'info', title: 'Info notice', message: 'A second, calmer notice.' }
      ])`);
      await sleep(200); // let the TransitionGroup enter animation play
      const trigger = await cdp.elementCenter('[data-bench="tooltip-trigger"]');
      if (!trigger) throw new Error('tooltip trigger not found');
      await cdp.mouseMove(trigger.x, trigger.y); // Tooltip opens after a 150ms delay
    },
  },
  {
    name: 'toc-expanded',
    query: 'scene=conversation&theme=dark&glass=on',
    settleMs: 600,
    interact: async (cdp) => {
      const rail = await cdp.elementCenter('.conversation-toc');
      if (!rail) throw new Error('conversation TOC rail not found');
      await cdp.mouseMove(rail.x, rail.y); // pure-CSS :hover expands the labels
      await sleep(300);
    },
  },
];

export const SCENE_NAMES = SCENES.map((s) => s.name);
