import { describe, expect, it } from 'vitest';

import { listVisibleProfiles } from '../src/routes/agentProfiles';
import type { AgentProfile } from '@moonshot-ai/agent-core-v2';

function profile(name: string, extra: Partial<AgentProfile> = {}): AgentProfile {
  return {
    name,
    description: `${name} description`,
    systemPrompt: () => '',
    renderSystemPrompt: () => ({ text: '', environment: { cwd: '', date: { disclosed: false } } }),
    ...extra,
  };
}

interface Registration {
  sourceId: string;
  priority: number;
  workspaceKey?: string;
  contribution: { profiles: readonly AgentProfile[] };
}

function registration(
  sourceId: string,
  priority: number,
  profiles: readonly AgentProfile[],
  workspaceKey?: string,
): Registration {
  return { sourceId, priority, contribution: { profiles }, workspaceKey };
}

describe('listVisibleProfiles', () => {
  it('passes builtin profiles through when nothing is discovered', () => {
    const result = listVisibleProfiles([profile('coder'), profile('plan')], []);
    expect(result.map((p) => p.name)).toEqual(['coder', 'plan']);
  });

  it('appends discovered user profiles to the builtin list', () => {
    const result = listVisibleProfiles([profile('coder')], [
      registration('user', 10, [profile('muedm-expert')], 'ws-1'),
    ]);
    expect(result.map((p) => p.name)).toEqual(['coder', 'muedm-expert']);
  });

  it('ignores builtin and feature-sourced registrations', () => {
    const result = listVisibleProfiles([profile('coder')], [
      registration('builtin', 0, [profile('ghost-a')]),
      registration('feature:tower', 1, [profile('ghost-b')]),
      registration('user', 10, [profile('muedm-expert')], 'ws-1'),
    ]);
    expect(result.map((p) => p.name)).toEqual(['coder', 'muedm-expert']);
  });

  it('keeps the builtin profile when a same-name discovery has no override', () => {
    const coder = profile('coder');
    const result = listVisibleProfiles([coder], [
      registration('user', 10, [profile('coder')], 'ws-1'),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.description).toBe(coder.description);
  });

  it('lets an override discovery replace a same-name builtin', () => {
    const result = listVisibleProfiles([profile('coder')], [
      registration('user', 10, [profile('coder', { override: true })], 'ws-1'),
    ]);
    expect(result).toHaveLength(1);
  });

  it('prefers the higher-priority candidate for the same discovered name', () => {
    const result = listVisibleProfiles([profile('agent')], [
      registration('project', 30, [profile('reviewer', { description: 'from project' })], 'ws-2'),
      registration('user', 10, [profile('reviewer', { description: 'from user' })], 'ws-1'),
      registration('user', 10, [profile('reviewer', { description: 'from user again' })], 'ws-3'),
    ]);
    expect(result).toHaveLength(2);
    expect(result.find((p) => p.name === 'reviewer')?.description).toBe('from project');
  });
});
