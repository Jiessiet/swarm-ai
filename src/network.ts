import { MAX_AGENTS } from './identity.js';
export type NetworkEdge = { from: number; to: number };
export type AgentNetwork = { count: number; revision: number; edges: NetworkEdge[] };
export function normalizeNetwork(count: number, input?: unknown): AgentNetwork {
  if (!Number.isInteger(count) || count < 2 || count > MAX_AGENTS) throw new Error('Network requires 2..100 agents');
  if (input === undefined && count > 10) {
    const edges = Array.from({length:count},(_,from)=>[{from,to:(from+1)%count},{from,to:(from+count-1)%count}]).flat();
    return {count,revision:0,edges};
  }
  if (input === undefined) return { count, revision: 0, edges: Array.from({ length: count }, (_, from) => Array.from({ length: count }, (_, to) => ({ from, to }))).flat().filter(e => e.from !== e.to) };
  const value = input as Partial<AgentNetwork> | null;
  if (!value || typeof value !== 'object' || value.count !== count || !Array.isArray(value.edges) || value.edges.length > count * (count - 1)) throw new Error('Invalid network: agent count and directed edges are required');
  const seen = new Set<string>();
  const edges = value.edges.map(e => {
    if (!e || !Number.isInteger(e.from) || !Number.isInteger(e.to) || e.from < 0 || e.to < 0 || e.from >= count || e.to >= count || e.from === e.to) throw new Error('Invalid network edge');
    const key = `${e.from}:${e.to}`;
    if (seen.has(key)) throw new Error('Duplicate network edge');
    seen.add(key); return { from: e.from, to: e.to };
  }).sort((a, b) => a.from - b.from || a.to - b.to);
  return { count, revision: 0, edges };
}
export function createNetworkController(count: number, initial?: unknown) {
  let network = normalizeNetwork(count, initial);
  return {
    get: () => structuredClone(network),
    update(input: unknown, expectedRevision: number) {
      if (expectedRevision !== network.revision) throw new Error('Network changed; refresh before editing again');
      const next = normalizeNetwork(count, input);
      network = { ...next, revision: network.revision + 1 };
      return structuredClone(network);
    },
  };
}
export type NetworkController = ReturnType<typeof createNetworkController>;
