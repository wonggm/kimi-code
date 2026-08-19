# Web UI port menu — upstream 0.37.x bundle syncs

Upstream web features arrive bundle-only (see `PLANS/web-port-0.34.md` header
and the `merge-upstream-kimi` skill). This menu covers two bundle sync commits
pulled by the 2026-08-19 rebase onto upstream `f13f37904`:

- `e31b3a335` — "chore: sync web dist from code-app", code-app `025805b3`,
  released as **0.37.0** — 20 web changesets.
- `5c661f461` — "chore: sync web dist from code-app", code-app `221c548c`,
  released as **0.37.2** — 2 web changesets.

22 blurbs total, verbatim below — the only written spec that exists.
**All 22 verdicts recorded (2026-08-19) — see "Verdicts" at the bottom.**

## Porting menu

### Sync `e31b3a335` (0.37.0)

| Changeset | Verbatim blurb | Area guess |
|---|---|---|
| `composer-mention-pills` | web: @-mentioned files, folders, and skills in chat messages now render as icon pills. | composer + message renderer |
| `dock-subagent-rename` | web: renamed the Subagent panel to "Background Agent". | sidebar / background-agent panel |
| `markdown-frontmatter-meta-block` | web: fixed YAML frontmatter in messages rendering as a giant heading — it now shows as a small meta block. | message renderer |
| `markdown-verbatim-text` | web: fixed plain text like "(c)", "(tm)", and "--" in messages being rewritten as ©, ™, and dashes — message text now renders verbatim. | message renderer |
| `mention-pill-tooltip` | web: hovering a mention pill now shows a detail bubble (full path for files and folders, description plus an open button for skills), skill and file mentions in messages are clickable, long file names middle-ellipsize, and deleted files are struck through. | composer + mention renderer |
| `panel-header-title-overflow` | web: fixed long task panel titles pushing the status badge, copy, and close buttons out of view — titles now ellipsize and show the full text on hover. | background-agent panel |
| `paste-folder-insert-path` | web: fixed pasting a copied folder into the composer failing the upload with a connection error — folders are now skipped instead. | composer + upload |
| `perf-web-animations-power` | web: reduced animation power draw — the mascot and home doodle pause while hidden or scrolled offscreen, and looping animations play once and stop when the system's "reduce motion" setting is on. | home page + accessibility |
| `plan-feedback-autogrow` | web: the plan review feedback box now auto-grows with its content, so longer rejection reasons are easier to write. | plan review UI |
| `search-workspace-locate` | web: the search dialog now finds workspaces too, and picking a workspace or session result expands the sidebar and scrolls the item into view. | global search dialog |
| `session-media-attachments` | web: fixed sent image and video attachments rendering broken in session history after a refresh or reopen. | session history + media |
| `sidebar-status-tabs` (minor) | web: the sidebar gains Open / Done / Workspaces tabs, and sessions can be marked as done (and reopened) to keep the open list focused. | sidebar (session list) |
| `stopped-empty-reply-timestamp` | web: fixed empty replies left by manually stopped answers still showing a completion time after reloading the page. | message renderer / turn state |
| `subagent-cancel-startup-window` | web: fixed background agent tasks not being cancellable during their first moments after starting. | background-agent panel |
| `subagent-dock-foreground-rows` | web: fixed foreground subagents leaking into the Background Agent panel, which broke the count and left finished rows stuck as running and unstoppable. | background-agent panel |
| `task-panel-copy-menu` | web: merged the task panel's two copy icons into a single button with a dropdown menu (copy command / copy output / copy all), with keyboard and touch-friendly targets. | background-agent panel |
| `task-terminated-status-mapping` | web: fixed cancelled or abnormally ended background tasks showing as completed. | background-agent panel + task state |
| `web-document-title` | web: the browser tab title now shows the current workspace directory name (override with the new `--web-title` flag), making instances on multiple machines easier to tell apart. | shell page + CLI flag |
| `web-session-admin-page` (minor) | web: added a session management page (from the sidebar's list-management menu) for cross-workspace triage — filter by workspace, status, and updated time, and batch mark sessions as done or reopen them. | sidebar (new admin route) |
| `web-session-search-cmd-k` | web: fixed Ctrl+K in the composer opening session search on macOS instead of deleting to end of line — session search now only answers to Cmd+K. | keyboard shortcuts |

### Sync `5c661f461` (0.37.2)

| Changeset | Verbatim blurb | Area guess |
|---|---|---|
| `agent-detail-inspector` | web: the subagent detail panel now keeps the working process fully expanded and drops the end-of-turn timestamp footer. | background-agent detail panel |
| `lab-sidebar-tabs-toggle` | web: Settings gains a Lab tab with a multi-tab sidebar toggle (off by default); when enabled, the sidebar shows the Open / Done / Workspaces tabs. | settings + sidebar (Lab flag, gates `sidebar-status-tabs`) |

## Early collision notes (to refine at triage)

- `dock-subagent-rename` / `subagent-dock-foreground-rows` / `subagent-cancel-startup-window`
  / `task-panel-copy-menu` / `task-terminated-status-mapping` /
  `panel-header-title-overflow` / `agent-detail-inspector` all touch the
  dock/subagent panel area — collides with our `SubagentGrid.vue` port and the
  `AgentDetailPanel.vue` bound-model chain (features 8/16). Verify our bound
  model display survives any panel rework.
- `composer-mention-pills` / `mention-pill-tooltip` touch the composer and
  message renderer — collides with our `.lg-glass` MentionMenu and the KaTeX
  pipeline in `Markdown.vue`.
- `sidebar-status-tabs` + `lab-sidebar-tabs-toggle` + `web-session-admin-page`
  are a three-part feature (tabs, settings gate, admin page) — port as one
  unit; collides with our pinned/grouped sidebar (`useSidebarLayout.ts`,
  `SessionRow.vue` pin UI).
- `web-document-title`: the `--web-title` CLI flag + `/meta` side is engine
  code the rebase already pulled; only the page-title consumer needs a port.
- `perf-web-animations-power`: the fork has no mascot/home doodle — check
  whether anything in our tree animates before attempting a port; likely
  NOT APPLICABLE.

## Engine-side items from the same range (no port needed, rebase pulled them)

- `5ae82cd5b` — tower feature disabled by default behind experimental flag
  `tower` (`KIMI_CODE_EXPERIMENTAL_TOWER=1`). User decision 2026-08-19: keep
  upstream's default-off. Our tower-worker `[subagent_models]` pin wiring is
  intact and applies whenever the flag is enabled.
- `8440801de` — new `WaitFor` tool registered in profiles/permissions.
- `b478e95a2` — duplicate scoped DI registrations now throw.
- `95cede82b` — legacy `videoResolverService.ts` deleted.
- `3ded08084` — `TurnEndedEvent` gains optional `time` + `interruptReason`.
- `eaa3969dd` — kap-server v2 sessions: page mode, `updated_before`, batch
  archive/restore.
- `8267bb8fc` — kap-server workspace `fs:suggest` file completion.

## Verdicts (2026-08-19, accounting gate — every blurb has a verdict)

User decisions taken up front: sidebar tabs keep our flat/grouped toggle
(inside the Open/Done tabs); document-title behavior adopted from upstream
(with the fork's session-title suffix kept); "Background Agent" rename
adopted; cancelled tasks get a distinct state (not folded into failed).

### Sync `e31b3a335` (0.37.0)

| Changeset | Verdict | Evidence / files |
|---|---|---|
| `composer-mention-pills` | PORTED | `src/lib/mentionTokens.ts`, `components/chat/MentionText.vue` (user-bubble pills), `Composer.vue`, `MentionMenu.vue`, `useMentionMenu.ts`; tests `mention-tokens.test.ts` + `mention-menu.test.ts` |
| `dock-subagent-rename` | PORTED | `i18n/locales/{en,zh}/tasks.ts` — "Sub Agent" → "Background Agent"; pixel references re-baselined for the wider dock pill |
| `markdown-frontmatter-meta-block` | PORTED | `src/lib/frontmatter.ts` + `Markdown.vue` frontmatter segment; `test/markdown-frontmatter.test.ts` |
| `markdown-verbatim-text` | PORTED | `Markdown.vue` — `registerMarkdownPlugin((md) => md.set({ typographer: false }))`; tests in `test/lib-logic.test.ts` |
| `mention-pill-tooltip` | PORTED | `components/chat/MentionTip.vue` (detail bubble; skill open button works where a resolver exists — follow-up deferred), strike-through for deleted absolute paths, middle-ellipsis names |
| `panel-header-title-overflow` | PORTED | `components/ui/PanelHeader.vue` — title `flex: 1 1 auto` + ellipsis + tooltip |
| `paste-folder-insert-path` | PORTED | `composables/useAttachmentUpload.ts` — pasted folders split off as folder mentions instead of failing the upload |
| `perf-web-animations-power` | NOT APPLICABLE | the fork has no mascot/home doodle; reduced-motion is already uniform (`style.css:1149` global kill + MoonSpinner pause) |
| `plan-feedback-autogrow` | PORTED | `ApprovalCard.vue` — `autosizeFeedback()` (composer pattern) + re-expand on reopen, 11rem cap |
| `search-workspace-locate` | PORTED | `SearchSessionsDialog.vue` workspace hits (kind: 'session' \| 'workspace') + `Sidebar.vue` expand + `scrollIntoView` via `data-wsid` anchors |
| `session-media-attachments` | ALREADY PRESENT | `mappers.ts:161-170` (image/video round-trip incl. `kind: 'file'`), `messagesToTurns.ts:771-786,849-916` (attachment projection), `ChatPane.vue` `AuthMedia`/`AttachmentChip`. Caveat: upstream's newer `sessionMedia` image-source kind is unmapped (future shape, not this blurb) |
| `sidebar-status-tabs` | PORTED | `Sidebar.vue` Open/Done/Workspaces tab strip; Done = archived sessions (paginated fetch, restore); pinned section above tabs; flat/grouped toggle inside Open/Done (user decision) |
| `stopped-empty-reply-timestamp` | PORTED | `ChatPane.vue` — `.a-msg-ft` footer now requires a non-empty final text (dropped the `|| createdAt` clause) |
| `subagent-cancel-startup-window` | ALREADY PRESENT | `SubagentGrid.vue` Stop button is gated only on `state === 'run'` with the id from `taskCreated` — cancellable from the first moment |
| `subagent-dock-foreground-rows` | ALREADY PRESENT + HARDENED | `ConversationPane.vue:241` has filtered the dock list to `runInBackground` subagents since the grid port; the same exclusion was added inside `lib/subagentFilter.ts` (+ test) as defense in depth |
| `task-panel-copy-menu` | PORTED | `TasksPane.vue` single copy trigger + `Menu` (copy command / output / all), `lib/taskCopy.ts` payload composer, `test/task-copy.test.ts` |
| `task-terminated-status-mapping` | PORTED | distinct `cancel` task state (user decision): `types.ts` `TaskState`, `useKimiWebClient.ts` `toUiTask` mapping, muted styling in `TasksPane.vue`/`SubagentGrid.vue`, `stateCancelled` i18n, filter tests |
| `web-document-title` | PORTED | `composables/usePageTitle.ts` `composePageTitle` — `web_title` (`GET /meta`, one-off fetch since `WireMeta` strips it) > workspace dir · session title > `Kimi Code Web`; engine side (`--web-title` → `web_title`) was pulled by the rebase |
| `web-session-admin-page` | PORTED | `views/SessionAdminView.vue` (filters, pagination, batch mark-done/reopen), `admin.*` i18n en+zh, `client.setSessionsArchivedBatch` (per-id settle — `/api/v1` has no batch route), sidebar kebab entry (Lab-gated), `test/session-admin.test.ts` |
| `web-session-search-cmd-k` | PORTED | `Sidebar.vue` `matchSearchShortcut`/`isAppleShortcutPlatform` — Cmd-K only on Apple platforms; Ctrl-K deletes to end of line elsewhere |

### Sync `5c661f461` (0.37.2)

| Changeset | Verdict | Evidence / files |
|---|---|---|
| `agent-detail-inspector` | PORTED (fold half) / NOT APPLICABLE (footer half) | `AgentDetailPanel.vue` — fold machinery (`expandedGroups`, thresholds, `.ap-fold`) removed, working process renders fully expanded; our panel never had an end-of-turn timestamp footer |
| `lab-sidebar-tabs-toggle` | PORTED | `lib/storage.ts` `labSidebarTabs` (default off) + `SettingsDialog.vue` Lab tab Switch + `useWorkspaceState.ts` done-session fetch plumbing; `test/workspace-state.test.ts` +13 |

### Deferred follow-ups — ALL RESOLVED 2026-08-19 (same day, user requested)

- ~~MentionTip skill "Open" button needs a resolver prop follow-up~~ — DONE:
  `AppSkill` gained `path: string` (the wire descriptor always had it), both
  `listSkills*` mappers pass it through, ChatPane gets a `skills` prop +
  stable `resolveSkillMention` and feeds MentionText, ConversationPane passes
  `:skills` to ChatPane; BenchView/slash-menu fixtures updated.
- ~~Done-tab rows reuse `SessionRow`, whose kebab still says "Archive" while
  acting as reopen~~ — DONE: `SessionRow` `archived?: boolean` prop; the kebab
  item becomes non-danger `undo` icon + existing `sidebar.reopen` label when
  archived (both Done-tab call sites pass `:archived="true"`). Mobile twin
  checked — open-sessions only, unchanged.
- ~~Agent D's lab-flag/done-list state lives in `useWorkspaceState` but is not
  re-exported through `useKimiWebClient`~~ — DONE: `labSidebarTabs`,
  `setLabSidebarTabs`, `doneSessions`, `doneSessionsLoading`,
  `doneSessionsHasMore`, `ensureDoneSessions` re-exported; App.vue consumes
  `client.*` instead of reading storage directly (same module-scoped ref, so
  reactivity is unchanged).
- ~~`usePageTitle` fetches `/api/v1/meta` raw because `WireMeta` lacks
  `web_title`~~ — DONE: `WireMeta.web_title?` + `getMeta()` maps it to
  `webTitle: string | null` on `KimiWebApi`; `usePageTitle` uses the typed
  getter (precedence unchanged); +2 getMeta tests in `daemon-client.test.ts`.
