# Known issues to be fixed or features to be implemented
## Kimi Web
- Preview pane (task, subagent) rendering markdown raw: add proper markdown render, make more human-readible, ideally synchronised with main interface.
- Subagent resume: preview pane doesn't display model of resumed subagent. 
- Send subagent to **background**: add ability to send subagents to background 
- Subagent panel: 
  - subagent status = running eventho task completed (stale, effectively), 
  - clicking into subagent preview pane shows empty (the stale running ones only), they should stay and categorised as "completed", "running" (just like the TUI) subagent output as in "open Task", ideally synchronised with main interface. perhaps clicking "open Task" for a task delegating subagent and the subagent panel could point to the same preview pane. 
- Scrolling issue: jump scrolling when "working" and when idle, sometimes scrolling jumps abruptly to the very top when "working".
- AskTool: text typed in "Others" removed when switching session.
- Subagent models: UI to change them, in settings maybe? and a "Save" button (or something named more nicely) that does '/reload'

## Agent core/harness
- session '/tree' like Pi. 
- '/undo' can be more feature rich, like Claude Code? actually ties to '/tree', which seemed more versatile and robust.
- self-awareness, also like Pi. existing skill: check-kimi-docs sorta works, but better enforcement should be researched based on Pi and borrowed over. 