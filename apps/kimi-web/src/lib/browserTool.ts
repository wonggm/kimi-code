// apps/kimi-web/src/lib/browserTool.ts
// The in-app browser's tool calls, labelled the way upstream's bundle labels
// them. The browser reaches the transcript as one MCP tool
// (`mcp__desktop_browser__run`) whose input names an operation in the
// `kimi.browser/1.0.0` protocol; upstream maps that operation onto a short
// action name and picks a label from `tools.browser.actions.<action>.<phase>`,
// where the phase is `approval` (a pending approval card), `running`, `ok` or
// `error`. This module owns that mapping and the detail line under it, so the
// tool card and the approval card read one implementation.

import { i18n } from '../i18n';

const t = i18n.global.t;

export const BROWSER_TOOL_NAME = 'mcp__desktop_browser__run';
export const BROWSER_PROTOCOL = 'kimi.browser/1.0.0';

export function isBrowserToolName(name: string): boolean {
  return name === BROWSER_TOOL_NAME;
}

/** Protocol operation → upstream's short action name (`Oq` in its bundle).
 *  Operations the list does not carry fall back to `other`. */
const ACTION_BY_OPERATION: Record<string, string> = {
  'page.wait_for': 'waitCondition',
  'page.visual.crop': 'crop',
  'page.text.snapshot': 'readText',
  'browser.get_history': 'listHistory',
  'browser.get_downloads': 'listDownloads',
  'browser.get_device_profiles': 'listDevices',
  'tab.set_device_mode': 'setDevice',
  'browser.get_state': 'inspectBrowser',
  'browser.activate_panel': 'showBrowser',
  'browser.create_tab': 'createTab',
  'browser.activate_tab': 'activateTab',
  'browser.switch_tab': 'switchTab',
  'browser.release_tab': 'releaseTab',
  'browser.close_tab': 'closeTab',
  'tab.get_state': 'inspectPage',
  'tab.navigate': 'navigate',
  'tab.go_back': 'back',
  'tab.go_forward': 'forward',
  'tab.reload': 'reload',
  'tab.stop_loading': 'stop',
  'tab.wait_for_load': 'wait',
  'page.visual.snapshot': 'screenshot',
  'page.visual.click': 'click',
  'page.visual.click_if_interactive': 'guardedClick',
  'page.visual.hover': 'hover',
  'page.visual.scroll': 'scroll',
  'page.visual.drag': 'drag',
  'page.visual.type_text': 'type',
  'page.visual.press_key': 'press',
  'page.elements.snapshot': 'elements',
  'page.element.click': 'click',
  'page.element.hover': 'hover',
  'page.element.fill': 'fill',
  'page.element.type_text': 'type',
  'page.element.press_key': 'press',
  'page.element.select_option': 'select',
  'page.element.set_checked': 'check',
  'page.element.scroll_into_view': 'reveal',
};

export type BrowserActionPhase = 'approval' | 'running' | 'ok' | 'error';

export type BrowserToolStatus = 'ok' | 'running' | 'error';

export interface BrowserToolView {
  label: string;
  detail: string;
  status: BrowserToolStatus;
}

/** The element/page names of the calls around this one, when the transcript
 *  could resolve them: upstream looks a call's element name up in the element
 *  snapshots of the same turn. */
export interface BrowserToolContext {
  element?: string;
  page?: string;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Parse a JSON object out of one output line — upstream's `Za`. */
function parseObject(line: string | undefined): Record<string, unknown> | null {
  const text = (line ?? '').trim();
  if (!text.startsWith('{')) return null;
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** One collapsed, clipped line — upstream's `rd`. */
function oneLine(value: unknown, max = 160): string {
  return typeof value === 'string' ? value.replaceAll(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** A URL reduced to `host/first-segment` — upstream's `WN`. */
function domainOf(url: string): string {
  try {
    const parsed = new URL(url);
    const segment = parsed.pathname.split('/').filter(Boolean)[0];
    return segment ? `${parsed.host}/${segment}` : parsed.host;
  } catch {
    return url.replace(/^https?:\/\//, '');
  }
}

/** A tab's own label: its title, else its domain — upstream's `Y3`. */
function tabLabel(tab: unknown): string {
  const record = asRecord(tab);
  return oneLine(record?.['title']) || (asString(record?.['url']) ? oneLine(domainOf(asString(record?.['url'])!)) : '');
}

/** A viewport point as upstream prints it: `(x, y)`. */
function pointLabel(value: unknown): string {
  const record = asRecord(value);
  const x = asNumber(record?.['x']);
  const y = asNumber(record?.['y']);
  return x === undefined || y === undefined ? '' : `(${Math.round(x)}, ${Math.round(y)})`;
}

/** The parsed `kimi.browser/1.0.0` action on a tool call's argument. */
export function browserToolInput(arg: string): Record<string, unknown> | undefined {
  return parseObject(arg) ?? undefined;
}

/** The operation a call names, or '' when the argument is not a browser
 *  action. */
export function browserToolOperation(arg: string): string {
  const input = browserToolInput(arg);
  return input?.['protocol'] === BROWSER_PROTOCOL ? asString(input['operation']) ?? '' : '';
}

/** The result envelope the browser tool returns: the first output that parses
 *  to an object carrying a boolean `ok`. */
export function browserToolResult(output?: string[]): Record<string, unknown> | undefined {
  for (const line of output ?? []) {
    const parsed = parseObject(line);
    if (typeof parsed?.['ok'] === 'boolean') return parsed;
  }
  const joined = (output ?? []).join('\n');
  const parsed = parseObject(joined);
  return typeof parsed?.['ok'] === 'boolean' ? parsed : undefined;
}

/** The action name a call resolves to, after the special cases upstream folds
 *  in (a second click is a double click, `checked: false` is an uncheck). */
export function browserToolAction(operation: string, input: Record<string, unknown>): string {
  let action = Object.hasOwn(ACTION_BY_OPERATION, operation) ? ACTION_BY_OPERATION[operation]! : 'other';
  if (operation === 'page.element.set_checked' && input['checked'] === false) action = 'uncheck';
  if (operation === 'page.visual.click' && input['clickCount'] === 2) action = 'doubleClick';
  else if (operation === 'page.visual.click' && input['button'] === 'right') action = 'rightClick';
  return action;
}

/** The label, detail line and status of one browser tool call. Pass a phase to
 *  read the labels a pending approval shows instead of the call's own status. */
export function browserToolView(
  call: { arg: string; output?: string[]; status: string },
  context?: BrowserToolContext,
  phase?: BrowserActionPhase,
): BrowserToolView {
  const input = browserToolInput(call.arg) ?? {};
  const result = browserToolResult(call.output);
  const operation = input['protocol'] === BROWSER_PROTOCOL ? asString(input['operation']) ?? '' : '';
  const action = browserToolAction(operation, input);
  const status: BrowserToolStatus =
    call.status === 'error' || result?.['ok'] === false
      ? 'error'
      : call.status === 'running'
        ? 'running'
        : 'ok';

  const element = context?.element || t('tools.browser.element');
  const page = tabLabel(result?.['tab']) || context?.page || '';
  let detail = page;

  if (operation.startsWith('page.element.')) detail = element;

  if (action === 'navigate' || action === 'createTab') {
    const url = asString(input['url']);
    detail = url ? (phase === 'approval' ? url : oneLine(domainOf(url))) : page;
  } else if (action === 'type' || action === 'fill') {
    const text = oneLine(input['text']);
    detail = operation.startsWith('page.element.')
      ? t('tools.browser.textInElement', { text, target: element })
      : t('tools.browser.text', { text });
  } else if (action === 'press') {
    const keys = Array.isArray(input['keys'])
      ? (input['keys'] as unknown[]).filter((key): key is string => typeof key === 'string').map((key) => oneLine(key)).join(' + ')
      : '';
    detail = keys;
    if (context?.element) detail = t('tools.browser.keysOnElement', { keys, target: element });
  } else if (action === 'select') {
    const index = asNumber(input['index']);
    const option = oneLine(input['label']) || oneLine(input['value']) || (index === undefined ? '' : t('tools.browser.option', { index: index + 1 }));
    detail = option ? t('tools.browser.optionInElement', { option, target: element }) : element;
  } else if (operation === 'page.visual.click_if_interactive') {
    const click = asRecord(result?.['click']);
    detail = oneLine(asRecord(click?.['target'])?.['name']) || pointLabel(input);
    if (click?.['outcome'] === 'no_target' && Array.isArray(click['nearby'])) {
      detail = `${pointLabel(input)} · ${t('tools.browser.nearbyCount', { count: click['nearby'].length })}`;
    }
  } else if (operation === 'page.visual.click' || operation === 'page.visual.hover') {
    detail = pointLabel(input);
  } else if (action === 'drag') {
    detail = [pointLabel(input['from']), pointLabel(input['to'])].filter(Boolean).join(' → ');
  } else if (action === 'scroll') {
    const deltaX = asNumber(input['deltaX']) ?? 0;
    const deltaY = asNumber(input['deltaY']) ?? 0;
    const direction = Math.abs(deltaY) >= Math.abs(deltaX) ? (deltaY < 0 ? 'up' : 'down') : deltaX < 0 ? 'left' : 'right';
    detail = deltaX || deltaY ? t(`tools.browser.${direction}`) : page;
  } else if (action === 'elements') {
    const elements = asRecord(result?.['elements']);
    if (status === 'ok' && Array.isArray(elements?.['elements'])) {
      const count = elements['elements'].length;
      const label = t(elements['truncated'] === true ? 'tools.browser.elementsAtLeast' : 'tools.browser.elementsCount', { count });
      detail = page ? `${page} · ${label}` : label;
    }
  } else if (action === 'inspectBrowser') {
    const tabs = asRecord(result?.['browser'])?.['tabs'];
    if (Array.isArray(tabs)) detail = t('tools.browser.tabsCount', { count: tabs.length });
  }

  const noClickTarget =
    phase === undefined &&
    status === 'ok' &&
    operation === 'page.visual.click_if_interactive' &&
    asRecord(result?.['click'])?.['outcome'] === 'no_target';

  return {
    label: noClickTarget
      ? t('tools.browser.noClickTarget')
      : t(`tools.browser.actions.${action}.${phase ?? status}`),
    detail,
    status,
  };
}
