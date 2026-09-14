// apps/kimi-web/webdiff/capture.mjs
// Per-surface capture for the webdiff runner: seed the boot keys both apps read
// from localStorage, drive a surface open with real input events, wait for the
// async renderers (KaTeX / shiki workers) to quiesce, then record the DOM
// digest, per-element computed styles, the visible text inventory, the resolved
// class names, the rendered HTML and a PNG.
//
// The HTML and class inventory are the page-source record: a digest tells you
// *that* a surface differs, only the markup tells you how.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PHASE_ENTER_CLASS, PHASE_LEAVE_CLASS } from './compare.mjs';

const SETTLE_GAP_MS = 120;
// Two consecutive identical reads, not three: the gap below already covers a
// frame, and the known late-arriving state (upstream's `.scrolling` class, the
// shiki fallback) is awaited by name rather than by waiting longer for anything.
const SETTLE_STABLE_READS = 2;
const SETTLE_TIMEOUT_MS = 25_000;
const MAX_STYLED_ELEMENTS = 800;
const MAX_HTML_CHARS = 4_000_000;

// Wall-clock breakdown of a walk, off unless WEB_PORT_TIMING=1. Which phase pays
// the per-surface cost decides where a speed-up can go: a reload is unavoidable
// per surface, but a settle that always burns its timeout is not.
const TIMING = process.env.WEB_PORT_TIMING === '1';
const timings = new Map();
async function timed(label, fn) {
  if (!TIMING) return fn();
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    const dt = Date.now() - t0;
    const entry = timings.get(label) ?? { count: 0, ms: 0 };
    entry.count += 1;
    entry.ms += dt;
    timings.set(label, entry);
  }
}
export function timingReport() {
  return [...timings.entries()]
    .map(([label, { count, ms }]) => ({ label, count, totalMs: ms, avgMs: Math.round(ms / count) }))
    .sort((a, b) => b.totalMs - a.totalMs);
}

export const STORAGE = {
  locale: 'kimi-locale',
  colorScheme: 'kimi-web.color-scheme',
  onboarded: 'kimi-web.onboarded',
  credential: 'kimi-web.server-credential',
  // The two apps disagree on this key name; seeding the wrong one silently
  // drops the font-scale dimension from the comparison.
  fontScale: { upstream: 'kimi-web.font-scale', fork: 'kimi-web.ui-font-size' },
  // Liquid glass is the fork's own system (upstream has none), so every
  // comparison is taken with it OFF — otherwise the fork's glass surfaces
  // differ from upstream's for a reason that is not under comparison. The app
  // reads `'false'` as off (useAppearance.loadLiquidGlass).
  glass: 'kimi-web.liquid-glass',
};

export const BOOT_KEYS = {
  locale: STORAGE.locale,
  colorScheme: STORAGE.colorScheme,
  fontScale: STORAGE.fontScale,
  onboarded: STORAGE.onboarded,
};

export function buildSeed({ app, locale, theme, token }) {
  const fontKey = STORAGE.fontScale[app] ?? STORAGE.fontScale.fork;
  const seed = {
    [STORAGE.locale]: locale,
    [STORAGE.colorScheme]: theme,
    // The two apps store the same preference in different units: upstream keeps
    // a step name (small|medium|large|xlarge, default medium = 14px) and the
    // fork keeps a px size. Seeding one value for both left upstream at medium
    // while the fork went to 16px, so every capture compared two type scales.
    // 'large' is upstream's 16px step, which is what the fork's 16 means.
    [fontKey]: app === 'upstream' ? 'large' : '16',
    [STORAGE.onboarded]: '1',
    [STORAGE.credential]: JSON.stringify({
      version: 1,
      credential: token,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    }),
  };
  if (app === 'fork') seed[STORAGE.glass] = 'false';
  return seed;
}

export function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

const DIGEST_EXPR = `(() => {
  const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META']);
  // Generated identifiers are re-created on every render (the icon library
  // emits ids like \`uicons-kuos0x03vv\` and references them as url(#…)). Left in,
  // they make an unchanged surface hash differently — which reads as "something
  // opened" and turns hover/click no-ops into phantom surfaces.
  const unstable = (value) => /uicons|radix|headlessui|[0-9a-f]{6,}/i.test(value);
  const stableId = (id) => (!id ? '' : unstable(id) ? '#x' : '#' + id);
  const stableValue = (value) => value.replace(/url\\(#[^)]*\\)/g, 'url(#)').replace(/[0-9a-f]{12,}/gi, '…');
  const attrDigest = (el) => {
    const out = [];
    for (const attr of el.attributes) {
      if (attr.name === 'class' || attr.name === 'id') continue;
      // Vue's scoped-style attribute (data-v-<hash>) is stamped from the build,
      // so the same element carries a different value in each app. Left in, it
      // makes every element differ and the whole element-by-element comparison
      // meaningless.
      if (attr.name.startsWith('data-v-')) continue;
      // Inline style is runtime positioning, not design: upstream floats the
      // work-mode pill with a transform while the fork places it in CSS, so the
      // same pill reads as a different element. Computed styles are captured
      // separately (styles.perElement), so nothing visual is lost by dropping
      // the attribute from the identity key.
      if (attr.name === 'style') continue;
      const raw = stableValue(attr.value);
      const value = raw.length > 80 ? raw.slice(0, 80) : raw;
      out.push(attr.name + '=' + value);
      if (out.length >= 8) break;
    }
    return out.sort().join(';');
  };
  const parts = [];
  const structParts = [];
  let hiddenRoots = 0;
  const walk = (el, depth) => {
    if (depth > 40 || parts.length > 6000) return;
    for (const child of el.children) {
      if (skip.has(child.tagName)) continue;
      // A display:none subtree is not part of the rendered surface. Upstream
      // parks inactive views in the DOM this way (the session-admin section
      // sits there hidden while the chat is on screen) whereas the fork mounts
      // views on demand, so every parked-view element read as "missing on the
      // fork". Skipping hidden subtrees compares what is actually drawn, and
      // the skipped count is reported so a divergence in hidden content is
      // still visible as a number.
      if (getComputedStyle(child).display === 'none') {
        hiddenRoots += 1;
        continue;
      }
      const cls = Array.from(child.classList).sort().join('.');
      const attrs = attrDigest(child);
      parts.push(child.tagName + stableId(child.id) + (cls ? '.' + cls : '') + (attrs ? '[' + attrs + ']' : ''));
      // Structure only (tag + classes). The attribute-bearing form above drives
      // the change detection, where an aria-expanded flip is a real signal; this
      // one drives "is an upstream element missing on the fork", where the
      // fork's own inline CSS variables and data-* flags on shared containers
      // would otherwise make every wrapper read as missing.
      structParts.push(child.tagName + (cls ? '.' + cls : ''));
      walk(child, depth + 1);
    }
  };
  if (document.body) walk(document.body, 0);

  const styles = [];
  const classes = {};
  let total = 0;
  let styledTotal = 0;
  if (document.body) {
    for (const el of document.body.querySelectorAll('*')) {
      total += 1;
      const list = Array.from(el.classList);
      if (list.length > 0) styledTotal += 1;
      for (const c of list) classes[c] = (classes[c] || 0) + 1;
      if (list.length === 0 || styles.length >= ${MAX_STYLED_ELEMENTS}) continue;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      styles.push({
        tag: el.tagName,
        classes: list.slice().sort(),
        box: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
        hasGlass: cs.backdropFilter !== 'none' || cs.webkitBackdropFilter !== 'none',
        backdropFilter: cs.backdropFilter,
        // Border width and style are part of the fingerprint because a control
        // whose only border came from a gated rule falls back to the browser's
        // own button chrome (2px outset) without moving any of the other six
        // properties — with that gap, the right panel's launcher rows and the
        // settings selects read as identical to upstream's while looking
        // nothing like them.
        fingerprint: [
          cs.borderRadius,
          cs.backgroundColor,
          cs.boxShadow,
          cs.fontSize,
          cs.color,
          cs.borderColor,
          cs.borderTopWidth,
          cs.borderTopStyle,
          cs.borderBottomWidth,
          cs.borderBottomStyle,
        ].join('|'),
      });
    }
  }

  const text = document.body ? document.body.innerText : '';
  // Volatile by construction, so the two apps can never agree on them: the
  // settings pane's "App version" row prints the build stamp of whichever bundle
  // is loaded ("0.41.0 · 2026-09-09 13:40"), and a build stamp differs between
  // two bundles by definition. Blank the date and keep the version, as the settle
  // signature already does for elapsed times.
  const stableText = text
    .replace(/(\\d+\\.\\d+\\.\\d+) · \\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}/g, '$1 · T')
    // Same reason, different value: the settings pane prints the connected
    // server's address, and each app is served by its own mock on its own port,
    // so the two can never agree on the port number.
    .replace(/\\b(127\\.0\\.0\\.1|localhost):\\d{2,5}\\b/g, '$1:PORT');
  const lines = Array.from(new Set(stableText.split('\\n').map((l) => l.trim()).filter(Boolean))).sort();

  const dom = parts.join('\\n');
  return {
    dom: { pageHash: '', elementCount: parts.length, serializedCount: total, hiddenRoots },
    styles: { perElement: styles, styledTotal },
    texts: { pageHash: '', lineCount: lines.length, lines },
    classes,
    domSerial: dom,
    domStruct: structParts.join('\\n'),
  };
})()`;

let seededKey = null;
let seededScriptId = null;

/**
 * Seed localStorage for the run's boot keys.
 *
 * This installs a document-start script instead of loading the page, writing
 * the keys, and loading it again. Every surface used to pay two full page loads
 * (one to reach an origin with a localStorage, one for the app to read the
 * seeded values) — the script runs before the app's own scripts on each
 * navigation, so one load is enough and the old double cost is gone.
 *
 * The clear stays deliberate and per navigation: the Chrome profile is shared
 * across every capture in a run, so anything a previous interaction persisted (a
 * collapsed sidebar, the last settings tab) would otherwise leak into the next
 * surface and make the two apps see different state.
 */
export async function primeStorage(cdp, seed) {
  const entries = JSON.stringify(Object.entries(seed ?? {}));
  if (entries === seededKey) return;
  if (seededScriptId !== null) {
    try {
      await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: seededScriptId });
    } catch {
      // The target may already be gone; a stale script is replaced below.
    }
  }
  const { identifier } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try { localStorage.clear(); } catch {} for (const [k, v] of ${entries}) { try { localStorage.setItem(k, v); } catch {} }`,
  });
  seededScriptId = identifier;
  seededKey = entries;
}

/**
 * Pin the scroll position before the digest is read.
 *
 * The apps do not settle to the same place on their own: the mock streams a
 * message after load, and whether the "new messages" pill appears (and whether
 * the scroller reports `is-following`) depends on how the scroller's height
 * finished changing, so the same build reports 441 or 444 elements on different
 * runs. Scrolling every scroller to its bottom is a state both apps reach and
 * hold — it clears the pill and settles the follow flag — which stops the
 * captured tree moving between runs.
 */
export async function normalizeScroll(cdp) {
  await cdp.evaluate(`(() => {
    for (const el of document.body ? document.body.querySelectorAll('*') : []) {
      const cs = getComputedStyle(el);
      if (!/(auto|scroll)/.test(cs.overflowY)) continue;
      if (el.scrollHeight <= el.clientHeight + 4) continue;
      if (el.scrollTop + el.clientHeight < el.scrollHeight - 1) el.scrollTop = el.scrollHeight;
    }
    return true;
  })()`);
  // Upstream marks its scroller `.scrolling` while a scroll is in flight and
  // drops the class once it goes idle. Capturing inside that window records a
  // class the other app never has, which the comparison reads as a missing
  // element — so wait it out, bounded.
  const idle = Date.now() + 1_000;
  for (;;) {
    const live = await cdp.evaluate(`(() => document.querySelectorAll('.scrolling').length)()`);
    if (live === 0 || Date.now() > idle) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  // The caller settles right after this, and that settle is what decides the
  // scroll has stopped; this only gives the assignment a frame to land.
  await new Promise((resolve) => setTimeout(resolve, SETTLE_GAP_MS));
}

const EFFECT_PROBE = `(() => { const b = document.body; return b ? b.querySelectorAll('*').length + '|' + b.innerText.length : null; })()`;

/** The tree's cheap signature, for waiting on a step's effect. */
export function domProbe(cdp) {
  return cdp.evaluate(EFFECT_PROBE);
}

/** Wait until the tree differs from `before`, capped — the step's own dwell. */
async function waitForEffect(cdp, before, capMs) {
  const deadline = Date.now() + capMs;
  for (;;) {
    const now = await cdp.evaluate(EFFECT_PROBE);
    if (now !== before || Date.now() > deadline) return now;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
}

export async function waitForSettled(cdp, { timeoutMs = SETTLE_TIMEOUT_MS } = {}) {
  // Volatile values are blanked before measuring: a live elapsed-time label, a
  // clock or a context-token readout changes between reads without the surface
  // settling any further, so an unblanked length never stabilises and every
  // surface pays the full timeout.
  const signature = `(() => {
    const els = document.body ? document.body.querySelectorAll('*').length : 0;
    const text = document.body ? document.body.innerText : '';
    const stable = text
      .replace(/\\d+m\\s*\\d+s/g, 'T')
      .replace(/\\d+(?:\\.\\d+)?k/gi, 'N')
      .replace(/\\d{1,2}:\\d{2}(?::\\d{2})?/g, 'C');
    return els + '|' + stable.length;
  })()`;
  const start = Date.now();
  let last = null;
  let stable = 0;
  for (;;) {
    let cur = null;
    try {
      cur = await cdp.evaluate(signature);
    } catch {
      cur = null;
    }
    if (cur !== null && cur === last) {
      stable += 1;
      if (stable >= SETTLE_STABLE_READS) return cur;
    } else {
      stable = 1;
      last = cur;
    }
    if (Date.now() - start > timeoutMs) return last;
    await new Promise((resolve) => setTimeout(resolve, SETTLE_GAP_MS));
  }
}

async function findClickableByText(cdp, text) {
  return cdp.evaluate(`(() => {
    const wanted = ${JSON.stringify(text.toLowerCase())};
    // The last entry is the sidebar session row: both apps render it as a plain
    // \`div.se\` with a click handler, not a button, so it is the one interactive
    // element a text step could not otherwise reach — and opening a session is
    // how a scene poses a state the app does not boot into (the fixture's
    // pending-card sessions).
    const nodes = document.querySelectorAll('button, [role="button"], [role="menuitem"], [role="tab"], summary, select, a[href], [aria-haspopup], .se');
    for (const el of nodes) {
      const label = (el.getAttribute('aria-label') || el.textContent || '').trim().toLowerCase();
      if (!label.includes(wanted)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    }
    return null;
  })()`);
}

async function runStep(cdp, step) {
  if (step.action === 'wait') {
    await new Promise((resolve) => setTimeout(resolve, step.ms ?? 300));
    return null;
  }
  // Pin the transcript to its tail on both apps before the capture. The scroll
  // position drives real state on both sides — the `is-following` class on the
  // chat scroller, the jump-to-latest pill, and the "Latest messages" label —
  // and the two apps restore it differently after the seed reload, so without
  // this the comparison sees two different scroll states and reports the
  // difference as a markup gap.
  if (step.action === 'scrollBottom') {
    const selector = step.selector ?? '.chat-scroll';
    const back = step.back ?? 160;
    // Two phases, because both apps re-arm the follow only on an upward scroll
    // that lands in the bottom zone: jump up out of the zone first, then down to
    // the tail. A single jump to the tail is a no-op when the container is
    // already there, and leaves a restored (not-following) state in place.
    const pin = (target) => `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.scrollTop = ${target};
      return true;
    })()`;
    await cdp.evaluate(pin(`Math.max(0, el.scrollHeight - ${Number(back)})`));
    // One frame for the app to register the upward scroll, then the tail jump.
    // The follow flag it arms is awaited after the steps (open:scroll-pin), so
    // this pause does not need to cover it.
    await new Promise((resolve) => setTimeout(resolve, 60));
    await cdp.evaluate(pin('el.scrollHeight'));
    await new Promise((resolve) => setTimeout(resolve, step.ms ?? 200));
    return null;
  }
  if (step.action === 'press') {
    const effect = await domProbe(cdp);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: step.key, code: step.key, windowsVirtualKeyCode: 27 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: step.key, code: step.key, windowsVirtualKeyCode: 27 });
    await waitForEffect(cdp, effect, step.ms ?? 200);
    return null;
  }
  // Bring a named element into the viewport. Every scene starts by pinning the
  // transcript to its tail, so anything further up (the tool-run fold, the long
  // prose block) is off-screen when its step runs and a coordinate click or a
  // Range lands nowhere. `scrollBottom` cannot serve here: it pins a scroller,
  // not an element.
  if (step.action === 'scrollTo') {
    const effect = await domProbe(cdp);
    const found = await cdp.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(step.selector)});
      if (!el) return false;
      el.scrollIntoView({ block: ${JSON.stringify(step.block ?? 'center')} });
      return true;
    })()`);
    if (found) await waitForEffect(cdp, effect, step.ms ?? 250);
    return found ? null : step.selector;
  }
  // Select text in a transcript block, which is what raises the selection
  // popover. Verified on both apps: neither reacts to a synthetic mouse drag
  // reliably (their selection capture reads a Range off the document), while a
  // Range plus `selectionchange` and a `mouseup` on the block opens the popover
  // on both. The first RENDERED match wins: both apps keep a parked copy of prose
  // in the hidden shell (the sessions sheet's subtitle is a `.paragraph-node` on
  // upstream with a 0×0 box), and a Range inside a parked block selects nothing
  // the app can anchor a popover to.
  //
  // The block is scrolled into view first, in its own step: a Range built in the
  // same tick as the scroll leaves the fork's selection capture with no anchor
  // (measured: no popover at all, while upstream opens one either way), so the
  // scroll has to land before the selection is built.
  if (step.action === 'select') {
    const selector = step.selector ?? '.paragraph-node';
    const pick = `[...document.querySelectorAll(${JSON.stringify(selector)})].find((node) => {
      const r = node.getBoundingClientRect();
      return r.width > 200 && r.height > 20;
    })`;
    const found = await cdp.evaluate(`(() => {
      const el = ${pick};
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      return true;
    })()`);
    if (!found) return selector;
    await new Promise((resolve) => setTimeout(resolve, 250));
    const effect = await domProbe(cdp);
    const selected = await cdp.evaluate(`(() => {
      const el = ${pick};
      if (!el) return false;
      let text = null;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (walker.currentNode.textContent.trim().length > 20) {
          text = walker.currentNode;
          break;
        }
      }
      if (!text) return false;
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, Math.min(${Number(step.chars ?? 24)}, text.textContent.length));
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      const rect = range.getBoundingClientRect();
      if (rect.width < 4) return false;
      document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: rect.left + 20, clientY: rect.top + 8 }));
      return true;
    })()`);
    if (selected) await waitForEffect(cdp, effect, step.ms ?? 400);
    else await new Promise((resolve) => setTimeout(resolve, step.ms ?? 400));
    return selected ? null : selector;
  }
  let target = null;
  if (step.action === 'clickPoint' || step.action === 'hoverPoint') target = { x: step.x, y: step.y };
  else if (step.action === 'clickText') target = await findClickableByText(cdp, step.text);
  else target = await cdp.elementCenter(step.selector);
  if (!target) return step.selector ?? step.text ?? `point:${step.x},${step.y}`;
  const effect = await domProbe(cdp);
  if (step.action === 'click' || step.action === 'clickPoint' || step.action === 'clickText') await cdp.click(target.x, target.y);
  else if (step.action === 'hover' || step.action === 'hoverPoint') await cdp.mouseMove(target.x, target.y);
  else if (step.action === 'type') await cdp.typeInto(step.selector, step.text ?? '');
  // `step.ms` is a cap, not a dwell: a click that opens a dialog changes the tree
  // within a frame or two, and waiting for that change to appear is what the
  // dwell was approximating. The cap still covers the step that opens nothing
  // (a hover with no tooltip), so a surface that needs the full pause gets it.
  const cap = step.ms ?? 250;
  if (effect !== null) await waitForEffect(cdp, effect, cap);
  else await new Promise((resolve) => setTimeout(resolve, cap));
  return null;
}

/**
 * Wait until the app has finished booting: the shell is rendered AND the boot
 * splash (`.gload`, the same vocabulary in both apps) no longer covers the UI.
 *
 * The splash is a full-cover overlay that fades out *after* the shell renders.
 * `waitForSettled` can report "stable" while it is still covering the UI, and a
 * step aimed at the sidebar footer then lands on the overlay — which is how the
 * settings phase came to capture the main surface with no gap recorded, and how
 * a whole run's settings blockers became meaningless.
 *
 * "Gone" means absent, unmounting, or present-but-invisible. After the fade the
 * element can linger in the DOM, and waiting for removal alone cost every
 * surface the full timeout (measured: ~24 s per surface against ~5 s before).
 * The unmounting case matters just as much: once the element carries a Vue leave
 * class the app has already decided to drop it, and under emulated
 * `prefers-reduced-motion` the leave transition runs at 1e-06s and its
 * `transitionend` never arrives, so the splash sits in the DOM at `opacity: 1`
 * with `-leave-from -leave-active` forever. Treating it as still-covering made
 * every desktop walk surface past the twelfth pay the full 25 s timeout and
 * captured its boot text ("Connecting…", "Opening session…") into the inventory.
 */
export async function waitForBootComplete(cdp, { timeoutMs = 25_000 } = {}) {
  const start = Date.now();
  for (;;) {
    let ready = false;
    try {
      ready = await cdp.evaluate(`(() => {
        if (!document.querySelector('.con')) return false;
        for (const splash of document.querySelectorAll('.gload')) {
          if (/-leave-(from|active|to)\\b/.test(splash.className)) continue;
          const cs = getComputedStyle(splash);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          if (Number(cs.opacity) === 0 || splash.getAttribute('aria-hidden') === 'true') continue;
          // Still painting: only block while it actually covers the viewport.
          const r = splash.getBoundingClientRect();
          if (r.width < 4 || r.height < 4) continue;
          return false;
        }
        return true;
      })()`);
    } catch {
      // context not ready yet — keep polling
    }
    if (ready) return true;
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * Drop any boot splash still in the tree. `waitForBootComplete` accepts one that
 * is mid-unmount; leaving it in the tree would put its text and its Vue
 * transition classes into the page-source record, where they differ between the
 * two apps' captures for reasons that have nothing to do with the design.
 */
export async function dropBootSplash(cdp) {
  await cdp.evaluate(`(() => {
    let dropped = 0;
    for (const el of document.querySelectorAll('.gload')) { el.remove(); dropped += 1; }
    return dropped;
  })()`);
}

export async function openSurface(cdp, { url, steps = [], seed }) {
  await timed('open:storage', () => primeStorage(cdp, seed));
  // Emulate reduced motion BEFORE the load, so the app's first paint already has
  // it. Setting it after `navigate` let the first frame run with real transition
  // durations and made every surface's captured motion state depend on when the
  // override landed.
  await cdp.emulateMedia([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  // One load: the seed script installs the boot keys before the app's scripts run.
  await timed('open:navigate', () => cdp.navigate(url));
  // Wait for the app to boot BEFORE running the steps. A load event fires long
  // before Vue has rendered the shell, and a step that clicks into that window
  // finds nothing, records a gap, and leaves the surface looking untouched —
  // which is what made the settings scene fail for both apps while a manual
  // click with a 3 s pause opened it every time.
  await timed('open:settle-boot', () => waitForSettled(cdp, { timeoutMs: 20_000 }));
  // Settling is not enough: the fading splash still covers the UI, so wait for
  // it to be gone before any step clicks through to the surface underneath.
  await timed('open:boot-complete', () => waitForBootComplete(cdp));
  await timed('open:drop-splash', () => dropBootSplash(cdp));

  const reached = [];
  const gaps = [];
  for (const step of steps) {
    const missing = await timed(`open:step:${step.action}`, () => runStep(cdp, step));
    if (missing) gaps.push({ action: step.action, selector: missing });
    else reached.push({ action: step.action, selector: step.selector ?? step.text ?? `point:${step.x},${step.y}` });
  }
  // A scene that pins the transcript to the tail must END pinned. The pin is a
  // scrollTop assignment and both apps re-arm their follow flag asynchronously —
  // under emulated reduced motion the fork's initial state is unpinned
  // (`panes chat-scroll has-header`), and it gains `is-following` about 250 ms
  // after the pin. Waiting for that class rather than for the DOM to stop
  // changing is what keeps the captured scroll state matching the intent.
  if (steps.some((step) => step.action === 'scrollBottom')) {
    await timed('open:scroll-pin', async () => {
      // A surface without the chat scroller (the dock, a settings sheet) can
      // never report the class, so ask once and leave instead of burning the cap.
      const probe = `(() => { const el = document.querySelector('.chat-scroll'); return el ? el.classList.contains('is-following') : 'absent'; })()`;
      const deadline = Date.now() + 800;
      for (;;) {
        const pinned = await cdp.evaluate(probe);
        if (pinned === 'absent' || pinned === true || Date.now() > deadline) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    });
  }
  await timed('open:codeblocks', () => waitForCodeBlocksSettled(cdp));
  return { reached, gaps };
}

/**
 * Code blocks highlight asynchronously (shiki), and the plain-text fence
 * fallback that paints first keeps the same element count and text length — so
 * `waitForSettled` reports "stable" while the block is still unhighlighted. The
 * fork's capture then lacks `stream-diffs-shell` / `stream-diffs-surface` and
 * upstream's has them, which the comparison reads as a class the fork is
 * missing. Wait for the fallback to clear, briefly: a surface that legitimately
 * keeps the plain renderer (the fork's heavy-message path) simply pays the cap.
 */
async function waitForCodeBlocksSettled(cdp, { timeoutMs = 2_000 } = {}) {
  const pending = `(() => document.querySelectorAll('.code-pre-fallback').length)()`;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let count = 0;
    try {
      count = await cdp.evaluate(pending);
    } catch {
      return;
    }
    if (count === 0 || Date.now() > deadline) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/**
 * Scene requirements: the walk compares markup, so an interaction that toggles,
 * opens or dismisses something never fails a capture — a click that opens
 * nothing still leaves a plausible tree, and a component the fork renders in its
 * own shape still produces a capture to diff. A scene states the OUTCOME it
 * needs instead, and the check runs on the live page after its steps, where the
 * state actually exists.
 *
 * Checks are element-based (an element counts when it is rendered and not parked
 * off the side of the viewport — both apps park a closed panel at x = innerWidth)
 * and text-based (a regex over the visible text of `within`, or the body). A
 * failed check is recorded per app and reported as a blocker for that app.
 */
const REQUIRE_EXPR = (serialized) => `(() => {
  const reqs = ${JSON.stringify(serialized)};
  // The transition phase classes compare.mjs drops from element signatures (it
  // exports the patterns). A panel Vue animates in can be checked while it still
  // carries \`dock-panel-enter-from dock-panel-enter-active\` and reads opacity 0 —
  // the first frame of a transition whose emulated-reduced-motion duration is
  // ~1e-06s, after which the transition's end event can never arrive — so the
  // panel read as absent on the app that animates it and the requirement failed
  // for a reason the user never sees. An element still in its enter phase is
  // therefore rendered. A leave phase wins over a stale enter phase: a dismissed
  // panel lingers in the DOM carrying both (measured on the fork's dock panel,
  // \`dock-panel-enter-from dock-panel-leave-from dock-panel-leave-active\`), and the
  // app has already decided to drop it — reading it as rendered would invert every
  // absence assertion a \`then\` stage makes.
  const phaseEnter = new RegExp('^' + ${JSON.stringify(PHASE_ENTER_CLASS)} + '$');
  const phaseLeave = new RegExp('^' + ${JSON.stringify(PHASE_LEAVE_CLASS)} + '$');
  const hasPhase = (el, pattern) => [...el.classList].some((name) => pattern.test(name));
  // "Visible" = rendered and not parked off the side of the viewport. Both apps
  // keep a closed right panel in the DOM parked at x = innerWidth with a real
  // layout box, so a selector-only test would read the parked panel as open.
  // Vertical position is deliberately not part of the test: the transcript
  // scrolls, and a card above or below the fold is still the rendered state.
  const visible = (el) => {
    if (!el.isConnected) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return false;
    if (hasPhase(el, phaseLeave)) return false;
    if (!hasPhase(el, phaseEnter) && (cs.visibility === 'hidden' || Number(cs.opacity) === 0)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    return r.left < innerWidth && r.right > 0;
  };
  const snippet = (text) => String(text ?? '').replace(/\\s+/g, ' ').trim().slice(0, 120);
  return reqs.map((req) => {
    const out = { name: req.name, ok: false, count: null, saw: '', error: '' };
    try {
      if (req.present || req.absent) {
        const selector = req.present || req.absent;
        const count = [...document.querySelectorAll(selector)].filter(visible).length;
        out.count = count;
        out.ok = req.present ? (req.count === null ? count > 0 : count === req.count) : count === 0;
        out.saw = selector + ' (' + count + ' rendered)';
      } else if (req.text) {
        const scope = req.within ? document.querySelector(req.within) : document.body;
        const text = scope ? scope.innerText : null;
        const matches = scope !== null && new RegExp(req.text.source, req.text.flags).test(text);
        out.ok = req.not === true ? scope !== null && !matches : matches;
        out.saw = scope === null ? req.within + ' is absent' : snippet(text);
      } else if (req.minWidthRatioOf) {
        // A layout outcome, which no element or text check can state: "this
        // control's effect is that its panel now spans its row". The element
        // measured is the requirement's scope; the reference is the other field.
        const el = req.within ? document.querySelector(req.within) : null;
        const ref = document.querySelector(req.minWidthRatioOf);
        if (!el || !ref) {
          out.saw = (el ? req.minWidthRatioOf : req.within) + ' is absent';
        } else {
          const elW = el.getBoundingClientRect().width;
          const refW = ref.getBoundingClientRect().width;
          const ratio = refW > 0 ? elW / refW : 0;
          out.ok = ratio >= (req.ratio === undefined ? 0.98 : req.ratio);
          out.saw = Math.round(elW) + 'px of ' + Math.round(refW) + 'px (ratio ' + ratio.toFixed(2) + ')';
        }
      }
    } catch (error) {
      out.error = String(error && error.message ? error.message : error);
    }
    return out;
  });
})()`;

function serializeRequirement(requirement) {
  return {
    name: String(requirement?.name ?? ''),
    present: requirement?.present ? String(requirement.present) : null,
    absent: requirement?.absent ? String(requirement.absent) : null,
    within: requirement?.within ? String(requirement.within) : null,
    count: typeof requirement?.count === 'number' ? requirement.count : null,
    text: requirement?.text instanceof RegExp ? { source: requirement.text.source, flags: requirement.text.flags } : null,
    // `not: true` inverts a `text` requirement: the scope must NOT contain it.
    // A CSS selector cannot name a row by its text, so this is how a scene states
    // "this row is absent" (e.g. a panel that must not list foreground agents).
    not: requirement?.not === true,
    // A layout outcome: `within` must be at least `ratio` (default 0.98) of the
    // width of `minWidthRatioOf`.
    minWidthRatioOf: requirement?.minWidthRatioOf ? String(requirement.minWidthRatioOf) : null,
    ratio: typeof requirement?.ratio === 'number' ? requirement.ratio : null,
  };
}

/**
 * Run a scene's requirement checks against the page as it stands, polling until
 * every requirement is met or `timeoutMs` runs out.
 *
 * The poll is what makes the check an outcome rather than a race: the step that
 * opens a panel returns as soon as the cheap tree probe changes (the pill's
 * `aria-pressed` flips before the panel mounts), so a single read right after the
 * step caught upstream's panel mid-mount and reported it missing. A requirement
 * that is never met still costs the full timeout, so a genuine miss is still a
 * miss — it just takes a moment to be sure.
 *
 * The budget is generous because a surface can be a lazily loaded chunk: the
 * settings dialog arrives a second or more after the click that asks for it on a
 * cold page, which read as "not open" at 1.5s while the capture taken two seconds
 * later showed it open. The poll exits as soon as every requirement is met.
 */
export async function checkRequirements(cdp, requirements, label = 'main', { timeoutMs = 4_000, intervalMs = 150 } = {}) {
  const list = (requirements ?? []).filter(Boolean);
  if (list.length === 0) return [];
  const serialized = list.map(serializeRequirement);
  const deadline = Date.now() + timeoutMs;
  let results;
  for (;;) {
    try {
      results = await timed(`require:${label}`, () => cdp.evaluate(REQUIRE_EXPR(serialized)));
    } catch (error) {
      // A dead context (the page navigated, the target went away) must not lose the
      // rest of a run's captures; the failure is reported as the requirement's own
      // miss, with the reason, rather than swallowed.
      results = list.map((requirement) => ({ name: requirement.name, ok: false, saw: '', error: String(error?.message ?? error) }));
    }
    if (results.every((result) => result.ok === true) || Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return results.map((result, index) => {
    const requirement = list[index];
    const expectation = requirement.present
      ? `${requirement.count === undefined ? 'at least one' : requirement.count} visible element(s) matching "${requirement.present}"`
      : requirement.absent
        ? `no visible element matching "${requirement.absent}"`
        : `text /${requirement.text?.source ?? ''}/ in ${requirement.within ?? 'the page text'}`;
    return {
      name: result.name,
      ok: result.ok === true,
      detail: result.error
        ? `expected ${expectation} — check failed: ${result.error}`
        : `expected ${expectation}; saw ${result.saw || 'nothing'}`,
    };
  });
}

export function signatureOf(raw) {
  return {
    domHash: hash(raw.domSerial),
    textHash: hash(raw.texts.lines.join('\n')),
    elementCount: raw.dom.elementCount,
    lineCount: raw.texts.lineCount,
  };
}

export function changed(before, after) {
  if (!before || !after) return true;
  return before.domHash !== after.domHash || before.textHash !== after.textHash;
}

/**
 * Open a surface and record it. `attempts` is a list of step sequences tried in
 * order — the two apps reach the same surface by different routes (the fork has
 * a `Settings` item in the sidebar footer, upstream hides it behind the account
 * menu), so the first variant that actually changes the surface wins.
 *
 * When `baseline` is given (the signature of the state the steps started from),
 * the capture is written ONLY if the steps changed the surface; otherwise the
 * caller gets `opened: false` and nothing lands on disk. That is what turns
 * "clicked a button" into evidence that a popup, menu or dialog appeared, and
 * what stops a scene that opens nothing (a missed click) from being recorded as
 * if it were the surface.
 *
 * `requires` is the scene's stated outcome (see checkRequirements). It is checked
 * here, immediately after the steps, NOT after the settle: a requirement
 * describes the state the interaction produced, and some of those are transient —
 * a selection popover is gone once the capture's own scroll normalisation has
 * run, which made a popover requirement fail on both apps for a reason that had
 * nothing to do with either of them. With `attempts` the check runs for every
 * variant tried and the last variant's results are returned; no scene states
 * requirements together with fallback routes today.
 */
export async function captureSurface(cdp, { url, outDir, name, steps = [], attempts = null, seed, baseline = null, expect = null, requires = null }) {
  const variants = attempts ?? [steps];
  const matchesTarget = (raw) =>
    expect === null || (raw?.texts?.lines ?? []).some((line) => expect.test(line));
  let last = null;
  let requirements = [];

  for (const variant of variants) {
    const { reached, gaps } = await openSurface(cdp, { url, steps: variant, seed });
    requirements = await checkRequirements(cdp, requires, name);
    await timed('cap:settle', async () => {
      await waitForSettled(cdp);
      await normalizeScroll(cdp);
      await waitForSettled(cdp);
    });
    // The transcript mounts after the boot settle, so a wait placed earlier sees
    // zero code blocks and returns at once — the block then mounts into its
    // plain-text fallback and the capture photographs that, which reads as
    // `stream-diffs-shell` missing on this app. Wait here, where the blocks are
    // known to be in the tree.
    await timed('cap:codeblocks', () => waitForCodeBlocksSettled(cdp));
    const raw = await timed('cap:digest', () => cdp.evaluate(DIGEST_EXPR));
    const signature = signatureOf(raw);
    last = { reached, gaps, signature, steps: variant, raw };
    // A change alone is not proof the surface opened: the dock's elapsed-time
    // label ticks between two reads, so a variant that opened nothing still
    // differs from the baseline. Require the scene's own text to be present.
    if ((baseline === null || changed(baseline, signature)) && matchesTarget(raw)) break;
  }

  const { reached, gaps, signature, steps: usedSteps, raw } = last;
  const opened = (baseline === null || changed(baseline, signature)) && matchesTarget(raw);
  if (!opened) return { scene: null, gaps, signature, opened, steps: usedSteps, requirements };

  const html = await timed('cap:html', () =>
    cdp.evaluate(
      `(() => { const h = document.documentElement.outerHTML; return h.length > ${MAX_HTML_CHARS} ? h.slice(0, ${MAX_HTML_CHARS}) : h; })()`,
    ),
  );
  const png = await timed('cap:screenshot', () => cdp.screenshot());

  fs.mkdirSync(outDir, { recursive: true });
  const scene = {
    dom: {
      pageHash: signature.domHash,
      elementCount: raw.dom.elementCount,
      serializedCount: raw.dom.serializedCount,
      hiddenRoots: raw.dom?.hiddenRoots ?? 0,
      // The structure-only serialization (tag + classes), so the comparison can
      // report *which* upstream element the fork is missing instead of only that
      // two hashes differ.
      elements: String(raw.domStruct ?? '').split('\n').filter(Boolean),
    },
    styles: { perElement: raw.styles.perElement, styledCount: raw.styles.styledTotal },
    texts: {
      pageHash: signature.textHash,
      lineCount: raw.texts.lineCount,
      lines: raw.texts.lines,
    },
    coverage: { reached, gaps, opened: true },
  };
  const classNames = Object.keys(raw.classes).sort();
  const inventory = {
    pageHash: hash(classNames.join('\n')),
    classCount: classNames.length,
    classes: raw.classes,
  };

  fs.writeFileSync(path.join(outDir, `${name}.json`), `${JSON.stringify(scene, null, 1)}\n`);
  fs.writeFileSync(path.join(outDir, `${name}.classes.json`), `${JSON.stringify(inventory, null, 1)}\n`);
  fs.writeFileSync(path.join(outDir, `${name}.html`), html);
  fs.writeFileSync(path.join(outDir, `${name}.png`), png);

  return { scene, gaps, signature, opened, steps: usedSteps, requirements };
}
