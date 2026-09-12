<!-- apps/kimi-web/src/components/dialogs/SearchSessionsDialog.vue -->
<!-- Spotlight-style search, ported from upstream: the query field lives in the
     dialog body (`.sd-search`) with a clear button, the list is split into a
     workspaces section and a sessions section with counts, and the footer shows
     the three key hints (navigate / open / close). ↑/↓ move, ↵ opens, Esc
     closes. -->
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Session, WorkspaceView } from '../../types';
import { highlightHtml, snippet } from '../../lib/searchHighlight';
import Dialog from '../ui/Dialog.vue';
import Icon from '../ui/Icon.vue';
import Kbd from '../ui/Kbd.vue';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    sessions: Session[];
    workspaces?: WorkspaceView[];
    activeId: string;
  }>(),
  { workspaces: () => [] },
);

const emit = defineEmits<{
  select: [id: string];
  selectWorkspace: [workspaceId: string];
  close: [];
}>();

// The parent controls visibility with `v-if`, so the dialog is open whenever
// this component is mounted. Dialog owns focus trap, Esc/overlay close, and the
// close button; we forward its `close` event to the parent.
const open = ref(true);

const query = ref('');
const inputRef = ref<HTMLInputElement | null>(null);
const listRef = ref<HTMLElement | null>(null);

interface WorkspaceHit {
  workspace: WorkspaceView;
  inName: boolean;
  inPath: boolean;
}

interface SessionHit {
  session: Session;
  /** Title matched the query (controls title highlighting). */
  inTitle: boolean;
  /** Workspace name matched the query (controls workspace highlighting). */
  inWorkspace: boolean;
  /** Snippet of lastPrompt to preview beside the workspace name. */
  snippetText: string;
}

const RESULT_CAP = 200;
// Workspaces listed on an empty query, exactly as upstream caps them.
const EMPTY_QUERY_WORKSPACE_CAP = 3;

/** Standalone workspace hits: matched against the display name and the root path. */
const workspaceHits = computed<WorkspaceHit[]>(() => {
  const q = query.value.trim().toLowerCase();
  const out: WorkspaceHit[] = [];
  for (const ws of props.workspaces) {
    const inName = ws.name.toLowerCase().includes(q);
    const inPath = ws.shortPath.toLowerCase().includes(q);
    if (q.length > 0 && !inName && !inPath) continue;
    out.push({ workspace: ws, inName: q.length > 0 && inName, inPath: q.length > 0 && inPath });
    if (out.length >= (q.length > 0 ? RESULT_CAP : EMPTY_QUERY_WORKSPACE_CAP)) break;
  }
  return out;
});

/** Session hits, filtered by title + last prompt + workspace. */
const sessionHits = computed<SessionHit[]>(() => {
  const q = query.value.trim().toLowerCase();
  const out: SessionHit[] = [];
  for (const s of props.sessions) {
    const title = s.title ?? '';
    const last = s.lastPrompt ?? '';
    const ws = s.workspaceName ?? '';
    const inTitle = q.length > 0 && title.toLowerCase().includes(q);
    const inLast = q.length > 0 && last.toLowerCase().includes(q);
    const inWorkspace = q.length > 0 && ws.toLowerCase().includes(q);
    // Empty query → show the full (recent) list; otherwise require a hit.
    if (q.length > 0 && !inTitle && !inLast && !inWorkspace) continue;
    out.push({
      session: s,
      inTitle,
      inWorkspace,
      // Preview the last prompt whenever available; when searching, anchor the
      // snippet on the match (no-ops to the head when the title matched only).
      snippetText: last ? snippet(last, query.value) : '',
    });
    if (workspaceHits.value.length + out.length >= RESULT_CAP) break;
  }
  return out;
});

const results = computed(() => [...workspaceHits.value, ...sessionHits.value]);

const selectedIndex = ref(0);

watch(query, () => {
  selectedIndex.value = 0;
});

function clampIndex(i: number): number {
  const len = results.value.length;
  if (len === 0) return 0;
  return Math.max(0, Math.min(len - 1, i));
}

async function scrollSelectedIntoView(): Promise<void> {
  await nextTick();
  const el = listRef.value?.querySelector<HTMLElement>('[aria-selected="true"]');
  el?.scrollIntoView({ block: 'nearest' });
}

function move(delta: number): void {
  selectedIndex.value = clampIndex(selectedIndex.value + delta);
  void scrollSelectedIntoView();
}

function openWorkspace(id: string): void {
  emit('selectWorkspace', id);
  emit('close');
}

function openSession(id: string): void {
  emit('select', id);
  emit('close');
}

function openSelected(): void {
  const index = selectedIndex.value;
  const workspace = workspaceHits.value[index];
  if (workspace) {
    openWorkspace(workspace.workspace.id);
    return;
  }
  const session = sessionHits.value[index - workspaceHits.value.length];
  if (session) openSession(session.session.id);
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    move(1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    move(-1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    openSelected();
  }
  // Escape is intentionally left to bubble so Dialog closes the modal.
}

onMounted(() => {
  // Dialog also auto-focuses the first focusable element; this is a belt-and-
  // suspenders guarantee for the rare timing where it runs before mount.
  inputRef.value?.focus();
});
</script>

<template>
  <Dialog
    v-model:open="open"
    :title="t('sidebar.searchPlaceholder')"
    size="lg"
    height="fixed"
    :padded="false"
    @close="emit('close')"
  >
    <div class="sd-body">
      <div class="sd-search">
        <input
          ref="inputRef"
          v-model="query"
          class="ui-input ui-input--md"
          type="text"
          :placeholder="t('sidebar.searchPlaceholder')"
          :aria-label="t('sidebar.searchPlaceholder')"
          autocomplete="off"
          spellcheck="false"
          @keydown="onKeydown"
        />
        <span class="ui-tip">
          <button
            type="button"
            class="search-clear"
            :class="{ 'is-on': query.length > 0 }"
            tabindex="-1"
            :aria-label="t('sidebar.searchClear')"
            @click="query = ''"
          >
            <Icon name="close" size="sm" />
          </button>
        </span>
      </div>

      <div ref="listRef" class="sd-list" role="listbox">
        <template v-if="results.length > 0">
          <template v-if="workspaceHits.length > 0">
            <div class="sd-section" aria-hidden="true">
              <span>{{ t('sidebar.workspaces') }}</span>
              <span class="sd-section-count">{{ workspaceHits.length }}</span>
            </div>
            <button
              v-for="(hit, i) in workspaceHits"
              :key="hit.workspace.id"
              class="sd-row sd-row-ws"
              :class="{ on: i === selectedIndex }"
              role="option"
              :aria-selected="i === selectedIndex"
              @click="openWorkspace(hit.workspace.id)"
              @mousemove="selectedIndex = i"
            >
              <Icon class="sd-folder" name="folder" size="sm" />
              <!-- eslint-disable-next-line vue/no-v-html -- highlightHtml escapes the source before injecting <mark>. -->
              <span class="sd-ws-name" v-html="highlightHtml(hit.workspace.name, hit.inName ? query : '')"></span>
              <!-- eslint-disable-next-line vue/no-v-html -- highlightHtml escapes the source before injecting <mark>. -->
              <span class="sd-ws-path" v-html="highlightHtml(hit.workspace.shortPath, hit.inPath ? query : '')"></span>
            </button>
          </template>

          <template v-if="sessionHits.length > 0">
            <div class="sd-section" aria-hidden="true">
              <span>{{ t('sidebar.sessionsHeader') }}</span>
              <span class="sd-section-count">{{ sessionHits.length }}</span>
            </div>
            <button
              v-for="(hit, i) in sessionHits"
              :key="hit.session.id"
              class="sd-row"
              :class="{ on: workspaceHits.length + i === selectedIndex, active: hit.session.id === activeId }"
              role="option"
              :aria-selected="workspaceHits.length + i === selectedIndex"
              @click="openSession(hit.session.id)"
              @mousemove="selectedIndex = workspaceHits.length + i"
            >
              <span class="sd-line1">
                <!-- eslint-disable-next-line vue/no-v-html -- highlightHtml escapes the source before injecting <mark>. -->
                <span class="sd-title" v-html="highlightHtml(hit.session.title, hit.inTitle ? query : '')"></span>
                <span class="sd-time">{{ hit.session.time }}</span>
              </span>
              <span class="sd-line2">
                <!-- eslint-disable-next-line vue/no-v-html -- highlightHtml escapes the source before injecting <mark>. -->
                <span class="sd-meta-ws" v-html="highlightHtml(hit.session.workspaceName ?? hit.session.workspaceId ?? '', hit.inWorkspace ? query : '')"></span>
                <template v-if="hit.snippetText">
                  <span class="sd-meta-sep">·</span>
                  <!-- eslint-disable-next-line vue/no-v-html -- highlightHtml escapes the source before injecting <mark>. -->
                  <span class="sd-meta-snippet" v-html="highlightHtml(hit.snippetText, query)"></span>
                </template>
              </span>
            </button>
          </template>
        </template>
        <div v-else class="sd-empty">{{ t('sidebar.searchNoResults') }}</div>
      </div>

      <div class="sd-foot" aria-hidden="true">
        <span class="sd-hint"><Kbd :keys="['↑', '↓']" />{{ t('sidebar.searchHintSelect') }}</span>
        <span class="sd-dot">·</span>
        <span class="sd-hint"><Kbd :keys="['Enter']" />{{ t('sidebar.searchHintOpen') }}</span>
        <span class="sd-dot">·</span>
        <span class="sd-hint"><Kbd :keys="['Esc']" />{{ t('sidebar.searchHintClose') }}</span>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.sd-body {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-top: 4px;
}
.sd-search {
  position: relative;
  margin: 0 22px;
  padding-bottom: var(--space-1);
}
.sd-search :deep(.ui-input) { padding-right: 30px; }
.search-clear {
  position: absolute;
  top: 0;
  bottom: var(--space-1);
  right: var(--space-2);
  margin-block: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: var(--radius-full);
  background: var(--color-hover);
  color: var(--color-text-faint);
  cursor: pointer;
  visibility: hidden;
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out), visibility var(--duration-fast),
    background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out);
}
.search-clear.is-on { visibility: visible; opacity: 1; }
.search-clear:hover { background: var(--color-selected); color: var(--color-text-muted); }
.search-clear:focus-visible { outline: none; box-shadow: var(--p-focus-ring); }

.sd-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-1) var(--space-2);
  --sd-gutter: var(--p-ic-md);
  --sd-gap: var(--space-2);
}
.sd-section {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3) var(--space-1);
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  text-transform: uppercase;
  color: var(--color-text-faint);
  user-select: none;
}
.sd-section-count { font-weight: var(--weight-regular); }
.sd-section:first-child { padding-top: var(--space-1); }
.sd-section:not(:first-child) { margin-top: var(--space-1); border-top: 1px solid var(--color-line); }
.sd-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: none;
  border-radius: var(--radius-md);
  background: none;
  cursor: pointer;
  text-align: left;
  font-family: var(--font-ui);
  color: var(--color-text);
}
.sd-row:hover { background: var(--color-hover); }
.sd-row.on { background: var(--color-selected); }
.sd-row.active .sd-title { color: var(--color-accent-hover); }
.sd-row-ws { flex-direction: row; align-items: center; gap: var(--sd-gap); }
.sd-folder { flex: none; width: var(--sd-gutter); color: var(--color-text-muted); }
.sd-ws-name {
  flex: none;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-base);
  color: var(--color-text);
}
.sd-ws-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
  font-size: var(--text-xs);
  color: var(--color-text-faint);
}
.sd-line1,
.sd-line2 { padding-left: calc(var(--sd-gutter) + var(--sd-gap)); }
.sd-line1 { display: flex; align-items: baseline; gap: var(--space-2); min-width: 0; }
.sd-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-base);
  color: var(--color-text);
}
.sd-time { flex: none; font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-faint); }
.sd-line2 {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.sd-meta-ws { flex: none; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sd-meta-sep { color: var(--color-text-faint); }
.sd-meta-snippet { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* v-html content is outside the scoped tree, so :deep is required to style the
   injected <mark>. */
.sd-title :deep(mark),
.sd-ws-name :deep(mark) {
  background: var(--color-accent-soft);
  color: inherit;
  font-weight: var(--weight-semibold);
  border-radius: var(--radius-xs);
  padding: 0 1px;
}
.sd-line2 :deep(mark),
.sd-ws-path :deep(mark) {
  background: var(--color-accent-soft);
  color: var(--color-text);
  font-weight: var(--weight-medium);
  border-radius: var(--radius-xs);
  padding: 0 1px;
}

.sd-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6) var(--space-4);
  text-align: center;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
.sd-foot {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-4);
  border-top: 1px solid var(--color-line);
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  color: var(--color-text-faint);
}
.sd-hint { display: inline-flex; align-items: center; gap: var(--space-1); }
.sd-dot { margin: 0 var(--space-1); }
</style>
