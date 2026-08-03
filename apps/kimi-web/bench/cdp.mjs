// apps/kimi-web/bench/cdp.mjs
// Minimal raw-CDP driver over the `ws` devDependency — no playwright/puppeteer.
// Launches the cached headless Chromium, connects to its first page target, and
// exposes promise-based `send`/`evaluate`/`waitFor`/`screenshot` plus mouse and
// media-emulation helpers used by run.mjs and capture.mjs.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { httpGetJson, sleep } from './util.mjs';

export const CHROME_BIN =
  process.env.CHROME_BIN ||
  '/home/m/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';

export const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 1 };

/** Launch headless Chromium with a remote-debugging port; returns the child. */
/** Kill a `detached` child's entire process group (leader + descendants). */
function killGroup(child) {
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    /* no such group */
  }
  try {
    child.kill('SIGKILL');
  } catch {
    /* already gone */
  }
}

export async function launchChrome(port = 9333) {
  if (!fs.existsSync(CHROME_BIN)) {
    throw new Error(`Chromium not found at ${CHROME_BIN} (set CHROME_BIN to override)`);
  }
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kimi-bench-chrome-'));
  const args = [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${userDataDir}`,
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    `--force-device-scale-factor=${VIEWPORT.deviceScaleFactor}`,
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--mute-audio',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=Translate,BackForwardCache,AcceptCHFrame',
    'about:blank',
  ];
  // detached:true makes Chrome the leader of its own process group, so the
  // whole tree (zygote / renderer / crashpad) reaps with one `process.kill(-pid)`.
  // Without it, a startup timeout here would leak the entire tree.
  const child = spawn(CHROME_BIN, args, { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
  child.stderr.on('data', () => {}); // drain so a full pipe can never stall Chrome
  child.unref(); // we reap explicitly; don't let it pin the event loop

  // Poll the debug HTTP endpoint until it answers — more robust than parsing
  // stderr (which varies by build and stalls when the machine is loaded).
  const start = Date.now();
  let up = false;
  while (Date.now() - start < 60_000) {
    if (child.exitCode !== null) {
      killGroup(child);
      throw new Error(`chrome exited early (code ${child.exitCode})`);
    }
    try {
      const version = await httpGetJson(`http://127.0.0.1:${port}/json/version`, 1500);
      if (version && typeof version.webSocketDebuggerUrl === 'string') {
        up = true;
        break;
      }
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  if (!up) {
    killGroup(child);
    throw new Error('chrome debug endpoint not reachable within 60s');
  }

  return { child, userDataDir, port };
}

export function killChrome(handle) {
  if (!handle) return;
  killGroup(handle.child);
  try {
    fs.rmSync(handle.userDataDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup of the temp profile
  }
}

/** Connect a CDP client to the browser's first page target. */
export async function connectPage(port) {
  let page;
  const start = Date.now();
  for (;;) {
    const targets = await httpGetJson(`http://127.0.0.1:${port}/json/list`);
    page = targets.find((t) => t.type === 'page');
    if (page) break;
    if (Date.now() - start > 15_000) throw new Error('no page target appeared within 15s');
    await sleep(200);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  const client = new CdpClient(ws);
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    deviceScaleFactor: VIEWPORT.deviceScaleFactor,
    mobile: false,
  });
  return client;
}

export class CdpClient {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.on('message', (data) => this._onMessage(JSON.parse(data.toString())));
  }

  _onMessage(msg) {
    if (msg.id !== undefined) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`CDP ${p.method}: ${msg.error.message}`));
      else p.resolve(msg.result);
    } else if (msg.method) {
      for (const listener of this.listeners) listener(msg);
    }
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  waitForEvent(method, timeoutMs = 60_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners = this.listeners.filter((l) => l !== listener);
        reject(new Error(`timeout waiting for ${method}`));
      }, timeoutMs);
      const listener = (msg) => {
        if (msg.method !== method) return;
        clearTimeout(timer);
        this.listeners = this.listeners.filter((l) => l !== listener);
        resolve(msg.params);
      };
      this.listeners.push(listener);
    });
  }

  /** Evaluate JS in the page; returns the by-value result. Throws on exception. */
  async evaluate(expression, { awaitPromise = false } = {}) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
      throw new Error(`evaluate failed: ${desc}`);
    }
    return res.result.value;
  }

  /**
   * Poll `expression` until it is truthy. Tolerates evaluate errors (the context
   * is briefly destroyed across a navigation). Resolves with the truthy value.
   */
  async waitFor(expression, { timeoutMs = 60_000, intervalMs = 200 } = {}) {
    const start = Date.now();
    for (;;) {
      try {
        const value = await this.evaluate(expression);
        if (value) return value;
      } catch {
        // context not ready yet — keep polling
      }
      if (Date.now() - start > timeoutMs) {
        throw new Error(`waitFor timed out after ${timeoutMs}ms: ${expression}`);
      }
      await sleep(intervalMs);
    }
  }

  async navigate(url) {
    const loaded = this.waitForEvent('Page.loadEventFired', 60_000);
    await this.send('Page.navigate', { url });
    await loaded;
  }

  /** Emulate a media feature (e.g. prefers-reduced-motion: reduce). */
  async emulateMedia(features) {
    await this.send('Emulation.setEmulatedMedia', { features });
  }

  /**
   * Wait until async rendering (the KaTeX + shiki web workers) has quiesced.
   * markstream-vue renders math/code as empty placeholders synchronously, then
   * fills them from workers on a later tick — and a placeholder state is itself
   * DOM-stable, so a naive "signature unchanged" check fires too early on a
   * cold worker (the first navigation pays the worker-bundle fetch) and
   * captures blank math / un-highlighted code. Two phases instead:
   *   1. readiness — wait until the workers have delivered at least one `.katex`
   *      and one highlighted `pre.shiki` (every bench scene's backdrop carries
   *      both, so this is a valid "rendering happened" signal);
   *   2. stability — then require the DOM signature to be unchanged across a
   *      few reads, so progressive fills have finished.
   */
  async waitForRenderSettle({ readinessMs = 25_000, gapMs = 300, stableReads = 3 } = {}) {
    const counts = `(() => {
      const k = document.querySelectorAll('.katex').length;
      const s = document.querySelectorAll('pre.shiki, pre[class*="shiki"]').length;
      return k + ',' + s;
    })()`;
    const signature = `(() => {
      const sc = document.querySelector('[data-bench="scroller"]');
      const k = document.querySelectorAll('.katex').length;
      const s = document.querySelectorAll('pre.shiki, pre[class*="shiki"]').length;
      const h = sc ? sc.scrollHeight : 0;
      const t = sc ? sc.innerText.length : 0;
      return k + '|' + s + '|' + h + '|' + t;
    })()`;
    // Phase 1: the workers have produced real rendered output.
    const start = Date.now();
    for (;;) {
      const [k, s] = (await this.evaluate(counts)).split(',').map(Number);
      if (k > 0 && s > 0) break;
      if (Date.now() - start > readinessMs) break; // capture whatever we have
      await sleep(gapMs);
    }
    // Phase 2: that output is no longer changing.
    let last = await this.evaluate(signature);
    let same = 1;
    for (;;) {
      await sleep(gapMs);
      const cur = await this.evaluate(signature);
      if (cur === last) {
        same += 1;
        if (same >= stableReads) return cur;
      } else {
        same = 1;
        last = cur;
      }
      if (Date.now() - start > readinessMs + 8_000) return last;
    }
  }

  /** Viewport PNG screenshot → Buffer. */
  async screenshot() {
    const res = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    return Buffer.from(res.data, 'base64');
  }

  async mouseMove(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  }

  async click(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  /** Center of the first element matching `selector` (viewport coords). */
  async elementCenter(selector) {
    const rect = await this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height };
    })()`);
    return rect;
  }

  /** Focus an element and type text into it via key events. */
  async typeInto(selector, text) {
    const center = await this.elementCenter(selector);
    if (!center) throw new Error(`typeInto: selector not found: ${selector}`);
    await this.click(center.x, center.y);
    await sleep(60);
    await this.send('Input.insertText', { text });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }
}
