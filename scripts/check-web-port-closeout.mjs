import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const VERDICTS = ['PORTED', 'ALREADY PRESENT', 'NOT APPLICABLE', 'SKIPPED'];
const APP_DIRS = ['upstream', 'fork'];

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const version = arg('version');
if (!version) {
  console.error('usage: node scripts/check-web-port-closeout.mjs --version <version> [--run <dir>]');
  process.exit(2);
}

const failures = [];
const notes = [];

const plansRel = path.join('PLANS', `web-port-${version}.md`);
const plans = path.join(ROOT, plansRel);
if (!fs.existsSync(plans)) {
  failures.push(`${plansRel} is missing — the round has no verdict table`);
} else {
  // Only tables that HAVE a verdict column are accounted. A verdict file also
  // holds tables that are not about verdicts at all (a measured before/after
  // comparison, a token table), and counting their rows as "without a verdict"
  // made a complete file look incomplete.
  const rows = [];
  let tableHeader = null;
  for (const line of fs.readFileSync(plans, 'utf8').split('\n')) {
    const trimmed = line.trimStart();
    if (!trimmed.startsWith('|')) {
      tableHeader = null;
      continue;
    }
    if (tableHeader === null) tableHeader = trimmed;
    if (line === tableHeader) continue; // the header itself
    if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue; // the separator row
    if (!/verdict/i.test(tableHeader)) continue; // not a verdict table
    rows.push(line);
  }
  const unaccounted = rows.filter((row) => !VERDICTS.some((v) => row.includes(v)));
  if (rows.length === 0) failures.push(`${plansRel} has no verdict rows`);
  if (unaccounted.length > 0) {
    failures.push(`${plansRel}: ${unaccounted.length} row(s) without a verdict`);
    for (const row of unaccounted.slice(0, 5)) notes.push(`  ${row.trim().slice(0, 120)}`);
  } else if (rows.length > 0) {
    notes.push(`${plansRel}: ${rows.length} verdict row(s), all accounted`);
  }
}

function resolveRunDir() {
  const explicit = arg('run');
  if (explicit) return path.resolve(ROOT, explicit);
  const inPlans = path.join(ROOT, 'PLANS', `web-port-${version}`, 'webdiff');
  if (fs.existsSync(inPlans)) return inPlans;
  const tmp = path.join(ROOT, '.tmp');
  if (!fs.existsSync(tmp)) return undefined;
  const runs = fs
    .readdirSync(tmp)
    .filter((name) => name.startsWith('webdiff-run'))
    .map((name) => path.join(tmp, name))
    .filter((dir) => fs.existsSync(path.join(dir, 'index.json')))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return runs[0];
}

const runDir = resolveRunDir();
if (!runDir) {
  failures.push('no webdiff run found — pass --run <dir> (expected index.json inside)');
} else {
  notes.push(`run: ${path.relative(ROOT, runDir)}`);

  const index = JSON.parse(fs.readFileSync(path.join(runDir, 'index.json'), 'utf8'));
  const opts = index.opts ?? {};
  if (opts.walk !== true) failures.push('index.json opts.walk is not true — the run did not walk');
  if ((opts.breakpoints ?? []).length < 2) failures.push('opts.breakpoints has fewer than 2 entries');
  if ((opts.locales ?? []).length < 2) failures.push('opts.locales has fewer than 2 entries');
  if ((opts.themes ?? []).length < 2) failures.push('opts.themes has fewer than 2 entries');
  notes.push(
    `coverage: walk=${opts.walk === true} breakpoints=${JSON.stringify(opts.breakpoints ?? [])} locales=${JSON.stringify(opts.locales ?? [])} themes=${JSON.stringify(opts.themes ?? [])}`,
  );

  const reportPath = path.join(runDir, 'report.json');
  if (!fs.existsSync(reportPath)) {
    failures.push('report.json is missing');
  } else {
    const summary = JSON.parse(fs.readFileSync(reportPath, 'utf8')).summary ?? {};
    if ((summary.blocker ?? 0) > 0) failures.push(`report.json summary.blocker = ${summary.blocker}`);
    notes.push(
      `findings: blocker=${summary.blocker ?? '?'} warning=${summary.warning ?? '?'} suppressed=${summary.suppressed ?? '?'}`,
    );
  }

  for (const [key, value] of Object.entries(index.coverage ?? {})) {
    if (key.startsWith('__')) continue;
    if ((value?.notOpened ?? []).length > 0) {
      failures.push(`${key}: scene(s) opened no surface — ${value.notOpened.join(', ')}`);
    }
    if (opts.walk === true && value?.walk && (value.walk.clickSurfaces ?? 0) + (value.walk.hoverSurfaces ?? 0) === 0) {
      failures.push(`${key}: the walk produced no surface from any control (nothing opened on hover or click)`);
    }
  }

  let scenes = 0;
  for (const app of APP_DIRS) {
    const appRoot = path.join(runDir, app);
    if (!fs.existsSync(appRoot)) {
      failures.push(`${app}/ is missing — both apps must be captured`);
      continue;
    }
    for (const view of fs.readdirSync(appRoot)) {
      const viewDir = path.join(appRoot, view);
      if (!fs.statSync(viewDir).isDirectory()) continue;
      for (const file of fs.readdirSync(viewDir)) {
        if (!file.endsWith('.json') || file === 'static-css.json' || file.endsWith('.classes.json')) continue;
        const stem = file.slice(0, -'.json'.length);
        scenes += 1;
        for (const sibling of [`${stem}.html`, `${stem}.classes.json`]) {
          if (!fs.existsSync(path.join(viewDir, sibling))) {
            failures.push(`${app}/${view}/${sibling} is missing — page source was not captured`);
          }
        }
      }
    }
  }
  if (scenes === 0) failures.push('no captured scenes found (expected <app>/<view>/<surface>.json)');
  else notes.push(`page-source pairs checked for ${scenes} captured surface(s)`);
}

for (const note of notes) console.log(`check-web-port-closeout: ${note}`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`check-web-port-closeout: FAIL ${failure}`);
  process.exit(1);
}
console.log(`check-web-port-closeout: OK (web port ${version})`);
