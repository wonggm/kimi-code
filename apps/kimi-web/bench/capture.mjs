// apps/kimi-web/bench/capture.mjs
// Pixel-capture driver. For each scene, navigates headless Chromium to a static
// BenchView pose (prefers-reduced-motion emulated so animations settle), drives
// any required real input (hover/click/type), and screenshots the 1440×900
// viewport to a PNG.
//
// Usage:
//   node bench/capture.mjs          → bench/pixel/current/<scene>.png
//   node bench/capture.mjs --ref    → bench/pixel/reference/<scene>.png
//
// The reference set (captured BEFORE any perf change) is the pixel gate's
// baseline; diff.mjs compares a fresh `current` capture against it.

import fs from 'node:fs';
import path from 'node:path';
import { connectPage, killChrome, launchChrome } from './cdp.mjs';
import { SCENES } from './scenes.mjs';
import { APP_DIR, ensureDevServer, sleep } from './util.mjs';

const CHROME_PORT = 9444;

let _chrome;
let _server;
let _cdp;
function emergencyCleanup() {
  try {
    _cdp?.close();
  } catch {
    /* ignore */
  }
  killChrome(_chrome);
  if (_server?.spawned && _server.child) {
    try {
      process.kill(-_server.child.pid, 'SIGKILL');
    } catch {
      /* gone */
    }
  }
}
process.on('exit', emergencyCleanup);
process.on('SIGINT', () => {
  emergencyCleanup();
  process.exit(130);
});
process.on('SIGTERM', () => {
  emergencyCleanup();
  process.exit(143);
});

async function main() {
  const useRef = process.argv.includes('--ref');
  const outDir = path.join(APP_DIR, 'bench', 'pixel', useRef ? 'reference' : 'current');

  const server = await ensureDevServer();
  _server = server;
  let chrome;
  let cdp;
  let exitCode = 0;
  try {
    chrome = await launchChrome(CHROME_PORT);
    _chrome = chrome;
    cdp = await connectPage(CHROME_PORT);
    _cdp = cdp;
    await cdp.emulateMedia([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    fs.mkdirSync(outDir, { recursive: true });

    for (const scene of SCENES) {
      process.stdout.write(`[capture] ${scene.name} … `);
      try {
        // Wipe per-origin storage (notably the composer draft, which persists
        // the text typed by an earlier scene — e.g. the `/` from slash-menu —
        // under the shared bench sessionId and would otherwise leak into later
        // poses). BenchView re-applies theme/glass from the query on mount.
        await cdp.evaluate('try { localStorage.clear(); } catch (e) {}').catch(() => {});
        await cdp.navigate(`${server.url}/?bench=1&${scene.query}`);
        await cdp.waitFor('window.__benchReady === true', { timeoutMs: 60_000 });
        await cdp.waitFor('window.__benchDone === true', { timeoutMs: 60_000 });
        // Let the KaTeX + shiki workers finish filling the conversation behind
        // any overlay, so the pose is deterministic for the pixel gate.
        await cdp.waitForRenderSettle();
        if (scene.interact) {
          await scene.interact(cdp);
          await sleep(scene.settleMs ?? 400);
        } else {
          await sleep(150);
        }
        const png = await cdp.screenshot();
        fs.writeFileSync(path.join(outDir, `${scene.name}.png`), png);
        console.log('ok');
      } catch (err) {
        exitCode = 1;
        console.log(`FAILED: ${err.message}`);
      }
    }
    console.log(`[capture] wrote ${SCENES.length} scenes → ${path.relative(APP_DIR, outDir)}/`);
  } finally {
    cdp?.close();
    killChrome(chrome);
    await server.stop();
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error('[capture] fatal:', err);
  process.exit(1);
});
