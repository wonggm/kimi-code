# Repository-level Agent Guide

Reply in the same language as the user.

This is a TypeScript monorepo built for agent-assisted development. Keep the root `AGENTS.md` limited to hot-path rules: the project map, hard constraints, and workflow requirements — things every task needs to know.

## Working Principles

- Think from first principles. Start from real requirements, code facts, and verification results; if the goal is unclear, discuss it with the user first.
- Treat code, not documentation, as the source of truth. Unless the user explicitly says otherwise, do not read ordinary Markdown just to understand the implementation.
- Before making code changes, read the relevant code and the most recent constraints, and follow the nearest `AGENTS.md` in the directory tree.
- Keep changes focused. Do not slip in unrelated refactors along the way.
- When committing, do not add any co-author attribution, and do not reveal the identity of the agent in commit messages, PR descriptions, or any explanatory text.

## Project Map

- `apps/kimi-code`: the CLI / TUI application. It consumes core capabilities through `@moonshot-ai/kimi-code-sdk` and must not depend directly on `@moonshot-ai/agent-core`. When writing or modifying its terminal UI, use the `write-tui` skill (`.agents/skills/write-tui/SKILL.md`).
- `apps/kimi-web`: the browser web UI, a peer to the TUI. Vue 3 + Vite + vue-i18n; talks to the server over REST + WebSocket under `/api/v1`. It must not depend on `@moonshot-ai/agent-core` (wire types are re-implemented locally). Debug against the two engines via the root `pnpm dev:v1` / `pnpm dev:v2` backend scripts — the dev Sidebar shows the active backend and switches it at runtime. See `apps/kimi-web/AGENTS.md`.
- `apps/vis`, `apps/vis/server`, `apps/vis/web`: visual debugging tools for sessions and replays.
- `apps/kimi-inspect`: web inspector for the kap-server `/api/v1/debug` RPC surface — workspace/session browser, per-session chat, and Service panels (data + trigger buttons) for the Session and Agent scopes. Built on its own old-klient-style channel layer (`src/channel/` — VS Code `ProxyChannel` model); `GET /api/v1/debug/channels` loads the entire scoped DI registry 1:1 (every Service callable, no whitelist). No Service-event push channel — panels fetch on demand; the `Sidebar` polls react-query on a 15 s interval, and a connection failure shows a blocking "Debug surface unavailable" screen instead of falling back anywhere. The Vite dev server proxies `/api` to a running kap-server (`KIMI_SERVER_URL`, default `http://127.0.0.1:58627`); the per-session chat renders turn-granularly from the **transcript** surface (not context memory) with `content-visibility: auto` for native off-screen virtualization (no windowing library); `/api/v1/ws` is an incremental `transcript.ops` channel (grade `block`) and tracks the op-batch watermark via a `subscribe_v2` control frame — seq gap / reconnect / `resync_required` falls back to the full REST refresh.
- `packages/agent-core`: the unified agent engine, including Agent, Session, profile, skills, tools, plan, permission, background, records, the in-process DI service layer (`src/services/`), and other core capabilities.
- `packages/node-sdk`: the public TypeScript SDK and harness.
- `packages/kosong`: the LLM / provider abstraction layer.
- `packages/kaos`: the execution environment and file/process abstractions.
- `packages/oauth`: Kimi OAuth and managed auth utilities.
- `packages/telemetry`: shared client-side telemetry infrastructure.
- `packages/transcript`: the isomorphic transcript rendering data layer (browser-safe, no engine imports) — agent-granular L1 store, idempotent L2 operations, `off/turn/block/delta` L3 subscription granularity, framework-free L4 view registry, and turn-cursor pagination. Sole owner of all transcript contract types (`src/contract/`); consumed by `packages/kap-server` (engine events → transcript, REST + WS surface; cold sessions rebuild from `wire.jsonl` via a two-level fold — `history/groupTurns.ts` + `history/foldFacts.ts`). Owns the op-batch sequencing contract (`transcriptSeqSchema` in `contract/schema.ts`): a per-(session, agent) monotonic batch `seq` on `transcript.ops` / `transcript.reset` / the REST transcript response, the `transcript_since` subscription cursor, and the `GET .../transcript/ops` catch-up response shape — every field optional so pre-seq peers fall back to loss-signal-driven refreshes.
- `packages/kap-server`: the Kimi Code server, backed by the DI × Scope agent engine (`@moonshot-ai/agent-core-v2`). Exposes sessions over REST + WebSocket (`/api/v1` + `/api/v1/ws`); bootstrapped from `src/start.ts`, consumed by `apps/kimi-code`. The RPC surface is `/api/v1/debug/*` — a reflection dispatcher over the ENTIRE scoped DI registry (every Service callable, no whitelist), mounted only with `--debug-endpoints` on a loopback bind and gated by the global bearer auth; repo dev scripts pass the flag. Implements the op-batch sequencing contract from `packages/transcript`: `TranscriptService.dispatchOps` assigns per-agent consecutive `seq`, WS `transcript.ops`/`transcript.reset` payloads carry the seq/watermark and a `transcript_since` cursor, and `GET /sessions/{id}/transcript/ops?since_seq=` serves point-to-point catch-up. The global search surface is `POST /api/v1/search` (terms / literal modes) backed by a single minidb at `<home>/search-index` (`IGlobalSearchService`, App scope); live sessions bypass the index and scan the in-memory transcript store, and live-route errors never fall back to the index — the response's `source: 'live' | 'index'` field tells the caller which route served the page.
- `packages/klient`: the client SDK — a contract-driven facade over `agent-core-v2` with aggregated `global.*` / `session(id).*` / `agent(id).*` methods, zod validation on every call, and typed event forwarding. Transport is chosen once at creation via subpath entry (`@moonshot-ai/klient/ipc|memory`); both return the same `Klient`. Hosts the e2e suites: legacy `/api/v1` live suites (`test/e2e/legacy/`) and the docker runner (`pnpm --filter @moonshot-ai/klient docker:e2e`). See `packages/klient/AGENTS.md`.
- `packages/server-e2e`: live e2e tests and scenarios against a running server (`KIMI_SERVER_URL`, default `http://127.0.0.1:58627`). See `packages/server-e2e/AGENTS.md`.
- `packages/tree-sitter-bash`: a pure-TypeScript bash parser (no runtime deps, no wasm) producing a syntax tree with tree-sitter-bash 0.25.0 named-node types and UTF-16 offsets. `parse(source, { timeoutMs, maxNodes })` runs under a deterministic budget (default 50 ms / 50k nodes, plus per-chain recursion caps) and returns a discriminated `ParseResult` (`{ ok, rootNode, hasError }` or `{ ok: false, reason: 'aborted' }`) — callers must treat aborted/hasError trees as "cannot analyze" and degrade. Parser only, no safety judgments. See `packages/tree-sitter-bash/AGENTS.md`.
- `packages/minidb`: the embedded JSON document store (`MiniDb`) behind kap-server's search index — snapshot + WAL persistence with an exclusive write lock (losers open read-only and catch up from WAL), plus a larger-than-RAM full-text layer: `src/text-index.ts` is the inverted index (in-RAM dictionary + delta, on-disk postings in `src/text-postings.ts`, rebuilt from the Store on open and on compaction) with an injectable `tokenizer`/`queryTokenizer`; the default tokenizer keeps ASCII words + CJK uni/bigrams, and `src/trigram.ts` provides the hashed 2/3-gram tokenizer that backs substring-exact search. Text-index definitions (including the tokenizer name) persist in `db.textindexes.json`.

## Environment Requirements

- **Node.js**: `>=24.15.0` (from the root `package.json` `engines`; `.nvmrc` is `24.15.0`, used by nvm / fnm / mise to pick the minimum recommended version).
- **pnpm**: `10.33.0` (from the root `package.json` `packageManager`).
- `pnpm install` will fail when the Node version is not satisfied, because `.npmrc` sets `engine-strict=true`.

## Monorepo Workspace Maintenance

- `pnpm-workspace.yaml` is the source of truth for workspace membership, but `flake.nix` also contains **hardcoded** `workspacePaths` and `workspaceNames` lists.
- **Whenever you add or remove a workspace package, you MUST update both `pnpm-workspace.yaml` and `flake.nix` — for every package, including leaf / test / e2e packages that nothing depends on.**
  - `pnpm-workspace.yaml` uses globs (`packages/*`, `apps/*`), so most packages land there automatically; `flake.nix` is fully manual and is where omissions happen.
  - Missing a path in `flake.nix`'s `workspacePaths` will silently drop files from the Nix build's `src` fileset.
  - Missing a name in `flake.nix`'s `workspaceNames` will break `pnpmConfigHook` because dependencies for that workspace will not be fetched.
- The automated "Check flake.nix workspace sync" (`scripts/check-nix-workspace.mjs`) only validates the transitive dependency **closure of `@moonshot-ai/kimi-code`**. A leaf package outside that closure (e.g. an e2e package nobody imports) slips through even when it is missing from `flake.nix`. A green check is therefore NOT proof that `flake.nix` is fully in sync — keep it updated by hand on every add/remove, do not rely on the check to catch omissions.

## General Coding Rules

- For optional object properties, pass `undefined` directly instead of using conditional spread.
  - YES: `{ user }`
  - NO: `{ ...(user ? { user } : undefined) }`
- Optional object properties do not need to additionally allow `undefined` in the type.
  - YES: `interface Options { user?: User }`
  - NO: `interface Options { user?: User | undefined }`
- Internal methods with only a single parameter should not be turned into options objects just for stylistic uniformity.
- Except for a package's `index.ts`, other `index.ts` files should prefer `export * from './module';`.
- The `Agent` class in `packages/agent-core/src/agent` must be usable on its own. The constructor must not force the caller to create a `Session` instance, nor require an `agentId` or `session`. It may accept an optional `sessionId` as a request-config hint — for example mapped to the provider's `prompt_cache_key` — but the instance must not hold `sessionId`, and must not depend on the Session lifecycle, metadata, or parent/child relationship logic.
- Do not add too many new test files. Prefer adding tests to the existing test file of the corresponding component or module.
- When a test fails because of a user modification, default to fixing the test first; do not change the implementation to satisfy an old test unless the implementation truly has a bug.
- Do not sacrifice code quality for external compatibility unless the user explicitly asks for it. Breaking changes go through changesets and a `major` bump, gated by the rule below.

## Experimental Features

- Gate a not-yet-public feature behind an experimental flag. Add the flag to the registry at `packages/agent-core/src/flags/registry.ts`, then check it with `flags.enabled('my-feature')`. Flags are env-driven and default off: `KIMI_CODE_EXPERIMENTAL_<NAME>` toggles one, `KIMI_CODE_EXPERIMENTAL_FLAG` enables all. Release by flipping the entry's `default` to `true`.

## Where to Update Instructions

- Hard rules that affect almost every task: update the root `AGENTS.md`.
- Rules that only affect a specific directory: update the nearest sub-directory `AGENTS.md`.
- Keep instruction updates focused and supported by code facts.

## Workflow Requirements

- Prefer `rg` / `rg --files` when reading code.
- When designing changes, follow existing boundaries and local patterns first.
- In public text and test data, replace real internal identifiers with neutral placeholders such as `example.com`, `example.test`, and `YOUR_API_KEY`. Before opening a PR, ask a read-only agent to audit the diff for context-specific internal identifiers.
- When creating a PR, the PR title must follow Conventional Commit style, e.g. `chore: remove legacy format commands`.
- When an AI agent opens or updates a PR, fill in `.github/pull_request_template.md` — link the related issue or explain the problem, then describe what changed. Do not leave placeholder text or submit a generic summary of the diff.
- Do not submit vague AI-generated PR text. The human author must understand the change well enough to explain the code, edge cases, and why the approach fits this repository.
- After finishing a task and before submitting a PR, you must run the `gen-changesets` skill (see `.agents/skills/gen-changesets/SKILL.md`) and generate a changeset under `.changeset/` according to its rules.
- When generating a changeset, **never** decide on a `major` bump on your own. When you judge a change to meet the major criteria (breaking changes, incompatible user configuration, renamed or removed commands/arguments, changed behavior semantics, etc.), you must stop and explain it to the user and ask for confirmation. **Only write `major` after the user has explicitly agreed.** Otherwise default to `minor` (and fall back to `patch` if `minor` is unclear). See the "Hard rule: confirm with the user before writing `major`" section in `.agents/skills/gen-changesets/SKILL.md` for details.
- Prefer importing via `import ... from '#/...'`, which serves the same purpose as `import ... from '@/...'`.
- Do not commit throwaway scratch or exploratory files. Never stage:
  - Agent working notes or handoff/summary documents (e.g. `HANDOVER-*.md`, `HANDOFF-*.md`, `handoff.md`).
  - Throwaway UI/UX prototypes or design mockups (e.g. `*-designs.html`, `*-mockup.html`, `*-demo(s).html`) at the repo root or under a `design/` folder. The only tracked `.html` files should be Vite `index.html` entrypoints.
  Before committing or opening a PR, run `git status` and `git diff --staged --stat` and remove anything matching these patterns. Put scratch work under `.tmp/` (gitignored) instead of the repo root or the source tree.
