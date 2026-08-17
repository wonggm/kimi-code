# Web UI port menu — upstream 0.36.1 bundle sync

Upstream web features arrive bundle-only (see `PLANS/web-port-0.34.md` header
and the `merge-upstream-kimi` skill). This menu covers the bundle sync commit
`cd489955b` ("chore: sync web dist from code-app", #2922, code-app `af7ed8fa`,
2026-08-14) — 26 changesets, the only written spec that exists — plus the
`--web-title` CLI flag (#2989, `09976b091`). Pulled by the 0.36.1 rebase
(2026-08-17); nothing here is implemented in our tree yet unless marked.

**No user triage decision yet for these 26 items.** The 0.34-era menu was
audited item-by-item on 2026-08-17 (results at the bottom).

## Collision table (26 changesets)

| Changeset | Upstream blurb (spec) | Collides with | Risk |
|---|---|---|---|
| `fix-inline-code-math` | `$` inside inline code spans misrendered as inline math | **Our KaTeX** (`Markdown.vue`) — take the fix, keep our renderer | HIGH |
| `composer-work-mode-pill` | Mode menu → mutually exclusive plan/goal pills left of input; Swarm becomes a separate toolbar toggle | **Our Composer glass** (`.model-pill`/`.mode-pill`/`.perm-pill` lg-glass, teleported modes-menu) | HIGH |
| `plan-armed-intent` | Plan mode arms a removable pill, activates on send | Same Composer rework | HIGH |
| `goal-menu-arms-pill` | `/goal` arms a removable goal pill; send creates the goal | Same Composer rework | HIGH |
| `slash-command-fuzzy-search` | Fuzzy search by description text, pinyin, pinyin initials | **Our SlashMenu** (lg-glass + our `/reload` `/add-dir` entries must stay in the list) | HIGH |
| `subagent-card-grid` | Subagent panel → card grid + status filter, in-progress/recent by default | **Our `AgentDetailPanel.vue`** `displayModel` chain (feature 8) | HIGH |
| `autocomplete-menus-restyle` | Slash + @-mention menus: bold matched fragments, scroll fade, draggable floating scrollbar | Our lg-glass on SlashMenu/MentionMenu | MEDIUM |
| `composer-menu-close-on-blur` | Slash panel stays open after session switch / composer blur | Bugfix — want it; verify against our teleported menus | MEDIUM |
| `dock-work-pills-restyle` | Borderless rounded work pills above composer | **Our lg-glass dock chips** (`ChatDock.vue` + style.css capsule override) | MEDIUM |
| `todo-panel-frosted-restyle` | Todo panel as frosted cards + completion count | Frosted = their glass; restyle only, count is additive | MEDIUM |
| `bash-panel-polish` | Bash panel: status filter + click task → command/output on right | Additive features, restyle collides with our dock panel glass | MEDIUM |
| `goal-panel-restyle` | Goal text + elapsed time to header, actions → icon buttons | Restyle only | MEDIUM |
| `plan-panel-view` (minor) | Plan viewer panel: click plan entry in work bar → full plan, review results, feedback | Additive panel; needs dock/work-bar integration | MEDIUM |
| `fix-secondary-model-effort-flyout` | Thinking-effort flyout unreachable for last model in subagent model list | **Our `ModelEffortSelect.vue`** (feature 16) — check if our component has the same bug | MEDIUM |
| `sidebar-pr-chip-refresh` | PR badge not refreshing after PR created from session | Bugfix in sidebar row | MEDIUM |
| `sidebar-pr-tag-style` | PR badge → small tag with background | Restyle, must survive our SessionRow/pinned work | MEDIUM |
| `sidebar-session-status-ordering` | Unify session status display, stabilize list ordering | Ordering logic — must not fight our pinned/grouped layout | MEDIUM |
| `workspace-recency-sort` | "Sort by recent activity" option in workspace-grouped view; new workspaces sort to top | **Our `WorkspaceGroup.vue`/`useSidebarLayout.ts` grouping** | MEDIUM |
| `web-auto-session-title` | Experimental auto session titles + on-demand regeneration from list | Coexists with our emoji titles/rename block | MEDIUM |
| `user-menu-density` | Larger font/row height in user menu + plan usage flyout | We already ported plan usage (`AccountPlanUsage.vue`) — apply density there | LOW |
| `user-menu-upgrade-copy` | "Upgrade" → "Upgrade membership"; plan usage % labelled as used | Copy/i18n only | LOW |
| `assistant-reply-message-time` | Timestamp under assistant replies shows message time, not work duration | Small render change in turn footer | LOW |
| `session-export-feedback` | Top-center confirmation toast after export; clearer too-large error | Toast — additive (our `.lg-glass` Toast) | LOW |
| `timeout-error-wording` | Request timeouts misreported as "cannot connect to the Kimi server" | Error-message mapping; check our `api/errors.ts` | LOW |
| `linkify-cjk-boundary` | CJK after a bare URL swallowed into the link | Linkify boundary fix in Markdown pipeline | LOW |
| `fork-long-session-timeout` | Forking very long sessions always times out | Says "web:" but likely a client timeout value — verify whether the real fix is server-side (then the rebase already pulled it) | LOW |

Also: #2989 `--web-title` + `/meta` is an engine/CLI feature the rebase already
pulled; check whether the web side (page title from `/meta`) needs a port.

## 0.34-menu coverage audit (2026-08-17, item-by-item code verification)

Already implemented (verified in tree):

- Cancelled-marker fix (`91a5c80be`), skill-command attachments (`7c156f4eb`).
- Retry attempt counter — projector + reducer + working-status i18n.
- Subagent thinking-level display — `AgentDetailPanel.vue` shows
  `type (model, effort)`; wire carries `thinking_effort` end to end.
- Rename block bundle — emoji titles + IME-safe rename + non-drag, desktop + mobile.
- Pinned sessions — wire → mapper → client → `SessionRow`/`Sidebar` pinned section + mobile.
- Flat/grouped sidebar toggle — `useSidebarLayout.ts`, desktop.
- Plan usage panel — `AccountPlanUsage.vue`, desktop + mobile settings.

Partial / follow-ups:

- **Failure card + resume** — card, projection, and resume path exist; MISSING
  the meta line `<error code> · HTTP <status> · <request id>`. The codes map
  (`eventReducer.ts`) and request-id plumbing (`api/errors.ts`,
  `useKimiWebClient.ts warningDetail`) exist — local plumbing only.
- **Changed-files card** — `ChangedFilesCard.vue` shows the path list; MISSING
  per-file `+A −D` and the aggregate-that-hides-when-incomplete. `gitDiffStats`
  plumbing exists for the `~/diff` tab but is not surfaced in the dock card.
- **Flat sidebar on mobile** — `MobileSwitcherSheet.vue` does not consume
  `sidebarViewMode`; toggle is desktop-only.
- **Rive avatar rolled back** — `RiveAvatar.vue` was added (`eead6715c`) then
  deleted (`8846006cf`, moon working indicator kept). The `.riv`/`.wasm` assets
  and `@rive-app/canvas` dep are dead weight: re-implement (old component at
  `git show 8846006cf^:apps/kimi-web/src/components/ui/RiveAvatar.vue`) or drop
  them. kap-server already serves the MIME types and CSP for them.
- **`DesignSystemView.vue` stale type docs** — `--font-ui` is Schibsted Grotesk
  first at runtime (`fonts.css` loads after `style.css`); the view still
  documents Inter first.
