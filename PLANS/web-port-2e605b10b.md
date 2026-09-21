# Web port, sync `2e605b10b` (opened 2026-09-21)

Round for the bundle sync `2e605b10b` ("chore: sync web dist from code-app" #3934,
code-app `44d7281c7`), the only sync since the 0.43.1 round's pinned `4e813cf71`.

- Range: `git log 4e813cf71..upstream/main` returns 40 commits, exactly one of them a bundle sync.
- Bundle under test: **web @ `2e605b10b`** (== `upstream/main` @ `6a214b85e`, no later sync),
  extracted into `.tmp/wd0433/now` (`boot.js` 1 105 B, `index.html` 1 187 B, `favicon.ico` 3 461 B,
  `assets/` 524 files, root 30 813 542 B).
- Bundle the fork is ported to: **web @ `4e813cf71`** (the 0.43.1 round), extracted into
  `.tmp/wd0433/prev` (same 524 files, root 30 645 942 B).
- Fork reference: `apps/kimi-web`, unbuilt at the time of writing (see "Gate").
- The sync carries one changeset, `.changeset/web-interaction-polish.md`:
  > `web: Improved interactions and fixed known bugs.`
  That is the only written spec.

## Why the menu is derived, not listed

The changeset body is a one-liner, so the menu comes from the two bundles themselves: UI strings
and CSS class inventory compared between `.tmp/wd0433/prev` and `.tmp/wd0433/now`.
Raw inventory: `.tmp/wd0433/inventory.txt`.

Signals: **74 new UI strings** (107 dropped), **2 630 new CSS selectors** (2 430 dropped),
**192 new class names** (38 dropped), and **18 new `__name:"..."` components** (1 dropped).
The selector delta is mostly `[data-v-...]` rehashes of the same UI primitives (`.ui-button`,
`.ui-dialog`, `.ui-card`, `.ui-badge`, `.ui-banner`, `.ui-check`), but the class-name delta is
not: it introduces whole new component families (`bv`/`bshot`/`btd`/`bsrc`/`brt`/`brs`/`brv`/
`brr`/`ble`/`burl`/`bfold`/`bt`, the browser-tool family) and rewrites the providers surface
(`AddProviderFlow` becomes `AddProviderPage` plus `ManagedProviderView` plus `ProviderBrandIcon`
plus `ProviderModelTable`, with the new `pf`/`pbi`/`ap`/`mpv`/`pmt` family). This is a large
restyle of the browser tool and the providers/settings surface, not a polish batch.

## Menu

| # | Upstream change (bundle evidence) | Verdict |
|---|---|---|
| 1 | Browser-tool rewrite: the new `__name:"BrowserToolDetails"` plus `BrowserFacts` / `BrowserFold` / `BrowserReceiptStrip` / `BrowserReceiptThumb` / `BrowserReceiptView` / `BrowserRetryRun` / `BrowserShot` / `BrowserSources` / `BrowserTable` / `BrowserUrl` / `BrowserValueView` / `BrowserLiveEntry` / `BrowserReferenceDetails` (this last was already in 0.43.1, now embedded under `BrowserToolDetails`) form a new component tree; the `bv` / `bshot` / `btd` / `bsrc` / `brt` / `brs` / `brv` / `brr` / `ble` / `burl` / `bfold` / `bt` class families (192 added, 38 dropped) are this surface; the `.btd-block-id` / `.btd-block-kind` / `.btd-block-text` / `.btd-block-note` and `.brt-frame` / `.brt-canvas` / `.brt-img` / `.brt-missing` / `.brt-live` selectors together imply a block-ID-keyed render with a live-canvas twin; `BrowserToolDetails` (`.browser-tool-details`, `.browser-tool-detail`) is gone from the JS as a top-level name | SKIPPED (user decision, 2026-09-21: the fork keeps its own browser-reference dialog and renders upstream's "The in-app browser is unavailable" state) |
| 2 | Providers/settings restyle: `AddProviderFlow` is dropped, replaced by `AddProviderPage` plus `ManagedProviderView` / `ProviderBrandIcon` / `ProviderModelTable`; the new `pf` / `pbi` / `ap` / `mpv` / `pmt` class family carries `.pf-brand` / `.pf-brand-name` / `.pf-brand-tag` / `.pf-pool-state` / `.pf-head-sticky`, the `pbi-*` glyph rows (`.pbi-kimi` / `.pbi-zai` / `.pbi-zhipu` / `.pbi-deepseek` / `.pbi-minimax` / `.pbi-fallback`), and the `mpv-*` model-table cells; the legacy `pf-form` / `pf-guard` / `pf-field-label` / `pf-models` / `pf-model-grid` / `pf-managed-note` / `af-*` / `pp-item` / `pp-add-row` / `pp-acc` / `pp-acc-in` classes are dropped. UI strings confirm "Kimi Subscription" / "Custom providers" / "Sign in" / "Available after sign-in" / "Refresh models" / "From models.dev" / "Coding Plan" / "Token Plan" / "Sign in to Kimi Subscription" are now the top-level strings | SKIPPED (user decision, 2026-09-21: the fork keeps its own `ProviderManager` and `ProvidersPanel` surfaces) |
| 3 | Quit and remove-workspace confirmations: new strings `Quit Kimi Code?` + `Sessions are still in progress on this machine and will be interrupted if you quit.`, plus `from the sidebar?` + `The folder and its files are not deleted, and its sessions are kept; add the folder back at any time to bring them back.` (and the matching zh-CN block); the prior single-line `Remove workspace` and "Managed providers sign in and out on the Account tab" were the entire copy | SKIPPED (the strings sit in the bundle's string table and render in no captured surface, the shell-only pattern the 0.43.1 round recorded for the in-app browser's address bar) |
| 4 | File-open dialog: new strings `Copy download link` / `Link copied` / `Remove from list` / `Show in folder` / `Open file` / `The file will open in its default app.` / `File not opened` / `Kimi Code does not open programs or scripts. You can find the file in its folder.`, plus the SVG path `M21.846 0a1.923 ...`. Together they imply a new `Open file` confirmation dialog for download-bound attachments | SKIPPED (same shell-only pattern: every one of these strings is in the string table and in no captured surface) |
| 5 | Wire-protocol plumbing: new strings `session event subscribe restored`, `session event subscribe retry`, `Session-relative attachment:`. The substring moves (with surrounding `in k?k.text:` / `in z?z.text:` / `in X?X.text:` and `:C.attrs.path\|\|void 0` / `:C.attrs.comment\|\|void 0`) suggest an automatic re-subscribe on resume and a Session-relative path resolver for attachments | SKIPPED (engine-side: the re-subscribe and session-relative attachment paths live in `packages/transcript` and `packages/kap-server`, with no web surface to port) |
| 6 | Right-panel polish: `Right panel` becomes a real label (not just an `aria-label`/i18n key); `pill-collapsed` replaces `pills-compact` (5 vs 1 occurrence). The toggle's collapsed form is the new default; the brand family carries a new `ui-favicon` / `ui-skeleton is-circle` plus `BrandLogo` and `Skeleton` component names | SKIPPED (user decision, 2026-09-21: the fork keeps its own right-panel control) |
| 7 | Chat loading state: new `chat-loading` / `chat-loading-text` class names and the `media-preview-menu mpm-icon` cluster imply a per-message skeleton plus a media-preview popover menu. Both are absent from the JS | SKIPPED (user decision, 2026-09-21: the fork keeps its own loading states) |

## Pre-port reading (evidence gathered before the port; not verdicts)

1. **BrowserTool restyle**. The fork has no `BrowserTool*.vue` (search confirms: only `BrowserReferenceDetails.vue` at `apps/kimi-web/src/components/browser/BrowserReferenceDetails.vue`). The whole `bv`/`bshot`/`btd` family is greenfield. This is the largest single surface delta in the round.
2. **Providers restyle**. The fork's `AddProviderFlow.vue` (`apps/kimi-web/src/components/providers/AddProviderFlow.vue`) is the dropped component. A straight port swaps the file and rewires the `pbi-*` glyph imports; this touches every provider card and the managed-provider view, which lives in `apps/kimi-web/src/components/providers/`.
3. **Confirmations**. These are string-table swaps; the dialog host is already shared, so this is two new entries, no structural change.
4. **File-open dialog**. New component on the composer side; the `apps/kimi-web/src/components/composer/` family should be checked for an existing attach dialog before adding a new one.
5. **Wire-protocol plumbing**. These land in `packages/transcript/` and `packages/kap-server/`; the web bundle just consumes them. Web has nothing to port here.
6. **Right panel / pills**. `pill-collapsed` is a CSS class swap; the fork's `Sidebar.vue` carries `pills-compact` and needs the rename plus the new collapsed state.
7. **Chat loading / media preview menu**. The `apps/kimi-web/src/components/transcript/` family has no `Skeleton.vue` or `MediaPreviewMenu.vue`; both are greenfield.

## Baseline blockers (measured 2026-09-21)

Run: `.tmp/wd0433/baseline`, desktop/dark/en, walk on, glass ON (it predates the `capture.mjs` glass seed).
`summary.blocker = 84`. The 84 collapse to four shapes, each repeated per surface:

| Count | Blocker | Reading |
|---|---|---|
| 22 | `text "Read 1 file · Ran 1 command · Searched 1 pattern · 1 tool call · …"` missing on fork | the activity-run summary line upstream added at the head of a run |
| 22 | `text "Sources · visited 1 page"` missing on fork | the browser tool's sources line |
| 26 | `N upstream element(s) missing on the fork (of ~660 compared)` | the same two families, counted structurally; `e.g. DIV.ar-top \| SPAN.ar-sep \| DIV.expandable.open.tool-line` |
| 8 | `text "Model Providers"` missing on fork | the providers/settings restyle |
| 3 | `text "Help improve Kimi Code"` and `text "When on, we collect usage data (such as feature clicks and usage…)"` missing on fork | upstream's telemetry opt-in copy |

Class vocabulary present only in the upstream `main` capture, minus the allowlisted families
(`md-code-*`, `wi-face`/`wi-eyes`/`wi-eye*`, `ProseMirror*`, `composer-placeholder-overlay`):

`ar-top` · `bsrc` `bsrc-car` `bsrc-fallback` `bsrc-fav` `bsrc-globe` `bsrc-pill` `bsrc-sites` ·
`ch-toggles` · `idle` `working-indicator` · `sa-empty` `sa-f-actions` `sa-f-label` `sa-filters`
`sa-head` `sa-page` `sa-pager` `sa-pager-right` `sa-scroll` `sa-select` `sa-select-chev`
`sa-select-label` `sa-state` `sa-subtitle` `sa-table-card` `sa-title` `sa-total` ·
`stream-diffs-shell` `stream-diffs-surface` · `ui-button--ghost` `ui-button--primary`

So the round's real targets are three: the activity-run summary (`ar-top`, `ar-sep`), the browser
sources line (`bsrc*`), and the providers/settings restyle. The rest is either allowlisted
divergence or a class-name difference on a surface the fork already has (`sa-*` is the session
admin page, `ui-button--*` are button variants).

## Verdicts on the measured blockers

The walk's 84 blockers normalise to ten ids. Every one is SKIPPED at the user's decision of
2026-09-21 (the fork keeps its own web UI this round), except the two scene failures.

| # | Blocker id | Verdict |
|---|---|---|
| 1 | `*::*::dom-elements-missing` | SKIPPED (the structural shortfall is the skipped families counted structurally: `DIV.ar-top`, the `bsrc*` group and the providers surface) |
| 2 | `*::*::missing-text::read-1-file-ran-1-command-searched-1-pattern-1-tool-call-mad` | SKIPPED (user decision. The fork renders the same summary line; upstream ends it "Visited 1 page · 1 click" where the fork folds browser actions into "4 tool calls") |
| 3 | `*::*::missing-text::sources-visited-1-page` | SKIPPED (user decision: the fork has no browser sources pill) |
| 4 | `*::*::missing-text::model-providers` | SKIPPED (covered by menu row 2, the providers restyle) |
| 5 | `*::*::missing-text::help-improve-kimi-code` | SKIPPED (user decision: upstream's telemetry opt-in row) |
| 6 | `*::*::missing-text::when-on-we-collect-usage-data-such-as-feature-clicks-and-usa` | SKIPPED (the description under that row) |
| 7 | `*::*::missing-text::2-0-1-t` | SKIPPED (the About tab prints each build's own version and build tag, so the two can never agree) |
| 8 | `*::*::missing-text::tabbed-session-list` | SKIPPED (the fork's Lab tab carries its own session-list controls) |
| 9 | `*::*::requirement::agent-pane-titled` | NOT APPLICABLE (the requirement failed on the **upstream** capture: the scene did not reach a titled agent pane, so it measures a scene gap, not a fork divergence) |
| 10 | `*::*::requirement::subagent-card-result` | NOT APPLICABLE (same: the requirement failed on the upstream capture) |

## Gate

State on 2026-09-21, after the skip decision and the allowlist entries.

- **Verdict table: passes.** `node scripts/check-web-port-closeout.mjs --version 2e605b10b`
  reports `17 verdict row(s), all accounted`.
- **Blocker count: 2, down from 84**, measured by re-comparing the existing baseline captures
  (`.tmp/wd0433/recompare.mjs`, no re-walk). Both survivors are scene gaps, not divergences:
  `requirement::agent-pane-titled` and `requirement::subagent-card-result` fail on the **upstream**
  capture. Upstream reads the agent id off the tool frame (`agent_id` / `agentRefs`) to make the
  agent card a button and to title the pane; the mock's tool frames carry no agent id, so both
  scenes stop at the launcher. Closing them is a mock-fixture change, not a web port.
- **Coverage: fails.** The measured run is `.tmp/wd0433/baseline`, which is desktop / en / dark
  only. The gate wants both breakpoints, both locales and both themes, so a full matrix run is
  still owed. `desktop-dark-en::upstream: scene(s) opened no surface — behaviour-subagent-card` is
  the same agent-id gap.

The full matrix is the remaining work to close the round; the port work itself is closed by the
user's SKIPPED verdicts above.
