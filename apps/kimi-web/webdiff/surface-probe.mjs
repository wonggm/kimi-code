// apps/kimi-web/webdiff/surface-probe.mjs
//
// Dedicated capture for the transcript/composer surfaces the walk's hover+click
// discovery cannot reach on its own:
//
//   1. the question card        (a pending interaction, not a control)
//   2. the approval card        (same)
//   3. the comment / add-to-chat selection float card, which needs a real
//      text-selection gesture rather than a click
//   4. the mention pills in the quoted user turn (the @-mention + attachment
//      inline-link form the composer writes)
//
// It reuses capture.mjs's `openSurface` rather than reimplementing boot, so the
// splash drop, the settle and the session open are the same code the walk runs
// (a hand-rolled boot is how a probe reads an empty page and calls it a gap).

import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, connectPage, killChrome } from '../bench/cdp.mjs';
import { openSurface, buildSeed, BOOT_KEYS } from './capture.mjs';

const APPS = [
  { name: 'upstream', port: 5399 },
  { name: 'fork', port: 5400 },
];
const OUT = process.argv[2] || '.tmp/wd-surfaces';
const VIEWPORT = { width: 1440, height: 900 };

// The question and approval cards live in their OWN sessions in the mock (they
// are pending interactions, not part of the main transcript), so each surface
// names the session it has to open. Opening the main session and looking for
// them reads as "neither app has it", which is a gap in the probe, not a
// difference between the apps.
const SESSIONS = {
  main: 'Code block header probe',
  question: 'Pending question (mock)',
  approval: 'Pending approval (mock)',
};

const PROPS = [
  'display', 'position', 'background-color', 'background-image', 'color',
  'border-radius', 'border', 'box-shadow', 'backdrop-filter', 'padding',
  'margin', 'font-size', 'font-weight', 'line-height', 'gap', 'opacity',
  'z-index', 'width', 'height', 'max-width', 'text-align', 'cursor',
];

const openSession = (key) => ({ action: 'clickText', text: SESSIONS[key], ms: 1200 });

async function shotElement(page, selector, file, pad = 16) {
  const box = await page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`);
  if (!box) return { ok: false };

  // Read the DOM record BEFORE the screenshot. Both apps dismiss these surfaces
  // on their own (the fork's bubble closes on any scroll or outside click), and
  // a capture round-trip is long enough for that to happen — screenshotting
  // first yields a PNG of a surface whose markup is already gone, so the
  // comparison pairs a picture with nothing.
  const styles = await page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const cs = getComputedStyle(el);
    const out = { __selector: ${JSON.stringify(selector)}, __class: el.className,
                  __rect: el.getBoundingClientRect().toJSON(),
                  __text: (el.innerText || '').slice(0, 500) };
    for (const p of ${JSON.stringify(PROPS)}) out[p] = cs.getPropertyValue(p);
    return out;
  })()`);
  if (!styles) return { ok: false, reason: 'element vanished before the style read' };
  const html = await page.evaluate(
    `document.querySelector(${JSON.stringify(selector)})?.outerHTML ?? null`,
  );

  const box2 = await page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`);
  if (box2) {
    const res = await page.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: {
        x: Math.max(0, box2.x - pad),
        y: Math.max(0, box2.y - pad),
        width: Math.min(VIEWPORT.width, box2.w + pad * 2),
        height: Math.min(VIEWPORT.height, box2.h + pad * 2),
        scale: 2,
      },
    });
    fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
  }
  return { ok: true, styles, html };
}

/** Select text with a real mouse drag, so the app's own selection listener
 *  fires the way it does for a person. A programmatic Range does not. */
async function selectTextIn(page, selector) {
  // Scroll into view BEFORE reading the box: a paragraph below the fold has a
  // y past the viewport, so the drag dispatches outside the window and the page
  // reports an empty selection — which reads as "no bubble" on both apps.
  await page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (el) el.scrollIntoView({ block: 'center' });
  })()`);
  await new Promise((r) => setTimeout(r, 500));

  const box = await page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.top < 0 || r.top > ${VIEWPORT.height}) return null;
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`);
  if (!box) return { ok: false, reason: 'no box' };
  const y = Math.max(20, Math.min(VIEWPORT.height - 40, box.y + Math.min(18, box.h / 2)));
  const x0 = Math.max(10, box.x + 6);
  const x1 = Math.min(VIEWPORT.width - 10, box.x + Math.min(box.w - 12, 240));

  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y });
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y, button: 'left', clickCount: 1, buttons: 1 });
  await new Promise((r) => setTimeout(r, 120));
  // The pause between moves is load-bearing: dispatched back to back with no
  // frame in between, the fork's turn rows never register the drag and the
  // selection comes back empty, which reads as "this app has no bubble".
  for (let i = 1; i <= 6; i++) {
    await page.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: x0 + ((x1 - x0) * i) / 6,
      y,
      button: 'left',
      buttons: 1,
    });
    await new Promise((r) => setTimeout(r, 90));
  }
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y, button: 'left', clickCount: 1 });
  await new Promise((r) => setTimeout(r, 900));
  const sel = await page.evaluate('String(window.getSelection()?.toString() || "")');
  return { ok: sel.length > 0, selection: sel.slice(0, 120) };
}

const SURFACES = [
  {
    id: 'question-card',
    what: 'the pending question card',
    session: 'question',
    selectors: ['.qc', '.question-card', '[class*="question"]', '.ask-card', '.sab', '.pending', '.int-card', 'form'],
  },
  {
    id: 'approval-card',
    what: 'the pending approval card',
    session: 'approval',
    selectors: ['.ap', '.approval-card', '[class*="approval"]', '[class*="permission"]', '.pending', '.int-card'],
  },
  {
    id: 'selection-bubble',
    what: 'the comment / add-to-chat float card over a text selection',
    session: 'main',
    selectFrom: ['.u-text', '.paragraph-node', 'p'],
    // `.quote-pill` is the browser-reference pill in the prompt, not this card,
    // so a bare `[class*="quote"]` matches the wrong element and reports a
    // comparison of two unrelated surfaces.
    selectors: ['.sqb', '.sab', '.sel-quote', '.selection-bubble', '.mention-tip-quote-card', '.mention-tip'],
  },
  {
    id: 'mention-pills',
    what: 'the @-mention / attachment pills in the quoted user turn',
    session: 'main',
    selectors: ['.mention-pill', '.attachment-pill', '.quote-pill'],
  },
];

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const report = {};

  for (const app of APPS) {
    const port = 9400 + (app.name === 'fork' ? 1 : 0);
    const handle = await launchChrome(port);
    const page = await connectPage(port);
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Emulation.setDeviceMetricsOverride', {
      ...VIEWPORT, deviceScaleFactor: 1, mobile: false,
    });
    const appReport = {};

    // One boot per session, not per surface: the question and approval cards
    // live in sessions of their own, and the mention + selection surfaces live
    // in the main one. Re-booting per surface would triple the run for nothing.
    for (const session of new Set(SURFACES.map((s) => s.session))) {
      const seed = buildSeed({ locale: 'en', theme: 'dark', token: 'mock-token' });
      const { reached, gaps } = await openSurface(page, {
        url: `http://127.0.0.1:${app.port}/`,
        steps: [openSession(session)],
        seed,
      });
      appReport[`open:${session}`] = { reached, gaps, bootKeys: BOOT_KEYS };

      for (const surface of SURFACES.filter((s) => s.session === session)) {
        const rec = { what: surface.what, session, found: null, error: null };
        try {
          if (surface.selectFrom) {
            const picked = await page.evaluate(`(() => {
              for (const s of ${JSON.stringify(surface.selectFrom)}) {
                const el = document.querySelector(s);
                if (el && el.getBoundingClientRect().width > 40) return s;
              }
              return null;
            })()`);
            if (picked) {
              rec.selectedFrom = picked;
              rec.selection = await selectTextIn(page, picked);
            } else {
              rec.error = 'no selectable paragraph';
            }
          }
          for (const sel of surface.selectors) {
            if (!(await page.evaluate(`!!document.querySelector(${JSON.stringify(sel)})`))) continue;
            const shot = await shotElement(page, sel, path.join(OUT, `${surface.id}.${app.name}.png`));
            if (shot.ok) {
              rec.found = sel;
              rec.styles = shot.styles;
              rec.html = shot.html;
              break;
            }
          }
          if (!rec.found) rec.error = rec.error || 'no selector matched';
        } catch (error) {
          rec.error = String(error.message || error);
        }
        appReport[surface.id] = rec;
      }
    }
    report[app.name] = appReport;
    killChrome(handle);
  }

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));

  for (const app of APPS) {
    console.log(`\n--- ${app.name} (open gaps: ${report[app.name]['open:main'].gaps.length}) ---`);
    for (const surface of SURFACES) {
      const r = report[app.name][surface.id];
      console.log(`  ${surface.id.padEnd(18)} ${r.found || 'NOT FOUND'}${r.error ? `  [${r.error}]` : ''}`);
    }
  }
  console.log(`\nwritten -> ${OUT}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
