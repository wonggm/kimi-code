import {
  normalizeAgentProfile,
  type AgentProfile,
  type AgentProfileInput,
} from './agentProfileCatalog';

interface ProfileContributionEntry {
  readonly profile: AgentProfile;
  readonly preloaded: boolean;
}

const _profileContributions: ProfileContributionEntry[] = [];

function upsert(definition: AgentProfileInput, preloaded: boolean): void {
  const profile = normalizeAgentProfile(definition);
  const existingIndex = _profileContributions.findIndex((d) => d.profile.name === profile.name);
  if (existingIndex >= 0) {
    _profileContributions.splice(existingIndex, 1);
  }
  _profileContributions.push({ profile, preloaded });
}

export function registerAgentProfile(definition: AgentProfileInput): void {
  upsert(definition, false);
}

export function registerPreloadedAgentProfile(definition: AgentProfileInput): void {
  upsert(definition, true);
}

export function getAgentProfileContributionEntries(): readonly ProfileContributionEntry[] {
  return _profileContributions;
}

export function getAgentProfileContributions(): readonly AgentProfile[] {
  return _profileContributions.map((d) => d.profile);
}

export function _clearAgentProfileContributionsForTests(): void {
  _profileContributions.length = 0;
}
