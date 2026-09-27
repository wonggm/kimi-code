// apps/kimi-web/bench/profile.mjs
// CPU profile for one bench scenario. Launches headless Chromium, starts the
// V8 sampling profiler, navigates to the scenario, and aggregates the profile by
// self time — first by function, then by source file — so a slow scenario can be
// attributed to real code instead of guessed at.
//
// The profile spans the whole page load, so it also covers the scene's mount and
// settle phase, not only the sampled window. That is deliberate: for the heavy
// scenarios the mount is part of the cost a user waits through.
//
// Usage: node bench/profile.mjs [scenario] [--keep-raw]
//   scenario defaults to scroll-long; --keep-raw also writes the full profile
//   next to the summary as profile-<scenario>.cpuprofile.

import fs from 'node:fs';
import path from 'node:path';
import { connectPage, killChrome, launchChrome } from './cdp.mjs';
import { APP_DIR, ensureDevServer, sleep } from './util.mjs';

// Overridable so two sessions measuring at once cannot fight over one port.
const CHROME_PORT = Number(process.env.BENCH_CHROME_PORT) || 9555;
const RESULTS_DIR = path.join(APP_DIR, 'bench', 'results');

const DONE_TIMEOUT_MS = {
  'streaming-replay': 180_000,
  'scroll-long': 150_000,
  'dialog-storm': 120_000,
  'dock-toc': 120_000,
};

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const scenario = args[0] ?? 'scroll-long';
const keepRaw = process.argv.includes('--keep-raw');
const TOP_N = 30;

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
  if (_server?.spawned && _server?.child) {
    try {
      process.kill(-_server.child.pid, 'SIGKILL');
    } catch {
      /* gone */
    }
  }
}
process.on('exit', emergencyCleanup);

/** Shorten a URL to something readable: strip the origin and the vite cache key. */
function shortSource(url) {
  if (!url) return '(native)';
  if (url.startsWith('node:')) return url;
  const file = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  return file.replace(/^\//, '').replace(/^(@fs\/)?/, '');
}

/** Which part of the program the samples landed in: our source, a package that
 *  keeps its path in the profile, a pre-bundled dependency whose package name
 *  the chunk hash hides, or browser work with no script at all. */
function originOf(url) {
  if (!url) return 'browser (no script)';
  if (url.includes('node_modules/')) return 'named package';
  // Under the dev server our source arrives as `http://127.0.0.1:5175/src/...`,
  // with no path back to the package, so match the source directory itself.
  if (url.includes('/src/')) return 'app source';
  return 'pre-bundled dependency';
}

function byOriginOf(byId, selfByNode) {
  const byOrigin = new Map();
  const byAppLabel = new Map();
  for (const [id, us] of selfByNode) {
    const frame = byId.get(id)?.callFrame;
    if (!frame) continue;
    const origin = originOf(frame.url ?? '');
    byOrigin.set(origin, (byOrigin.get(origin) ?? 0) + us);
    if (origin !== 'app source') continue;
    const label = frame.url
      ? `${frame.functionName || '(anonymous)'} @ ${shortSource(frame.url)}:${frame.lineNumber + 1}`
      : frame.functionName || '(anonymous)';
    byAppLabel.set(label, (byAppLabel.get(label) ?? 0) + us);
  }
  return { byOrigin, byAppLabel };
}

/**
 * Sum each sample's time into its own node, then roll the nodes up. A node with
 * no function name (anonymous) falls back to its URL, and native frames are
 * attributed to the runtime rather than dropped.
 *
 * Self time says where the samples landed; inclusive time says what a call cost
 * in total, which is the number that says whether mounting a row is the cost or
 * the scrolling over it.
 */
function aggregate(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const selfByNode = new Map();
  let totalUs = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const us = profile.timeDeltas[i] ?? 0;
    totalUs += us;
    const id = profile.samples[i];
    selfByNode.set(id, (selfByNode.get(id) ?? 0) + us);
  }

  const byFunction = new Map();
  const byFile = new Map();
  for (const [id, us] of selfByNode) {
    const frame = byId.get(id)?.callFrame;
    if (!frame) continue;
    const where = frame.url ? `${frame.functionName || '(anonymous)'} @ ${shortSource(frame.url)}:${frame.lineNumber + 1}` : frame.functionName || '(anonymous)';
    byFunction.set(where, (byFunction.get(where) ?? 0) + us);
    byFile.set(shortSource(frame.url), (byFile.get(shortSource(frame.url)) ?? 0) + us);
  }

  // Inclusive time: a node's own samples plus every descendant's, rolled up the
  // call tree once. A node shared by several parents (recursion) is walked once
  // and reused, so a sample is never counted twice for the same node.
  const inclusiveById = new Map(selfByNode);
  const walked = new Set();
  const visit = (id) => {
    if (walked.has(id)) return inclusiveById.get(id) ?? 0;
    let sum = inclusiveById.get(id) ?? 0;
    for (const child of byId.get(id)?.children ?? []) sum += visit(child);
    inclusiveById.set(id, sum);
    walked.add(id);
    return sum;
  };
  for (const node of profile.nodes) visit(node.id);
  const byInclusive = new Map();
  for (const node of profile.nodes) {
    const total = inclusiveById.get(node.id);
    if (!total) continue;
    const frame = node.callFrame;
    if (!frame) continue;
    const where = frame.url ? `${frame.functionName || '(anonymous)'} @ ${shortSource(frame.url)}:${frame.lineNumber + 1}` : frame.functionName || '(anonymous)';
    byInclusive.set(where, (byInclusive.get(where) ?? 0) + total);
  }

  const { byOrigin, byAppLabel } = byOriginOf(byId, selfByNode);
  return { totalUs, byFunction, byFile, byInclusive, byId, selfByNode, byOrigin, byAppLabel };
}

/**
 * Self time rolled up over the subtree of every node whose label contains
 * `needle`. This is how a cost that a profile charges to one frame (a component
 * setup, a render pass) is broken down into the work that frame actually did.
 */
function underSubtree(byId, selfByNode, needle) {
  const roots = [];
  for (const node of byId.values()) {
    const frame = node.callFrame;
    if (!frame) continue;
    const label = frame.url ? `${frame.functionName || '(anonymous)'} @ ${shortSource(frame.url)}` : frame.functionName || '(anonymous)';
    if (label.includes(needle)) roots.push(node.id);
  }
  const byLabel = new Map();
  const byOrigin = new Map();
  let totalUs = 0;
  for (const root of roots) {
    const stack = [root];
    const seen = new Set();
    while (stack.length > 0) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...(byId.get(id)?.children ?? []));
      const us = selfByNode.get(id);
      if (!us) continue;
      const frame = byId.get(id)?.callFrame;
      if (!frame) continue;
      const url = frame.url ?? '';
      const label = frame.url ? `${frame.functionName || '(anonymous)'} @ ${shortSource(frame.url)}:${frame.lineNumber + 1}` : frame.functionName || '(anonymous)';
      byLabel.set(label, (byLabel.get(label) ?? 0) + us);
      // Four origins, because the question is "how much of this is ours?":
      // the app's own source, a package that keeps its path in the profile, a
      // pre-bundled dependency whose package name the chunk hash hides, and
      // browser work with no script at all.
      const origin = originOf(url);
      byOrigin.set(origin, (byOrigin.get(origin) ?? 0) + us);
      totalUs += us;
    }
  }
  return { byLabel, byOrigin, totalUs, roots: roots.length };
}

function top(map, n) {
  return [...map.entries()].toSorted((a, b) => b[1] - a[1]).slice(0, n);
}

function printTable(title, rows, totalUs) {
  console.log(`\n${title}`);
  for (const [label, us] of rows) {
    const pct = totalUs > 0 ? (us / totalUs) * 100 : 0;
    console.log(`  ${pct.toFixed(1).padStart(5)}%  ${(us / 1000).toFixed(0).padStart(7)}ms  ${label}`);
  }
}

const NO_GLASS_SOURCE = `
(() => {
  const css = '*{backdrop-filter:none !important;-webkit-backdrop-filter:none !important}';
  const add = () => {
    if (!document.documentElement || document.getElementById('bench-no-glass')) return;
    const style = document.createElement('style');
    style.id = 'bench-no-glass';
    style.textContent = css;
    document.documentElement.appendChild(style);
  };
  add();
  document.addEventListener('DOMContentLoaded', add);
})();
`;

async function main() {
  _server = await ensureDevServer();
  let chrome;
  try {
    chrome = await launchChrome(CHROME_PORT);
    _chrome = chrome;
    _cdp = await connectPage(CHROME_PORT);
    const cdp = _cdp;
    // 100 µs sampling: the default 1000 µs misses short bursts, and the cheap
    // scenarios finish in a few seconds.
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
    await cdp.send('Profiler.start');
    // --no-glass is a measurement switch, not a product change: it strips the
    // backdrop blur before the first paint, which is the only way to attribute
    // a scenario's dropped frames to the composited glass surfaces.
    if (process.argv.includes('--no-glass')) {
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: NO_GLASS_SOURCE });
    }
    process.stdout.write(`[profile] ${scenario} … `);
    await cdp.navigate(`${_server.url}/?bench=1&scenario=${scenario}`);
    if (scenario === 'dock-toc') {
      // The TOC expand is a pure-CSS :hover, so the page hands off to the driver
      // mid-scenario: wait for the phase marker, sweep the rail, then release it.
      await cdp.waitFor('window.__benchReady === true', { timeoutMs: 60_000 });
      await cdp.waitFor('window.__benchPhase === "toc"', { timeoutMs: 90_000 });
      const rail = await cdp.elementCenter('.conversation-toc');
      if (rail) {
        for (let i = 0; i < 10; i++) {
          await cdp.mouseMove(rail.x, rail.y);
          await sleep(220);
          await cdp.mouseMove(24, rail.y);
          await sleep(160);
        }
      }
      await cdp.evaluate('window.__benchStop = true');
    }
    await cdp.waitFor('window.__benchDone === true', { timeoutMs: DONE_TIMEOUT_MS[scenario] ?? 150_000 });
    const metrics = await cdp.evaluate('window.__bench || null');
    const memory = await cdp.evaluate('window.__benchMemory || null');
    const { profile } = await cdp.send('Profiler.stop');
    const { totalUs, byFunction, byFile, byInclusive, byId, selfByNode, byOrigin, byAppLabel } = aggregate(profile);
    console.log(
      metrics
        ? `p95=${metrics.p95}ms dropped=${metrics.droppedPct}% longtasks=${metrics.longtaskCount}(${metrics.longtaskMs}ms)`
        : 'no metrics',
    );
    if (memory) {
      console.log(
        `heap=${memory.heapEndMb}MB nodes=${memory.domNodesEnd} detached=${memory.detachedNodes} listeners=${memory.eventListeners}`,
      );
    }
    console.log(`sampled ${(totalUs / 1000).toFixed(0)}ms of main-thread time`);
    printTable(`self time by origin`, top(byOrigin, 8), totalUs);
    printTable(`app source, top self time`, top(byAppLabel, 15), totalUs);
    printTable(`top self time by function`, top(byFunction, TOP_N), totalUs);
    printTable(`top total time by function (self + children)`, top(byInclusive, TOP_N), totalUs);
    printTable(`top self time by file`, top(byFile, 20), totalUs);
    const under = process.argv.find((a) => a.startsWith('--under='))?.slice('--under='.length);
    if (under) {
      const { byLabel, byOrigin, totalUs: subUs, roots } = underSubtree(byId, selfByNode, under);
      console.log(`\nself time under "${under}" (${roots} frame(s), ${(subUs / 1000).toFixed(0)}ms)`);
      printTable(`  where it sits`, top(byOrigin, 8), subUs);
      printTable(`  under ${under}`, top(byLabel, TOP_N), subUs);
    }
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    if (keepRaw) {
      const raw = path.join(RESULTS_DIR, `profile-${scenario}.cpuprofile`);
      fs.writeFileSync(raw, `${JSON.stringify(profile)}\n`);
      console.log(`\n[profile] wrote ${path.relative(APP_DIR, raw)}`);
    }
  } finally {
    _cdp?.close();
    killChrome(chrome);
    await _server.stop();
    await sleep(100);
  }
}

main().catch((error) => {
  console.error('[profile] fatal:', error);
  process.exit(1);
});
