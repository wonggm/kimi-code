# Custom Subagent Profiles — Implementation Plan

Two-phase plan: Phase 1 wires user-defined agent profiles into both engines (v1 + v2) with a test subagent; Phase 2 imports the physics-experts plugin.

---

## Phase 1: Custom Subagent Loading + Test

### Step 1 — Sync loader + markdown parser

**File**: `packages/agent-core/src/profile/load.ts`

Add three functions:

**a) `loadAgentProfilesFromDirSync(paths: readonly string[])`**
Walks each path: if directory, `readdirSync` + filter `*.{yaml,yml,md}`, sort, `readFileSync` each. If file, load directly. Calls `finalizeRawAgentProfileSync`. Returns `resolveAgentProfiles(rawProfiles)`.

**b) `finalizeRawAgentProfileSync(content, profilePath)`**
Detects `.md` by extension → calls `parseAgentProfileMarkdown`. Otherwise calls existing `parseAgentProfileYaml` (already sync). Resolves `systemPromptPath` with `readFileSync`.

**c) `parseAgentProfileMarkdown(content, profilePath)`**
Splits on `---`, parses first YAML block → extracts `name`, `description`, `tools`, `model`, `color`. Validates `name` is present. Body (after second `---`) is `systemPromptTemplate`. Returns `RawAgentProfile`.

```ts
function parseAgentProfileMarkdown(content: string, profilePath: string): RawAgentProfile {
  const parts = content.split(/^---$/m);
  if (parts.length < 3) {
    throw new Error(`Invalid markdown agent profile at ${profilePath}: missing YAML frontmatter`);
  }
  const fm = loadYaml(parts[1]) as Record<string, unknown>;
  const body = parts.slice(2).join('---').trim();
  const name = typeof fm.name === 'string' ? fm.name.trim() : '';
  if (name.length === 0) {
    throw new Error(`Markdown agent profile at ${profilePath} is missing required "name" in frontmatter`);
  }
  return {
    name,
    description: typeof fm.description === 'string' ? fm.description : undefined,
    tools: Array.isArray(fm.tools) ? fm.tools.filter((t): t is string => typeof t === 'string') : undefined,
    systemPromptTemplate: body,
  };
}
```

**Verify**: Unit test creates a `.md` file with `---\nname: test\ntools: [Read]\n---\nYou are a test.`, calls the loader, checks the resolved profile.

---

### Step 2 — Add `agentProfiles` to config schema

**File**: `packages/agent-core/src/config/schema.ts`

Add to `KimiConfigSchema` (after `subagentModels`):
```ts
agentProfiles: z.array(z.string()).optional(),
```

Add to `KimiConfigPatchSchema` (after `subagentModels`):
```ts
agentProfiles: z.array(z.string()).optional(),
```

---

### Step 3 — Wire `agent_profiles` in TOML round-trip

**File**: `packages/agent-core/src/config/toml.ts`

In `transformTomlData` (after the `subagentModels` block):
```ts
} else if (targetKey === 'agentProfiles' && Array.isArray(value)) {
  result[targetKey] = value.filter((v): v is string => typeof v === 'string');
}
```

In `configToTomlData`:
```ts
setDefined(out, 'agent_profiles', config.agentProfiles !== undefined ? [...config.agentProfiles] : undefined);
```

---

### Step 4 — Make `DEFAULT_AGENT_PROFILES` extensible

**File**: `packages/agent-core/src/profile/default.ts`

1. Change `export const` → `export let` for `DEFAULT_AGENT_PROFILES`
2. Add:

```ts
import { loadAgentProfilesFromDirSync } from './load';

let _userProfilesLoaded = false;

export function loadUserAgentProfiles(paths: readonly string[]): Record<string, ResolvedAgentProfile> {
  return loadAgentProfilesFromDirSync(paths);
}

export function extendAgentProfiles(userProfiles: Record<string, ResolvedAgentProfile>): void {
  for (const [name] of Object.entries(userProfiles)) {
    if (DEFAULT_AGENT_PROFILES[name] !== undefined) {
      throw new Error(
        `User agent profile "${name}" collides with a built-in profile of the same name`,
      );
    }
  }
  Object.assign(DEFAULT_AGENT_PROFILES, userProfiles);
  _userProfilesLoaded = true;
}

export function isUserProfilesLoaded(): boolean {
  return _userProfilesLoaded;
}
```

---

### Step 5 — Fix `resolveProfile` to find top-level profiles

**File**: `packages/agent-core/src/session/subagent-host.ts`

Change `resolveProfile` (~line 328-336) to add a top-level fallback:
```ts
private resolveProfile(parent: Agent, profileName: string): ResolvedAgentProfile {
  const profile =
    DEFAULT_AGENT_PROFILES[parent.config.profileName ?? 'agent']?.subagents?.[profileName] ??
    DEFAULT_AGENT_PROFILES['agent']?.subagents?.[profileName] ??
    DEFAULT_AGENT_PROFILES[profileName];  // <-- ADD: fallback to top-level lookup
  if (profile === undefined) {
    throw new Error(`Subagent profile "${profileName}" was not found`);
  }
  return profile;
}
```

**File**: `packages/agent-core/src/session/index.ts` (~line 1068-1072)

Same pattern — add the top-level fallback.

---

### Step 6 — Fix AgentTool description to include top-level profiles

**File**: `packages/agent-core/src/tools/builtin/collaboration/agent.ts`

Extend `buildSubagentDescriptions` to also list top-level profiles not already covered as subagents. Pass the full `DEFAULT_AGENT_PROFILES` map alongside the existing `subagents` map.

**File**: `packages/agent-core/src/agent/tool/index.ts` (~line 751-754)

Pass the full profile map to `AgentTool` constructor.

---

### Step 7 — Load user profiles during v1 session startup

**File**: `packages/agent-core/src/session/index.ts`

After existing initialization (~line 248), add:
```ts
if (!isUserProfilesLoaded() && this.options.config?.agentProfiles?.length) {
  try {
    const userProfiles = loadUserAgentProfiles(this.options.config.agentProfiles);
    extendAgentProfiles(userProfiles);
  } catch (error) {
    this.log.warn('Failed to load user agent profiles', {
      paths: this.options.config.agentProfiles,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
```

Guard with `isUserProfilesLoaded()` prevents re-loading in multi-session kap-server.

---

### Step 8 — V2 pre-bootstrap loader

**File**: NEW `packages/agent-core-v2/src/app/agentProfileCatalog/userProfileLoader.ts`

Reads the raw TOML config file directly (via `smol-toml`, already a dependency) to extract `agent_profiles` paths, then loads `.yaml`/`.md` files and calls `registerAgentProfile()` — all before `bootstrap()` runs.

Key functions:
- `preloadAgentProfiles(configPath: string): void` — entry point
- `enumerateProfileFiles(root: string): string[]` — walks dir or single file
- `loadProfileFile(filePath: string): AgentProfile | undefined` — dispatches to YAML or markdown parser
- `parseMarkdownProfile(content, filePath)` — splits on `---`, extracts frontmatter + body
- `makeAgentProfile(raw): AgentProfile` — converts raw record to v2 `AgentProfile` interface

---

### Step 9 — Call `preloadAgentProfiles` before `bootstrap()`

**File**: `apps/kimi-code/src/cli/v2/run-v2-print.ts`

Before the `bootstrap()` call (~line 117):
```ts
import { preloadAgentProfiles } from '@moonshot-ai/agent-core-v2';
preloadAgentProfiles(configPath);
```

**File**: `packages/kap-server/src/start.ts`

Before the `bootstrap()` call (~line 205):
```ts
import { preloadAgentProfiles } from '@moonshot-ai/agent-core-v2';
preloadAgentProfiles(configPath);
```

---

### Step 10 — Export from v2 barrel

**File**: `packages/agent-core-v2/src/index.ts`

Add:
```ts
export { preloadAgentProfiles } from '#/app/agentProfileCatalog/userProfileLoader';
```

---

### Step 11 — Tests

**v1**: NEW `packages/agent-core/test/profile/user-profiles.test.ts`

| Test | Verifies |
|------|----------|
| Load YAML profile from file | Sync loader parses `.yaml`, returns correct name, tools, system prompt |
| Load markdown profile from file | Same for `.md` with frontmatter |
| Load from directory | Mix of `.yaml` + `.md`, all loaded |
| Duplicate name collision | `extendAgentProfiles` throws on built-in name clash |
| Merge into DEFAULT_AGENT_PROFILES | After extend, profile accessible via top-level map |
| System prompt rendering | Template vars rendered correctly |

**v2**: NEW `packages/agent-core-v2/test/app/agentProfileCatalog/userProfileLoader.test.ts`

| Test | Verifies |
|------|----------|
| Register from directory | Profiles appear in `getAgentProfileContributions()` |
| Markdown frontmatter parsed | Correct name, description, tools, system prompt |
| Name override | Second registration with same name replaces first |
| Invalid file skipped | Malformed YAML doesn't crash |

---

### Step 12 — Create test custom agent + verify delegation

This step creates a permanent test custom agent and verifies end-to-end delegation works.

#### 12a — Create the test agent profile

Create directory and file:

```bash
mkdir -p ~/.kimi-code/custom-profiles
```

Write `~/.kimi-code/custom-profiles/test-agent.yaml`:

```yaml
name: test-agent
description: A minimal test subagent for verifying custom profile loading. Runs shell commands and reports results.
whenToUse: |
  Use this agent to verify that custom subagent profile loading works correctly.
  Dispatch it with a simple shell command and confirm it executes and returns the output.
tools:
  - Bash
  - Read
  - Glob
  - Grep
systemPromptTemplate: |
  You are a test agent. Your sole purpose is to verify that custom subagent
  profile loading works in Kimi Code.

  Rules:
  1. Execute exactly the command the caller asks for.
  2. Report the stdout, stderr, and exit code verbatim.
  3. Do not modify any files.
  4. Do not ask clarifying questions — just run and report.
  5. Prefix your final message with "[TEST-AGENT] " so the caller can confirm
     the custom profile was loaded.
```

#### 12b — Add config entries

Add to `~/.kimi-code/config.toml`:

```toml
agent_profiles = ["/home/m/.kimi-code/custom-profiles"]
```

Add to the existing `[subagent_models]` section:

```toml
test-agent = "deepseek/deepseek-v4-flash"
```

#### 12c — Rebuild

```bash
cd /home/m/Applications/kimi-code
pnpm install --config.engine-strict=false
pnpm -C apps/kimi-code exec tsdown --config.tsconfig tsconfig.json
pnpm -C apps/kimi-web run build
cd apps/kimi-code && node scripts/copy-web-assets.mjs
```

#### 12d — Verify delegation

Start a fresh `kimi` session and issue:

```
Use the Agent tool to dispatch a test-agent subagent with this task:
"Run 'echo custom-subagent-works && uname -a' and report the output."
```

**Pass criteria** (all must hold):

1. The Agent tool's description (visible in the approval prompt or `/status`) lists `test-agent` alongside `coder`, `explore`, `plan`.
2. The subagent spawns — a subagent progress card appears in the TUI (or a subagent event in the web UI).
3. The subagent's model is `deepseek-v4-flash` (visible in the wire log at `~/.kimi-code/sessions/*/agents/*/wire.jsonl` — look for the model field in the first LLM request).
4. The subagent executes `echo custom-subagent-works && uname -a` via Bash.
5. The subagent's final message starts with `[TEST-AGENT] ` — confirming the custom system prompt was loaded.
6. The main agent receives the result and relays it to the user.

**Fail criteria** (any of these means the implementation is broken):

- "Subagent profile 'test-agent' was not found" error → `resolveProfile` fallback not working
- `test-agent` missing from Agent tool description → Step 6 (description builder) not working
- Subagent uses wrong model → `subagent_models` wiring broken
- No `[TEST-AGENT]` prefix in output → system prompt template not loaded
- Crash or unhandled rejection → loader or profile merge bug

#### 12e — Verify no regression

Run existing subagent tests:

```bash
pnpm -C packages/agent-core exec vitest run test/session/subagent-host.test.ts
pnpm -C packages/agent-core-v2 exec vitest run test/session/swarm/sessionSwarm.test.ts
pnpm -C apps/kimi-code exec vitest run test/tui/components/editor/custom-editor.test.ts
```

All must pass.

---

## Phase 2: Import Physics Experts

### Step 1 — Verify graph files exist

```bash
ls -la /home/m/Documents/kb/muon-physics/graphify-out/graph.json
ls -la /home/m/Documents/kb/detector-physics/graphify-out/graph.json
ls -la /home/m/Documents/kb/muEDM/graphify-out/graph.json
```

If missing → alert user, halt.

### Step 2 — Copy expert profiles locally + patch tools list

**Do NOT point `agent_profiles` at the SSHFS-mounted zcode-plugins directory** — edits there are live on HPC with no git tracking or rollback (per AGENTS.md rules). Copy the 3 `.md` files to the local custom-profiles directory and patch each file's `tools` frontmatter to include the MCP tool globs.

```bash
cp /mnt/c/Users/M/zcode-plugins/physics-experts-src/agents/muon-physics-expert.md \
   /home/m/.kimi-code/custom-profiles/
cp /mnt/c/Users/M/zcode-plugins/physics-experts-src/agents/detector-physics-expert.md \
   /home/m/.kimi-code/custom-profiles/
cp /mnt/c/Users/M/zcode-plugins/physics-experts-src/agents/muedm-expert.md \
   /home/m/.kimi-code/custom-profiles/
```

Then patch the `tools:` line in each copied file. The original files have `tools: [Read, Bash, Glob, Grep]` — MCP tools are missing, so the subagent's tool-set restriction would block every `mcp__graphify-*__*` call even though the system prompt instructs it to use them.

**`muon-physics-expert.md`** — change `tools:` to:
```yaml
tools:
  - Read
  - Bash
  - Glob
  - Grep
  - "mcp__graphify-muon-physics__*"
  - "mcp__graphify-detector-physics__shortest_path"
  - "mcp__graphify-muedm__shortest_path"
```

**`detector-physics-expert.md`** — change `tools:` to:
```yaml
tools:
  - Read
  - Bash
  - Glob
  - Grep
  - "mcp__graphify-detector-physics__*"
  - "mcp__graphify-muon-physics__shortest_path"
  - "mcp__graphify-muedm__shortest_path"
```

**`muedm-expert.md`** — change `tools:` to:
```yaml
tools:
  - Read
  - Bash
  - Glob
  - Grep
  - "mcp__graphify-muedm__*"
  - "mcp__graphify-muon-physics__shortest_path"
  - "mcp__graphify-detector-physics__shortest_path"
```

The `__*` glob gives each expert full access to its own graph's 7 MCP tools. The two `__shortest_path` entries allow cross-domain bridge queries to sibling graphs (as the system prompt instructs).

### Step 3 — Configure `agent_profiles` path

Add to `~/.kimi-code/config.toml`:
```toml
agent_profiles = ["/home/m/.kimi-code/custom-profiles"]
```

This directory now contains both `test-agent.yaml` (from Phase 1 Step 12a) and the 3 expert `.md` files.

### Step 4 — Add model bindings

Add to existing `[subagent_models]` section in `~/.kimi-code/config.toml`:
```toml
muon-physics-expert = "deepseek/deepseek-v4-pro"
detector-physics-expert = "deepseek/deepseek-v4-pro"
muedm-expert = "deepseek/deepseek-v4-pro"
```

### Step 5 — Create `~/.kimi-code/mcp.json`

MCP servers are configured in `mcp.json` (JSON), **not** `config.toml` (TOML). Create the file:

```json
{
  "mcpServers": {
    "graphify-muon-physics": {
      "command": "/home/m/.local/share/uv/tools/graphifyy/bin/python",
      "args": ["-m", "graphify.serve", "/home/m/Documents/kb/muon-physics/graphify-out/graph.json"]
    },
    "graphify-detector-physics": {
      "command": "/home/m/.local/share/uv/tools/graphifyy/bin/python",
      "args": ["-m", "graphify.serve", "/home/m/Documents/kb/detector-physics/graphify-out/graph.json"]
    },
    "graphify-muedm": {
      "command": "/home/m/.local/share/uv/tools/graphifyy/bin/python",
      "args": ["-m", "graphify.serve", "/home/m/Documents/kb/muEDM/graphify-out/graph.json"]
    }
  }
}
```

Verify `graphifyy` is installed:
```bash
/home/m/.local/share/uv/tools/graphifyy/bin/python -m graphify.serve --help
```

### Step 6 — Add MCP permission allow-rules

Without these, every MCP tool call triggers an approval prompt. Add to `~/.kimi-code/config.toml`:

```toml
[[permission.rules]]
decision = "allow"
pattern = "mcp__graphify-muon-physics__*"

[[permission.rules]]
decision = "allow"
pattern = "mcp__graphify-detector-physics__*"

[[permission.rules]]
decision = "allow"
pattern = "mcp__graphify-muedm__*"
```

### Step 7 — Verify each expert

For each expert, dispatch a domain question and verify:

1. **Subagent spawns** with correct name and model (`deepseek-v4-pro`)
2. **MCP tools available** — the subagent calls `mcp__graphify-*__query_graph` or similar (visible in wire log)
3. **Graph-first lookup** — at least one MCP tool call before any answer
4. **4-section review schema** — output contains `### Claims`, `### Cross-domain bridges`, `### Suggested checks`, `### Confidence summary`
5. **Confidence tags** — `[EXTRACTED]`, `[INFERRED]`, `[AMBIGUOUS]`, or `[TRAINING]` present
6. **No approval prompts** for MCP calls (permission rules working)

Test prompts:
- `muon-physics-expert`: "What does the graph say about the g-2 anomaly and its connection to CLFV?"
- `detector-physics-expert`: "What does the graph say about SiPM dark count rate and its temperature dependence?"
- `muedm-expert`: "What does the graph say about kicker pulse timing and storage efficiency?"

---

## Files touched summary

| Phase | File | Change type |
|-------|------|-------------|
| 1.1 | `packages/agent-core/src/profile/load.ts` | Modify |
| 1.2 | `packages/agent-core/src/config/schema.ts` | Modify |
| 1.3 | `packages/agent-core/src/config/toml.ts` | Modify |
| 1.4 | `packages/agent-core/src/profile/default.ts` | Modify |
| 1.5 | `packages/agent-core/src/session/subagent-host.ts` | Modify |
| 1.5b | `packages/agent-core/src/session/index.ts` | Modify |
| 1.6 | `packages/agent-core/src/tools/builtin/collaboration/agent.ts` | Modify |
| 1.6b | `packages/agent-core/src/agent/tool/index.ts` | Modify |
| 1.8 | `packages/agent-core-v2/src/app/agentProfileCatalog/userProfileLoader.ts` | **New** |
| 1.9 | `apps/kimi-code/src/cli/v2/run-v2-print.ts` | Modify |
| 1.9b | `packages/kap-server/src/start.ts` | Modify |
| 1.10 | `packages/agent-core-v2/src/index.ts` | Modify |
| 1.11 | `packages/agent-core/test/profile/user-profiles.test.ts` | **New** |
| 1.11b | `packages/agent-core-v2/test/app/agentProfileCatalog/userProfileLoader.test.ts` | **New** |
| 2.2 | `~/.kimi-code/custom-profiles/muon-physics-expert.md` | **New** (copy + patch tools) |
| 2.2b | `~/.kimi-code/custom-profiles/detector-physics-expert.md` | **New** (copy + patch tools) |
| 2.2c | `~/.kimi-code/custom-profiles/muedm-expert.md` | **New** (copy + patch tools) |
| 2.5 | `~/.kimi-code/mcp.json` | **New** (3 graphify MCP servers) |
| 2.6 | `~/.kimi-code/config.toml` | Modify (agent_profiles + subagent_models + permission rules) |

**Total**: 10 existing files modified + 3 new files (Phase 1 code), 4 new config/profile files + 1 modified config (Phase 2).

---

## Phase 1 verifiables

| # | Gate | Command / check | Pass = |
|---|------|-----------------|--------|
| V1 | Unit tests (v1) | `pnpm -C packages/agent-core exec vitest run test/profile/user-profiles.test.ts` | All green |
| V2 | Unit tests (v2) | `pnpm -C packages/agent-core-v2 exec vitest run test/app/agentProfileCatalog/userProfileLoader.test.ts` | All green |
| V3 | Typecheck | `pnpm typecheck` | 0 errors across 24 workspace projects |
| V4 | Build | `pnpm install && tsdown && web build && copy-web-assets` | All exit 0 |
| V5 | No regression | `subagent-host.test.ts` + `sessionSwarm.test.ts` + `custom-editor.test.ts` | All green |
| V6 | **Delegation works** | Dispatch `test-agent` via `kimi -p` or interactive session | All 6 pass criteria from Step 12d hold |

V6 is the hard end-to-end gate: a real custom subagent (`test-agent`) running on `deepseek-v4-flash` must be dispatchable, execute a command, and return output prefixed with `[TEST-AGENT]`.

---

## Design decisions

- **Markdown parser**: splits on `---`, extracts frontmatter YAML, body = system prompt template. No conversion step — `.md` files work as-is.
- **v2 pre-bootstrap**: reads raw TOML config via `smol-toml` (already a dependency) before DI container construction. Avoids chicken-and-egg of needing config loaded before catalog snapshots.
- **Collision guard**: user profiles sharing a name with built-ins (`coder`, `explore`, `plan`, `agent`) rejected at load time.
- **`resolveProfile` fix**: adds top-level fallback `DEFAULT_AGENT_PROFILES[profileName]` — minimal change to make user profiles dispatchable.
- **`isUserProfilesLoaded()` guard**: prevents re-loading in multi-session kap-server (`kimi web`).
- **Model binding via `[subagent_models]`**: reuses the fork's existing `subagent_models` feature — no new model-resolution code needed.
