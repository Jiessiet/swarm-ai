import { MAX_AGENTS } from './identity.js';
import { roleFor } from '../tasks/hackathon/definition.js';
export type AgentRole = { title: string; instructions: string };
export type RoleSettings = { revision: number; assignments: AgentRole[] };
export function normalizeRoles(count: number, input?: unknown): RoleSettings {
  if (!Number.isInteger(count) || count < 2 || count > MAX_AGENTS) throw new Error('Roles require 2..100 agents');
  const roles = input === undefined ? Array.from({ length: count }, (_, i) => ({ title: roleFor(i), instructions: `Act as ${roleFor(i).toLowerCase()}; collaborate on one feasible, interesting safety experiment.` })) : input;
  if (!Array.isArray(roles) || roles.length !== count) throw new Error('Provide one role for each agent');
  return { revision: 0, assignments: roles.map(role => {
    if (!role || typeof role.title !== 'string' || !role.title.trim() || role.title.length > 80 || typeof role.instructions !== 'string' || role.instructions.length > 2000) throw new Error('Role title must be 1..80 characters and instructions at most 2000 characters');
    return { title: role.title.trim(), instructions: role.instructions.trim() };
  }) };
}
export function createRoleController(count: number, initial?: unknown) {
  let settings = normalizeRoles(count, initial);
  return {
    get: () => structuredClone(settings),
    update(input: unknown, expectedRevision: number) {
      if (expectedRevision !== settings.revision) throw new Error('Roles changed; refresh before editing again');
      const next = normalizeRoles(count, input);
      settings = { ...next, revision: settings.revision + 1 };
      return structuredClone(settings);
    },
  };
}
export type RoleController = ReturnType<typeof createRoleController>;
