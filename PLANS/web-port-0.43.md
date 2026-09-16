# Web port — 0.42/0.43 round

Porting menu for the three bundle syncs that landed inside the 0.43.1 rebase. Built 2026-09-16 from the changeset blurbs in the sync commits themselves — **never** from `upstream/main`'s tree, where a released changeset is already deleted.

Range: `29e187591` (last recorded sync) → `upstream/main` (`5653c739b`).

| sync | PR | blurbs |
| --- | --- | --- |
| `e6bc8b8ad` | #3671 | 8 |
| `dd6a4116d` | #3763 | 12 |
| `26a284192` | #3792 | **0 — no changesets in the commit** |

The third sync is the odd one: a new bundle with no written spec. `26a284192` needs either the holistic `webdiff` walk (step 0) to say what actually moved, or an explicit decision to treat it as nothing to port. Do not assume it is empty.

**Coverage sweep of the whole range (2026-09-16).** The per-sync reading above was checked against every changeset added between `29e187591` (the last recorded sync) and `upstream/main`, filtered to bodies beginning `web:`: **86 changesets added, 21 of them web**. Twenty are the sync commits' own. The twenty-first — `auto-session-title-ga.md` from commit `6126472c7` (#3749, "graduate AI session titles from experimental") — never sat inside a sync commit and is row 21 below. Read the range this way on the next round too: `git log <lastSync>..upstream/main --diff-filter=A --format='%h %s' --name-status -- .changeset/` then keep the `web:` bodies.

## Verdict table

One row per blurb. Verdicts are filled in as the round proceeds; the close-out gate (`scripts/check-web-port-closeout.mjs --version 0.43`) fails while any row is empty.

| # | sync | blurb | fork-side note | verdict |
| --- | --- | --- | --- | --- |
| 1 | #3671 | conversation scrollbar too thin to click and drag | fork has `useMenuScrollbar.ts` + its own scroll styling | NOT APPLICABLE — upstream widened its own custom 4px `.panes` scrollbar to 8px with a transparent border; the fork's transcript scroller carries no scrollbar CSS at all and uses the platform scrollbar, so there is nothing thin to fix |
| 2 | #3671 | background task notifications lingering at the bottom during later tool calls | | SKIPPED — the notice card's 30 `ntn-*` rules are byte-identical between the two bundles apart from the scope id, and the only change nearby is the virtualised list the fork replaced; the fork's own placement keeps chronological order |
| 3 | #3671 | page jank from hundreds of simultaneous requests when reloading a session with many background tasks | fork's lazy task output may already cover this | PORTED (partial) — the session-load backfill fanned out one request per task at once; now bounded to 4 in flight in `useTaskPoller.ts`, applied to the poll too. Upstream's exact shape (fetch running tasks only, load output on row open) needs a per-row loader the fork lacks |
| 4 | #3671 | reduce jank opening and scrolling back through long conversations, preserving expansion state | **collides** with the fork's turn-eviction machinery in `ChatPane.vue` | ALREADY PRESENT — upstream's answer is its own virtualised window (`history-window`/`history-row`/`history-space`, `overflow-anchor: none`); the fork's eviction (`IntersectionObserver` unmount + height-lock remount) covers the same ground. Its one new element is the nav pair, tracked as S1 |
| 5 | #3671 | permanently delete a session from the row context menu, with confirmation | `SessionRow.vue` already has a context menu and an inline delete-confirm; backend `:delete` exists since the rebase | PORTED — `client.deleteSession` + `useWorkspaceState.deleteSession` + a danger confirm in `App.vue` + the kebab/context item and a toast; `:delete` already existed server-side |
| 6 | #3671 | skills created mid-session appear in the slash list | fork's `lib/slashCommands.ts` is its own list | PORTED — upstream added a second `loadSkillsForSession` call in its turn-end teardown; the fork now refreshes the session's skills there too (one call per turn, no effect on an open `/` menu) |
| 7 | #3671 | trailing backticks flashing while a code block streams | fork renders through markstream (`MarkdownCodeBlock.vue`, `lib/inlineCodeMath.ts`) | SKIPPED (blocked on a dependency bump the user approved) — the flash is inside `stream-markdown-parser` 1.1.7; the fix landed in 1.2.7, reached via `markstream-vue` >= 1.1.5. Nothing in the fork's own code causes it |
| 8 | #3671 | reorderable media rail in the composer, mention on demand, keep previews after send | **collides** with the fork's composer (glass, `+` add-menu, permission pill) | PORTED — new `MediaRail.vue`/`MediaThumb.vue`, drag reorder with edge auto-scroll and Alt+Arrow, mention/remove tools, and the rail kept in the bubble and the queued row |
| 9 | #3763 | user agreement + privacy policy entries in Settings → About | fork's settings tabs are its own set, incl. a `plugins` tab | PORTED — an Agreements section on the About page with the two links the bundle carries |
| 10 | #3763 | sessions with many brackets or backslashes getting stuck loading | fork patches linkify/math boundaries (`lib/linkifyCjkBoundary.ts`) | PORTED — `findFilePathLinks` scanned the whole text with an ambiguous pattern: 744 ms on 20 k brackets, 1.41 s on 40 k. Replaced with upstream's cheap token pre-scan + sticky regex: 0.6 ms and 0.3 ms |
| 11 | #3763 | persistent UI stuttering while streaming in long sessions | **collides** — same machinery as #4 | SKIPPED — see #12; the fork's own scanners were measured flat and its streaming path hands no partial fence to the renderer |
| 12 | #3763 | formulas, links, tool results and log contents causing stutter | **collides** — same machinery as #4; fork keeps KaTeX | SKIPPED (partial) — the "links … log contents" half was the quadratic scan fixed under #10; every other fork-side scanner (`tokenizeMentions`, `protectInlineCodeDollars`, `markdownRenderPlan`, `splitTrailingCjk`) measures flat on adversarial input, and what remains upstream lives inside the markstream bundle, not in source |
| 13 | #3763 | send button staying disabled when starting a new session | fork's draft/send path is its own (`useKimiWebClient.ts`) | SKIPPED — no defect found: the fork has no chat-gate/verdict; the button is gated by `canSubmit` plus `starting`, whose every writer clears it in a try/finally, and the fork's `canSubmit` does not treat a non-ready attachment as blocking (which is the upstream failure mode) |
| 14 | #3763 | previous sessions wrongly marked unread after starting a new conversation | | SKIPPED — could not locate the change: `markUnread`/`clearUnread` are unchanged between the bundles and the fork's own path carries the guards; no demonstrable defect |
| 15 | #3763 | render Markdown frontmatter as key-value cards and tag lists | new surface; markstream-based | PORTED — `parseFrontmatterEntries` (hand-rolled, no dependency) + `MarkdownFrontmatter.vue`; 19 tests pass; the raw block is still the fallback |
| 16 | #3763 | drop the Changes entry from the panel new-tab menu while a diff tab is open | fork adopted upstream's panel wholesale (2026-09-13) | PORTED — upstream omits the item (`v-if="!r"`, `r = tabs.some(type === 'diff')`); the fork now does the same |
| 17 | #3763 | Settings restructure: Account after General, Agent → "Agents & Sessions" (now includes message folding), Advanced → About, data & privacy into General | **collides** — fork's tab set/order differs and message folding was permanently rejected | PORTED — order and labels taken from upstream's own rendered DOM; data & privacy moved into General; Agreements on About; the folding section moved to the Agent tab and now carries both rows (the user reversed the rejection) |
| 18 | #3763 | selected segment background flashing and shifting while the control loads | design-system polish | PORTED — upstream deleted the sliding `.ui-seg__indicator` and paints the selected item's raised surface + shadow directly |
| 19 | #3763 | switch thumb deforming at both ends when stretched on hover | design-system polish | PORTED — the hover stretch is now `width` + a matching `translate` instead of `scaleX`, so the rounded ends hold |
| 20 | #3763 | tooltips popping up even when the mouse has not moved | fork has its own tooltip plumbing | PORTED — upstream triggers on `pointermove` and only when the pointer's coordinates changed; the fork's `mouseenter` trigger now has the same guard, plus the `:focus-visible` gate |
| 21 | `6126472c7` | AI session titles always on; regenerable from the rename field, no flag (#3749) — not in any sync commit | fork has the endpoint + a default-off flag | PORTED — the rebase deleted the engine flag, so the fork's web gating was dead code that never enabled; the gate and the whole `autoSessionTitle` prop chain are gone |
| S1 | *(silent)* | conversation history navigation (prev/next item) — no changeset | fork has no equivalent; treated as part of #4 | PORTED — `TurnNav.vue` pair, invisible until the row has keyboard focus; the jump survives the fork's eviction because the row element is never unmounted, only its content |
| S2 | *(silent)* | plan-usage panel rework (stacked meter + legend + new strings) — no changeset | fork has the older three limit keys | PORTED — stacked meter + legend + upstream's labels; also fixed a latent bug: the fork's usage wire type was the pre-0.43 shape (`summary`/`limits[]`) while the daemon returns `{usages:{limit5h,limit7d,monthTotal}, extraUsage}` |
| — | #3792 | *(no blurbs — needs step-0 evidence or an explicit no-op verdict)* | | NOT APPLICABLE as a separate item — the sync carries no written spec; its bundle delta was read against the pre-round bundle and every difference maps to a row above (S1, S2) or to the media rail. No unexplained surface remains |

## Collision decisions (taken 2026-09-16)

1. **Long-conversation performance (#4, #11, #12) — PORT ON TOP OF THE FORK'S SYSTEM.** Re-implement the three fixes inside the fork's own turn-eviction machinery (`IntersectionObserver` off-screen unmount, height-lock remount, `content-visibility`, `v-memo`, `reconcileTurns`); do not adopt upstream's scroller wholesale. Justified by the bundle: upstream's answer to the same problem is its own virtualised window — `history-window` / `history-row` / `history-space` wrappers with `overflow-anchor: none` (read the rules with `css-rules.mjs`) — which is the ground the fork already covers. The one genuinely new element there is the **prev/next item navigation** (`history-navigation` / `history-previous` / `history-next`, strings `conversation.historyPrevious` = "Previous item", `conversation.historyNext` = "Next item"), which the fork lacks and which is ported.
2. **Settings restructure (#17) — ADOPT EXACTLY.** Tab order and labels taken from upstream's own rendered DOM (captured from the latest bundle): General, Account, Agent & Sessions, Providers, Plugins, About, Lab, Archived Sessions. Data & privacy moves into General; Agreements goes on the About page. **The "now includes message folding" clause:** the fork already rendered the "Message folding" section with the "Tool call summary" toggle — it was sitting in the About panel and now lives in the Agent tab, matching upstream. Upstream's second row there, "Auto-fold messages" (`kimi-web.turn-folding`, default OFF), drives the turn fold — **the user was asked again once the row's real content was known, and reversed the earlier rejection: TurnFold itself is now ported** (`TurnFold.vue` + `lib/turnFold.ts`), together with the row on both the desktop dialog and the mobile sheet.
3. **Composer media rail (#8) — PORT.** A new piece inside the fork's most customised surface (glass material, "+" add-menu, permission pill); integrated rather than restructured.
4. **The spec-less sync (#3792)** — no blurbs exist, so its contents are read from the bundle delta against the previous bundle (`.tmp/wd043/up-prev`): the `web:`-changeset sweep covers the other two syncs, and the two silent surfaces in that delta (the nav pair, the plan-usage rework) are both ported. No unexplained surface remains.
5. **Renderer dependency (for #7) — BUMP.** The trailing-backtick flash is inside `stream-markdown-parser` 1.1.7 (reached through the pinned `markstream-vue` 1.0.9-beta.1); the fix landed in `stream-markdown-parser` 1.2.7, first pinned by `markstream-vue` 1.1.5. The user approved the bump; it is the one part of this round that touches `package.json` and the lockfile.
6. **Plan-usage rework (S2) — PORT.** The user asked for upstream's stacked meter and labels rather than keeping the fork's three limit keys. This turned up a latent bug worth recording: the fork's `WireManagedUsageResult` was still the *pre-0.43* wire shape (`summary` / `limits[]` / `extra_usage`), while the daemon serves `{usages:{limit5h,limit7d,monthTotal}, extraUsage}` (`packages/oauth/src/managed-usage.ts`, `packages/kap-server/src/routes/oauth.ts`), so the panel was reading fields that never arrived. Both types were aligned with the real payload.

## Silent changes found in the bundle delta (no changeset of their own)

The per-sync menu is built from changeset blurbs, so anything the bundle gained without one is invisible to it. Two such surfaces turned up in the delta between `.tmp/wd043/up-prev` and the latest bundle:

- **Conversation history navigation** — see decision 1 above; the `history-*` family plus `conversation.historyPrevious/historyNext`. Treated as part of blurb #4 and ported as `TurnNav.vue`.
- **Plan-usage panel rework** — upstream replaced the fork-ported limit labels with a stacked meter and a legend (`pu-meter-stacked`, `pu-legend`, `pu-legend-item`, `pu-swatch`, `pu-swatch-blue`, `pu-swatch-text`) and changed the strings (`settings.planUsage.segmentUsage` = "{name} usage {pct}%", `boosterLimit`/`monthlyLimit` = "Monthly limit", `boosterTitle`, `boosterBalance`, `monthlyUsed`, `unlimited`, `freeTitle`, `freeHint`, `weekLimit`, `hourLimit`, `resetsIn`, `duration*`). The fork had the older three keys (`genericLimit`, `dayLimit`, `minuteLimit`). Ported per decision 6; upstream's `freeTitle`/`freeHint` (a free-account upsell with a hardcoded membership URL) were left out deliberately — the fork has no upgrade surface and inventing one is out of scope.

## Method notes for this round

- Every captured surface is recorded four ways and read back; the gate refuses a run whose surfaces lack the `<surface>.html` + `<surface>.classes.json` pair.
- The fork's liquid glass is seeded **off** for the fork only, so a glass-only difference never reads as a mismatch.
- Verification stays: page-source + measured values first, screenshots as confirmation, and the close-out gate before the round is called done.

## Round result (close-out, 2026-09-16)

**Gate: `node scripts/check-web-port-closeout.mjs --version 0.43 --run .tmp/wd043/final` → `OK (web port 0.43)`, exit 0.** 24 verdict rows all accounted; `walk=true` with desktop+mobile, en+zh, dark+light; `summary.blocker = 0`; 975 captured surface page-source pairs.

**Gauntlet, in order and all green:** `vue-tsc` clean · kimi-web vitest **1084 passed / 57 files** (was 1047) · `check:style` **44 findings** (the 0.41-era baseline, none added) · heap-capped vite build green in 30 s · `oxlint` 0 errors on every file this round added. Repo-wide `pnpm lint` is red, but only in files this round did not touch — pre-existing debt, checked file by file.

**Evidence kept:** `.tmp/wd043/baseline` (pre-port fork build vs upstream, allowlisted), `.tmp/wd043/final` (post-port, the run the gate reads), and `.tmp/wd043/{raw,raw-baseline}` — the same two runs regenerated with an **empty allowlist**, so the true finding set is readable and every suppression can be checked against it.

### What the comparison actually proved

Comparing the two runs with the allowlist emptied is what separates a real regression from a harness artifact:

- **63 findings the port FIXED** — 36 `settings::missing-text` (the tab renames and the moved data & privacy block), plus the model-picker and session-menu texts. This is the mechanical proof the restructure landed.
- **70 findings the port ADDED, all on the single surface `walk-settings-click-02-button-plan-modeplan-mode`** (69 `missing-text`, 1 `dom-elements`). Diagnosis: the walk discovers the settings phase's controls while the sheet is open, then click-00 is **Close**, which shuts it. Upstream keeps its closed sheet in the DOM, so its later clicks still resolve sheet controls; the fork's sheet is gone once closed, so the same clicks land on whatever is underneath. Both apps clicked the same-named control at the same index (`click-02-button-plan-modeplan-mode`, "Plan modePlan mode"). The sheet itself is intact in this same run: the `settings` base scene carries **every** one of those texts on the fork, checked string by string (Appearance, Language, Model, Permission, 29.3k/122k, Tool call summary, Auto-fold messages).
- **244 findings unchanged**, i.e. present before and after — the standing fork-vs-upstream divergences, already recorded in the allowlist.

### Allowlist changes made this round

- **Deleted seven stale entries** that existed only because TurnFold was unported: the two Auto-fold `missing-text` blockers, two Chinese counterparts, and the three scoped element rules (`SPAN.hint`, `BUTTON.is-on.ui-switch`, `SPAN.ui-switch__thumb`) for that row's toggle. Deleting them is the test: if the port were incomplete, its label or its hint would now land as a `missing-text` blocker. Nothing came back.
- **Added three surface-scoped entries** for the artifact and the pre-existing gaps, each with its evidence in the `reason` field: `*::walk-settings-click-02-button-plan-modeplan-mode::*` (the stale discovery above), `*::walk-settings-click-01-button-modelexample-test-model::*` (same family on the mobile model picker — every id in it is in the pre-port baseline too), and `*::behaviour-panel-tail-tooltip::requirement::tail-tooltip` (the fork raises no tooltip bubble on that scene, identically before and after). Each of the last two was verified **id by id against `.tmp/wd043/raw-baseline`** as pre-existing, not assumed.
- **Added one element rule**, `svg.kw-icon.think-bulb` — the thinking icon the fork does not draw, 44 findings in the baseline and 44 after. The three element rules it replaced were the TurnFold ones above.

### Not closed, and known

- The walk's stale-discovery behaviour is a **harness** defect, not a product one: a phase whose first click closes the surface then clicks into the void. Fixing it (re-discover after a surfacing click) would retire the first allowlist entry above. Recorded here so the next round can decide whether to spend the effort.
- `attachment chip`'s media branch and `MediaTip` are now unreachable — the media rail renders media itself; the dead code was left in place deliberately.
- The served bundle (`apps/kimi-code/dist-web`) is **not** updated by this round yet: `copy-web-assets.mjs` is the user's call, because it changes what their running server serves on the next reload.
