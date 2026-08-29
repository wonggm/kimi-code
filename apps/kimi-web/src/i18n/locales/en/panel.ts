export default {
  // Right-panel tab labels (multi-tab layout replacing the dock pills).
  tabs: {
    changes: 'Changes',
    sideChat: 'Side chat',
    turnDiff: 'Turn diff',
    terminal: 'Terminal',
    bash: 'Bash',
    subagents: 'Sub agents',
    todos: 'Todos',
  },
  // Generic tab strip.
  newTab: 'New tab',
  close: 'Close right panel',
  // Turn diff tab: shows the diff for files changed by the latest turn.
  turnDiffEmpty: 'No files changed in this turn',
  turnDiffUnavailable: 'Turn diff unavailable',
  // Terminal tab fallback when the daemon keeps PTY routes loopback-bound.
  terminalUnavailable: 'Terminal is not available in this build',
  // Workbar above the composer (icon-only squares).
  workbarLabel: 'Open {name}',
  openPanel: 'Open right panel',
  terminalLoopbackOnly: 'Terminal routes are only available when the server is bound to loopback',

} as const;
