/**
 * GET /v1/agent_profiles
 *   Reply: { profiles: AgentProfileDescriptor[] }
 */
import { z } from 'zod';

export const agentProfileDescriptorSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  whenToUse: z.string().optional(),
  modelPreference: z.enum(['primary', 'secondary']).optional(),
});
export type AgentProfileDescriptor = z.infer<typeof agentProfileDescriptorSchema>;

export const listAgentProfilesResponseSchema = z.object({
  profiles: z.array(agentProfileDescriptorSchema),
});
export type ListAgentProfilesResponse = z.infer<typeof listAgentProfilesResponseSchema>;
