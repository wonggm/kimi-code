/**
 * `/agent_profiles` REST route — server-v2.
 *
 *   GET  /agent_profiles    data: { profiles: AgentProfileDescriptor[] }
 *
 * Exposes the App-scoped `IAgentProfileCatalogService` catalog so clients can
 * populate the per-agent-profile subagent-model picker. Each profile is
 * projected to its wire descriptor (`name` / `description` / `whenToUse` /
 * `modelPreference`); the prompt-rendering surface (`systemPrompt`, tool
 * allowlists, summary policy) is intentionally dropped — it is not client
 * configuration.
 *
 * **Anti-corruption**: route resolves the service via the accessor; no SDK
 * imports.
 */

import {
  IAgentProfileCatalogService,
  type AgentProfile,
  type Scope,
} from '@moonshot-ai/agent-core-v2';

import { okEnvelope } from '../envelope';
import { defineRoute } from '../middleware/defineRoute';
import {
  listAgentProfilesResponseSchema,
  type AgentProfileDescriptor,
} from '../protocol/rest-agentProfile';

interface AgentProfilesRouteHost {
  get(
    path: string,
    options: { preHandler: unknown[]; schema?: Record<string, unknown> },
    handler: (
      req: { id: string },
      reply: { send(payload: unknown): unknown },
    ) => Promise<void> | void,
  ): unknown;
}

export function registerAgentProfilesRoutes(app: AgentProfilesRouteHost, core: Scope): void {
  const listAgentProfilesRoute = defineRoute(
    {
      method: 'GET',
      path: '/agent_profiles',
      success: { data: listAgentProfilesResponseSchema },
      description: 'List the available agent profiles',
      tags: ['agent_profiles'],
      operationId: 'listAgentProfiles',
    },
    async (req, reply) => {
      const catalog = core.accessor.get(IAgentProfileCatalogService);
      const profiles = catalog.list().map(toProtocolAgentProfile);
      reply.send(okEnvelope({ profiles }, req.id));
    },
  );
  app.get(
    listAgentProfilesRoute.path,
    listAgentProfilesRoute.options,
    listAgentProfilesRoute.handler as Parameters<AgentProfilesRouteHost['get']>[2],
  );
}

// ---------------------------------------------------------------------------
// Projection — v2 `AgentProfile` → protocol `AgentProfileDescriptor`.
// ---------------------------------------------------------------------------

function toProtocolAgentProfile(profile: AgentProfile): AgentProfileDescriptor {
  const base: AgentProfileDescriptor = { name: profile.name };
  if (profile.description !== undefined) base.description = profile.description;
  if (profile.whenToUse !== undefined) base.whenToUse = profile.whenToUse;
  if (profile.modelPreference !== undefined) base.modelPreference = profile.modelPreference;
  return base;
}
