# Web UI port menu — upstream 0.38-era bundle syncs

Upstream web features arrive bundle-only (see `PLANS/web-port-0.34.md` header
and the `merge-upstream-kimi` skill). This menu covers four bundle sync commits
pulled by the 2026-08-22 rebase onto upstream `d723cc47e`:

- `2c5415f93` — "chore: sync web dist from code-app" (#3135) — 24 web changesets.
- `3090c1c48` — "chore: sync web dist from code-app" (#3152) — 6 web changesets.
- `491ebd050` — "chore: sync web dist from code-app" (#3157) — 15 web changesets.
- `d4e0ad4b2` — "chore: sync web dist from code-app" (#3166) — 1 web changeset.

46 blurbs total, verbatim below — the only written spec that exists.
No verdicts recorded yet; porting round not started.

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

## Verdicts

Not started.
