# Known issues to be fixed or features to be implemented
## Kimi Web
- [] Preview pane (for task, subagent) rendering markdown raw: add proper markdown render, make more human-readible, ideally synchronised with main interface.
- [] Subagent resume: preview pane doesn't display model of resumed subagent. 
- [] Send subagent to **background**: add ability to send subagents to background, add a button in "Task"
- Subagent panel: 
  - [] subagent status remained as running eventho task completed (stale, effectively), 
  - [] clicking into subagent preview pane shows empty (the stale running ones only), they should stay and categorised as "completed", "running" (just like the TUI) subagent output as in "open Task", ui render ideally synchronised with main interface.
  - [] sometimes clicking on subagent pane opens with content; sometimes opening empty
- [x] Scrolling issue: jump scrolling when "working" and when idle, sometimes scrolling jumps abruptly to the very top when "working".
- [] AskTool: text typed in "Others" removed when switching session.
- [x] Subagent models: UI to change them, in settings maybe? and a "Save" button (or something named more nicely) that does '/reload'
- [] when using '@' to point to file, add so that it works for all paths, eg: '/path/to/here', '~/tilda/means/from/home/path'. current behaviour might be that, '@' works only for cwd and added dir to the workspace via '/add-dir'
- [] allow preview of files "not in workding dir", essentially all hyperlinks the agent quotes in the session transcript should be preview-able in the preview pane. 
- [] reloading webpage removes preview pane contents, cache hit rate, and stales goal mode pill window's status (turns, tokens, time elapsed). status is stale and not live. tokens should show total of main agent + subagents(s)
- [] point form display with "kimi blue" colour
- [] buggy when pausing and resuming goal, upon resuming goal, transcript not updated, requires reload, delegated subagent preview panel empty. 
### Frontend
- [x] hidden scrollbar by default, only shown when scrolling and hovered-over. 
- [x] hidden TOC, show only when hovered over 
- [ ] improve goal mode pill close animation, pill closing motion is visible, looks slow and un-smooth
- [ ] goal mode pill too close to pill dock (bash, sub agent, todos...), vignette needs to match the long goal pill when goal mode active 
- [ ] liquid glass texture for goal mode pill and expanded pill
- [] goal mode pill on expanding, should not push the whole session transcript up, should overlay, same behaviour like when expanding dock pills

## Agent core/harness
- [] session '/tree' like Pi. 
- [] '/undo' can be more feature rich, like Claude Code? actually ties to '/tree', which seemed more versatile and robust.
- [] self-awareness, also like Pi. existing skill: check-kimi-docs sorta works, but better enforcement should be researched based on Pi and borrowed over. 
