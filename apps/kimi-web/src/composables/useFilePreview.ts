// apps/kimi-web/src/composables/useFilePreview.ts
// File preview: download / path normalization / request-sequence guard. The
// preview IS the body of the panel's `file` tab, so the panel drives it:
// `requestFilePreview` opens or focuses the tab, and App.vue watches the active
// tab and calls `loadFilePreview` — upstream wires the same pair (its panel tab
// watcher calls `filePreview.openFilePreview` / `closeFilePreview`).

import { computed, provide, ref, watch, type InjectionKey, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { turnFilesForTurn } from '../lib/rightPanelTabs';
import { useRightPanel } from './useRightPanel';
import type { FileData, FilePreviewRequest } from '../types';
import type { useKimiWebClient } from './useKimiWebClient';

type KimiWebClient = ReturnType<typeof useKimiWebClient>;

/** Refresh handle published by useFilePreview so the preview component can show
 *  a refresh control when the file changed after it was loaded. Injected rather
 *  than prop-drilled because the preview is rendered from more than one pane. */
export interface FilePreviewRefreshHandle {
  /** Normalized path of the currently-open preview, null when none. */
  path: Ref<string | null>;
  /** Whether the loaded content is behind a change made in the session. */
  stale: Ref<boolean>;
  /** Whether a refresh request is in flight. */
  refreshing: Ref<boolean>;
  refresh: () => void;
}

export const FILE_PREVIEW_REFRESH_KEY: InjectionKey<FilePreviewRefreshHandle> =
  Symbol('kimi-web:file-preview-refresh');
/** The preview's own state, provided by the composable so a pane that lives
 *  elsewhere in the tree (the right panel's file tab) can render the same
 *  preview instead of keeping a second one alive. */
export const FILE_PREVIEW_STATE_KEY: InjectionKey<FilePreviewApi> =
  Symbol('kimi-web.file-preview-state') as InjectionKey<FilePreviewApi>;

export interface UseFilePreviewOptions {
  client: KimiWebClient;
}

export function useFilePreview({ client }: UseFilePreviewOptions) {
  const { t } = useI18n();
  const panel = useRightPanel();

  const previewTarget = ref<FilePreviewRequest | null>(null);
  const previewFile = ref<FileData | null>(null);
  const previewLoading = ref(false);
  const previewError = ref<string | null>(null);
  // Normalized workspace-relative path of the currently-open preview. Used for
  // the download URL so it matches the server's relative-path contract even when
  // the user opened the preview from an absolute path in the chat.
  const previewNormalizedPath = ref<string | null>(null);
  // Set when the previewed file was edited (Edit/Write tool) after the content
  // was loaded; the preview then offers a refresh instead of showing stale text.
  const previewStale = ref(false);
  const previewRefreshing = ref(false);
  // Number of Edit/Write tool entries for the previewed path at load time. Any
  // later change to that count means the on-screen content is behind.
  let loadedEditCount: number | null = null;
  // Incremented on every load so a slower earlier request can't overwrite the
  // result of a later one (request-sequence guard).
  let previewRequestSeq = 0;

  const previewDownloadUrl = computed(() => {
    const path = previewNormalizedPath.value;
    return path ? client.getFileDownloadUrl(path) : null;
  });
  const previewExternalActions = computed(() => previewTarget.value !== null);

  function trimTrailingSlash(path: string): string {
    return path.length > 1 ? path.replace(/\/+$/, '') : path;
  }

  function normalizeRelativePath(path: string): string {
    const out: string[] = [];
    for (const part of path.split(/[\\/]+/)) {
      if (!part || part === '.') continue;
      if (part === '..') {
        out.pop();
        continue;
      }
      out.push(part);
    }
    return out.join('/');
  }

  function normalizePreviewPath(inputPath: string): { path: string } | { error: string } {
    const raw = inputPath.trim();
    if (!raw) return { error: t('filePreview.errors.emptyPath') };
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
      return { error: t('filePreview.errors.unsupportedPath') };
    }
    if (raw.startsWith('~')) {
      return { error: t('filePreview.errors.outsideWorkspace') };
    }

    const cwd = trimTrailingSlash(client.status.value.cwd);
    if (raw.startsWith('/')) {
      if (!cwd || (raw !== cwd && !raw.startsWith(`${cwd}/`))) {
        return { error: t('filePreview.errors.outsideWorkspace') };
      }
      const relative = raw === cwd ? '' : raw.slice(cwd.length + 1);
      if (relative.split(/[\\/]+/).includes('..')) {
        return { error: t('filePreview.errors.outsideWorkspace') };
      }
      const path = normalizeRelativePath(relative);
      return path ? { path } : { error: t('filePreview.errors.isDirectory') };
    }

    if (raw.split(/[\\/]+/).includes('..')) {
      return { error: t('filePreview.errors.outsideWorkspace') };
    }

    const path = normalizeRelativePath(raw);
    return path ? { path } : { error: t('filePreview.errors.emptyPath') };
  }

  /** Compare two workspace paths tolerantly: tool args may carry an absolute
   *  path (or a leading `./`), while the preview holds the normalized relative
   *  one, so a suffix match on the final segments is also accepted. */
  function samePreviewPath(a: string, b: string): boolean {
    const left = a.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '');
    const right = b.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '');
    if (left === '' || right === '') return false;
    return left === right || left.endsWith(`/${right}`) || right.endsWith(`/${left}`);
  }

  /** How many Edit/Write tool entries in the active session touch `path`. */
  function editCountForPath(path: string): number {
    let count = 0;
    for (const turn of client.turns.value) {
      if (turn.role !== 'assistant') continue;
      for (const entry of turnFilesForTurn(turn)) {
        if (samePreviewPath(entry.path, path)) count += 1;
      }
    }
    return count;
  }

  function markPreviewLoaded(path: string): void {
    loadedEditCount = editCountForPath(path);
    previewStale.value = false;
  }

  // A later turn editing the previewed file flips the refresh affordance on.
  watch(
    () => [previewNormalizedPath.value, client.turns.value] as const,
    () => {
      const path = previewNormalizedPath.value;
      if (path === null || loadedEditCount === null) {
        previewStale.value = false;
        return;
      }
      previewStale.value = editCountForPath(path) !== loadedEditCount;
    },
  );

  async function refreshPreview(): Promise<void> {
    const path = previewNormalizedPath.value;
    if (path === null || previewRefreshing.value) return;
    const requestSeq = ++previewRequestSeq;
    previewRefreshing.value = true;
    try {
      const result = await client.readFileContent(path);
      if (requestSeq !== previewRequestSeq) return;
      if (result) {
        previewFile.value = { ...result, path: result.path || path };
        markPreviewLoaded(path);
      } else {
        previewError.value = t('filePreview.errors.loadFailed');
      }
    } catch (err) {
      if (requestSeq !== previewRequestSeq) return;
      previewError.value = err instanceof Error ? err.message : t('filePreview.errors.loadFailed');
    } finally {
      if (requestSeq === previewRequestSeq) previewRefreshing.value = false;
    }
  }

  /** The transcript's file links: open the panel's file tab for this path, or
   *  focus the one already open on it (upstream's keyed-by-path policy). The
   *  active-tab watcher then loads the content. */
  function requestFilePreview(target: FilePreviewRequest): void {
    panel.openFile(target.path, target.line);
  }

  /** Load a file into the preview state. The panel's active tab is the only
   *  caller — do not open a tab from here (that would re-enter the watcher). */
  async function loadFilePreview(target: FilePreviewRequest): Promise<void> {
    const requestSeq = ++previewRequestSeq;
    previewFile.value = null;
    previewError.value = null;
    previewLoading.value = true;
    previewTarget.value = target;
    previewNormalizedPath.value = null;
    previewStale.value = false;
    previewRefreshing.value = false;
    loadedEditCount = null;

    const normalized = normalizePreviewPath(target.path);
    if ('error' in normalized) {
      previewLoading.value = false;
      previewError.value = normalized.error;
      return;
    }
    previewNormalizedPath.value = normalized.path;

    try {
      const result = await client.readFileContent(normalized.path);
      // A newer load started while this one was in flight — discard the stale
      // result so the right-side panel shows the latest file.
      if (requestSeq !== previewRequestSeq) return;
      if (result) {
        previewFile.value = { ...result, path: result.path || normalized.path };
        markPreviewLoaded(normalized.path);
      } else {
        // readFileContent swallows daemon failures into null — show the error
        // state instead of a misleading 0-byte "empty file" (the cause is
        // already console.warn'd in readFileContent).
        previewError.value = t('filePreview.errors.loadFailed');
      }
    } catch (err) {
      if (requestSeq !== previewRequestSeq) return;
      previewError.value = err instanceof Error ? err.message : t('filePreview.errors.loadFailed');
    } finally {
      if (requestSeq === previewRequestSeq) {
        previewLoading.value = false;
      }
    }
  }

  function resetFilePreview(): void {
    // Invalidate any in-flight read so it doesn't publish after the tab closed.
    previewRequestSeq += 1;
    previewTarget.value = null;
    previewNormalizedPath.value = null;
    previewFile.value = null;
    previewError.value = null;
    previewLoading.value = false;
    previewStale.value = false;
    previewRefreshing.value = false;
    loadedEditCount = null;
  }

  function closeFilePreview(): void {
    resetFilePreview();
  }

  function openPreviewInEditor(): void {
    const path = previewFile.value?.path ?? previewTarget.value?.path;
    if (!path) return;
    void client.openWorkspaceFile(path, previewTarget.value?.line);
  }

  function revealPreviewFile(): void {
    const path = previewFile.value?.path ?? previewTarget.value?.path;
    if (!path) return;
    void client.revealWorkspaceFile(path);
  }

  provide(FILE_PREVIEW_REFRESH_KEY, {
    path: previewNormalizedPath,
    stale: previewStale,
    refreshing: previewRefreshing,
    refresh: () => {
      void refreshPreview();
    },
  });

  const api = {
    previewTarget,
    previewFile,
    previewLoading,
    previewError,
    previewStale,
    previewRefreshing,
    previewDownloadUrl,
    previewExternalActions,
    requestFilePreview,
    loadFilePreview,
    closeFilePreview,
    refreshPreview,
    openPreviewInEditor,
    revealPreviewFile,
  };
  provide(FILE_PREVIEW_STATE_KEY, api);
  return api;
}

export type FilePreviewApi = ReturnType<typeof useFilePreview>;
