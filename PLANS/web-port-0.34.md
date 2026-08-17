# Web UI port campaign — upstream 0.33/0.34 bundle-only features

Upstream moved web development to the private `code-app` repo (PR #2599); web
features ship only as a minified `dist-web` bundle + changeset blurbs. This fork
keeps its in-tree `apps/kimi-web`, so every web feature must be re-implemented.
Specs below were recovered from the upstream bundle's `DesignSystemView` (a
written design spec) + changeset blurbs + i18n strings. See the
`merge-upstream-kimi` skill, section "Upstream web features are bundle-only".

User decision (2026-08-10): port ALL confirmed features; the visual overhaul is
cherry-pick-only after a side-by-side preview. Skip font-scale boot migration
(the fork already uses the same `kimi-web.ui-font-size` key — nothing to migrate).

Reference bundle extracted at `.tmp/upstream-web/apps/kimi-code/dist-web/`
(gitignored). DesignSystemView asset: `assets/DesignSystemView-*.js`.

## Done

- **Cancelled-marker fix** — commit `91a5c80be`. `SessionRow.vue` +
  `MobileSwitcherSheet.vue`: danger marker only for `lastTurnReason === 'failed'`.
- **Skill-command attachments** — commit `7c156f4eb`. Threads optional
  `attachments?` through `App.vue handleCommand` →
  `startSessionAndActivateSkill`/`activateSkill` → `useModelProviderState` →
  `KimiWebApi.activateSkill` → kap-server `:activate` (already accepts them).

## Remaining — specs

### Retry attempt counter (frontend-only; backend already emits fields)
Backend emits `attempt` + `maxAttempts` on `turn.step.retrying`
(`packages/protocol/src/events.ts:679`). Working-status line shows
**"Retrying (attempt {n} of {max})…"** (upstream i18n: `重试（第 {n}/{max} 次）…`).
Merge into the fork's coalesced streaming path in
`src/api/daemon/agentEventProjector.ts` (`turn.step.retrying` case ~line 1055)
and the working-status surface. i18n key needs `{n}`/`{max}` params, en + zh.

### Failure card + one-click resume
Persistent card when a model request fails and interrupts a turn. Upstream
classes: `tf-main` / `tf-title` / `tf-sub` / `tf-meta` + a secondary `Resume`
(继续) button. Structure:
- title: "Model request failed, this turn has been interrupted"
- sub: the error message (e.g. "429 The engine is currently overloaded…")
- meta: `<error code> · HTTP <status> · <request id>` (e.g.
  `provider.rate_limit · HTTP 429 · req_01KZ8Y…`)
- action: one-click resume of the turn.
Must survive the fork's `content-visibility` turn perf rules (`is-streaming`
exemption in `ChatPane.vue`). Stays in the session after the failure.

### Changed-files summary card (`TurnFilesSummary.vue`) — additive, fork has none
Between a settled turn's final text and its footer, a §03 `Card` (hairline
border, no shadow) lists every file the turn's Edit/Write calls touched.
Per-file data shape (from DesignSystemView demo):
`{ path, added, removed, hasWrite, statsIncomplete, diff }`.
- Head: "N files changed" + aggregate `+A −D` + mini diffbar.
- Aggregate HIDES when any row's stats are incomplete (a Write or underivable
  edit makes the total a lower bound — never presented as exact).
- Each row: one clickable workspace-relative path (absolute if outside cwd) with
  per-file `+A −D` at the right edge.
Data source: aggregate the turn's Edit/Write tool calls. Needs the fork's
turn/tool-call data to expose per-file add/remove counts.

### Subagent thinking-level display
Upstream shows model + thinking effort on subagent tasks; the fork already shows
the model (`AgentDetailPanel.vue`, `swarmGroups.ts`). Add the effort field.
Verify the 0.34.0 backend emits subagent thinking effort on the spawn/roster
events before wiring (`SubagentSpawnedEvent` / rest snapshot).

### Rename block bundle (one coordinated rewrite, NOT three patches)
Emoji session titles + IME-safe rename + rename text-selection fix. All land in
the `SessionRow.vue` rename block (~lines 117-204: `renaming` input + title
display) and the mobile twin `MobileSwitcherSheet.vue`. Already diverged there
(kebab menu, cancelled-marker). Backend needs an emoji field on the session if
titles carry one — check the snapshot/session wire schema.

### Sidebar: pinned sessions, then flat/grouped toggle
Must coexist with `WorkspaceGroup.vue` / `useSidebarLayout.ts` grouping and the
liquid-glass sidebar frost, on desktop + mobile (`MobileSwitcherSheet.vue`).
Pinned: pin state + "Pinned" section + re-sort. Flat view: a flat renderer
beside the grouped one + a toggle. Backend: check for a pin endpoint/field.

### Plan usage panel (Settings → account tab)
"Show the signed-in account and plan usage." Rebuild inside the fork's
customized `SettingsDialog.vue` + mobile `MobileSettingsSheet.vue`. Verify the
backend exposes a plan-usage endpoint in 0.34.0 first (likely an auth/account
route); add web types + client method if present.

## Skipped

- Font-scale boot migration (no-op for this fork — same storage key already).
- Visual overhaul (Rive animations, Schibsted Grotesk / Noto Sans SC):
  cherry-pick pieces only after a side-by-side bundle preview; never wholesale.

## Per-port verification gate

`cd apps/kimi-web && pnpm exec vue-tsc --noEmit` (exit 0) +
`pnpm exec vitest run` (all pass) + `pnpm exec node scripts/check-style.mjs`
(no NEW findings). i18n keys added to BOTH en and zh. No `@moonshot-ai/agent-core`
imports. One commit per port, Conventional style, no agent attribution.
