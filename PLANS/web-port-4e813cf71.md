# Web port — sync `4e813cf71` (opened 2026-09-18)

Round for the bundle sync `4e813cf71` ("chore: sync web dist from code-app" #3859,
code-app `3f3f3b2e5`), the only sync since the 0.43.1 round's pinned `d9d1f5980`.

- Range: `git log d9d1f5980..upstream/main` → 9 commits, one of them the sync.
- Bundle under test: **web 0.43.1 @ `4e813cf71`**, extracted into `.tmp/upstream-web` and
  verified file-by-file against `upstream/main`'s `apps/kimi-code/dist-web` in the same turn.
- Bundle the fork is ported to: **web 0.43.1 @ `d9d1f5980`**, extracted for the diff at
  `.tmp/wd0432/prev`.
- Fork reference: `apps/kimi-web`, unbuilt at the time of writing (see "Gate").

## Why the menu is derived, not listed

The sync carries no changeset (`git show --name-only 4e813cf71 | grep changeset` is empty) and no
`web:` blurb was added anywhere in the range, so the menu comes from the two bundles themselves:
UI strings and CSS class inventory compared between `.tmp/wd0432/prev` and `.tmp/upstream-web`.
Raw inventory: `.tmp/wd0432/inventory.txt`.

Signals: **9 new UI strings** (9 dropped), **6 new CSS class names** (3 dropped). The added
strings are all minified-context noise from renamed identifiers; the class inventory is the
reliable signal, so each row below is anchored on a class or a named function.

## Menu

| # | Upstream change (bundle evidence) | Verdict |
|---|---|---|
| 1 | Panel launcher is built from a shared kind-order list `const wJ=["diff","browser","term","btw"]`; the web launcher renders `wJ.filter(l=>l==="diff"\|\|l==="btw")`, the shell renders all four (`__name:"PanelLauncher"`) | |
| 2 | `ViewToggles` (`.ch-toggles`) replaces the empty state's `.empty-panel-btn`: it holds the right-panel toggle (`.ch-panel`) and, in the shell, a `.ch-terminal` toggle — the hide rule becomes `.ch-toggles:not(:has(.ch-terminal))`. The focus helper's fallback list drops `.empty-panel-btn` | |
| 3 | Side chat loses its own loading row (`sc-loading` gone from the JS) and passes `working: sending\|\|running` to the shared transcript; the rule hiding the transcript's `.sending-line` inside `.sc-body` is dropped | |
| 4 | Sidebar label-fade states added: `.se.has-badge:hover .t { --sb-fade:0px }` and `.gh.menu-open .gh-name { --sb-fade:64px }` | |
| 5 | `.working-indicator.idle .wi-eye,.wi-eyes { animation:none }` — the waiting mascot's idle frame | |
| 6 | The legacy plain-text subagent-result markers (`"[summary]"`, `"subagent error: "`, `next_step`) are gone; only the XML form (`<summary>`, `<resume_hint>`, `<subagent …>`) remains | |

## Pre-port reading (evidence gathered before the port; not verdicts)

1. **Launcher** — the fork's `PanelTabs.vue` hardcodes two `MenuItem` rows (Changes, Side chat), so
   its rendered web surface already matches what upstream's web filter produces. Upstream's change
   moves the same two entries onto a shared list. Nothing user-visible follows from porting it,
   except that a future shared list is the natural home for the fork's own `term`/`browser` kinds.
2. **ViewToggles** — the fork still carries `.empty-panel-btn` (`ConversationPane.vue:1737`, styled
   at `:2362`). Both bundles hide this control in the browser app on a non-mobile viewport
   (`display:none` under `.app:not(.mobile)`), so the row is a desktop-shell parity item, not a
   visible one for the fork.
3. **Side chat** — the fork still renders `.sc-loading` and still hides `.sending-line`
   (`SideChatPanel.vue:137`, `:229`, `:256`); this row is visible and is the one real UI port here.
4. **Sidebar fades** — the fork has no `--sb-fade` token; its sidebar masks are the pinned-section
   `--pinned-fade-*` gradients (`Sidebar.vue:2218`). The row needs the token to be introduced.
5. **Mascot idle** — belongs to the waiting-face family (`wi-face`/`wi-eyes`) the fork replaces with
   its reserved moon spinner, and which the 0.43.1 round allowlisted. Expect ALREADY COVERED.
6. **Result markers** — the fork's `lib/parseSwarmResult.ts` already parses the XML form
   (`<summary>`, `<resume_hint>`, `<agent_swarm_result>`) and carries no legacy plain-text marker,
   so this row is expected ALREADY PRESENT. The dropped parser was upstream's own fallback.

**The question this round was opened for** — whether the upstream right panel's four entries
(Changes / Browser / Terminal / Side Chat, with shortcut chips) are ported-able — is answered by
row 1: `wJ` lists all four, and the web bundle filters the list to two on purpose. The four-entry
form is the desktop shell's; the shortcut chips (`openDiffTab`, `newTerminalTab`, `toggleTerminal`,
`toggleSideChat`) appear in the bundle only inside the en/zh string tables — two occurrences each,
no binding and no handler — while web-wired actions such as `toggleSidebar` appear four times. So
neither the entries nor their hotkeys exist in upstream's web UI to port.

## Gate

Not run yet. The 16-part matrix (`.tmp/wd0431/matrix.sh`) plus
`node scripts/check-web-port-closeout.mjs --version 4e813cf71 --run <dir>` close the round; the
host had under 2 GB free at the time of writing, which is below the build floor, so the walk waits
for a quiet machine.
