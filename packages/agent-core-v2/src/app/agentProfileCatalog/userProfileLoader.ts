/**
 * Pre-bootstrap loader for user-defined agent profiles.
 *
 * Reads `agent_profiles` from the raw TOML config file, scans the listed
 * paths for `.yaml` / `.yml` / `.md` profile files, and registers them via
 * `registerAgentProfile()` — all before `bootstrap()` constructs the DI
 * container and snapshots the catalog.
 *
 * Supports both native YAML profiles and Markdown-with-frontmatter profiles.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'pathe';
import { parse as parseToml } from 'smol-toml';
import { load as loadYaml } from 'js-yaml';

import { renderPrompt } from '#/_base/utils/render-prompt';

import { registerAgentProfile } from './contribution';
import type { AgentProfile, AgentProfileContext } from './agentProfileCatalog';

const PROFILE_EXTENSIONS = new Set(['.yaml', '.yml', '.md']);

/**
 * Load user-defined agent profiles from `agent_profiles` paths in the config
 * file and register them into the module-level profile catalog.
 *
 * Safe to call multiple times — duplicate names replace earlier registrations.
 * Silently returns if the config file is missing or has no `agent_profiles`.
 */
export function preloadAgentProfiles(configPath: string): void {
  let tomlText: string;
  try {
    tomlText = readFileSync(configPath, 'utf-8');
  } catch {
    return;
  }

  let data: Record<string, unknown>;
  try {
    data = parseToml(tomlText) as Record<string, unknown>;
  } catch {
    return;
  }

  const paths = data['agent_profiles'];
  if (!Array.isArray(paths)) return;

  for (const p of paths) {
    if (typeof p !== 'string') continue;
    for (const file of enumerateProfileFiles(p)) {
      try {
        const profile = loadProfileFile(file);
        if (profile) registerAgentProfile(profile);
      } catch {
        // Skip unparseable files — don't crash bootstrap
      }
    }
  }
}

function enumerateProfileFiles(root: string): string[] {
  let st: ReturnType<typeof statSync>;
  try {
    st = statSync(root);
  } catch {
    return [];
  }
  if (st.isFile()) {
    return PROFILE_EXTENSIONS.has(extname(root).toLowerCase()) ? [root] : [];
  }
  if (!st.isDirectory()) return [];
  return readdirSync(root)
    .filter((f) => PROFILE_EXTENSIONS.has(extname(f).toLowerCase()))
    .sort()
    .map((f) => join(root, f))
    .filter((f) => {
      try {
        return statSync(f).isFile();
      } catch {
        return false;
      }
    });
}

function loadProfileFile(filePath: string): AgentProfile | undefined {
  const content = readFileSync(filePath, 'utf-8');
  const ext = extname(filePath).toLowerCase();
  const raw = ext === '.md'
    ? parseMarkdownProfile(content, filePath)
    : parseYamlProfile(content, filePath);
  return raw ? makeAgentProfile(raw) : undefined;
}

function parseYamlProfile(
  content: string,
  _filePath: string,
): Record<string, unknown> | undefined {
  const parsed = loadYaml(content) as Record<string, unknown> | undefined;
  if (!parsed || typeof parsed !== 'object' || typeof parsed['name'] !== 'string') return undefined;
  return parsed;
}

function parseMarkdownProfile(
  content: string,
  _filePath: string,
): Record<string, unknown> | undefined {
  const parts = content.split(/^---$/m);
  if (parts.length < 3) return undefined;
  const fm = loadYaml(parts[1]!) as Record<string, unknown> | undefined;
  if (!fm || typeof fm !== 'object' || typeof fm['name'] !== 'string') return undefined;
  const body = parts.slice(2).join('---').trim();
  return { ...fm, systemPromptTemplate: body };
}

interface RawProfileData {
  name: string;
  description?: string;
  whenToUse?: string;
  tools?: string[];
  systemPromptTemplate?: string;
}

function makeAgentProfile(raw: Record<string, unknown>): AgentProfile {
  const name = raw['name'] as string;
  const description = typeof raw['description'] === 'string' ? raw['description'] as string : undefined;
  const whenToUse = typeof raw['whenToUse'] === 'string' ? raw['whenToUse'] as string : undefined;
  const tools = Array.isArray(raw['tools'])
    ? (raw['tools'] as unknown[]).filter((t): t is string => typeof t === 'string')
    : ['Read', 'Grep', 'Glob', 'Bash'];
  const template = typeof raw['systemPromptTemplate'] === 'string' ? raw['systemPromptTemplate'] as string : '';

  return {
    name,
    description,
    whenToUse,
    tools,
    systemPrompt: (ctx: AgentProfileContext) => {
      if (template.length === 0) return '';
      const shellName = ctx.shellName ?? '';
      const shellPath = ctx.shellPath ?? '';
      return renderPrompt(template, {
        KIMI_OS: ctx.osKind ?? '',
        KIMI_SHELL: `${shellName} (\`${shellPath}\`)`,
        KIMI_NOW: ctx.now ?? new Date().toISOString(),
        KIMI_WORK_DIR: ctx.cwd ?? '',
        KIMI_WORK_DIR_LS: ctx.cwdListing ?? '',
        KIMI_AGENTS_MD: ctx.agentsMd ?? '',
        KIMI_SKILLS: ctx.skills ?? '',
        KIMI_ADDITIONAL_DIRS_INFO: ctx.additionalDirsInfo ?? '',
        ROLE_ADDITIONAL: '',
      });
    },
  };
}
