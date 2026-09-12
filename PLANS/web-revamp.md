# web revamp — un-blurbed UI overhaul

Discovered 2026-09-10 by the step-0 whole-UI check (`webdiff`, run `.tmp/webdiff-revamp2`, 8 combos, walk with hover+click). Evidence copied to `PLANS/web-revamp-shots/` so it survives a `.tmp` wipe.

**Why the blurb-based menu missed it.** No changeset describes this work. It arrived in a bundle sync before `913a24228`, so every per-blurb round of 0.41 re-implemented details on top of an architecture nobody ported. The previous bundle already renders `New Session`, `SESSIONS` and `Not signed in`, and the fork's last completed round was 0.39 — so it landed in the 0.39→0.41 window.

**Decision (user, 2026-09-10): keep the fork web app and port the revamp as one coherent unit; full architecture port, re-expressed in the fork's tokens and glass, keeping every fork-only feature.**

## What upstream has that the fork does not

Walk inventory: upstream opened **36** distinct surfaces, the fork **26**; 20 exist only upstream.

### Sidebar (structure read from `upstream-desktop-dark-en-main.png` + its captured `main.html`)

```
div.sidebar-actions
  button.btn-new-chat        → "New Session" + ui-kbd Ctrl/Shift/O
  button.search              → "Search" + ui-kbd Ctrl/K
div.session-list-panel
  div.sessions-head
    span.side-section-title  → "sessions"
    div.side-section-actions
      button.side-section-toggle [aria=Collapse all workspaces]
      button.side-section-toggle.side-section-view [aria=List options]
  div.sessions > div.ws-drop-target > div.group
    div.gh (workspace group header)
      span.gh-name              → workspace name
      div.gh-actions
        button.gh-more  [aria=Options]
        button.gh-add   [aria=New session in this workspace]
    div.group-sessions > div.se > div.row
      span.lead / div.left > span.t  → session title
      span.act (hover-revealed actions)
        button.pin-btn      [aria=Pin]
        button.archive-btn  [aria=Archive]
        span.ts             → relative time
div.side-footer
  div.side-footer-account > button.user-menu-trigger > span.user-menu-name → "Not signed in"
  button.side-footer-settings [aria=Settings]
```

Fork today: a kebab menu on the row instead of inline hover actions; no session-list panel header with collapse-all / list-options; no per-workspace header actions; no account footer (it has a `Settings` row); no keyboard hints.

### Other surfaces

- **Transcript**: a `Latest messages` jump pill; a message action row (reply, copy) with a timestamp under the user bubble.
- **Composer** (upstream): `+`, attach, a context ring before the model pill, model pill, send. Fork has more: a `Manual` permission pill, a token counter, five circular shortcut buttons above the composer.
- **Code blocks**: language label, drag handle, wrap, copy. The fork has label, wrap, copy, preview triangle — close already.
- **Permission modes**: upstream `Always Ask` / `Ask When Needed` / `Never Ask`; fork still `Manual` / `Auto` / `YOLO` (`en/status.ts`, `zh/status.ts`).
- **Mobile**: upstream's composer is the desktop single row; the fork has an avatar tile and an `idle · mock-workspace · 1 sessions` status line (fork-only), and its settings sheet is not reached by the current scene attempts.

## Port slices

**A. Sidebar architecture** (this slice first): actions block with keyboard hints; session-list panel header with collapse-all and list-options; per-workspace group header with options/add-session; inline hover pin/archive on session rows; account footer row with settings. Keep the fork's workspace grouping, Open/Done tabs, pin/archive semantics and kebab behaviour working.

**B. Transcript and composer**: `Latest messages` jump pill; message action row with timestamp and copy; composer composition (attach control, context ring) while keeping the fork's permission pill, token counter and shortcut row; code-block header polish.

**C. Renames and small fixes**: permission-mode labels in both locales; `mention-tab-complete` keeps the menu open; slash-menu skill pill; multi-skill activation; task-notification copy; `file-preview-stale-refresh`; `connecting-splash-stages`.

**D. Feature blocks**: selection quote/comment family (10 blurbs), Plugins settings panel, tower mode (`/tower` + add-menu row, flag default off).

## Acceptance for every slice

`webdiff` walk (both viewports, both locales, both themes) with zero blockers on the touched surfaces and the new surfaces present in both apps where behaviour should match; screenshots reviewed by eye against `PLANS/web-revamp-shots/`; `vue-tsc`, kimi-web vitest, `check:style` baseline, heap-capped build — all run sequentially by the orchestrator, never in a parallel subagent.

## Known coverage gaps

- **Resolved 2026-09-11 — the cause was the tool, not the apps.** The `settings` scene used to fail everywhere because the runner fired its click immediately after the page load event, before Vue had rendered the shell; a manual click with a 3 s pause opened the dialog every time. `openSurface` now waits for the app to settle before running any step. With that fix, Settings opens for **both** apps on desktop (upstream 27→56 text lines, fork 29→60).
- Still open: the **mobile** Settings route. Neither app reaches it through the current attempt list (the fork hides it in its mobile sheet, upstream behind a header control), so a mobile run reports the settings phase as a gap.
- Controls revealed only on hover were invisible to discovery, so the walk never reached them (the section-head actions are the notable case). Discovery now keeps them, flagged, and the walk hovers before acting.
- Earlier evidence in this file was gathered with the buggy tool. The upstream-only **labels** came from discovery, which ran after the app had booted and is therefore sound; the per-control "produced a surface" attribution needs the re-run to be trusted.
- **Still open — controls hidden with `display: none`.** Discovery keeps controls hidden by opacity/visibility (they still occupy a box, so the walk can hover then click), but an element with `display: none` has no box and cannot be reached by coordinates. The fork's message action row (`Undo edit`, `Copy` under a message) is exactly this case: it is in the DOM but only rendered on message hover, so the walk never reaches it while upstream's equivalent does. Covering it needs a pre-pass that hovers container candidates (message rows, headers) before discovery. Until then, do not read "no Copy/Undo edit finding for the fork" as "the fork lacks them" — the source has both.

## Progress

**Slice A — sidebar: DONE and verified (2026-09-11).** `vue-tsc` clean · vitest 1010/1010 · `check:style` 54 findings in baseline mode · heap-capped build green · `webdiff` (desktop+mobile, dark, en, walk) with `notOpened` empty for both apps. The fork now exposes, and the walk reaches: `New Session` with its `Ctrl+Shift+O` hint, `Search Ctrl+K`, the `SESSIONS` head with `Collapse all workspaces` and `List options`, per-workspace `Options` and `New session in this workspace`, inline `Pin` (+ archive + the retained kebab), and the account footer row. Hover-revealed row actions match upstream's behaviour (title truncates, timestamp yields to the actions); the fork's extra kebab is intentional.

**Slice B — transcript and composer: DONE, verified with caveats (2026-09-11).** Same gauntlet green. `Open right panel` and `Show line numbers` now present in both apps; the wrap control reads `Enable word wrap` / `Disable word wrap` depending on state (the fork's code blocks default to wrapping, upstream's do not — a state difference, not a missing label). The `fix-task-notification-order` change folds a background-task notice into the open assistant run's ordered blocks instead of appending a trailing turn — verified by the test suite, not by the walk (the mock does not emit a mid-run notice). The composer gained an explicit attach control; a reviewer should confirm that is wanted, since upstream's `+` button also carries the attach glyph.

**Slices C and D — pending.** C: permission-mode copy is already done (labels now `Always Ask` / `Ask When Needed` / `Never Ask` in both locales), plus `mention-tab-complete`, task-notification copy, `file-preview-stale-refresh`, `connecting-splash-stages`; still open: `slash-menu-skill-pill`, multi-skill activation, `stale-steer-echoes`, `steer-turn-diff-gating`, `agent-card-background-indicator`, `bash-task-panel-terminal`, the turn-file stats pair. D: the selection quote/comment family (built — `SelectionQuoteBubble.vue` + `useSelectionQuote.ts`, mounted in the message, file-preview, diff and terminal surfaces; the two quote-*pill* blurbs are not applicable because the fork's composer is a plain textarea with no pill node), the Plugins settings panel, and tower mode.

## Alignment pass (2026-09-11) — how to reproduce and what is left

**The user compares two live previews:** upstream at `http://127.0.0.1:5399/#token=mock-token` (mock rooted at `.tmp/upstream-web-new`) and the fork at `http://127.0.0.1:5400/` (mock rooted at `apps/kimi-code/dist-web`). Their own server on `:58627` serves the same `dist-web`. Start either with:
`MOCK_ROOT=<dist> MOCK_PORT=<port> node apps/kimi-web/webdiff/mock-server.mjs`.

**Measurement tool:** `apps/kimi-web/webdiff/measure-alignment.mjs` (drives headless Chrome, seeds boot keys, prints tokens + the composer and code-block style chains for both apps, and rewrites `PLANS/web-revamp-refs/{upstream,fork}-composer.html`, `-codeblock.html` and `surface-and-composer-styles.json`). **Seed `kimi-web.liquid-glass` as `'false'`** — the app writes `'true'`/`'false'` and reads anything else as ON, so `'0'` measures the glassed card and misleads.

**Aligned and served** (fork now equals upstream, all measured): `--color-bg #121212`, `--color-sidebar-bg #0d0d0d` (sidebar darker than main), `--color-surface #1f1f1f`, `--color-surface-raised #292929`, `--color-text rgba(255,255,255,.84)`, `--color-accent #1a88ff`, `--color-line rgba(255,255,255,.12)`, composer card `#1f1f1f` / 32px / border `.12` / shadow `0 5px 16px -4px rgba(0,0,0,.07)`, code-block surface `#121212` with 8px radius and `.12` border, code-block header `#1f1f1f` with `8 8 0 0`, padding `4 6 4 12`, gap 16, 35px tall. Roughly twenty new dark-theme tokens were added (`--color-composer-bg`, `--color-menu-bg`, `--color-menu-bg-frost`, `--color-user-bubble-bg`, `--color-send-bg{,-hover,-disabled}`, `--color-inline-code-bg`, `--color-surface-overlay`, `--color-diff-{add,del}-bg`, `--color-topbar-bg-frost`, `--color-text-{strong,on-accent,on-scrim}`).

**The user's four open requirements (2026-09-11, verbatim intent):**
1. "font size in message box is too small now (what i'm typing), should match settings size" — **done**: `.ph` and `.ph-overlay` in `Composer.vue` are back on `var(--ui-font-size)`. Note this makes the card ~2px taller than upstream's, which is the accepted trade-off.
2. "models menu drop down not aligned" — measure upstream's model menu (open it, read its rect + padding + row metrics) and match.
3. "there's a glass texture for the drop downs of the composer, have that ported too" — upstream's menus carry a frost surface (`--color-menu-bg-frost: color-mix(in srgb, #121212 70%, transparent)`, `--color-menu-bg: rgba(41,41,41,.95)`); port that texture to the composer's dropdowns independent of the fork's liquid-glass toggle.
4. "figure out how to align all the six differ items" — the six are listed below.

**The six remaining differences (from the alignment pass):**
1. **No per-language logo** in the code-block header (upstream shows a Python/Shell/HTML badge, `.code-header-main` = a 16×16 coloured SVG + `.code-header-copy`). Upstream's header HTML is in `PLANS/web-revamp-refs/upstream-codeblock.html` — the user says to copy from page source, so the SVG markup can be lifted from there.
2. **The permission pill has no leading glyph** — upstream renders `.perm-pill-icon`; needs an entry in `src/lib/icons.ts`.
3. **The send button does not grey out on an empty input** — upstream paints it with `--color-send-bg-disabled`; the fork guards empty submits in JS instead. Behaviour change, not styling.
4. **Light theme untouched** — the reference was captured in dark; the ~20 added tokens exist in dark blocks only, so a light-mode component referencing one gets an unset `var()`.
5. **Cosmetic residue**: composer card 112px vs upstream 110px tall (the font decision above), code header 720 vs 718 wide, composer placeholder is a slate grey where upstream uses white at 26%.
6. **`views/DesignSystemView.vue` §04 is stale** — it still documents the composer card as `--radius-xl` / 16px; it is the canonical spec and must be updated to 32px and the new metrics.

**Contract to keep:** `vue-tsc` clean · 1010/1010 vitest · `check:style` 54 findings in baseline mode · heap-capped build green · then `node apps/kimi-code/scripts/copy-web-assets.mjs` and a hard refresh in the browser. Heavy commands run one at a time, never while a subagent is editing.

## Alignment pass 2 — status (2026-09-11, late)

All four of the user's follow-ups are answered; verified and served (typecheck clean, 1010/1010, `check:style` 54 baseline, build green, copied to `dist-web`).

1. **Composer font** — reverted to `var(--ui-font-size)` in `.ph` and `.ph-overlay`, i.e. the user's configured size. `Composer.vue` carries the reason; the ~2px card-height delta versus upstream is the accepted cost.
2. **Model dropdown alignment** — fixed in `positionModelDropdown()`: the menu is now centred on `.model-pill` (found via `bar.querySelector`, no new template ref) with a 14px gap above. Measured after: menu centre 1063 vs pill centre 1062.5 (was 48px right), gap 14px (was 11).
3. **Dropdown glass** — ported as the menus' *normal* surface, independent of the fork's liquid-glass flag: `.model-dropdown` and `.perm-dropdown` use `var(--color-menu-bg)` + `backdrop-filter: blur(24px) saturate(1.8)`, `.add-menu` uses `var(--color-menu-bg-frost)`, all three with upstream's shadow `0 6px 18px rgba(0,0,0,.2), 0 3px 9px rgba(0,0,0,.24)` and padding `4px` / `6px 12px`. Measured after: fork matches upstream exactly on all three.
4. **The six differences** — (a) language logo: **done**, `MarkdownCodeBlock.vue` now renders a 16×16 per-language mark; 27 marks lifted byte-for-byte from the upstream bundle (`.tmp/upstream-web-new/assets/index-HU0LCM-X.js`, object `rbe`/aliases `lbe`), the extended 29-language set and `csharp` fall back to the shell mark. (b) permission-pill glyph: **done** — the pill reuses `permInfo.icon` from the same `PERM_MODES` table as its dropdown, so glyph and menu agree. (c) send disabled state: **done** — `canSubmit` drives `:disabled`, empty input paints `--color-send-bg-disabled`, sending keeps `--color-send-bg` (upstream does the same). (d) light theme: **done** — 14 light values added for the previously dark-only tokens, keeping the fork's blue-grey light character (upstream's light values were deliberately not adopted). (e) cosmetic residue: the 2px card height is accepted (see item 1); the code-header 2px and the placeholder colour remain. (f) `DesignSystemView.vue` §04: **done** — prose, the `--radius-xl` usage row and the `.p-composer` mock now describe the shipped 32px card.

**Left over, small and known:** a `prefers-reduced-transparency` guard for the new ungated menu blur (agent-31's suggestion; the fork's glass system collapses under that query but the new declarations do not); the mobile bottom-sheet menus were not measured; with liquid glass ON the shared glass rules outrank the new disabled-send paint; and the extended 29-language icon set is not included.
