# Web `/reload` — Fix SESSION_NOT_FOUND via `resume()` Return Check

Single-file route fix plus test updates. ~15 lines of code changed.

**Bug**: `POST /sessions/{id}:reload` on an existing idle session replies
`40401 SESSION_NOT_FOUND` ("session <id> does not exist"). Two defects, both in
the reload branch of `packages/kap-server/src/routes/sessions.ts` (starts line 769):

1. **Fragile existence pre-check** (lines 770-776): `ISessionIndex.get()`
   (`packages/agent-core-v2/src/app/sessionIndex/sessionIndexService.ts:120`)
   re-enumerates session dirs on disk; `listWorkspaceIds()` (`:279`) swallows
   listing errors with `catch { return [] }` (`:282`), so `get()` can return
   `undefined` spuriously for a session that exists.
2. **Unchecked resume** (line 803): the final `await lifecycle.resume(parsed.id)`
   ignores the return value. `resume()`
   (`packages/agent-core-v2/src/app/sessionLifecycle/sessionLifecycleService.ts:269`,
   `doResume` at `:287`) returns `undefined` when the session cannot be
   materialized — no index summary (`:291-292`), or summary lacks `cwd` and
   `IWorkspaceService.get()` fails (`:293-296`). On failure the route still
   replies `ok` and leaves the session dead; the web client's follow-up
   `syncSessionFromSnapshot` swallows the 40401 and silently drops the session.

**Fix direction**: follow the pattern every other action in the same route uses
(`btw` at `sessions.ts:736-750`, `restore` at `:752-767`, `archive` at
`:809-815`): call `lifecycle.resume(id)`, check the return, throw
`Error2(ErrorCodes.SESSION_NOT_FOUND, ...)` on `undefined`.

---

## Step 1 — Rework the reload branch

**File**: `packages/kap-server/src/routes/sessions.ts` (lines 769-807)

Replace the branch body:

- **Delete** the `ISessionIndex.get()` existence pre-check (lines 770-776) and
  its comment. Rationale: the branch's own final step already resumes the
  session, so the "don't wake a cold session just to check" argument in the old
  comment never held — reload always wakes it.
- **Keep unchanged**: the busy guard (lines 777-790, `resolveSessionFacts(core,
  parsed.id).busy` → 40901 reply) and its comment.
- **Keep unchanged**: config reload + plugin rescan order — `IConfigService.reload()`
  then `IPluginService.reloadPlugins()` (lines 791-795) stay **before** the
  close so the rebind on resume picks up new bindings.
- **Keep close-if-live** (lines 796-802): it is still required. `resume()`
  short-circuits and returns the existing handle when the session is live
  (`sessionLifecycleService.ts:272-273`) — without `close()` first, a live idle
  session would be "reloaded" into the same stale scope and never pick up the
  new config/plugin bindings. `close()` (`:319-327`) only removes the live
  handle and disposes the scope; it does **not** touch the on-disk index or
  session dir, so close→resume is a safe sequence. Precedent in-tree: the
  existing test "reloads a stopped (cold) session back to live"
  (`test/sessions.test.ts:654`) already exercises close→resume, and the web
  client's close-then-open flow does the same via `restore()` → `resume()`
  (`sessionLifecycleService.ts:345-350`).
- **Check the resume return**:
  ```ts
  const handle = await lifecycle.resume(parsed.id);
  if (handle === undefined) {
    throw new Error2(ErrorCodes.SESSION_NOT_FOUND, `session ${parsed.id} does not exist`);
  }
  ```
  Same error shape as `btw`/`restore`/`archive` produce — the web client and
  `sendMappedError` already handle it.
- Keep the `requestLog` line and `reply.send(okEnvelope({}, req.id))` as-is,
  now reached only after a successful resume.

**Import check**: `ISessionIndex` stays imported — still used at lines 394,
485, 532, 706, 851, 860. No import cleanup needed.

**Verify**: `pnpm -C packages/kap-server exec tsc --noEmit -p tsconfig.json` → 0 errors.

---

## Step 2 — Update tests

**File**: `packages/kap-server/test/sessions.test.ts` (reload block, lines 600-675)

- **"reloads an idle live session (close + resume) and keeps it functional"
  (line 600)**: no expectation change — still `code: 0`, live handle re-created
  (`:613`), session still projected (`:614-616`). It now additionally proves
  the resume return was checked (the `ok` reply implies `handle !== undefined`).
- **"rejects reload on a busy session..." (line 619)**: no change — the busy
  guard is untouched and fires before any close/resume.
- **"reloads a stopped (cold) session back to live" (line 654)**: no
  expectation change. Update the comment at lines 659-661 only if it still
  references the removed pre-check; the close→resume path is unchanged.
- **"returns 40401 when reloading a missing session" (line 672)**: same
  expectation (`body.code === 40401`), but the path changes — it now flows
  through `resume()` → `doResume` → `index.get()` returning `undefined`
  instead of the route's own pre-check. Adjust the test name/comment to say
  "when resume cannot materialize the session" so future readers know which
  guard produced the 40401.
- **New case — index summary present but unmaterializable (workspace gone)**:
  create a session, close it, then remove its workspace resolution so the
  summary lacks a usable `cwd` (`doResume` returns `undefined` at
  `sessionLifecycleService.ts:293-296`). Expect `40401`. If fabricating this
  state against the real DI container proves heavy, skip it — the missing-session
  test already covers the `resume() === undefined → 40401` contract. Do not
  mock `ISessionLifecycleService`; the file's existing tests all go through the
  real server.

**Verify**: `pnpm -C packages/kap-server exec vitest run test/sessions.test.ts` → all green.

---

## Step 3 — Edge case: what the web client shows on honest 40401

For a session whose summary lacks `cwd` and whose workspace is gone, the route
now throws `SESSION_NOT_FOUND` — the same code the client already gets from
`restore`/`archive` in that situation, and its `syncSessionFromSnapshot`
handler already drops such sessions from the UI deliberately (a session whose
workspace is gone genuinely cannot be opened). **Decision: keep the single
`session ... does not exist` message; no distinct "workspace missing" code.**
That would be new wire surface for a case the client already handles
consistently. The real win of this fix is that the failure is now reported at
all instead of being masked by an `ok` reply.

---

## Step 4 — Rebuild / restart so the running web daemon picks up the fix

kap-server ships as TypeScript source to the app — its `package.json` exports
point at `./src/index.ts`, and `apps/kimi-code` bundles it with `tsdown`
(`apps/kimi-code/package.json:53`). So:

- If the web UI runs from a built install: rebuild the bundle —
  `pnpm -C apps/kimi-code exec tsdown` — then restart the `kimi web` process.
- If running via the dev script (`pnpm -C apps/kimi-code run dev:kap-server`,
  which uses `tsx` on source): just restart the process, no build needed.

**Verify**: after restart, `/reload` in the web UI on an idle session returns
`code: 0` and the session stays visible; on a nonexistent session id it
returns 40401 (check via `curl -X POST .../api/v1/sessions/sess_missing:reload`
against the running daemon, or the route test in Step 2).

---

## What does NOT change

- Busy guard (40901 path) — identical code, identical position.
- Config/plugin reload order (`IConfigService.reload()` →
  `IPluginService.reloadPlugins()`, before close).
- `close()` semantics, `ISessionIndex`, `ISessionLifecycleService` — no
  changes in `agent-core-v2`.
- Web client (`syncSessionFromSnapshot` and all reload UI code).
- All other actions in `sessions.ts`.

## Verification summary

| # | Check | Command | Pass = |
|---|-------|---------|--------|
| V1 | Route tests | `pnpm -C packages/kap-server exec vitest run test/sessions.test.ts` | All green |
| V2 | Typecheck | `pnpm -C packages/kap-server exec tsc --noEmit -p tsconfig.json` | 0 errors |
| V3 | Live daemon | rebuild/restart per Step 4, `/reload` an idle session in web UI | `code: 0`, session stays in UI |

## Commit plan

One commit:

```
fix(kap-server): check resume() return in session reload instead of session-index pre-check
```

Body: the `ISessionIndex.get()` pre-check could spuriously report a real
session as missing (disk re-enumeration swallows listing errors), and the
final `resume()` ignored its return, replying `ok` while leaving the session
dead. Reload now follows the `btw`/`restore`/`archive` pattern: close-if-live,
then resume, throwing SESSION_NOT_FOUND when resume returns undefined.
