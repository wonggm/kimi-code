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
const PIN_TAIL = { action: 'scrollBottom', selector: '.chat-scroll', ms: 700 };

export const BASE_SCENES = [
  { name: 'main', steps: [PIN_TAIL] },
  {
    name: 'settings',
    // The two apps hide Settings in different places: the fork has a labelled
    // item in the sidebar footer, upstream puts it behind the account menu. Try
    // the plain route first, then the account-menu route, and let the runner
    // keep whichever one actually opens the surface.
    // Every route pins the tail first, so the settings capture also compares the
    // main surface behind the dialog in one scroll state.
    // Routes are ordered most-reliable first: the walk accepts the first variant
    // that CHANGES the surface, so a text route that opens the wrong menu would
    // win the race and poison the capture. The fork has a stable labelled footer
    // item; upstream reaches Settings from the account row, whose label follows
    // the locale (Not signed in / Sign in / 未登录 / 登录).
    attempts: [
      [{ action: 'click', selector: '.side-footer-settings', ms: 900 }],
      [{ action: 'clickText', text: 'Not signed in', ms: 700 }, { action: 'clickText', text: 'Settings', ms: 900 }],
      [{ action: 'clickText', text: 'Sign in', ms: 700 }, { action: 'clickText', text: 'Settings', ms: 900 }],
      [{ action: 'clickText', text: '未登录', ms: 700 }, { action: 'clickText', text: '设置', ms: 900 }],
      [{ action: 'clickText', text: '登录', ms: 700 }, { action: 'clickText', text: '设置', ms: 900 }],
      [{ action: 'clickText', text: 'Settings', ms: 900 }],
      [{ action: 'clickText', text: '设置', ms: 900 }],
      [{ action: 'click', selector: '[aria-label="Settings"]', ms: 900 }],
      [{ action: 'click', selector: '[aria-label="设置"]', ms: 900 }],
      // Mobile: neither app has the desktop footer. The fork hides its settings
      // sheet behind the header control, upstream behind an icon button, so try
      // the generic routes too - a miss is recorded as a gap, not silently
      // treated as "settings matched".
      [{ action: 'click', selector: '[aria-label*="ettings" i]', ms: 900 }],
      [{ action: 'click', selector: '[aria-label*="设置"]', ms: 900 }],
      [{ action: 'clickText', text: 'More', ms: 700 }, { action: 'clickText', text: 'Settings', ms: 900 }],
      [{ action: 'clickText', text: '更多', ms: 700 }, { action: 'clickText', text: '设置', ms: 900 }],
      [{ action: 'clickText', text: 'Menu', ms: 700 }, { action: 'clickText', text: 'Settings', ms: 900 }],
      [{ action: 'click', selector: 'header button:last-of-type', ms: 900 }],
      [{ action: 'click', selector: '.topbar button:last-of-type', ms: 900 }],
    ].map((attempt) => [PIN_TAIL, ...attempt]),
    steps: [PIN_TAIL, { action: 'clickText', text: 'Settings', ms: 900 }],
    // The scene must actually LOOK like settings: with several fallback routes,
    // a click that opens some other surface (a model menu, the account menu)
    // would otherwise be captured under the name "settings" and poison the
    // comparison. Both locales, since the run covers en and zh.
    expect: /settings|appearance|theme|language|provider|plugin|permission|account|设置|外观|主题|语言|提供方|插件|权限|账户/i,
  },
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
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2),
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
