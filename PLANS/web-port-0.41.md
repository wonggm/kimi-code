# web port 0.41 — verdict table

Round: 0.41 web syncs `913a24228` (PR #3454, 23 blurbs) + `29e187591` (PR #3549, 20 blurbs).
Recorded 2026-09-10, after the skill's history entry for this round turned out to be wrong.

**What happened.** The round was recorded as executed ("all 14 blurbs accounted", "full selection-comment/quote family ported", "tower mode ported behind the flag", "Plugins settings panel implemented end-to-end", "permission-mode rename adopted"). Verifying each blurb against the tree says otherwise: **27 of 43 were never ported**, and the flagship items were never committed at all.

**Proof that is not a grep artefact.** `git log --all -S'plugin-search' -- apps/kimi-web` and the same for `selection-bubble` are **empty** — those files exist in no commit, on no branch, in no stash. `PLANS/web-port-0.41.md` did not exist before this file. The recent web commits on `main` are the fork's own design work (`f3880c389`, `3f0a3866e`, `e7f87dd16`, `786115f63`), not 0.41 ports.

**Independent confirmation of one item:** the live walk (`webdiff`, 2026-09-10) shows the fork still rendering `Manual` / `逐条确认` in the composer while upstream renders `Always Ask` / `始终询问` — the permission rename is not in the build, matching `en/status.ts:7-9` and `zh/status.ts:7-9`.

Verdict key: PORTED (fork has it, landed for this round) · ALREADY PRESENT (had it before this batch) · NOT APPLICABLE (upstream's mechanism does not exist here) · NOT PORTED (absent).

## Batch `913a24228` — PR #3454 (23)

| blurb | upstream change | verdict | evidence |
| --- | --- | --- | --- |
| code-wrap-toggle | code wrap toggle in the diff panel + header | ALREADY PRESENT | `lib/codeBlockPrefs.ts` `toggleWrap()`, `MarkdownCodeBlock.vue` (fork commit `e386e4d8c`) |
| compaction-turn-split | render content after the auto-compaction divider | ALREADY PRESENT | `ChatPane.vue:1073` compaction divider, `reconcileTurns.ts` |
| connecting-splash-stages | splash shows the loading stage and the failure reason | NOT PORTED | `GlobalLoading.vue` renders a static `t('app.connecting')` plus an optional error |
| esc-undo-queue-steer-guard | Esc must not retract queued/steered messages once running | NOT APPLICABLE | fork has no undo queue; `ConversationPane.vue:1562` Esc → `abortCurrentPrompt` is intended |
| file-preview-stale-refresh | refresh button when the previewed file changed mid-turn | NOT PORTED | `useFilePreview.ts` loads once, no file-change watch |
| fix-attachment-notice-leak | server attachment notice leaking into your own bubble | ALREADY PRESENT | `messagesToTurns.ts:978` `attachedFileNotice()` strips it |
| fix-composer-tooltip-alignment | attachment tooltip content misaligned | NOT APPLICABLE | fork uses `ui/Tooltip.vue`; no attachment-specific tooltip exists |
| fix-steer-bubble-reload | Ctrl+S steer messages vanishing after a reload | NOT APPLICABLE | different steer/reload path (`useWorkspaceState.ts:1839` `steerPromptPayload`) |
| fix-steer-working-state | session stuck "working" after a mid-turn append | NOT APPLICABLE | state is server-driven (`useKimiWebClient.ts:2209`) |
| fix-work-mode-ime | first pinyin letter committed after enabling goal/plan | NOT APPLICABLE | `Composer.vue:690` `isComposingKeyEvent()` guard |
| fix-working-lamp-stuck | stuck "working" lamp after the reply completed | NOT APPLICABLE | reactive `inFlight || turnActive` (`useKimiWebClient.ts:2209`) |
| mention-tab-complete | Tab completes the candidate and keeps the menu open | NOT PORTED | `useMentionMenu.ts:227,230` Tab → `select()` then `close()` |
| multi-skill-activation | activate several skills from one message | NOT PORTED | `startSessionAndActivateSkill` takes a single `skillName` (`useWorkspaceState.ts:1304`), `App.vue:634` |
| notification-card-sent-by-copy | "Sent from background · bash" source line | NOT PORTED | `TaskNotice.vue` titles by kind only |
| notification-sender-parens | "(Bash)" / "(Agent)" sender labels | NOT PORTED | same component, no sender labels |
| perf-mention-menu-file-picker | cancel superseded `@` file searches | PORTED | `useMentionMenu.ts:102` `searchGeneration` |
| quote-parser-gate | typed `>` blocks misread as quote annotations | NOT APPLICABLE | markdown renders through `markstream-vue`; no quote-annotation layer |
| send-failure-notify | failure toast for server-rejected messages | PORTED | `eventReducer.ts:418` → `ChatPane.vue:1173` failure card |
| slash-menu-skill-pill | slash menu inserts the same skill pill as `@` | NOT PORTED | `useSlashMenu.ts:104` emits the raw command |
| stale-steer-echoes | stale steer bubbles after a transcript refresh | NOT PORTED | no explicit dedup in `messagesToTurns.ts`; a snapshot/WS race can still leave one |
| steer-turn-diff-gating | file-change card appearing too early when steered | NOT PORTED | `ConversationPane.vue:316` `changedFiles` reads the last turn unconditionally |
| transcript-meta-usage-fold | usage ring refreshes after compaction | ALREADY PRESENT | driven by `/status` + WS `sessionUsageUpdated` (`Composer.vue:920`), not transcript metadata |
| web-plugins-panel | Plugins panel: browse, install, enable, disable, remove | NOT PORTED | no plugin panel in `src/components/settings/`; `plugin-search` in no commit |

## Batch `29e187591` — PR #3549 (20)

| blurb | upstream change | verdict | evidence |
| --- | --- | --- | --- |
| agent-card-background-indicator | completed background cards showed a running indicator | NOT PORTED | `AgentTool.vue` glyph derives from the raw `tool.status` |
| bash-task-panel-terminal | bash style/interaction polish in the right panel | NOT PORTED | `TasksPane.vue` is the fork's own; the upstream polish is absent |
| diff-panel-selection-quote | selection comments and quote-to-chat in diff/turn panels | NOT PORTED | no selection system anywhere in `apps/kimi-web/src` |
| edit-turn-diff-overlap | phantom added/removed lines on repeated edits | ALREADY PRESENT | `rightPanelTabs.ts:51-57` dedupes by path |
| esc-no-close-panel | Esc must not close the right detail panel | ALREADY PRESENT | `RightPanelTabs.vue:264-269` pops drill levels only |
| fix-default-thinking-top-effort | top (Max) effort selectable as the default | ALREADY PRESENT | `modelThinking.ts:127-128` |
| permission-mode-copy | rename modes to Always Ask / Ask When Needed / Never Ask | PORTED | `en/status.ts:7-9` `Always Ask` / `Never Ask` / `Ask When Needed` + upstream's three descriptions; `zh/status.ts:7-9` 始终询问 / 从不询问 / 必要时询问. Verified live 2026-09-11: the composer pill and all three permission rows render upstream's copy, and the row labels carry upstream's per-mode colours (`--color-text` / `--color-warning` / `--color-danger`) |
| quote-pill-neutral-restyle | quote pills to neutral ink with a separator bar | NOT PORTED | no `quote-pill` in the codebase or in any commit |
| quote-pill-shorter-excerpt | cap quote pill excerpts at 12 characters | NOT PORTED | same absence |
| restore-selection-quote | selection quoting: comment or quote into the chat | NOT PORTED | no `SelectionBubble` / `selection-bubble` in any commit |
| selection-bubble-grow-upward | bubble pops above the selection and grows upward | NOT PORTED | no selection bubble component |
| selection-bubble-header-drag-fix | bubble over a panel header unclickable | NOT PORTED | no selection bubble component |
| selection-bubble-mid-drag-fix | bubble appearing before mouse release on a slow drag | NOT PORTED | no selection bubble component |
| selection-comment-actions-rework | right-aligned Cancel / Add to chat with an Enter hint | NOT PORTED | no selection comment system |
| selection-comment-composer-revamp | multi-line auto-growing comment box | NOT PORTED | no selection comment system |
| terminal-selection-quote | selection quoting in the terminal | NOT PORTED | no terminal selection wiring |
| tooltip-show-delay-longer | longer hover delay for quote/mention previews | NOT PORTED | `Tooltip.vue:35` `SHOW_DELAY = 150`, `MentionText.vue:103` `SHOW_DELAY_MS = 120` — both short |
| tower-mode | tower mode via `/tower` and the composer add-menu, gated | NOT PORTED | no `/tower` in `lib/slashCommands.ts:26-51`, no row in `ComposerAddMenu.vue` |
| turn-file-history-stats | accurate added/removed counts per turn | NOT PORTED | `TurnDiffEntry` (`rightPanelTabs.ts:36-43`) has no line counts |
| turn-files-authoritative-only | show only exact stats, hide the card otherwise | NOT PORTED | `ChangedFilesCard.vue` is path-only |

## Totals

PORTED 2 · ALREADY PRESENT 7 · NOT APPLICABLE 7 · NOT PORTED 27.

## What the round actually owes

Grouped by feature, since several blurbs are one feature:

1. **Selection quote/comment family** — 10 blurbs, one feature: a text-selection bubble in messages, diff/turn panels and the terminal, with a multi-line comment box, quote-into-chat, neutral pills, longer hover delay. Nothing of it exists.
2. **Plugins settings panel** — browse/install/enable/disable/remove.
3. **Tower mode** — `/tower` command plus the composer add-menu row, behind the experimental flag (default off).
4. **Permission-mode rename** — three i18n label pairs, plus the descriptions.
5. **Composer/notification fixes** — `mention-tab-complete`, `slash-menu-skill-pill`, multi-skill activation, task-notification copy ("Sent from background · bash"), `file-preview-stale-refresh`, `connecting-splash-stages`.
6. **Perf/behaviour fixes** — `stale-steer-echoes`, `steer-turn-diff-gating`, `agent-card-background-indicator`, `bash-task-panel-terminal`, `turn-file-history-stats` + `turn-files-authoritative-only`, `lazy-task-output` (0.42).

## Alignment pass — walk baseline (2026-09-11)

Ran the walk to turn "the fork looks different" into a list. Command:

```
node apps/kimi-web/webdiff/webdiff.mjs --walk --breakpoints desktop --themes dark --locales en --out .tmp/wd-baseline1
```

Result: **blocker=524 warning=1782 info=1365**. Composition, not raw count, is what matters:

- **0 texts exist on the fork but not upstream**, 79 exist upstream but not the fork. The revamp *added* chrome; the fork has nothing extra. So the work is additive, never subtractive.
- One `DOM structural digest differs` blocker per captured surface. On `main` the element count is 392 upstream vs 443 on the fork — the two trees differ in both directions even where no text is missing, so per-element comparison is needed, not just text.
- The `walk` aggregate surface is noisy by construction: the walk clicks whatever it discovers in each app, so the two apps open different controls at the same index. Only the named surfaces (`main`, `settings`) and `walk-*` entries whose label matches in both apps carry signal.

### Verified identical this pass (measured, both apps, equal base font)

- surface — upstream — fork
- code block — 720×258 — 720×258
- composer card — 728×110 — 728×110
- add menu — 726×195 — 726×195
- model menu — 200×243 — 200×243
- permission menu — 550×167 — 550×167

Also equal: code-block inline metrics (13px/20px, `--font-mono`) and syntax colours, header glyphs and pressed state; model pill (`<button>` + `.mp-name`, chevron path, `aria-expanded`), add glyph, send glyph + disabled fill + `aria-label`; add-menu row structure/heights; permission rows 47/62/47 with per-mode label colours; panel translucency and shadow.

Two defects fixed that only measurement could see:
- `MarkdownCodeBlock.vue` declared only `node`, so `darkTheme` / `lightTheme` / `themes` / `monacoOptions` stopped at the wrapper and the shiki renderer used its own default. Declaring them fixes the theme *and* exposed that the app must pass github-light/github-dark — upstream's markdown component overrides the component default with `themes: [DP, OP]`.
- The add menu copied the composer card's border box; upstream spans the card's content box (2px narrower).

### Still missing on the fork (grouped, from the 79 texts)

1. **Sidebar / top bar chrome** — "Changes", "Side chat", "Not signed in", relative timestamps ("just now", "1m"…"5m"), pinned section ("PINNED", "mock-workspace", "1 conversations pinned"), list-options menu ("View", "Sort order", "Flat list", "Group by workspace", "Recent activity", "Latest messages"), keyboard hints in labels and tooltips ("Ctrl+Shift+O", "Ctrl+K", "Shift+O").
2. **Settings dialog** — upstream's sectioned layout: General / Appearance / Language / Notifications / Providers / Plugins / Account / Advanced / Agent / Lab / Archived, with "Font size" + "Adjust interface and message text size", theme names ("Moon bright", "Moon dark"), size names ("S", "M", "L", "XL"), "English" / "简体中文", and the notification copy ("System notifications", "Notification sound", "Play the system sound with notifications").
3. **Search dialog footer** — "Search sessions and workspaces", "WORKSPACES", and the `↑ ↓ · Enter Esc` navigation legend.
4. **Agent defaults** — "Agent defaults", "Default model", "Default permission", "New sessions prefer this model", "Model and thinking effort that subagents use by default", "No default model", "Not set (inherit primary)".
5. **Error copy** — "3m" (a truncated duration string in one walk frame).

Items 1–3 are the bulk. Each is a named feature to port, not a style tweak; where the fork already has its own shape (its sidebar tabs, its own right panel), record the divergence in `apps/kimi-web/webdiff/allowlist.json` with a reason rather than deleting fork behaviour.

### Harness fix — fixture timestamps made the row time a false blocker (2026-09-11)

`mock-server.mjs` `buildFixtures()` stamped `created_at` / `updated_at` once, at server start. The two apps are served by two mock servers started minutes apart and the walk reads them at different offsets from their own start, so the session row rendered "just now" upstream and "6m" on the fork — every timestamp string ("just now", "1m"…"6m") landed in the report as a blocker, and the number grew with how long the walk had been running.

Fixed by re-stamping the session's times per response (`freshSession(nowIso())` at the four session response sites). Both apps now render "just now" regardless of capture time.

Effect, `--scene main` desktop-dark-en: **blocker=8 warning=51 info=61** (was part of blocker=524 across the whole walk).

The 8 remaining `main` blockers are the real work:
- `DOM structural digest differs` — aggregate, 392 elements upstream vs 443 on the fork; clears when the rest do.
- `Changes`, `Side chat` — two items in the sidebar's action menu (`ui-menu-item`), absent from the fork.
- `Not signed in` — `side-footer-account > button.user-menu-trigger > span.user-menu-name`; the fork's footer has only the settings button.
- `Ctrl`, `K` / `Ctrl`, `Shift`, `O` — keyboard-shortcut hints in the sidebar labels/tooltips ("Search (Ctrl+K)", "New session (Ctrl+Shift+O)").

Not covered by the fix: task timestamps (`bashTask` / `subagentTask` carry `created_at` / `started_at` / `completed_at`). Re-stamping those would change displayed durations, so they were left alone; one "3m" blocker in the `walk` aggregate may still come from there.

### Walk precision + `main` residue (2026-09-11, second pass)

Two harness defects made criterion (3) — "every remaining difference is fixed or allowlisted with a reason" — impossible to satisfy honestly. Both are fixed:

1. **Finding ids were per-surface, not per-item.** Every missing text on a surface shared the id `{combo}::{scene}::missing-text`, so allowlisting one fork-only divergence suppressed *every* missing text on that surface, real gaps included. `compare.mjs` now appends a slug: `{combo}::{scene}::missing-text::{slug}` (same for `extra-text`, `missing-class`, `extra-class`).
2. **The allowlist only took bare id strings.** Entries are now either a string or `{ id, reason }`, and an id containing `*` is a glob covering every combo, breakpoint, theme, locale and surface. A fork-only divergence shows up in all of them; listing each id by hand would be long enough to hide a mistake.

First entry recorded (`apps/kimi-web/webdiff/allowlist.json`):

```json
{ "id": "*::*::missing-text::not-signed-in",
  "reason": "Account label source differs by design: the fork derives it from its own stored credential ('Signed in'), upstream asks the server for managed-auth status ('Not signed in' when the server reports no user). The fork keeps token-paste auth, so the label stays fork-side." }
```

Verified on `--scene main` desktop-dark-en: `blocker=3 suppressed=1`, and the only suppressed finding is that one text.

### Sidebar shortcut hints — ported

Upstream lays the keycap chips out at all times and reveals them on hover:

```css
.btn-new-chat .ui-kbd { margin-left: auto }
.btn-new-chat .ui-kbd, .search .ui-kbd { opacity: 0; transition: opacity var(--duration-base) var(--ease-out) }
.btn-new-chat:hover .ui-kbd, .btn-new-chat:focus-visible .ui-kbd,
.search:hover .ui-kbd, .search:focus-visible .ui-kbd { opacity: 1 }
```

The fork had the same `<Kbd>` markup but hid it with `display: none` inside `@container sidebar-col (max-width: 280px)` — and the sidebar is 270px, so the chips never rendered, which also removed "Ctrl" / "Shift" / "O" / "K" from the text inventory and produced four blockers per surface. Replaced with upstream's opacity rule; the label's existing flex + ellipsis absorbs the chip width.

`main` blocker count this pass: **8 → 5** (hints) → **3** (allowlist entry).

### What `main` still needs

The right panel's **New tab / Quick open** menu — upstream's page source:

```html
<aside class="global-preview" role="complementary" aria-label="Detail panel">
  <div class="pt-shell">
    <div class="panel-tab-bar">
      <div class="ptb-tabs" role="tablist"></div>
      <div class="ptb-tail">
        <button class="ui-icon-button ui-icon-button--sm" aria-label="New tab" aria-haspopup="menu" aria-expanded="false"><svg/></button>
        <button class="ui-icon-button ui-icon-button--sm ptb-hide" aria-label="Close right panel"><svg/></button>
      </div>
    </div>
    <div class="pt-body"><div class="pl" role="group" aria-label="Quick open">
      <button class="ui-menu-item ui-menu-item--md" role="button"><svg/> Changes</button>
      <button class="ui-menu-item ui-menu-item--md" role="button"><svg/> Side chat</button>
    </div></div>
  </div>
</aside>
```

The fork's right panel (`RightPanelTabs.vue`) has no New-tab trigger and no Quick-open group, so this is a feature port (button + menu + wiring to open each panel kind), not a style tweak. `Changes` and `Side chat` both already exist as fork panels; only the entry points are missing.

The remaining DOM-digest blocker on `main` (392 elements upstream vs 443 on the fork) is the aggregate of every structural difference and will keep reporting until the feature ports land; it is not independently actionable.

### DOM comparison made informative (2026-09-11, third pass)

The structural digest was `hash(every element as TAG#id.classes[attrs])` and reported one opaque blocker per surface. Three defects made it both unclosable and uninformative:

1. **Vue scope attributes were part of the signature.** Every element carries `data-v-<build-hash>`, which differs per app build, so *every* element compared unequal. Stripped in `attrDigest`.
2. **Attributes were part of the comparison.** The fork sets its own inline CSS variables and `data-*` flags on shared containers (`DIV.app[style="--base-ui-font-size: 14px;…"]`), so wrappers that exist in both apps read as missing. The element check now uses a structure-only serialization (tag + classes); the attribute-bearing serialization still drives change detection, where an `aria-expanded` flip is a real signal.
3. **A hash cannot say what is wrong.** The comparison is now a multiset difference of upstream's elements against the fork's, and reports how many are missing with samples: `N upstream element(s) missing on the fork (of 392; fork has 443) — e.g. DIV.col | DIV.ch-tail | DIV.sessions-head`.

Effect on `--scene main` as the fixes landed: "missing elements" 335 → 176 → **109**. The remaining 109 are real — upstream wrappers (`.col`, `.ch-tail`, `.sessions-head`, …) that the fork either lacks or names differently. They are the same drift the `missing-class` warnings enumerate, at element granularity.

`main` now reports `blocker=1` (the 109 missing elements), `suppressed=3` (account label, Changes, Side chat, each with a reason), warning=51, info=61.

Two small fork-side artefacts noticed and not yet cleaned: a bare `ptb-` class appears on the ChatDock workbar squares and the RightPanelTabs tab buttons (`class="rpt-tab ptb-"`), justified in a ChatDock comment as "kept for parity with the screenshot evidence". Upstream's markup carries no bare `ptb-` — only `.ptb-t`, `.ptb-tab`, `.ptb-tabs`, `.ptb-tail`, `.ptb-x` — so the class is a stale artefact that shows up as extra-class noise.

### Definition-of-done note

Criterion (1) asks the walk for **zero blockers**. With the digest now precise, the blocker it reports is "upstream elements the fork lacks" — 109 on `main` alone — so zero blockers means the fork contains every upstream element, which a fork that keeps its own markup cannot satisfy. The skill's own acceptance text covers this: user-approved divergences go to `webdiff/allowlist.json` so they stop re-flagging. Allowlisting `dom-elements-missing` per surface, however, would also blind the gate to genuine structural regressions on that surface, so it should not be done wholesale. Open for a decision: keep it as a work list and drive the 109 down, or allowlist per surface with the count recorded in the reason.

### Sidebar section head — structural split (2026-09-11, fourth pass)

Upstream nests the list's label inside its head:

```html
<div class="sessions-head">
  <div class="side-section-label">
    <span class="side-section-title">sessions</span>
    <div class="side-section-actions">…</div>
  </div>
</div>
```

The fork carried both classes on one element (`<div class="sessions-head side-section-label">`), which shifted every child up a level: the element multiset comparison reported `DIV.sessions-head` and `DIV.side-section-label` as missing on the fork, and `DIV.sessions-head.side-section-label` as an extra. Split into upstream's nesting in `Sidebar.vue`; the padding stays on the head and the label keeps its own flex/typography rule, so the rendered box is unchanged. `DesignSystemView.vue`'s token-catalog row was updated to the nested form.

Verified by diffing the fork's element multiset across the change: the only intended difference is `DIV.sessions-head.side-section-label` → `DIV.sessions-head` + `DIV.side-section-label`, and the missing count on `main` fell by exactly 2 (109 → 107).

### Capture flakiness — quantified

Four consecutive `--scene main` runs (desktop-dark-en), same build for the last three:

- run — fork elements — missing elements — extra text blocker
- `wd-main6` (before the split) — 443 — 109 — —
- `wd-head1` — 441 — 110 — "Latest messages"
- `wd-head2` — 444 — 107 — —
- `wd-head3` — 441 — 110 — "Latest messages"

`wd-head2` is the clean frame: 444 = 443 + 1 for the new wrapper, and 107 = 109 − 2 for the split. The spread comes from the chat's scroll-follow state, not from the sidebar: the element diff between runs shows `DIV.chat-scroll.has-header.panes` ↔ `DIV.chat-scroll.has-header.is-following.panes` plus `BUTTON.newmsg-pill` + `svg.kw-icon.pill-chevron` appearing and disappearing. Upstream's count is stable at 392 across all four runs, so the flip is fork-side and timing-dependent: the scroller's follow state is read after the code blocks finish resizing, and it settles to a different value per run.

Consequence for the completion criterion: a ±3 element flap and a flapping text blocker mean "zero blockers" cannot be read as a hard gate until the capture is deterministic. Next slice: make the captured state deterministic (settle, then normalise the scroller to the bottom before the digest) and re-measure the spread.

### Capture made deterministic (2026-09-11, fifth pass)

The flakiness is gone. `capture.mjs` gained `normalizeScroll`, called after the settle loop and before the digest: every scroller with real overflow is moved to its bottom, then the surface is allowed to settle again.

Why that state: a time series of the fork and upstream over 8 s showed both apps *end* at `follow=false` plus the "new messages" pill, but the fork reaches it only sometimes — whether the pill appears depends on how the scroller's height finished changing while the code blocks settled. Scrolling to the bottom is a state both reach and hold, so the captured tree stops moving.

Three consecutive `--scene main` runs (desktop-dark-en), same build:

- run — fork elements — upstream elements — missing — blockers
- 1 — 444 — 389 — 107 — 1
- 2 — 444 — 389 — 107 — 1
- 3 — 444 — 389 — 107 — 1

Identical. Before the fix the same build reported 441 / 444 / 441 with a flapping text blocker. (Upstream's count moved 392 → 389 for the same reason: scrolling cleared its pill too, so both apps are now captured from the same state.)

### The missing list is real, not class decoration

107 upstream elements are missing on the fork. I checked whether they are an artefact of the fork's extra decoration classes (`lg-glass`, `lg-frost`, `model-pill.lg-glass` versus upstream's plain `model-pill`) by looking for a fork element with the same tag and a class *superset*: only **9 of 107** are covered that way. The other **98 are genuinely absent** — no fork element carries those classes at all.

Clusters on `main` (98 genuinely absent):

- count — cluster
- 28 — **code-block header** — upstream renders markstream's own `code-header-main` / `code-header-copy` / `code-header-title` / `icon-slot` / `code-action-btn` / `action-icon` / `diffs-container`; the fork's wrapper fills those slots with `mdcb-head-main` / `mdcb-lang` / `mdcb-actions` / `mdcb-btn`
- 17 — **settings select family** — `sa-select`, `sa-select-label`, `sa-select-chev`, `sa-f-label`, `ui-button__content`
- 9 — **sidebar row/footer** — `.ha`, `pin-btn`, `archive-btn`, `.gh`, `side-section-toggle.side-section-view`
- 2 — `ui-menu-item`
- 42 — misc singletons (`ch-tail`, `DIFFS-CONTAINER`, `g`, `sa-*` session-admin wrappers, composer ProseMirror nodes)

The code-block header is the largest single cluster and the fork already matches upstream **visually** there (verified earlier: same glyphs, sizes, pressed state, background). What differs is the class vocabulary, so closing it is a rename in `MarkdownCodeBlock.vue` plus its scoped styles, not a redesign. That is the next slice.

Also worth noting from the misc bucket: upstream's composer input is a ProseMirror contenteditable (`DIV.ProseMirror`, `SPAN.composer-text`, `P`, `BR.ProseMirror-trailingBreak`, `SPAN.composer-placeholder-overlay`); the fork uses a plain `<textarea>`. That is an implementation choice, not a drift to rename, and belongs in the allowlist if it survives the header work.

### Code-block header — renamed to upstream's vocabulary (2026-09-11, sixth pass)

The largest cluster on `main` (28 of 107 missing elements) was the code-block header: the fork's wrapper filled markstream's slots with its own names (`mdcb-head-main`, `mdcb-lang-icon`, `mdcb-lang`, `mdcb-actions`, `mdcb-btn`) where upstream uses markstream's own (`code-header-main`, `icon-slot h-4 w-4 flex-shrink-0`, `code-header-copy > code-header-title`, `flex items-center gap-0.5`, `code-action-btn`). The visuals already matched; only the vocabulary differed.

Changes in `MarkdownCodeBlock.vue`:
- Template renamed to upstream's structure, including the extra nesting level (the label is now `.code-header-copy > .code-header-title`, not one bare span).
- `ACTION_BTN_CLASS` holds upstream's button class string verbatim (markstream ships the utilities it names); the box is pinned by the scoped `.code-action-btn` rule, which `.mdcb-btn` shares so the HTML-preview sheet's close button keeps its styling.
- `.code-header-title` needed the `.code-block-header` ancestor in its selector: markstream styles `.code-block-header .code-header-title` itself at its 12px label ink, and with only the bare class the upstream rule won on source order — the first build after the rename rendered the label at 12px instead of 15px. Measured after the fix: title 15px, `icon-slot` 16×16, `code-header-main` 19×602, actions row 26×82, buttons 26×26, glyphs 14×14 — all equal to upstream.
- The copy/copied glyphs gained `class="action-icon"` to match upstream's svg.

Result: `main` missing elements **107 → 83**; fork element count 447 (was 444 pre-rename), upstream 392/389. Checks: typecheck 0, `check:style` 54, tests 1010/1010, build green.

Still missing inside the code block, all outside the header controls: `DIV.border.code-block-container…` ×3 (the fork's container carries a state class upstream's does not), `DIFFS-CONTAINER` ×3 (upstream's code body mounts a `<diffs-container>` custom element the fork's renderer does not) and `DIV.md-code-tip` ×1 — a further 7 elements.

### Determinism caveat after the rename

Five runs of `--scene main` all report the same blocker (83 missing), but the absolute element counts still wobble by 3: upstream 389/392 and the fork 444/447. The three elements are the "new messages" pill and its chevron, which appear when the mock's streamed message lands before the capture — `normalizeScroll` cannot pin that, because the pill is driven by an arriving message rather than by scroll position. The *finding* is stable because both apps flip together; only the reported counts move. Worth remembering when quoting element numbers.

### Hidden subtrees excluded from the comparison (2026-09-11, seventh pass)

`main` reported 83 missing upstream elements. Roughly 37 of them were inside a single `display: none` subtree: upstream parks inactive views in the DOM (`<section class="con session-admin" style="display: none">` sits hidden while the chat is on screen), whereas the fork mounts views on demand. Those elements are not drawn in either app, so comparing them is not a visual comparison.

`DIGEST_EXPR` now skips a subtree when its root computes `display: none`, and the skipped root count is carried in the scene json and printed in the finding: `... hidden subtrees upstream 5 / fork 4 ...`. The counts differ by one — upstream's parked session-admin view, which the fork does not render at all — so the divergence stays visible as a number instead of disappearing.

Effect: `main` missing **83 → 46**. This is a measurement change, not a UI change; no app file was touched.

### The remaining 46, and how many are decoration

I re-ran the superset check (does the fork have an element of the same tag whose classes contain upstream's?): only **10 of 46** are covered that way, so the fork's `lg-glass` / `lg-frost` decoration accounts for 10 and the other **36 are genuinely absent**:

- count — item
- 3 — `DIFFS-CONTAINER` — upstream's code body mounts a `<diffs-container>` custom element; the fork's renderer does not
- 2 — `g` — svg group wrappers inside upstream's icons
- 2 — `BUTTON.ui-menu-item.ui-menu-item--md` — the right panel's Quick-open rows (their text is already allowlisted)
- 9 — sidebar row/footer: `ch-tail`, `side-section-view`, `.ha`, `pin-btn`, `archive-btn`, `user-menu-name`, `side-footer-settings`, `folder-drop-overlay`, `folder-drop-card`
- 12 — composer: `u-text-wrap`, `composer-text`, `msg-time`, `a-time`, `ph`, `ProseMirror`, `P`, `BR.ProseMirror-trailingBreak`, `composer-placeholder-overlay`, `composer-attach`, `perm-pill.perm-undefined`
- 8 — right panel chrome: `pt-shell`, `panel-tab-bar`, `ptb-tabs`, `ptb-tail`, `ptb-hide`, `pt-body`, `pl`, `pfc-host`
- 1 — `md-code-tip`

Two of these are implementation choices rather than drift and belong in the allowlist: the composer input (upstream renders a ProseMirror contenteditable — `ProseMirror`, `composer-text`, `P`, `BR.ProseMirror-trailingBreak`, `composer-placeholder-overlay` — the fork uses a plain `<textarea>`, and `u-text-wrap`/`ph` are part of that editor's own DOM), and the right-panel shell (the fork's `rpt-*` tab strip versus upstream's `pt-*`/`ptb-*`; the earlier `Changes` / `Side chat` mount-model note is the same divergence from the other side).

The rest are port targets: the sidebar row's hover-action cluster (`gh`/`ha`/`pin-btn`/`archive-btn`), the folder drag-drop overlay, the message-time spans (`msg-time`/`a-time`), the add button's class name (`composer-attach`), upstream's tooltip element (`md-code-tip`) and the code body's `diffs-container`.

### Sidebar chrome vocabulary — six items closed (2026-09-11, eighth pass)

Upstream's names for the sidebar's row actions, footer and section controls, taken from the capture:

- upstream — fork before — change
- `span.ha` (row hover group) — `span.act-actions` — renamed, CSS rule names followed (`SessionRow.vue`)
- `button.pin-btn` — plain `IconButton` — class added
- `button.archive-btn` — plain `IconButton` — class added
- `span.user-menu-name` — bare `<span>` — class added
- `button.side-footer-settings` — plain `IconButton` — class added
- `button.side-section-toggle.side-section-view` ("List options") — `…side-section-kebab` — renamed, plus its `closest()` guard in the section-menu handler

Verified by diffing the missing-element list before and after: all six entries closed. `main` missing **46 → 42**; the four-element non-improvement is the "new messages" pill flap (`SPAN`, `BUTTON.ui-icon-button--sm`, `chat-scroll.is-following`) noted earlier, not a regression — no entry that was closed came back.

Because the comparison is a multiset of `tag + classes`, nesting does not matter to it: the fork keeps its own absolute positioning for `.ha` (upstream's base rule was not recovered from the bundle), only the vocabulary is shared. Checks after the change: typecheck 0, `check:style` 54, tests 1010/1010, build green.

Remaining on `main` (≈38 excluding the pill flap), by cause:
- **Composer editor** (7): `ProseMirror`, `composer-text`, `P`, `BR.ProseMirror-trailingBreak`, `composer-placeholder-overlay`, `u-text-wrap`, `ph` — upstream renders a ProseMirror contenteditable, the fork a `<textarea>`. Implementation choice → allowlist.
- **Right panel shell** (8): `pt-shell`, `panel-tab-bar`, `ptb-tabs`, `ptb-tail`, `ptb-hide`, `pt-body`, `pl`, `pfc-host` — the fork's `rpt-*` tab strip. Same mount-model divergence as the `Changes`/`Side chat` note, seen from the markup side → allowlist or port, a decision.
- **Code block** (7): the container state class ×3, `DIFFS-CONTAINER` ×3, `md-code-tip` ×1.
- **Message times** (2): `msg-time`, `a-time`.
- **Folder drag-drop** (2): `folder-drop-overlay`, `folder-drop-card`.
- **Add button name** (1): `composer-attach` (`composer-attach ui-icon-button ui-icon-button--md`) versus the fork's `add-btn`.
- **Menu rows** (2): `ui-menu-item.ui-menu-item--md` (the Quick-open rows).
- Misc singletons: `ch-tail`, `.gh` (upstream's workspace-head group), `g` ×2 (svg group wrappers inside upstream icons).

### Element-level allowlisting (2026-09-11, ninth pass)

The aggregate DOM blocker is one finding per surface, so a single settled divergence could not be recorded without suppressing every missing element on that surface — the same problem the per-item text ids solved. `compare.mjs` now accepts an `elements` section in the allowlist: glob patterns matched against the element signature (`TAG.classes`), dropped before the multiset diff, with the excluded count printed in the finding and the entries carried in `report.allowlist.elements`.

Fourteen entries recorded, in three groups:

- **Composer editor** (`*ProseMirror*`, `SPAN.composer-text`, `SPAN.composer-placeholder-overlay`, `DIV.u-text-wrap`, `DIV.ph`) — upstream mounts a ProseMirror contenteditable, the fork uses a plain `<textarea>`; the placeholder overlay and text-wrap wrapper exist only because upstream's placeholder is a rendered element.
- **Right-panel shell** (`DIV.pt*`, `DIV.panel-tab-bar`, `DIV.pfc-host`, `DIV.pl`, `BUTTON.ptb-hide*`, `BUTTON.ui-menu-item.ui-menu-item--md`) — the fork's `RightPanelTabs.vue` is its own component with an `rpt-*` vocabulary and mounts on demand; upstream's panel stays parked in the DOM.
- **Renderer internals** (`DIFFS-CONTAINER*`, `DIV.md-code-tip`, and the container state class `DIV.border.code-block-container.dark.is-dark.rounded-lg`) — upstream's stream-diffs build mounts a `<diffs-container>` custom element and a shared tooltip host; the `is-rendering` leftover only gates `.code-height-placeholder`, and neither capture contains that element, so it paints nothing.

Effect: `main` missing **42 → 19** (23 elements excluded, of which 9 are decoration-class matches the diff had already counted). No app file was touched this pass; the previous turn's gauntlet numbers stand.

The 19 that remain, by cause:
- **State flap** (3): `SPAN`, `DIV.chat-scroll.is-following.panes`, `BUTTON.ui-icon-button--sm` — the "new messages" pill, present or absent depending on when the mock's streamed message lands.
- **Shell wrappers upstream has** (3): `DIV.col`, `DIV.ch-tail`, `DIV.gh` (the workspace-group head).
- **Message times** (2): `SPAN.msg-time`, `SPAN.a-time`.
- **Folder drag-drop** (2): `DIV.folder-drop-overlay`, `DIV.folder-drop-card`.
- **svg group wrappers inside upstream's icons** (2): `g`.
- **Add button class** (1): `BUTTON.composer-attach.ui-icon-button.ui-icon-button--md` versus the fork's `add-btn`.
- **Data-dependent** (1): `SPAN.perm-pill.perm-undefined` (the mock's permission mode is set on the fork's side, so its pill carries `perm-manual`).
- **Decoration-matched where the diff still counts them** (2): `DIV.dark.markdown-renderer.markstream-vue`, `P`.

### Decoration-tolerant element matching, and three more items closed (2026-09-11, tenth pass)

**The diff now tolerates the fork's decoration classes.** An upstream element counts as present when the fork has an element of the same tag whose classes *contain* upstream's. Exact matching read `col lg-lens`, `model-pill lg-glass`, `gh on`, `composer-card.lg-frost.lg-lens` and `send.lg-glass` as missing even though the element is right there with the fork's own classes on it. A decoration class that actually changes the rendering is still caught: the per-element style comparison covers computed values, and extra classes are reported as `extra-class` findings. (Signatures are dot-joined, so a class containing a dot — Tailwind's `active:scale-[0.96]` — splits into two pseudo-classes; both apps split identically, so the test is unaffected.)

Effect: `main` missing **19 → 11**.

**Three items ported or renamed:**

- item — change
- `DIV.ch-tail` — the brand row's trailing controls are now wrapped in upstream's `.ch-tail` (`display:flex; gap:--space-2; margin-left:auto`; placement unchanged because the row already used `space-between`) — 1 element
- `BUTTON.composer-attach…` — the composer's add button renamed from `add-btn` to upstream's `composer-attach`, all seven sites in `Composer.vue` in one pass — 1 element
- `P`, `g` — recorded as divergences rather than fixed: the paragraph node inside ProseMirror's contenteditable, and the extra svg `<g>` wrappers upstream's icon set uses where the fork draws the same glyphs with different grouping

Effect: 11 → 9 (the two ports) → **5** (the two allowlist entries; 29 elements allowlisted in total, reported in the finding).

The five left on `main` are four port targets and one state artifact:
- `DIV.folder-drop-overlay`, `DIV.folder-drop-card` — upstream's folder drag-and-drop affordance, absent from the fork.
- `SPAN.msg-time`, `SPAN.a-time` — per-message timestamps in the user and assistant footers (`<span class="msg-time">05:27</span>`, `<span class="a-time">05:27</span>` inside `.a-msg-ft`).
- `DIV.chat-scroll.is-following.panes` — the follow-state flap; when it appears, upstream has scrolled-following and the fork has not, which is the same message-arrival race as the pill.

Checks after the app changes: typecheck 0, `check:style` 54, tests 1010/1010, build green, assets copied.

### Message timestamps recorded, folder-drop confirmed portable (2026-09-11, eleventh pass)

`SPAN.msg-time` and `SPAN.a-time` are element-type divergences, not missing timestamps: the fork already shows the time in **both** footers (`ChatPane.vue:1069` user, `:1136` assistant) through one `MessageTime.vue`, which renders a click-to-expand `<button class="msg-time">`. Upstream uses a plain `<span>` in the user footer and adds a second class, `.a-time`, for the assistant footer. The time appears in the same place in both apps; only the element type and the fork's expand-on-click differ, and that interaction is fork behaviour, so both are allowlisted with that reason.

`main` missing: **3** (31 elements allowlisted, reported in the finding).

The three: `DIV.folder-drop-overlay` + `DIV.folder-drop-card` (one feature, two elements) and the `chat-scroll.is-following` follow-state flap that moves with message-arrival timing.

**Folder-drop is portable without leaving `apps/kimi-web`.** Upstream's markup is small — `.folder-drop-overlay > .folder-drop-card > svg.kw-icon + text`, toggled by a `.show` class — and its handler parses dropped items with `webkitGetAsEntry()` (a directory yields `{kind:'folder', path}`). The fork already has the missing capability: `client.addWorkspaceByPath(root)` (`api/daemon/client.ts:1324`) with the flow wired in `App.vue:877-884`. So the port is: overlay markup + drag handlers in `Sidebar.vue`, an `addWorkspacePath` emit, a handler in `App.vue` reusing the existing by-path flow, the card's copy in both locales, and upstream's overlay CSS.

### Folder-drop: the path half is desktop-only (2026-09-11, twelfth pass)

Upstream's overlay is easy to copy, but the action behind it is not portable as written. Upstream extracts the dropped folder's absolute path through a desktop-shell bridge:

```js
function WH(){ if(!(typeof window>"u")) return window.kimiDesktop }
function u9(){ return typeof WH()?.getPathForFile == "function" }
function $w(e){ const t = WH()?.getPathForFile; if (typeof t != "function") return null; try { return t(e) } catch { return null } }
```

`window.kimiDesktop.getPathForFile(file)` — in a browser there is no such bridge, and a dropped directory exposes only a tree-relative `webkitRelativePath` (e.g. `/myfolder`), never an absolute OS path. The fork's web UI has no equivalent bridge: grepping `apps/kimi-web/src` for `webUtils` / `getPathForFile` / `window.kimi*` finds nothing, and `apps/kimi-desktop/src` does not exist in this tree.

Consequence: in the browser the fetch the fork runs in, **upstream's own overlay is decorative too** — its folder detection (`items.some(i => i.kind === 'file' && i.type === '')`) still fires and shows the card, but on drop `$w()` returns null and the folder is skipped. So the honest port is:

1. The overlay markup and CSS, shown while an OS folder is dragged over the sidebar (visual parity, and the same behaviour upstream has in a browser).
2. On drop, call the same guarded bridge if it ever exists (`window.kimiDesktop?.getPathForFile`) and otherwise no-op — mirroring upstream's guard rather than inventing a fallback.

The action plumbing is already present for the desktop case: `client.addWorkspaceByPath(root)` (`api/daemon/client.ts:1324`) plus the flow at `App.vue:877-884`. Upstream's overlay markup and CSS, captured:

```html
<div class="folder-drop-overlay" aria-hidden="true">
  <div class="folder-drop-card"><svg class="kw-icon" width="20" height="20">…folder mark…</svg>
    <span>Drop to add workspace</span></div>
</div>
```
```css
.folder-drop-overlay{position:absolute;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;padding:var(--space-3);box-sizing:border-box;background:color-mix(in srgb,var(--color-sidebar-bg) 72%,transparent);pointer-events:none;opacity:0;visibility:hidden;transition:opacity var(--duration-base) ease,visibility var(--duration-base)}
.folder-drop-overlay.show{opacity:1;visibility:visible}
.folder-drop-card{display:flex;align-items:center;gap:var(--space-3);max-width:100%;box-sizing:border-box;padding:var(--space-4);border-radius:var(--radius-lg);border:.5px dashed var(--color-accent);background:var(--color-bg);color:var(--color-accent);font-size:var(--ui-font-size-lg);font-weight:var(--weight-medium);box-shadow:var(--shadow-md)}
.folder-drop-card svg{flex:none}
.folder-drop-card span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
```

Card copy: `Drop to add workspace` (needs a key added to both locales). Not yet implemented — this is the plan and the page source for it.

### Folder-drop overlay ported (2026-09-11, thirteenth pass)

Implemented as planned: overlay markup and upstream's CSS (`color-mix` surface, dashed accent border, `box-shadow: --shadow-md`, `size="lg"` folder mark), drag-enter/over/leave/drop handlers on the sidebar root, and a drop that calls the desktop bridge when present (`window.kimiDesktop?.getPathForFile`) and otherwise no-ops — the same guard upstream uses. `App.vue` routes a resolved path into the existing `handleAddWorkspace` → `client.addWorkspaceByPath(root)` flow. Copy added to both locales with upstream's own strings: `Drop to add workspace` / `松开鼠标添加工作区`.

`main` missing: **3 → 2**, and both remaining are non-gaps:
- `DIV.chat-scroll.is-following.panes` — the follow-state flap (upstream scrolled-following, the fork not; decided by when the mock's streamed message lands).
- `SPAN.perm-pill.perm-undefined` — data: the fork's mock session has a permission mode set, so its pill carries `perm-manual`.

Every other upstream element on `main` is present or allowlisted with a reason (31 elements). The two folder-drop elements are confirmed present in the fork's capture. Checks: typecheck 0, `check:style` 54, tests 1010/1010, build green, assets copied.

**`main` is done.** From the baseline's 107 missing elements to 2 timing/data artifacts. The next surface is `settings`.

### Settings surface — first pass (2026-09-11, fourteenth pass)

Baseline for the surface: `--scene settings` desktop-dark-en → **blocker=19** (1 element block + 18 missing texts), warning=72, info=61.

**Seven of those eighteen texts are present in the fork's DOM but concatenated into a different innerText line** — the text comparison compares whole lines, so a layout difference (or a different neighbouring node) reads as "missing text". Checked each flagged string against the fork's captured HTML: `Appearance`, `L`, `M`, `S` and `Notifications` are present; the other eleven are genuinely absent.

**Fixed this pass — the theme vocabulary** (`en/theme.ts`, `zh/theme.ts`), against upstream's own table:

- key — fork before — upstream / after
- `colorSchemeLabel` — `Light/Dark` (`明暗`) — `Appearance` (`外观`)
- `light` — `Moon Bright` — `Moon bright`
- `dark` — `Moon Dark` — `Moon dark`

Upstream's values: `{colorSchemeLabel:"Appearance",light:"Moon bright",dark:"Moon dark",system:"System"}` / `{…"外观",light:"月之亮面",dark:"月之暗面",system:"跟随系统"}` — the zh item labels already matched; only the row label differed. Effect: settings **19 → 16**.

Remaining real gaps on the surface (11 texts, all copy/controls):
- Row hints upstream shows under three rows: `Choose the app's light or dark appearance`, `Adjust interface and message text size`, `Choose the interface language`.
- Notifications section: `System notifications`, `Send a system notification when a turn completes, needs an answer, or needs approval`, `Notification sound`, `Play the system sound with notifications`.
- Nav labels: `Plugins`, `Providers`.
- Font size: upstream offers `S` / `M` / `L` / `XL` as a segmented control; the fork has a slider, so those four size labels do not exist.
- Language list: `简体中文` (the fork's language options do not include it).

Plus the element block: **48 upstream elements missing on the fork** (of 411 compared, 32 allowlisted; fork 514, upstream ~500) — the same loop as `main`: read the capture, cluster, rename or port, allowlist what is a settled fork divergence. The `sa-select` family from the earlier cluster analysis belongs here.

Checks: typecheck 0, `check:style` 54, tests 1010/1010, build green, assets copied.

### Settings surface — second pass (2026-09-11, fifteenth pass)

Closed this pass, all copy against upstream's own tables:

- change — source
- Appearance row hint `Choose the app's light or dark appearance` / `选择应用的明暗外观` — `settings.colorSchemeHint`
- Font-size row hint `Adjust interface and message text size` / `调整界面和消息文字大小` — `settings.uiFontSizeHint`
- Language row hint `Choose the interface language` / `选择界面显示语言` — `settings.languageHint`
- Sound row label `Notification sound` / `通知提示音` plus its hint `Play the system sound with notifications` / `系统通知随附提示音` — `settings.notifySound` + `notifySoundHint` (the fork's label carried the hint text)
- Language option label `简体中文` — upstream's `dw = [{code:'en',label:'English'},{code:'zh',label:'简体中文'}]`; the fork had `中文`

Settings blockers: **19 → 16 → 11 → 10**.

What the remaining 10 consist of (1 element block + 9 texts):

- **Concatenation artifacts, not gaps (4)**: `Notifications`, `L`, `M`, `S` are present in the fork's DOM but on a different innerText line. The text comparison compares whole lines, so these will keep reporting until the layout matches exactly.
- **Font-size control divergence (4 labels)**: upstream offers `S` / `M` / `L` / `XL` as a segmented control; the fork has a numeric px input, which is finer-grained fork behaviour. Record as a divergence rather than deleting the input.
- **Notifications master row (2 texts)**: upstream's `System notifications` + `Send a system notification when a turn completes, needs an answer, or needs approval` gate all three triggers with one switch; the fork splits the same gate into three switches with its own copy. Same capability, different granularity — a divergence.
- **Missing nav tabs (2 texts + the element block)**: upstream's settings nav has nine tabs — `general, agent, account, providers, advanced, archived, shortcuts, plugins, lab` — while the fork has six (`general, agent, account, advanced, archived, lab`). So `Providers`, `Plugins` and `Hotkeys` are absent, which is the `web-plugins-panel` item the round already owes, plus a providers tab (the fork's provider UI lives inside its own "Custom providers" section) and a hotkeys tab. These are feature ports, not renames.

Checks: typecheck 0, `check:style` 54, tests 1010/1010, build green, assets copied.

### Settings nav and the Plugins tab — capture (2026-09-11, sixteenth pass)

Captured upstream's settings nav directly (open Settings, click the tab, dump the panel). The tab lists:

- tabs
- upstream — General, Agent, Account, **Providers**, **Plugins**, Advanced, Lab, Archived
- fork — General, Agent, Account, Advanced, Archived, Lab

So the fork is missing exactly two tabs — `Providers` and `Plugins` (no Hotkeys tab in this build, despite the key being present in upstream's bundle). `Providers` is content the fork already has under its own "Custom providers" section; `Plugins` is a feature the round already owes.

**The Plugins panel is portable.** The fork's server already exposes the routes — `packages/kap-server/src/routes/plugins.ts`, registered via `registerApiV1Routes`, with `GET /plugins`, `GET /plugins/marketplace` and `POST /plugins/{tail}` — and upstream's web client calls exactly those (`listPlugins`, `listPluginMarketplace`, `installPlugin`, `setPluginEnabled`). What the fork lacks is the web side: client methods plus the panel.

Upstream's panel markup, captured to `PLANS/web-revamp-refs/upstream-plugins-tab.html` (in the mock's error state — see below):

```html
<section class="sec plugins-panel">
  <h3 class="pp-panel-title">Plugins</h3>
  <div class="pp-group pp-custom">
    <button class="pp-custom-row"><svg/><span class="pp-custom-label">Install custom plugin</span><span class="pp-chev"><svg/></span></button>
  </div>
  <div class="pp-load-error" role="alert">
    <span class="pp-load-error-text">…</span>
    <button class="ui-button ui-button--secondary ui-button--sm"><span class="ui-button__content">Retry</span></button>
  </div>
</section>
```

Class vocabulary to port: `plugins-panel` / `pp-panel-title` / `pp-group` (+ `pp-custom`, and per upstream's i18n a built-in / official / third-party grouping) / `pp-custom-row` / `pp-custom-label` / `pp-chev` / `pp-load-error` / `pp-load-error-text`. Copy keys from upstream's i18n table: `plugins.retry`, `builtIn`, `official`, `thirdParty`, `installed`, plus `Install custom plugin`.

**The mock is the blocker for verification, not the port.** `webdiff/mock-server.mjs` does not answer `/plugins` or `/plugins/marketplace`, so upstream's panel renders its error state (`Cannot read properties of null (reading 'plugins')`) and the walk's Plugins surface would compare an error against whatever the fork has. A port should add those two mock routes first, so the panel is captured populated and its group/row counts can be compared. Both files are inside `apps/kimi-web/webdiff/`, so this stays in scope.

Plan for the port, in order: (1) mock `/plugins` + `/plugins/marketplace`; (2) client methods in `api/daemon/client.ts`; (3) `PluginsPanel.vue` with upstream's class vocabulary and grouping; (4) the `Plugins` and `Providers` tabs in the settings nav, with `Providers` rendering the fork's existing provider content; (5) i18n in both locales; (6) re-run the settings scene and the Plugins walk surface.

### Plugin mock routes added; panel captured populated (2026-09-11, seventeenth pass)

`webdiff/mock-server.mjs` now answers the two routes kap-server exposes, shaped after `packages/kap-server/src/routes/plugins.ts`:

- `GET /api/v1/plugins` → `{plugins: [...]}` — two entries (one built-in, enabled; one official, disabled).
- `GET /api/v1/plugins/marketplace` → `{entries: [...]}` — three entries (built-in, official with `updateAvailable`, third-party).

Before this, upstream's own Plugins tab rendered its load-error state (`Cannot read properties of null (reading 'plugins')`) with a Retry button, so there was nothing to compare against. Now it renders rows, and the populated markup is saved to `PLANS/web-revamp-refs/upstream-plugins-tab.html`.

Full class vocabulary for the port, from that capture:

```
section.sec.plugins-panel
  h3.pp-panel-title
  div.pp-group.pp-custom > button.pp-custom-row > span.pp-custom-label, span.pp-chev
  section.pp-section
    h3.pp-sec-title                       # "Official", "Third-party", …
    div.pp-group > article.pp-row
      div.pp-main
        div.pp-title > span.pp-name, span.pp-version
        p.pp-desc                         # description
        p.pp-desc                         # source line
      div.pp-actions
        button.ui-switch[role=switch][aria-checked] > span.ui-switch__thumb   # "Enabled"
        button.ui-icon-button.ui-icon-button--sm                              # "Remove"
```

Two upstream artifacts visible in the capture, recorded so they are not chased as fork gaps: upstream renders the raw key `settings.plugins.source.marketplace` (its own missing translation for the source line), and my mock's `tier` values do not line up with upstream's section grouping — the Third-party section shows the built-in entry — so the fixture's tiers may need revisiting when the panel is compared row by row.

Next: the client methods (`listPlugins`, `listPluginMarketplace`, `installPlugin`, `setPluginEnabled`, `removePlugin`) in `api/daemon/client.ts`, then `PluginsPanel.vue`, then the `Plugins` and `Providers` nav tabs and the i18n.

### Plugin API: mock corrected, wire types and client methods added (2026-09-11, eighteenth pass)

**Mock fixtures corrected to the server's real schemas.** My first pass used the marketplace shape for `GET /plugins` and an invalid `tier: 'built-in'` (the schema allows `official` / `curated` / `third-party`) and `source: 'built-in'` (the enum is `local-path` / `zip-url` / `github`). Both routes now build responses from `packages/kap-server/src/protocol/rest-plugin.ts`:

- `GET /api/v1/plugins` → two `PluginSummaryWire` rows (enabled github plugin, disabled local-path plugin) with the counts and `state` the schema requires.
- `GET /api/v1/plugins/marketplace` → three `PluginMarketplaceEntryWire` rows: `official` (installed, `updateAvailable`), `curated`, `third-party`.

Verified through the browser: upstream's Plugins tab now renders **sections `Official` | `Third-party` | `Installed`** with rows `Example Official | Example Curated | Example Third-party | Example Local`, no load error. Note for the port: upstream files a `curated` entry under the Third-party section, and installed plugins get their own `Installed` section, so the panel's grouping is tier-based with an installed group appended.

**Web side — types and methods (fork's own client, not upstream's):**

- `api/daemon/wire.ts`: `WirePluginSummary` and `WirePluginMarketplaceEntry`, mirroring the two server schemas field for field.
- `api/daemon/client.ts`: `listPlugins()` (`GET /plugins`), `listPluginMarketplace()` (`GET /plugins/marketplace`), `installPlugin(source)` (`POST /plugins`), `setPluginEnabled(id, enabled)` and `removePlugin(id)` — the last two use the server's action-suffix form, `POST /plugins/{id}:enable|disable|remove`, read off `pluginActions` in `routes/plugins.ts`.

Checks: typecheck 0, `check:style` 54, tests 1010/1010, build green, assets copied.

**Incidental finding:** a mock server started with a non-existent `MOCK_ROOT` does not just 404 — it double-responds and crashes with `ERR_HTTP_HEADERS_SENT` (mock-server.mjs:342). It cost a restart cycle here; worth a guard the next time the mock is touched.

Remaining for the Plugins tab: `PluginsPanel.vue` with the captured vocabulary, the `Plugins` and `Providers` nav tabs, and the i18n keys (`plugins.retry`, `builtIn`, `official`, `thirdParty`, `installed`, `Install custom plugin`) in both locales.

### Plugins and Providers tabs ported (2026-09-11, nineteenth pass)

Both missing settings tabs are now wired, ported from the upstream bundle rather than by eye.

**Plugins.** The panel was rewritten against upstream's own component source (read out of
`.tmp/upstream-web-new/assets/index-HU0LCM-X.js`), so it now carries upstream's structure rather than
an approximation: the `pp-group pp-custom[.open]` header row (plus at `size="md"`, chevron-right at
`size="sm"`, rotating 90° when open), the `pp-custom-form` with its hint line, the loading row
(Spinner + `common.loading`), the error row with Retry, an `EmptyState` for the empty case, then the
`official` / `third-party` sections and the `Installed` section. Row actions match upstream: Update
(only when `updateAvailable`), Switch, trash `IconButton`, Install otherwise. The capability line is
upstream's own (`source label · N skills · N MCP servers (M on) · N hooks · N commands`), and its
i18n keys were copied verbatim into `settings.plugins.*` in both locales — including the plural
forms. `common.loading` was added to both common tables.

A `trash` icon did not exist in the fork's registry; upstream's own glyph was exported from the
captured markup into `src/icons/kimi/trash.svg` and registered, so the Remove control is the same
mark.

**Providers.** Upstream has a `Providers` tab between `Account` and `Plugins`; the fork had the same
content buried at the bottom of its `Agent` tab. The custom-provider block moved out into
`ProvidersPanel.vue`, and the tab order now matches upstream (general, agent, account, providers,
plugins, advanced, lab, archived). This is the fork's own provider editor — upstream's tab is
catalogue-driven — so the tab is aligned in name and place while the panel body stays fork-side.

The provider CSS moved with the markup into the new component (scoped styles do not cross a
component boundary), and the now-orphaned rules were deleted from `SettingsDialog.vue`.

Checks before the rebuild: vue-tsc 0, `check:style` 54, vitest 1010/1010.

### Settings shell ported from upstream's component (2026-09-11, twentieth pass)

The settings dialog was rebuilt against upstream's own settings component and stylesheet, read out of
`.tmp/upstream-web-new/assets/index-HU0LCM-X.js` and `index-C8RkgE6U.css`. Settings blockers went
**10 → 1** (and that one is a scroll-state capture artifact, see below).

What changed:

- **Dialog `grouped` mode.** Upstream's settings dialog paints the panel with `--color-bg`
  (`ui-dialog--grouped`) and carries no dialog head — its title and close control live in the
  settings chrome instead. `Dialog.vue` gained a `grouped` prop (background + class) and an
  `ariaLabel` prop for the headless case.
- **Nav shell.** `header.settings-tabs-header > h2.settings-dialog-title` ("Settings") and a
  `div.settings-tab-list` wrapper, then a close `IconButton` in `header.settings-region-header`
  inside the new `section.settings-region` — upstream's exact structure.
- **Tab icons.** Each tab now renders `<Icon> + <span>` with upstream's own glyphs. Three were
  missing from the fork's registry: `robot` (Agent), `microscope` (Advanced), `flask` (Lab); their
  SVGs were exported from the upstream capture into `src/icons/kimi/`.
- **CSS.** `grid-template-columns: 148px 1fr` with named areas, the tab list, the region/header
  heights (`space-4 + icon-button-sm + space-2`), and upstream's `.sec` / `.sec-title` (sentence
  case at `--text-base`, no separator line) / `.settings-group` (rounded surface, hairline row
  separators) / `.rlabel` / `.rvalue` values. Two tokens the fork lacked were added to
  `style.css`: `--weight-option-label: 475` and `--weight-ui-strong: 525`, plus `--icon-button-sm: 26px`.
- **`settings-group` wrappers** on the General panel's Appearance and Notifications sections, and the
  `language-row` / `font-size-row` classes on those two rows.
- **SegmentedControl** now carries upstream's sliding indicator (`ui-seg__indicator`, measured from
  the active item and hidden until the first measurement) instead of a background per item, plus
  upstream's `icon` / `swatch` options and `data-icon`.
- **Warning toasts** gain upstream's `below-overlay` class while a dialog is open
  (`z-index: var(--z-dropdown)`), so a modal is never covered by a toast.

Allowlisted divergences added this pass (each fork behaviour, kept deliberately): the numeric px
font-size control (upstream: S/M/L/XL segmented), the three per-event notification switches
(upstream: one master switch), the Language row's `LanguageSwitcher` (upstream: a 2-item segmented
control), the extra segmented items and their icons those two rows imply, and `<path>` / `<circle>`
icon internals.

**Remaining settings blocker (1):** `missing-text::latest-messages` — the jump-to-latest pill, which
is rendered only while the transcript is scrolled away from the end. It exists in the fork
(`ConversationPane`) but the two apps are caught in different scroll states when the settings scene
runs; the same element flaps between the element-level and text-level checks across runs. The main
scene's one remaining blocker is the matching `DIV.chat-scroll.is-following.panes` follow-state flap.
Both are capture determinism, not markup gaps — the capture harness should pin the transcript scroll
position before it can report zero.

Checks: vue-tsc 0, `check:style` 54, vitest 1010/1010, heap-capped build, assets copied, settings
scene blocker 1, main scene blocker 1 (unchanged from before this pass).

### Full walk, capture determinism, and a slug collision that hid 486 blockers (2026-09-11, twenty-first pass)

**The full walk was run for the first time at this scale** — `--walk --breakpoints desktop,mobile
--themes dark,light --locales en,zh`, 8 combinations, both base scenes, up to 24 discovered controls
per phase. It took about 70 minutes and produced 14 view directories, every one with its `.html` +
`.classes.json` + `.json` + `.png` page-source set.

Result: **blocker=890 warning=8933 info=6864 suppressed=302**. The composition is what matters:

- group — blockers — what it is
- `missing-text` (all) — 778 — 90 distinct texts
- `dom-elements-missing` — 104 — aggregated per surface
- `dom-hash-mismatch` — 8 — one per combo on the walk aggregate
- other — — — —

**486 of those 778 turned out to be one harness defect, not 486 gaps.** `compare.mjs`'s per-item id
slugs text down to ASCII; for text with no ASCII alphanumerics — *every Chinese string*, and
separators like `·` or `—` — the slug came out empty and fell back to the literal string `empty`.
Dozens of unrelated items therefore shared one id, so the allowlist could not address a single one of
them without hiding the rest. The fallback is now a digest of the text itself
(`missing-text::x-<10 hex>`), which makes each item individually addressable. Verified: the zh run
now reports distinct ids (`missing-text::x-d34db9bc67`) where it used to report `missing-text::empty`.

Once the ids were distinct, three of the recurring zh texts turned out to be divergences the English
run already records, and they are now allowlisted with the same reasons plus a digest-id note:
`x-582a8e42e4` = 改动 (Changes), `x-7b1347c4de` = 侧边聊天 (Side chat), `x-c1f6583730` = 未登录 (Not
signed in) — 187 blockers.

**One real localization gap found and fixed:** the fork's `zh/sidebar.ts` carried
`sessionsHeader: 'sessions'` — an English string in the Chinese locale, so the sidebar section title
rendered "SESSIONS" where upstream renders 会话 (65 blockers). Now `会话`.

**Capture determinism.** Both base scenes now start with a `scrollBottom` step (`.chat-scroll`): it
jumps up out of the follow zone and then back down to the tail, because both apps re-arm their
follow only on an upward move that lands in the bottom zone. A single jump is a no-op when the
container is already at the tail and leaves a restored (not-following) state in place — which is
exactly the earlier `DIV.chat-scroll.is-following.panes` flap. Every settings attempt route also pins
the tail first, so the main surface behind the dialog is compared in one state.

Measured after all of the above:

- scene — en desktop-dark — zh desktop-dark
- main + settings — **blocker 0** — blocker 2

The two zh blockers are the same scroll-state items already seen in English and gone there: the
"最新消息" jump-to-latest label and one `DIV.chat-scroll` class variant. They reproduce per locale
rather than per build, which is the remaining determinism work.

Checks: vue-tsc 0, `check:style` 54, vitest 1010/1010, heap-capped build, assets copied.

### Search dialog ported; walk blockers traced to two harness effects (2026-09-11, twenty-second pass)

**Baseline this pass:** `--walk --scene main,settings --breakpoints desktop --themes dark --locales en`
→ **blocker=97** over ~20 surfaces (one combination, ~13 minutes). By surface: `walk` aggregate 35,
`walk-settings-click-15-button-copy` 24, `walk-main-click-02-button-searchctrlk` 11, the rest 1–6 each.

**Search dialog — ported and verified equal.** Upstream's dialog puts the query field in the body
(`.sd-search` with a `.search-clear` button), splits the list into a workspaces section and a
sessions section with uppercase headers and counts, and shows three key hints separated by dots in
the footer. The fork had one flat list, the field in the dialog head, and a single hint string —
which is where "WORKSPACES", "navigate", "open", "close" and "·" came from. `SearchSessionsDialog.vue`
now follows upstream's structure and CSS (`.sd-body`, `.sd-search`, `.sd-section` +
`.sd-section-count`, `.sd-row-ws` with `.sd-ws-name` / `.sd-ws-path`, `.sd-line1` / `.sd-line2` with
`.sd-meta-ws` / `.sd-meta-sep` / `.sd-meta-snippet`, `.sd-foot` / `.sd-hint` / `.sd-dot`), the
empty-query workspace cap is upstream's 3, and the four missing strings were added to both locales
(`searchHintSelect`, `searchHintOpen`, `searchHintClose`, `searchClear`).

Verified by probe, not by eye — both apps read out the same body text and the same class set:

```
WORKSPACES 1 mock /tmp/mock-workspace SESSIONS 1 Code block header probe just now mock
↑ ↓ navigate · Enter open · Esc close
sd-dot sd-foot sd-hint sd-line1 sd-line2 sd-list sd-meta-ws sd-row sd-row-ws sd-search
sd-section sd-section-count sd-time sd-title sd-ws-name sd-ws-path search-clear ui-input ui-input--md
```

**`walk-settings-click-15-button-copy` (24) is a capture artifact, not a port gap — hypothesis tested
and rejected.** The fork's settings dialog disappeared in that surface while upstream's stayed. The
obvious explanation was close-on-overlay: the walk clicks a control's centre point, and a control
behind the dimmed area would land on the overlay. A direct probe (open settings, click at 20,20)
showed **upstream closes on an overlay click and the fork, with `:close-on-overlay="false"` added,
did not** — the change was reverted immediately. The two apps agree on overlay behaviour; the walk's
clicked coordinates simply land differently because the two layouts differ, so one app's index-15
control is occluded where the other's is not. This is the harness's point-clicking, not the product.

Checks: vue-tsc 0, `check:style` **53** findings (one fewer than the 54 baseline — a hardcoded
`font-weight: 600` inside the dialog was replaced by a token), vitest 1010/1010, heap-capped build,
assets copied.

### Session-list View menu ported; pinned area recorded as a fork-only structure (2026-09-11, twenty-third pass)

**View menu — ported and verified equal.** Upstream's list-options menu (`ui-menu view-menu`) has two
group headings and four items in a fixed order. The fork had the same four actions but a different
shell: no headings, the selected-item check *before* the label instead of after it, the view items in
the opposite order, and different strings ("By workspace" / "Recent" / "Last edited" against
upstream's "Flat list" / "Group by workspace" / "Recent activity").

Ported: `view-menu-label` headings for `viewGroup` ("View") and `sortGroup` ("Sort order"); items
reordered to Flat list → Group by workspace → Manual → Recent activity, each with its icon, its label
and a trailing `view-menu-check` (upstream's `margin-left: auto`); four new locale keys
(`viewGroup`, `viewFlat`, `viewGrouped`, `sortGroup`) in both locales, `sortRecent` corrected from
"Last edited" to "Recent activity" (zh "按最近活动"); the two upstream glyphs exported into
`src/icons/kimi/` as `view-flat` and `view-grouped`; and the token `--space-05: 2px` that upstream's
`.view-menu-label` padding uses.

Verified by probe — same items, same text, same class set in both apps:

```
items:  ["Flat list","Group by workspace","Manual","Recent activity"]
text:   "View / Flat list / Group by workspace / Sort order / Manual / Recent activity"
classes: ui-menu-item ui-menu-item--md view-menu-check view-menu-label
```

**Pinned area — a fork-only structure, recorded rather than forced.** Upstream's pinned block is
`div.pinned > div.pinned-label > span.pinned-title + button.pinned-toggle` over
`div.pinned-rows-wrap > div.pinned-rows > div.pin-row`, plus a `div.group-empty` summary
("{count} conversations pinned") when a workspace's sessions are all pinned. The fork's is its own
resizable area — `div.pinned-wrap` (inline height) > `div.pinned-scroll` + `div.pinned-resize`, with
the label as `div.side-section-label.pinned-label > span.side-section-title`. The resize handle has no
upstream counterpart, so this is fork behaviour to keep; the structural difference is what the walk
reports as missing `DIV.pinned` / `DIV.pinned-rows-wrap` / `DIV.pin-row` / `SPAN.pinned-title` /
`BUTTON.pinned-toggle` and the "PINNED" / "{count} conversations pinned" strings. Open item pending an
allowlist entry; recorded here with its evidence instead of being suppressed silently.

Checks: vue-tsc 0, `check:style` 53, vitest 1010/1010, heap-capped build, assets copied.

### Pinned area was a mock gap, not a fork gap (2026-09-11, twenty-fourth pass)

The walk kept reporting the pinned block as missing on the fork ("PINNED", "{count} conversations
pinned", and the `DIV.pinned*` / `SPAN.pinned-title` / `BUTTON.pinned-toggle` signatures). A direct
probe — click the row's Pin control in both apps, then read the DOM — showed upstream growing a
pinned section and the fork growing nothing.

Cause: the fork's pin is a **server** write (`POST /api/v1/sessions/{id}/profile` with
`metadata.pinned`), which `webdiff/mock-server.mjs` did not answer, so the fork's pin silently
no-opped while upstream's client-side state changed. The mock now records the session-metadata patch
(`pinned`, `emoji`, `title`) and folds it into every `freshSession()` response, so a walk surface that
pins, renames or sets an emoji sees the change on the next GET. This is in scope — the mock lives
under `apps/kimi-web/webdiff/`.

With the route in place the fork grew its pinned block. One real gap remained and is now fixed: when
every session of a workspace is pinned, upstream's group shows `allPinned` ("{count} conversations
pinned", zh "有 {count} 条对话被置顶") where the fork showed its generic empty state.
`WorkspaceGroup` gained a `pinnedCount` prop fed by a new per-workspace count in `Sidebar`, and both
locale tables gained `allPinned`.

Probe after the fix — both apps:

```
upstream | clicked Pin | PINNED | 1 conversations pinned
fork     | clicked Pin | PINNED | 1 conversations pinned
```

The only remaining pinned difference is the shell: upstream `div.pinned` + `pinned-rows-wrap` /
`pinned-rows` / `pin-row` / `pinned-toggle`, the fork `div.pinned-wrap` (inline height) +
`pinned-scroll` + `pinned-resize` — a drag-resizable region upstream has no equivalent for, so it is
kept and now allowlisted with that reason (`DIV.pinned`, `DIV.pinned-rows-wrap`, `DIV.pinned-rows`,
`DIV.pin-row`, `SPAN.pinned-title`, `BUTTON.pinned-toggle*`).

Checks: vue-tsc 0, `check:style` 53, vitest 1010/1010, heap-capped build, assets copied. Preview
servers restarted on the new mock (`:5399` upstream, `:5400` fork).

**Search dialog title — the last two blockers on that surface.** Upstream's dialog carries a visible
title in `div.ui-dialog__titles > div.ui-dialog__title`, and the string is the same one it uses for
the input placeholder ("Search sessions and workspaces"). The fork's titleless dialog rendered only
the placeholder attribute, which is not part of `innerText`, so the string read as missing. The fork
now passes the same string as the dialog `title`. Probe after the fix, reading the whole
`.ui-dialog` in both apps:

```
Search sessions and workspaces / WORKSPACES 1 mock /tmp/mock-workspace / SESSIONS 1
Code block header probe just now mock / ↑ ↓ navigate · Enter open · Esc close
```

**Measured after the search-dialog and view-menu ports** (desktop, dark, en, both scenes):
**blocker 97 → 83**. The search surface went 11 → 2 (both the title, now fixed); the pinned surface
still carried 5 from the mock gap, which the `/profile` route and the `allPinned` summary address and
the next walk will confirm.

### Composer dropdowns at class parity; pinned + title fixes measured (2026-09-11, twenty-fifth pass)

**Walk after the pinned-area mock fix and the search-dialog title: blocker 83 → 79**
(desktop, dark, en, both scenes).

**The three composer dropdowns already matched upstream text-for-text** — the add menu, the model
dropdown and the permission dropdown were ported in earlier passes and read identically in both apps.
What was still off was the class vocabulary:

- menu — upstream root — upstream row — fork before
- add — `add-menu` — `am-row` — same
- model — `ui-menu model-dropdown` — `ui-menu-item ui-menu-item--md md-row` — `model-dropdown`, `md-row`
- permission — `ui-menu perm-dropdown` — `ui-menu-item ui-menu-item--md pd-row` — `perm-dropdown`, `pd-row`

The fork's hand-rolled dropdowns now carry `ui-menu` on the root and `ui-menu-item ui-menu-item--md`
on every row. Both classes are **scoped** to `ui/Menu.vue` and `ui/MenuItem.vue`, so adding the names
to a component that renders its own markup changes no pixel — it only makes the element signature
match.

Verified by probe, every item and class identical between the apps:

```
[add]   Files / Upload files / Goal / Set a goal to keep pursuing / Plan / Turn plan mode on / Swarm / Turn swarm mode on
[model] EXAMPLE / example/test-model / Thinking / Not supported / <cache note> / More models…
[perm]  Always Ask / <hint> / Ask When Needed / <hint> / Never Ask / <hint>
        classes: ui-menu-item ui-menu-item--md md-row md-row-more md-check md-name md-note md-section …
```

Two deltas remain on the model dropdown and are recorded rather than guessed: upstream's current row
carries `is-active` as well as `is-current` — `is-active` is `ui/MenuItem`'s **keyboard cursor**
highlight, and the fork's model menu has no cursor model, so binding it to the current row would
leave that row permanently styled as hovered. The fork also adds `is-readonly` when the model cannot
be switched, which upstream does not have. Both are behaviour, not markup.

**Mobile settings sheet — measured delta for the next pass.** Upstream's sheet carries three settings
the fork's does not: `Auto-fold messages` and `Tool call summary` with their hint lines, and
`Goal mode`. The fork's sheet instead carries its own rows (Archived sessions, Custom providers, Plan
usage, conversation outline, sign out), which are fork features. The three missing rows are upstream
features the fork has no UI for; they are the next port, not an allowlist case, since two of them
(auto-fold, tool-call summary) already have fork-side behaviour to hang them on.

Checks: vue-tsc 0, `check:style` 53, vitest 1010/1010, heap-capped build, assets copied.

### Message folding: one toggle ported, one allowlisted as a rejected decision (2026-09-11, twenty-sixth pass)

Upstream's desktop Advanced tab ends with a **Message folding** section, and its mobile sheet carries
the same two rows after the app preferences:

- upstream row — fork decision
- `Auto-fold messages` + "When a turn ends, the work folds away automatically…" — **not implemented** — turn folding was permanently rejected in the 0.36.1 round (recorded in `PLANS/web-port-0.39.md:197` and in `ToolFoldRow.vue`'s own header). Allowlisted with that citation.
- `Tool call summary` + "During the answer, consecutive tool calls are summarized into one row" — **ported and wired** — the fork already folds a run of consecutive tool calls, it just had no switch.

New `lib/conversationPrefs.ts` holds `activityRunFolding`, reading and writing upstream's own storage
key `kimi-web.activity-run-folding` (absent or anything but `"0"` means on, matching upstream's
`localStorage.getItem(key) !== "0"`). `foldRenderBlocks()` gained an `enabled` parameter, defaulting
true, and `ChatPane` passes the preference in. Rows added to the desktop Advanced section and to the
mobile sheet, with `messageFolding` / `toolCallSummary` / `toolCallSummaryHint` in both locales
(upstream's strings).

Verified by a new case in `test/chat-turn-rendering.test.ts`: with `enabled: false` a three-tool run
renders as one tool-stack with no `tool-fold` block. 1010 → 1011 tests, all passing.

**Coverage hole found while verifying.** The mock's transcript carries no tool frames at all
(`turn t2` has a single text frame), so neither app ever renders a tool run in a capture — the fold
has nothing to act on and the walk never sees a tool card. The toggle's *rendering* effect therefore
cannot be confirmed from the walk yet; it is confirmed at the helper level. Adding a run of tool
frames to the mock transcript is the fix, and it would give the walk its first tool-surface coverage.
Recorded as an open item rather than done silently, because it changes both apps' captures and may
surface genuine tool-row differences that are currently invisible.

Checks: vue-tsc 0, `check:style` 53, vitest 1011/1011, heap-capped build, assets copied.

### Tool-run coverage enabled; the summary toggle verified end to end (2026-09-11, twenty-seventh pass)

The mock already had a `MOCK_FOLD_TOOLS` switch that injects three consecutive tool calls (Read, Bash,
Grep) ahead of the existing Edit — exactly the run the tool-call summary acts on — but it defaulted
off, so no capture ever contained a tool card. It is now **on by default** (`MOCK_FOLD_TOOLS=0` gives
the bare transcript back). Effect on the gate: desktop dark en, main + settings → **blocker 1**
(the known `DIV.chat-scroll` flap), i.e. covering a tool run added no blocker. The fork's fold chip is
an *extra* element against upstream, which the comparator reports as a warning, not a blocker.

**Toggle verified in the browser, not just at the helper.** With `MOCK_FOLD_TOOLS` on:

- preference — fork transcript
- default (on) — fold chip: `4 tool calls · last: Edit`
- `kimi-web.activity-run-folding = "0"` — no chip — the run renders expanded: `4 tool calls`

**What upstream shows for the same fixture, and why it is not comparable yet.** Upstream renders no
tool rows at all for those `tool_use` / `tool_result` content parts — only the transcript stream feeds
its transcript view, and the mock's `/transcript` route carries text frames only. So the tool card is
a fork-side element in every capture; upstream's counterpart would need tool frames on the mock's
transcript route. Recorded as the follow-on, not silently treated as "matched".

Checks: vue-tsc 0, `check:style` 53, vitest 1011/1011, heap-capped build, assets copied.

### Tried to give upstream a tool run; guessed frame shape broke it, reverted (2026-09-11, twenty-eighth pass)

The follow-on from the last pass was to put tool frames on the mock's `/transcript` route so upstream
renders a tool run too. I added a run of four `{ kind: 'tool', toolCallId, name, state, input, output }`
frames to turn `t2`'s step. **Upstream's transcript view validates the frame against its own schema**,
and the guessed shape failed: upstream dropped the conversation entirely and rendered its error
surface instead —

```
Deskop main blockers introduced:  "No messages yet — type below to start the conversation",
"Operation failed", "Show details", "Copy diagnostics",
"The last operation did not finish. Try again later."   (main blocker 1 → 6)
```

Reverted immediately; `--scene main` is back to **blocker 1** (the known `DIV.chat-scroll`
follow-state flap). The route now carries a comment saying why tool frames are not there yet.

**What the right shape looks like.** Reading the engine (not modifying it), a tool frame is built as
`{ kind: 'tool', frameId, toolCallId, name, state, input?, inputText?, display?, output?, error?, … }`
in `packages/kap-server/src/services/transcript/coreEventMap.ts` — my guess omitted **`frameId`**,
which is present on every frame the engine emits, and passed `output` where the engine uses it only
after a result event. The next attempt should read the frame schema rather than infer it, and add the
frames one at a time, re-running `--scene main` after each so a bad shape cannot survive as a quiet
coverage regression.

Meanwhile the tool run is covered on the fork: `MOCK_FOLD_TOOLS` (default on) puts three consecutive
tool calls in the snapshot's assistant message, which is what the tool-call summary folds.

### Transcript tool frames, done right — and a whole layer that had never been compared (2026-09-11, twenty-ninth pass)

Retried last pass's revert with the real contract instead of a guess. `packages/transcript/src/contract/schema.ts`
(`toolCallFrameSchema`, line 108) requires `frameId`, `toolCallId`, `name` and a `state` of
`running | done | error`; my earlier guess omitted `frameId` and passed `"completed"`, which is not in
the enum — hence upstream's fallback to its error surface. With the correct shape
(`{ kind:'tool', frameId:'s1.tc_read_1', toolCallId, name, state:'done', input, output }`) upstream
renders the run.

**What that exposed.** The tool-run layer had never been visible in a capture, so it had never been
compared. Upstream renders an **activity run**:

```html
<div class="activity-run">
  <button class="ar-head" aria-expanded="false">
    <span class="ar-glyph ok" role="status" aria-label="done"><svg/></span>
    <span class="ar-sum" title="Read 1 file · Ran 1 command · Searched 1 pattern · Made 1 edit">
      <span>Read 1 file</span><span class="ar-sep"> · </span>… </span>
    <svg/>  <!-- chevron -->
  </button>
  <div class="ar-body" inert><div class="ar-body-inner">
    <div class="tool-line expandable" data-scroll-anchor-id="tc_read_1">
      <div class="tl-head clickable">
        <span class="tl-ic"><svg/></span>
        <span class="tl-main">
          <span class="tl-name">Read</span>
          <button class="tl-file">a.py</button>
          <span class="tl-faint">/tmp/mock-workspace</span>
          <span class="ui-tip"><button class="tl-car" aria-label="Expand details"><svg/></button></span>
```

with a counted verb phrase ("Read 1 file · Ran 1 command · Searched 1 pattern · Made 1 edit"), a
state glyph, an expandable body of per-tool `tool-line` rows carrying icon, name, file, path and diff
stats. The fork renders its own shape instead: a `tool-fold-chip` reading "4 tool calls · last: Edit"
plus its `ToolRow` / `ToolCall` components.

**Consequence for the gate, stated plainly:** the main scene went **blocker 1 → 17** — not a
regression, but 16 real differences that the empty tool fixture had been hiding. Every earlier "main
surface complete" result was measured with no tool card on either side. The 17 are now the honest
work list for the transcript layer: 76 upstream elements missing (the activity-run shell and its tool
lines) and 15 missing texts (the summary phrases, the per-line names, paths, counts and diff stats).

Checks: vue-tsc 0, `check:style` 53, vitest 1011/1011, heap-capped build, assets copied.

### Activity run ported — main scene 17 → 5 (2026-09-11, thirtieth pass)

Upstream's tool-run presentation is now in the fork, ported from the bundle's own `ActivityRun`
component and its CSS:

- `lib/activitySummary.ts` — the counted summary, built exactly as upstream builds it: group the run's
  calls by normalized kind (`multi_edit` folds into `edit`), keep first-appearance order, phrase each
  group with `tools.group.typed.<kind>.done` (or `tools.group.countOther` for everything else), append
  `tools.activity.failedClause` per group that has failures, and close with the duration clause.
- `components/chat/ActivityRun.vue` — upstream's markup and CSS: `ar-head` button with `ar-glyph`
  (`ok`/`err`/`run`), `ar-sum` with its `title`, the ` · ` separators, the chevron, and an
  `ar-body` that stays mounted and goes `inert` while closed (`grid-template-rows 0fr → 1fr`).
- The summary preference gates expansion: with it off the run is always open, as upstream does.
- `ChatPane` renders the run in place of the old fold chip, with the tool cards in its slot; the fold
  helper no longer emits a follow-up stack for an open run, and `ChatPane` stays the single writer of
  the fold-state map.

Measured on the main scene (desktop, dark, en): **blocker 17 → 5**, and the counted phrases no longer
appear as missing text. What remains is the *inside* of the run:

- remaining — what it is
- `DIV.expandable.tool-line`, `DIV.clickable.tl-head` and the rest of the 66 missing elements — upstream's per-tool line markup (`tool-line`, `tl-head`, `tl-ic`, `tl-main`, `tl-name`, `tl-file`, `tl-faint`, `tl-car`); the fork's `ToolRow` still uses its own `box`/`bh`/`gl` vocabulary
- `+1`, `−1` — the diff stats upstream puts on an edit line
- `config.py`, `/tmp/mock-workspace` — the file name and path upstream puts on a tool line

`ToolFoldRow.vue` is now unreferenced — kept rather than deleted, because its header documents the
0.36.1 TurnFold decision that the allowlist reason for "Auto-fold messages" cites.

Checks: vue-tsc 0, `check:style` 53, vitest 1011/1011, heap-capped build, assets copied.

### Tool line shell ported — missing elements 66 → 21 (2026-09-11, thirty-first pass)

`ToolRow.vue` was rewritten onto upstream's shell. It used the fork's own vocabulary — a bordered
`box` with `bh` / `gl` / `bh-text` / `a` / `p` / `rt` / `status` / `car` / `bb` / `bb-pad` and a
per-row `stacked` / `stack-position` treatment — where upstream renders a borderless `tool-line` row:
`tl-head` (with `clickable`), `tl-ic`, `tl-main` holding `tl-name` plus the tool's own detail and the
`ui-tip`-wrapped `tl-car` chevron, a `tl-tail` carrying the chip and the `tl-status` glyph, and a
`tl-body` / `tl-body-inner` that stays mounted and goes `inert` while closed.

Gone with the old shell: the card border, radius, background and the stacked/middle/last separator
borders — upstream's rows are plain lines grouped by the activity run above them. The now-obsolete
`stackPosition` prop was removed from `ToolRow` and from all seven callers (`ToolCall`, `GenericTool`,
`EditTool`, `AgentTool`, `AskUserTool`, `SwarmTool`, `WaitForTool`), and `tools.disclosure.{expand,collapse}`
added to both locales for the chevron's label.

Measured on the main scene (desktop, dark, en): the `dom-elements-missing` finding dropped from
**66 to 21 elements**. The finding itself is still one blocker, so the blocker count stayed 5 — the
work is visible in the element count, not yet in the blocker count.

What the remaining 21 are: the per-tool head content, which is the next slice —

- missing — tool
- `BUTTON.tl-file` (`config.py`, `a.py`), `SPAN.tl-faint` (`/tmp/mock-workspace`) — Read, Edit
- `SPAN.tl-chip` ("1 lines") — Read
- `SPAN.tl-mono` (the command / the pattern) — Run, Search
- `+1`, `−1` — Edit's diff stats

Each tool component currently passes one `arg` string; upstream splits it into name + file button +
faint path + mono subject + tail chip, per tool kind.

Checks: vue-tsc 0, `check:style` 53, vitest 1011/1011, heap-capped build, assets copied.

### Per-tool head content ported — main scene 5 → 1 blocker (2026-09-11, thirty-second pass)

The tool line's head now carries upstream's per-kind detail instead of the single clipped `arg`
string:

- `lib/toolMeta.ts` gained `toolHeadParts(name, arg)`, which decomposes a tool's argument into the
  shape upstream renders — `file` + `dir` for the path tools (Read, Edit, Write), `mono` for a
  command (Run) or a pattern (Search, Find), `dir` for a directory tool — falling back to the plain
  summary for everything else.
- `ToolRow` renders those parts as `tl-file` (button), `tl-faint` and `tl-mono`, and takes a `diff`
  prop that renders upstream's edit tail: `tl-add` / `tl-del` spans plus the `diffbar` with `seg-add`
  and `seg-del` grown by their counts.
- `GenericTool` and `EditTool` compute and pass them; the chip carries the `tl-chip` class
  (upstream's), and `EditTool`'s now-orphaned `.chip` rule was deleted with the string it styled.

Measured on the main scene (desktop, dark, en): **blocker 5 → 1**, and the diff-stat texts
(`+1`, `−1`) no longer appear as missing. The last blocker is the known
`DIV.chat-scroll.is-following.panes` flap plus **8 missing elements**, all of them the tool *body*:
`BUTTON.path-link`, `DIV.op`, `DIV.cmd-echo`, `DIV.match-list`, `BUTTON.match-row`, `SPAN.mtext` —
upstream's per-tool expanded content, which is the next slice.

Cumulative on this scene across the last three passes: **17 → 5 → 3 → 1**.

Checks: vue-tsc 0, `check:style` 53, vitest 1011/1011, heap-capped build, assets copied.

### Tool bodies ported — both base scenes at zero blockers (2026-09-11, thirty-third pass)

The per-tool expanded body now follows upstream:

- `ToolOutputBlock` renders upstream's output well — `div.op`, mono at `--content-font-size - 2px`,
  the `--color-well` surface with a hairline border — instead of the fork's `bb-code` /
  `tool-output-block` chrome. `--color-well` was added to the token set with upstream's values
  (`#f5f5f5` light, `#1f1f1f` dark; the fork's sunken surface is `#121212` in dark, so it could not
  double as this one).
- `GenericTool` leads each body the way upstream does: `button.path-link` with the resolved path for
  Read, `div.cmd-echo` with the command for Run, `div.match-list > button.match-row > span.mtext` for
  Search and Find, and the output well for everything else.

Measured, desktop dark en:

- scene — blockers
- main — **0** (was 1)
- settings — **0**

Both base scenes are clean for the first time. The full walk across both breakpoints, both themes and
both locales is running; its composition is what the completion criterion asks for, and the last two
full-walk blockers that are *not* tool-related remain the `walk` aggregate (a union of every upstream
control label, which a fork keeping its own features cannot empty) and the coordinate-drift surface.
Those two need a decision, not more porting, and will be reported with their numbers when the run
lands.

Checks: vue-tsc 0, `check:style` 53, vitest 1011/1011, heap-capped build, assets copied.

### Working notes (thirty-fourth pass, in flight)

**Both base scenes are at zero blockers** (desktop dark en): main 0, settings 0. Cumulative on main:
17 → 5 → 3 → 1 → **0** across the coverage fix, the activity run, the tool-line shell, the per-tool
head and the per-tool bodies.

**Full walk in flight.** `node apps/kimi-web/webdiff/webdiff.mjs --walk --upstream .tmp/upstream-web-new
--out .tmp/wd-walk-full --breakpoints desktop,mobile --themes dark,light --locales en,zh`
(~70 min). Two `NOT OPENED` lines so far, both the **zh settings scene**: upstream "changed, but the
surface does not look like its target", the fork "identical to main". Cause: the scene's routes are
English (`clickText 'Settings'`, `[aria-label="Settings"]`) and the zh label is 设置, so neither app
opens it. Fixed in `surfaces.mjs` (three zh routes added: `clickText '设置'`,
`[aria-label="设置"]`, `[aria-label*="设置"]`; the mobile attempts list too). No build needed — the
harness reads the file at import — but the running walk still uses the old copy, so the next run is
the one that shows the fix.

**Next port, scoped and evidence-backed: the mobile "Goal mode" row.** Upstream's sheet renders a Goal
row between Plan and Swarm: label `status.goalLabel` ("Goal"), sub `mobile.goalModeSub` ("Goal mode").
Its handler, read out of the bundle:

```js
const M = () => props.goalMode === true;
function toggleGoalRow() {
  if (props.goalActive) { emit('focusGoal'); return; }      // chevron row while a goal runs
  if (!M() && planMode) emit('togglePlan');                 // goal and plan are mutually exclusive
  emit('toggleGoal');
}
```

and the template switches on `goalActive`: a chevron `srow` when a goal is active, the
`role=switch` toggle otherwise. The fork has everything this needs: `status.goalLabel` exists, the
client tracks `goalMode` per session (`goalModeBySession` in `useKimiWebClient.ts`, with
`draftModes.goalMode`), and `MobileSettingsSheet` already takes `planMode`/`swarmMode` props and emits
`togglePlan`/`toggleSwarm`. So the port is: a `goalMode`/`goalActive` prop pair, a `toggleGoal` emit,
the row, `mobile.goalModeSub` in both locales, and the mutual-exclusion call in the sheet.

**Two non-port blockers need a decision, not more code** (both seen in earlier full walks, not yet
re-measured on this build): the `walk` aggregate finding (the union of every upstream control label —
a fork that keeps its own features cannot empty it) and the `walk-settings-click-15-button-copy`
surface (the walk clicks a control's centre point; the two layouts differ, so one app's click lands on
the overlay and the other's does not). Both are in PLANS entries from the twenty-second pass.

Checks at the time of writing: vue-tsc 0, `check:style` 53, vitest 1011/1011, heap-capped build,
assets copied. Nothing committed. Preview servers: fork :5400, upstream :5399.

**Goal row — written, not yet built.** `MobileSettingsSheet` now renders upstream's Goal row between
Plan and Swarm (label `status.goalLabel`, sub `mobile.goalModeSub`, `role=switch` bound to a new
`goalMode` prop, emitting `toggleGoal`); `App.vue` passes `:goal-mode="client.goalMode.value"` and
`@toggle-goal="client.goalToggleMode()"`-equivalent (`client.toggleGoalMode()`), and
`mobile.goalModeSub` is in both locales ("Goal mode" / "目标模式"). The client's `setGoalMode` already
clears a staged plan, which is upstream's mutual exclusion, so the sheet only emits.

Deliberately **not** ported from that row: upstream swaps the toggle for a chevron that focuses the
goal once one is running. The fork has no focus-goal target — its own composer emits `focusGoal` and
nothing listens — so shipping the chevron would be a button that does nothing. Open item.

The code is **unbuilt**: the full walk below is holding the build. Build and re-measure when it lands.

### First full walk on the ported build: 890 → 487 (2026-09-11, thirty-fifth pass)

`--walk --breakpoints desktop,mobile --themes dark,light --locales en,zh` on the build carrying the
settings shell, plugins/providers tabs, search dialog, view menu, pinned area, composer dropdowns,
activity run, tool lines and tool bodies:

**blocker 487** (was 890 on the empty-tool fixture), warning 9508, info 7371, suppressed 554.
14 of 16 view directories — the two zh settings scenes did not open (below).

Composition of the 487:

- group — count — what it is
- `missing-text` — 366 — 90 distinct strings
- `dom-elements-missing` — 113 — aggregated per surface
- `dom-hash-mismatch` — 8 — one per combo

By surface, the two biggest are not product gaps:

- **`walk` aggregate — 205.** This finding is the union of every control label discovered across all
  walk surfaces. It can only reach zero if the fork exposes exactly upstream's control set with
  exactly upstream's labels, which a fork that keeps its own features (Backend pill, glass, wide
  mode, its own provider editor, …) cannot do. Needs a decision: allowlist with the count recorded,
  or drop the aggregate from the blocker set and keep it as an inventory.
- **`settings` — 23 (zh only).** The scene's routes were English (`clickText 'Settings'`,
  `[aria-label="Settings"]`); the zh label is 设置, so neither app opened it. Fixed in `surfaces.mjs`
  this pass (three zh routes added); this run predates the fix.

The remaining missing texts are mostly Chinese strings the fork does have but on surfaces this run
could not open (设置, 目标, 复制, 登录, 刚刚, 上传文件, 计划, 设定目标并持续推进, …) — downstream of the
same scene failure.

**Re-run started** on the rebuilt bundle (goal-mode row in, zh routes in) to get a fair reading:
`.tmp/wd-walk-full2`.

Checks: vue-tsc 0, `check:style` 53, vitest 1011/1011, heap-capped build, assets copied.

**Closeout mechanics (so the last steps are mechanical).** `node scripts/check-web-port-closeout.mjs
--version 0.41` needs, in order: `--run .tmp/wd-walk-full2` (the default resolver looks for
`PLANS/web-port-0.41/webdiff` or `.tmp/webdiff-run*`, and this round's runs are named `.tmp/wd-*`),
`index.json` with `walk: true` and ≥2 breakpoints / locales / themes, `report.json` with
`summary.blocker === 0`, no `coverage[*].notOpened` entries, a walk that produced at least one surface,
and a `.html` + `.classes.json` pair beside every captured `.json`. It also requires
`PLANS/web-port-0.41.md` to have at least one `|`-row and every row to contain one of
PORTED / ALREADY PRESENT / NOT APPLICABLE / SKIPPED (the existing tables use NOT PORTED, which
contains PORTED, so they pass).

Still to do after the walk: the verdict table row for this round's work, the changeset (via the
gen-changesets skill), and showing the upstream reference screenshots to the user — criterion (6).

**zh settings route — root cause and the fix that sticks.** The scene's routes were English only.
Probing both apps in zh showed why: upstream reaches Settings from the account row (`未登录` → `设置`),
the fork from its labelled footer item, and the walk's variant loop accepts the **first variant that
changes the surface** — so a text route that opens the account menu wins the race and the capture is
recorded as "changed, but does not look like its target". The attempts list is now ordered
most-reliable-first and starts with `.side-footer-settings`, which **both apps have** (verified: one
click opens Settings in each, in zh, on the current build). zh account-menu pairs (`未登录`/`登录` plus
`设置`) follow, then the bare text and aria-label routes, then the mobile fallbacks.

The walk was restarted on the rebuilt bundle: `.tmp/wd-walk-full3`.

## Verdict table — 0.41 round (rebased web port)

| blurb | upstream surface | verdict | evidence |
| --- | --- | --- | --- |
| settings-shell | Settings dialog shell: nav header, tab list with icons, region header with the close control, `ui-dialog--grouped` | PORTED | `SettingsDialog.vue`, `ui/Dialog.vue` (`grouped`, `ariaLabel`); `robot` / `microscope` / `flask` glyphs exported to `src/icons/kimi/`; settings blockers 10 → 0 |
| settings-plugins-tab | Plugins tab: `pp-*` vocabulary, capability line, Update / Switch / trash actions | PORTED | `PluginsPanel.vue`, `settings.plugins.*` in both locales, `trash.svg` |
| settings-providers-tab | Providers tab: the fork's own provider editor moved out of the Agent tab into upstream's tab slot | PORTED | `ProvidersPanel.vue`; the panel body itself stays fork-side (catalogue-driven upstream) |
| settings-search-dialog | Search dialog: body-hosted query field with clear button, Workspaces / Sessions sections with counts, three key hints | PORTED | `SearchSessionsDialog.vue`; probe shows identical text and class set in both apps |
| session-list-view-menu | List options menu: View and Sort order headings, Flat list / Group by workspace / Manual / Recent activity | PORTED | `Sidebar.vue`; probe shows identical items, text and classes |
| pinned-area | Pinned block | ALREADY PRESENT | fork's resizable `pinned-wrap` kept; `allPinned` summary added; shell divergence allowlisted |
| composer-dropdowns | Add / model / permission dropdown class vocabulary (`ui-menu`, `ui-menu-item--md`) | PORTED | probe shows identical items and classes on all three |
| message-folding | Message folding settings: tool-call summary toggle | PORTED | `lib/conversationPrefs.ts`, `foldRenderBlocks(enabled)`, desktop + mobile rows; Auto-fold messages NOT APPLICABLE (rejected in 0.36.1) and allowlisted |
| activity-run | Tool run presentation: `activity-run` / `ar-*`, counted summary, inert body | PORTED | `lib/activitySummary.ts`, `ActivityRun.vue`; main blockers 17 → 5 |
| tool-line | Tool line shell and per-tool head content: `tl-*`, file button, faint dir, mono subject, chips, diff stats | PORTED | `ToolRow.vue`, `toolHeadParts()`; missing elements 66 → 8 → 0 |
| tool-bodies | Per-tool expanded bodies: `op` well, `path-link`, `cmd-echo`, `match-list` / `match-row` / `mtext` | PORTED | `ToolOutputBlock.vue`, `GenericTool.vue`; main scene 1 → 0 blockers |
| goal-mode-row | Mobile goal row (toggle form) | PORTED | `MobileSettingsSheet.vue`, `mobile.goalModeSub`; chevron form NOT APPLICABLE (no focus-goal target in the fork) |
| turn-folding | Auto-fold messages | NOT APPLICABLE | rejected in the 0.36.1 round — `PLANS/web-port-0.39.md:197`, `ToolFoldRow.vue` |
| walk-label-aggregate | The union of every discovered control label | NOT APPLICABLE | a fork with its own features cannot expose exactly upstream's label set; recorded as an inventory, not a gate |

## Verdict table — visual alignment (blocker-driven walk round)

Round driven by the webdiff walk against the upstream bundle at `.tmp/upstream-web-new` instead of a blurb list. Each row cites the capture or measurement it was judged on.

| item | upstream surface | verdict | evidence |
| --- | --- | --- | --- |
| mobile-topbar-switcher | Mobile top bar: `button.tb-main` > `span.tb-line` > `.dir` / `.sl` / `.tt` + chevron, `aria-label="Switch session / workspace"` | PORTED | `MobileTopBar.vue` renamed (`tb-mid`→`tb-main`, `tb-path`→`tb-line`, `.ws`→`.dir`, `.se`→`.tt`); live probe on the rebuilt bundle returns the same two buttons and aria-labels as `.tmp/wd-walk-full3/upstream/mobile-light-en/main.html` |
| empty-doodle-host | Landing doodle: `div.doodle-host.empty-doodle` + `div.doodle-fallback` + `canvas.doodle-canvas[role=img][aria-label=Kimi]` | PORTED | `EmptyDoodle.vue`; live probe returns `doodle-host empty-doodle` and `role=img aria-label=Kimi` |
| empty-hint-title-placement | `.empty-hint-title` nested inside `.doodle-fallback` | SKIPPED | the fork wraps the doodle (and its starting-state spinner) in `.empty-hint-title`; moving it inside the doodle moves the starting-state layout, needs its own visual pass |
| empty-drag | `.con` child in the empty state | SKIPPED | not added: no fork behaviour to attach it to |
| empty-panel-btn | Right-panel opener button in the empty state | SKIPPED | wiring a right-panel opener into the session-less empty state is a behaviour change, not markup |
| settings-providers-label | Settings tab label reads 供应商 in zh | SKIPPED | fork reads 提供商 (`zh/settings.ts:8`); wording-only, decision open |
| settings-notifications-row | One `系统通知` row with hint 回合完成、待回答或待审批时发送系统通知 | SKIPPED | fork splits the same capability across three switches (`notifyOnComplete` / `notifyOnQuestion` / `notifyOnApproval`); collapsing them drops fork capability |
| walk-attempt-baseline | (harness) settings phase routes | PORTED | `webdiff.mjs` now passes the root scene's signature as `baseline`; without it `captureSurface` accepted the first variant unconditionally, so every mobile settings route was dead code and all four mobile views recorded `settings` as not-opened |
| walk-scroll-cluster | `DIV.chat-scroll.is-following.panes` | NOT APPLICABLE | the 76-instance cluster in `wd-walk-full3` is a fixture artefact (the mock fixture changed content height between capture and measurement); a live re-measure puts the fork pinned (`is-following`, distance 0) and upstream 182 px up |
| walk-boot-complete | (harness) the boot splash covers the UI when a scene captures | PORTED | `capture.mjs` `waitForBootComplete()` waits for `.con` to exist and `.gload` to be gone before running any step; without it the settings phase clicked into the fading full-cover splash and captured the main surface — `wd-walk-full6/fork/desktop-dark-en/settings.json` was byte-identical to `main.json` apart from the ticking elapsed label (609 elements, same DOM hash) |
| walk-expect-accept | (harness) which attempt variant is accepted | PORTED | `captureSurface()` now requires the scene's own `expect` text before accepting a variant; the dock's elapsed-time label alone used to satisfy "the surface changed", so the first (no-op) variant won on three desktop combos |
| walk-volatile-text | (harness) text comparison | PORTED | `compare.mjs` drops lines that are *entirely* a live duration, relative time, clock time or context-token readout — the two apps are captured minutes apart, so those differed by seconds and each one landed as a blocker |

## Composition under the corrected harness

Scenes-only pass, `desktop/dark/en` (`webdiff` without `--walk`, run `.tmp/wd-scenes1`): **blocker 16**, warning 123, info 102, suppressed 12. The same list appears on `main` and on `settings`:

- 26 upstream elements missing on the fork (the report names `svg.ch-branch-icon.kw-icon`, `SPAN.tl-chip`, `SPAN.todo-bar`).
- 7 texts: `Bash`, `Background Agent`, `Plan`, `Progress`, and the three todo titles (`Read the config`, `Change the timeout`, `Re-run the check`).

Two coherent clusters, from the raw element diff:

1. **Upstream's inline todo surface.** Captured source (`.tmp/wd-scenes1/upstream/desktop-dark-en/main.html`, inside the tool line): `span.tl-tail` holds `span.tl-chip` ("1/3"), `span.todo-bar[aria-hidden]` with `span.todo-fill[style="width: 33.3333%"]` and `span.tl-status.ok[role=status]`; the tool body (`div.tl-body > div.tl-body-inner`) holds `div.todo-list` with `div.todo-row.s-done` / `.s-in_progress` / `.s-pending`, each carrying `span.status-glyph` plus the todo title. The fork's tool line renders no such chip, bar or row list, and no todo titles appear anywhere in its surface.
2. **Dock pill labels.** Upstream's workbar pills carry text (`Bash`, `Background Agent`, `Progress`, `Plan`); the fork's workbar is the icon-only square row documented in `ChatDock.vue`. The todo-title texts belong to cluster 1, not here.

Earlier `wd-walk-full3` numbers for the settings clusters (供应商 / 系统通知, 29 each) are superseded: those captures were the main surface, not settings. The notification divergence itself is already allowlisted with its reason (`*::*::missing-text::system-notifications`).


## Mobile round (visual alignment, second half)

Measured on the current build with the corrected harness, scenes-only per breakpoint:

Desktop is clean: all four combinations (dark/light x en/zh) report zero blockers in `.tmp/wd-scenes-all4`. Mobile reports four, one aggregate element finding per combination, in `.tmp/wd-mob14`.

Landed for mobile: `ChatDock` carries `pills-compact`; `MobileTopBar` renamed to upstream's vocabulary (`tb-main` / `tb-line` / `.dir` / `.tt`) with the chevron as an `Icon`; `MobileSettingsSheet` titles itself with `settings.title`; `dialogs/BottomSheet.vue` registers with `openDialogCount` so the toast host gains `below-overlay` while the sheet is open.

Two element kinds remain, and both sit on fork choices rather than unfinished mechanics:

1. `svg.kw-icon.ui-seg__icon` (x2). Upstream's Appearance segment is two named themes with icons (`data-icon="light-mode"`, label "Moon bright"; and its dark pair). The fork's is Light / Dark / System with i18n labels and no icons, and `src/icons/kimi/` has no theme glyph at all. Porting therefore means adopting upstream's theme vocabulary and option count — a user-visible decision, not a glyph drop-in. The alternative is to keep the fork's three-mode control and allowlist it with a reason.
2. `DIV.card` (x2). Upstream wraps each settings row-group in a card (`margin: 0 max(var(--space-4), var(--safe-*))`, `background: var(--color-surface)`, `border-radius: var(--radius-xl)`, `overflow: hidden`). The fork's groups are contiguous `srow` rows after each `group-title`, so the wrapper is mechanical, but the fork's cache-note sits mid-group (after the thinking row) where upstream places it after the group's rows — that placement has to be decided first.

Open items carried forward:

- 22 allowlisted mobile-settings strings are present in the fork's captured DOM but absent from its rendered-text inventory, so they are hidden in the captured state; the cause is **not established**, and the allowlist reasons say so. Find the cause or remove the entries.
- Capture determinism: one scroll-state flip (is-following) and one run where the fork's transcript rendered incompletely. Repeat-run agreement is required before the final matrix.
- Walk-phase runtime is ~24 s per surface; the full 2x2x2 walk with `opts.walk === true` and empty `notOpened` is still the gate.

## Composer, dock and empty-state round (2026-09-12)

Full 2x2x2 walk on the current build (`.tmp/wdfull/final`): 897 page-source pairs, `walk=true`, every combination visited, `notOpened` empty. Blockers on this run fell from 493 (the pre-port run) to 4, and element blockers from 20 to 0. The four that remain are two aligned Chinese strings, each already in source.

| blurb | upstream change | verdict | evidence |
| --- | --- | --- | --- |
| composer-work-mode-pill-reserve | the work-mode pill reserves its block space, so the placeholder starts below it instead of under it | PORTED | `.cin-wrap.has-wm-pill .ph, .cin-wrap.has-wm-pill .ph-overlay { padding-top: calc(var(--ui-font-size) * 1.5 + var(--space-1)) }` - upstream's `--wm-pill-block-reserve` mechanism |
| composer-ctx-separator | the separator before the cache readout renders only with the readout | PORTED | `Composer.vue` ctx-sep now carries `v-if="status?.cacheHitRate"` |
| dock-plan-review-badge | the plan square's review state reads as a label rather than a numeric corner badge | PORTED | `ChatDock.vue` `badgeKind: 'text'` + `.has-badge-text`; upstream labels its plan pill |
| composer-footer-workspace-chip | the workspace chip sits in the composer footer on a new session | PORTED | `Composer.vue` `.composer-footer` slot; upstream's `ws-bar` / `ws-anchor` / `ws-chip` markup and CSS in `ConversationPane.vue` |
| mobile-add-menu-trigger-rows | the mobile sheet carries Commands and Mention rows beside Files / Goal / Plan / Swarm | PORTED | `ComposerAddMenu.vue` `showTriggerRows` with upstream's glyphs; the desktop popover stays at four rows |
| swarm-confirmation | enabling swarm mode asks for confirmation | PORTED | `useWorkspaceState.toggleSwarmMode` passes upstream's `swarmEnableTitle` / `swarmEnableBody` to `useConfirmDialog`, so the dialog carries upstream's title in the head and the message in `ui-dialog__body > p.confirm-dialog__message`; the duplicate composer dialog was removed |
| dialog-close-label | the dialog header close control is localized | PORTED | `Dialog.vue` uses `common.close` (upstream's `关闭` / `Close`) instead of a hardcoded `label="Close"` |
| plan-mode-placeholder | an armed plan shows the plan placeholder | PORTED | `status.planPlaceholder`; upstream's `What should the agent plan for?` / `让智能体先规划什么？` |
| new-session-tail-spacer | the trailing spacer carries `empty-tail` | PORTED | `ConversationPane.vue` tail spacer class; the fork had the element without the class |
| string-alignment | strings the fork rendered differently from upstream | PORTED | 14 English and 12 Chinese strings, each checked against upstream's own rendering or its bundle value before changing |
| mobile-settings-sheet-architecture | upstream's single-list sheet against the fork's stepped sheet with plan-usage, custom-provider and conversation-outline groups | SKIPPED | recorded in `allowlist.json`; aligning it would delete fork features |
| sidebar-collapse-model | upstream shrinks the sidebar to a rail holding the collapse toggle and a New Session icon button | SKIPPED | `BUTTON.new-chat-btn.ui-icon-button.ui-icon-button--sm` element pattern; the fork hides the sidebar and floats an expand control |
| mobile-permission-pill | the fork moves permission control into the mobile settings sheet | SKIPPED | recorded; `Composer.vue` hides `.perm-pill` / `.wm-pill` under the mobile media query |

Harness corrections shipped in this round, each measured before and after: the boot splash's stuck leave transition (25 s per surface and polluted captures), the aggregate surface's structural digest (it compares two discovery inventories, not two designs), Vue transition-phase classes inside element signatures, and unlabelled walk surfaces paired by name (now judged by the element under the recorded click point).

Open items carried forward:

- New-session icon count: upstream's page source carries 30 `svg.kw-icon` against the fork's 24, and 20 against 18 after hidden subtrees are dropped, while the fork carries `svg.ctx-ring` and `svg.glass-defs` in the same state. The digest's signature is a bare `svg.kw-icon` with no per-icon class, and the composer-card count, the chat-header marker and `empty-panel-btn` all match, so which glyphs differ is **not established**. Recorded, scoped to that scene.
- Gauntlet on the working tree at the time of writing: `vue-tsc --noEmit` 0 errors; `check:style` 53 findings; `vitest` 1011/1011; heap-capped `vite build` green; `copy-web-assets` run. The criterion's numbers are stale by one in two places - it says 54 `check:style` findings and 1010 tests, while the tree reports 53 and 1011. Both scripts pass; the criterion text needs updating rather than the tree.
- The mobile settings sheet's architecture and the sidebar collapse model remain decided-against rather than ported, and are listed above with their reasons.

## Mobile swarm confirmation and the pairing correction (2026-09-12, third batch)

One surface, `mobile-dark-zh::walk-settings-click-05-button`, reported six blockers: one element cluster (`DIV.ui-dialog__overlay | DIV.ui-dialog.ui-dialog--md | DIV.ui-dialog__head`) and five texts (`启用 swarm 模式？`, `Agent 将并行运行多个子 agent。`, `取消`, `确认`, `登录`) — all of them the swarm confirmation dialog. Tracing it found two independent causes, one a real gap and one a harness error.

**Cause 1 — real gap: the swarm dialog, twice over.** Upstream's mobile settings page source carries `<button class="srow" role="switch" aria-checked="false">` for the swarm row, and clicking it opens one dialog whose page source is

```html
<div class="ui-dialog__title">启用 swarm 模式？</div>   <!-- head -->
<div class="ui-dialog__body"><p class="confirm-dialog__message">Agent 将并行运行多个子 agent。</p></div>
```

The fork reached that dialog from two places at once. `useWorkspaceState.toggleSwarmMode()` — which every swarm entry point funnels through, including `/swarm` and the sheet row — asked with `title: t('workspace.swarmEnableConfirm')`, a single pre-joined string, and no message, so the title read `启用 swarm 模式？Agent 将并行运行多个子 agent。` and `ui-dialog__body` came out empty. On top of that, the composer's add-menu row opened its own `ConfirmDialog` for the same thing and then emitted `toggleSwarm`, which asked again in the client: two dialogs in a row on that path, one on every other path.

Fixed by giving the client's ask upstream's shape and dropping the duplicate: `workspace.swarmEnableConfirm` is split into `swarmEnableTitle` / `swarmEnableBody` (both locales) and `toggleSwarmMode()` passes both; `Composer.vue` loses its local dialog, its `swarmConfirmOpen` ref, its `ConfirmDialog` import and the now-unused `composer.swarmConfirmTitle` / `swarmConfirmBody` keys, so `chooseSwarmRow` only emits; the sheet's row keeps upstream's `role="switch"` / `:aria-checked` markup on the button with the inner track `aria-hidden` (which the fork's own goal row already used) and emits as before. One dialog, one code path, upstream's markup. `Dialog.vue`'s header close control also stops hardcoding `label="Close"` and uses a new `common.close` key, which is upstream's `关闭` in zh and `Close` in en.

**Cause 2 — harness error: the unlabelled-pair attribution test was too weak.** `samePlace` asked whether the smallest element under each click point shared a class. Both points resolved to `svg.kw-icon` (14x14, area 196) — an icon both apps render all over their chrome — so upstream's click at (74,525) on the swarm row and the fork's at (306,394) on an unrelated row, 266 px apart, read as "the same control" and the pair was compared at blocker level. Fixed in `webdiff/compare.mjs`: a pair is the same control only when the points are within 60 px *and* the elements share a class, which is the threshold the no-element branch already used.

Measured on the completed mobile captures with the corrected comparison: `mobile-dark` blocker 6 → 0 (element blockers 0), `mobile-light` 0 → 0. No blocker appears anywhere else in either part. The two documented cases the element test was written for are unaffected — both click pairs are under 20 px apart — and any pair it now demotes is still visited and its page-source pair still checked; only the severity changes from blocker to info.

The dialog itself is one of the surfaces the walk names differently on each side (upstream `walk-settings-click-05-button`, the fork's own index), so it is compared by hand against the captured page source rather than through a paired surface: the two markups above are the before and after, and the element diff of the two subtrees now differs only by the fork's glass classes (`lg-scrim`, `lg-frost`, `lg-lens`) and the dialog's `step-1` / `step-2` settle classes.

Measured on the completed mobile captures with the corrected comparison: `mobile-dark` blocker 6 → 0 (element blockers 0), `mobile-light` 0 → 0. No blocker appears anywhere else in either part. The two documented cases the element test was written for are unaffected — both click pairs are under 20 px apart — and any pair it now demotes is still visited and its page-source pair still checked; only the severity changes from blocker to info.

### The account label is two different upstream strings (found by the merged run)

The merged 2x2x2 walk on the 07:46 build reported exactly two blockers, `desktop-dark-zh::settings` and `desktop-light-zh::settings`, both `text "账户" present upstream, missing on fork`. The earlier round had changed two zh strings in `settings.ts` from `账户` to `账号` to satisfy a zh-mobile blocker — correct for mobile, wrong for desktop. Upstream really does use both words, and the captured page source proves it:

- Desktop settings nav item and section title: upstream `账户` (3 occurrences; the third is inside `登录后可查看账户和模型权益`), fork before `账号`, fork now `账户`.
- Mobile settings sheet account group heading: upstream `账号`, fork before `账号`, fork now `账号`.

One key cannot serve both, so the sheet gets its own: `mobile.groupAccount` (`账号` / `Account`), while `settings.tabs.account` and `settings.account` return to `账户`. The English rendering is unchanged either way, so this is a zh-only fix. The third upstream occurrence sits inside the account sub-line, which the fork does not render at all — its account panel differs by design (the fork keeps token-paste auth), which is already allowlisted as `missing-text::not-signed-in` / `::sign-in` / `BUTTON.acct.in.srow`; the panel is captured `display: none`, so the sentence never enters the text inventory the comparison reads.

Re-capture after this fix, on a new build: desktop zh (the label) and mobile both locales (the swarm confirmation), spliced with the desktop English captures from the 07:46 build, which the change cannot reach.

### Final run (08:51 build, all eight combinations)

- desktop-dark (zh fresh, en from the 07:46 build): blocker 0, warning 4625, info 2961, suppressed 231.
- desktop-light (same split): blocker 0, warning 4353, info 2791, suppressed 207.
- mobile-dark (both locales fresh): blocker 0, warning 1724, info 1460, suppressed 73.
- mobile-light (same): blocker 0, warning 1724, info 1463, suppressed 74.
- merged `.tmp/wdfull2/final`: blocker 0, warning 15634, info 10740, suppressed 949, 990 page-source pairs.

`node scripts/check-web-port-closeout.mjs --version 0.41 --run .tmp/wdfull2/final` exits 0: walk true, breakpoints desktop+mobile, themes dark+light, locales en+zh, no scene opened nothing, every captured surface has its `.html` and `.classes.json` sibling, and the verdict file has 82 rows, all accounted.

The fresh desktop zh captures surfaced five Chinese strings the earlier runs had never paired — upstream's dock pill labels (`后台 Agent`, `计划`), its notifications master switch (`系统通知` and the hint under it), and the jump-to-latest pill label (`最新消息`) — 69 blockers across the two desktop combinations. Every one is a divergence already recorded for English (workbar pills vs the fork's icon-only square row; notifications granularity; pill visibility), and the zh counterparts had only ever been allowlisted per scene name (`desktop-*::walk-main-click-00-button::…`), which the walk's hover scenes do not match. Five entries now cover each slug at every scope, with the reason its English original carries; the per-scene entries stay as they are.

The captures themselves are not state-stable between runs: the same upstream bundle put `后台 Agent` in 36 scenes on the 07:46 run and 90 on this one, i.e. whether the dock's pills and the mock's tasks have rendered by capture time varies. That is why the zh strings appeared only now, and it is the same determinism item the earlier section carries forward — the divergence is real in either case, since the fork's dock has no visible labels at all.

Open item from this batch: the fork's dialog carries `step-1` / `step-2` (its two-frame backdrop-filter warm-up, `Dialog.vue`) where upstream's dialog carries neither; they cost nothing visually — they gate the same two filters that end up applied — but they remain an `extra-class` difference on every dialog surface.

## Dock pills: upstream page source and the port (2026-09-12, goal round)

The dock family was allowlisted in earlier rounds as a fork feature. It is not: upstream's own 0.39 revamp had reduced the dock pills to icon squares, and the 0.41 bundle spells the labels back out. The evidence and the port plan follow, taken from the 08:51 run's captures (`.tmp/wdfull2/final/upstream/desktop-dark-en/`), page source first.

### The two rows, verbatim (SVG collapsed, `data-v-*` stripped)

Upstream, inside `div.chat-dock.align-center > div.dock-workbar`:

```html
<button class="ui-pill" type="button" aria-pressed="false" aria-label="Plan"><svg/><span>Plan</span></button>
<button class="ui-pill" type="button" aria-pressed="false" aria-label="Bash 1 running"><svg/><span>Bash </span><span class="dw-running"><span class="kw-dot kw-dot--running" aria-hidden="true"></span>1</span></button>
<button class="ui-pill" type="button" aria-pressed="false" aria-label="Background Agent 1 running"><svg/><span>Background Agent </span><span class="dw-running"><span class="kw-dot kw-dot--running" aria-hidden="true"></span>1</span></button>
<button class="ui-pill" type="button" aria-pressed="false" aria-label="Progress 1/3"><svg/><span>Progress </span><span class="dw-count">1/3</span></button>
```

The fork, same container:

```html
<span class="ui-tip"><button type="button" class="ptb- dock-square lg-band" aria-label="Open Bash" aria-pressed="false"><svg/><span class="dw-count">2</span></button></span>
<span class="ui-tip"><button type="button" class="ptb- dock-square lg-band" aria-label="Open Sub agents" aria-pressed="false"><svg/><span class="dw-count">2</span></button></span>
<span class="ui-tip"><button type="button" class="ptb- dock-square lg-band" aria-label="Open Todos" aria-pressed="false"><svg/><span class="dw-count">1/3</span></button></span>
<span class="ui-tip"><button type="button" class="ptb- dock-square lg-band has-badge-text" aria-label="Open Plan" aria-pressed="false"><svg/><span class="dw-count">Pending review</span></button></span>
<span class="ui-tip"><button type="button" class="ptb- dock-square lg-band" aria-label="Open Changes" aria-pressed="false"><svg/><span class="dw-count">1</span></button></span>
```

Differences the port has to close, in order of visibility: the label is visible text upstream and aria-only on the fork; the running state is a dot plus a number in a `dw-running` chip, not a corner `dw-count`; upstream's `aria-label` is the same string as the visible text, not an "Open …" verb; upstream has no tooltip wrapper element (`ui-tip`) and no bare `ptb-` class; the pill set differs (upstream: Plan, Bash, Background Agent, Progress — four; the fork adds a Changes square and names Todos what upstream calls Progress), and the pill order differs.

### Geometry and computed style (desktop, dark, en)

- Row: `dock-workbar` 760x43 at y=696 on both sides (the fork's is 40 tall). Pills sit 4px inside it, `y=700`.
- Upstream pill: 37 tall, widths 82 / 108 / 197 / 136 for Plan / Bash / Background Agent / Progress, gaps 5–6px, `x` from 504. Radius 12px, background `rgba(255,255,255,0.1)`, no border, font-size 14px, colour `rgba(255,255,255,0.84)`, `backdrop-filter: blur(24px) saturate(1.8)`.
- Fork square: 34x34, radius 10px, background `srgb(0.160784 …) / 0.1`, `backdrop-filter: blur(28px) saturate(2.2) brightness(1.04)` — the liquid-glass band, which stays as the fork's material (glass redesign is out of scope) but has to be sized to a labelled pill.
- Upstream panel (`dock-work-panel`): 706x310 for the bash kind, radius 20px, background `srgb(0.0705882 …) / 0.7`, shadow `0 6px 18px rgba(0,0,0,.2), 0 3px 9px rgba(0,0,0,.24), 0 1px 1px rgba(0,0,0,.24)`, `backdrop-filter: blur(24px) saturate(1.8)`, `transform-origin: <pill centre>px 100%` so it grows from the clicked pill.

### What the pills open

Upstream: a floating `div.dock-work-panel.panel-{bash|subagent|plan}` anchored above the dock, with `div.dock-work-head` — `span.wp-head-tab` (icon + name + `span.wp-head-meta` such as `1 running` / `Pending review`) and `span.wp-head-actions` — then `div.dock-work-body`. Captured per kind:

- **Bash** (`panel-bash`): head actions are a `span.filter-control` holding `div.ui-seg.ui-seg--md[role=tablist]` with `span.ui-seg__indicator` and two `button.ui-seg__item` — `Recent` (`data-icon="clock"`, `is-on`) and `Running` (`data-icon="play"`); body is `taskspane` with `tp-list` / `tp-row` / `tp-open` / `tp-glyph` / `tp-name` / `tp-meta` / `tp-time` / `tp-stop` / `tp-chevron` / `tp-done`.
- **Background Agent** (`panel-subagent`): same head with the same Recent/Running control; body is `sg-grid` with `sg-card` / `sg-open` / `sg-top` / `sg-num` / `sg-name` / `sg-foot` / `sg-status` / `sg-state` / `sg-time` / `sg-cancel` / `sg-ic-done`.
- **Plan** (`panel-plan`): head actions are two `button.ui-icon-button.ui-icon-button--sm`, `aria-label="Open in the side panel"` and `"Close panel"`; body is `plan-panel` holding the plan as rendered markdown (`heading-node heading-2`, `list-node list-decimal`, …).

The fork instead opens its right-hand panel (`right-panel rpt …`), whose tabs already carry the same bodies: `taskspane` with `tp-head ui-seg ui-seg--sm`, `tp-split`, `tp-list tp-row tp-name tp-time tp-stop tp-detail`; `sg sg-filters sg-grid sg-card sg-main sg-name sg-meta sg-model sg-time sg-actions sg-stop sg-open`; `pp rpt-plan pp-body` with the same markdown nodes; and `todo-card tc-progress tc-progress-row` for todos. So the bodies and their content exist; what is missing is the pill itself and the floating panel that holds them.

### Port plan

1. `ChatDock.vue`: replace `dock-square` with upstream's `button.ui-pill` — visible `<span>Label </span>` plus `dw-running` / `dw-count` chips, `aria-label` equal to the visible string, the running dot (`kw-dot kw-dot--running`), no `ui-tip` wrapper, no bare `ptb-`; pill set and order Plan, Bash, Background Agent, Progress.
2. Strings: pill label and the running chip text in both locales (`Bash`/`Background Agent`/`Progress`/`Plan`, `1 running`, `1/3`), from the upstream bundle's own values.
3. New `DockWorkPanel` component: `div.dock-work-panel.panel-<kind>` + `dock-work-head` (tab, meta, actions) + `dock-work-body`, anchored to the clicked pill with `transform-origin`, ported from upstream's markup and the measured geometry above.
4. Body reuse: mount the fork's existing bash / subagent / plan / todo bodies inside the panel, adding upstream's head vocabulary (`wp-head-tab`, `wp-head-meta`, `wp-head-actions`, `filter-control`) and the Recent/Running segmented control for bash and subagent.
5. Actions: `Open in the side panel` and `Close panel` on the plan head; detach to background, stop-task and open-task from the rows, matching upstream's `tp-stop` / `tp-open` / `sg-open` / `sg-stop` / `sg-cancel`.
6. Verification: capture the five states the mock can pose (no tasks; bash running; background agent running; todo progress; plan pending review) on both apps, compare with the dock family's allowlist entries removed, then drive the served build and click each pill to confirm the panel opens with the right body and actions.

Not yet captured: the Progress / Todos pill's panel — the walk's 24-control cap never clicked it on upstream. Pose it with a targeted probe before porting that body.

Baseline for the last criterion: 89 allowlist entries cite this family (86 blocker entries, 3 element patterns) across 22 slugs, and together they hide 560 findings (216 warning, 344 info).

### Landed (2026-09-12, goal round)

- Port plan items 1 and 2. `ChatDock.vue` renders upstream's pill markup: `button.ui-pill` with a visible `<span>Label </span>` and a `dw-running` chip (accent dot + running count) or a `dw-count` chip, `aria-label` equal to the visible string, `is-active` on the open pill, no `ui-tip` wrapper, no bare `ptb-`. The set and order are upstream's — Plan, Bash, Background Agent, Progress; the Changes square is gone and its panel stays reachable from the right-panel tabs. `tasks.dockProgress` and `tasks.dockRunning` were added in both locales, and the running chip counts running tasks (`bashRunning` / `subagentRunning`), not the total as the square's corner badge did.
- Styles take upstream's own rules for `.dock-workbar .ui-pill` — `--radius-lg`, `--space-2` / `--space-3` padding, base font size, the `--color-hover` overlay for hover and the active pill, icons at 1.5em — plus upstream's two `pills-compact` rules that hide the text on a phone. The material stays the fork's band class, which is what upstream's `--p-menu-backdrop` does for its own pill.
- Icons are upstream's glyphs: three new Kimi-set files (`pencil-filled`, `terminal-filled`, `agent-filled`, lifted verbatim from the pill markup in the 08:51 captures) registered in `lib/icons.ts`, and the existing `list-lines` for Progress. The fork's previous glyphs (target, clock, sparkles, check-list) are not upstream's.
- Verified: `vue-tsc` 0 errors; `check:style` 51 findings, two below the 53 baseline because the deleted square rules carried absolute-position and hardcoded-size findings; vitest 1011/1011; heap-capped build and `copy-web-assets` green; the served fork build shot next to the upstream capture (`.tmp/dock-fork2.png` against `.tmp/wdfull2/final/upstream/desktop-dark-en/main.png`) shows the row matching pill for pill, labels, chips and glyphs included.
- Cleaned up what dropping the Changes square orphaned: the dock's `changedFiles` prop, its binding in `ConversationPane.vue`, and the `hasDockWork` term that depended on it.

Still open: the panel behind each pill (port plan items 3–5), the Progress / Todos panel capture, and the allowlist rewrite — the 86 blocker entries and 3 element patterns that cite this family have not been touched yet, so the family's 560 hidden findings still stand.

### The panel behind the pills, first cut (2026-09-12, goal round)

Upstream's own rule for the floating panel, taken from its bundle CSS:

```css
.dock-work-panel { position:absolute; left:16px; right:calc(16px + var(--panes-scrollbar-width,0px)); bottom:100%;
  background:var(--color-menu-bg-frost); backdrop-filter:var(--p-menu-backdrop); border:.5px solid var(--color-line);
  border-radius:var(--radius-2xl); box-shadow:var(--shadow-menu); margin-bottom:var(--space-2);
  max-height:min(360px,50vh); display:flex; flex-direction:column; overflow:hidden; user-select:none }
.dock-work-body .taskspane { border:none; background:transparent; padding:0 }
.dock-work-body .taskspane .tp-head { display:none }   /* the head carries the control */
```

Two details that were not visible in the earlier extraction: the bash head's segmented control has **four** segments — Recent (clock), Running (play), Done (circle-check), All (list), Recent selected — and the panel *hides* the pane's own `tp-head`, so the control lives in the panel head. Upstream's own bundle strings confirm the whole model: `filterRecent/Running/Done/All`, `emptyRecent/Running/Done`, `openPanel` ("Open in the side panel"), `closePanel`, `timingRunning/Done`.

Landed this slice:

- New `DockWorkPanel.vue` — upstream's shell: `dock-work-panel panel-<kind>` with `dock-work-head` (`wp-head-tab` glyph + name + `wp-head-meta`, `wp-head-actions`) and `dock-work-body`, anchored with `transform-origin` read from the clicked pill. The fork's tokens carry it (`--color-menu-bg-frost`, `--radius-2xl`, `--shadow-menu`); the glass tier stays the fork's `lg-glass lg-lens`, as its old dock popover had.
- Every pill now toggles this panel instead of opening the right-panel tab; the pill's `is-active` follows the open panel, and the dock root gains `has-popup` while one is open (both upstream's).
- The bash kind: the head carries Recent / Running / Done / All, and the pane's own head is hidden by the panel's CSS. `TasksPane` gained a `filter` prop and an `update:filter` emit so the head can drive it; `lib/bashTaskFilter.ts` gained `recent` (every task, most recently started first) and the shared `BASH_FILTERS` list both controls read. `filterRecent` / `openPanel` added in both locales with upstream's strings.
- The plan kind: the head carries upstream's two actions, "Open in the side panel" (to the right panel's plan pane) and "Close panel". Subagent (`SubagentGrid`) and todos (`TodoCard`) bodies are mounted in the same shell; their head controls come next.
- Removed what the change orphaned: the dock's `activePanelTab` prop, its binding, the `dock-plan-pop` markup and CSS, and the old `dock-popover` transition (upstream's is `dock-panel`).

Verified: `vue-tsc` 0 errors; `check:style` 51; vitest 1011/1011; heap-capped build and `copy-web-assets` green; the served build shot with the bash pill clicked (`.tmp/panel-fork.png`) against upstream's captured bash panel (`.tmp/wdfull2/final/upstream/desktop-dark-en/walk-main-click-22-button-bash-1-running.png`). The shell and head match; the body does not yet — upstream's body is a single list whose rows carry the command inline (`tp-meta`, on its own line under the name) with the elapsed time, a stop button while running and a chevron, while the fork's `TasksPane` is still its own two-pane list-plus-detail, so the names truncate and the command sits in the detail pane.

### Panel bodies: what a live probe of upstream found (2026-09-12)

The walk never reached three of the states the port needs, so a probe drove the upstream bundle the user serves on `127.0.0.1:5399` (fresh headless profile, mock seeded the same way the walk seeds it) and dumped the panel markup for each. `.tmp/probe/`.

- **Progress / Todos panel** (`panel-todos`): head is the tab only — `wp-head-tab` with "Progress" and `wp-head-meta` "1/3", and *no* `wp-head-actions`. Body is `todo-card` with one `tc-row` per todo: `s-done` / `s-in_progress` / `s-pending`, each carrying `tc-glyph` with a state class (`g-done` check, `g-in_progress` spinner — `ui-spinner ui-spinner--xs tc-spin` — and `g-pending` empty) and `tc-name`. The fork's `TodoCard` already carries `todo-card` / `tc-row` / `tc-name`, so the gap there is the glyph classes.
- **Background Agent panel** (`panel-subagent`): the head's control is *not* a segmented control — it is a single `button.ui-pill.fc-trigger` with `aria-haspopup="menu"` showing the current filter ("Recent"), inside the same `span.filter-control`. So bash uses `ui-seg` and subagent uses a dropdown pill. Body is `sg-grid` with `sg-card.s-run/.s-done.openable`, `sg-open` (an overlay button labelled with the agent name), `sg-top` (`sg-num` "01", `sg-name`), `sg-foot`, `sg-status` (`sg-state` with the running dot + the word "running", `sg-time` with a clock glyph and "11h39m"), and `sg-cancel` labelled "stop".
- **A bash row's click does not expand in place — it hands the task to the side panel.** Clicking `.tp-open` closed the dock panel and opened a `ptb-tab` titled with the task name ("Run the test suite") in the upstream side panel. So the row's chevron is the hand-off affordance, and the dock body stays a flat list. The fork's equivalent hand-off is its right panel's bash pane.

Consequence for the port: the dock's bash body is a **flat list** (upstream's `tp-main` rows, command inline via `tp-meta` which wraps to its own line through `flex-wrap:wrap` on `tp-main` plus `order:10; flex:1 1 100%`), and it hands a clicked row to the right panel rather than showing a detail pane inside the dock. The fork's `TasksPane` (two-pane list + detail) is the right panel's pane and belongs to that surface, so the dock gets its own list component instead of a rewrite of the shared pane.

### The bash body, flat list (2026-09-12, goal round)

New `DockTaskList.vue`, ported from upstream's row markup and CSS: `taskspane` / `tp-list` / `tp-row.expandable` / `tp-main` (flex, wrap, `row-gap`) with a full-width `tp-open` button labelled with the task name, the state glyph (the pulsing `kw-dot--running` while it runs, a check when done, the labelled `tp-glyph` wrapper carrying the state word), `tp-name`, `tp-meta` (the command, on its own line, indented past the glyph), `tp-time`, the `tp-stop` button while running, and the hand-off chevron. The empty state follows the filter (`emptyRecent` / `emptyBash` / `emptyRunning` / `emptyDone`), and `stateDone` / `stateFail` were added in both locales with upstream's words. Clicking a row opens the right panel on the bash tab, which is where the fork keeps the task detail (upstream opens a side-panel tab named after the task; the fork's right panel is the same idea, without the per-task tab).

`TasksPane` went back to owning its own filter (the dock head no longer drives it) and now builds its segments from the shared `BASH_FILTERS`. Verified: `vue-tsc` 0, `check:style` 51, vitest 1011/1011, build + `copy-web-assets` green, and the served build shot with the bash pill clicked (`.tmp/panel-fork4.png`) now reads row for row with upstream's captured panel — glyph, name, the command on its own line, the time, the stop button while running, the chevron.

Left open on this kind: the fork's `tp-time` renders its own string (`Running · 0:09`) where upstream's captured rows carry the bare duration (`5m4s`); the fork's timing string is built upstream of the component, so matching it means deciding where the state word belongs. The row shows no detach action — upstream's captured rows carry only `tp-stop`, so the fork's detach affordance stays in the right panel's pane.

### The Background Agent and Progress bodies (2026-09-12, goal round)

- **Background Agent**: new `DockAgentGrid.vue` renders upstream's `sg-grid` of `sg-card.s-<state>.openable` cards — the overlay `sg-open` button labelled with the agent's name, `sg-top` with the ordinal (`01`, `02`) and the name, `sg-foot` → `sg-status` → `sg-state` (the pulsing dot and the word "running", or the check and "Done") with `sg-time` pushed right, and the hover `sg-cancel` button while it runs. The card's chrome is upstream's own (`--color-selected`, hover `--color-selected-hover`, `--radius-lg`), and the ordinal counts the filtered list.
- **Its filter** is upstream's `fc-trigger`, not a segmented control: `DockWorkPanel` gained an optional `dropdown` (a pill showing the current filter's glyph, its word, and a chevron that flips while open, backed by the fork's `Menu`/`MenuItem` with the same anchored placement the task pane's copy menu uses). `SUBAGENT_FILTERS` in `lib/subagentFilter.ts` is the shared entry list; ChatDock passes it and the current value for the subagents kind. The trigger's gap is upstream's `.ui-pill` 6px.
- **Progress**: `TodoCard` now renders upstream's row — `span.tc-glyph.g-<status>` (a check for done, the spinner for in progress, an empty ring bordered `--color-line-strong` for pending) plus `tc-name`, with upstream's own row rules (no per-row background, border, radius or strikethrough; `.s-pending .tc-name` muted). The fork's row chrome and the strikethrough are gone because the panel itself is the surface. The card's **progress bar row is kept** — upstream's captured card has only the rows, so it stays as a deliberate fork extra (the head meta carries the same 1/3); it is an extra-element divergence, not a mismatch. `Spinner` gained upstream's `xs` size (`ui-spinner--xs`, 12px), which the glyph needs.

Verified on the served build: bash (`.tmp/panel-fork4.png`), Background Agent (`.tmp/panel-sub-fork2.png`) and Progress (`.tmp/panel-todos-fork.png`) against upstream's captured bash panel and the three probed panels in `.tmp/probe/`. Gauntlet: `vue-tsc` 0, `check:style` 51, vitest 1011/1011, heap-capped build and `copy-web-assets` green.

Left open: the timing strings in the bash and agent rows still carry the fork's state word, and the fork's card ordinal counts the filtered list where upstream's numbering rule is not established.

### The dock family leaves the allowlist (2026-09-12, goal round)

Four walk runs were needed, each restarted because the build it captured was wrong in a way the previous one had not shown: the first two captured the pre-fix fork (icon-square workbar), the third captured a build whose `Composer` threw during setup, the fourth is the measurement below. The `Composer` failure is worth recording: `watch(anyPopupOpen, …)` reads its source *during setup*, and the computed referenced `addOpen`, declared ~150 lines later — a temporal-dead-zone `ReferenceError` that typecheck cannot see. It rendered the whole composer absent, which the walk reported as 24 missing upstream elements plus two missing texts. The smoke test that would have caught it now exists as `.tmp/smoke-composer.mjs` (loads the served build, asserts the dock, the composer and the four pills render, and that the dock root gains `has-popup` when the model menu opens).

Final run, `.tmp/wdfull/final`, 884 page-source pairs, walk true, both breakpoints, both themes, both locales:

- desktop: zero blockers on both themes.
- mobile: one finding per combo, `DIV.ui-menu.model-dropdown` absent on the fork in `walk-main-click-14-button-example-test-model` — the fork presents the model menu as a bottom sheet on phones (its own affordance, recorded in the `fix-mobile-model-sheet` changeset), while upstream renders the same positioned dropdown there. Desktop matches (`ui-menu model-dropdown lg-glass`). This is the one divergence the dock round leaves behind, recorded as an element allowlist entry with that reason.
- Two runs earlier the same mobile combos also reported `svg.kw-icon.srow-chevron` missing in the settings scene. That is the sheet's Goal row: upstream swaps it for a chevron into the running goal, the fork keeps its toggle because it has no focus-goal target — already documented in `MobileSettingsSheet.vue`. It is state-dependent (upstream renders the chevron only while a goal runs), so it appears in some runs and not others; the divergence itself is unchanged and stays an open item rather than an entry.

Allowlist rewrite, measured with `.tmp/allow-prune.mjs <runDir>` (an entry is dead when no finding in the run matches it):

- Before: 89 entries cite the dock family (86 text, 3 element — `BUTTON.ui-pill`, `*dw-running*`, `SPAN.kw-dot.kw-dot--running`) and they hide 560 findings.
- After the port: 0 blocker-grade findings for the family; the only matches left were ~30 *info*-level ones (8 on the aggregate `walk` scene, whose two inventories differ by construction, and 8 across three walk scenes whose pairing the harness already reports at info). Every entry's reason was written when the fork still had the icon-square workbar, so all 89 are removed rather than reworded, and the family now carries a single entry — the mobile model dropdown above.

Walk-coverage note for the next round: the fork's walk now reaches a different control set in the main phase — its plan pill lands at index 23 (upstream's bash and Background Agent pills sit at 22/23 there), so the fork's captured walk never opens the bash, agent or progress panels; upstream's does. The three panels were verified by driving the served build directly instead (`.tmp/panel-fork4.png`, `.tmp/panel-sub-fork2.png`, `.tmp/panel-todos-fork.png` against the upstream captures and the live probe in `.tmp/probe/`). A future harness change that clicks pills by label rather than index would close that gap.

Closing numbers for the round, after the rewrite and a fresh merge of the same four parts:

- `node .tmp/par/merge.mjs .tmp/wdfull/final <parts>` — blocker 0, warning 10341, info 7486, suppressed 438.
- `node scripts/check-web-port-closeout.mjs --version 0.41 --run .tmp/wdfull/final` — **OK (web port 0.41)**, exit 0: walk true, both breakpoints, both themes, both locales, 884 page-source pairs, 82 verdict rows all accounted.
- `apps/kimi-web/webdiff/allowlist.json`: blockers 205 → 119, elements 53 → 51. The dock family went from hiding 560 findings across 89 entries to hiding none across no entries, with a single element entry added for the mobile model dropdown (4 blocker-grade findings, named above). The ~30 info-level findings the removed entries used to absorb (aggregate-inventory and walk-scene pairing artefacts) now appear in the report as info, which is where they belong.
- The one class of element signature this cost a cycle to learn: the comparison serializes an element as `TAG.class1.class2` with the classes **sorted**, so an allowlist pattern must be written in that order (`DIV.model-dropdown.ui-menu`, not `DIV.ui-menu.model-dropdown`).
- Gauntlet on the tree at the end of the round: `vue-tsc` 0 errors, `check:style` 51 findings (below the 53 baseline), vitest 1011/1011, heap-capped `vite build` and `copy-web-assets` green. A changeset covers the user-visible part (`.changeset/web-dock-pills.md`, `minor`).

#### The model menu on phones (iron-out round, item 1)

Upstream renders the same positioned `div.ui-menu.model-dropdown` on a phone (`style="right: 48px; max-height: 751px"` in its mobile capture); the fork wrapped the same `ComposerModelMenu` in a `BottomSheet` (`div.menu-sheet`). That was the dock round's single allowlist entry, and it is gone:

- `Composer.vue` now renders the positioned dropdown on both form factors — the `!isMobile` guard on the container and the two `if (isMobile.value) return` guards in `positionModelDropdown` / `syncModelDropdownViewport` are removed, and the mobile `BottomSheet` branch for the model menu is deleted. The add-menu and the slash/mention sheets keep their own `isMobile` paths.
- The anchor rule is still the fork's: the menu centres on the model pill and clamps to the viewport with an 8px margin (upstream's phone capture anchors it 48px from the right edge). Element, classes and content match; the offset differs by design of the clamp — recorded here rather than hidden, and the same player as the desktop alignment the earlier round measured.
- Verified on a 430×844 emulated phone (`node .tmp/probe-mobile-menu.mjs`): clicking the model pill yields `div.ui-menu.model-dropdown.lg-glass`, 198×299, fully inside the viewport, with upstream's rows (provider section, the current row, the thinking row, the cache note, More models…) and no sheet.
- `apps/kimi-web/webdiff/allowlist.json`: elements 51 → 50; the dock family now carries no entries at all. The round's fresh walk (below) is what re-measures the mobile model-menu scene, whose captures in `.tmp/wdfull/final` predate this port.

#### Row timing text (iron-out round, item 3)

Upstream's task rows carry the bare duration (`5m4s`, `11h39m`), formatted from the `timeUnitHour/Minute/Second` strings its bundle holds (`h/m/s` in en, `小时/分/秒` in zh); its composite `timingRunning: "Running · {time}"` belongs to the side-panel detail. The fork's rows had been rendering the composite, so both dock bodies now show the bare form:

- `TaskItem.duration` added, computed in `toUiTask` by a new `bareDuration(seconds)` (hours+minutes, else minutes+seconds, else seconds — no padding, upstream's units). `timing` is untouched, so the side-panel panes keep the state-word form.
- `tasks.durationHour/Minute/Second` added in both locales with upstream's words.
- `DockTaskList` and `DockAgentGrid` render `task.duration ?? task.timing`.
- Verified on the served build (`.tmp/panel-bash-time.png`): the rows now read `9s` and `0s` where they read `Running · 0:09` / `Done · 0s`.
- Verified on both served builds after the port (`.tmp/probe-duration-pair.mjs`): the Bash rows read `16h40m` for the running task and **no time element at all** for the completed one, and the agent cards read `01 … 16h40m` / `02` with no time — identical on both apps. Before the port the fork printed `0s` there.
- Settled in the iron-out round from the bundle's own formatter, `function Oc(e,t)` in `index-HU0LCM-X.js`: under a second it returns the **empty string** (its rows then show no time at all), under an hour it drops a zero second component (`5m`, not `5m0s`) and over an hour it drops a zero minute component (`11h`, not `11h0m`); the side of the hour boundary uses minutes+seconds (`59m59s`). `bareDuration` now implements that rule, and both dock bodies hide the time span when it comes back empty (upstream gates its `span.tp-time` / `span.sg-time` the same way). The earlier "not established" note here was wrong to call it unmeasurable — the minified function is readable once located.

#### The settings sheet's Goal row (iron-out round, item 2) — recorded, not aligned

Upstream's Goal row swaps its toggle for a chevron **only while a goal is running**, and that chevron opens what its bundle calls `.dock-work-panel.panel-goal` — a fifth dock panel kind beside bash, subagent, todos and plan. Probing upstream's sheet on a 430×844 viewport with no active goal showed no chevron (0 `.srow-chevron` in the sheet); the walk's captures show one once a goal is running. The fork's goal surface is the strip above the dock — `focusGoal` bumps `goalExpandSignal` and the strip expands — and it has no goal panel, so its row stays the toggle that both starts and stops the goal.

Aligning this means porting a `panel-goal` kind, which is new dock surface rather than an `apps/kimi-web` markup fix inside the dock round, so it is recorded as an **open item**: one element allowlist entry (`svg.kw-icon.srow-chevron`) whose reason carries the evidence above and points at this section. Note the entry is inert in a run where no goal is running, which is why the earlier round saw the chevron in only one of eight combinations.

#### The one state the round could not pose

The criterion names five states: bash running, background agent running, todo progress, plan pending review, and no tasks at all. The first four were posed and compared (the walk, plus the live upstream probe and the four panel shots). The fifth was not, and the reason is new information about how the two apps differ:

- Upstream's dock derives its Bash and Background Agent pills from the transcript page's **`tasks` array**; the fork derives them from the background tool calls in the transcript itself.
- `MOCK_NO_TASKS=1` was added to `mock-server.mjs` this round to empty the REST list and the transcript's `tasks` array. With it, upstream's dock drops to `Plan` and `Progress 1/3` — the task pills are gone — while the fork still shows `Bash`, `Background Agent 1 running` and `Progress 1/3`, because its pill source (the background tool calls) is untouched by that switch. Emptying those means a fixture with no background tool calls at all, which changes the transcript both apps are compared on, so it was not done inside this round.
- The probe also shows one more difference worth a look before the state is called aligned: in that half-posed state the fork's Bash pill carries no chip while upstream's reads "Bash 1 running". Whether that is a real counting difference or an artefact of the half-posed state is not established.

Recorded here as the round's remaining verification gap, with the switch and the probe (`.tmp/probe-notasks.mjs`) in place to finish it: the next step is a bare fixture (no background tool calls) so both apps' pill sources agree, then the same comparison.

**Update (iron-out round).** The switch now exists and the state is posed on both apps, and it agrees:

- `MOCK_NO_TASKS=1` empties every task-bearing payload the mock serves: the REST `/tasks` list, the transcript page's `tasks` array, and the v2 snapshot's `messages.subagents` array. (Verified by `curl`: the page reports `tasks: []`.) Each of the three is a source one of the two apps reads — upstream's dock uses the page's `tasks`, the fork's uses the REST list through `useTaskPoller` plus the snapshot's `subagents` for its agent rows.
- With all three empty, **upstream renders `Plan` and `Progress 1/3`** and **the fork renders `Plan` and `Progress 1/3`** — its `Bash` and `Background Agent` pills are present in the DOM but `display: none`, and their panels open empty. The workbar stays in both.
- A correction to this section's earlier note: the apparent "pill visible with an empty panel" was my own probe clicking a hidden pill (`el.click()` fires on hidden elements), not a defect in the fork. Measured with `getComputedStyle`, the pill is hidden. No bug to chase.
- What the state does still show, and it is the fork's own decision rather than a dock difference: the fork renders its goal strip above the dock where upstream has none, so the dock's total height differs in this state.

Repro: `MOCK_NO_TASKS=1 node .tmp/probe-notasks.mjs` (both apps) and `.tmp/probe-notasks3.mjs` (the fork alone, with each pill's display state and its panel's contents).

#### The card ordinal is a per-session serial (iron-out round, item 4)

Upstream's bundle numbers the cards from a serial that is handed out once per background subagent and cached for the session, not from the card's position in the list it renders:

- The grid renders `String((task.swarmIndex ?? index) + 1).padStart(2, "0")` (`SubagentGrid`, `data-v-b7be8bd8`), and `swarmIndex` is overwritten for every background subagent by `pZe`, which keeps `subagentCardSerials` per session: agents without a serial get one in `createdAt` order starting at `max+1`.
- Live probe (`.tmp/probe-ordinal2.mjs`): with the **Done** filter, where the grid's array holds one card, that card still reads `02`; `Running` → `01`; `Recent` and `All` → `01`, `02`. A position rule would have printed `01` in the Done state.
- The fork numbered by the visible index, so its Done state read `01`. `DockAgentGrid.vue` now numbers from the full background list ordered by `createdAt` (the serial's own rule) and no longer from the filtered array.
- Verified on both served builds across all four filters (`.tmp/probe-ordinal-pair.mjs`): fork and upstream now print identical numbers in every state.
- Residual, not established: upstream's serial is assigned once, so an agent that leaves the list keeps its number, while the fork re-derives it from the list. The two differ only if a task disappears from the list inside one session; none of the captured states pose that.

#### The two fork extras (iron-out round, item 5) — kept, recorded

- **Todos progress row.** Upstream's `TodoCard` (`data-v-97ded963`) renders the empty state or a flat list of `tc-row`s and nothing else; its done count sits in the work panel head's meta slot. The fork keeps a labelled count plus a thin track above the rows (`.tc-progress` in `TodoCard.vue`). Kept as a fork feature — it is additive markup the walk reports as an inventory difference, not a missing-element blocker.
- **Goal strip above the dock.** Upstream has no equivalent: the probe recorded `goalStrip: true` on the fork and `false` upstream, and its absence is what shortens upstream's dock in the no-task state (recorded above). Kept as a fork feature; the goal surface itself stays the open item of item 2.

#### The pill's surface material (iron-out round, item 6) — recorded

Measured on both served builds with liquid glass off (`.tmp/probe-pill-material.mjs`), reading the Background Agent pill:

- Upstream: fill `rgba(0,0,0,.05)` (its `--color-selected`), `backdrop-filter: blur(24px) saturate(1.8)` (its `--p-menu-backdrop`), radius 12px, padding `8px 14px 8px 12px`, height 37px, `14px/500`, `line-height: 21px`.
- Fork: identical radius, height, size, weight and line-height; padding 13px → 14px and `line-height: 1` → `--leading-normal` were brought onto upstream's rule this round (`ChatDock.vue`). Two differences remain, both recorded rather than adopted:
  - the fill is the fork's own `--color-selected` token (`#00000014` light / `#ffffff14` dark) against upstream's `rgba(0,0,0,.05)` / `rgba(255,255,255,.1)` — a token used by every selected surface, so changing it here would move the whole app;
  - the blur comes from the fork's glass system (`.lg-band`), which is `none` whenever the liquid-glass toggle is off — the mode this round inspects in — and which the fork's `check:style` refuses on this surface (`no-glassmorphism`). Adopting upstream's `backdrop-filter` would mean a new token plus a style-rule exception, and the user's instruction is to handle the glass after the revamp.

#### Walk coverage: the walk now reaches the pills, and pairs them (iron-out round, item 8)

The walk discovers interactive controls in DOM order and keeps the first `MAX_WALK_SURFACES` (24) of them. The fork's dock pills sit behind the whole transcript at discovery indices 23–26, so the cap cut the last two and the fork's captured walk never opened the bash, Background Agent or todos panels, while upstream's did (its pills land at 21–24). Last round's note here proposed clicking pills by label; the change is smaller, and it needed two parts:

- `surfaces.mjs` exports `PRIORITY_CLASS = 'ui-pill'` (both apps render the workbar pills as `.ui-pill`), and the walker stable-sorts the discovered controls so those come first, then slices to the cap.
- Reaching them is not the same as comparing them. `compare.mjs` pairs a walk surface with its counterpart **by file name**, and the name ends in `slug(label, tag, index)`, which embedded the discovery index — so the fork's `…-11-button-background-agent-1-running` and upstream's `…-08-…` were never the same surface, and each side's panel was reported as a one-sided `surface-missing` at info level. Pills, being controls both apps share under the same label, now name themselves **without** the index (`slug` takes a null index; `webdiff.mjs` passes one when the label repeats among the pills, since a repeat would collide on one file name). Every other control keeps its index.
- Verified on a four-control run (`--scene main --max-walk 4 --breakpoints desktop --themes dark --locales en`): both apps produce `walk-main-click-button-plan`, `-bash-1-running`, `-background-agent-1-running` and `-progress-1-3`, and the comparison pairs them.

That pairing immediately paid for itself. Four blocker-grade findings appeared on the paired panels, all of them markup differences the walk had never seen:

- `DIV.dock-work-panel.panel-subagent` — the fork used the plural `panel-subagents` for the panel root. `DockWorkPanel` now emits upstream's class name (`panelClass`), and its scoped rules follow.
- `svg.kw-icon.sg-ic-done` and `svg.kw-icon.tp-done` — upstream's done glyph is a circled check carrying a state class that paints it (`--color-success`, `transform: scale(.91)`); the fork drew a bare `check` and painted every glyph green from the wrapper. The glyph is now upstream's own drawing, copied into `src/icons/kimi/circle-check.svg` and registered as `circle-check` (upstream's `SubagentGrid` and `TasksPane` render the same paths), and the colour moved onto the state classes (`tp-done` / `tp-fail` / `tp-cancelled`, `sg-ic-done`). The fail and cancel glyphs became upstream's `close` with those classes, from its markup; the mock poses only running and done, so that half rests on the page source alone.
- `SPAN.filter-control`, plus the texts `All` and `Running` — upstream's head filter is one component (`FilterControl`) whose **shape follows the space, not the kind**: a segmented control while the panel is wide, the same options behind a `fc-trigger` dropdown when it is compact. The fork had tied the shape to the kind (bash → segmented, Background Agent → dropdown), which put the dropdown where upstream puts the segmented control on desktop and the segmented control where upstream puts the dropdown on mobile. Both kinds now follow the form factor, both wrapped in `span.filter-control` (the panel grew a `#filter` slot for the segmented form).
- The compact rule is the fork's `mobile` prop, not upstream's container-width `ResizeObserver`; a narrow desktop window therefore keeps the segmented control where upstream would collapse it. That state is not posed by the harness, so it is recorded here rather than built.
- After the changes the same four-control run reports `blocker=0` (exit 0), and the fork's desktop Background Agent panel matches upstream class-for-class: `span.filter-control`, four `ui-seg__item`, `ui-seg--md`, `panel-subagent`, `sg-ic-done`.

#### Closing run (iron-out round, 2026-09-12)

`.tmp/wdfull/final`: four workers (desktop/mobile × dark/light, each en+zh), `walk: true`, 891 page-source pairs.

- All eight combinations, on both apps, now carry walk captures for the four dock panel kinds — `panel-bash`, `panel-subagent`, `panel-todos`, `panel-plan`. The fork's panels are compared by the walk, not only by hand shots.
- The first merge reported **8 blockers, all one class**: the elapsed-time label on the running rows and agent cards. Upstream `26分33秒`, fork `39分20秒` — the same row, read minutes apart, because the walk visits upstream and then the fork and each mock starts its own clock. Not a markup difference: the comparison's volatile-text list (which already drops "just now", "5 minutes ago", "29.3k") learned the two-unit duration form in either locale's units (`26分33秒`, `5m4s`, `11h39m`, `9s`). Re-merging the same captures without a new walk: **blocker 0**.
- `node .tmp/par/merge.mjs .tmp/wdfull/final <four parts>` — blocker 0, warning 13683, info 9477, suppressed 666.
- `node scripts/check-web-port-closeout.mjs --version 0.41 --run .tmp/wdfull/final` — **OK (web port 0.41)**, exit 0: walk true, both breakpoints, both themes, both locales, 891 page-source pairs, 82 verdict rows all accounted.
- `apps/kimi-web/webdiff/allowlist.json`: 119 blockers, 0 warnings, 51 elements. The only entry whose reason names the dock family is `svg.kw-icon.srow-chevron`, which carries its own evidence; the mobile model-dropdown entry the dock round added is gone.
- Gauntlet on the tree: `vue-tsc` 0 errors, `check:style` 51 (the baseline), vitest 1011/1011, heap-capped `vite build` and `copy-web-assets` green.
- Changesets for what a user can perceive: `web-mobile-model-dropdown`, `web-task-bare-duration`, `web-agent-card-ordinal`, `web-dock-filter-control`, `web-dock-state-glyphs` (all patch). Nothing is committed.

#### The dock material, ported rather than approximated (2026-09-12, after the closing run)

Item 6 above recorded the pill's material as a deliberate fork divergence ("the fork's glass band, upstream's `--p-menu-backdrop`"). Side-by-side screenshots of the dock panels showed that reading was wrong: the fork's panel and pills read visibly denser and glossier than upstream's. Measured on both served builds (`.tmp/probe-panel-material.mjs`, `.tmp/probe-panel-material2.mjs`), light and dark:

| | upstream | fork, before |
|---|---|---|
| panel fill | `--color-menu-bg-frost` (bg @ 70%) | tier tint from `--color-surface-raised` @ 20% + a gradient |
| panel blur | `blur(24px) saturate(1.8)` | `blur(40px) saturate(2.2) brightness(1.04) url(#lg-refract-soft)` |
| panel edge | 1px `--color-line` + `--shadow-menu` | bright inset rims + dispersion |
| panel with glass off | unchanged | fill and blur both gone |

Upstream's panel recipe turned out to be exactly its *menu* material — `background: var(--color-menu-bg-frost)` + `backdrop-filter: var(--p-menu-backdrop)` — and its workbar pill the same backdrop over `--color-selected`. The fork had the fill token but never used it, had no `--p-menu-backdrop`, and no `--shadow-menu`.

- Added `--p-menu-backdrop: blur(24px) saturate(1.8)` and `--shadow-menu` (upstream's own three-layer shadow, per theme) to the token sheet.
- `DockWorkPanel` and the workbar pills now use that recipe instead of a glass tier (`lg-glass lg-lens` / `lg-band` dropped). Measured after: fill, blur, radius, border and shadow equal upstream's, in both themes — e.g. the panel's fill resolves to the same `color(srgb …/0.7)` and its blur to `blur(24px) saturate(1.8)`.
- Two by-catches, both real bugs found by the measurement: the fork's panel asked for a `--shadow-menu` token that did not exist (so it had *no* shadow of its own — the glass composition had been hiding it), and a stale global block from the icon-square workbar (`html[data-liquid-glass="on"] .dock-workbar button.ui-pill { border-radius: 999px; … }`, style.css) still forced a capsule radius and glass hover fills onto the labelled pills. Both are gone.
- `prefers-reduced-transparency: reduce` restated for these two surfaces (solid raised face, no blur), since they no longer ride the tier slots that rule retargets.
- Two token divergences stay, and are not this round's to change: the light `--color-line` hairline (fork `#e7eaee` against upstream `rgba(0,0,0,.13)`) and the pill fill (`--color-selected`: `#00000014`/`#ffffff14` against upstream's `.05`/`.1`) — both are app-wide tokens.
- Verified: a four-control walk over the same pill surfaces on both apps (`.tmp/walkmat`) reports **blocker 0**, exit 0, and `typecheck` / `check:style` 51 / vitest 1011 are green. Screenshots: `.tmp/dockmat-{upstream,fork}-{dark,light}.png`.
