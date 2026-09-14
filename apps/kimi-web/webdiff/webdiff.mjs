// apps/kimi-web/webdiff/webdiff.mjs
// CLI for the upstream-vs-fork web UI comparison. Serves the upstream bundle
// and the fork build against the same deterministic mock state, captures every
// requested surface with the same viewport, colour scheme and reduced-motion
// setting, and diffs DOM structure, computed styles, i18n strings, class names,
// rendered HTML and the CSS inventory.
//
// The two apps must be served from the SAME mock state, so the mock runs twice
// with a different static root. `--real` captures an extra tree from a live
// server (a reference for visual review); the blocker diff stays mock-vs-mock.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, '..');
const REPO = path.resolve(APP_DIR, '..', '..');

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, mobile: false },
};

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = process.argv[i + 1];
  return value === undefined || value.startsWith('--') ? true : value;
}

function argList(name, fallback) {
  const value = arg(name);
  if (typeof value !== 'string') return fallback;
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function resolveChromeBin() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
  if (!fs.existsSync(cache)) return '';
  const candidates = fs
    .readdirSync(cache)
    .filter((name) => name.startsWith('chromium-'))
    .map((name) => path.join(cache, name, 'chrome-linux64', 'chrome'))
    .filter((bin) => fs.existsSync(bin))
    .sort();
  return candidates.at(-1) ?? '';
}

function readMobileWidth() {
  try {
    const css = fs.readFileSync(path.join(APP_DIR, 'src', 'style.css'), 'utf8');
    const match = css.match(/--p-bp-sm\s*:\s*(\d+)px/);
    if (match) return Math.max(320, Math.min(430, Number(match[1]) - 1));
  } catch {
    /* fall through to the default */
  }
  return 390;
}

function nextRunDir(base) {
  fs.mkdirSync(base, { recursive: true });
  let index = 1;
  while (fs.existsSync(path.join(base, `webdiff-run${index}`))) index += 1;
  return path.join(base, `webdiff-run${index}`);
}

function extractUpstream(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const result = spawnSync('sh', ['-c', `git archive upstream/main apps/kimi-code/dist-web | tar -x -C ${JSON.stringify(dir)} --strip-components=3`], { cwd: REPO, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('could not extract apps/kimi-code/dist-web from upstream/main');
  return dir;
}

const upstreamArg = arg('upstream');
const forkDist = path.resolve(REPO, typeof arg('fork') === 'string' ? arg('fork') : 'apps/kimi-web/dist');
const outRoot = path.resolve(REPO, typeof arg('out') === 'string' ? arg('out') : '.tmp');
const runDir = arg('out') ? path.resolve(REPO, arg('out')) : nextRunDir(path.join(outRoot));
const walk = arg('walk') === true;
const breakpoints = argList('breakpoints', ['desktop']);
const themes = argList('themes', ['dark']);
const locales = argList('locales', ['en']);
const sceneFilter = argList('scene', []);
const maxWalk = Number(arg('max-walk', 24));
const basePort = Number(arg('port-base', 5271));
const chromeDebugPort = Number(arg('debug-port', 9333));
const token = typeof arg('token') === 'string' ? arg('token') : 'mock-token';
const realUrl = typeof arg('real') === 'string' ? arg('real') : '';
const allowlistPath = path.resolve(REPO, typeof arg('allowlist') === 'string' ? arg('allowlist') : 'apps/kimi-web/webdiff/allowlist.json');
const chromeBin = resolveChromeBin();
if (!chromeBin) {
  console.error('webdiff: no Chromium found — set CHROME_BIN or install the playwright chromium cache');
  process.exit(2);
}
process.env.CHROME_BIN = chromeBin;

const upstreamDist = typeof upstreamArg === 'string' ? path.resolve(REPO, upstreamArg) : extractUpstream(path.join(REPO, '.tmp', 'upstream-web'));
if (!fs.existsSync(path.join(upstreamDist, 'index.html'))) {
  console.error(`webdiff: upstream dist has no index.html at ${upstreamDist}`);
  process.exit(2);
}
if (!fs.existsSync(path.join(forkDist, 'index.html'))) {
  console.error(`webdiff: fork dist has no index.html at ${forkDist} — build it first (heap-capped: NODE_OPTIONS='--max-old-space-size=3072' pnpm -C apps/kimi-web run build)`);
  process.exit(2);
}

const { startMock } = await import('./mock-server.mjs');
const { captureSurface, openSurface, buildSeed, BOOT_KEYS, hash, changed } = await import('./capture.mjs');
const { BASE_SCENES, DISCOVER_EXPR, SKIP_LABEL, MAX_WALK_SURFACES, PRIORITY_CLASS, slug } = await import('./surfaces.mjs');
const { compareRun, renderMarkdown, cssInventory } = await import('./compare.mjs');
// cdp.mjs reads CHROME_BIN at module load, so it must be imported after the
// environment is set — hence the dynamic imports above and here.
const { launchChrome, connectPage, killChrome } = await import('../bench/cdp.mjs');

VIEWPORTS.mobile = { width: readMobileWidth(), height: 844, mobile: true };

const combos = [];
for (const breakpoint of breakpoints) {
  for (const theme of themes) {
    for (const locale of locales) combos.push({ name: `${breakpoint}-${theme}-${locale}`, breakpoint, theme, locale });
  }
}

// Which app to capture. A walk normally captures both against their own mock;
// `--apps fork` captures only one, so the two apps of the same combination can
// run as two processes instead of one after the other. The merged run needs both
// halves (see .tmp/par/merge.mjs); a single-app run therefore skips its own
// comparison and only contributes its captures.
const appFilter = argList('apps', ['upstream', 'fork']);
const MOCK_PORT_OFFSET = { upstream: 0, fork: 1 };
const mocks = {};
for (const app of appFilter) {
  mocks[app] = await startMock({
    root: app === 'upstream' ? upstreamDist : forkDist,
    port: basePort + MOCK_PORT_OFFSET[app],
    token,
    // The mock's two pending-card sessions exist for a manual pass; the walk
    // lists the original session alone. A sidebar row is a control the walk
    // clicks, and the extra rows move its coordinate targets, which cost a run
    // seven blockers that were one app walking a different session than the
    // other (see the fixture's session list).
    env: { ...process.env, MOCK_EXTRA_SESSIONS: '0' },
  });
}
let chrome;
let cdp;
let exitCode = 0;
const coverage = {};

async function shutdown() {
  try {
    cdp?.close();
  } catch {
    /* ignore */
  }
  killChrome(chrome);
  for (const app of Object.keys(mocks)) await mocks[app].stop();
}
process.on('exit', () => {
  try {
    killChrome(chrome);
  } catch {
    /* ignore */
  }
});

async function applyViewport(breakpoint) {
  const viewport = VIEWPORTS[breakpoint] ?? VIEWPORTS.desktop;
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  });
}

async function captureApp(app, combo, scenes) {
  const dir = path.join(runDir, app, combo.name);
  const seed = buildSeed({ app, locale: combo.locale, theme: combo.theme, token });
  const origin = `${mocks[app].url}/`;
  const signatures = {};
  const resolvedSteps = {};
  const notOpened = [];
  const requirements = [];

  // A scene's requirements are checked inside captureSurface, on the live page in
  // the state its steps left behind — for a `then` stage, the second state of the
  // transition. They are recorded even when no capture was written: a scene whose
  // surface never opened (the fork has no goal pill) is exactly the case the
  // requirement exists to report.
  const collect = (scene, stage, checks) => {
    for (const check of checks ?? []) requirements.push({ scene: scene.name, stage, ...check });
  };

  for (const scene of scenes) {
    // Non-root scenes must pass the root scene's signature as the baseline.
    // Without it captureSurface accepts the FIRST attempt variant
    // unconditionally, so every later route in `attempts` is dead code — on
    // mobile that meant the settings routes after `.side-footer-settings`
    // (absent on mobile) never ran, and every mobile view recorded `settings`
    // as not-opened.
    const result = await captureSurface(cdp, {
      url: origin,
      outDir: dir,
      name: scene.name,
      steps: scene.steps,
      attempts: scene.attempts ?? null,
      seed,
      baseline: scene.name === 'main' ? null : (signatures.main ?? null),
      expect: scene.expect instanceof RegExp ? scene.expect : null,
      requires: scene.requires ?? null,
    });
    signatures[scene.name] = result.signature;
    resolvedSteps[scene.name] = result.steps ?? scene.steps;
    const reference = signatures.main;
    const changedFromMain = reference ? changed(reference, result.signature) : true;
    const lines = result.scene?.texts?.lines ?? [];
    const expect = scene.expect instanceof RegExp ? scene.expect : null;
    const looksLikeTarget = !expect || lines.some((line) => expect.test(line));
    if (scene.name !== 'main' && scene.snapshot !== false && (!changedFromMain || !looksLikeTarget)) {
      notOpened.push(scene.name);
      process.stdout.write(
        `webdiff: ${app} ${combo.name} ${scene.name} NOT OPENED — ${!changedFromMain ? 'identical to main' : 'changed, but the surface does not look like its target'}\n`,
      );
    } else {
      process.stdout.write(`webdiff: ${app} ${combo.name} ${scene.name} (gaps: ${result.gaps.length})\n`);
    }
    collect(scene, null, result.requirements);

    if (scene.then) {
      // The second capture point of a transition: replay what opened the surface,
      // then the extra action. `expect` is dropped (it describes the first state)
      // and the closed state is usually identical to main, so nothing is written;
      // the requirement check is the point of the stage.
      const stageName = scene.then.name ?? 'after';
      const thenResult = await captureSurface(cdp, {
        url: origin,
        outDir: dir,
        name: `${scene.name}-${stageName}`,
        steps: [...(result.steps ?? scene.steps), ...(scene.then.steps ?? [])],
        seed,
        baseline: signatures.main ?? null,
        requires: scene.then.requires ?? null,
      });
      collect(scene, stageName, thenResult.requirements);
      process.stdout.write(`webdiff: ${app} ${combo.name} ${scene.name}-${stageName}\n`);
    }
  }

  if (!walk) return { notOpened, walk: null, requirements };

  const stats = { phases: {}, hoverSurfaces: 0, clickSurfaces: 0, noChange: 0 };
  const produced = [];
  const cap = Math.min(maxWalk, MAX_WALK_SURFACES);

  // A phase is a container whose contents are worth discovering. A scene that
  // states requirements poses one interaction instead ("open the pill, assert the
  // pane"), so walking inside it discovers nothing new — its panels are already
  // reachable from the main phase — and would pay a phase's cost for each
  // behaviour scene. Its captures are judged by its requirements.
  for (const phase of scenes.filter((scene) => !scene.requires)) {
    const baseline = signatures[phase.name];
    const phaseSteps = resolvedSteps[phase.name] ?? phase.steps;
    const phaseStats = { discovered: 0, walkable: 0, skipped: 0, hovered: 0, clicked: 0 };
    stats.phases[phase.name] = phaseStats;
    if (notOpened.includes(phase.name)) {
      process.stdout.write(`webdiff: ${app} ${combo.name} ${phase.name} walk skipped — the phase surface never opened\n`);
      continue;
    }
    await openSurface(cdp, { url: origin, steps: phaseSteps, seed });
    const found = await cdp.evaluate(DISCOVER_EXPR);
    const walkable = found
      .filter((entry) => !SKIP_LABEL.test(entry.label))
      .map((entry, index) => ({ ...entry, index }))
      .sort((a, b) => Number(b.classes.includes(PRIORITY_CLASS)) - Number(a.classes.includes(PRIORITY_CLASS)))
      .slice(0, cap);
    // The shared controls name their surfaces without the discovery index, so the
    // two apps' captures of the same control pair up in the comparison. A label
    // that repeats among them would collide on one file name, so those keep theirs.
    const pillLabels = walkable.filter((entry) => entry.classes.includes(PRIORITY_CLASS)).map((entry) => entry.label);
    const ambiguous = new Set(pillLabels.filter((label, i) => pillLabels.indexOf(label) !== i));
    for (const entry of walkable) {
      const shared = entry.classes.includes(PRIORITY_CLASS) && !ambiguous.has(entry.label);
      entry.nameIndex = shared ? null : entry.index;
    }
    phaseStats.discovered = found.length;
    phaseStats.walkable = walkable.length;
    phaseStats.skipped = found.length - walkable.length;

    for (const entry of walkable) {
      for (const kind of combo.breakpoint === 'mobile' ? ['click'] : ['hover', 'click']) { // touch has no hover
        const name = `walk-${phase.name}-${kind}-${slug(entry.label, entry.tag, entry.nameIndex)}`;
        // A control hidden until hover must be revealed first, exactly as a user
        // would: move onto it, then act.
        const reveal = entry.hidden ? [{ action: 'hoverPoint', x: entry.x, y: entry.y, ms: 250 }] : [];
        // The dwell only covers the input event's own render; the capture's own
        // settle is what decides the surface has stopped moving.
        const result = await captureSurface(cdp, {
          url: origin,
          outDir: dir,
          name,
          steps: [...phaseSteps, ...reveal, { action: kind === 'hover' ? 'hoverPoint' : 'clickPoint', x: entry.x, y: entry.y, ms: 350 }],
          seed,
          baseline,
        });
        if (result.opened) {
          produced.push({ name, label: entry.label, phase: phase.name, kind });
          if (kind === 'hover') {
            phaseStats.hovered += 1;
            stats.hoverSurfaces += 1;
          } else {
            phaseStats.clicked += 1;
            stats.clickSurfaces += 1;
          }
          process.stdout.write(`webdiff: ${app} ${combo.name} ${name} (${kind}: ${entry.label || entry.tag})\n`);
        } else {
          stats.noChange += 1;
        }
      }
    }
  }

  const lines = new Set();
  const classes = {};
  const html = [];
  for (const entry of produced) {
    const scene = JSON.parse(fs.readFileSync(path.join(dir, `${entry.name}.json`), 'utf8'));
    for (const line of scene.texts?.lines ?? []) lines.add(line);
    const inventory = JSON.parse(fs.readFileSync(path.join(dir, `${entry.name}.classes.json`), 'utf8'));
    for (const [cls, count] of Object.entries(inventory.classes ?? {})) classes[cls] = (classes[cls] ?? 0) + count;
    html.push(`<!-- surface: ${entry.name} ${entry.label} -->\n${fs.readFileSync(path.join(dir, `${entry.name}.html`), 'utf8')}`);
  }
  const sorted = [...lines].sort();
  const classNames = Object.keys(classes).sort();
  fs.writeFileSync(path.join(dir, 'walk.json'), `${JSON.stringify({ dom: { pageHash: hash(produced.map((w) => w.name).join('\n')), elementCount: produced.length, serializedCount: classNames.length }, styles: { perElement: [], styledCount: 0 }, texts: { pageHash: hash(sorted.join('\n')), lineCount: sorted.length, lines: sorted }, coverage: { opened: true, reached: produced.map((w) => ({ action: w.kind, selector: `${w.phase}:${w.label || w.name}` })), gaps: [], notOpened } }, null, 1)}\n`);
  fs.writeFileSync(path.join(dir, 'walk.classes.json'), `${JSON.stringify({ pageHash: hash(classNames.join('\n')), classCount: classNames.length, classes }, null, 1)}\n`);
  fs.writeFileSync(path.join(dir, 'walk.html'), html.join('\n'));
  return { notOpened, walk: { ...stats, produced: produced.map((entry) => entry.name) }, requirements };
}

try {
  // A launch can lose the race for memory when several workers start together
  // (the debug endpoint then never answers). One retry keeps a whole job — and
  // with single-app jobs, half a combination — from being thrown away for a
  // transient failure.
  for (let attempt = 0; ; attempt += 1) {
    try {
      chrome = await launchChrome(chromeDebugPort);
      break;
    } catch (error) {
      if (attempt >= 1) throw error;
      console.error(`webdiff: chrome launch failed (${error.message}); retrying`);
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
  cdp = await connectPage(chromeDebugPort);

  const scenes = BASE_SCENES.filter((scene) => sceneFilter.length === 0 || sceneFilter.includes(scene.name));

  for (const combo of combos) {
    await applyViewport(combo.breakpoint);
    // A behaviour scene poses one shell's interaction; see surfaces.mjs.
    const comboScenes = scenes.filter(
      (scene) => (!scene.desktopOnly || combo.breakpoint === 'desktop') && (!scene.enOnly || combo.locale === 'en'),
    );
    for (const app of appFilter) {
      const result = await captureApp(app, combo, comboScenes);
      coverage[`${combo.name}::${app}`] = { notOpened: result.notOpened, walk: result.walk, requirements: result.requirements };
    }
  }

  if (realUrl) {
    for (const combo of combos) {
      await applyViewport(combo.breakpoint);
      for (const scene of scenes) {
        const result = await captureSurface(cdp, {
          url: realUrl,
          outDir: path.join(runDir, 'real', combo.name),
          name: scene.name,
          steps: scene.steps,
          seed: buildSeed({ app: 'fork', locale: combo.locale, theme: combo.theme, token }),
        });
        process.stdout.write(`webdiff: real ${combo.name} ${scene.name} (gaps: ${result.gaps.length})\n`);
      }
    }
  }
} finally {
  await shutdown();
}

for (const app of appFilter) {
  const dist = app === 'upstream' ? upstreamDist : forkDist;
  const inventory = cssInventory(dist);
  fs.writeFileSync(path.join(runDir, app, 'static-css.json'), `${JSON.stringify(inventory, null, 1)}\n`);
  if (app === 'upstream') coverage.__cssUpstream = { selectors: inventory.selectorCount, customProps: inventory.customPropCount };
  else coverage.__cssFork = { selectors: inventory.selectorCount, customProps: inventory.customPropCount };
}

fs.writeFileSync(
  path.join(runDir, 'index.json'),
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      token: `wd-${hash(runDir).slice(0, 16)}`,
      opts: { walk, breakpoints, locales, themes, upstream: upstreamDist, fork: forkDist, scenes: BASE_SCENES.map((scene) => scene.name), real: realUrl || null },
      bootKeys: BOOT_KEYS,
      cssInventory: Object.fromEntries(
        appFilter.map((app) => [app, JSON.parse(fs.readFileSync(path.join(runDir, app, 'static-css.json'), 'utf8'))]),
      ),
      combos: combos.map((combo) => combo.name),
      coverage,
    },
    null,
    1,
  )}\n`,
);

const allowlist = fs.existsSync(allowlistPath) ? JSON.parse(fs.readFileSync(allowlistPath, 'utf8')) : { blockers: [], warnings: [] };
// A single-app run is half a comparison by construction; its report is written
// by the merge that pairs it with the other app's captures.
const report =
  appFilter.length < 2
    ? null
    : compareRun({ runDir, relRunDir: path.relative(REPO, runDir), allowlistPath: path.relative(REPO, allowlistPath), allowlist, coverage });
if (report) {
  if (realUrl) report.real = { url: realUrl, combos: combos.map((combo) => combo.name) };
  // The state every pair was captured in. Liquid glass is the fork's own system
  // and upstream has none, so the fork's boot key seeds it off (see buildSeed) —
  // recorded here because a reader of the report cannot see the seed.
  report.comparison = { forkLiquidGlass: 'off', seededBy: 'webdiff/capture.mjs buildSeed' };
  fs.writeFileSync(path.join(runDir, 'report.json'), `${JSON.stringify(report, null, 1)}\n`);
  fs.writeFileSync(path.join(runDir, 'report.md'), renderMarkdown(report));

  console.log(`webdiff: run ${path.relative(REPO, runDir)} — blocker=${report.summary.blocker} warning=${report.summary.warning} info=${report.summary.info} suppressed=${report.summary.suppressed}`);
  if (report.summary.blocker > 0) exitCode = 1;
} else {
  console.log(`webdiff: run ${path.relative(REPO, runDir)} — captured ${appFilter.join(',')} only, no comparison`);
}
if (process.env.WEB_PORT_TIMING === '1') {
  const { timingReport } = await import('./capture.mjs');
  const rows = timingReport();
  const total = rows.reduce((sum, row) => sum + row.totalMs, 0);
  console.log('webdiff: timing (ms)');
  for (const row of rows) console.log(`  ${row.label.padEnd(24)} ${String(row.count).padStart(5)} calls  ${String(row.avgMs).padStart(6)} avg  ${String(row.totalMs).padStart(8)} total`);
  console.log(`  ${'TOTAL'.padEnd(24)} ${''.padStart(5)}        ${''.padStart(6)}      ${String(total).padStart(8)}`);
}
if (report && report.summary.blocker > 0) exitCode = 1;
process.exit(exitCode);
