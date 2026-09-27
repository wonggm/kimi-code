// apps/kimi-web/bench/run.mjs
// Metrics driver. Launches headless Chromium, runs each scenario SERIALLY over
// raw CDP (one browser instance at a time — the machine has ~5 GB RAM), harvests
// the in-page sampler results from window.__bench, and writes
// bench/results/<scenario>.json plus a combined bench/results/latest.json
// (or baseline.json only when invoked with --save-baseline).
//
// Usage: node bench/run.mjs [--save-baseline] [--repeat=N] [--detached]
//   --save-baseline  write results/baseline.json instead of latest.json
//   --repeat=N       run every scenario N times; the middle p95 is the record
//                    (--twice is the same as --repeat=2)
//   --detached       count detached DOM nodes from a heap snapshot (slow)

import fs from 'node:fs';
import path from 'node:path';
import { connectPage, killChrome, launchChrome, startCpuProfile, stopCpuProfile, summarizeCpu, VIEWPORT } from './cdp.mjs';
import { countDetachedNodes } from './heap-snapshot.mjs';
import { APP_DIR, ensureDevServer, sleep } from './util.mjs';

const SCENARIOS = ['streaming-replay', 'scroll-long', 'dialog-storm', 'dock-toc'];
const RESULTS_DIR = path.join(APP_DIR, 'bench', 'results');
// Overridable so two sessions measuring at once cannot fight over one port.
const CHROME_PORT = Number(process.env.BENCH_CHROME_PORT) || 9333;

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

/**
 * Renderer-side memory counters, which the page cannot see. `Memory.getDOMCounters`
 * gives every node the renderer holds plus the live listener count. The heap is
 * read again after a forced collection, which separates "still reachable" from
 * "waiting to be swept" — the number that says whether a run leaks. Detached
 * nodes have no live counter in current Chromium, so they come from a heap
 * snapshot instead: exact, but a snapshot of a 130 MB heap does not finish in
 * reasonable time here, so it stays behind `--detached` for the small-heap
 * scenarios. Anything unavailable reads as -1, never as a zero.
 */
async function readRendererMemory(cdp, { detached }) {
  const out = {
    rendererNodes: -1,
    eventListeners: -1,
    detachedNodes: -1,
    detachedBytes: -1,
    heapAfterGcMb: -1,
  };
  try {
    const counters = await cdp.send('Memory.getDOMCounters');
    if (typeof counters.nodes === 'number') out.rendererNodes = counters.nodes;
    if (typeof counters.jsEventListeners === 'number') out.eventListeners = counters.jsEventListeners;
  } catch {
    /* Memory domain unavailable */
  }
  try {
    await cdp.send('HeapProfiler.collectGarbage');
    const usage = await cdp.send('Runtime.getHeapUsage');
    out.heapAfterGcMb = Math.round((usage.usedSize / (1024 * 1024)) * 100) / 100;
  } catch {
    /* collection unavailable */
  }
  if (detached) {
    try {
      const snapshot = await countDetachedNodes(cdp);
      out.detachedNodes = snapshot.detachedNodes;
      out.detachedBytes = snapshot.detachedBytes;
    } catch (error) {
      console.error(`[bench] heap snapshot failed: ${error.message}`);
    }
  }
  return out;
}

async function runScenario(cdp, baseUrl, name, opts) {
  // The profile spans the page load, so it covers the scene's mount and settle
  // as well as the sampled window. That is deliberate: a user waits for both.
  await startCpuProfile(cdp);
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
  const pageMemory = await cdp.evaluate('window.__benchMemory || null');
  const renderer = await readRendererMemory(cdp, opts);
  const memory = pageMemory ? { ...pageMemory, ...renderer } : null;
  const cpu = summarizeCpu(await stopCpuProfile(cdp));
  return { error, metrics, memory, cpu };
}

function cpuLine(cpu) {
  if (!cpu) return 'cpu=n/a';
  return `busy=${cpu.busyMs}ms idle=${cpu.idleMs}ms total=${cpu.totalMs}ms`;
}

function memoryLine(memory) {
  if (!memory) return 'memory=n/a';
  return (
    `heap=${memory.heapEndMb}MB(peak ${memory.heapPeakMb}) ` +
    `elements=${memory.domNodesEnd}(peak ${memory.domNodesPeak}) ` +
    `nodes=${memory.rendererNodes} afterGC=${memory.heapAfterGcMb}MB listeners=${memory.eventListeners}`
  );
}

/**
 * Pick the run that represents the scenario: the one whose busy time is the
 * middle of the sorted busy times. Frame-time percentiles swing by 10-30%
 * between passes on unchanged code, which is the spread the performance work is
 * judged against, so the representative run is chosen on the measure that
 * repeats. Every run is kept in the record either way.
 */
function representativeRun(runs) {
  if (runs.length === 1) return runs[0];
  const sorted = [...runs].toSorted((a, b) => (a.cpu?.busyMs ?? Infinity) - (b.cpu?.busyMs ?? Infinity));
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

async function main() {
  const saveBaseline = process.argv.includes('--save-baseline');
  // Each scenario runs this many times, in the same browser. Three is the
  // smallest count that survives the run-to-run spread; the first and last run
  // also answer "does a second run grow?".
  const repeatArg = process.argv.find((a) => a.startsWith('--repeat='));
  const runsPerScenario = Number(repeatArg?.split('=')[1] ?? (process.argv.includes('--twice') ? 2 : 1));
  if (!Number.isInteger(runsPerScenario) || runsPerScenario < 1) {
    throw new Error(`--repeat needs a positive integer, got ${repeatArg}`);
  }
  // Detached nodes come from a heap snapshot: seconds and a few hundred MB per
  // scenario, so they are opt-in rather than on every run.
  const opts = { detached: process.argv.includes('--detached') };
  // BENCH_SCENARIOS=a,b runs a subset, so a measurement can be kept to a single
  // scenario. A full pass is 12 runs of a dev server plus a headless browser on
  // a machine that is often busy with something else; one scenario at a time
  // keeps each command short and leaves the machine free in between.
  const wanted = process.env.BENCH_SCENARIOS?.split(',').map((s) => s.trim()).filter(Boolean);
  const scenarios = wanted?.length ? SCENARIOS.filter((name) => wanted.includes(name)) : SCENARIOS;
  const unknown = wanted?.filter((name) => !SCENARIOS.includes(name)) ?? [];
  if (unknown.length > 0) throw new Error(`unknown scenario(s): ${unknown.join(', ')}`);
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
      memory: {},
      cpu: {},
    };

    for (const name of scenarios) {
      process.stdout.write(`[bench] ${name} … `);
      try {
        const runs = [];
        for (let i = 0; i < runsPerScenario; i++) {
          runs.push(await runScenario(cdp, server.url, name, opts));
        }
        const best = representativeRun(runs);
        const record = {
          scenario: name,
          viewport: VIEWPORT,
          runsPerScenario,
          error: best.error ?? null,
          metrics: best.metrics,
          memory: best.memory,
          cpu: best.cpu,
          runs: runs.map((r) => ({ error: r.error, metrics: r.metrics, memory: r.memory, cpu: r.cpu })),
        };
        fs.writeFileSync(path.join(RESULTS_DIR, `${name}.json`), `${JSON.stringify(record, null, 2)}\n`);
        baseline.scenarios[name] = best.metrics;
        baseline.memory[name] = best.memory;
        baseline.cpu[name] = best.cpu;
        const { error, metrics, memory, cpu } = best;
        if (error) {
          exitCode = 1;
          console.log(`ERROR: ${error}`);
        } else if (!metrics || metrics.frames === 0) {
          exitCode = 1;
          console.log('NO SAMPLES (frames=0)');
        } else {
          console.log(
            `${cpuLine(cpu)} p95=${metrics.p95}ms dropped=${metrics.droppedPct}% ` +
              `longtasks=${metrics.longtaskCount}(${metrics.longtaskMs}ms) ${memoryLine(memory)}`,
          );
        }
        if (runs.length > 1) {
          const spread = runs.map((r) => (r.cpu ? `${r.cpu.busyMs}` : 'none')).join('  ');
          console.log(`  runs (busy ms): ${spread}`);
          const first = runs[0].memory;
          const last = runs.at(-1).memory;
          if (first && last) {
            console.log(
              `  first→last heap ${first.heapEndMb}→${last.heapEndMb}MB ` +
                `afterGC ${first.heapAfterGcMb}→${last.heapAfterGcMb}MB listeners ${first.eventListeners}→${last.eventListeners}`,
            );
          }
        }
      } catch (error) {
        exitCode = 1;
        baseline.scenarios[name] = null;
        console.log(`FAILED: ${error.message}`);
      }
      await sleep(500);
    }

    // `pnpm bench` measures the current tree; it must never clobber the
    // pre-change reference. Pass --save-baseline to (re)record the baseline.
    const outName = saveBaseline ? 'baseline.json' : 'latest.json';
    const outPath = path.join(RESULTS_DIR, outName);
    let payload = baseline;
    // A subset run must not drop the scenarios it did not measure, so a saved
    // baseline keeps their previous entries and replaces only the ones run now.
    if (saveBaseline && scenarios.length < SCENARIOS.length && fs.existsSync(outPath)) {
      let previous = {};
      try {
        previous = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      } catch {
        previous = {};
      }
      const keep = (record) =>
        Object.fromEntries(Object.entries(record ?? {}).filter(([key]) => !scenarios.includes(key)));
      payload = {
        ...baseline,
        scenarios: { ...keep(previous.scenarios), ...baseline.scenarios },
        memory: { ...keep(previous.memory), ...baseline.memory },
        cpu: { ...keep(previous.cpu), ...baseline.cpu },
      };
    }
    fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`[bench] wrote ${path.relative(APP_DIR, RESULTS_DIR)}/${outName}`);
  } finally {
    cdp?.close();
    killChrome(chrome);
    await server.stop();
  }
  process.exit(exitCode);
}

main().catch((error) => {
  console.error('[bench] fatal:', error);
  process.exit(1);
});
