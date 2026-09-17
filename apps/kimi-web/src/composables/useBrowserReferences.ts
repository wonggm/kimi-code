// apps/kimi-web/src/composables/useBrowserReferences.ts
// Browser references as the app can see them: the registry every reference pill
// resolves against (built from the active session's message metadata), and the
// one dialog a pill opens.
//
// Upstream splits this in two: a live browser host provides the captures and
// opens the reference editor (`composer-browser-reference-host`), and when no
// host is there the same dialog runs read-only off the composer snapshot. A web
// build has no live browser session, so the read-only half is the whole story
// here — the snapshot is the only source, and the dialog is always read-only.

import { computed, ref, type ComputedRef } from 'vue';
import { useKimiWebClient } from './useKimiWebClient';
import type { BrowserReferenceEntry, BrowserReferenceResolution, BrowserReferenceView } from '../lib/browserReference';

/** The reference id whose dialog is open, or null. Module-level: the pills that
 *  open it live deep in the transcript and the host that renders it sits at the
 *  app root. */
const openRefId = ref<string | null>(null);

export interface BrowserReferenceMenuRow {
  refId: string;
  label: string;
  title?: string;
  url?: string;
}

export interface UseBrowserReferences {
  /** Every reference the active session can resolve, in message order. */
  entries: ComputedRef<BrowserReferenceEntry[]>;
  /** The @-mention menu's rows — the same references, titled by their page. */
  menuRows: ComputedRef<BrowserReferenceMenuRow[]>;
  resolve: (refId: string) => BrowserReferenceEntry | null;
  open: (refId: string) => void;
  /** The dialog's state, or null while it is closed. */
  dialogState: ComputedRef<BrowserReferenceView | null>;
  closeDialog: () => void;
  /** The dialog resolved: the app holds no live session to apply an edit to, so
   *  a resolution only ever closes it. */
  settleDialog: (id: string, value: BrowserReferenceResolution | null) => void;
}

export function useBrowserReferences(): UseBrowserReferences {
  const client = useKimiWebClient();

  const entries = computed<BrowserReferenceEntry[]>(() => [...client.browserReferences.value.values()]);

  const byId = computed<Map<string, BrowserReferenceEntry>>(() => client.browserReferences.value);

  const menuRows = computed<BrowserReferenceMenuRow[]>(() =>
    entries.value.map((entry) => ({
      refId: entry.id,
      label: entry.label,
      title: entry.capture?.page.title,
      url: entry.capture?.page.url,
    })),
  );

  function resolve(refId: string): BrowserReferenceEntry | null {
    return byId.value.get(refId) ?? null;
  }

  function open(refId: string): void {
    if (!byId.value.has(refId)) return;
    openRefId.value = refId;
  }

  const dialogState = computed<BrowserReferenceView | null>(() => {
    const id = openRefId.value;
    if (id === null) return null;
    const entry = byId.value.get(id);
    const capture = entry?.capture;
    if (entry === undefined || capture === undefined) return null;
    return {
      id: entry.id,
      capture,
      reference: entry.reference,
      screenshot: entry.screenshot,
      screenshotState: undefined,
      canRetry: false,
      readOnly: true,
    };
  });

  function closeDialog(): void {
    openRefId.value = null;
  }

  function settleDialog(id: string, _value: BrowserReferenceResolution | null): void {
    if (openRefId.value === id) openRefId.value = null;
  }

  return { entries, menuRows, resolve, open, dialogState, closeDialog, settleDialog };
}
