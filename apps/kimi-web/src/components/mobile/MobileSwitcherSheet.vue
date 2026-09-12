<!-- apps/kimi-web/src/components/mobile/MobileSwitcherSheet.vue -->
<!-- Mobile switcher bottom sheet, mirroring the desktop sidebar: a "+ New
     chat" row, then collapsible workspace groups (folder icon + name +
     path sub-line + per-group "+") with their session rows beneath.
     Tapping a session selects it AND closes the sheet; tapping a group header
     folds it, same as the desktop sidebar. -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Session, WorkspaceGroup, WorkspaceView } from '../../types';
import { copyTextToClipboard } from '../../lib/clipboard';
import { loadSwitcherView, saveSwitcherView } from '../../lib/storage';
import BottomSheet from '../dialogs/BottomSheet.vue';
import IconButton from '../ui/IconButton.vue';
import Icon from '../ui/Icon.vue';
import Menu from '../ui/Menu.vue';
import MenuItem from '../ui/MenuItem.vue';
import SegmentedControl from '../ui/SegmentedControl.vue';
import Tooltip from '../ui/Tooltip.vue';

type SidebarSession = Session & {
  emoji?: string;
  pinned?: boolean;
};
type SidebarGroup = Omit<WorkspaceGroup, 'sessions'> & { sessions: SidebarSession[] };

const { t } = useI18n();

/** Open a session's pull request in a new tab (the PR tag's only action). */
function openPullRequest(s: SidebarSession): void {
  const url = s.pullRequest?.url;
  if (url) window.open(url, '_blank', 'noopener');
}

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    /** Workspace groups (same list the desktop sidebar renders). */
    groups: SidebarGroup[];
    activeWorkspaceId: string | null;
    activeId: string;
    attentionBySession?: Record<string, number>;
    attentionByWorkspace?: Record<string, number>;
  }>(),
  {
    activeWorkspaceId: null,
    attentionBySession: () => ({}),
    attentionByWorkspace: () => ({}),
  },
);

const emit = defineEmits<{
  'update:modelValue': [open: boolean];
  select: [sessionId: string];
  create: [];
  createInWorkspace: [workspaceId: string];
  addWorkspace: [];
  rename: [id: string, title: string];
  archive: [id: string];
  /** NOTE: App.vue wires this to confirmDeleteWorkspace (modal confirm + async delete). */
  deleteWorkspace: [workspaceId: string];
  loadMore: [workspaceId: string];
  setEmoji: [id: string, emoji: string | undefined];
  togglePinned: [id: string, pinned: boolean];
}>();

function close(): void {
  emit('update:modelValue', false);
}

function onSelectSession(id: string): void {
  emit('select', id);
  close();
}

function onCreateInWorkspace(id: string): void {
  emit('createInWorkspace', id);
  close();
}

function onCreate(): void {
  emit('create');
  close();
}

function onAddWorkspace(): void {
  emit('addWorkspace');
  close();
}

// ---------------------------------------------------------------------------
// View mode — grouped (collapsible workspace groups, current behavior) versus
// flat (all sessions in pure recency order). The choice persists across
// refreshes (see lib/storage.ts).
// ---------------------------------------------------------------------------
type SwitchView = 'grouped' | 'flat';

const storedView = loadSwitcherView();
const view = ref<SwitchView>(storedView === 'flat' ? 'flat' : 'grouped');
watch(view, (v) => saveSwitcherView(v));

// Bare recency sort across ALL loaded sessions — the flat view's order
// (mirrors the desktop sidebar's pinned/recent ordering exactly).
const flatSessions = computed(() =>
  props.groups
    .flatMap((group) => group.sessions)
    .toSorted((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()),
);

// A single flattened list drives one shared row template: workspace headers
// and show-more footers are inserted only in grouped mode; the flat view is
// just the sorted sessions.
type SheetEntry =
  | { kind: 'ws-head'; group: SidebarGroup }
  | { kind: 'ws-foot'; group: SidebarGroup }
  | { kind: 'session'; session: SidebarSession; groupId: string };

const entries = computed<SheetEntry[]>(() => {
  if (view.value === 'flat') {
    return flatSessions.value.map((session) => ({ kind: 'session', session, groupId: '' }));
  }
  const out: SheetEntry[] = [];
  for (const group of props.groups) {
    out.push({ kind: 'ws-head', group });
    for (const session of visibleSessions(group)) {
      out.push({ kind: 'session', session, groupId: group.workspace.id });
    }
    out.push({ kind: 'ws-foot', group });
  }
  return out;
});

function entryKey(entry: SheetEntry): string {
  if (entry.kind === 'session') return `session:${entry.session.id}`;
  return `${entry.kind}:${entry.group.workspace.id}`;
}

// ---------------------------------------------------------------------------
// Collapse groups — same interaction as the desktop sidebar header.
// ---------------------------------------------------------------------------
const collapsedIds = ref<Set<string>>(new Set());

function isCollapsed(id: string): boolean {
  return collapsedIds.value.has(id);
}

function toggleCollapse(id: string): void {
  const next = new Set(collapsedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsedIds.value = next;
  // Tapping a header also dismisses any open row/workspace menu.
  menuFor.value = null;
  wsMenuFor.value = null;
}

// ---------------------------------------------------------------------------
// In-group expand / collapse (show-more pagination) — mirrors the desktop
// sidebar. Local to the sheet; a refresh reloads only the first page.
// ---------------------------------------------------------------------------
const expandedIds = ref<Set<string>>(new Set());

function isExpanded(id: string): boolean {
  return expandedIds.value.has(id);
}

function toggleExpand(id: string): void {
  const next = new Set(expandedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedIds.value = next;
}

function visibleSessions(g: SidebarGroup): SidebarSession[] {
  if (isExpanded(g.workspace.id)) return g.sessions;
  const head = g.sessions.slice(0, g.initialCount);
  // Keep the active session visible when it's beyond the first page (e.g.
  // selected via search or a deep link), mirroring the desktop sidebar.
  if (props.activeId && !head.some((s) => s.id === props.activeId)) {
    const active = g.sessions.find((s) => s.id === props.activeId);
    if (active) return [...head, active];
  }
  return head;
}

function onLoadMore(id: string): void {
  // Loading more should reveal the new rows immediately.
  if (!expandedIds.value.has(id)) {
    const next = new Set(expandedIds.value);
    next.add(id);
    expandedIds.value = next;
  }
  emit('loadMore', id);
}

function wsAttention(id: string): number {
  return props.attentionByWorkspace[id] ?? 0;
}

// ---------------------------------------------------------------------------
// Per-row kebab menu (rename / archive) — opened from the ⋯ button.
// Archive is confirmed via modal (consistent with remove-workspace).
// ---------------------------------------------------------------------------
const menuFor = ref<string | null>(null);
const renamingId = ref<string | null>(null);
const renameValue = ref('');
const renameComposing = ref(false);

function toggleMenu(id: string): void {
  menuFor.value = menuFor.value === id ? null : id;
  wsMenuFor.value = null;
}
function onRename(s: SidebarSession): void {
  menuFor.value = null;
  renamingId.value = s.id;
  renameValue.value = s.title;
}
function commitRename(s: SidebarSession): void {
  const title = renameValue.value.trim();
  if (title) emit('rename', s.id, title);
  renamingId.value = null;
}
function cancelRename(): void {
  renamingId.value = null;
}
function setEmoji(s: SidebarSession): void {
  const next = typeof window !== 'undefined' ? window.prompt(t('sidebar.setEmoji'), s.emoji ?? '') : null;
  if (next === null) return;
  emit('setEmoji', s.id, next.trim() || undefined);
  menuFor.value = null;
}
function togglePinned(s: SidebarSession): void {
  emit('togglePinned', s.id, !s.pinned);
  menuFor.value = null;
}
function onArchive(id: string): void {
  menuFor.value = null;
  // The modal confirm + async archive live in App.vue (confirmArchiveSession).
  emit('archive', id);
}

// ---------------------------------------------------------------------------
// Per-workspace "…" menu: copy path + delete workspace. Copy path is handled
// locally, like the desktop sidebar; delete is emitted to the parent (App.vue
// owns the modal confirm + async delete).
// ---------------------------------------------------------------------------
const wsMenuFor = ref<string | null>(null);

function toggleWsMenu(id: string): void {
  wsMenuFor.value = wsMenuFor.value === id ? null : id;
  menuFor.value = null;
}
function onCopyWsPath(ws: WorkspaceView): void {
  void copyTextToClipboard(ws.root);
  wsMenuFor.value = null;
}
function onDeleteWorkspace(ws: WorkspaceView): void {
  wsMenuFor.value = null;
  emit('deleteWorkspace', ws.id);
}
</script>

<template>
  <BottomSheet
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <!-- + New session (mirrors the sidebar's top button) -->
    <button type="button" class="newrow" @click="onCreate">
      <Icon name="message" size="sm" />
      {{ t('sidebar.newSession') }}
    </button>
    <button type="button" class="newrow secondary" @click="onAddWorkspace">
      <Icon name="folder" size="sm" />
      {{ t('sidebar.newWorkspace') }}
    </button>

    <!-- View toggle: grouped workspace groups (current behavior) or a flat
         recency-sorted session list; the choice persists locally. -->
    <div class="mview">
      <SegmentedControl
        :model-value="view"
        :options="[
          { value: 'grouped', label: t('mobile.switcherGrouped') },
          { value: 'flat', label: t('mobile.switcherFlat') },
        ]"
        @update:model-value="view = $event as SwitchView"
      />
    </div>

    <!-- Workspace groups with their sessions; the same session row renders in
         both views — grouped mode inserts group headers + show-more footers,
         flat mode is just the sessions sorted by recency. -->
    <div class="mlist">
      <div v-if="groups.length === 0" class="mempty">
        {{ t('workspace.noWorkspace') }}
      </div>

      <template v-for="entry in entries" :key="entryKey(entry)">
        <!-- Workspace group header -->
        <div v-if="entry.kind === 'ws-head'" class="mgroup">
          <div
            class="mgh"
            :class="{ on: entry.group.workspace.id === activeWorkspaceId }"
            @click="toggleCollapse(entry.group.workspace.id)"
          >
            <!-- Folder icon: open/closed mirrors the desktop sidebar -->
            <Icon v-if="isCollapsed(entry.group.workspace.id)" class="mgh-folder" name="folder-closed" size="sm" />
            <Icon v-else class="mgh-folder" name="folder" size="sm" />

            <div class="mgh-main">
              <span class="mgh-name">{{ entry.group.workspace.name }}</span>
              <Tooltip :text="entry.group.workspace.root">
                <span class="mgh-path">{{ entry.group.workspace.shortPath }}</span>
              </Tooltip>
            </div>

            <span
              v-if="isCollapsed(entry.group.workspace.id) && wsAttention(entry.group.workspace.id) > 0"
              class="att"
            >{{ wsAttention(entry.group.workspace.id) }}</span>

            <IconButton
              size="lg"
              class="mgh-more"
              :label="t('sidebar.options')"
              @click.stop="toggleWsMenu(entry.group.workspace.id)"
            >
              <Icon name="dots-horizontal" size="md" />
            </IconButton>

            <IconButton
              size="lg"
              class="mgh-add"
              :label="t('workspace.newInGroup')"
              @click.stop="onCreateInWorkspace(entry.group.workspace.id)"
            >
              <Icon name="plus" size="md" />
            </IconButton>

            <!-- Workspace menu: copy path / delete (two-step confirm) -->
            <Menu v-if="wsMenuFor === entry.group.workspace.id" class="kmenu wsmenu" @click.stop>
              <MenuItem size="lg" @click="onCopyWsPath(entry.group.workspace)">
                {{ t('sidebar.copyPath') }}
              </MenuItem>
              <MenuItem size="lg" danger @click="onDeleteWorkspace(entry.group.workspace)">{{ t('sidebar.delete') }}</MenuItem>
            </Menu>
          </div>
        </div>

        <!-- Session row (shared by both views) -->
        <div
          v-else-if="entry.kind === 'session'"
          v-show="!isCollapsed(entry.groupId)"
          class="srow"
          :class="{ cur: entry.session.id === activeId }"
          @click="onSelectSession(entry.session.id)"
        >
          <div class="m">
            <input
              v-if="renamingId === entry.session.id"
              v-model="renameValue"
              class="rename-input"
              :draggable="false"
              @click.stop
              @compositionstart="renameComposing = true"
              @compositionend="renameComposing = false"
              @keydown.enter.stop="!renameComposing && !$event.isComposing && commitRename(entry.session)"
              @keydown.esc.stop="!renameComposing && !$event.isComposing && cancelRename()"
              @blur="commitRename(entry.session)"
            />
            <div
              v-else
              class="t"
              :class="{ run: entry.session.busy, aborted: !entry.session.busy && (attentionBySession[entry.session.id] ?? 0) === 0 && entry.session.lastTurnReason === 'failed' }"
            >
              <span v-if="entry.session.emoji" class="emoji" aria-hidden="true">{{ entry.session.emoji }}</span>{{ entry.session.title }}
            </div>
            <div class="s">{{ entry.session.time }}</div>
            <button
              v-if="entry.session.pullRequest"
              class="pr"
              :class="`pr--${entry.session.pullRequest.state}`"
              type="button"
              :aria-label="t('sidebar.pullRequest')"
              @click.stop="openPullRequest(entry.session)"
            >
              <Icon name="git-pull-request" size="sm" />
              <span>#{{ entry.session.pullRequest.number }}</span>
            </button>
          </div>
          <span v-if="(attentionBySession[entry.session.id] ?? 0) > 0" class="att">{{ attentionBySession[entry.session.id] }}</span>
          <IconButton
            size="lg"
            class="kb"
            :label="t('sidebar.options')"
            @click.stop="toggleMenu(entry.session.id)"
          >
            <Icon name="dots-horizontal" size="md" />
          </IconButton>

          <!-- Kebab menu -->
          <Menu v-if="menuFor === entry.session.id" class="kmenu" @click.stop>
            <MenuItem size="lg" @click="onRename(entry.session)">{{ t('sidebar.rename') }}</MenuItem>
            <MenuItem size="lg" @click="setEmoji(entry.session)">{{ t('sidebar.setEmoji') }}</MenuItem>
            <MenuItem size="lg" @click="togglePinned(entry.session)">{{ entry.session.pinned ? t('sidebar.unpin') : t('sidebar.pin') }}</MenuItem>
            <MenuItem size="lg" danger @click="onArchive(entry.session.id)">{{ t('sidebar.archive') }}</MenuItem>
          </Menu>
        </div>

        <!-- Group foot: empty state + show-more buttons (grouped view only) -->
        <div v-else v-show="!isCollapsed(entry.group.workspace.id)">
          <div v-if="entry.group.sessions.length === 0" class="mempty small">{{ t('sidebar.noSessions') }}</div>
          <button
            v-if="entry.group.hasMore || entry.group.loadingMore"
            type="button"
            class="mshow-more"
            :disabled="entry.group.loadingMore"
            @click.stop="onLoadMore(entry.group.workspace.id)"
          >
            {{
              entry.group.loadingMore
                ? t('sidebar.loadingMore')
                : t('sidebar.showMore', { count: Math.max(0, entry.group.workspace.sessionCount - entry.group.sessions.length) })
            }}
          </button>
          <button
            v-if="entry.group.sessions.length > entry.group.initialCount"
            type="button"
            class="mshow-more"
            @click.stop="toggleExpand(entry.group.workspace.id)"
          >
            {{
              isExpanded(entry.group.workspace.id)
                ? t('sidebar.showLess')
                : t('sidebar.showAll', { count: entry.group.sessions.length - entry.group.initialCount })
            }}
          </button>
        </div>
      </template>
    </div>
  </BottomSheet>
</template>

<style scoped>
/* ---- + New session / workspace rows ---- */
.newrow {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: var(--space-3) var(--space-4);
  background: none;
  border: none;
  border-radius: var(--radius-md);
  color: var(--color-accent);
  font-weight: 500;
  font-size: var(--text-base);
  cursor: pointer;
  text-align: left;
}
.newrow:hover { background: var(--color-surface-sunken); }
.newrow:active { background: var(--color-surface-sunken); }
.newrow.secondary {
  padding-top: var(--space-2);
  padding-bottom: var(--space-2);
  color: var(--color-text-muted);
  font-weight: 400;
}
.newrow.secondary:hover { background: var(--color-surface-sunken); }
.newrow.secondary:active { background: var(--color-surface-sunken); color: var(--color-text); }

/* ---- List + alignment contract (mirrors the desktop sidebar):
        session titles start at --m-pad + --m-gutter + --m-gap, exactly under
        the workspace name next to the folder icon. ---- */
.mlist {
  --m-pad: 16px;    /* row horizontal padding */
  --m-gutter: 15px; /* folder icon width */
  --m-gap: 8px;     /* gap between icon and text */
  --m-indent: calc(var(--m-pad) + var(--m-gutter) + var(--m-gap));
  padding-bottom: var(--space-1);
}
.mempty {
  padding: var(--space-6) var(--space-4);
  text-align: center;
  color: var(--color-text-faint);
  font-size: var(--ui-font-size);
}
.mempty.small { padding: 10px 16px 12px var(--m-indent); text-align: left; font-size: var(--ui-font-size-xs); }

/* ---- Workspace group header ---- */
.mgroup { padding-top: 2px; }
.mgh {
  display: flex;
  align-items: center;
  gap: var(--m-gap);
  padding: 10px var(--m-pad) 6px;
  border-radius: var(--radius-md);
  cursor: pointer;
  user-select: none;
  position: relative; /* anchors the workspace "…" menu */
}
.mgh:hover { background: var(--color-surface-sunken); }
.mgh:active { background: var(--color-surface-sunken); }
.mgh-folder { flex: none; color: var(--color-text-muted); }
.mgh-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.mgh-name {
  font-size: var(--ui-font-size-lg);
  font-weight: 550;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mgh-path {
  font-size: var(--text-base);
  font-weight: 425;
  color: var(--color-text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mgh-add { margin: -10px -12px -10px 0; }
.mgh-add:active { color: var(--color-text); background: var(--color-surface-sunken); }

/* Workspace "…" menu trigger */
.mgh-more { margin: -10px -8px; }
.mgh-more:active { color: var(--color-text); background: var(--color-surface-sunken); }

/* ---- Session rows ---- */
.srow {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--m-pad) var(--space-3) var(--m-indent);
  border-radius: var(--radius-md);
  cursor: pointer;
  position: relative;
}
.srow:hover { background: var(--color-surface-sunken); }
.srow:active { background: var(--color-surface-sunken); }
.srow.cur { background: var(--color-accent-soft); box-shadow: inset 0 0 0 1px var(--color-accent-bd); }
.srow .m { flex: 1; min-width: 0; }
.srow .m .t {
  font-size: var(--text-base);
  font-weight: 450;
  line-height: var(--leading-tight);
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.emoji { margin-right: var(--space-1); }
.rename-input {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  font: inherit;
  color: var(--color-text);
  background: var(--color-bg);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-xs);
  padding: 2px 5px;
  outline: none;
}
.srow.cur .m .t { color: var(--color-accent-hover); }

/* Running indicator — pulse dot in the indent gutter left of the title,
   mirroring the desktop SessionRow (.t.run::before). */
.srow .m .t.run { position: relative; }
.srow .m .t.run::before {
  content: '';
  position: absolute;
  left: -14px;
  top: 50%;
  transform: translateY(-50%);
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--color-accent);
  animation: mRunPulse 1.4s ease-in-out infinite;
}
@keyframes mRunPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
/* Aborted: a static red dot in the same gutter slot (no pulse — it's finished). */
.srow .m .t.aborted { position: relative; }
.srow .m .t.aborted::before {
  content: '';
  position: absolute;
  left: -14px;
  top: 50%;
  transform: translateY(-50%);
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--color-danger);
}
.srow .m .s {
  font-size: var(--text-base);
  font-weight: 475;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-faint);
  margin-top: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* PR tag — small state-tinted pill linking to the session's pull request. */
.srow .pr {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  height: 22px;
  padding: 0 9px;
  border: 1px solid var(--color-accent-bd);
  border-radius: var(--radius-full);
  background: var(--color-accent-soft);
  color: var(--color-accent-hover);
  font-family: var(--font-ui);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: 1;
  cursor: pointer;
}
.srow .pr svg { width: 14px; height: 14px; }
.srow .pr--merged { background: var(--color-success-soft); color: var(--color-success); border-color: var(--color-success-bd); }
.srow .pr--closed { background: var(--color-surface-sunken); color: var(--color-text-muted); border-color: var(--color-line); }
.srow .pr:active { filter: brightness(0.92); }
.att {
  flex: none;
  font-family: var(--font-mono);
  font-size: max(9px, calc(var(--ui-font-size) - 4px));
  color: var(--surface-light);
  background: var(--color-warning);
  border-radius: var(--radius-full);
  padding: 1px 7px;
}
.srow .kb:active { color: var(--color-text); background: var(--color-surface-sunken); }

/* Kebab menu — surface from Menu primitive; only positioning here. */
.kmenu {
  position: absolute;
  right: 12px;
  top: 44px;
  z-index: var(--z-dropdown);
  min-width: 96px;
  overflow: hidden;
}

/* Workspace "…" menu — anchored to the group header. */
.wsmenu {
  top: calc(100% - 4px);
  right: var(--m-pad);
  min-width: 132px;
}

/* "Show more" — same indent as session rows, 44px tap target */
.mshow-more {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 44px;
  padding: var(--space-1) var(--m-pad) var(--space-1) var(--m-indent);
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: var(--text-base);
  cursor: pointer;
  text-align: left;
}
.mshow-more:active { color: var(--color-accent-hover); background: var(--color-surface-sunken); }

.newrow { font-family: var(--sans); }

/* View-mode toggle (grouped workspace groups / flat recency) */
.mview {
  display: flex;
  justify-content: center;
  padding: 2px var(--space-4) var(--space-2);
}
.mlist .srow {
  margin: 1px 8px;
  border-radius: var(--radius-md);
  border-bottom: none;
  /* Trim both paddings by the 8px inset margin so session titles stay on the
     sheet's --m-indent alignment line (under the workspace name). */
  padding: 12px calc(var(--m-pad, 16px) - 8px) 12px calc(var(--m-indent, 39px) - 8px);
}
.mlist .srow.cur { box-shadow: inset 0 0 0 1px var(--color-accent-bd); }
</style>
