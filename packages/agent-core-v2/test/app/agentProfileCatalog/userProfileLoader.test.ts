import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'pathe';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  _clearAgentProfileContributionsForTests,
  getAgentProfileContributionEntries,
  getAgentProfileContributions,
} from '../../../src/app/agentProfileCatalog/contribution';
import {
  PRELOADED_AGENT_PROFILE_SOURCE_ID,
} from '../../../src/app/agentProfileCatalog/builtinAgentProfileLoader';
import {
  isDiscoveredAgentProfileSource,
  rootDelegationExtras,
} from '../../../src/app/agentProfileCatalog/profile-shared';
import { preloadAgentProfiles } from '../../../src/app/agentProfileCatalog/userProfileLoader';

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'v2-user-profiles-'));
  _clearAgentProfileContributionsForTests();
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
  _clearAgentProfileContributionsForTests();
});

function writeConfig(profilePaths: string[]): string {
  const configPath = join(workDir, 'config.toml');
  const lines = profilePaths.map((p) => `  "${p}"`).join(',\n');
  writeFileSync(configPath, `agent_profiles = [\n${lines}\n]\n`);
  return configPath;
}

describe('preloadAgentProfiles', () => {
  it('registers YAML profiles from a directory', () => {
    const profileDir = join(workDir, 'profiles');
    mkdtempSync(profileDir + '-');
    const { mkdirSync } = require('node:fs');
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(
      join(profileDir, 'test.yaml'),
      'name: v2-test\ndescription: V2 test agent\ntools: [Read]\nsystemPromptTemplate: V2 prompt.\n',
    );

    const configPath = writeConfig([profileDir]);
    preloadAgentProfiles(configPath);

    const contributions = getAgentProfileContributions();
    const found = contributions.find((c) => c.name === 'v2-test');
    expect(found).toBeDefined();
    expect(found!.description).toBe('V2 test agent');
    expect(found!.tools).toEqual(['Read']);
    const prompt = found!.systemPrompt({ cwd: '/tmp' });
    expect(prompt).toContain('V2 prompt.');
  });

  it('registers Markdown profiles with frontmatter', () => {
    const profileDir = join(workDir, 'md-profiles');
    const { mkdirSync } = require('node:fs');
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(
      join(profileDir, 'expert.md'),
      '---\nname: md-expert\ndescription: MD expert\ntools:\n  - Read\n  - Bash\n---\nExpert system prompt.\n',
    );

    const configPath = writeConfig([profileDir]);
    preloadAgentProfiles(configPath);

    const contributions = getAgentProfileContributions();
    const found = contributions.find((c) => c.name === 'md-expert');
    expect(found).toBeDefined();
    expect(found!.tools).toEqual(['Read', 'Bash']);
    const prompt = found!.systemPrompt({ cwd: '/tmp' });
    expect(prompt).toContain('Expert system prompt.');
  });

  it('silently skips missing config file', () => {
    preloadAgentProfiles('/nonexistent/config.toml');
    expect(getAgentProfileContributions()).toEqual([]);
  });

  it('silently skips config without agent_profiles', () => {
    const configPath = join(workDir, 'empty.toml');
    writeFileSync(configPath, 'default_model = "test"\n');
    preloadAgentProfiles(configPath);
    expect(getAgentProfileContributions()).toEqual([]);
  });

  it('later registration with same name replaces earlier', () => {
    const dir1 = join(workDir, 'dir1');
    const dir2 = join(workDir, 'dir2');
    const { mkdirSync } = require('node:fs');
    mkdirSync(dir1, { recursive: true });
    mkdirSync(dir2, { recursive: true });
    writeFileSync(join(dir1, 'a.yaml'), 'name: dup\ndescription: first\nsystemPromptTemplate: First.\n');
    writeFileSync(join(dir2, 'a.yaml'), 'name: dup\ndescription: second\nsystemPromptTemplate: Second.\n');

    const configPath = writeConfig([dir1, dir2]);
    preloadAgentProfiles(configPath);

    const contributions = getAgentProfileContributions();
    const found = contributions.filter((c) => c.name === 'dup');
    expect(found).toHaveLength(1);
    expect(found[0]!.description).toBe('second');
  });

  it('resolves systemPromptPath relative to the profile file', () => {
    const profileDir = join(workDir, 'path-profiles');
    const { mkdirSync } = require('node:fs');
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(join(profileDir, 'prompt.txt'), 'Prompt from file.\n');
    writeFileSync(
      join(profileDir, 'ref.yaml'),
      'name: path-agent\ndescription: Path agent\nsystemPromptPath: prompt.txt\n',
    );

    const configPath = writeConfig([profileDir]);
    preloadAgentProfiles(configPath);

    const found = getAgentProfileContributions().find((c) => c.name === 'path-agent');
    expect(found).toBeDefined();
    expect(found!.systemPrompt({ cwd: '/tmp' })).toContain('Prompt from file.');
  });

  it('degrades to an empty prompt when systemPromptPath cannot be read', () => {
    const profileDir = join(workDir, 'missing-path-profiles');
    const { mkdirSync } = require('node:fs');
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(
      join(profileDir, 'ref.yaml'),
      'name: missing-path-agent\ndescription: Missing path agent\nsystemPromptPath: nope.txt\n',
    );

    const configPath = writeConfig([profileDir]);
    preloadAgentProfiles(configPath);

    const found = getAgentProfileContributions().find((c) => c.name === 'missing-path-agent');
    expect(found).toBeDefined();
    expect(found!.systemPrompt({ cwd: '/tmp' })).toBe('');
  });

  it('registers preloaded profiles under the preload source as a discovered delegation source', () => {
    const profileDir = join(workDir, 'source-profiles');
    const { mkdirSync } = require('node:fs');
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(
      join(profileDir, 's.yaml'),
      'name: source-agent\ndescription: Source agent\nsystemPromptTemplate: Source prompt.\n',
    );

    const configPath = writeConfig([profileDir]);
    preloadAgentProfiles(configPath);

    const entry = getAgentProfileContributionEntries().find((c) => c.profile.name === 'source-agent');
    expect(entry?.preloaded).toBe(true);
    expect(isDiscoveredAgentProfileSource(PRELOADED_AGENT_PROFILE_SOURCE_ID)).toBe(true);
    const catalog = {
      inspect: (name: string) =>
        name === 'source-agent' ? { sourceId: PRELOADED_AGENT_PROFILE_SOURCE_ID } : undefined,
    };
    expect(rootDelegationExtras(catalog, {}, entry ? [entry.profile] : [])).toEqual(['source-agent']);
  });
});
