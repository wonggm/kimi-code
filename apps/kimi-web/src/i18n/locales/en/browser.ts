export default {
  // The in-app browser's own surface. Only the strings the web app can act on
  // live here: the panel exists as a tab the app opens, and it has no page to
  // show, so it says so.
  title: 'Browser',
  ariaLabel: 'Browser',
  unavailable: 'The in-app browser is unavailable',
  openPanel: 'Open browser panel',
  forkTabsFailed: 'Session forked, but browser tabs couldn’t be copied',
} as const;
