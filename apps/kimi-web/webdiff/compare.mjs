// apps/kimi-web/webdiff/compare.mjs
// Diff two captured app trees (upstream bundle vs fork build) into findings,
// apply the allowlist, and render the machine-readable and human-readable
// reports. Severity is deliberate: a missing text or a differing structural
// digest means the fork is behind upstream (blocker); an extra class or text is
// the fork's own design system showing through (warning/info) and must never
// drown the signal.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MAX_PER_KIND = 40;

function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function listDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function listScenes(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json') && name !== 'static-css.json' && !name.endsWith('.classes.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .sort();
}

function onlyIn(a, b) {
  const other = new Set(b);
  return a.filter((item) => !other.has(item));
}

export function cssInventory(distDir) {
  const assets = path.join(distDir, 'assets');
  const files = fs.existsSync(assets)
    ? fs.readdirSync(assets).filter((name) => name.endsWith('.css'))
    : [];
  const selectors = new Set();
  const customProps = new Set();
  for (const file of files) {
    const text = fs.readFileSync(path.join(assets, file), 'utf8');
    for (const match of text.matchAll(/(^|[};,])\s*([^{}@;]+?)\s*\{/g)) {
      for (const selector of match[2].split(',')) {
        const trimmed = selector.trim();
        if (trimmed.length > 0 && trimmed.length < 200) selectors.add(trimmed);
      }
    }
    for (const match of text.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) customProps.add(match[1]);
  }
  return {
    fileCount: files.length,
    files,
    selectorCount: selectors.size,
    selectors: [...selectors].sort(),
    customPropCount: customProps.size,
    customProps: [...customProps].sort(),
  };
}

export function compareRun({ runDir, relRunDir, allowlistPath, allowlist, coverage }) {
  const findings = [];
  const combos = [...new Set([...listDirs(path.join(runDir, 'upstream')), ...listDirs(path.join(runDir, 'fork'))])].sort();
  // Scenes that state their outcome (`requires`, see surfaces.mjs). Such a scene
  // poses its surface by hand, so its markup diff is the fork's own shape of that
  // surface — the difference the scene exists to look PAST — and a stated scene
  // contributes dozens of blocker/warning findings that bury the requirement
  // findings it exists to produce. Its diff is recorded at info level and its
  // requirement checks carry the weight; a scene with no requirements is
  // unaffected.
  const statedScenes = new Set();
  for (const value of Object.values(coverage ?? {})) {
    for (const requirement of value?.requirements ?? []) {
      statedScenes.add(requirement.scene);
      // A `then` stage writes a capture under `${scene}-${stage}`; it is judged
      // by its own requirement, so it is a stated scene too.
      if (requirement.stage) statedScenes.add(`${requirement.scene}-${requirement.stage}`);
    }
  }

  for (const combo of combos) {
    const upstreamDir = path.join(runDir, 'upstream', combo);
    const forkDir = path.join(runDir, 'fork', combo);
    const scenes = [...new Set([...listScenes(upstreamDir), ...listScenes(forkDir)])].sort();

    for (const scene of scenes) {
      const where = `${combo}::${scene}`;
      const stated = statedScenes.has(scene);
      const upstream = readJson(path.join(upstreamDir, `${scene}.json`));
      const fork = readJson(path.join(forkDir, `${scene}.json`));
      // `walk` is the aggregate of one app's own walk captures, and its
      // `dom.pageHash` is a hash of that app's surface-name list — so comparing
      // it compares two inventories that are expected to differ (each app's walk
      // discovers its own controls). The per-surface `surface-missing` finding
      // already reports a surface only one app has; reporting the inventory
      // difference again as a structural blocker adds nothing.
      const isWalk = scene === 'walk' || scene.startsWith('walk-');
      const isAggregate = scene === 'walk';
      // A walk surface is named from the control's own label, so a control with
      // no accessible label falls back to the tag alone (`...-11-button`). Both
      // apps' walks then produce a surface with that same name from *different*
      // controls, and the pair is compared as if it were the same surface.
      // Measured: at `desktop-dark-zh::walk-main-click-11-button` upstream's
      // control was the chat header (click point 534,24) and the fork's was the
      // sidebar footer (118,875) — 56 blocker-grade "missing texts" from one
      // such pairing. A finding that cannot be attributed to a control is not a
      // port gap, so these surfaces report at info level; their page-source pair
      // is still written and checked.
      // Only the pairs that are provably different controls are dropped: the
      // walk records the click point it used, so two surfaces whose points are
      // far apart were never the same control, while two that agree were
      // probably the same one and keep their blocker-level comparison.
      const isUnlabelled = isWalk && !isAggregate && /-(?:button|div|span|a|summary|select|input|li|td|th)$/.test(scene);
      const clickPoint = (side) => {
        const reached = side?.coverage?.reached ?? [];
        for (let i = reached.length - 1; i >= 0; i -= 1) {
          const m = /point:(-?\d+),(-?\d+)/.exec(reached[i]?.selector ?? '');
          if (m) return { x: Number(m[1]), y: Number(m[2]) };
        }
        return null;
      };
      // Position alone is too weak: two apps can put different controls at the
      // same point (measured: desktop-dark-zh::walk-main-click-08-button, both
      // clicks within 20px, upstream's landing on the empty state - 190 elements
      // with 'has no messages yet' - and the fork's on a session view with 636).
      // The captures carry a box per styled element, so the element actually
      // under the point can be compared directly.
      const elementAt = (side, point) => {
        if (!point) return null;
        let best = null;
        for (const entry of side.styles?.perElement ?? []) {
          const box = entry.box;
          if (!box) continue;
          if (point.x < box.x || point.x > box.x + box.w) continue;
          if (point.y < box.y || point.y > box.y + box.h) continue;
          const area = box.w * box.h;
          if (!best || area < best.area) best = { area, tag: entry.tag, classes: entry.classes ?? [] };
        }
        return best;
      };
      const samePlace = (() => {
        if (!isUnlabelled) return true;
        const a = clickPoint(upstream);
        const b = clickPoint(fork);
        if (!a || !b) return false;
        const ea = elementAt(upstream, a);
        const eb = elementAt(fork, b);
        if (!ea || !eb) return Math.hypot(a.x - b.x, a.y - b.y) <= 60;
        if (ea.tag !== eb.tag) return false;
        if (!ea.classes.some((c) => eb.classes.includes(c))) return false;
        // The class test alone is not attribution: the smallest element that
        // contains a point is usually a shared icon, and both apps render
        // `svg.kw-icon` all over their chrome, so any two far-apart clicks on
        // any icon look like "the same control". Measured:
        // mobile-dark-zh::walk-settings-click-05-button — upstream's point
        // (74,525) on the settings sheet's swarm row and the fork's (306,394)
        // on an unrelated row both resolved to `svg.kw-icon`, and the pair
        // reported 6 blocker-grade missing texts (the swarm dialog) for two
        // controls that were never the same. Require proximity as well, which
        // is what the no-element branch below already falls back to.
        return Math.hypot(a.x - b.x, a.y - b.y) <= 60;
      })();
      const softer = isAggregate || stated || (isUnlabelled && !samePlace);
      if (!upstream || !fork) {
        findings.push({
          kind: isWalk || stated ? 'info' : 'blocker',
          id: `${where}::surface-missing`,
          where: scene,
          message: `${!upstream ? 'upstream' : 'fork'} has this surface, the other app does not`,
        });
        continue;
      }

      // The digest is a hash of every element's `TAG#id.classes[attrs]`, so it
      // differs for *any* structural difference — including the elements the
      // fork deliberately adds (its own dock rows, pinned section, panel
      // chrome). A fork that keeps extra features can therefore never match the
      // hash, and the blocker carries no information about what is wrong. The
      // meaningful invariant for this fork is "no upstream element is missing";
      // extra fork elements are already reported per class and per text as
      // warning/info. Report the missing elements by name when there are any,
      // and fall back to the hash when a run predates the serialized list.
      const countOf = (list) => {
        const counts = new Map();
        for (const item of list) counts.set(item, (counts.get(item) ?? 0) + 1);
        return counts;
      };
      // Two classes are transient *state*, not designed markup, and both are
      // dropped from each side before the diff:
      //  - `is-following` is transcript scroll state. The two apps are captured
      //    by independent runs, so one can land pinned and the other not, and
      //    the class then reads as a missing element on every surface that
      //    renders the transcript.
      //  - Vue's transition phase classes (`*-enter-active`, `*-enter-from`,
      //    `*-enter-to`, `*-leave-*`). Under emulated reduced motion the
      //    duration is ~1e-06s, so a menu can be captured still carrying
      //    `enter-active enter-from` while the other app's identical menu has
      //    already dropped them — which made upstream's view-menu, user-menu and
      //    chat menu read as elements the fork is missing.
      const PHASE_CLASS = /(^|\.)[A-Za-z0-9_-]+-(?:enter|leave)-(?:active|from|to)(?=\.|$)/g;
      const withoutScrollState = (list) =>
        list.map((entry) =>
          String(entry)
            .replace(/(^|\.)is-following(?=\.|$)/g, '$1')
            .replace(PHASE_CLASS, '$1')
            .replace(/\.\.+/g, '.')
            .replace(/\.$/, ''),
        );
      const upstreamElements = Array.isArray(upstream.dom?.elements)
        ? withoutScrollState(upstream.dom.elements)
        : upstream.dom?.elements;
      const forkElements = Array.isArray(fork.dom?.elements)
        ? withoutScrollState(fork.dom.elements)
        : fork.dom?.elements;
      if (Array.isArray(upstreamElements) && Array.isArray(forkElements)) {
        // Element-level divergences that are settled — a different editor
        // implementation, a fork-only shell — are recorded in the allowlist as
        // glob patterns over the element signature, so one entry covers every
        // combo, breakpoint and surface. They are dropped before the diff, and
        // the excluded count is reported, so nothing disappears silently.
        const globRe = (pattern) =>
          new RegExp(
            `^${String(pattern)
              .split('*')
              .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
              .join('.*')}$`,
          );
        // An entry may also carry `scenes` — globs over the surface name. A
        // signature like `SPAN.hint` or `BUTTON.is-on.ui-switch` is shared by
        // every settings row, so a global rule would retire the comparison of
        // every toggle on every surface; scoping it to the one surface whose
        // difference it records keeps the rest compared.
        const elementRules = (allowlist?.elements ?? []).map((entry) => ({
          pattern: String(entry?.pattern ?? ''),
          re: globRe(entry?.pattern ?? ''),
          scenes: Array.isArray(entry?.scenes) ? entry.scenes.map(globRe) : null,
          reason: entry?.reason ?? '',
        }));
        const ruleFor = (element) =>
          elementRules.find(
            (rule) =>
              (!rule.scenes || rule.scenes.some((re) => re.test(String(where)))) && rule.re.test(element),
          );
        const comparedUpstream = upstreamElements.filter((element) => !ruleFor(element));
        const excludedCount = upstreamElements.length - comparedUpstream.length;
        // Split a signature into tag + classes. Classes are dot-joined in the
        // serialization, so a class that itself contains a dot (Tailwind's
        // `active:scale-[0.96]`) splits into two pseudo-classes — harmless here,
        // because both apps' signatures split the same way.
        const splitSignature = (element) => {
          const dot = element.indexOf('.');
          return {
            tag: dot < 0 ? element : element.slice(0, dot),
            classes: dot < 0 ? [] : element.slice(dot + 1).split('.').filter(Boolean),
          };
        };
        // An upstream element counts as present when the fork has an element of
        // the same tag whose classes *contain* upstream's. The fork decorates
        // shared containers with its own classes (`col lg-lens`,
        // `model-pill lg-glass`, `gh on`), which an exact match reads as missing
        // even though the element is right there. A decoration class that
        // actually changes the rendering still shows up: the per-element style
        // comparison below covers computed values, and extra classes are
        // reported as `extra-class` findings.
        const buckets = new Map();
        for (const element of forkElements) {
          const { tag, classes } = splitSignature(element);
          if (!buckets.has(tag)) buckets.set(tag, []);
          buckets.get(tag).push({ classes: new Set(classes), left: 1 });
        }
        const missingElements = [];
        for (const element of comparedUpstream) {
          const { tag, classes } = splitSignature(element);
          const candidates = buckets.get(tag) ?? [];
          const hit = candidates.find((bucket) => bucket.left > 0 && classes.every((cls) => bucket.classes.has(cls)));
          if (hit) hit.left -= 1;
          else missingElements.push(element);
        }
        if (missingElements.length > 0) {
          const sample = missingElements.slice(0, 3).join(' | ');
          findings.push({
            kind: softer ? 'info' : 'blocker',
            id: `${where}::dom-elements-missing`,
            where: scene,
            message: `${missingElements.length} upstream element(s) missing on the fork (of ${comparedUpstream.length} compared, ${excludedCount} allowlisted; fork has ${forkElements.length}; hidden subtrees upstream ${upstream.dom?.hiddenRoots ?? 0} / fork ${fork.dom?.hiddenRoots ?? 0}) — e.g. ${sample}`,
          });
        }
      } else if (upstream.dom?.pageHash !== fork.dom?.pageHash) {
        findings.push({
          kind: softer ? 'info' : 'blocker',
          id: `${where}::dom-hash-mismatch`,
          where: scene,
          message: isAggregate
            ? `surface inventories differ (upstream ${upstream.dom?.elementCount} surfaces, fork ${fork.dom?.elementCount}) — per-surface surface-missing findings carry this`
            : `DOM structural digest differs (upstream=${String(upstream.dom?.pageHash).slice(0, 8)}, fork=${String(fork.dom?.pageHash).slice(0, 8)}; elements ${upstream.dom?.elementCount} vs ${fork.dom?.elementCount})`,
        });
      }

      // Volatile text: the two apps are captured minutes apart, so a live
      // elapsed-time label, a relative timestamp or a context-token readout
      // differs between the captures without any design difference. Left in,
      // each one lands as a "present upstream, missing on fork" blocker (or the
      // mirror warning) on every scene that renders it. Only lines that are
      // *entirely* such a value are dropped, so nothing with content is lost.
      const VOLATILE = [
        // An elapsed-time label on a running task, in either locale's units:
        // "26分33秒", "5m4s", "11h39m", "9s". The value is computed from the wall
        // clock, and the two apps' walks run minutes apart, so the same row
        // reads "26分33秒" upstream and "39分20秒" on the fork.
        /^\d+\s*(?:小时|分|秒|h|m|s)\s*(?:\d+\s*(?:分|秒|m|s))?$/i,
        /^\d+m\s*\d+s$/, // 12m 37s
        /^\d+(\.\d+)?s$/, // 4s
        /^\d{1,2}:\d{2}(:\d{2})?$/, // 21:58
        /^\d+(\.\d+)?k$/i, // 29.3k
        /^(刚刚|just now)$/i,
        /^\d+\s*(秒|分钟|小时|天)前$/,
        /^\d+\s*(s|m|h|d|sec|secs|min|mins|hr|hrs)\s*ago$/i,
      ];
      const isVolatileText = (line) => VOLATILE.some((re) => re.test(String(line).trim()));
      const upstreamTexts = (upstream.texts?.lines ?? []).filter((line) => !isVolatileText(line));
      const forkTexts = (fork.texts?.lines ?? []).filter((line) => !isVolatileText(line));
      const missing = onlyIn(upstreamTexts, forkTexts).slice(0, MAX_PER_KIND);
      const extra = onlyIn(forkTexts, upstreamTexts).slice(0, MAX_PER_KIND);
      // Per-item ids. A shared `${where}::missing-text` id made the allowlist
      // useless for a single fork-only divergence: suppressing one text
      // suppressed every missing text on that surface, real gaps included. The
      // slug keeps each item independently allowlistable.
      //
      // Text with no ASCII alphanumerics (every Chinese string, and separators
      // like "·" or "—") slugs to nothing, which collapsed dozens of unrelated
      // items onto one id — so allowlisting one divergence in a zh run also
      // hid every other non-ASCII gap on that surface. Such text falls back to
      // a digest of the text itself, which keeps each item addressable.
      const slugOf = (value) => {
        const text = String(value);
        const ascii = text
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 60);
        return ascii || `x-${hash(text).slice(0, 10)}`;
      };
      for (const text of missing) {
        findings.push({ kind: softer ? 'info' : 'blocker', id: `${where}::missing-text::${slugOf(text)}`, where: scene, message: softer && isUnlabelled ? `text "${text}" present upstream, missing on fork (surface paired by tag only - the two apps' walks reached different unlabelled controls here, so the difference is not attributable)` : `text "${text}" present upstream, missing on fork`, text });
      }
      for (const text of extra) {
        findings.push({ kind: stated ? 'info' : 'warning', id: `${where}::extra-text::${slugOf(text)}`, where: scene, message: `text "${text}" only on fork`, text });
      }

      const upstreamClasses = readJson(path.join(upstreamDir, `${scene}.classes.json`));
      const forkClasses = readJson(path.join(forkDir, `${scene}.classes.json`));
      if (upstreamClasses && forkClasses) {
        const missingClasses = onlyIn(Object.keys(upstreamClasses.classes ?? {}), Object.keys(forkClasses.classes ?? {})).slice(0, MAX_PER_KIND);
        const extraClasses = onlyIn(Object.keys(forkClasses.classes ?? {}), Object.keys(upstreamClasses.classes ?? {})).slice(0, MAX_PER_KIND);
        for (const cls of missingClasses) {
          findings.push({ kind: stated ? 'info' : 'warning', id: `${where}::missing-class::${slugOf(cls)}`, where: scene, message: `class ".${cls}" present upstream, missing on fork`, text: cls });
        }
        for (const cls of extraClasses) {
          findings.push({ kind: 'info', id: `${where}::extra-class::${slugOf(cls)}`, where: scene, message: `class ".${cls}" only on fork (design-system divergence or fork-only component)`, text: cls });
        }
      }

      const fingerprint = (sceneData) => {
        const map = new Map();
        for (const entry of sceneData.styles?.perElement ?? []) {
          const key = `${entry.tag}.${(entry.classes ?? []).join('.')}`;
          if (!map.has(key)) map.set(key, new Set());
          map.get(key).add(entry.fingerprint ?? '');
        }
        return map;
      };
      const upstreamStyles = fingerprint(upstream);
      const forkStyles = fingerprint(fork);
      const drifted = [];
      for (const [key, set] of upstreamStyles) {
        const other = forkStyles.get(key);
        if (!other) continue;
        if ([...set].sort().join('~') !== [...other].sort().join('~')) drifted.push(key);
      }
      if (drifted.length > 0) {
        findings.push({
          kind: stated ? 'info' : 'warning',
          id: `${where}::style-drift`,
          where: scene,
          message: `computed-style drift on ${drifted.length} selector(s) (expected for glass/token re-expression — check each is intended)`,
          sample: drifted.slice(0, 20),
        });
      }
      const upstreamCount = upstream.styles?.styledCount ?? 0;
      const forkCount = fork.styles?.styledCount ?? 0;
      if (upstreamCount !== forkCount) {
        findings.push({
          kind: 'info',
          id: `${where}::styled-count-differs`,
          where: scene,
          message: `styled element count differs (upstream=${upstreamCount}, fork=${forkCount})`,
        });
      }

      const gaps = [...(upstream.coverage?.gaps ?? []), ...(fork.coverage?.gaps ?? [])];
      if (gaps.length > 0) {
        findings.push({
          kind: 'info',
          id: `${where}::walk-gap`,
          where: scene,
          message: `${gaps.length} planned step(s) unreachable — a surface the walk could not open is a coverage gap, not a pass`,
          sample: gaps.slice(0, 10),
        });
      }
    }
  }

  // Coverage lives in index.json, not in the scene files: a scene whose steps
  // opened nothing still writes a capture (the evidence), so only the run's own
  // record can tell that it never reached its surface.
  for (const [key, value] of Object.entries(coverage ?? {})) {
    if (key.startsWith('__')) continue;
    const [comboName, app] = key.split('::');
    for (const scene of value?.notOpened ?? []) {
      findings.push({
        kind: statedScenes.has(scene) ? 'info' : 'warning',
        id: `${comboName}::${scene}::surface-not-opened`,
        where: scene,
        message: `${app}: the scene opened no new surface — its capture is identical to main, so nothing inside it counts as covered`,
      });
    }
    const walkStats = value?.walk;
    if (walkStats) {
      findings.push({
        kind: 'info',
        id: `${comboName}::${app}::walk-coverage`,
        where: 'walk',
        message: `${app}: ${walkStats.clickSurfaces} click surface(s), ${walkStats.hoverSurfaces} hover surface(s), ${walkStats.noChange} control action(s) produced no change; phases ${JSON.stringify(walkStats.phases)}`,
      });
    }
    // Scene requirements: what a scene's interaction had to achieve, checked on
    // the live page (capture.mjs checkRequirements) rather than diffed. A failed
    // check is a blocker for the app that failed it — that is how a behaviour the
    // fork does not have reaches the report even though every capture it writes
    // still diffs as a plausible surface. A scene whose checks all passed gets one
    // info line, so "both apps satisfy this" is visible instead of silent.
    const requirementScenes = new Map();
    for (const requirement of value?.requirements ?? []) {
      const where = requirement.stage ? `${requirement.scene}-${requirement.stage}` : requirement.scene;
      if (requirement.ok) {
        const list = requirementScenes.get(where) ?? [];
        list.push(requirement);
        requirementScenes.set(where, list);
        continue;
      }
      findings.push({
        kind: 'blocker',
        id: `${comboName}::${where}::requirement::${requirement.name}`,
        where: requirement.scene,
        message: `${app}: requirement "${requirement.name}" not met — ${requirement.detail}`,
      });
    }
    for (const [where, list] of requirementScenes) {
      findings.push({
        kind: 'info',
        id: `${comboName}::${where}::requirements-met`,
        where: list[0].scene,
        message: `${app}: ${list.length} scene requirement(s) met — ${list.map((requirement) => requirement.name).join(', ')}`,
      });
    }
  }

  // Entries are either a bare id string or `{ id, reason }`. The object form
  // carries the one-line reason a divergence is kept, which is what the round
  // doc has to report. An id containing `*` is a glob and matches every combo,
  // breakpoint, theme, locale and surface — a fork-only divergence (the account
  // label, say) shows up on all of them, and listing each id by hand would be
  // long enough to hide a mistake.
  const entryId = (entry) => (typeof entry === 'string' ? entry : entry?.id);
  const reasonOf = (entry) => (typeof entry === 'string' ? '' : entry?.reason ?? '');
  const globToRegExp = (glob) => new RegExp(`^${glob.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  const allowed = (entries, id) => {
    const exact = new Map();
    const patterns = [];
    for (const entry of entries) {
      const key = entryId(entry);
      if (typeof key !== 'string' || key === '') continue;
      if (key.includes('*')) patterns.push({ re: globToRegExp(key), reason: reasonOf(entry) });
      else exact.set(key, reasonOf(entry));
    }
    if (exact.has(id)) return { hit: true, reason: exact.get(id) };
    for (const { re, reason } of patterns) if (re.test(id)) return { hit: true, reason };
    return { hit: false, reason: '' };
  };
  const suppressed = [];
  const kept = [];
  for (const finding of findings) {
    const verdict =
      finding.kind === 'blocker' ? allowed(allowlist?.blockers ?? [], finding.id)
        : finding.kind === 'warning' ? allowed(allowlist?.warnings ?? [], finding.id)
          : { hit: false, reason: '' };
    if (verdict.hit) suppressed.push({ ...finding, suppressedBy: `allowlist:${finding.kind}`, reason: verdict.reason });
    else kept.push(finding);
  }

  const summary = { blocker: 0, warning: 0, info: 0, suppressed: suppressed.length };
  for (const finding of kept) summary[finding.kind] += 1;

  const upstreamCss = readJson(path.join(runDir, 'upstream', 'static-css.json'));
  const forkCss = readJson(path.join(runDir, 'fork', 'static-css.json'));
  let css = null;
  if (upstreamCss && forkCss) {
    const onlyUpstream = onlyIn(upstreamCss.selectors ?? [], forkCss.selectors ?? []);
    const onlyFork = onlyIn(forkCss.selectors ?? [], upstreamCss.selectors ?? []);
    css = {
      upstream: { fileCount: upstreamCss.fileCount, selectorCount: upstreamCss.selectorCount, customPropCount: upstreamCss.customPropCount },
      fork: { fileCount: forkCss.fileCount, selectorCount: forkCss.selectorCount, customPropCount: forkCss.customPropCount },
      delta: {
        selectors: { addedCount: onlyFork.length, removedCount: onlyUpstream.length },
        customProps: { addedCount: onlyIn(forkCss.customProps ?? [], upstreamCss.customProps ?? []).length, removedCount: onlyIn(upstreamCss.customProps ?? [], forkCss.customProps ?? []).length },
      },
      selectorsOnlyUpstreamSample: onlyUpstream.slice(0, 40),
    };
    for (const selector of onlyUpstream.slice(0, 20)) {
      kept.push({
        kind: 'info',
        id: 'css::upstream-only-selector',
        where: 'static-css',
        message: `selector "${selector}" exists upstream, not in the fork build — check whether it belongs to a component family the fork lacks`,
        text: selector,
      });
      summary.info += 1;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    runDir: relRunDir ?? runDir,
    allowlist: { path: allowlistPath, blockers: allowlist?.blockers ?? [], warnings: allowlist?.warnings ?? [], elements: allowlist?.elements ?? [] },
    summary,
    css,
    findings: kept,
    suppressed,
  };
}

export function renderMarkdown(report) {
  const lines = ['# webdiff report', '', `- run: \`${report.runDir}\``, `- generated: ${report.generatedAt}`, `- allowlist: \`${report.allowlist.path}\``, `- blocker: ${report.summary.blocker}, warning: ${report.summary.warning}, info: ${report.summary.info}`, `- suppressed by allowlist: ${report.summary.suppressed}`, ''];
  if (report.css) {
    lines.push('## CSS inventory', '', '| app | files | selectors | custom props |', '| --- | --- | --- | --- |');
    lines.push(`| upstream | ${report.css.upstream.fileCount} | ${report.css.upstream.selectorCount} | ${report.css.upstream.customPropCount} |`);
    lines.push(`| fork | ${report.css.fork.fileCount} | ${report.css.fork.selectorCount} | ${report.css.fork.customPropCount} |`, '');
    lines.push(`- selectors only on upstream: **${report.css.delta.selectors.removedCount}**`, `- selectors only on fork: **${report.css.delta.selectors.addedCount}**`, `- custom props only on upstream: **${report.css.delta.customProps.removedCount}**`, `- custom props only on fork: **${report.css.delta.customProps.addedCount}**`, '');
  }
  for (const kind of ['blocker', 'warning', 'info']) {
    const group = report.findings.filter((finding) => finding.kind === kind);
    if (group.length === 0) continue;
    lines.push(`## ${kind} (${group.length})`, '');
    for (const finding of group) {
      lines.push(`- **${finding.where}** ${finding.message}`);
      if (finding.sample) lines.push(`  - ${finding.sample.slice(0, 10).map((s) => (typeof s === 'string' ? s : JSON.stringify(s))).join(', ')}`);
    }
    lines.push('');
  }
  if (report.suppressed.length > 0) {
    lines.push(`## suppressed by allowlist (${report.suppressed.length})`, '');
    for (const finding of report.suppressed.slice(0, 40)) lines.push(`- ${finding.id}`);
    lines.push('');
  }
  return lines.join('\n');
}
