export default {
  // Upstream's own panel strings, ported verbatim so the tab strip, its tail and
  // the launcher read exactly as upstream's does (this is the tab set the
  // complete-merge round adopted; see PLANS/web-port-0.41.md).
  tabs: {
    diff: 'Changes',
    file: 'File',
    turnDiff: 'Turn diff',
    compaction: 'Compaction summary',
    agent: 'Subagent',
    term: 'Terminal',
    // Fork keys still referenced by the pre-merge shell and its panes.
    changes: 'Changes',
    sideChat: 'Side chat',
    terminal: 'Terminal',
    bash: 'Bash',
    subagents: 'Sub agents',
    todos: 'Todos',
  },
  newTab: 'New tab',
  closeTab: 'Close tab',
  expand: 'Expand panel',
  collapse: 'Restore panel',
  hide: 'Close right panel',
  launcherAria: 'Quick open',
  // Fork keys still referenced by the pre-merge shell and its panes.
  close: 'Close right panel',
  back: 'Back',
  agentGone: 'This subagent is no longer available. Go back to the list.',
  drillAgentLabel: 'Subagent detail',
  drillFileLabel: 'File preview',
  turnDiffEmpty: 'No files changed in this turn',
  terminalUnavailable: 'Terminal is not available in this build',
  workbarLabel: 'Open {name}',
  openPanel: 'Open right panel',
  terminalLoopbackOnly: 'Terminal routes are only available when the server is bound to loopback',

} as const;
