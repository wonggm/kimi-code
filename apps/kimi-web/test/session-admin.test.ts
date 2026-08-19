// Scenario: pure logic extracted from the session-admin page and the sidebar
// search shortcut — both live in SFC `<script>` blocks so the components stay
// thin and the predicates stay unit-testable without mounting anything.
// Run: pnpm --filter @moonshot-ai/kimi-web exec vitest run test/session-admin.test.ts

import { describe, expect, it } from 'vitest';
import { filterAdminRows, matchesUpdatedWithin, type AdminFilters, type AdminRow } from '../src/views/SessionAdminView.vue';
import { matchSearchShortcut, type ShortcutKeyLike } from '../src/components/Sidebar.vue';

function row(partial: Partial<AdminRow> & { id: string }): AdminRow {
  return {
    title: 'Session',
    archived: false,
    workspaceId: 'ws-a',
    workspaceName: 'ws-a',
    lastPrompt: 'Fix the build',
    updatedAt: '2026-02-10T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function filters(partial: Partial<AdminFilters> = {}): AdminFilters {
  return { query: '', workspaceId: null, status: 'all', updatedWithinDays: null, ...partial };
}

describe('SessionAdminView — filterAdminRows', () => {
  const rows: AdminRow[] = [
    row({ id: 'o_new', workspaceId: 'ws-a', updatedAt: '2026-02-10T00:00:00.000Z' }),
    row({ id: 'o_old', workspaceId: 'ws-a', updatedAt: '2026-01-10T00:00:00.000Z' }),
    row({ id: 'd_new', archived: true, workspaceId: 'ws-b', updatedAt: '2026-02-08T00:00:00.000Z' }),
    row({ id: 'o_query', lastPrompt: 'deploy the experiment', updatedAt: '2026-02-01T00:00:00.000Z' }),
  ];

  it('keeps everything with default filters and sorts newest-first', () => {
    const out = filterAdminRows(rows, filters());
    expect(out.map((r) => r.id)).toEqual(['o_new', 'd_new', 'o_query', 'o_old']);
  });

  it('filters by status (open = not archived, done = archived)', () => {
    expect(filterAdminRows(rows, filters({ status: 'open' })).map((r) => r.id)).toEqual(['o_new', 'o_query', 'o_old']);
    expect(filterAdminRows(rows, filters({ status: 'done' })).map((r) => r.id)).toEqual(['d_new']);
  });

  it('filters by workspace id', () => {
    expect(filterAdminRows(rows, filters({ workspaceId: 'ws-b' })).map((r) => r.id)).toEqual(['d_new']);
  });

  it('filters by updated-within-N-days against a supplied clock', () => {
    const now = Date.parse('2026-02-11T00:00:00.000Z');
    const out = filterAdminRows(rows, filters({ updatedWithinDays: 3 }), now);
    expect(out.map((r) => r.id)).toEqual(['o_new', 'd_new']);
  });

  it('matches the query against title and last prompt', () => {
    expect(filterAdminRows(rows, filters({ query: 'experiment' })).map((r) => r.id)).toEqual(['o_query']);
    expect(filterAdminRows(rows, filters({ query: 'SESSION' })).map((r) => r.id)).toHaveLength(4);
  });

  it('combines filters (workspace + status + query)', () => {
    const out = filterAdminRows(
      rows,
      filters({ workspaceId: 'ws-a', status: 'open', query: 'build' }),
    );
    expect(out.map((r) => r.id)).toEqual(['o_new', 'o_old']);
  });
});

describe('SessionAdminView — matchesUpdatedWithin', () => {
  const now = Date.parse('2026-02-11T00:00:00.000Z');

  it('accepts sessions updated within the window (inclusive)', () => {
    expect(matchesUpdatedWithin('2026-02-10T00:00:00.000Z', 7, now)).toBe(true);
    expect(matchesUpdatedWithin('2026-02-04T00:00:00.000Z', 7, now)).toBe(true);
  });

  it('rejects sessions older than the window', () => {
    expect(matchesUpdatedWithin('2026-02-03T23:59:59.000Z', 7, now)).toBe(false);
  });

  it('null/zero days means no window', () => {
    expect(matchesUpdatedWithin('2020-01-01T00:00:00.000Z', 0, now)).toBe(true);
  });
});

describe('Sidebar — search shortcut matcher', () => {
  function ev(partial: Partial<ShortcutKeyLike> = {}): ShortcutKeyLike {
    return { key: 'k', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...partial };
  }

  it('matches Cmd+K on Apple platforms, Ctrl+K elsewhere', () => {
    expect(matchSearchShortcut(ev({ metaKey: true }), true)).toBe(true);
    expect(matchSearchShortcut(ev({ metaKey: true }), false)).toBe(false);
    expect(matchSearchShortcut(ev({ ctrlKey: true }), false)).toBe(true);
    expect(matchSearchShortcut(ev({ ctrlKey: true }), true)).toBe(false);
  });

  it('rejects Alt/Shift-modified shortcuts (OS paste paths etc.)', () => {
    expect(matchSearchShortcut(ev({ metaKey: true, altKey: true }), true)).toBe(false);
    expect(matchSearchShortcut(ev({ metaKey: true, shiftKey: true }), true)).toBe(false);
    expect(matchSearchShortcut(ev({ ctrlKey: true, altKey: true }), false)).toBe(false);
  });

  it('is case-insensitive on the key', () => {
    expect(matchSearchShortcut(ev({ key: 'K', metaKey: true }), true)).toBe(true);
  });

  it('rejects other keys and bare presses', () => {
    expect(matchSearchShortcut(ev({ key: 'j', metaKey: true }), true)).toBe(false);
    expect(matchSearchShortcut(ev(), true)).toBe(false);
  });
});