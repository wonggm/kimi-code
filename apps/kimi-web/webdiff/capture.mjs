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

const SETTLE_GAP_MS = 250;
const SETTLE_STABLE_READS = 3;
const SETTLE_TIMEOUT_MS = 25_000;
const MAX_STYLED_ELEMENTS = 800;
const MAX_HTML_CHARS = 4_000_000;

export const STORAGE = {
  locale: 'kimi-locale',
  colorScheme: 'kimi-web.color-scheme',
  onboarded: 'kimi-web.onboarded',
  credential: 'kimi-web.server-credential',
  // The two apps disagree on this key name; seeding the wrong one silently
  // drops the font-scale dimension from the comparison.
  fontScale: { upstream: 'kimi-web.font-scale', fork: 'kimi-web.ui-font-size' },
};

export const BOOT_KEYS = {
  locale: STORAGE.locale,
  colorScheme: STORAGE.colorScheme,
  fontScale: STORAGE.fontScale,
  onboarded: STORAGE.onboarded,
};

export function buildSeed({ app, locale, theme, token }) {
  const fontKey = STORAGE.fontScale[app] ?? STORAGE.fontScale.fork;
  return {
    [STORAGE.locale]: locale,
    [STORAGE.colorScheme]: theme,
    [fontKey]: '16',
    [STORAGE.onboarded]: '1',
    [STORAGE.credential]: JSON.stringify({
      version: 1,
      credential: token,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    }),
  };
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
        fingerprint: [cs.borderRadius, cs.backgroundColor, cs.boxShadow, cs.fontSize, cs.color, cs.borderColor].join('|'),
      });
    }
  }

  const text = document.body ? document.body.innerText : '';
  const lines = Array.from(new Set(text.split('\\n').map((l) => l.trim()).filter(Boolean))).sort();

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
  await new Promise((resolve) => setTimeout(resolve, SETTLE_GAP_MS * 2));
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
    const nodes = document.querySelectorAll('button, [role="button"], [role="menuitem"], [role="tab"], summary, select, a[href], [aria-haspopup]');
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
    await new Promise((resolve) => setTimeout(resolve, 120));
    await cdp.evaluate(pin('el.scrollHeight'));
    await new Promise((resolve) => setTimeout(resolve, step.ms ?? 600));
    return null;
  }
  if (step.action === 'press') {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: step.key, code: step.key, windowsVirtualKeyCode: 27 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: step.key, code: step.key, windowsVirtualKeyCode: 27 });
    await new Promise((resolve) => setTimeout(resolve, step.ms ?? 200));
    return null;
  }
  let target = null;
  if (step.action === 'clickPoint' || step.action === 'hoverPoint') target = { x: step.x, y: step.y };
  else if (step.action === 'clickText') target = await findClickableByText(cdp, step.text);
  else target = await cdp.elementCenter(step.selector);
  if (!target) return step.selector ?? step.text ?? `point:${step.x},${step.y}`;
  if (step.action === 'click' || step.action === 'clickPoint' || step.action === 'clickText') await cdp.click(target.x, target.y);
  else if (step.action === 'hover' || step.action === 'hoverPoint') await cdp.mouseMove(target.x, target.y);
  else if (step.action === 'type') await cdp.typeInto(step.selector, step.text ?? '');
  await new Promise((resolve) => setTimeout(resolve, step.ms ?? 250));
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
  await primeStorage(cdp, seed);
  // Emulate reduced motion BEFORE the load, so the app's first paint already has
  // it. Setting it after `navigate` let the first frame run with real transition
  // durations and made every surface's captured motion state depend on when the
  // override landed.
  await cdp.emulateMedia([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  // One load: the seed script installs the boot keys before the app's scripts run.
  await cdp.navigate(url);
  // Wait for the app to boot BEFORE running the steps. A load event fires long
  // before Vue has rendered the shell, and a step that clicks into that window
  // finds nothing, records a gap, and leaves the surface looking untouched —
  // which is what made the settings scene fail for both apps while a manual
  // click with a 3 s pause opened it every time.
  await waitForSettled(cdp, { timeoutMs: 20_000 });
  // Settling is not enough: the fading splash still covers the UI, so wait for
  // it to be gone before any step clicks through to the surface underneath.
  await waitForBootComplete(cdp);
  await dropBootSplash(cdp);

  const reached = [];
  const gaps = [];
  for (const step of steps) {
    const missing = await runStep(cdp, step);
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
    const deadline = Date.now() + 3_000;
    for (;;) {
      const pinned = await cdp.evaluate(
        `(() => { const el = document.querySelector('.chat-scroll'); return !!el && el.classList.contains('is-following'); })()`,
      );
      if (pinned || Date.now() > deadline) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  return { reached, gaps };
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
 */
export async function captureSurface(cdp, { url, outDir, name, steps = [], attempts = null, seed, baseline = null, expect = null }) {
  const variants = attempts ?? [steps];
  const matchesTarget = (raw) =>
    expect === null || (raw?.texts?.lines ?? []).some((line) => expect.test(line));
  let last = null;

  for (const variant of variants) {
    const { reached, gaps } = await openSurface(cdp, { url, steps: variant, seed });
    await waitForSettled(cdp);
    await normalizeScroll(cdp);
    await waitForSettled(cdp);
    const raw = await cdp.evaluate(DIGEST_EXPR);
    const signature = signatureOf(raw);
    last = { reached, gaps, signature, steps: variant, raw };
    // A change alone is not proof the surface opened: the dock's elapsed-time
    // label ticks between two reads, so a variant that opened nothing still
    // differs from the baseline. Require the scene's own text to be present.
    if ((baseline === null || changed(baseline, signature)) && matchesTarget(raw)) break;
  }

  const { reached, gaps, signature, steps: usedSteps, raw } = last;
  const opened = (baseline === null || changed(baseline, signature)) && matchesTarget(raw);
  if (!opened) return { scene: null, gaps, signature, opened, steps: usedSteps };

  const html = await cdp.evaluate(
    `(() => { const h = document.documentElement.outerHTML; return h.length > ${MAX_HTML_CHARS} ? h.slice(0, ${MAX_HTML_CHARS}) : h; })()`,
  );
  const png = await cdp.screenshot();

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

  return { scene, gaps, signature, opened, steps: usedSteps };
}
