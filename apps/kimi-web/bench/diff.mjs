// apps/kimi-web/bench/diff.mjs
// Pixel gate. Compares each bench/pixel/current/<scene>.png against the
// reference set with pixelmatch (threshold 0.1) and fails if more than 0.01%
// of pixels differ. Writes a <scene>.diff.png next to failures for inspection.
//
// Usage: node bench/diff.mjs   (run bench:capture first to produce `current`)

import fs from 'node:fs';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { SCENE_NAMES } from './scenes.mjs';
import { APP_DIR } from './util.mjs';

const REF_DIR = path.join(APP_DIR, 'bench', 'pixel', 'reference');
const CUR_DIR = path.join(APP_DIR, 'bench', 'pixel', 'current');
const THRESHOLD = 0.1; // pixelmatch color-distance threshold
const MAX_MISMATCH_PCT = 0.01; // fail above this fraction of differing pixels

function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

let failures = 0;
for (const name of SCENE_NAMES) {
  const refPath = path.join(REF_DIR, `${name}.png`);
  const curPath = path.join(CUR_DIR, `${name}.png`);
  if (!fs.existsSync(refPath)) {
    console.error(`FAIL ${name}: missing reference (${path.relative(APP_DIR, refPath)})`);
    failures++;
    continue;
  }
  if (!fs.existsSync(curPath)) {
    console.error(`FAIL ${name}: missing current capture — run \`pnpm bench:capture\` first`);
    failures++;
    continue;
  }
  const ref = readPng(refPath);
  const cur = readPng(curPath);
  if (ref.width !== cur.width || ref.height !== cur.height) {
    console.error(`FAIL ${name}: size mismatch ${ref.width}x${ref.height} vs ${cur.width}x${cur.height}`);
    failures++;
    continue;
  }
  const { width, height } = ref;
  const diff = new PNG({ width, height });
  const mismatched = pixelmatch(ref.data, cur.data, diff.data, width, height, { threshold: THRESHOLD });
  const pct = (mismatched / (width * height)) * 100;
  const pass = pct <= MAX_MISMATCH_PCT;
  if (!pass) {
    failures++;
    fs.writeFileSync(path.join(CUR_DIR, `${name}.diff.png`), PNG.sync.write(diff));
  }
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${mismatched} px differ (${pct.toFixed(4)}%)`);
}

if (failures > 0) {
  console.error(`[diff] ${failures} scene(s) failed the pixel gate`);
  process.exit(1);
}
console.log('[diff] all scenes within the 0.01% pixel budget');
