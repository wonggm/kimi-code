---
"@moonshot-ai/kimi-code": patch
---

Web: right-panel tab strip polish — 28px tabs in the shared 48px panel-header rhythm with tighter spacing (matching the upstream PanelTabBar metrics), has-content dots that only light once a tab truly has content (the Terminal tab now waits for the PTY probe instead of claiming content on any open session), and the panel widened to the upstream default of 460px.
