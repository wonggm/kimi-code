<!-- apps/kimi-web/src/components/chat/DiffView.vue -->
<!-- ~/diff tab: the session's changed files from the daemon's fs:git_status,
     with a line-by-line unified diff (fs:diff) once a row is tapped. The list
     drills INTO this pane (`mode="detail"`), it does not open a file tab.
     Element structure, class names and the list/tree view switch follow
     upstream's own DiffView. -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { DiffViewLine } from '../../types';
import DiffLines from './DiffLines.vue';
import Button from '../ui/Button.vue';
import PanelHeader from '../ui/PanelHeader.vue';
import SegmentedControl from '../ui/SegmentedControl.vue';
import Icon from '../ui/Icon.vue';
import IconButton from '../ui/IconButton.vue';
import Spinner from '../ui/Spinner.vue';
import Tooltip from '../ui/Tooltip.vue';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    changes: { path: string; status: string }[];
    gitInfo: { branch: string; ahead: number; behind: number } | null;
    /** Parsed unified-diff lines for the selected file (empty until tapped). */
    fileDiff?: DiffViewLine[];
    /** The currently-open file path, or null when showing the file list. */
    selectedDiffPath?: string | null;
    /** True while the diff for the selected file is being fetched. */
    fileDiffLoading?: boolean;
    /** True for a file the daemon reports as empty (no lines to diff). */
    emptyFile?: boolean;
    /**
     * Render mode. 'full' (default, standalone tab) switches list↔detail by
     * selectedDiffPath; the panel passes its own drill state so the list and
     * the detail are two states of one tab.
     */
    mode?: 'full' | 'list' | 'detail';
    /** Hide the in-panel Back button. */
    hideBack?: boolean;
    /** The selected file's diff is out of date and can be re-read. */
    stale?: boolean;
    /** A diff re-read is in flight (dims the body). */
    refreshing?: boolean;
  }>(),
  { mode: 'full', hideBack: false, emptyFile: false, stale: false, refreshing: false },
);

const emit = defineEmits<{
  /** Fired when the user taps a changed file → the parent loads its diff. */
  open: [path: string];
  /** Fired when the user collapses the diff back to the file list. */
  back: [];
  /** Fired when the user re-reads the selected file's diff. */
  refresh: [];
}>();

// Status badge: single-letter glyph + CSS class
type BadgeKind = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted' | 'ignored' | 'clean' | 'unknown';

function badgeKind(s: string): BadgeKind {
  const lower = s.toLowerCase();
  if (lower === 'modified') return 'modified';
  if (lower === 'added') return 'added';
  if (lower === 'deleted') return 'deleted';
  if (lower === 'renamed') return 'renamed';
  if (lower === 'untracked') return 'untracked';
  if (lower === 'conflicted') return 'conflicted';
  if (lower === 'ignored') return 'ignored';
  if (lower === 'clean') return 'clean';
  return 'unknown';
}

// Upstream's own glyphs: `A`/`U` collapse into `+`, `D`/`R` are the edit
// operator and the rename arrow.
const BADGE_GLYPH: Record<BadgeKind, string> = {
  modified: 'M',
  added: '+',
  deleted: '−',
  renamed: '→',
  untracked: '+',
  conflicted: 'C',
  ignored: 'I',
  clean: '·',
  unknown: '?',
};

function badgeGlyph(s: string): string {
  return BADGE_GLYPH[badgeKind(s)] ?? '?';
}

/** Upstream truncates a long row path from the left, keeping the tail. */
function truncateLeft(path: string, maxLen = 60): string {
  if (path.length <= maxLen) return path;
  return '…' + path.slice(path.length - maxLen + 1);
}

const hasGitInfo = computed(() => props.gitInfo !== null);
const hasChanges = computed(() => props.changes.length > 0);

const showingDiff = computed(() => (props.selectedDiffPath ?? null) !== null);
const renderDetail = computed(
  () => props.mode === 'detail' || (props.mode === 'full' && showingDiff.value),
);
const diffLines = computed<DiffViewLine[]>(() => props.fileDiff ?? []);
const loading = computed(() => props.fileDiffLoading === true);
const fileCount = computed(() =>
  props.changes.length === 1
    ? t('diff.fileCountOne', { number: props.changes.length })
    : t('diff.fileCountOther', { number: props.changes.length }),
);

// The detail header keeps the refresh control in place (hidden) when the diff
// is not stale — upstream reserves the slot rather than re-flowing the header.
const showRefresh = computed(() => props.stale === true);
const refreshDisabled = computed(
  () => !props.stale || props.fileDiffLoading === true || props.refreshing === true,
);

const wrap = ref(false);

// ---------------------------------------------------------------------------
// List / tree view toggle
// ---------------------------------------------------------------------------

type ViewMode = 'list' | 'tree';
const viewMode = ref<ViewMode>('list');

function setViewMode(mode: string): void {
  viewMode.value = mode as ViewMode;
}

const viewModeOptions = computed(() => [
  { value: 'list', label: t('diff.list'), icon: 'view-flat' as const },
  { value: 'tree', label: t('diff.tree'), icon: 'view-grouped' as const },
]);

// ---------------------------------------------------------------------------
// Tree view
// ---------------------------------------------------------------------------

interface TreeNode {
  name: string;
  path: string;
  kind: 'file' | 'folder';
  status?: string;
  children: TreeNode[];
}

function buildTree(changes: { path: string; status: string }[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', kind: 'folder', children: [] };
  const sorted = [...changes].sort((a, b) => a.path.localeCompare(b.path));
  for (const entry of sorted) {
    const parts = entry.path.split('/');
    let current = root;
    for (let i = 0; i < parts.length; i += 1) {
      const name = parts[i]!;
      const isFile = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join('/');
      let child = current.children.find((c) => c.name === name && c.kind === (isFile ? 'file' : 'folder'));
      if (!child) {
        child = {
          name,
          path,
          kind: isFile ? 'file' : 'folder',
          status: isFile ? entry.status : undefined,
          children: [],
        };
        current.children.push(child);
      }
      current = child;
    }
  }
  return root.children;
}

interface FlatNode {
  node: TreeNode;
  depth: number;
}

const treeRoots = computed<TreeNode[]>(() => buildTree(props.changes));
const collapsedPaths = ref<Set<string>>(new Set());

function isExpanded(path: string): boolean {
  return !collapsedPaths.value.has(path);
}

const flatTree = computed<FlatNode[]>(() => {
  const result: FlatNode[] = [];
  function walk(nodes: TreeNode[], depth: number): void {
    for (const node of nodes) {
      result.push({ node, depth });
      if (node.kind === 'folder' && isExpanded(node.path)) {
        walk(node.children, depth + 1);
      }
    }
  }
  walk(treeRoots.value, 0);
  return result;
});

function toggleFolder(node: TreeNode): void {
  const next = new Set(collapsedPaths.value);
  if (next.has(node.path)) {
    next.delete(node.path);
  } else {
    next.add(node.path);
  }
  collapsedPaths.value = next;
}

/** Upstream indents each tree row through the two tree-indent variables. */
function treeRowStyle(depth: number): Record<string, string> {
  return {
    paddingLeft: `calc(var(--tree-base-indent) + ${depth} * var(--tree-indent-step))`,
  };
}
</script>

<template>
  <div class="changes-pane" :class="{ 'panel-file-head': renderDetail, 'dv-refreshing': props.refreshing }">
    <!-- ===================== LINE-BY-LINE DIFF VIEW ===================== -->
    <template v-if="renderDetail">
      <PanelHeader :title="selectedDiffPath ?? ''" :closable="false">
        <template #leading>
          <IconButton
            v-if="!hideBack"
            size="sm"
            :label="t('diff.back')"
            @click="emit('back')"
          >
            <Icon name="arrow-left" size="md" />
          </IconButton>
        </template>
        <div class="panel-file-head-actions">
          <Button
            variant="ghost"
            size="sm"
            :style="{ visibility: showRefresh ? 'visible' : 'hidden' }"
            :aria-label="t('filePreview.refresh')"
            :disabled="refreshDisabled"
            @click="emit('refresh')"
          >
            <Icon name="refresh" size="sm" /> {{ t('filePreview.refresh') }}
          </Button>
          <IconButton
            v-if="diffLines.length > 0"
            size="sm"
            :label="wrap ? t('conversation.codeBlock.unwrapCode') : t('conversation.codeBlock.wrapCode')"
            :aria-pressed="wrap"
            @click="wrap = !wrap"
          >
            <Icon :name="wrap ? 'text-wrap-disabled' : 'text-wrap'" size="md" />
          </IconButton>
        </div>
      </PanelHeader>

      <div class="dv-detail-body" :class="{ dim: props.refreshing }">
        <div v-if="loading" class="empty-state diff-loading">
          <Spinner size="md" />
          <span>{{ t('diff.loading') }}</span>
        </div>
        <div v-else-if="diffLines.length > 0" class="dv-lines-wrap" data-quote-display-lines>
          <DiffLines :lines="diffLines" :wrap="wrap" />
        </div>
        <div v-else class="empty-state">
          {{ emptyFile ? t('diff.emptyFile') : t('diff.noDiff') }}
        </div>
      </div>
    </template>

    <!-- ======================== CHANGED-FILE LIST ======================= -->
    <template v-else>
      <!-- Header: branch + ahead/behind, the file count and the view switch -->
      <PanelHeader :closable="false">
        <template #leading>
          <span v-if="hasGitInfo" class="br-heading">
            <Icon class="br-icon" name="git-fork" size="sm" />
            <span class="br-name">{{ gitInfo!.branch }}</span>
            <span v-if="gitInfo!.ahead > 0 || gitInfo!.behind > 0" class="sync-info">
              <Tooltip :text="t('diff.aheadTitle')">
                <span v-if="gitInfo!.ahead > 0" class="ahead">&#8593;{{ gitInfo!.ahead }}</span>
              </Tooltip>
              <Tooltip :text="t('diff.behindTitle')">
                <span v-if="gitInfo!.behind > 0" class="behind">&#8595;{{ gitInfo!.behind }}</span>
              </Tooltip>
            </span>
          </span>
        </template>
        <span class="dv-change-count">{{ fileCount }}</span>
        <SegmentedControl
          class="dv-view-mode"
          :model-value="viewMode"
          size="sm"
          :options="viewModeOptions"
          @update:model-value="setViewMode"
        />
      </PanelHeader>

      <!-- File list (flat) -->
      <div v-if="hasChanges && viewMode === 'list'" class="ch-list">
        <div class="ch-list-content">
          <Tooltip v-for="entry in changes" :key="entry.path" :text="entry.path">
            <button type="button" class="ch-row" @click="emit('open', entry.path)">
              <span class="badge" :class="badgeKind(entry.status)">{{ badgeGlyph(entry.status) }}</span>
              <span class="fpath">{{ truncateLeft(entry.path) }}</span>
            </button>
          </Tooltip>
        </div>
      </div>

      <!-- File tree -->
      <div v-else-if="hasChanges && viewMode === 'tree'" class="ch-list ch-tree">
        <ul class="tree-list ch-list-content">
          <li v-for="{ node, depth } in flatTree" :key="node.path" class="tree-node">
            <button
              v-if="node.kind === 'folder'"
              type="button"
              class="tree-row tree-folder"
              :style="treeRowStyle(depth)"
              @click="toggleFolder(node)"
            >
              <Icon class="tree-icon" name="folder-solid" size="sm" />
              <span class="tree-name">{{ node.name }}</span>
            </button>
            <Tooltip v-else :text="node.path">
              <button
                type="button"
                class="tree-row tree-file"
                :style="treeRowStyle(depth)"
                @click="emit('open', node.path)"
              >
                <span class="badge" :class="badgeKind(node.status!)">{{ badgeGlyph(node.status!) }}</span>
                <span class="tree-name">{{ node.name }}</span>
              </button>
            </Tooltip>
          </li>
        </ul>
      </div>

      <!-- Empty state when git info present but no changes -->
      <div v-else-if="hasGitInfo" class="empty-state">
        <span class="empty-state-icon" aria-hidden="true"><Icon name="check" size="lg" /></span>
        {{ t('diff.clean') }}
      </div>

      <!-- No git info at all -->
      <div v-else class="empty-state">
        {{ t('diff.empty') }}
      </div>
    </template>
  </div>
</template>

<style scoped>
.changes-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
  font-family: var(--mono);
}
/* The file path is the header's title in the detail view: upstream shows it as
   a plain-UI-font path, clipped from the left so the tail stays readable. */
.changes-pane.panel-file-head :deep(.ui-panel-header__title) {
  font: 400 var(--text-xs) var(--font-ui);
  direction: rtl;
  text-align: left;
}

/* ---- Panel-header middle content (change count / branch) ---- */
.dv-change-count {
  flex: none;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--ui-font-size-xs);
  color: var(--muted);
  font-family: var(--font-ui);
}
.dv-view-mode {
  margin-left: auto;
  flex: none;
}

.br-heading {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  flex: 0 1 auto;
  min-width: 0;
}
.br-icon { flex: none; color: var(--muted); }
.br-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
  font-weight: 500;
  font-size: var(--text-xs);
}
.sync-info {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
}
.ahead { color: var(--color-accent); font-size: var(--text-xs); }
.behind { color: var(--color-warning); font-size: var(--text-xs); }

/* ---- File list ---- */
.ch-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.ch-list-content {
  min-height: 100%;
  padding: 4px 0;
  padding-bottom: max(4px, var(--pfc-host-h, 0px));
}

.ch-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  cursor: pointer;
  font-size: var(--text-xs);
  line-height: 1.6;
  width: 100%;
  background: none;
  border: none;
  text-align: left;
  font-family: var(--font-ui);
  color: inherit;
}
.ch-row:hover { background: var(--panel2); }
.ch-row:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

/* ---- Tree view ---- */
.ch-tree {
  --tree-base-indent: 14px;
  --tree-indent-step: 12px;
  font-family: var(--font-ui);
}
.tree-list {
  list-style: none;
  margin: 0;
}
.tree-node { overflow: hidden; }
.tree-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  margin-top: 1px;
  padding: 3px 8px;
  background: none;
  border: none;
  text-align: left;
  font-family: inherit;
  font-size: var(--text-xs);
  color: inherit;
  cursor: pointer;
}
/* Guide rail: one hairline per depth step, drawn behind the row. */
.tree-row:hover { background: var(--panel2); }
.tree-row:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
.tree-icon { flex: none; color: var(--muted); }
.tree-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- Status badge ---- */
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: var(--radius-xs);
  font-size: max(9px, calc(var(--ui-font-size) - 4px));
  font-weight: 500;
  flex: none;
  user-select: none;
}

.badge.modified  { background: var(--color-warning-soft); color: var(--color-warning); }
.badge.added     { background: var(--color-success-soft); color: var(--color-success); }
.badge.deleted   { background: var(--color-danger-soft); color: var(--color-danger); }
.badge.renamed   { background: var(--color-done-soft); color: var(--color-done); }
.badge.untracked { background: var(--color-success-soft); color: var(--color-success); }
.badge.conflicted{ background: color-mix(in srgb, var(--color-danger) 10%, var(--bg)); color: var(--color-danger); font-size: max(9px, calc(var(--ui-font-size) - 5px)); }
.badge.ignored   { background: var(--color-well); color: var(--faint); }
.badge.clean     { background: transparent; color: var(--faint); }
.badge.unknown   { background: var(--color-well); color: var(--muted); }

/* ---- File path ---- */
.fpath {
  color: var(--color-text);
  font-size: var(--text-xs);
  font-weight: var(--weight-caption);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  direction: rtl;   /* makes text-overflow clip from the left */
  text-align: left;
  min-width: 0;
}

/* ---- Empty state ---- */
.empty-state {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: 32px 20px;
  color: var(--muted);
  font-size: var(--ui-font-size);
  text-align: center;
  user-select: none;
}
.empty-state-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--color-well);
  color: var(--color-text-muted);
}

/* =========================================================================
   LINE-BY-LINE DIFF VIEW
   ========================================================================= */
.panel-file-head-actions {
  margin-left: auto;
  min-width: 0;
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.dv-detail-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.dv-detail-body.dim { opacity: 0.6; }

/* Wrapper that lets <DiffLines> fill the panel height and scroll internally.
   The line-row styles themselves live in DiffLines.vue. */
.dv-lines-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-bottom: var(--pfc-host-h, 0px);
}

/* =========================================================================
   MOBILE (≤640px): full-width file rows with ≥44px tap height and the
   line-by-line panel scrolling horizontally for long lines. No layout break
   at 360px.
   ========================================================================= */
@media (max-width: 640px) {
  .ch-list { padding: 2px 0 12px; }
  .ch-row {
    min-height: 44px;
    padding: 8px 14px;
    gap: 12px;
    font-size: var(--text-xs);
  }
  .ch-row:active { background: var(--panel2); }
  .badge { width: 18px; height: 18px; }
  .tree-row {
    min-height: 40px;
    padding: 8px 14px;
  }
}

.changes-pane .empty-state { font-family: var(--sans); }
.changes-pane .badge { border-radius: var(--radius-sm); }
</style>
