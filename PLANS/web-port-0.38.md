# Web UI port menu — upstream 0.38-era bundle syncs

Upstream web features arrive bundle-only (see `PLANS/web-port-0.34.md` header
and the `merge-upstream-kimi` skill). This menu covers four bundle sync commits
pulled by the 2026-08-22 rebase onto upstream `d723cc47e`:

- `2c5415f93` — "chore: sync web dist from code-app" (#3135) — 24 web changesets.
- `3090c1c48` — "chore: sync web dist from code-app" (#3152) — 6 web changesets.
- `491ebd050` — "chore: sync web dist from code-app" (#3157) — 15 web changesets.
- `d4e0ad4b2` — "chore: sync web dist from code-app" (#3166) — 1 web changeset.

46 blurbs total, verbatim below — the only written spec that exists.
**All 46 verdicts recorded (2026-08-22) — see "Verdicts" at the bottom.**
User decisions: `/auto` `/yolo` `/thinking` removal ADOPTED; the upstream OAuth
login flow SKIPPED (fork keeps token-paste auth); subagent detail panel upgraded
to the FULL transcript shape (not the minimal option).

## Porting menu

### Sync `2c5415f93` (#3135)

| Changeset | Verbatim blurb | Area guess |
|---|---|---|
| `agent-card-fgbg-badge` | web: Label inline subagent cards in the message stream with their foreground or background mode. | subagent card renderer |
| `copy-server-info` | web: Add copy buttons next to the server version and server address in settings. | settings |
| `fix-empty-workspace-group-legacy-sidebar` | web: Keep empty workspace groups visible in the legacy sidebar after their last session is archived. | sidebar |
| `fix-menu-tooltip-stuck` | web: Hide button hover tooltips outside a menu while the menu is open. | menus / tooltips |
| `fix-model-menu-viewport` | web: Keep the model picker menu on the workspace home within the viewport. | composer menus |
| `fix-search-dialog-workspaces-label` | web: Fix the workspace group title showing untranslated text in the search dialog. | global search dialog + i18n |
| `fix-settings-select-teleport` | web: Fix the settings dialog dropdown list being clipped by the scroll area, and lock the content behind it while the list is open. | settings — likely already covered by our `MenuSelect.vue` Teleport; verify |
| `fix-slash-mention-menu-viewport` | web: Keep the slash command and @ mention panels on the workspace home within the viewport. | composer menus |
| `fix-user-menu-text-select` | web: Prevent text selection in the sidebar user menu and its plan usage submenu. | sidebar menus |
| `grouped-session-list-load` | web: Fix slow session list loading when there are many workspaces. | sidebar perf |
| `login-wake-and-waiting-page` | web: Auto-open the browser authorization page after choosing a login region, redesign the authorization waiting page, and refresh the login state as soon as the window regains focus instead of waiting for the poll. | login flow |
| `mention-menu-fs-suggest` | web: Upgrade the @ mention menu: file and skill candidates are merged and ranked by match quality, file search is faster, with path-fragment matching and hit highlighting. | mention menu + `fs:suggest` (engine route landed upstream `8267bb8fc`) |
| `menu-radius-concentric` | web: Round menu items concentric with their menu frames. | menu styling |
| `pin-session-from-chat-header` | web: Add a Pin action to the chat header more-menu to pin the current session to the sidebar pinned section. | chat header + sidebar pinned section |
| `pinned-section-resize` | web: Allow dragging the divider between the pinned section and the session list to resize both areas, with fade hints at the edges when the pinned section scrolls. | sidebar pinned section |
| `queue-interaction` | web: Improve the prompt queue interaction, with per-row steer and send. | prompt queue |
| `region-login-entries` | web: Add kimi.com and kimi.ai OAuth login entries, and switch update and help links to the site matching the current login. | login flow |
| `remote-session-archive-sync` | web: Remove sessions archived from another client from the session list immediately, without a manual refresh. | sidebar state sync |
| `session-menu-last-active` | web: Label the timestamp at the bottom of the session menu as last active and tighten that row's padding. | session kebab menu |
| `sidebar-action-button-alignment` | web: Fix misaligned action buttons between the sidebar section headers and the session rows. | sidebar |
| `skill-activation-card` | web: Remove the skill-activated card from skill activation messages. | message renderer |
| `skill-turn-undo` | web: Make skill-activation turns undoable so they can be withdrawn and resent. | engine + message renderer |
| `user-menu-density` | web: Tighten the row height and spacing of the account menu and its submenus to match the standard menu density. | sidebar menus |
| `waitfor-tool-card` | web: Give WaitFor tool calls a dedicated quiet-line display showing completed tasks, wait timeouts, and how many tasks are still running. | tool-call renderer (upstream `WaitFor` tool `8440801de`) |

### Sync `3090c1c48` (#3152)

| Changeset | Verbatim blurb | Area guess |
|---|---|---|
| `composer-toolbar-crush-fix` | web: Fix composer toolbar buttons squeezing and overlapping each other in very narrow windows. | composer toolbar |
| `fix-question-card-title-clamp` | web: Fix long question text in question cards being truncated with an ellipsis instead of wrapping. | question card |
| `mobile-shell-ui` | web: Improve mobile UI styling. | mobile shell |
| `model-pill-icon-collapse` | web: Collapse the composer model picker to an icon when space is tight; hovering still shows the model and reasoning effort. | composer model pill |
| `perm-label-flex-shrink` | web: Fix the composer permission mode label being hidden even when there is enough space. | composer perm pill |
| `task-notification-cron-style` | web: Restyle background task notifications as a lighter notice that shows the task summary, output files, and output preview directly. | task notification card |

### Sync `491ebd050` (#3157)

| Changeset | Verbatim blurb | Area guess |
|---|---|---|
| `btw-sidechat-esc-ime` | web: Fix pressing Esc to cancel an IME candidate also closing the BTW side chat. | side chat |
| `btw-sidechat-focus-on-open` | web: Fix the composer not receiving focus after opening the BTW side chat via the shortcut or /btw. | side chat + composer focus |
| `fix-desktop-memory-leaks` | web: Fix memory usage growing steadily after repeatedly switching sessions and toggling the side chat and subagent panels. | composables lifecycle |
| `fix-draft-attachments` | web: Fix unsent composer attachments such as images being lost after switching sessions on the new-session page. | composer draft persistence |
| `login-region-card-titles` | web: Remove the redundant parenthesized domain from the login entry card titles. | login flow |
| `mobile-composer-button-glyphs` | web: Fix the send and stop button icons rendering too small in the mobile composer. | mobile composer |
| `mobile-composer-menu-sheets` | web: Fix the slash-command and @-mention panels failing to open on mobile — both panels and the + menu are now grab-handle bottom sheets on small screens. | mobile composer menus |
| `mobile-model-picker-sheet` | web: Present the mobile model picker as a bottom sheet consistent with the other mobile drawers. | mobile composer |
| `mobile-onboarding-theme-cards` | web: Fix the oversized appearance theme cards in the mobile first-run wizard. | mobile onboarding |
| `mobile-park-custom-provider` | web: Temporarily remove the custom-provider entry from the mobile first-run wizard. | mobile onboarding |
| `mobile-switcher-flat-grouped-tabs` | web: Add a flat/by-workspace tab to the mobile session list — the flat view sorts purely by recency and the grouped view orders each workspace by its latest session. | mobile switcher sheet |
| `mobile-tool-row-touch-height` | web: Fix tool-call rows alternating heights on mobile by unifying them to the compact row height. | mobile tool rows |
| `remove-perm-thinking-slash-commands` | web: Remove the /auto, /yolo, and /thinking slash commands; permission mode and thinking effort remain adjustable from their settings UI. | slash commands — collision check vs fork command set |
| `sidebar-overlay-scrollbar` | web: Fix mismatched left and right margins in the sidebar session list, and show the scrollbar only while hovering or scrolling. | sidebar |
| `usage-flyout-viewport-cap` | web: Fix the reset-time hint in the sidebar usage panel being ellipsized even when there is enough room. | usage panel |

### Sync `d4e0ad4b2` (#3166)

| Changeset | Verbatim blurb | Area guess |
|---|---|---|
| `agent-detail-thinking-collapse` | web: fix thinking blocks in the subagent detail panel being stuck expanded and not collapsible. | subagent detail panel |

## Verdicts (2026-08-22)

37 PORTED · 2 ALREADY PRESENT · 6 NOT APPLICABLE · 1 NOT APPLICABLE (user decision, OAuth trio counted below as 3) — every blurb accounted.

### Sync `2c5415f93` (#3135)

| Changeset | Verdict | Where / evidence |
|---|---|---|
| `agent-card-fgbg-badge` | PORTED | `tool-calls/AgentTool.vue` trailing slot: 前台/后台 Badge via new `resolveAgentTask` provide (`ConversationPane.vue`); dock grid badge intentionally omitted (all dock tasks are background — label would be noise) |
| `copy-server-info` | PORTED | `SettingsDialog.vue` Advanced rows: copy IconButton + copied/check flip 1.5 s + hints; i18n settings.* en+zh |
| `fix-empty-workspace-group-legacy-sidebar` | PORTED | `useWorkspaceState.ts` archiveSession re-inserts an archived stub so derived workspace groups keep their header; `.group-empty` state for real workspaces |
| `fix-menu-tooltip-stuck` | PORTED | new `composables/useMenuOpen.ts` shared open-count; `Tooltip.show()` suppressed while any menu is open; Composer dropdowns tracked via `trackMenuOpen` |
| `fix-model-menu-viewport` | PORTED | `.model-dropdown` positioned by shared `clampMenuPlacement` (`composables/useViewportClamp.ts`, +7 unit tests); refit on open/resize/font-load |
| `fix-search-dialog-workspaces-label` | ALREADY PRESENT | our SearchSessionsDialog renders a flat hit list — the untranslated group title never existed here |
| `fix-settings-select-teleport` | PORTED (half) | teleport half already done by fork's `MenuSelect.vue`; ported the inert lock: dialog body set `inert` while a dropdown is open (`MenuSelect.vue`) |
| `fix-slash-mention-menu-viewport` | PORTED | SlashMenu/MentionMenu gained `clampStyle` prop; Composer injects flip/clamp inline styles, `{flush:'post'}` refit + per-element ResizeObserver |
| `fix-user-menu-text-select` | NOT APPLICABLE | fork has no sidebar user menu / plan-usage submenu (upstream-only surface) |
| `grouped-session-list-load` | PORTED | cwd→id Map replaces per-session `Array.find` scan; one shared `sessionViewsByWorkspace` computed feeds flat + grouped views (`useKimiWebClient.ts`) |
| `login-wake-and-waiting-page` | NOT APPLICABLE (user decision) | upstream OAuth browser flow skipped — fork keeps token-paste ServerAuthDialog |
| `mention-menu-fs-suggest` | PORTED | client `suggestFiles` → POST `/workspace/fs:suggest` (route landed with the rebase); score-merged file+skill list, `match_positions` bold highlighting, fs:search fallback |
| `menu-radius-concentric` | PORTED | first/last menu item corners = frame radius − padding in ui/Menu, Slash/Mention menus, model-dropdown/perm-dropdown/add-menu (tokens only) |
| `pin-session-from-chat-header` | PORTED | ChatHeader ⋮ Pin/Unpin action → existing daemon pinned path; i18n header.* en+zh |
| `pinned-section-resize` | PORTED | Sidebar pinned block with fixed persisted height (`kimi-web.pinned-height`), horizontal ResizeHandle (`useResizable` axis:'y'), mask-image edge fades |
| `queue-interaction` | PORTED | per-row Steer / Send-now on queued prompts (`steerQueued`/`sendQueued` in useWorkspaceState via steerPrompts), hover-revealed row buttons in ChatPane q-stack |
| `region-login-entries` | NOT APPLICABLE (user decision) | same OAuth skip |
| `remote-session-archive-sync` | PORTED | projector threads archived/pinned/emoji through session.meta.updated; reducer patch-in-place; splitByArchived applied to Open views (+3 projector tests) |
| `session-menu-last-active` | PORTED | SessionRow kebab time footer relabeled "Last updated/最后更新" + tightened padding |
| `sidebar-action-button-alignment` | PORTED | removed 13px svg override so header IconButtons match row kebabs (16px) |
| `skill-activation-card` | PORTED | card block + activatedSkill keys removed; skill turns render invocation text via MentionText branch (messagesToTurns carries `/skill args`) |
| `skill-turn-undo` | PORTED | canEditTurn drops the skillActivation gate (engine verified undoable); transient "Undone/已撤销" toast after successful undo |
| `user-menu-density` | NOT APPLICABLE | no sidebar user menu exists in the fork |
| `waitfor-tool-card` | PORTED | new `WaitForTool.vue` registered for `waitfor` in toolRegistry; parser `lib/waitForToolParse.ts` (+7 tests) mirrors engine output markers; quiet line + glance expansion; tools.waitfor.* i18n |

### Sync `3090c1c48` (#3152)

| Changeset | Verdict | Where / evidence |
|---|---|---|
| `composer-toolbar-crush-fix` | PORTED | toolbar-left flex:none / toolbar-right flex:1 min-width:0; overlap resolved by truncation at ~320px |
| `fix-question-card-title-clamp` | ALREADY PRESENT | QuestionCard `.qtext` already wraps (no clamp ever added here) |
| `mobile-shell-ui` | PORTED (minimal) | bundle-justified edges only: 36px control-size alignment at ≤640px + hover:none tap-target insets |
| `model-pill-icon-collapse` | PORTED | ResizeObserver collapse with ±16px hysteresis → `.model-pill.icon-only` (32×32, lg-glass intact); hover tooltip carries model + effort |
| `perm-label-flex-shrink` | PORTED | truncation moved to the perm-pill base rule (was ≤980px-only) |
| `task-notification-cron-style` | PORTED | task-origin messages now reach the transcript (projector no longer drops them); new `TaskNotice.vue` (title/body/output-file copy/preview snippet) + `lib/taskNotification.ts` (+4 tests); CronNotice untouched |

### Sync `491ebd050` (#3157)

| Changeset | Verdict | Where / evidence |
|---|---|---|
| `btw-sidechat-esc-ime` | PORTED | App.vue onGlobalKeydown: `e.isComposing || keyCode === 229` guard before panel close (mirrors Composer's helper) |
| `btw-sidechat-focus-on-open` | PORTED | SideChatPanel onMounted → nextTick focus of inputRef |
| `fix-desktop-memory-leaks` | PORTED | provable leak fixed: sideChat message/sending maps freed on session teardown (`clearSideChatForSession` wired into forgetSession); full audit table in agent report — observers/listeners verified clean |
| `fix-draft-attachments` | PORTED | attachment metadata persisted to `kimi-web.attachment-draft.${sid‖__new__}` on mutation, restored on mount/switch, blobs refetched, double-upload impossible by construction |
| `login-region-card-titles` | NOT APPLICABLE (user decision) | same OAuth skip |
| `mobile-composer-button-glyphs` | PORTED | mobile send/stop glyphs 17px → 22px inside 36px circles |
| `mobile-composer-menu-sheets` | PORTED | slash/mention/+ menus render as grab-handle BottomSheets ≤640px (`layout='sheet'` prop; content extracted to `ComposerAddMenu.vue`); desktop paths byte-identical |
| `mobile-model-picker-sheet` | PORTED | model menu extracted to `ComposerModelMenu.vue`, opens as BottomSheet on mobile |
| `mobile-onboarding-theme-cards` | PORTED (adapted) | fork uses scheme/accent SegmentedControls, not cards — stretched full-width on ≤640px |
| `mobile-park-custom-provider` | NOT APPLICABLE | Onboarding has no provider entry at all |
| `mobile-switcher-flat-grouped-tabs` | PORTED | MobileSwitcherSheet SegmentedControl "Recent"/"By workspace"; flat = recency across all loaded sessions; persisted `kimi-web.switcher-view` |
| `mobile-tool-row-touch-height` | PORTED | ToolRow ≤640px pins compact 30px row height |
| `remove-perm-thinking-slash-commands` | PORTED (user decision) | entries/case arms/i18n keys removed; orphaned helpers cleaned; Settings consumers untouched |
| `sidebar-overlay-scrollbar` | PORTED | scrollbar-color/webkit thumb transparent until hover/focus; `scrollbar-gutter: stable both-edges` equalizes margins |
| `usage-flyout-viewport-cap` | NOT APPLICABLE | fork has no sidebar usage flyout |

### Sync `d4e0ad4b2` (#3166)

| Changeset | Verdict | Where / evidence |
|---|---|---|
| `agent-detail-thinking-collapse` | PORTED (full upgrade, user decision) | AgentDetailPanel rewritten: identity strip + live-progress strip + REST transcript (`getAgentTranscript?agent_id=`) with collapsible thinking blocks (expanded while working, collapsed when settled, aria-expanded toggles); openFile/openMedia/openAgent emits wired in App.vue; no new server endpoints |

## Round notes

- Implemented by 6 coder subagents (renderer / composer+menus / sidebar+queue / mobile / settings+sidechat / detail-panel) plus orchestrator fixes: fg/bg badge relocation from dock grid to the inline AgentTool card, and the esc-ime guard (dropped from a dispatch list).
- Verification: vue-tsc clean; kimi-web vitest 912/912 (2 new suites: waitfor parse, task-notification parse; +7 viewport-clamp tests; +3 projector tests); check:style 64 baseline findings (4 pre-existing backdrop-filter findings resolved by the mobile package); heap-capped build green; pixel bench all 10 scenes 0 px differ after re-baselining slash-menu/model-dropdown/add-menu (intended: concentric radii, clamp shifts, removed commands).
- Not visually verified in a browser (no live server capture this round) — recommended manual pass: phone-width viewport for the four composer sheets and the flat switcher view; light/dark for the detail panel.
- Known gaps (honest): transcript panel is single REST page (no per-agent paging client); task-notification turn prompt may be absent for some subagents; tool-row alternation root cause unconfirmed.
- Concurrent user work in packages/oauth + kosongConfig was present in the tree throughout — excluded from this round's commit.
