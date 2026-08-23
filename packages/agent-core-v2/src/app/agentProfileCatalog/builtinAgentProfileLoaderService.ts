import { IInstantiationService } from '#/_base/di/instantiation';
import { Disposable } from '#/_base/di/lifecycle';
import { Service } from '#/_base/di/service';
import { LifecycleScope } from '#/app/scopes';
import { ScopeActivation, registerScopedService } from '#/_base/di/scope';
import { BugIndicatingError } from '#/errors';

import type { AgentProfile } from './agentProfileCatalog';
import { DEFAULT_AGENT_PROFILE_NAME } from './agentProfileCatalog';
import {
  AGENT_PROFILE_SOURCE_PRIORITY,
  AgentProfileContribution,
  type AgentProfileContributionRecord,
} from './agentProfileContribution';
import {
  BUILTIN_AGENT_PROFILE_SOURCE_ID,
  IBuiltinAgentProfileLoader,
  PRELOADED_AGENT_PROFILE_SOURCE_ID,
} from './builtinAgentProfileLoader';
import { getAgentProfileContributionEntries } from './contribution';

export class BuiltinAgentProfileLoaderService
  extends Disposable
  implements IBuiltinAgentProfileLoader
{
  declare readonly _serviceBrand: undefined;

  private readonly byName: Map<string, AgentProfile>;
  private readonly ordered: readonly AgentProfile[];

  constructor(@IInstantiationService instantiationService: IInstantiationService) {
    super();
    const entries = getAgentProfileContributionEntries();
    const preloadedNames = new Set(
      entries.filter((entry) => entry.preloaded).map((entry) => entry.profile.name),
    );
    this.ordered = entries.map((entry) => entry.profile);
    this.byName = new Map(this.ordered.map((def) => [def.name, def]));
    this._register(
      instantiationService.createInstance(BuiltinAgentProfileContributionUnit, {
        sourceId: BUILTIN_AGENT_PROFILE_SOURCE_ID,
        priority: AGENT_PROFILE_SOURCE_PRIORITY.builtin,
        contribution: {
          profiles: entries
            .filter((entry) => !entry.preloaded && !preloadedNames.has(entry.profile.name))
            .map((entry) => entry.profile),
        },
      }),
    );
    const preloadedProfiles = entries
      .filter((entry) => entry.preloaded)
      .map((entry) => entry.profile);
    if (preloadedProfiles.length > 0) {
      this._register(
        instantiationService.createInstance(BuiltinAgentProfileContributionUnit, {
          sourceId: PRELOADED_AGENT_PROFILE_SOURCE_ID,
          priority: AGENT_PROFILE_SOURCE_PRIORITY.preload,
          contribution: { profiles: preloadedProfiles },
        }),
      );
    }
  }

  get(name: string): AgentProfile | undefined {
    return this.byName.get(name);
  }

  getDefault(): AgentProfile {
    const profile = this.byName.get(DEFAULT_AGENT_PROFILE_NAME);
    if (profile === undefined) {
      throw new BugIndicatingError(
        `Default agent profile "${DEFAULT_AGENT_PROFILE_NAME}" is not registered`,
      );
    }
    return profile;
  }

  list(): readonly AgentProfile[] {
    return this.ordered;
  }
}

class BuiltinAgentProfileContributionUnit extends Service {
  constructor(record: AgentProfileContributionRecord) {
    super();
    this.provide(AgentProfileContribution, record);
  }
}

registerScopedService(
  LifecycleScope.App,
  IBuiltinAgentProfileLoader,
  BuiltinAgentProfileLoaderService,
  ScopeActivation.OnScopeCreated,
  'agentProfileCatalog',
);
