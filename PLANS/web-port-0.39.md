# Web port menu — 0.39 era (sync 2026-08-30)

Upstream delta `d723cc47e..961927739` (0.39.0 + 0.39.1). Two new bundle sync commits:
`df9e85838` (#3296, 5 changesets) + `8f43674b9` (#3333, 9 changesets) = **14 new web blurbs**.
All other changeset files appearing in the delta are release-curation re-adds of the
0.38-era batch (verdicts in `PLANS/web-port-0.38.md`) or engine/TUI-side work adopted
during the rebase.

## New porting menu (14)

| # | Changeset | Blurb | Fork notes / collision risk |
|---|-----------|-------|------------------------------|
| 1 | `right-sidebar-panel-tabs` (minor) | Revamp the right sidebar as a multi-tab panel | BIG. Our right side has ChatDock workbar (Bash/Sub Agent/Todos pills) + TasksPane (bash-only) + detail panel. Multi-tab panel may restructure this — re-express in our glass system. |
| 2 | `right-panel-interaction-polish` | Unify right-side panel headers; OpenIn menu file mode (copy abs path, editor picker, full-path tooltip) | We already ported `OpenInMenu.vue` in the 0.38 round — extend with file mode. `PanelHeader.vue` exists from 0.37. |
| 3 | `task-detach-to-background` (minor) | "Move to background" button on the running card | Engine ADOPTED from upstream in the rebase. Fork `c50252743` already implemented the web side (`detachTarget.ts`, TaskNotice/ToolCall buttons). Reconcile our UI against upstream's shape. |
| 4 | `code-block-interaction` | Improve code block interaction and rendering | Vague — needs bundle static analysis (ToolOutputBlock/DiffView/Markdown code paths). |
| 5 | `composer-interaction` | Improve composer interaction incl. file/folder/media attachment presentation | Overlaps our 0.37 folder-mention port + Composer glass work. |
| 6 | `composer-placeholder-caret` + `fresh-placeholders-type` (pair) | First IME/keyboard char swallowed after clicking placeholder; render rich placeholder outside the editor | Composer internals. |
| 7 | `default-permission-new-sessions` | Permission mode scoped per session (not global) | COLLISION CANDIDATE with our permission pill plumbing — decide when spec is clear. |
| 8 | `fix-media-popover-interactions` | Fix flickering/broken interactions in image/video attachment preview popovers | Overlaps our `bb36b31db` zoom-clip fix in `MediaPreview.vue`. |
| 9 | `fix-new-session-attachment-upload` | Fix new-session attachments stuck "uploading" | `useAttachmentUpload.ts`. |
| 10 | `signin-model-readiness-gating` | Send gate offers picking/configuring a model instead of wrongly asking to sign in | We keep token-paste auth; check how much of the gate UI applies. |
| 11 | `startup-first-grouped-page` | Fix startup stuck on "Connecting…" with many workspaces | `ws.ts` / boot path. |
| 12 | `bash-detach-row-height` | Command tool row taller than other rows | `ToolRow.vue`/`toolRegistry` CSS. |
| 13 | `fix-known-issues` | "Fix known issues" (catch-all) | Identify contents from bundle diff. |

## Changelog accounting — all other changesets in the delta (verdicts)

- 0.38-era batch re-surfaced by release curation (`52e8d19db` ci:release + `87bcf1a9e` curate):
  `agent-detail-thinking-collapse`, `btw-sidechat-esc-ime`, `btw-sidechat-focus-on-open`,
  `composer-toolbar-crush-fix`, `fix-desktop-memory-leaks`, `fix-draft-attachments`,
  `fix-question-card-title-clamp`, `mobile-*` (9), `model-pill-icon-collapse`,
  `perm-label-flex-shrink`, `sidebar-overlay-scrollbar`, `task-notification-cron-style`,
  `usage-flyout-viewport-cap` — **PORTED / ALREADY PRESENT / NOT APPLICABLE per the
  verdict tables in `PLANS/web-port-0.38.md`** (all 46 blurbs accounted there 2026-08-22).
- Engine/TUI-side (no web port needed): `archive-missing-workspace` (#3139),
  `cloudbase-marketplace` (#3136), `config-torn-read-guard`, `cron-fold-swallows-answer`
  (#3154), `remove-now-template-variable`, `remove-perm-thinking-slash-commands`
  (fork already removed `/auto` `/yolo` `/thinking` in the 0.38 round — alignment),
  `respect-mcp-management-readiness`, `sdk-mcp-management-cwd`, `subagent-fork-context`
  (#3007, adopted in rebase), `tower-mode-command` (#3099, adopted),
  `tui-unicode-ellipsis` (#3366, adopted), `windows-git-bash-path-bridge`.
- `login-region-card-titles`: web but login-region cards — fork keeps token-paste auth
  (user decision 2026-08-22) → **NOT APPLICABLE**.

## Visual + static findings (upstream bundle, throwaway server 58731, 2026-08-30)

Captures in `/tmp/kimi-shots/` (up-*.png; throwaway Chrome profile `/tmp/kimi-chrome-profile`).
Firefox one-shot captures fire too early for SPA boot — use them only for static checks;
the interactive loop runs in Chromium (user's live browser is Firefox on Windows: all
ported CSS must honor the documented Firefox constraints — no nested backdrop-filter,
no SVG-displacement filters, MenuSelect for dropdowns).

- **Composer is now ProseMirror** (`[contenteditable].ProseMirror`, aria "Message input")
  with the placeholder rendered as an OUTSIDE overlay (`composer-placeholder-overlay`) —
  that is `fresh-placeholders-type` + `composer-placeholder-caret`. **Decision: do NOT
  port ProseMirror** (dependency weight, our textarea + glass/pill work is textarea-based);
  re-express the overlay-placeholder pattern on our textarea (fixes the first-char-swallow
  bug class and enables rich placeholder content).
- **Code block header**: language label left (icon + "Python"), right controls =
  line-numbers toggle, word-wrap toggle, copy. Plus streaming diff classes
  (`markstream-pre__diff-*`) and an HTML preview runner (`html-preview-frame__*`,
  start/stop/rebuild strings). Monaco diff editor is embedded upstream — do NOT adopt;
  re-express with our DiffLines.vue.
- **Right sidebar = multi-tab panel** (`right-sidebar-panel-tabs`): wide right panel with
  entries "Changes" and "Side chat" (+ new-tab and collapse buttons); dock pills reduced
  to icon-only squares above the composer. Strings: `panel.tabs.turnDiff`, `turnDiff`,
  `hide = Close right panel`, `term = Terminal`, `backToBottom`.
- **Permission menu**: Manual / YOLO (checked) / Auto with descriptions; the
  `default-permission-new-sessions` change scopes the choice per session.
- **New strings inventory** (see bundle diff): `toBackground = To background` (running
  card), attachment upload states (`stateUploading/Uploaded/Upload failed`,
  `attachmentUploadFailed/Interrupted`, `mediaPreviewUploading/Loading/Unavailable`),
  OpenIn file mode, `configureModels*` / `pickModel*` send-gate, `errorBoundary*`,
  code comment/quote (`comment`, `quoteLabel`, `copyQuote`, `insertQuote`, `addToChat`),
  wrap/line-numbers toggles, HTML preview runner stages.
- **Header**: branch chip + `+N -N` working-tree diff stat chips in the chat header
  (`ch-git` class).
- **turnFolding / activityRunFolding** strings exist (auto-fold messages + tool-call
  summary row) — related to the user-rejected TurnFold family; treat as collision.

## VERDICTS (implementation 2026-08-30)

- PORTED: right-sidebar-panel-tabs (RightPanelTabs.vue + rightPanelTabs.ts + panel i18n
  en/zh, frosted column in ConversationPane, icon workbar in ChatDock with
  open-right-panel emit, tab persistence), right-panel-interaction-polish (PanelHeader in
  tabs; OpenIn file mode partially — copy-path existed, editor picker via FilePreview
  external actions), task-detach-to-background (web reconcile via detachTarget +
  ChatDock detachTask emit), composer-placeholder-caret + fresh-placeholders-type
  (overlay placeholder on our textarea — ProseMirror rejected), composer-interaction +
  fix-new-session-attachment-upload (upload states + AttachmentChip kinds),
  code-block-interaction (header + copy already lib-native; persisted codeLineNumbers /
  codeWrap prefs wired into codeBlockProps; in-header toggle buttons DEFERRED —
  markstream header has no such slots), bash-detach-row-height (tool-row rhythm),
  tool-call summary folding (toolFold.ts + ToolFoldRow.vue, render-layer only),
  default-permission-new-sessions (permissionBySession state + storage key).
- VERIFIED: vue-tsc clean; kimi-web vitest 959/959; check-style 66 baseline findings
  (64 pre-existing + 2 new, baseline mode); heap-capped build green; visual parity
  vs upstream on throwaway server (shell / code block header / right panel / workbar).
- DEFERRED (recorded, not ported): in-header wrap/line-number toggles + language icon
  polish; code comment/quote feature; HTML preview runner; media popover interaction
  fixes in MediaPreview.vue; startup Connecting… stall fix (ws.ts); sign-in → model gate
  adaptation (fork keeps token-paste auth); OpenIn file-mode deep wiring; Terminal tab
  availability probe (passes sessionId presence today).
- Next session: run the pixel bench (references re-baseline likely for the new workbar),
  the deferred list above, and the final `copy-web-assets` into the live dist-web.

## OPEN BUG + deferred (2026-08-30, session 2)

**Agent pane self-close — ROOT-CAUSED + FIXED (session 3, 2026-08-30).** The earlier
forensics were misleading: the panel WAS unmounted via removeChild (the session-2 patch
missed it), and the unmount is a RENDER ERROR, not a state flip — which is exactly why
the member-fallback / debounce / latch hardening could not help. When a subagent's
`GET /transcript?agent_id=` page contains marker items (`kind: 'marker'` — compaction
checkpoints, no `steps` array), `viewTurns` in AgentDetailPanel threw
`TypeError: …steps is not iterable` on the first re-render after the fetch landed
(~50–300ms after Open) and Vue tore the whole branch down (aside left `open` + empty —
the impossible-looking hold=false/spv=true observation). Targets with marker-free
transcripts survived, which made the bug look flaky. Fix: wire/app types widened
(`WireTranscriptItem` / `TranscriptItem` = turn | marker), `viewTurns` renders marker
payload text as a notice block, `projectSubagentTranscript` input widened (its
`kind !== 'turn'` guard already existed). Verified in dev: all 5 bench-session subagent
panels stay open, zero console errors; regression test in agent-event-projector.test.ts;
vue-tsc clean; 961/961 vitest; build green. NOTE the deployed dist-web was confirmed
byte-identical (module-hash cascade apart) to the committed source — the user HAD the
hardened build; the latch genuinely couldn't fix a render error.

**Bonus fix (dev-only, no changeset):** RightPanelTabs.vue had its terminal-probe
immediate watcher ABOVE `defineProps` — TDZ ReferenceError (`Cannot access 'props'
before initialization`) killed setup in dev mode and made `.right-panel` unmountable
(prod compiles `props` accesses to inline `__props`, so prod never threw). Watcher moved
below the props declaration. This is what blocked session-2's dev-build tracing plan.

Still deferred: in-header code toggles (markstream header has no
slots), comment/quote-to-chat, HTML preview runner, doodle theming (below), tab-strip
polish.

**Media popovers — DONE (goal round, commit `45df00019`).** The surface is NOT
MediaPreview.vue (lightbox) nor any pre-existing popover: upstream 0.39 replaced the
0.38 `att-strip` with attachment pills + a hover media popover (`mention-tip-media`
region in the bundle: authed preview blob via `resolveAttachmentPreviewUrl` → object
URL, states preview/uploading/loading/unavailable, upload progress ring, copy +
fullscreen actions; the flicker fix = `mouseout` with `relatedTarget` containment in the
tip + capture-phase pointermove targeting + scroll/focus handling). Our fork never had
the base popover, so the port = base feature + fix baked in: new `MediaTip.vue`
(Teleport-to-body, fixed-anchored like MentionTip, `.lg-glass`, AuthMedia preview with a
new loading/ready/error status emit, spinner placeholders for uploading/loading,
name+size, fullscreen action → chip `activate`) + `AttachmentChip` hover bridge (120ms
show / 140ms grace hide, tip-enter cancels hide, scroll/resize hides — same flicker-free
pattern as MentionText). i18n `composer.mediaPreviewFullscreen` en+zh
(uploading/loading/unavailable keys already existed). Verified: vue-tsc clean, 961/961
vitest, capped build green, prod-bundle CDP screenshot on a fresh profile (chip +
popover with live authed preview + fullscreen button). Upstream interactive comparison
NOT reproducible headless (their hover-intent machinery never opens the popover under
CDP event synthesis) — comparison is structural, against the extracted bundle code.

**Doodle theming (OPEN)**: upstream's empty-doodle follows the app theme; ours renders
one static artboard. Check the upstream bundle for how `empty-doodle` reacts to
appearance (two artboards / state input / re-instantiate on theme change) and mirror it
in EmptyDoodle.vue.

## USER DECISIONS (2026-08-30, before implementation)

1. **Right sidebar revamp** — follow UPSTREAM's layout (multi-tab right panel: Changes /
   Side chat / Turn diff / Terminal / Bash / Sub agents / Todos; icon-only workbar above
   the composer), **retain liquid glass** throughout (all panels/tabs get .lg-glass/.lg-frost
   materials, Firefox constraints honored).
2. **Folding** — ADOPT the tool-call summary fold (consecutive tool calls → one summary
   row during an answer). TurnFold auto-fold stays REJECTED (permanent, 0.36.1 decision).
3. **Turn diff + Terminal tabs** — port BOTH, re-expressed with our DiffLines/ToolDiffPanel
   and existing Terminal/useTerminal components.
4. ProseMirror: NOT adopted (orchestrator decision, no user objection) — overlay
   placeholder re-expressed on our textarea.

## Verification

Per the mandatory visual loop: upstream bundle extracted to `.tmp/upstream-web/`, served
by a throwaway kap-server instance (alt port, /tmp workspace — never the user's live
server), CDP screenshots of each affected screen, then our build re-ported + re-shot +
compared side by side. Then the gauntlet: vue-tsc, full kimi-web vitest, check:style,
pixel bench, heap-capped build.

**RESOURCE CAPS (2026-08-30 crash):** WSL2 has 6 GB RAM / 16 CPUs. Every heavy command
runs with `NODE_OPTIONS=--max-old-space-size=2048`, vitest `--maxWorkers=2`, single
heavy command at a time. Never swap `apps/kimi-code/dist-web` while the user's session
is live — the final `copy-web-assets` step is left for the user (or run with explicit
approval).

2. **In-header code toggles — DONE (commit `99cb7ba44`).** markstream-vue's built-in
   CodeBlockNode has no header slot AND our version's settled renderer draws the number
   gutter via @pierre/diffs inside a SHADOW ROOT with no prop gate (upstream's newer
   custom CodeBlockNode chunk has `lineNumbers!=="off"`; ours does not). Port shape:
   new `MarkdownCodeBlock.vue` registered via markstream `setCustomComponents` +
   `custom-id="kimi-web-chat"` on MarkdownRender — renders our glass header (language
   label + line-number/wrap/copy buttons) and mounts markstream's CodeBlockNode with
   showHeader/showCopyButton off. Toggles drive shared persisted refs
   (`lib/codeBlockPrefs.ts`). Shadow-root gap bridged by injecting a small stylesheet
   into each block's shadow root and toggling host classes (`:host(.mdcb-lines-off)`
   hides `[data-gutter]` + collapses the grid; `:host(.mdcb-wrap)`/`:host(.mdcb-nowrap)`
   flip white-space). Verified: default = wrap on / no gutter; toggled = gutter +
   horizontal scroll; persisted to storage keys; vue-tsc clean; 962/962 vitest (new
   codeBlockPrefs test); capped build green; CDP screenshots on the mock stack.
   NOTE: interactive verification ran against a watcher-free MOCK API server
   (/tmp/kimi-mock-api.mjs, canned auth/workspaces/sessions/snapshot payloads) because
   the host's inotify budget is exhausted by the ZCode server (kap-server cannot start;
   env limit needs `sudo sysctl -w fs.inotify.max_user_watches=1048576` to fix
   durably). Same mock serves the extracted upstream bundle for side-by-sides.
