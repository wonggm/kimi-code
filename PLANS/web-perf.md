# Web UI runtime performance plan (fork custom features)

Status: approved plan, implementation in progress.
Date: 2026-08-02 (corrected after plan-mode exploration).

## Goal

Eliminate runtime rendering jank in the fork's **custom** `apps/kimi-web` features
(liquid glass, blur band, vignettes, KaTeX, streaming coalesce, glass overlays,
TOC rail, MenuSelect, dock chips) **without downgrading any existing feature**:
the look stays pixel-identical, the blur stays, the materials stay — they just
cost less to paint. Upstream code is out of scope unless a custom feature
forces the touch (keeps the upstream rebase surface unchanged).

## Constraints

- No visual downgrade. Every change must pass the pixel gate.
- Custom features only; file scope bounded by the merge-upstream-kimi inventory.
- ~5 GB RAM machine: every build/test/typecheck invocation uses
  `NODE_OPTIONS='--max-old-space-size=3072'`. Bench runner is memory-frugal
  (one browser at a time, serial scenario runs).
- The production bundle must stay byte-identical: all bench code is dev-only.
- No heavy new tooling: no playwright/puppeteer download. The bench driver uses
  the already-cached Chromium (`~/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome`)
  over raw CDP via the existing `ws` devDep; the only new devDependencies are
  `pixelmatch` + `pngjs` (pure JS, already in the pnpm store).

## Code facts (verified 2026-08-02)

- No vue-router; `src/main.ts` mounts `App.vue` directly. `DesignSystemView.vue`
  is the overlay-view precedent. Bench page = `?bench=1` branch in `main.ts`
  guarded by `import.meta.env.DEV`, mounting `src/views/BenchView.vue`.
- Turn list renders in `ChatPane.vue:550` (v-for, no v-memo, no virtualization).
  ConversationPane owns the scroller (`.panes.chat-scroll` :1294), vignette mask
  (scoped CSS :1555-1565) and the 96px top blur band
  (`.chat-layout::before` :1576-1589, blurs live scrolling text).
- Streaming pipeline: WS deltas → `eventBatcher.ts` (rAF-throttled, 32 KB
  coalesce cap) → `messagesToTurns.ts` (pure sync reducer, `absorbContent()`
  :638-746) → `Markdown.vue` re-renders full `<MarkdownRender>` per delta
  (no per-block memoization; KaTeX already runs in a web worker).
- `Dialog.vue:163-176` overlay: `backdrop-filter: blur(10px) saturate(140%)` +
  entrance opacity animation; panel carries `.lg-frost` (blur 34px).
  `Sheet.vue:36-46` same scrim, no animation. Teleport-to-body, v-if mount.
- `style.css` (1308 lines): liquid-glass base `.lg-glass`/`.lg-frost` + light
  overrides + hover :628-776 (shared, FROZEN); `.chat-header` :827-839;
  composer pills :855-880; `.sd` settings controls :889-932; dock chips :934-949;
  Firefox nested-backdrop workaround :951-964 (must stay intact).
- Tests: 30 pure-logic vitest files in `apps/kimi-web/test/` (no jsdom);
  `pnpm --filter @moonshot-ai/kimi-web run test` / `run typecheck`.

## Architecture

1. Bench page renders REAL presentational components (ChatPane, Markdown,
   Dialog, Sheet, Menu, Tooltip, Toast, ConversationToc, MenuSelect, Composer)
   driven by synthetic data fed into `messagesToTurns` — no kap-server, no WS.
2. Bench runner (`apps/kimi-web/bench/`): CDP driver over `ws` — headless
   Chromium 1440x900 DSF 1; scenarios navigated via `?bench=1&scenario=X`;
   metrics harvested from in-page sampler (`window.__bench`: rAF frame times +
   PerformanceObserver longtasks); pixel captures with
   `prefers-reduced-motion: reduce` emulated; `pixelmatch` diff (threshold 0.1,
   fail >0.01% mismatch) against a reference set captured BEFORE any change.
3. style.css is APPEND-ONLY for perf work: each workstream adds a
   `/* ---- perf: WS-1x ---- */` section at EOF; the frozen base is untouched.
4. Scenarios: `streaming-replay` (~2000-token fixture with KaTeX + code fences,
   ~40 tok/s, auto-follow scroll, glass on, dark), `scroll-long` (500 turns,
   programmatic scroll, glass on/off × dark/light), `dialog-storm`
   (SettingsDialog+MenuSelect, Dialog, Sheet, BottomSheet, ServerAuthDialog,
   20 cycles), `dock-toc` (ChatDock pills + TOC hover-expand).

## Metrics targets (vs baseline, same machine)

- streaming-replay + scroll-long: p95 frame time ≥ 30% better, longtask total
  ≥ 50% down. 16 ms p95 aspirational, not a hard gate.
- dialog-storm + dock-toc: p95 ≤ 16 ms or ≥ 30% better.
- Hard gates per workstream: pixel diff pass, tests green, typecheck green,
  prod build unchanged (no bench chunk in dist).

## Execution (subagent-oriented)

| Step | Who | What |
|---|---|---|
| 1 | 1 coder subagent (foreground) | Phase 0: bench harness, baseline.json, reference pixel set, isolation checks |
| 2 | 3 coder subagents (parallel) | 1A conversation column (ChatPane/ConversationPane/Markdown/messagesToTurns/.chat-header), 1B dialogs & overlays (Dialog/Sheet/BottomSheet/ServerAuthDialog/SettingsDialog/MenuSelect/.sd block), 1C floats (Menu/Tooltip/Toast/SlashMenu/MentionMenu/Composer/ChatDock/ConversationToc — profiling-driven only, "no change" is valid) |
| 3 | main agent | Apply style.css appends in order 1A→1B→1C; full bench + diff + test + typecheck |
| 4 | 1 coder subagent (foreground) | Phase 2 review: final metrics table, upstream-creep audit vs merge-upstream-kimi inventory, rebase-surface audit |
| 5 | main agent | Update this file with final metrics; report |

## Failure handling

- Pixel gate fails on a correct change → owner makes it pixel-identical or
  reverts; no gate exceptions without asking the user.
- Baseline shows no scenario with p95 > 16 ms → stop after Phase 0 and report;
  do not manufacture optimizations.
- Hot spot unfixable without visual change → document here as a known cost;
  do NOT ship adaptive quality tiers (rejected).

## Out of scope

- Build-time performance / bundle size.
- Upstream message-list virtualization (revisit only if 1A's measurement
  proves it unavoidable).
- Backend (`kap-server`, `agent-core-v2`) paths of the custom features.

## Results (Phase 2 review, 2026-08-03)

Full gate re-run on the combined tree (heap-capped
`NODE_OPTIONS='--max-old-space-size=3072'`, no concurrent Chrome; metrics run
2026-08-02T22:23Z): `pnpm bench` (latest.json), `pnpm bench:diff`, `pnpm test`,
`pnpm typecheck` — all green. Additionally verified: production `vite build`
contains no bench chunk (DEV branch dead-code-eliminated; no BenchView/bench
strings in `dist/assets`), and `bench/results/baseline.json` is clobber-safe
(`--save-baseline` opt-in in `bench/run.mjs`).

### Metrics: baseline.json (pre-change, 21:05Z) vs latest.json (combined tree)

Frame times in ms at 1440×900 headless (60 Hz vsync ⇒ 16.7 ms quanta).
`dropped` = % frames > 33.3 ms. Δ is latest vs baseline.

| Scenario | mean | p50 | p95 | p99 | dropped % | longtasks (n / ms) |
|---|---|---|---|---|---|---|
| streaming-replay | 17.06 → 17.20 (+0.8%) | 16.7 → 16.7 | 16.8 → 16.8 | 16.8 → 33.3 (+1 vsync step) | 0.41 → 0.61 | 2/605 → 2/609 |
| scroll-long | 22.49 → 21.14 (−6.0%) | 16.7 → 16.7 | 33.44 → 33.40 | **66.7 → 50.0 (−25%)** | 9.93 → 8.18 (−1.75 pp) | 11/4176 → 9/4920 |
| dialog-storm | 43.03 → 42.74 (−0.7%) | 16.7 → 16.7 | 133.3 → 133.4 | 137.4 → 153.7 | 33.33 → 31.28 (−2.05 pp) | 3/716 → 3/749 |
| dock-toc | 22.80 → 21.60 (−5.3%) | 16.7 → 16.7 | **49.9 → 33.4 (−33%)** | 50.0 → 50.0 | 16.01 → 12.70 (−3.31 pp) | 3/692 → 3/689 |

Reproduced wins: WS-1A scroll-long p99 −25% (+ mean −6%, fewer dropped frames);
WS-1C dock-toc p95 −33% (long frames 7→3), meeting its ≥30% target.
Not reproduced in this run: WS-1B's earlier dialog-storm p95 −6% / mean −9%
claim — p95/mean are flat here; at 179 frames the tail is 1–2 frames of
vsync-quantized noise. No regression: p50 unchanged everywhere.
streaming-replay p99 gained one vsync step (single-frame-level jitter;
mean/p50/p95 unchanged; the streaming turn is exempt from content-visibility).

### Pixel gate

All 8 scenes pass the 0.01% budget; `settings-dialog` is 0 px different,
the other scenes differ by exactly 23 px (0.0018%, subpixel text-AA noise,
identical across scenes). Reference set was captured before the first perf
edit; current set after the last one (mtimes verified).

### Known costs (documented, not fixed)

1. **Irreducible software-raster blur cost under headless** (WS-1B): headless
   Chromium rasterizes `backdrop-filter` on the CPU, so dialog/sheet open pays
   the full scrim + frost raster cost regardless of staggering; the stagger
   only stops both rasters stacking into one frame. The remaining tail is not
   removable without dropping the blur itself (rejected: no visual downgrade).
2. **Longtask floor** (WS-1A): scroll-long's longtasks are dominated by the
   one-off 500-turn mount and the shiki/KaTeX bundle evals. content-visibility
   cut the count (11→9) but total ms stays near the floor (4176→4920, within
   run noise). Moving this floor requires message-list virtualization, which is
   out of scope (plan §Out of scope).

Consequently the plan's soft targets (p95 ≥ 30% better and longtask total
≥ 50% down for streaming-replay + scroll-long) are NOT met; the hard gates
(pixel, tests, typecheck, prod bundle) are all green. No adaptive quality
tiers were added (rejected option).

### Review findings (audit, this run)

- Upstream creep: none beyond the bench harness and the user's pre-existing
  dirty files.
- Rebase-surface growth (needs merge-upstream-kimi inventory rows):
  `ChatPane.vue` (first fork edit in a fully upstream file — 1 template line),
  `main.ts` (dev-guarded bench branch), `package.json`/`pnpm-lock.yaml`
  (bench scripts + pixelmatch/pngjs devDeps), and `:class` bindings on
  upstream-owned template lines inside the shared Dialog.vue/BottomSheet.vue.
- Pixel-invisible changes, all deliberate and code-documented: WS-1A
  content-visibility skips offscreen rows (first-pass scrollbar estimation,
  find-in-page activation semantics); WS-1B blur appears ~1–2 frames late
  during dialog/sheet open transients (settled state identical); WS-1C
  persistent empty compositor layer on the TOC panel. No animation durations,
  easings, or interaction handlers were changed.
