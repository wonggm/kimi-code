import {
  IBuiltinAgentProfileLoader,
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
      const catalog = core.accessor.get(IBuiltinAgentProfileLoader);
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

function toProtocolAgentProfile(profile: AgentProfile): AgentProfileDescriptor {
  const base: AgentProfileDescriptor = { name: profile.name };
  if (profile.description !== undefined) base.description = profile.description;
  if (profile.whenToUse !== undefined) base.whenToUse = profile.whenToUse;
  return base;
}
