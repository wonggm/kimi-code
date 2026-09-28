# Web port — `ba41d0781` (#4005), the 2.1.0-era bundle

Round opened 2026-09-28 as part of the 2.1.1 rebase. **Nothing ported yet.**

## Scope

- Base before the round: `2e605b10b` (#3934, the 2.0.2-era bundle).
- Bundle in: `ba41d0781` (#4005), the only `sync web dist` commit in the range.
- Reference root: `.tmp/upstream-web`, refreshed from `upstream/main` in the same turn and verified **byte-identical** to the committed `apps/kimi-code/dist-web` (524 files both sides, `git hash-object` per file, zero diff).
- Previous bundle extracted to `.tmp/upstream-web-prev` for the comparison.

**The changeset is a single collapsed line — there is no written spec:**

> `web: Improved interactions and fixed known bugs.`

So the menu below is derived from the bundles themselves, the technique the 0.42/0.43 and 0.43.1 rounds established. Working inventory: `.tmp/wd-b4005/inventory.txt`, produced by `.tmp/wd-b4005/bundle-inventory.mjs` (which globs its entry assets rather than hardcoding hashed names — the 0.43.1 round's `.tmp/bundle-diff.mjs` rotted the moment the hash changed).

Raw counts: **17 new UI strings, 104 new class names, 72 dropped, 14 strings dropped.** Most of the class-name delta is noise (`data-v-*` scope hashes, Tailwind-shaped tokens like `right-an` / `top-mt`, minified fragments); the rows below are the ones verified present in the current bundle and absent from the previous one.

## Revamp verdict

**Incremental-plus, not a revamp.** For scale: the previous round (`2e605b10b`) measured 192 new class names, 18 new components and two new component families and was judged a revamp; the 0.43.1 round measured 196 new strings. This round is 104 classes / 17 strings, and the classes resolve to a handful of contained feature clusters plus **one genuinely new component family (cron)**. No layout/UX rewrite words appear in the 2.1.0 changelog.

## Porting menu

| # | Item | Bundle evidence | Verdict |
|---|------|-----------------|---------|
| 1 | **Cron / scheduled-reminders UI** — new component family | 9 classes `cron-{job,list,args,fields,desc,meta,note,fire,notice}`; i18n namespace `conversation.cron.*` (`coalesced`, `finalDelivery`, `fired`, `missed`, `missedCount`, `oneShot`); strings `Delete Cron Job`, `Missed scheduled reminders`, `calendar-schedule` | |
| 2 | Markdown table interactivity — copy / scrolling / actions / expanded | `md-table-copy` (10 hits), `md-table-actions`, `md-table-scrolling`, `markdown-table-sources`, `table-expanded`; dropped `md-table-at-end`, `md-table-fade` | |
| 3 | Step timing + LLM timing on cold-folded steps | `step-timing`, `llm-timing`, `st-{body,car,head,label,row,sum}`; matches upstream #3938 | |
| 4 | Bash card changes | `bash-boxes`, `bash-out-nowrap`, `bash-cmd` | |
| 5 | Composer command tokens | `composer-command-token`, `composer-sr-only`, `data-command-name` | |
| 6 | File context menu | `file-context-menu` | |
| 7 | `sw-*` state classes — **component not yet identified** | new `sw-area sw-edges sw-err sw-go sw-go-off sw-go-open sw-spin sw-wrap` + states `sw-err` / `sw-paused`; dropped `sw-members sw-act sw-ic sw-saved sw-saved-car` | |
| 8 | Membership/upgrade banner reworded | `upgrade-banner{,-cta,-icon,-text}` **removed** (9 → 0); new string `Your current plan doesn't include Kimi models. Upgrade to a membership to unlock the full Kimi Code experience.` replaces the dropped `Upgrade to a membership to use Kimi models and see plan usage` | |
| 9 | History rendering | `history-fully-rendered`, `render-all-history`, `window-history` | |
| 10 | Accessibility | `aria-description` | |

Item 7 cannot be resolved from class names alone — it needs the rendered DOM, so it blocks on a walk or a targeted capture.

## Carried over from the previous round (still unported)

The `2e605b10b` round (#3859 + #3934) was **skipped by the user on 2026-09-21** and its items are still unported. It is the same web lineage, so this round's baseline walk will surface those differences too. Its recorded findings live in `PLANS/web-port-2e605b10b.md`; the notable ones are the run-summary tail (upstream counts browser actions separately), the browser sources pill, the providers heading, two telemetry strings, the About version tag, the Lab session-list toggle, and two scene gaps that fail on the *upstream* capture rather than on the fork.

## Not yet done for this round

- Step 0 revamp guard: the full `webdiff` matrix walk (desktop + mobile, en + zh, dark + light) against a freshly built fork dist. Not run.
- Step 0b: focused upstream screenshots + `INDEX.md` for the user to review. Not produced.
- Close-out gate: `node scripts/check-web-port-closeout.mjs --version ba41d0781` — will fail until this table has a verdict in every row and a full-matrix run exists.
