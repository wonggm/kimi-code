// apps/kimi-web/src/lib/browserReference.ts
// Browser references: an element or a region the agent captured on a page, sent
// to the composer as an inline reference. Upstream carries the capture and the
// reference beside the composer snapshot, and serialises the reference into the
// message text as `[label](kimi-code-composer://browser-references/<refId>)` —
// that link is what a message renders as a reference pill, and this module owns
// the two ends of it plus the validation upstream applies to a stored capture.

export const BROWSER_REFERENCE_DEST_PREFIX = 'kimi-code-composer://browser-references/';

/** The refId inside a browser-reference destination, or '' when the destination
 *  is not one. The tokenizer hands the pill the whole destination (already
 *  percent-decoded), and every resolver — the tip, the dialog — keys on the
 *  bare refId, so the two ends meet here. */
export function browserReferenceIdFromDest(dest: string): string {
  return dest.startsWith(BROWSER_REFERENCE_DEST_PREFIX)
    ? dest.slice(BROWSER_REFERENCE_DEST_PREFIX.length)
    : '';
}

/** The target of a capture: one element (with its locator) or a region. */
export interface BrowserCaptureTarget {
  kind: 'element' | 'region';
  tagName?: string;
  role?: string;
  accessibleName?: string;
  text?: string;
  locator?: { selector?: string; xpath?: string; framePath?: string[] };
  bounds?: { x: number; y: number; width: number; height: number };
  attributes?: Record<string, string>;
  attributesTruncated?: boolean;
}

/** One page capture, in the shape the engine stores it. `label` is what every
 *  surface titles the reference with; `screenshot` names the attachment that
 *  holds the pixels. */
export interface BrowserCapture {
  id: string;
  version: 1;
  ordinal: number;
  label: string;
  capturedAt: string;
  page: { url: string; title: string };
  target: BrowserCaptureTarget;
  viewport: {
    width: number;
    height: number;
    scrollX: number;
    scrollY: number;
    zoomFactor: number;
    devicePixelRatio: number;
  };
  screenshot?: { attachmentId: string; pixelWidth: number; pixelHeight: number; crop?: { x: number; y: number; width: number; height: number } };
}

/** One reference: the capture it points at, plus what the user said about it. */
export interface BrowserReference {
  id: string;
  captureId: string;
  comment?: string;
  includeScreenshot?: boolean;
}

/** What a capture's thumbnail is resolved through: the attachment's file id. */
export interface BrowserReferenceAttachment {
  attId: string;
  fileId?: string;
  sessionId?: string;
  thumbnailUrl?: string;
}

export type BrowserScreenshotState = 'uploading' | 'failed';

/** One resolved reference as the dialog shows it: the capture, the reference
 *  record, and what the message's attachments can show of it. */
export interface BrowserReferenceView {
  id: string;
  capture: BrowserCapture;
  reference: BrowserReference;
  /** Object or media URL of the capture's thumbnail, when one is available. */
  thumbnail?: string;
  /** The capture's screenshot attachment. A session-media id is fetched with
   *  the bearer credential through the session's media route — a bare file URL
   *  401s in an `<img>`. */
  screenshot?: { attId: string; fileId?: string; sessionId?: string };
  /** Set while the capture's screenshot attachment is still moving. */
  screenshotState?: BrowserScreenshotState;
  /** True when the screenshot upload can be attempted again. */
  canRetry: boolean;
  readOnly: boolean;
}

/** What the dialog hands back when it settles. */
export interface BrowserReferenceResolution {
  comment: string;
  includeScreenshot: boolean;
  retryScreenshot: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function num(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : undefined;
}

function targetOf(value: unknown): BrowserCaptureTarget | undefined {
  if (!isRecord(value)) return undefined;
  const kind = value['kind'];
  if (kind !== 'element' && kind !== 'region') return undefined;
  const bounds = isRecord(value['bounds'])
    ? {
        x: num(value['bounds']['x'], -1e6, 1e6) ?? 0,
        y: num(value['bounds']['y'], -1e6, 1e6) ?? 0,
        width: num(value['bounds']['width'], 0, 1e6) ?? 0,
        height: num(value['bounds']['height'], 0, 1e6) ?? 0,
      }
    : undefined;
  const locator = isRecord(value['locator'])
    ? {
        selector: typeof value['locator']['selector'] === 'string' ? value['locator']['selector'] : undefined,
        xpath: typeof value['locator']['xpath'] === 'string' ? value['locator']['xpath'] : undefined,
        framePath: Array.isArray(value['locator']['framePath'])
          ? (value['locator']['framePath'] as unknown[]).filter((v): v is string => typeof v === 'string')
          : undefined,
      }
    : undefined;
  const attributes = isRecord(value['attributes'])
    ? Object.fromEntries(Object.entries(value['attributes']).filter((e): e is [string, string] => typeof e[1] === 'string'))
    : undefined;
  return {
    kind,
    tagName: typeof value['tagName'] === 'string' ? value['tagName'] : undefined,
    role: typeof value['role'] === 'string' ? value['role'] : undefined,
    accessibleName: typeof value['accessibleName'] === 'string' ? value['accessibleName'] : undefined,
    text: typeof value['text'] === 'string' ? value['text'] : undefined,
    locator,
    bounds,
    attributes,
    attributesTruncated: value['attributesTruncated'] === true ? true : undefined,
  };
}

/** Validate a stored capture the way upstream does, or null when it cannot be
 *  trusted. A capture that fails here has no title, no page and no target, so
 *  nothing can be rendered from it. */
export function normalizeBrowserCapture(value: unknown): BrowserCapture | null {
  if (!isRecord(value)) return null;
  if (value['version'] !== 1) return null;
  if (!isId(value['id']) || !isId(value['label'])) return null;
  const ordinal = num(value['ordinal'], 1, Number.MAX_SAFE_INTEGER);
  if (ordinal === undefined || !Number.isInteger(ordinal)) return null;
  const capturedAt = value['capturedAt'];
  if (typeof capturedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(capturedAt)) return null;
  if (Number.isNaN(Date.parse(capturedAt))) return null;
  const page = value['page'];
  const viewport = value['viewport'];
  if (!isRecord(page) || typeof page['url'] !== 'string' || typeof page['title'] !== 'string') return null;
  if (!isRecord(viewport)) return null;
  try {
    const parsed = new URL(page['url']);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  const target = targetOf(value['target']);
  if (target === undefined) return null;
  const width = num(viewport['width'], 1, Number.MAX_SAFE_INTEGER);
  const height = num(viewport['height'], 1, Number.MAX_SAFE_INTEGER);
  const scrollX = num(viewport['scrollX'], -1e6, 1e6);
  const scrollY = num(viewport['scrollY'], -1e6, 1e6);
  const zoomFactor = num(viewport['zoomFactor'], 0.01, 64);
  const devicePixelRatio = num(viewport['devicePixelRatio'], 0.01, 64);
  if ([width, height, scrollX, scrollY, zoomFactor, devicePixelRatio].some((v) => v === undefined)) return null;

  let screenshot: BrowserCapture['screenshot'];
  const raw = value['screenshot'];
  if (isRecord(raw)) {
    const pixelWidth = num(raw['pixelWidth'], 1, 32768);
    const pixelHeight = num(raw['pixelHeight'], 1, 32768);
    if (!isId(raw['attachmentId']) || pixelWidth === undefined || pixelHeight === undefined) return null;
    if (!Number.isInteger(pixelWidth) || !Number.isInteger(pixelHeight)) return null;
    screenshot = { attachmentId: raw['attachmentId'], pixelWidth, pixelHeight };
  }

  return {
    id: value['id'],
    version: 1,
    ordinal,
    label: value['label'],
    capturedAt,
    page: { url: page['url'], title: page['title'] },
    target,
    viewport: {
      width: width!,
      height: height!,
      scrollX: scrollX!,
      scrollY: scrollY!,
      zoomFactor: zoomFactor!,
      devicePixelRatio: devicePixelRatio!,
    },
    screenshot,
  };
}

/** Validate one reference, or null when its identity is unusable. */
export function normalizeBrowserReference(value: unknown): BrowserReference | null {
  if (!isRecord(value)) return null;
  if (!isId(value['id']) || !isId(value['captureId'])) return null;
  if (value['comment'] !== undefined && typeof value['comment'] !== 'string') return null;
  if (value['includeScreenshot'] !== undefined && typeof value['includeScreenshot'] !== 'boolean') return null;
  return {
    id: value['id'],
    captureId: value['captureId'],
    comment: typeof value['comment'] === 'string' ? value['comment'] : undefined,
    includeScreenshot: value['includeScreenshot'] === true ? true : value['includeScreenshot'] === false ? false : undefined,
  };
}

/** Serialise a reference into the inline link form both apps write into message
 *  text (upstream's `HT`). */
export function browserReferenceToText(reference: { refId: string; label: string }): string {
  const label = reference.label
    .replaceAll('%', '%25')
    .replaceAll('&', '%26')
    .replaceAll('<', '%3C')
    .replaceAll('>', '%3E')
    .replaceAll(/([[\]])/g, '\\$1')
    .replaceAll('\n', '%0A')
    .replaceAll('\r', '%0D');
  return `[${label}](${BROWSER_REFERENCE_DEST_PREFIX}${encodeURIComponent(reference.refId)})`;
}

/** Upstream prints a capture's timestamp as `YYYY-MM-DD HH:MM` in local time. */
export function formatCapturedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The line a capture's target is described by — the element's selector when it
 *  has one, else its tag. */
export function browserCaptureTargetLine(capture: BrowserCapture): string {
  const target = capture.target;
  if (target.kind !== 'element') return '';
  return target.locator?.selector ?? target.tagName ?? '';
}

/** Key the composer snapshot is stored under on a message's metadata — the same
 *  key upstream reads a user message's composer state from. */
export const COMPOSER_SNAPSHOT_METADATA_KEY = 'kimiWeb.composerSnapshot';

/** One reference the app can resolve a pill against: the reference record, the
 *  capture it points at, and the attachment holding the capture's screenshot. */
export interface BrowserReferenceEntry {
  id: string;
  label: string;
  reference: BrowserReference;
  capture?: BrowserCapture;
  screenshot?: { attId: string; fileId?: string; sessionId?: string };
}

/** Everything one composer snapshot carries about browser references. */
interface ComposerSnapshotRefs {
  references: BrowserReference[];
  captures: BrowserCapture[];
  screenshots: Map<string, { attId: string; fileId?: string; sessionId?: string }>;
}

function readComposerSnapshot(raw: unknown): ComposerSnapshotRefs | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const references = (Array.isArray(parsed['browserReferences']) ? parsed['browserReferences'] : [])
    .map(normalizeBrowserReference)
    .filter((entry): entry is BrowserReference => entry !== null);
  const captures = (Array.isArray(parsed['browserCaptures']) ? parsed['browserCaptures'] : [])
    .map(normalizeBrowserCapture)
    .filter((entry): entry is BrowserCapture => entry !== null);
  const screenshots = new Map<string, { attId: string; fileId?: string; sessionId?: string }>();
  for (const attachment of Array.isArray(parsed['attachments']) ? parsed['attachments'] : []) {
    if (!isRecord(attachment) || !isId(attachment['attId'])) continue;
    screenshots.set(attachment['attId'], {
      attId: attachment['attId'],
      fileId: typeof attachment['fileId'] === 'string' ? attachment['fileId'] : undefined,
      sessionId: typeof attachment['sessionId'] === 'string' ? attachment['sessionId'] : undefined,
    });
  }
  return references.length === 0 ? null : { references, captures, screenshots };
}

/**
 * Collect every browser reference the given messages carry, keyed by reference
 * id. A message's composer snapshot is where a reference and its capture live,
 * so this is the whole registry a pill, its hover tip and the reference dialog
 * read from. Later messages win, so a re-sent reference resolves to its latest
 * capture.
 */
export function collectBrowserReferences(
  messages: readonly { metadata?: Record<string, unknown> }[],
): Map<string, BrowserReferenceEntry> {
  const out = new Map<string, BrowserReferenceEntry>();
  for (const message of messages) {
    const snapshot = readComposerSnapshot(message.metadata?.[COMPOSER_SNAPSHOT_METADATA_KEY]);
    if (snapshot === null) continue;
    const captures = new Map(snapshot.captures.map((capture) => [capture.id, capture]));
    for (const reference of snapshot.references) {
      const capture = captures.get(reference.captureId);
      const attachmentId = capture?.screenshot?.attachmentId;
      out.set(reference.id, {
        id: reference.id,
        label: capture?.label ?? reference.id,
        reference,
        capture,
        screenshot: attachmentId === undefined ? undefined : snapshot.screenshots.get(attachmentId),
      });
    }
  }
  return out;
}
