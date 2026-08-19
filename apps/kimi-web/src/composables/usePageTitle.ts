// apps/kimi-web/src/composables/usePageTitle.ts
// Browser tab title. The base title is composed from the server's --web-title
// override (surfaced as web_title in GET /api/v1/meta), else the workspace
// directory name plus the active session title, so instances opened on
// different machines / worktrees are easy to tell apart.
// Prefixes an animated spinner when the agent is running so users can see
// activity at a glance.

import { computed, onUnmounted, ref, watch, watchEffect, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { getKimiWebApi } from '../api';
import { useKimiWebClient } from './useKimiWebClient';

/** Pure page-title composition — exported for unit tests. */
export function composePageTitle(parts: {
  /** Value of the server's --web-title flag (web_title in /meta); falsy = unset. */
  webTitle?: string | null;
  /** Workspace directory name (the active workspace's display name). */
  workspaceName?: string | null;
  /** Title of the active session. */
  sessionTitle?: string | null;
}): string {
  const { webTitle, workspaceName, sessionTitle } = parts;
  if (webTitle) return webTitle;
  if (workspaceName && sessionTitle) return `${workspaceName} · ${sessionTitle}`;
  if (workspaceName) return workspaceName;
  return 'Kimi Code Web';
}

export interface UsePageTitleOptions {
  running: Ref<boolean>;
  showAuthGate: Ref<boolean>;
  /** Pre-composed base title from the caller (e.g. the client's computed
   *  document base title). When provided it replaces the internal composition. */
  title?: Ref<string>;
  /** Server --web-title override; when omitted usePageTitle fetches /meta. */
  webTitle?: Ref<string | null | undefined>;
  /** Workspace directory name; when omitted it is read from the client state. */
  workspaceName?: Ref<string | null | undefined>;
  /** Active session title; when omitted it is read from the client state. */
  sessionTitle?: Ref<string | null | undefined>;
}

export function usePageTitle({ running, showAuthGate, title, webTitle, workspaceName, sessionTitle }: UsePageTitleOptions): void {
  const { t } = useI18n();

  // The client's typed getMeta() exposes web_title; when the caller didn't
  // hand in the --web-title override, fetch /meta once ourselves.
  const fetchedWebTitle = ref<string | null>(null);
  if (webTitle === undefined) {
    void (async () => {
      try {
        const meta = await getKimiWebApi().getMeta();
        fetchedWebTitle.value = meta.webTitle;
      } catch {
        // Non-fatal: the title falls back to the workspace/session composition.
      }
    })();
  }

  // The client's state is module-scoped, so reading it again here is cheap and
  // stays reactive (workspaces/sessions update the title as they change).
  const client = useKimiWebClient();
  const clientWorkspaceName = computed<string | null>(() => client.visibleWorkspace.value?.name ?? null);
  const clientSessionTitle = computed<string | null>(() => {
    const sid = client.activeSessionId.value;
    if (!sid) return null;
    return client.sessions.value.find((s) => s.id === sid)?.title ?? null;
  });

  const baseTitle = computed<string>(() => {
    if (title !== undefined) return title.value;
    return composePageTitle({
      webTitle: webTitle !== undefined ? webTitle.value : fetchedWebTitle.value,
      workspaceName: workspaceName !== undefined ? workspaceName.value : clientWorkspaceName.value,
      sessionTitle: sessionTitle !== undefined ? sessionTitle.value : clientSessionTitle.value,
    });
  });

  const SPINNER_FRAMES = ['◐', '◓', '◑', '◒'];
  const spinnerFrame = ref(0);
  let spinnerTimer: ReturnType<typeof setInterval> | null = null;

  function startSpinner(): void {
    if (spinnerTimer !== null) return;
    spinnerFrame.value = 0;
    spinnerTimer = setInterval(() => {
      spinnerFrame.value = (spinnerFrame.value + 1) % SPINNER_FRAMES.length;
    }, 250);
  }

  function stopSpinner(): void {
    if (spinnerTimer !== null) {
      clearInterval(spinnerTimer);
      spinnerTimer = null;
    }
    spinnerFrame.value = 0;
  }

  watch(running, (isRunning) => {
    if (isRunning) startSpinner();
    else stopSpinner();
  }, { immediate: true });

  const pageTitle = computed<string>(() => {
    const prefix = running.value ? `${SPINNER_FRAMES[spinnerFrame.value]} ` : '';
    if (showAuthGate.value) return `${prefix}${t('app.authPageTitle')} - Kimi Code Web`;
    return `${prefix}${baseTitle.value}`;
  });
  watchEffect(() => {
    if (typeof document !== 'undefined') document.title = pageTitle.value;
  });

  onUnmounted(() => {
    stopSpinner();
  });
}