# Web port — 0.43.1 (bundle-only round, opened 2026-09-17)

Round for the sync `d9d1f5980` ("chore: sync web dist from code-app" #3850), the only bundle
sync since `lastSyncedBundleCommit` `26a284192`.

- Range: `git log 26a284192..upstream/main` → 24 commits, one of them the sync.
- Bundle under test: **web 0.43.1 @ `d9d1f5980`**, extracted into `.tmp/upstream-web`
  (verified file-by-file against `upstream/main`'s `apps/kimi-code/dist-web`).
- Bundle the fork is ported to: **web 0.43.0 @ `26a284192`**, kept for the diff at
  `.tmp/upstream-web-prev`.
- Fork reference: `apps/kimi-web/dist`, rebuilt 2026-09-17 from `ac523aea7`.

## Why this round's content is derived, not listed

The sync carries **no `web:` changeset at all**, and no `web:` blurb was added anywhere in the
range (`git log 26a284192..upstream/main --diff-filter=A --format='' --name-only -- .changeset/`,
then keep bodies starting `web:`) — the result is empty. So the menu below comes from the
bundle itself, the way the skill's "diff the two bundles" lesson prescribes: UI strings,
CSS class inventory, and API/protocol literals compared between `.tmp/upstream-web-prev` and
`.tmp/upstream-web`. Raw inventory: `.tmp/wd0431/inventory.txt`
(`.tmp/bundle-diff.mjs` + `.tmp/css-diff.mjs`).

Signals: **196 new UI strings** (27 dropped), **164 new CSS class names** (98 dropped).

## The one big item: an in-app browser

68 of the 196 new strings describe a browser surface that does not exist in the fork's web UI,
and 12 new class families carry it. Nothing in the range's engine commits adds a matching
daemon surface (`git log 26a284192..upstream/main --name-only | grep -i browser` matches only
the WebBridge display-name rename #3803); the fork already carries the engine capability
(`packages/agent-core-v2/src/app/capability/entries/kimiWebbridge.ts`).

| Area | Evidence |
|---|---|
| Tab strip + address bar | strings: New tab, New Browser tab, Web address, "Search or enter an address", Tab name, "Tab action failed", New tab to the right, Duplicate tab, Rename tab, Copy URL, Open in external browser, Mute tab, Unmute tab, Close tab, Close other tabs, Close tabs to the right, Fork session; classes `nb-domain`, `panel-tab-favicon` |
| Downloads | No downloads yet, Clear downloads, Refresh downloads, "Show a save dialog before a download starts" |
| History | No browsing history yet, Clear history, Refresh history, "Search your browsing history and downloads" |
| Settings | Browser settings, Default search engine, "Used when searching from the address bar", Default zoom, "Applied to open and newly created Browser tabs", Browsing data, "Delete cookies, sign-in status, and cached browser data", Clear browsing data |
| Device emulation | iPhone SE / 12 Pro / 14 Pro / 14 Pro Max / 16 Pro / 16 Pro Max / 17 / 17 Pro / 17 Pro Max, Pixel 7 / 8 / 9, Samsung Galaxy S20 Ultra, iPad Mini, iPad Pro 13, Desktop 1280 × 800 / 1440 × 900 / 1920 × 1080, Device emulation toolbar, Viewport width, Viewport height, Rotate device, Display scale, Fit to window, Follow theme, Light background, Dark background |
| Empty state / landing | "Type an address above, or ask the agent to:", "Open pages, move between tabs, and show you what it finds", "Pull out text, list page elements, and take screenshots", "Click, type, fill in forms, pick options, and scroll", "Test layouts", "Preview pages on phone, tablet, or custom screen sizes", "You can watch the agent work and take over at any time", "The in-app browser is unavailable", "Page couldn't load", "Enter a valid web address" |
| Page annotation | Annotate page, Cancel annotation, "Locate on page", "Save and locate", "Add to composer", "Insert into comment", "Include screenshot with this reference", "A screenshot is required for a region", "The screenshot is currently unavailable.", "Uploading the screenshot.", "Retry screenshot upload" |
| Element capture details | "Location & geometry", "Semantics & state", "Data attributes", "Page & capture details", Page title, Captured at, Device pixel ratio, "Base / custom", "Show more" / "Show less", "Some attributes were omitted because they exceed capture limits.", "Copy failed. Select the text to copy it." |
| Tool card + approval | classes `browser-tool-details`, `browser-tool-detail`, `browser-approval`, `browser-approval-action`; "Invalid browser reference step", "Browser reference plugin is missing", "Invalid browser reference data", "Invalid browser reference identity", "The captured information for this reference is unavailable.", "The original element could not be located. The page may have changed." |
| Mentions | classes `mention-browser-text`, `mention-tip-browser`, `…__source`, `…__target`, `…__preview`, `…__comment` |

## The rest of the bundle diff (UI refresh, no blurb either)

| Area | Evidence (new classes) |
|---|---|
| Right panel tab strip | `panel-tab-title`, `panel-tab-status`, `panel-tab-favicon`, `panel-context-menu`, `panel-menu-icon-space`, `ptb-drag-fill`, `ptb-drop-indicator`, `is-reordering`, `sliding`, `right-panel-toggle`, `right-panel-open`, `ptb-hide` |
| Swarm card, rewritten | `sw-content`, `sw-head`, `sw-avatar`, `sw-text`, `sw-title`, `sw-model`, `sw-count`, `sw-members`, `sw-member`, `sw-row`, `sw-ic`, `sw-name`, `sw-act`, `sw-tail`, `sw-state`, `sw-idx`, `sw-saved`, `sw-saved-car`, `sw-body`, `sw-fallback`, `sw-waiting` (the old `member-*`, `mphase`, `phase-*` set is gone) |
| Agent-group card | `ag-card`, `ag-avatar`, `ag-text`, `ag-title`, `ag-spin`, `ag-model` |
| Background-task card + todo row | `bt-list`, `bt-task`, `bt-desc`, `bt-meta`, `bt-fields`, `bt-note`, `ar-sr-only`; `todo-head`, `todo-current`, `todo-count` (old `todo-bar`/`todo-fill` gone) |
| Edit-diff rows | `ed-path`, `ed-dir`, `ed-file`, `ed-open`, `ed-stats`, `ed-add`, `ed-del` |
| Mascot / wordmark | `wi-face`, `wi-eyes`, `wi-eye`, `wi-eye--left`, `wi-eye--right`, `wordmark`, `mascot-peek`, `eyes`, `peek-enter` (the old `mascot-host`/`doodle-host`/`doodle-canvas` set is gone) |
| Composer controls | `cbtn`, `cbtn-label`, `cbtn--default`, `cbtn--primary`, `cbtn-cap`, `cbtn-ic`, `cbtn-spin`, `cbtn-cap--combo`, `cbtn-cap-key`, `cbtn-cap-text` |
| Primitives | `ui-check` (+ `__input`/`__box`/`__label`), `ui-input` (+ `--md/--xs/--sm`, `is-embedded`), `ui-empty--lg`, `ui-kbd--button`, `ui-seg--disabled`, `ui-seg__indicator`, `ui-textarea--sm`, `is-autosize`, `is-pressed` |
| Markdown / code scrolling | `md-code-scroll-host`, `md-code-scroll-viewport`, `md-code-edges`, `md-code-scrollbar` (+ `--horizontal`/`--vertical`/`thumb`), `md-table-scroll-host`, `md-table-scroll-overflow`, `md-punctuation-run`, `markdown-code-preview`, `markdown-preview-toggle`, `markdown-preview-active` (old `markstream-pre`, `md-table-at-end` gone) |
| Question pane | `qpane`, `qpane-inner`, `qopt-check`, `qh-ic`, `multi`, `shortcut`, `shortcut-unavailable`, `am-entry`, `am-shortcut` (old `rc-head`/`rc-st`/`rc-q`/`rc-opt`/`rc-lb`/`rc-ds`/`rc-g`, `qopt`, `qskip`, `chk`, `rad` gone) |
| Feedback / session rows | `feedback-inner`, `afb-enter/leave`, `abtn-enter/leave`, `asession`, `empty-logo`, `ws-pill-row`, `ws-mascot` |
| Dropped | internal-testing badge (`internal-build-tag`, `internal-build-fab`, "Internal testing only"), "Copied ✓", the About row "The running app's version and build time" (now "The running app's version"), `chat-loading`/`chat-loading-text`, the TaskOutput hint text |

## Decisions taken with the user (2026-09-17, before any porting)

1. **Port the in-app browser.** Decided against the recommendation to skip it, with the
   instruction to port it **using the `webdiff` walk as the arbiter**: port each surface, then
   let the walk's page-source pair (`upstream/…html` + `.classes.json`) and the report decide
   whether it matches, exactly as the skill's step 2–3 prescribe. Recorded consequence: the
   browser's server side (`desktop_browser` MCP, `kimi.browser/1.0.0`) exists only in the
   private code-app repo, so the ported surface will render upstream's own
   "The in-app browser is unavailable" / "Browser reference plugin is missing" states in the
   absence of that plugin. That is upstream's own behaviour without the plugin, and it is what
   the walk can compare.
2. **Port the whole refresh** — every family in the menu below, not a subset.
3. **Adopt upstream's mascot**: the wordmark + face treatment (`wi-face`, `wi-eyes`, `wordmark`,
   `mascot-peek`) replaces the fork's Rive landing doodle and sidebar mascot. This supersedes
   the fork's 0.39-era doodle-theming decision for the landing surface.

## Verdicts

Verdict column is filled as each item lands; the walk's report is the evidence for every one.

| # | Item | Verdict | Evidence / files |
|---|---|---|---|
| 1 | In-app browser — tab strip, address bar, landing | NOT APPLICABLE | Not in the web bundle: the desktop shell owns it (see the note below). The protocol actions are posed in the mock so the reachable forms render. |
| 2 | In-app browser — downloads | NOT APPLICABLE | Same. `browser.get_downloads` is posed as a tool call; neither app has a downloads view. |
| 3 | In-app browser — history | NOT APPLICABLE | Same. `browser.get_history` is posed as a tool call. |
| 4 | In-app browser — settings | NOT APPLICABLE | Same. |
| 5 | In-app browser — device emulation toolbar | NOT APPLICABLE | Same. `browser.get_device_profiles` is posed as a tool call. |
| 6 | In-app browser — page annotation + element capture | PORTED | The web half only: reference pill, tip, read-only dialog and capture validation — `lib/browserReference.ts`, `BrowserReferenceDialog.vue`. The interactive picker and screenshot upload are the shell's (`pX`, still injected-only). |
| 7 | In-app browser — tool card + approval prompt | PORTED | `tool-calls/BrowserTool.vue` + `lib/browserTool.ts` (new), `toolRegistry.ts`, `lib/toolMeta.ts`, `icons/kimi/browser.svg`, `ApprovalCard.vue` + both approval builders, 38 actions × 4 phases in both locales |
| 8 | In-app browser — mention pills and tooltips | PORTED | `components/chat/MentionMenu.vue`, `MentionText.vue`, `MentionTip.vue`, `BrowserReferenceDialog.vue` + `BrowserReferenceDialogHost.vue`, `lib/browserReference.ts`, `useMentionMenu.ts` (browser group), `useBrowserReferences.ts` |
| 9 | Right-panel tab strip refresh | PORTED | `PanelTabs.vue` (title/status/favicon, context menu, drag reorder), `usePanelTabReorder.ts`, `lib/panelTabs.ts`, `useRightPanel.ts`, `App.vue` toggle |
| 10 | Swarm card rewrite | PORTED | `tool-calls/SwarmTool.vue`, `lib/swarmCardRows.ts` |
| 11 | Agent-group card | PORTED | `tool-calls/AgentTool.vue` |
| 12 | Background-task card + todo row | PORTED | `tool-calls/BackgroundTaskTool.vue` (new), `lib/backgroundTaskParse.ts` (new), `TodoTool.vue`, `toolRegistry.ts` |
| 13 | Edit-diff rows | PORTED | `tool-calls/EditTool.vue` (path head, add/del counts, trailing-slash dir label) |
| 14 | Mascot / wordmark rework | PORTED | `chat/Wordmark.vue` + `chat/MascotPeek.vue` (new), `ConversationPane.vue`; `EmptyDoodle.vue`, `k3_doodle1.riv`, `rive.wasm`, `@rive-app/canvas` removed |
| 15 | Composer button family + key caps | PORTED | `ui/CardButton.vue` (new), used by `QuestionCard.vue` + `ApprovalCard.vue`; `ui/Kbd.vue` button variant |
| 16 | Primitives additions | PORTED | `ui/Input.vue` (`xs`, embedded), `Textarea.vue` (`sm`, autosize), `SegmentedControl.vue` (disabled), `EmptyState.vue` (`lg`), `IconButton.vue` (pressed) |
| 17a | Markdown / code scrolling | PORTED | `useMarkdownScrollDecor.ts` + `lib/codeScrollDecor.ts` (new), `Markdown.vue`, `MarkdownCodeBlock.vue`; masks + metrics as tokens in `style.css` |
| 17b | Markdown Code/Preview toggle | SKIPPED | Upstream's `markdown-preview-*` needs a segmented control teleported into every markdown block's header plus a nested markdown render inside a code block — a circular import between `Markdown.vue` and `MarkdownCodeBlock.vue`, and an anchor the fork's markstream build does not expose. Own round. |
| 18 | Question pane rework | PORTED | `QuestionCard.vue` (`qh-ic`, `qpane`, multi-select glyph), `ApprovalCard.vue` (`adot`, `apane`) |
| 19a | Dropped — internal-testing badge, About hint | PORTED | `App.vue` (badge + CSS + import), `InternalBuildBanner.vue` removed, `lib/desktopFlag.ts` (`isDesktop` export), `app.internalBuildBanner` dropped from both locales, `settings.appVersionHint` reworded to upstream's "The running app's version" |
| 19b | Dropped — `chat-loading` hint | SKIPPED | The fork still prints its loading line while a transcript loads (`ChatPane.vue`). Upstream's removal is not observable in a capture (the state is transient), so the fork keeps it and the allowlist carries it. |
| 20 | Tool-row internals (`tl-lead`, `tl-body-content`, tool panel) | PORTED | `ToolRow.vue`, `tool-calls/ToolPanel.vue` (new), then every tool card (`GenericTool`, `EditTool`, `TodoTool`, `AgentTool`, `GoalTool`, `WaitForTool`, `BackgroundTaskTool`, `BrowserTool`, `AskUserTool`, `SwarmTool`) |
| 21 | Thinking row (`think-ic`) | PORTED | `ThinkingBlock.vue` |
| 22 | Mock poses the browser surface | PORTED | `webdiff/mock-server.mjs`: four `mcp__desktop_browser__run` calls in both the snapshot and the transcript frames, a fourth session row with a pending browser approval, and a composer snapshot carrying a reference + capture + screenshot; `MOCK_BROWSER=0` restores the previous bytes exactly |
| 23 | In-app browser — panel tab kind | PORTED | `lib/panelTabs.ts` browser kind, `useRightPanel.openBrowser`, `PanelTabs.vue` presentation, `RightPanelPane.vue` pane (renders upstream's own "The in-app browser is unavailable") |

**What the browser really is (recorded so a future round does not repeat the hunt).** The
address bar, new-tab landing, downloads, history, settings and device-emulation toolbar are
**not in the web bundle at all** — they belong to the desktop shell, which shares the same
translated string table. The web bundle contains only the tool card, the approval block, the
reference pills/tip/dialog, the mention rows and the panel tab kind; everything else was
confirmed absent by grepping the bundle for the panel-tab store's constructor (no
`browserPersistence`, no `onTabRemoved`, no `onBrowserSuspended`) and its browser API
(`addSessionBrowserTab`, `updateBrowserTabFavicon`, `browserTabOwner` — never called by web
code). Rows 1–6 above are therefore **NOT APPLICABLE**: there is nothing in this repository to
port. The protocol actions behind them are posed in the mock so the reachable forms render.

## Verification

- Reference root refreshed and verified in the same turn as every walk: web 0.43.1 @
  `d9d1f5980`, 524 files byte-identical to `upstream/main`'s tree.
- Step-0 baseline (desktop/dark/en): **blocker 84**, warning 782.
- After the port batches (same combo, rebuilt fork): **blocker 35**, warning 766 — the
  tool-row family closed the text blockers and cut the missing-element count from 62 to 10 per
  surface.
- The walk's own scene list grew this round (`webdiff/surfaces.mjs`): `behaviour-subagent-transcript`,
  `behaviour-dock-pane-bash`, `behaviour-goal-panel`, `behaviour-panel-*` and `behaviour-settings-pane`
  are new, and the controls they click are upstream's own markers (`.ag-card`, `.cbtn--primary`,
  `.right-panel-toggle`, `.ar-head`). Every requirement they carry is upstream's, none was relaxed.
  A single-combo re-walk on that harness is what exposed the second batch of divergences below.
- Second batch, ported after the single-combo re-walk: the landing's workspace chip row
  (`ws-pill-row`, moved above the composer; `empty-logo`, `mascot-peek`, `g.eyes`), the dock's
  state modifiers (`has-approval`, `has-question`) and its compact pill row, the panel resize
  handle's `rh` / `rh-bar`, the question card's Enter/Escape caps (new `enter` icon) with the
  Other row's own number, and the browser reference pill's upstream class family
  (`quote-pill browser-reference-pill` + `data-browser-ref-*`) — which also fixed a real defect:
  `MentionText` handed the whole `kimi-code-composer://browser-references/<refId>` destination to
  `resolve`/`open`, which key on the bare refId, so the tip showed no capture and clicking the pill
  opened nothing.
- Gauntlet on the final source: `vue-tsc` clean, kimi-web **1094 tests / 58 files** pass,
  `check:style` at its **44 baseline with zero findings on lines this round added**, heap-capped
  build green, `pnpm install` lockfile settled after the Rive removal.
- Full matrix + close-out gate: **`OK (web port 0.43.1)`, exit 0** — `summary.blocker = 0`,
  warning 10782, suppressed 165; `walk=true` with desktop+mobile, en+zh, dark+light;
  981 captured surface page-source pairs; 25 verdict rows all accounted. The run is
  `.tmp/wd0431/final`, built from sixteen single-app walks through `.tmp/wd0431/matrix.sh`.

### How the blocker count moved

| Run | Blockers | What it showed |
|---|---|---|
| Baseline on the refreshed root (desktop/dark/en) | 84 | the pre-port fork |
| After the port batches (same combo) | 35 | tool-row family closed the text blockers |
| Full matrix on that build | 42 | all mobile: the tool panel had no Copy control, the mobile add sheet had no `am-entry` boxes, and the shadow-root scrollbar decorations |
| After both ports and the scrollbar entries | 8 | one scene: `mobile-dark-zh::walk-settings-click-01-button-example-test-model` — the model-sheet stale-discovery family the 0.43 round recorded, whose scene slug changed with the control's label |
| After widening that entry's glob | **0** | gate passes |

## Findings the second walk produced, and what each one is

| Finding | Disposition |
|---|---|
| `browser-reference-pill` / `quote-pill-*` (every scene) | Ported: the pill renders upstream's class family and resolves its refId. |
| `BUTTON.ag-card.clickable` (every scene) | Allowlisted. Upstream reads the subagent's `agent_id` off the tool frame; the fork's wire types carry no such field, so its card is a button only while a live task matches. Closing it is a wire change. |
| `DIV.md-code-edges` (the copy scenes) | Allowlisted. The fork's code scroller lives inside markstream's shadow root, so the overlay cannot appear in the light DOM; the behaviour is ported. |
| `DIV.align-center.chat-dock.has-approval`, `has-question` | Ported. |
| `DIV.align-center.chat-dock.pills-compact` | Allowlisted. Upstream hides the pills' labels once its own row stops fitting; the fork keeps them labelled at every width and compacts on a phone only. The trigger is a width measure inside the minified bundle; a wrap-based rule measured on the fork fires on the wrong scenes (12 of 30 in one probe, 6 in the next), and hiding a label also moves the harness's own dock clicks off their target. |
| `DIV.panel-resize.rh` / `SPAN.rh-bar` | Ported. |
| `SPAN.cbtn-cap*` on the question card, `SPAN.qopt-key` on the Other row | Ported. |
| `BUTTON.ui-icon-button.ui-icon-button--sm` (the mobile combos) | Ported: the tool panel's head now carries upstream's Copy control. Upstream puts one in every `tp-head`; the fork had none, which showed up as a shortfall only where its own panel buttons were hidden (the mobile combos, where the right panel is closed). |
| `SPAN.cbtn-cap-key` / `cbtn-cap--combo` on the approval card | Allowlisted, scene-scoped: the fork's approval card binds number keys (1/2/3/4, pre-dating this round) and prints them in the cap, upstream prints the glyphs for its own bindings. |
| `SPAN.wi-face` / `wi-eyes` / `wi-eye*` | Allowlisted: upstream 0.43.1 draws an animated face while the agent works; the fork's design system reserves the moon spinner for that state. |
| `behaviour-subagent-transcript`'s container set (`div.chat`, `activity-run.open`, `ar-*`, `sending-placeholder`, `section.agent-prompt` and its wrap/text) | Allowlisted, scene-scoped, recorded as an open item below. |

## Not closed, and known

- **The agent card's open control** needs an `agent_id` on the tool frame before the fork's card
  can be a button whenever upstream's is (allowlisted above). A wire change, not a web one.
- **The subagent pane's container**: upstream renders a subagent's transcript in the same
  container as the main conversation and always heads it with the prompt bubble; the fork keeps
  upstream's prompt markup but resolves the prompt from the spawning `Agent` tool call, which is
  gone when the row is reached by agent id (allowlisted, scene-scoped, above). Two pieces of work:
  reuse the chat container in the pane, and fall back to the subagent's own transcript's first
  user message for the prompt.
- **Working indicator**: upstream 0.43.1 replaced the waiting mark with an animated face; the
  fork's design system reserves the moon spinner for that state (allowlisted above). A product
  decision, not a port slip — say so if the face is wanted instead.
- **The dock's compact pill row**: upstream drops the pills' labels when its row stops fitting;
  the fork keeps them labelled (allowlisted above). Porting it needs upstream's own width
  trigger, which its minified bundle does not expose.
- **Markdown Code/Preview toggle** (row 17b) and the **`chat-loading` hint** (row 19b) stay
  skipped for the reasons in the verdict table.
- **Dead assets**: `src/assets/rive/kimi_avatar_default.riv` and `rive_fallback.wasm` were already
  unreferenced before this round; left in place rather than deleted unasked.
- **Design-system view**: §03 does not yet list `CardButton` (or the new `enter` icon) among the
  primitives.

## Follow-up: dock pills and code blocks, aligned against the bundle (2026-09-18)

Reported by the user after living with the round: the composer's dock pills and the transcript's
code blocks still looked different from the upstream bundle served on the mock port. Both were
measured the same way the round measures everything — the same mock scene captured in both apps,
comparing each element's box and its computed-style fingerprint (border radius, background,
shadow, font size, colour, borders).

| Element | Property | Upstream | Fork before | Fork now |
|---|---|---|---|---|
| dock pill | height / radius / fill | 31px / 10px / rgba(255,255,255,.05) | 40px / 12px / .08 | matched |
| dock pill | glyph | 18px | 24px (1.5em) | matched |
| running chip | colour / gap | text colour / 6px | muted / 4px | matched |
| count chip | figures | proportional | tabular | matched |
| code block | radius / surface / shadow | 16px / #292929 / none | 8px / #121212 / 0 1px 3px | matched |
| code header | surface / font / corners | 41 41 41 @90% / 16px / 16px | matched / 16px / 8px | matched |
| code action button | radius | 8px | 4px | matched |
| scrollbar thumb | height / radius / fill | 4px / 10px / 40% white | 4px / 10px / 40% | matched |
| edge fade | corners | bottom 16px | bottom 8px | matched |

The code block's tokens had to be bound **on the container**, not at `:root` or on the renderer:
the markstream package defines the same token names itself, on that element, and its stylesheet
lands after the app's — so the app's bindings were ignored and the block rendered at the package's
own defaults (14px header, 4px action radius). The container also carries an inline
`background-color: var(--markstream-code-fallback-bg, var(--code-bg))`, so its surface had to be
changed through `--code-bg` rather than by a `background` rule.

Still open, and named in the commit:

- **The code body renders at 13px where upstream renders 12px**, and the block is 61px shorter.
  The package sets that size inside its own tree; a light-DOM rule at higher specificity and an
  injected shadow rule both left the measured value at 13px, so the next step is to find which
  rule inside the package's tree wins and to compare the code area's padding line by line
  (`--markdown-code-padding-inline/-bottom` upstream against the fork's `--code-pad-block`).
- A cross-midnight capture makes a relative timestamp ("Yesterday 23:56") differ between the two
  apps and lands as a `missing-text` blocker on every settings scene. The run that produced the
  numbers above was captured on both sides of midnight and shows 24 blockers of which 22 are that
  timestamp; the same run before midnight shows 2.

## Gate

The matrix is sixteen single-app walks (breakpoint × theme × locale × app) through
`.tmp/wd0431/matrix.sh`, merged into one run dir and checked:

```
POOL=2 bash .tmp/wd0431/matrix.sh                 # writes .tmp/wd0431/matrix/parts/*/
node .tmp/par/merge.mjs .tmp/wd0431/final .tmp/wd0431/matrix/parts/*/
node scripts/check-web-port-closeout.mjs --version 0.43.1 --run .tmp/wd0431/final
```
