<!-- apps/kimi-web/src/views/SessionAdminView.vue -->
<!-- Cross-workspace session triage (experimental Lab page). Replaces the chat
     main view while open: filters (workspace / status / updated-within / text),
     a paginated table with page-level select-all, and batch Mark-as-done /
     Reopen backed by the daemon's batch archive/restore. This is a dense
     utility view, not a showcase — plain token surfaces, no glass. -->
<script lang="ts">
/**
 * Pure, testable admin filtering. `AdminRow` is the normalized row shape the
 * table renders; filterAdminRows applies every filter + sorts newest-first.
 */

export interface AdminRow {
  id: string;
  title: string;
  /** Status semantics: done === archived (the server's `archived` flag). */
  archived: boolean;
  workspaceId: string;
  workspaceName: string;
  lastPrompt?: string;
  updatedAt: string;
  createdAt: string;
}

export interface AdminFilters {
  query: string;
  /** null = all workspaces. */
  workspaceId: string | null;
  status: 'all' | 'open' | 'done';
  /** Only sessions updated within the last N days; null = any time. */
  updatedWithinDays: number | null;
}

/** "Updated within N days" — inclusive lower bound on updatedAt (string-compares
 *  safely for ISO timestamps). Exported for direct unit coverage. */
export function matchesUpdatedWithin(updatedAt: string, days: number, now = Date.now()): boolean {
  if (!days || days <= 0) return true;
  const cutoff = new Date(now - days * 86_400_000).toISOString();
  return updatedAt >= cutoff;
}

/** Apply the admin filters to normalized rows (query on title + last prompt,
 *  workspace id, status, recency window) and sort newest-first by updatedAt.
 *  `now` is injectable for deterministic tests of the recency window. */
export function filterAdminRows(
  rows: readonly AdminRow[],
  filters: AdminFilters,
  now = Date.now(),
): AdminRow[] {
  const q = filters.query.trim().toLowerCase();
  return rows
    .filter((row) => {
      if (filters.workspaceId !== null && row.workspaceId !== filters.workspaceId) return false;
      if (filters.status === 'open' && row.archived) return false;
      if (filters.status === 'done' && !row.archived) return false;
      if (!matchesUpdatedWithin(row.updatedAt, filters.updatedWithinDays ?? 0, now)) return false;
      if (q) {
        if (!row.title.toLowerCase().includes(q)) {
          const prompt = row.lastPrompt ?? '';
          if (!prompt.toLowerCase().includes(q)) return false;
        }
      }
      return true;
    })
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { getKimiWebApi } from '../api';
import type { AppSession } from '../api/types';
import type { WorkspaceView } from '../types';
import Button from '../components/ui/Button.vue';
import Badge from '../components/ui/Badge.vue';
import Checkbox from '../components/ui/Checkbox.vue';
import SegmentedControl from '../components/ui/SegmentedControl.vue';
import MenuSelect from '../components/ui/MenuSelect.vue';
import Icon from '../components/ui/Icon.vue';
import Spinner from '../components/ui/Spinner.vue';

const props = defineProps<{ workspaces: WorkspaceView[] }>();

const emit = defineEmits<{
  close: [];
  openSession: [id: string];
}>();

const { t } = useI18n();

// ---------------------------------------------------------------------------
// Load: full cross-workspace drain (open + archived). Client-side filtering
// mirrors the Settings archived panel — the v1-compatible list endpoint has no
// server filters beyond the archived flag, and the pages are small.
// ---------------------------------------------------------------------------
const ADMIN_PAGE_SIZE = 100;
// Defensive cap: beyond this many sessions the drain stops (the UI could not
// usefully triage more anyway).
const ADMIN_MAX_ROWS = 2000;

const rows = ref<AdminRow[]>([]);
const loading = ref(false);
const loadError = ref(false);

function toAdminRow(s: AppSession, workspaceByRoot: Map<string, WorkspaceView>): AdminRow {
  const workspace = s.workspaceId !== undefined
    ? props.workspaces.find((w) => w.id === s.workspaceId)
    : workspaceByRoot.get(s.cwd);
  return {
    id: s.id,
    title: s.title,
    archived: s.archived,
    workspaceId: workspace?.id ?? s.cwd,
    workspaceName: workspace?.name ?? s.cwd.split('/').at(-1) ?? s.cwd,
    lastPrompt: s.lastPrompt,
    updatedAt: s.updatedAt,
    createdAt: s.createdAt,
  };
}

async function loadAll(): Promise<void> {
  if (loading.value) return;
  loading.value = true;
  loadError.value = false;
  const workspaceByRoot = new Map(props.workspaces.map((w) => [w.root, w]));
  const api = getKimiWebApi();
  const all: AdminRow[] = [];
  let beforeId: string | undefined;
  try {
    for (;;) {
      const page = await api.listSessions({
        pageSize: ADMIN_PAGE_SIZE,
        beforeId,
        includeArchive: true,
        excludeEmpty: true,
      });
      all.push(...page.items.map((s) => toAdminRow(s, workspaceByRoot)));
      if (!page.hasMore || page.items.length === 0) break;
      if (all.length >= ADMIN_MAX_ROWS) break;
      beforeId = page.items.at(-1)?.id;
    }
    rows.value = all;
  } catch (err) {
    console.warn('[kimi-web] session admin load failed', err);
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

// ---------------------------------------------------------------------------
// Filters + pagination
// ---------------------------------------------------------------------------
const query = ref('');
const workspaceFilter = ref<string>('all'); // 'all' | workspaceId
const statusFilter = ref<'all' | 'open' | 'done'>('all');
const timeFilter = ref<number | null>(null); // null = any time
const page = ref(1);
const pageSize = ref(50);

const workspaceFilterGroups = computed(() => [
  {
    options: [
      { value: 'all', label: t('admin.allWorkspaces') },
      ...props.workspaces.map((w) => ({ value: w.id, label: w.name })),
    ],
  },
]);

const filters = computed<AdminFilters>(() => ({
  query: query.value,
  workspaceId: workspaceFilter.value === 'all' ? null : workspaceFilter.value,
  status: statusFilter.value,
  updatedWithinDays: timeFilter.value,
}));

const filtered = computed<AdminRow[]>(() => filterAdminRows(rows.value, filters.value));

function resetFilters(): void {
  query.value = '';
  workspaceFilter.value = 'all';
  statusFilter.value = 'all';
  timeFilter.value = null;
  page.value = 1;
}

const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)));
const pageRows = computed<AdminRow[]>(() => {
  const start = (page.value - 1) * pageSize.value;
  return filtered.value.slice(start, start + pageSize.value);
});

const pageSizeOptions = computed(() => [25, 50, 100].map((n) => ({ value: String(n), label: t('admin.pageSize', { n }) })));

function goToPage(next: number): void {
  page.value = Math.min(pageCount.value, Math.max(1, next));
}

// ---------------------------------------------------------------------------
// Selection + batch actions
// ---------------------------------------------------------------------------
const selectedIds = ref<Set<string>>(new Set());

function toggleRow(id: string): void {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}

/** Select-all on the current page (header checkbox). */
const pageAllSelected = computed(() =>
  pageRows.value.length > 0 && pageRows.value.every((row) => selectedIds.value.has(row.id)),
);

function togglePage(select: boolean): void {
  const next = new Set(selectedIds.value);
  for (const row of pageRows.value) {
    if (select) next.add(row.id);
    else next.delete(row.id);
  }
  selectedIds.value = next;
}

function selectAllMatching(): void {
  const next = new Set(selectedIds.value);
  for (const row of filtered.value) next.add(row.id);
  selectedIds.value = next;
}

function clearSelection(): void {
  selectedIds.value = new Set();
}

const batchRunning = ref(false);
/** Direction of the in-flight batch, for the run-button loading indicators. */
const batchArchiving = ref(false);
const batchResult = ref<string | null>(null);
const batchResultFailed = ref(false);

/** Apply archive/restore to the selected ids. Uses the daemon's batch method
 *  (falls back to per-id calls inside the client when the server lacks the
 *  endpoint). Rows patch their archived flag locally so the table + status
 *  filter react immediately; selection is pruned to the affected ids. */
async function runBatch(archived: boolean): Promise<void> {
  const ids = Array.from(selectedIds.value);
  if (ids.length === 0 || batchRunning.value) return;
  batchRunning.value = true;
  batchArchiving.value = archived;
  batchResult.value = null;
  try {
    const { succeeded, failed } = await getKimiWebApi().setSessionsArchivedBatch(ids, archived);
    const applied = new Set(ids.slice(0, succeeded));
    rows.value = rows.value.map((row) =>
      applied.has(row.id) ? { ...row, archived } : row,
    );
    if (failed > 0 && succeeded === 0) {
      batchResultFailed.value = true;
      batchResult.value = t(
        archived ? 'admin.batchDoneFailedNotice' : 'admin.batchReopenFailedNotice',
        { n: failed },
      );
    } else {
      batchResultFailed.value = false;
      batchResult.value =
        t(archived ? 'admin.batchDoneToast' : 'admin.batchReopenedToast', { n: succeeded }) +
        (failed > 0 ? t('admin.batchFailedSuffix', { n: failed }) : '');
    }
    clearSelection();
  } catch (err) {
    console.warn('[kimi-web] session admin batch failed', err);
    batchResultFailed.value = true;
    batchResult.value = t(
      archived ? 'admin.batchDoneFailedNotice' : 'admin.batchReopenFailedNotice',
      { n: ids.length },
    );
  } finally {
    batchRunning.value = false;
    batchArchiving.value = false;
  }
}

/** Per-row quick action — same batch path with one id so the behavior matches. */
async function toggleRowStatus(row: AdminRow): Promise<void> {
  selectedIds.value = new Set([row.id]);
  await runBatch(!row.archived);
}

// ---------------------------------------------------------------------------
// Misc render helpers
// ---------------------------------------------------------------------------
/** Absolute `YYYY-MM-DD HH:mm` — practical for triage (relative times hide
 *  "how long ago was this really"). */
function tableTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function openRow(id: string): void {
  emit('openSession', id);
}

const statusOptions = computed(() => [
  { value: 'all', label: t('admin.statusAll') },
  { value: 'open', label: t('admin.statusOpen') },
  { value: 'done', label: t('admin.statusDone') },
]);

const timeOptions = computed(() => [
  { value: '0', label: t('admin.timeAll') },
  { value: '7', label: t('admin.timeDaysAgo', { n: 7 }) },
  { value: '30', label: t('admin.timeDaysAgo', { n: 30 }) },
  { value: '90', label: t('admin.timeDaysAgo', { n: 90 }) },
]);

// Escape closes the view (App's own global Escape handler leaves the admin
// overlay alone via anyOverlayOpen).
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close');
}
onMounted(() => {
  void loadAll();
  document.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="sa">
    <header class="sa-head">
      <div class="sa-head-main">
        <div class="sa-kicker">{{ t('admin.title') }}</div>
        <h1 class="sa-title">{{ t('admin.title') }}</h1>
        <p class="sa-desc">{{ t('admin.subtitle') }}</p>
      </div>
      <div class="sa-head-actions">
        <Button variant="secondary" size="sm" @click="emit('close')">
          <Icon name="undo" size="sm" />
          {{ t('admin.back') }}
        </Button>
      </div>
    </header>

    <!-- Filters -->
    <div class="sa-filters">
      <label class="sa-query">
        <Icon class="sa-query-icon" name="search" size="sm" />
        <input
          v-model="query"
          type="text"
          :placeholder="t('admin.query')"
          :aria-label="t('admin.query')"
          autocomplete="off"
          spellcheck="false"
        />
      </label>
      <MenuSelect
        :model-value="workspaceFilter"
        :groups="workspaceFilterGroups"
        size="sm"
        :aria-label="t('admin.filterWorkspace')"
        @update:model-value="workspaceFilter = $event; page = 1"
      />
      <SegmentedControl
        size="sm"
        :model-value="statusFilter"
        :options="statusOptions"
        @update:model-value="statusFilter = $event as 'all' | 'open' | 'done'; page = 1"
      />
      <SegmentedControl
        size="sm"
        :model-value="String(timeFilter ?? 0)"
        :options="timeOptions"
        @update:model-value="timeFilter = Number($event) || null; page = 1"
      />
      <Button variant="ghost" size="sm" :disabled="loading" @click="resetFilters">
        {{ t('admin.reset') }}
      </Button>
    </div>

    <!-- Selection toolbar -->
    <div v-if="selectedIds.size > 0" class="sa-selbar">
      <span class="sa-selbar-count">{{ t('admin.batchSelected', { n: selectedIds.size }) }}</span>
      <Button v-if="selectedIds.size < filtered.length" variant="ghost" size="sm" :disabled="batchRunning" @click="selectAllMatching">
        {{ filtered.length > pageSize ? t('admin.selectAllMatching', { total: filtered.length }) : t('admin.selectAll') }}
      </Button>
      <Button variant="ghost" size="sm" :disabled="batchRunning" @click="clearSelection">
        {{ t('admin.clearSelection') }}
      </Button>
      <span class="sa-selbar-spacer" />
      <Button variant="secondary" size="sm" :loading="batchRunning && !batchArchiving" @click="runBatch(false)">
        {{ t('admin.reopenCount', { n: selectedIds.size }) }}
      </Button>
      <Button variant="primary" size="sm" :loading="batchRunning && batchArchiving" @click="runBatch(true)">
        {{ t('admin.markDoneCount', { n: selectedIds.size }) }}
      </Button>
    </div>

    <!-- Batch result / load error -->
    <div v-if="batchResult" class="sa-banner" :class="{ fail: batchResultFailed }" role="status">
      {{ batchResult }}
    </div>
    <div v-if="loadError" class="sa-banner fail" role="status">
      {{ t('admin.empty') }}
    </div>

    <!-- Table -->
    <div v-if="loading && rows.length === 0" class="sa-state">
      <Spinner size="sm" />
      <span>{{ t('admin.loading') }}</span>
    </div>
    <template v-else-if="filtered.length > 0">
      <div class="sa-table-wrap">
        <table class="sa-table">
          <thead>
            <tr>
              <th class="sa-col-sel"><Checkbox :model-value="pageAllSelected" :aria-label="t('admin.selectPageAll')" @update:model-value="togglePage" /></th>
              <th>{{ t('admin.colStatus') }}</th>
              <th>{{ t('admin.colTitle') }}</th>
              <th>{{ t('admin.colWorkspace') }}</th>
              <th>{{ t('admin.colPrompt') }}</th>
              <th>{{ t('admin.colUpdated') }}</th>
              <th>{{ t('admin.colActions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in pageRows" :key="row.id" :class="{ on: selectedIds.has(row.id) }">
              <td class="sa-col-sel"><Checkbox :model-value="selectedIds.has(row.id)" @update:model-value="toggleRow(row.id)" /></td>
              <td>
                <Badge :variant="row.archived ? 'neutral' : 'info'" :dot="!row.archived">
                  {{ row.archived ? t('admin.statusDone') : t('admin.statusOpen') }}
                </Badge>
              </td>
              <td class="sa-title" :title="row.title">{{ row.title }}</td>
              <td class="sa-ws" :title="row.workspaceId">{{ row.workspaceName }}</td>
              <td class="sa-prompt" :title="row.lastPrompt ?? ''">{{ row.lastPrompt }}</td>
              <td class="sa-time">{{ tableTime(row.updatedAt) }}</td>
              <td class="sa-actions">
                <Button variant="ghost" size="sm" @click="openRow(row.id)">{{ t('admin.open') }}</Button>
                <Button variant="ghost" size="sm" :disabled="batchRunning" @click="toggleRowStatus(row)">
                  {{ row.archived ? t('admin.reopen') : t('admin.markDone') }}
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer class="sa-foot">
        <span class="sa-foot-count">{{ t('admin.total', { n: filtered.length }) }}</span>
        <div class="sa-foot-pager">
          <SegmentedControl
            size="sm"
            :model-value="String(pageSize)"
            :options="pageSizeOptions"
            @update:model-value="pageSize = Number($event); page = 1"
          />
          <Button variant="ghost" size="sm" :disabled="page <= 1" @click="goToPage(page - 1)">
            <Icon name="chevron-left" size="sm" />
            {{ t('admin.prevPage') }}
          </Button>
          <span class="sa-foot-page">{{ page }} / {{ pageCount }}</span>
          <Button variant="ghost" size="sm" :disabled="page >= pageCount" @click="goToPage(page + 1)">
            {{ t('admin.nextPage') }}
            <Icon name="arrow-right" size="sm" />
          </Button>
        </div>
      </footer>
    </template>
    <div v-else class="sa-state">{{ t('admin.empty') }}</div>
  </div>
</template>

<style scoped>
.sa {
  grid-column: 3;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-6);
  box-sizing: border-box;
  overflow: hidden;
  background: var(--color-bg);
}
.sa-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  flex: none;
}
.sa-kicker {
  font-size: var(--text-xs);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-text-faint);
  margin-bottom: var(--space-1);
}
.sa-title {
  margin: 0 0 var(--space-1);
  font-family: var(--font-ui);
  font-size: var(--text-2xl);
  font-weight: var(--weight-semibold);
  letter-spacing: -0.01em;
  color: var(--color-text);
}
.sa-desc {
  margin: 0;
  max-width: 560px;
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  color: var(--color-text-muted);
}
.sa-filters {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  flex: none;
}
.sa-query {
  flex: 1;
  min-width: 180px;
  max-width: 320px;
  height: 34px;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
  color: var(--color-text-faint);
  transition: border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out);
}
.sa-query:focus-within {
  border-color: var(--color-accent);
  box-shadow: var(--p-focus-ring);
  color: var(--color-text-muted);
}
.sa-query-icon { flex: none; }
.sa-query input {
  width: 100%;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font: inherit;
  color: var(--color-text);
}
.sa-selbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: none;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-accent-bd);
  border-radius: var(--radius-md);
  background: var(--color-accent-soft);
}
.sa-selbar-count {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--color-accent-hover);
}
.sa-selbar-spacer { flex: 1; }
.sa-banner {
  flex: none;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-success-bd);
  border-radius: var(--radius-md);
  background: var(--color-success-soft);
  color: var(--color-success);
  font-size: var(--text-sm);
}
.sa-banner.fail {
  border-color: var(--color-danger-bd);
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.sa-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-lg);
  background: var(--color-surface-raised);
}
.sa-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-ui);
  font-size: var(--text-sm);
}
.sa-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--color-surface-raised);
  text-align: left;
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  border-bottom: 1px solid var(--color-line);
  white-space: nowrap;
}
.sa-table tbody td {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-line);
  color: var(--color-text);
  vertical-align: middle;
}
.sa-table tbody tr:last-child td { border-bottom: none; }
.sa-table tbody tr:hover { background: var(--color-surface-sunken); }
.sa-table tbody tr.on { background: var(--color-accent-soft); }
.sa-col-sel { width: 40px; }
.sa-title {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: var(--weight-medium);
}
.sa-ws {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-muted);
}
.sa-prompt {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-muted);
}
.sa-time {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-faint);
  white-space: nowrap;
}
.sa-actions {
  display: flex;
  gap: var(--space-1);
  white-space: nowrap;
}
.sa-foot {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.sa-foot-count { font-size: var(--text-sm); color: var(--color-text-muted); }
.sa-foot-pager { display: flex; align-items: center; gap: var(--space-2); }
.sa-foot-page { font-size: var(--text-xs); color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.sa-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
</style>