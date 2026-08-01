# Web `/add-dir` Slash Command — Implementation Plan

Add `/add-dir <path>` to the web UI (`apps/kimi-web`), backed by a new `:add-dir` action on `POST /sessions/{tail}` in `packages/kap-server`. It mirrors the TUI's `/add-dir` (`apps/kimi-code/src/tui/commands/add-dir.ts`): add an additional workspace directory to the session. The v2 engine already implements and tests the operation (`ISessionWorkspaceCommandService.addAdditionalDir`), so **no new v2 API and no new files** are needed — only server route + protocol schema additions and web client plumbing, following the `/reload` feature's exact pattern.

---

## Design decisions (with recommendations)

### 1. Persist behavior — recommendation: session-only

The TUI shows a three-way chooser (`session` / `remember` / `cancel`, `add-dir.ts:26-52`). The web has no chooser dialog in the slash-command path, and adding one is out of scope.

**Recommendation**: `/add-dir <path>` always sends `persist: false` (session-only). The status message ("For this session only") makes the behavior explicit. Persistence can be a follow-up (e.g. a `--remember` flag or a `/add-dir-remember` variant) if wanted.

Alternatives considered:
- **Always persist** (`persist: true`) — surprising: silently writes `.kimi-code/local.toml` into the project root. Rejected.
- **Two commands** (`/add-dir`, `/add-dir-remember`) — doubles surface for a rarely-used flag; rejected for now.

### 2. Response shaping — recommendation: snapshot resync, no new client state

The v2 service already injects a `local-command-stdout` message into the main agent's context (`workspaceCommandService.ts:97-115`): "Added workspace directory:\n  <path>\n  For this session only". The `/undo` and `/reload` client flows call `syncSessionFromSnapshot(sid)` after the POST, which pulls that injected message into the visible transcript — same UX as the TUI, zero new client state.

The wire session schema carries **no** `additional_dirs` field (verified: no `additional_dir`/`additionalDir` anywhere under `packages/kap-server/src` or `apps/kimi-web/src`), so a snapshot resync alone would *not* deliver the list — but it doesn't need to: the transcript message is the user-facing confirmation.

**Recommendation**: route returns `{ additionalDirs, persisted, configPath }` in the ok envelope (forward-looking; also useful for a future list view), client ignores the payload beyond success and calls `syncSessionFromSnapshot(sid)` — identical shape to `useWorkspaceState.ts` `reload()` (~line 2576).

### 3. Path handling — recommendation: pass through, let v2 resolve

Verified in `packages/agent-core-v2/src/persistence/backends/node-fs/projectLocalConfigService.ts`:
- `resolvePath` (line 193): absolute paths are normalized as-is; **relative paths resolve against `baseDir`**; `~`/`~/...` expand to the OS home (`expandHome`, line 198).
- `addAdditionalDir` passes `this.workspace.workDir` as `baseDir` (`workspaceCommandService.ts:78`) — i.e. **relative paths resolve against the session cwd**, matching TUI behavior.
- `assertDirectory` (line 209) throws `Error2(ErrorCodes.CONFIG_INVALID)` = code `'config.invalid'` ("workspace.additional_dir must exist and be a directory") when the path is missing or not a directory.

So the route passes the raw string through — no server-side resolution. One wrinkle: `sendMappedError` in `sessions.ts` (line 1251) does **not** map `'config.invalid'`, so a bad path would fall through to `INTERNAL_ERROR` (50000). The plan adds a mapping case → `VALIDATION_FAILED` so the web surfaces a sensible 4xx-style failure (mirrors the TUI showing the error message).

---

## Step 1 — Server: protocol schema for the add-dir response

**File**: `packages/kap-server/src/protocol/rest-session.ts` (near `compactSessionResponseSchema`, line 160)

Add:

```ts
export const addDirSessionRequestSchema = z.preprocess(
  (value) => value === undefined ? {} : value,
  z.object({
    path: z.string().min(1),
    persist: z.boolean().optional(),
  }),
);
export type AddDirSessionRequest = z.infer<typeof addDirSessionRequestSchema>;

export const addDirSessionResponseSchema = z.object({
  additionalDirs: z.array(z.string()),
  persisted: z.boolean(),
  configPath: z.string(),
});
export type AddDirSessionResponse = z.infer<typeof addDirSessionResponseSchema>;
```

**Verify**: `pnpm -C packages/kap-server exec tsc --noEmit -p tsconfig.json` still clean.

---

## Step 2 — Server: `:add-dir` action in the session-action route

**File**: `packages/kap-server/src/routes/sessions.ts`

Four edits:

**a)** Import the new schemas from `../protocol/rest-session` (import block, lines 107-123) and `ISessionWorkspaceCommandService` from `@moonshot-ai/agent-core-v2` (it is exported from the v2 barrel — `packages/agent-core-v2/src/index.ts:328-329`).

**b)** Extend `sessionActionRequestSchema` (line 240) with the superset fields:

```ts
path: z.string().min(1).optional(),
persist: z.boolean().optional(),
```

**c)** Add `'add-dir'` to `allowedActions` (line 641) and add `addDirSessionResponseSchema` to the success-data union (lines 615-623).

**d)** Add the handler branch, placed right after the `reload` branch (after line 807), mirroring reload's guards and btw's session-handle resolution:

```ts
if (parsed.action === 'add-dir') {
  const body = addDirSessionRequestSchema.parse(req.body);
  // Existence check via the persisted index — same as `reload` above: no
  // wasteful wake of a cold session just to 404.
  if ((await core.accessor.get(ISessionIndex).get(parsed.id)) === undefined) {
    throw new Error2(ErrorCodes.SESSION_NOT_FOUND, `session ${parsed.id} does not exist`);
  }
  // Busy guard — TUI marks /add-dir `idle-only`; mutating workspace state
  // mid-turn would race the agent's view of the world.
  if (resolveSessionFacts(core, parsed.id).busy) {
    reply.send(
      errEnvelope(
        ErrorCode.SESSION_BUSY,
        `session ${parsed.id} cannot add a directory while a turn is running`,
        req.id,
      ),
    );
    return;
  }
  // `resume` (not `get`) so a freshly-opened cold session still works —
  // ISessionWorkspaceCommandService is session-scoped and needs a live handle
  // (same pattern as `btw`, line 736).
  const session = await core.accessor.get(ISessionLifecycleService).resume(parsed.id);
  if (session === undefined) {
    throw new Error2(ErrorCodes.SESSION_NOT_FOUND, `session ${parsed.id} does not exist`);
  }
  // Relative paths + `~` are resolved by the v2 service against the session's
  // workDir; a missing/non-directory path throws `config.invalid`, mapped to
  // VALIDATION_FAILED in sendMappedError (edit e).
  const result = await session.accessor
    .get(ISessionWorkspaceCommandService)
    .addAdditionalDir({ path: body.path, persist: body.persist ?? false });
  requestLog(req)?.info({ session_id: parsed.id, action: 'add-dir' }, 'session action completed');
  reply.send(
    okEnvelope(
      {
        additionalDirs: [...result.additionalDirs],
        persisted: result.persisted,
        configPath: result.configPath,
      },
      req.id,
    ),
  );
  return;
}
```

Note the web client always sends `persist: false` (Design decision 1), but the route accepts the flag so a future UI chooser or CLI caller can opt in without another server change.

**e)** Map the missing-directory error. In `sendMappedError` (line 1251), add a case before the fall-through:

```ts
case ErrorCodes.CONFIG_INVALID:
  reply.send(errEnvelope(ErrorCode.VALIDATION_FAILED, err.message, requestId, err.stack));
  return;
```

(`ErrorCodes.CONFIG_INVALID` = `'config.invalid'`, defined in `packages/agent-core-v2/src/kosong/contract/errors.ts:29` and re-exported; it is thrown by `assertDirectory` when the path doesn't exist or isn't a directory.)

**Verify**: `pnpm -C packages/kap-server exec tsc --noEmit -p tsconfig.json` clean.

---

## Step 3 — Web client: API type + daemon implementation

**File**: `apps/kimi-web/src/api/types.ts` (next to `reloadSession`, line 732-734)

```ts
/** Add an additional workspace directory to the session (session-only;
 *  not persisted to project-local config). */
addSessionDir(sessionId: string, path: string): Promise<{ additionalDirs: string[]; persisted: boolean; configPath: string }>;
```

**File**: `apps/kimi-web/src/api/daemon/client.ts` (next to `reloadSession`, lines 706-708)

```ts
// POST /sessions/{id}:add-dir — add an additional workspace directory
// (session-only). The v2 service resolves relative paths against the
// session cwd and injects a local-command-stdout confirmation into the
// transcript; callers resync the snapshot to surface it.
async addSessionDir(sessionId: string, path: string): Promise<{ additionalDirs: string[]; persisted: boolean; configPath: string }> {
  return this.http.post(
    `/sessions/${encodeURIComponent(sessionId)}:add-dir`,
    { path, persist: false },
  );
}
```

**Verify**: `pnpm -C apps/kimi-web exec tsc --noEmit -p tsconfig.json` clean (may fail on later steps' missing pieces — run after Step 5 instead if ordering issues arise).

---

## Step 4 — Web client: workspace-state action + re-export

**File**: `apps/kimi-web/src/composables/client/useWorkspaceState.ts` (next to `reload()`, lines 2576-2585)

```ts
/**
 * Add an additional workspace directory to the active session (daemon
 * :add-dir, session-only). The v2 service injects a local-command-stdout
 * confirmation into the main agent's context; resyncing the snapshot
 * pulls it into the transcript, same as the TUI.
 */
async function addDir(path: string): Promise<void> {
  const sid = rawState.activeSessionId;
  if (!sid) return;
  try {
    await getKimiWebApi().addSessionDir(sid, path);
    await syncSessionFromSnapshot(sid);
  } catch (err) {
    pushOperationFailure('add-dir', err, { sessionId: sid });
  }
}
```

Also add `addDir` to the composable's returned object wherever `reload` is exposed (search the return statement for `reload`).

**File**: `apps/kimi-web/src/composables/useKimiWebClient.ts` (next to `reload: workspaceState.reload`, line 2930)

```ts
addDir: workspaceState.addDir,
```

**Verify**: `pnpm -C apps/kimi-web exec tsc --noEmit -p tsconfig.json` clean.

---

## Step 5 — Web UI: slash command + i18n

**File**: `apps/kimi-web/src/lib/slashCommands.ts` (`SLASH_COMMANDS`, line 24-41)

Add after the `/reload` entry (line 37):

```ts
{ name: '/add-dir',    desc: 'commands.addDir.desc', acceptsInput: true },
```

`acceptsInput: true` keeps the command in the composer so the user can type the path (same as `/compact`, line 35).

**File**: `apps/kimi-web/src/App.vue` (`handleCommand`, line 501)

Add before the `switch` (alongside the other argument-taking commands, lines 504-526):

```ts
// `/add-dir <path>` adds an additional workspace directory for this session
// only (TUI parity, minus the persist chooser).
if (cmd === '/add-dir' || cmd.startsWith('/add-dir ')) {
  const arg = cmd.slice('/add-dir'.length).trim();
  if (arg) void client.addDir(arg);
  return;
}
```

**File**: `apps/kimi-web/src/i18n/locales/en/commands.ts` (next to `reload`, line 20)

```ts
addDir: { desc: 'Add a workspace directory for this session' },
```

**File**: `apps/kimi-web/src/i18n/locales/zh/commands.ts` (next to `reload`, line 20)

```ts
addDir: { desc: '为当前会话添加工作目录' },
```

**Verify**: `pnpm -C apps/kimi-web exec tsc --noEmit -p tsconfig.json` clean; open the slash menu in a dev build and confirm `/add-dir` appears with the description and stays in the composer when selected.

---

## Step 6 — Tests

**File**: `packages/kap-server/test/sessions.test.ts` — extend, following the reload tests (lines 600-675):

| Test | Verifies |
|------|----------|
| adds a directory to an idle session | Create session with `metadata: { cwd }`, `POST /sessions/{id}:add-dir` with `{ path: <tmp subdir>, persist: false }`; expect `code: 0`, `data.persisted === false`, `data.additionalDirs` contains the resolved dir |
| rejects add-dir on a busy session with SESSION_BUSY | Same stub-provider busy pattern as the reload busy test (lines 619-652); expect `40901`, tolerate the race the same way (skip if the stub rejects synchronously) |
| returns 40401 when adding to a missing session | `POST /sessions/sess_missing:add-dir` → `code: 40401` |
| rejects a non-existent path | `path: '/definitely/not/here'` → `code: 40001` (VALIDATION_FAILED) via the new `config.invalid` mapping |

**File**: `apps/kimi-web/test/slash-menu.test.ts` — extend, mirroring the `/reload` prefix test (lines 62-65):

| Test | Verifies |
|------|----------|
| offers the /add-dir command for an add-dir prefix | `filterCommands`-backed items contain `/add-dir` for query `add-d` |
| /add-dir accepts input | The matched item has `acceptsInput: true` (same assertion style the file uses for other commands) |

---

## Step 7 — Full verification (in order)

```bash
pnpm -C packages/kap-server exec vitest run test/sessions.test.ts
pnpm -C apps/kimi-web exec vitest run test/slash-menu.test.ts
pnpm -C packages/kap-server exec tsc --noEmit -p tsconfig.json
pnpm -C apps/kimi-web exec tsc --noEmit -p tsconfig.json
NODE_OPTIONS='--max-old-space-size=3072' pnpm -C apps/kimi-web run build && (cd apps/kimi-code && node scripts/copy-web-assets.mjs)
```

The `NODE_OPTIONS` heap cap is **required** on this 5GB machine — an uncapped web build OOM-crashed it before. Do not drop it.

All six commands must exit 0.

---

## Step 8 — Commit

One commit:

```
feat(web): add /add-dir slash command
```

Covering all files in the summary table below.

---

## Step 9 — Update the merge-upstream skill inventory

**File**: `/home/m/.kimi-code/skills/merge-upstream-kimi/SKILL.md`

That skill inventories the fork's 84 custom files as the rebase conflict surface (table starting ~line 32). All touched files already have rows (added by the `/reload` feature) — **extend the row descriptions, do not add rows**:

- `packages/kap-server/src/routes/sessions.ts` (~line 112): append "`/add-dir`: `:add-dir` action — busy guard + `ISessionWorkspaceCommandService.addAdditionalDir` + `config.invalid`→VALIDATION_FAILED mapping".
- `apps/kimi-web/src/api/types.ts`: append `/add-dir` (`addSessionDir`) to the row.
- `apps/kimi-web/src/api/daemon/client.ts`: append `/add-dir` (`addSessionDir` POST).
- `apps/kimi-web/src/composables/client/useWorkspaceState.ts` (~line 64): append `addDir()`.
- `apps/kimi-web/src/composables/useKimiWebClient.ts`: append `addDir` re-export.
- `apps/kimi-web/src/lib/slashCommands.ts` (~line 70): append `/add-dir` entry.
- `apps/kimi-web/src/App.vue` (~line 53): append `'/add-dir'` handling in `handleCommand`.
- i18n rows (en/zh `commands.ts`): append `addDir` description key.
- Test rows (`packages/kap-server/test/sessions.test.ts`, `apps/kimi-web/test/slash-menu.test.ts` if present): extend descriptions with the add-dir cases.
- Add a numbered feature bullet next to bullet 10 (~line 24): "Web: `/add-dir` slash command — kap-server `POST /sessions/{id}:add-dir` route (busy guard, session-scoped `ISessionWorkspaceCommandService.addAdditionalDir`, `persist: false` from web); web side mirrors `/reload` plumbing."
- Add a post-rebase checklist line next to the `/reload` one (~line 190) verifying `'add-dir'` survives in `allowedActions` and `slashCommands.ts`.

**File count**: `packages/kap-server/src/protocol/rest-session.ts` gets its first fork-only schema — check whether it already has a row; if not, add a row **and bump the count 84 → 85** in the description line (~line 3) and the table intro (~line 32). All other files keep the count unchanged. Verify the true count with `git log upstream/main..main --name-only --pretty=format: | sort -u | wc -l` after committing and adjust to the actual number.

---

## Files touched summary

| # | File | Change type |
|---|------|-------------|
| 1 | `packages/kap-server/src/protocol/rest-session.ts` | Modify (add-dir request/response schemas) |
| 2 | `packages/kap-server/src/routes/sessions.ts` | Modify (`:add-dir` action + `config.invalid` mapping) |
| 3 | `apps/kimi-web/src/api/types.ts` | Modify (`addSessionDir` type) |
| 4 | `apps/kimi-web/src/api/daemon/client.ts` | Modify (`addSessionDir` POST) |
| 5 | `apps/kimi-web/src/composables/client/useWorkspaceState.ts` | Modify (`addDir()` action) |
| 6 | `apps/kimi-web/src/composables/useKimiWebClient.ts` | Modify (re-export) |
| 7 | `apps/kimi-web/src/lib/slashCommands.ts` | Modify (slash entry) |
| 8 | `apps/kimi-web/src/App.vue` | Modify (`handleCommand` branch) |
| 9 | `apps/kimi-web/src/i18n/locales/en/commands.ts` | Modify (desc) |
| 10 | `apps/kimi-web/src/i18n/locales/zh/commands.ts` | Modify (desc) |
| 11 | `packages/kap-server/test/sessions.test.ts` | Modify (4 tests) |
| 12 | `apps/kimi-web/test/slash-menu.test.ts` | Modify (2 tests) |
| 13 | `/home/m/.kimi-code/skills/merge-upstream-kimi/SKILL.md` | Modify (inventory rows + count) |

**Total**: 13 existing files modified. **No new files. No new v2 API** — `ISessionWorkspaceCommandService.addAdditionalDir` (`packages/agent-core-v2/src/session/workspaceCommand/workspaceCommand.ts:28`, impl `workspaceCommandService.ts:50`, tests `packages/agent-core-v2/test/session/workspaceCommand/workspaceCommand.test.ts`) is used as-is.

---

## Verifiables

| # | Gate | Command / check | Pass = |
|---|------|-----------------|--------|
| V1 | Server tests | `pnpm -C packages/kap-server exec vitest run test/sessions.test.ts` | All green (incl. 4 new) |
| V2 | Web tests | `pnpm -C apps/kimi-web exec vitest run test/slash-menu.test.ts` | All green (incl. 2 new) |
| V3 | Server typecheck | `pnpm -C packages/kap-server exec tsc --noEmit -p tsconfig.json` | 0 errors |
| V4 | Web typecheck | `pnpm -C apps/kimi-web exec tsc --noEmit -p tsconfig.json` | 0 errors |
| V5 | Web build + assets | `NODE_OPTIONS='--max-old-space-size=3072' pnpm -C apps/kimi-web run build && (cd apps/kimi-code && node scripts/copy-web-assets.mjs)` | Exit 0, no OOM |
| V6 | End-to-end | In the web UI: `/add-dir /tmp` in an idle session | Transcript shows "Added workspace directory: /tmp — For this session only"; `/add-dir` during a running turn surfaces a SESSION_BUSY failure |
| V7 | Skill inventory | `git log upstream/main..main --name-only --pretty=format: \| sort -u \| wc -l` matches the count in `merge-upstream-kimi/SKILL.md` | Counts agree |
