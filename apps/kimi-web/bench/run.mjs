// apps/kimi-web/bench/run.mjs
// Metrics driver. Launches headless Chromium, runs each scenario SERIALLY over
// raw CDP (one browser instance at a time — the machine has ~5 GB RAM), harvests
// the in-page sampler results from window.__bench, and writes
// bench/results/<scenario>.json plus a combined bench/results/latest.json
// (or baseline.json only when invoked with --save-baseline).
//
// Usage: node bench/run.mjs        (starts the dev server itself if not running)

import fs from 'node:fs';
import path from 'node:path';
import { connectPage, killChrome, launchChrome, VIEWPORT } from './cdp.mjs';
import { APP_DIR, ensureDevServer, sleep } from './util.mjs';

const SCENARIOS = ['streaming-replay', 'scroll-long', 'dialog-storm', 'dock-toc'];
const RESULTS_DIR = path.join(APP_DIR, 'bench', 'results');
const CHROME_PORT = 9333;

// Safety net: reap Chrome + the dev server even on an uncaught throw or signal,
// so the harness never leaves a process running after it exits.
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

/** Per-scenario wall-clock budget for window.__benchDone to appear. */
const DONE_TIMEOUT_MS = {
  'streaming-replay': 180_000, // ~2000 tokens at 40 tok/s ≈ 50s + settles
  'scroll-long': 150_000,
  'dialog-storm': 120_000,
  'dock-toc': 120_000,
};

async function runScenario(cdp, baseUrl, name) {
  await cdp.navigate(`${baseUrl}/?bench=1&scenario=${name}`);

  if (name === 'dock-toc') {
    // Driver-assisted: the page runs the dock cycles, signals phase 'toc', then
    // keeps sampling while we sweep a real mouse over the TOC rail (its expand
    // is a pure-CSS :hover), and finalizes once we set window.__benchStop.
    await cdp.waitFor('window.__benchReady === true', { timeoutMs: 60_000 });
    await cdp.waitFor('window.__benchPhase === "toc"', { timeoutMs: 90_000 });
    const rail = await cdp.elementCenter('.conversation-toc');
    if (rail) {
      for (let i = 0; i < 10; i++) {
        await cdp.mouseMove(rail.x, rail.y);
        await sleep(220);
        await cdp.mouseMove(24, rail.y); // leave the rail to collapse it
        await sleep(160);
      }
    }
    await cdp.evaluate('window.__benchStop = true');
  }

  await cdp.waitFor('window.__benchDone === true', { timeoutMs: DONE_TIMEOUT_MS[name] ?? 120_000 });
  const error = await cdp.evaluate('window.__benchError || null');
  const metrics = await cdp.evaluate('window.__bench || null');
  return { error, metrics };
}

async function main() {
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
    fs.mkdirSync(RESULTS_DIR, { recursive: true });

    const baseline = {
      generatedAt: new Date().toISOString(),
      viewport: VIEWPORT,
      scenarios: {},
    };

    for (const name of SCENARIOS) {
      process.stdout.write(`[bench] ${name} … `);
      try {
        const { error, metrics } = await runScenario(cdp, server.url, name);
        const record = { scenario: name, viewport: VIEWPORT, error: error ?? null, metrics };
        fs.writeFileSync(path.join(RESULTS_DIR, `${name}.json`), `${JSON.stringify(record, null, 2)}\n`);
        baseline.scenarios[name] = metrics;
        if (error) {
          exitCode = 1;
          console.log(`ERROR: ${error}`);
        } else if (!metrics || metrics.frames === 0) {
          exitCode = 1;
          console.log('NO SAMPLES (frames=0)');
        } else {
          console.log(
            `p50=${metrics.p50}ms p95=${metrics.p95}ms p99=${metrics.p99}ms ` +
              `dropped=${metrics.droppedPct}% longtasks=${metrics.longtaskCount}(${metrics.longtaskMs}ms) frames=${metrics.frames}`,
          );
        }
      } catch (err) {
        exitCode = 1;
        baseline.scenarios[name] = null;
        console.log(`FAILED: ${err.message}`);
      }
      await sleep(500);
    }

    // `pnpm bench` measures the current tree; it must never clobber the
    // pre-change reference. Pass --save-baseline to (re)record the baseline.
    const outName = process.argv.includes('--save-baseline') ? 'baseline.json' : 'latest.json';
    fs.writeFileSync(path.join(RESULTS_DIR, outName), `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`[bench] wrote ${path.relative(APP_DIR, RESULTS_DIR)}/${outName}`);
  } finally {
    cdp?.close();
    killChrome(chrome);
    await server.stop();
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error('[bench] fatal:', err);
  process.exit(1);
});
