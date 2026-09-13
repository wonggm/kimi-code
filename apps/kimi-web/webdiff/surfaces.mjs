// apps/kimi-web/webdiff/surfaces.mjs
// The walk plan. Base scenes are posed by name; the walk discovers interactive
// elements from the live DOM instead of matching a hardcoded selector list —
// the two apps share almost no markup, so a fixed list of selectors would
// silently degenerate into "nothing reachable" for one of them.

export const MAX_WALK_SURFACES = 24;
export const MAX_DISCOVERED = 120;

// The dock workbar's pills sit near the end of the DOM, behind the whole
// transcript, so on the fork they fell past the walk's cap and the panels they
// open (bash, Background Agent, Todos, Plan) were never captured — upstream's
// walk reached them, so the two apps' walks were not comparable there. Both apps
// render these controls as `.ui-pill`, so the walk keeps them inside the cap.
export const PRIORITY_CLASS = 'ui-pill';

// Base scenes double as the walk's phases: a control is only discoverable once
// its container is open, so the walk runs once per base scene (root, then
// settings) instead of only from the app root. `expect` names why the phase
// exists — a phase whose own surface never opened makes everything discovered
// inside it meaningless, so the runner records that as a gap.
// Both scenes pin the transcript to its tail first: the scroll position drives
// real state (the `is-following` class, the jump-to-latest pill, the "Latest
// messages" label) and the two apps restore it differently after the seed
// reload, so an unpinned capture reports two different scroll states as a
// markup difference. `scrollBottom` is a no-op when the content already fits.
const PIN_TAIL = { action: 'scrollBottom', selector: '.chat-scroll', ms: 200 };

// The dock's three pills, addressed by their position in `.dock-workbar` (Goal,
// Plan, Bash, Background Agent, Progress) rather than by label: upstream has no
// per-pill attribute and both apps localize the aria-label, so a label step
// would only work in one locale. The workbar holds exactly these pills as its
// own children on both apps.
const DOCK_GOAL_PILL = { action: 'click', selector: '.dock-workbar > .ui-pill:nth-of-type(1)', ms: 500 };
const DOCK_BASH_PILL = { action: 'click', selector: '.dock-workbar > .ui-pill:nth-of-type(3)', ms: 400 };
const DOCK_AGENT_PILL = { action: 'click', selector: '.dock-workbar > .ui-pill:nth-of-type(4)', ms: 400 };

// Behaviour scenes. The walk reaches a surface by replaying clicks and then
// diffs markup, so it cannot see what a control DOES: whether the same control
// flips state, which pane a pill opens, whether a panel dismisses, what a
// selection popup offers. Each scene below states the outcome it needs in
// `requires`, checked on the live page after the steps (see capture.mjs
// `checkRequirements`); a failed check is reported as a blocker for the app that
// failed it, so a behaviour the fork does not have fails the run even though
// every capture it writes still diffs as a plausible surface.
//
// `requires` entries:
//   name     short id; it is part of the finding id, so keep it stable
//   present  CSS selector that must match `count` visible elements (default 1+)
//   absent   CSS selector that must match no visible element
//   text     RegExp that must match the visible text of `within` (default: body)
//   not      inverts `text`: the scope must NOT contain it. A CSS selector cannot
//            name a row by its text, so this is how a scene says "this row is
//            absent" (e.g. a dock panel that must not list a foreground agent).
//   within   the scope for `text`
// "Visible" means rendered and not parked off the side of the viewport: both apps
// keep a closed right panel in the DOM parked at x = innerWidth with a real
// layout box, so a selector-only test would read the parked panel as open.
// Vertical position is not part of the test — the transcript scrolls, and a card
// above or below the fold is still the rendered state.
//
// `then` is the second capture point of a transition: the scene's steps are
// replayed, then `then.steps` are appended, the result is captured under
// `${name}-${then.name}`, and `then.requires` is checked there. A closed state
// looks like `main`, so its capture is usually not written (nothing opened) —
// the requirement check runs regardless and is what reports the dismissal.
//
// The scenes pose a desktop interaction (a clickable right panel, a text drag
// for a popover, a floating panel anchored above the dock). The mobile shell
// mounts different panes and neither app is being compared there for these
// behaviours, so `desktopOnly` keeps a mobile combination from reporting both
// apps as failing a scene neither was written for. `enOnly` does the same for a
// scene whose steps or requirements name UI label text: a selector cannot say
// "the pill labelled Bash" without hardcoding a locale, and a requirement that
// names a label is only true in the locale that spells it that way.
// `snapshot: false` marks a scene whose evidence is the requirement result only:
// the surface is gone by the time a capture's settle finishes (the selection
// popup), so no capture is written and the "opened nothing" bookkeeping is
// skipped rather than reported as a coverage gap.
// The routes both apps reach Settings by, tried in order. The fork has a labelled
// item in the sidebar footer; upstream puts Settings behind the account row, whose
// label follows the locale; the mobile shells hide it behind a header control.
// Each route pins the transcript first, so a settings capture also compares the
// main surface behind the dialog in one scroll state. Order matters: the runner
// keeps the first variant that changes the surface, so a text route that opens
// the wrong menu would win the race — `expect` on the scene is what rejects it.
const SETTINGS_ROUTES = [
  [{ action: 'click', selector: '.side-footer-settings', ms: 350 }],
  [{ action: 'clickText', text: 'Not signed in', ms: 300 }, { action: 'clickText', text: 'Settings', ms: 350 }],
  [{ action: 'clickText', text: 'Sign in', ms: 300 }, { action: 'clickText', text: 'Settings', ms: 350 }],
  [{ action: 'clickText', text: '未登录', ms: 300 }, { action: 'clickText', text: '设置', ms: 350 }],
  [{ action: 'clickText', text: '登录', ms: 300 }, { action: 'clickText', text: '设置', ms: 350 }],
  [{ action: 'clickText', text: 'Settings', ms: 350 }],
  [{ action: 'clickText', text: '设置', ms: 350 }],
  [{ action: 'click', selector: '[aria-label="Settings"]', ms: 350 }],
  [{ action: 'click', selector: '[aria-label="设置"]', ms: 350 }],
  [{ action: 'click', selector: '[aria-label*="ettings" i]', ms: 350 }],
  [{ action: 'click', selector: '[aria-label*="设置"]', ms: 350 }],
  [{ action: 'clickText', text: 'More', ms: 300 }, { action: 'clickText', text: 'Settings', ms: 350 }],
  [{ action: 'clickText', text: '更多', ms: 300 }, { action: 'clickText', text: '设置', ms: 350 }],
  [{ action: 'clickText', text: 'Menu', ms: 300 }, { action: 'clickText', text: 'Settings', ms: 350 }],
  [{ action: 'click', selector: 'header button:last-of-type', ms: 350 }],
  [{ action: 'click', selector: '.topbar button:last-of-type', ms: 350 }],
].map((attempt) => [PIN_TAIL, ...attempt]);

export const BEHAVIOUR_SCENES = [
  {
    name: 'behaviour-dock-panel-toggle',
    desktopOnly: true,
    // Item 1's own reading: the dock panel opens on its pill and the SAME pill
    // closes it. Both apps behave this way today; the fork's difference is in the
    // right pane's control, which `behaviour-right-pane-toggle` poses.
    steps: [PIN_TAIL, DOCK_BASH_PILL],
    requires: [{ name: 'dock-panel-open', present: '.dock-work-panel' }],
    then: {
      name: 'closed',
      steps: [DOCK_BASH_PILL],
      requires: [{ name: 'dock-panel-closed', absent: '.dock-work-panel' }],
    },
  },
  {
    name: 'behaviour-right-pane-toggle',
    desktopOnly: true,
    // Its requirements name UI label text (the panel control's aria-label, the card
    // subtitle, "Done when"), which only exists in the English locale.
    enOnly: true,
    // Upstream's right pane is one control whose label flips open → close (its
    // header button is replaced by the panel's close control at the same point);
    // the fork keeps the header button labelled "Open right panel" AND shows the
    // panel's own close button, so two controls are on screen while it is open.
    steps: [PIN_TAIL, { action: 'click', selector: '.ch-panel', ms: 600 }],
    requires: [
      { name: 'right-pane-open', present: '.pt-shell' },
      { name: 'right-pane-one-control', present: '[aria-label*="right panel" i]', count: 1 },
    ],
    then: {
      name: 'closed',
      steps: [{ action: 'click', selector: '.ptb-hide', ms: 600 }],
      requires: [
        { name: 'right-pane-closed', absent: '.pt-shell' },
        { name: 'right-pane-control-restored', present: '[aria-label="Open right panel"]', count: 1 },
      ],
    },
  },
  {
    name: 'behaviour-dock-pane-bash',
    desktopOnly: true,
    // A bash row in the dock panel hands the task to the side panel: upstream
    // opens a tab for the task whose pane carries the command and the output
    // ("$ pytest -q" / "collected 12 items"); the fork only reveals the panel,
    // which is left showing its empty tab list. Scoped to `.pt-body` so the
    // dock list's own command text cannot satisfy the check.
    steps: [PIN_TAIL, DOCK_BASH_PILL, { action: 'click', selector: '.dock-work-panel .tp-open', ms: 600 }],
    requires: [
      { name: 'bash-pane-command', within: '.pt-body', text: /\$ pytest -q/ },
      { name: 'bash-pane-output', within: '.pt-body', text: /collected 12 items/ },
    ],
  },
  {
    name: 'behaviour-dock-outside-click',
    desktopOnly: true,
    // Item 3. The transcript is the neutral region a dismiss must react to: a
    // click on the sidebar already dismisses the fork's panel, a click inside the
    // transcript does not. 720,300 is inside the transcript on both desktop
    // layouts (the chat column spans x≈490–1210, y≈40–850) and below the dock.
    steps: [PIN_TAIL, DOCK_BASH_PILL],
    requires: [{ name: 'dock-panel-open', present: '.dock-work-panel' }],
    then: {
      name: 'dismissed',
      steps: [{ action: 'clickPoint', x: 720, y: 300, ms: 500 }],
      requires: [{ name: 'dock-panel-dismissed', absent: '.dock-work-panel' }],
    },
  },
  {
    name: 'behaviour-subagent-card',
    desktopOnly: true,
    // Its requirements name UI label text (the panel control's aria-label, the card
    // subtitle, "Done when"), which only exists in the English locale.
    enOnly: true,
    // Item 4. The card lives inside the tool run fold, which both apps render
    // collapsed, so the run is scrolled to and expanded first; the card itself
    // then has to be expanded for its result body. The two apps reveal the result
    // from different controls: the fork's head is the disclosure, while upstream's
    // head opens the right-hand detail panel and a second control on the card
    // (`.saved-result`) is what mounts `div.result`. So the second variant adds
    // that click, and `expect` decides which variant the capture keeps — without
    // it the first variant would be recorded and upstream's result read as missing.
    expect: /Fit converged/,
    attempts: [
      [
        PIN_TAIL,
        { action: 'scrollTo', selector: '.ar-head', ms: 300 },
        { action: 'click', selector: '.ar-head', ms: 500 },
        { action: 'scrollTo', selector: '.agent-card .head', ms: 300 },
        { action: 'click', selector: '.agent-card .head', ms: 500 },
      ],
      [
        PIN_TAIL,
        { action: 'scrollTo', selector: '.ar-head', ms: 300 },
        { action: 'click', selector: '.ar-head', ms: 500 },
        { action: 'scrollTo', selector: '.agent-card .head', ms: 300 },
        { action: 'click', selector: '.agent-card .head', ms: 500 },
        { action: 'click', selector: '.agent-card .saved-result', ms: 500 },
      ],
    ],
    requires: [
      { name: 'subagent-card-shape', present: '.agent-card' },
      { name: 'subagent-card-subtitle', text: /Foreground · coder/ },
      { name: 'subagent-card-description', text: /Refit the hadronic interaction model/ },
      { name: 'subagent-card-result', text: /Fit converged: chi2\/ndf = 1\.24/ },
    ],
  },
  {
    name: 'behaviour-agent-panel-foreground',
    desktopOnly: true,
    // Item 5, posed the way upstream actually behaves: the panel lists the
    // background subagents and must NOT list the foreground one — upstream's dock
    // filter keeps `kind === 'subagent' && runInBackground` (its rows come from a
    // task whose `detached` is true). The fixture poses three subagent rows, one
    // of them foreground, so a list that grows to three fails this check.
    steps: [PIN_TAIL, DOCK_AGENT_PILL],
    requires: [
      { name: 'agent-panel-running-row', within: '.dock-work-panel', text: /Refit the hadronic model/ },
      { name: 'agent-panel-completed-row', within: '.dock-work-panel', text: /Explore the repo layout/ },
      { name: 'agent-panel-foreground-excluded', within: '.dock-work-panel', text: /Refit the hadronic interaction model/, not: true },
    ],
  },
  {
    name: 'behaviour-subagent-transcript',
    desktopOnly: true,
    // Item 6. Opening a subagent's card in the Background Agent panel gives the
    // agent its own transcript in the right panel, headed with that agent's name;
    // upstream titles the pane with it, the fork labels it "Subagent".
    steps: [PIN_TAIL, DOCK_AGENT_PILL, { action: 'click', selector: '.sg-grid > .sg-card:nth-of-type(1)', ms: 800 }],
    requires: [{ name: 'agent-pane-titled', within: '.pt-shell', text: /Refit the hadronic model/ }],
  },
  {
    name: 'behaviour-goal-panel',
    desktopOnly: true,
    // Its requirements name UI label text (the panel control's aria-label, the card
    // subtitle, "Done when"), which only exists in the English locale.
    enOnly: true,
    // Item 7, panel shape only. Upstream's goal pill opens a floating
    // `dock-work-panel.panel-goal` (head with the elapsed time, objective, "Done
    // when" plus the criterion) above the dock pills; the fork has no goal pill
    // and renders an in-flow strip instead, so the click misses and the panel
    // checks fail. Only the panel is asserted here — the fixture poses a single
    // goal status, so the paused / blocked / complete variants are not posed.
    steps: [PIN_TAIL, DOCK_GOAL_PILL],
    requires: [
      { name: 'goal-panel-open', present: '.dock-work-panel.panel-goal' },
      { name: 'goal-panel-objective', within: '.dock-work-panel', text: /Reduce the pion-production systematic uncertainty below 3%/ },
      { name: 'goal-panel-done-when', within: '.dock-work-panel', text: /Done when/ },
    ],
  },
  {
    name: 'behaviour-selection-popup',
    desktopOnly: true,
    // The popup's items are UI labels, so this scene is English-only: its
    // requirements name the strings themselves, which do not exist in the other
    // locale. It also writes no capture (`snapshot: false`): both apps dismiss the
    // popup once the pointer or selection moves on, and the capture's own settle
    // runs after the requirement check, so the digest would only ever see a
    // closed popup. The requirement result is the evidence.
    enOnly: true,
    snapshot: false,
    // Item 8. `select` is the harness's one programmatic step: a Range over a
    // transcript paragraph plus `selectionchange` and `mouseup`, which is what
    // both apps' selection capture reacts to (a synthetic mouse drag does not
    // open the popover on either). The step scrolls the block into view itself,
    // because the tail pin would otherwise leave it above the viewport. "Comment"
    // is the upstream-only item; the fork offers "Cancel" and "Add to chat" over
    // a comment box.
    steps: [PIN_TAIL, { action: 'select', selector: '.paragraph-node', chars: 24, ms: 500 }],
    requires: [
      { name: 'selection-menu-comment', text: /Comment/ },
      { name: 'selection-menu-add-to-chat', text: /Add to chat/ },
    ],
  },
  {
    name: 'behaviour-settings-pane',
    desktopOnly: true,
    // The settings dialog's own labels are UI text, so this scene is English-only.
    // It states the pane's contents and the one transition that has a trap: a
    // click outside must dismiss it (both apps do; measured), and while it is open
    // the controls behind it are unreachable, which is why `DISCOVER_EXPR`
    // hit-tests a control's centre before the walk clicks it.
    enOnly: true,
    // `expect` is what makes a variant's acceptance mean "the dialog opened":
    // without it the runner keeps the first variant that changes the surface at
    // all, so a click that only opens the account menu wins the race and the
    // dialog requirements then fail on both apps (measured).
    expect: /Appearance/,
    // The two apps reach Settings by different routes (see the `settings` scene).
    // The same routes the base `settings` scene uses: a shortened list is not
    // equivalent, because the first route is a coordinate click that the footer
    // row does not always receive, and the base scene falls through to the ones
    // that do. Each route pins the transcript first.
    attempts: SETTINGS_ROUTES,
    requires: [
      // `.settings-dialog` does not exist on either app (upstream's is
      // `.settings-dialog-title` inside its tabs header), so the dialog marker and
      // the text scopes are the shell both apps actually share: `.ui-dialog`.
      { name: 'settings-dialog-open', present: '.ui-dialog' },
      { name: 'settings-section-appearance', within: '.ui-dialog', text: /Appearance/ },
      { name: 'settings-section-account', within: '.ui-dialog', text: /Account/ },
      { name: 'settings-font-size-row', within: '.ui-dialog', text: /Adjust interface and message text size/ },
    ],
    then: {
      name: 'dismissed',
      // The viewport corner: no dialog covers it, so the click lands on the
      // backdrop on both apps.
      steps: [{ action: 'clickPoint', x: 20, y: 20, ms: 500 }],
      requires: [{ name: 'settings-dialog-dismissed', absent: '.ui-dialog' }],
    },
  },
  {
    name: 'behaviour-sidebar-workspace-collapse',
    desktopOnly: true,
    // The left panel's workspace control is one toggle: collapsing hides every
    // workspace's session list and the same control brings it back. Addressed by
    // class rather than by its label (which flips between "Collapse all
    // workspaces" and "Expand all workspaces"), so this scene holds in both
    // locales.
    steps: [PIN_TAIL, { action: 'click', selector: '.side-section-toggle', ms: 500 }],
    requires: [
      { name: 'sidebar-groups-collapsed', absent: '.group-sessions' },
      { name: 'sidebar-toggle-present', present: '.side-section-toggle' },
    ],
    then: {
      name: 'restored',
      steps: [{ action: 'click', selector: '.side-section-toggle', ms: 500 }],
      requires: [{ name: 'sidebar-groups-restored', present: '.group-sessions' }],
    },
  },
];

export const BASE_SCENES = [
  { name: 'main', steps: [PIN_TAIL] },
  {
    name: 'settings',
    // Same route list as the behaviour scene for this pane.
    attempts: SETTINGS_ROUTES,
    steps: [PIN_TAIL, { action: 'clickText', text: 'Settings', ms: 350 }],
    // The scene must actually LOOK like settings: with several fallback routes,
    // a click that opens some other surface (a model menu, the account menu)
    // would otherwise be captured under the name "settings" and poison the
    // comparison. Both locales, since the run covers en and zh.
    expect: /settings|appearance|theme|language|provider|plugin|permission|account|设置|外观|主题|语言|提供方|插件|权限|账户/i,
  },
  ...BEHAVIOUR_SCENES,
];

// A control that only changes computed styles (a plain button hover) is not a
// surface; a control that opens a popup, menu, dialog or tooltip is. The walk
// records both, so "no change" is a finding rather than a silent nothing.
export const PHASES = BASE_SCENES.map((scene) => scene.name);

// Controls that change server or account state rather than opening a surface.
// Clicking them during a walk would either do nothing (the mock has no such
// route) or destroy the state the remaining surfaces need.
export const SKIP_LABEL =
  /delete|archive|remove|sign out|log out|log-out|logout|kill|uninstall|reset|clear all|empty|shutdown/i;

export const DISCOVER_EXPR = `(() => {
  const out = [];
  const seen = new Set();
  const nodes = document.querySelectorAll(
    'button, [role="button"], [role="menuitem"], [role="tab"], [role="switch"], [role="checkbox"], summary, select, [aria-haspopup], [data-menu-trigger]',
  );
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    const cs = getComputedStyle(el);
    // A control hidden by opacity/visibility is usually revealed by hovering its
    // row (the fork hides section-head and row actions that way). Keep it in the
    // inventory, flagged, so the walk can hover first and then click — skipping
    // it here would silently drop those controls from coverage.
    const hidden = cs.visibility === 'hidden' || cs.opacity === '0';
    if (cs.display === 'none') continue;
    // A control a modal covers cannot be acted on: the click lands on the dialog
    // (or on its backdrop, which closes it), so the state the walk records is not
    // the control's surface at all. With the settings dialog open, both apps then
    // reported ~50 phantom differences per state, because one app's dialog covered
    // the discovered pill's coordinates and the other's did not.
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const cover = document.elementFromPoint(cx, cy);
    if (cover && cover !== el && !el.contains(cover) && !cover.contains(el)) continue;
    const label = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
    const classes = Array.from(el.classList).sort();
    const key = el.tagName + '#' + (el.id || '') + '.' + classes.join('.') + ':' + label;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      label,
      tag: el.tagName,
      classes: classes.slice(0, 4),
      hidden,
      x: Math.round(cx),
      y: Math.round(cy),
    });
    if (out.length >= ${MAX_DISCOVERED}) break;
  }
  return out;
})()`;

export function slug(label, tag, index) {
  const base = `${tag ?? 'el'}-${label ?? ''}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 34);
  // A surface is paired with its counterpart on the other app by name, so a
  // control the two apps share has to name itself the same way on both. The
  // discovery index cannot do that (each app discovers its own controls in its
  // own order); it is dropped for the shared controls, which pass a null index.
  const prefix = index === null || index === undefined ? '' : `${String(index).padStart(2, '0')}-`;
  return `${prefix}${base || 'surface'}`;
}
