// =========================================================
// ARCHIE ASSOCIATIVE MEMORY — SPREADING ACTIVATION NETWORK
// supabase/functions/_shared/archie-ai/associative-memory/associative-network.ts
//
// Long-term associative graph with Hebbian link reinforcement
// and multi-hop spreading activation.
// =========================================================

import type {
  AssociativeEdge,
  AssociativeEdgeKind,
  AssociativeNetworkStats,
  AssociativeNode,
  AssociativeNodeKind,
  SpreadingActivationConfig,
} from "./types.ts";

export const DEFAULT_SPREADING_CONFIG: SpreadingActivationConfig = {
  decayFactor: 0.65, // Retention per hop
  activationThreshold: 0.12, // Cutoff threshold
  maxHops: 3, // Bounded traversal hops
  firingCap: 40, // Max activated nodes
};

export class AssociativeNetwork {
  private nodes = new Map<string, AssociativeNode>();
  private edges = new Map<string, AssociativeEdge>();
  // Adjacency lists for fast lookup
  private adjacency = new Map<string, Set<string>>();

  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.adjacency.clear();
  }

  addOrGetNode(
    id: string,
    label: string,
    kind: AssociativeNodeKind,
    metadata?: Record<string, unknown>,
  ): AssociativeNode {
    let node = this.nodes.get(id);
    if (!node) {
      node = {
        id,
        label,
        kind,
        activation: 0,
        baselineActivation: 0,
        lastActivatedAt: Date.now(),
        metadata,
      };
      this.nodes.set(id, node);
      this.adjacency.set(id, new Set());
    }
    return node;
  }

  getNode(id: string): AssociativeNode | undefined {
    return this.nodes.get(id);
  }

  getAllNodes(): AssociativeNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Adds or reinforces a bidirectional associative link using Hebbian learning:
   * Delta w = eta * (1 - w)
   */
  reinforceEdge(
    sourceId: string,
    targetId: string,
    kind: AssociativeEdgeKind,
    learningRate = 0.2,
    now = Date.now(),
  ): AssociativeEdge {
    if (sourceId === targetId) {
      throw new Error("Self-referential associative edges are prohibited");
    }

    const edgeKey = sourceId < targetId ? `${sourceId}<->${targetId}` : `${targetId}<->${sourceId}`;
    let edge = this.edges.get(edgeKey);

    if (!edge) {
      edge = {
        id: edgeKey,
        sourceId,
        targetId,
        kind,
        weight: Math.min(1.0, Math.max(0.1, learningRate)),
        coOccurrenceCount: 1,
        lastReinforcedAt: now,
        decayRate: 0.05,
      };
      this.edges.set(edgeKey, edge);

      // Add to adjacency sets
      if (!this.adjacency.has(sourceId)) this.adjacency.set(sourceId, new Set());
      if (!this.adjacency.has(targetId)) this.adjacency.set(targetId, new Set());
      this.adjacency.get(sourceId)!.add(targetId);
      this.adjacency.get(targetId)!.add(sourceId);
    } else {
      // Hebbian reinforcement
      edge.coOccurrenceCount += 1;
      edge.weight = Math.min(1.0, edge.weight + learningRate * (1 - edge.weight));
      edge.lastReinforcedAt = now;
    }

    return edge;
  }

  getEdgeWeight(sourceId: string, targetId: string): number {
    const edgeKey = sourceId < targetId ? `${sourceId}<->${targetId}` : `${targetId}<->${sourceId}`;
    const edge = this.edges.get(edgeKey);
    return edge ? edge.weight : 0;
  }

  getNeighbors(nodeId: string): string[] {
    const set = this.adjacency.get(nodeId);
    return set ? Array.from(set) : [];
  }

  /**
   * Spreading Activation Algorithm
   * Starts from seed nodes and distributes energy through the network.
   * Returns a map of activated node IDs to their final activation score and traversal path.
   */
  spreadActivation(
    seeds: Array<{ nodeId: string; initialActivation: number }>,
    config: Partial<SpreadingActivationConfig> = {},
  ): Map<string, { activation: number; path: string[] }> {
    const cfg: SpreadingActivationConfig = { ...DEFAULT_SPREADING_CONFIG, ...config };
    const activations = new Map<string, { activation: number; path: string[] }>();

    // Priority queue / frontier for spreading
    let currentFrontier: Array<{ nodeId: string; activation: number; path: string[] }> = [];

    // Initialize seeds
    for (const seed of seeds) {
      const node = this.nodes.get(seed.nodeId);
      if (!node) continue;
      const initial = Math.min(1.0, Math.max(0, seed.initialActivation));
      activations.set(seed.nodeId, {
        activation: initial,
        path: [node.label],
      });
      currentFrontier.push({
        nodeId: seed.nodeId,
        activation: initial,
        path: [node.label],
      });
    }

    let hop = 0;
    while (currentFrontier.length > 0 && hop < cfg.maxHops) {
      hop += 1;
      const nextFrontier: Array<{ nodeId: string; activation: number; path: string[] }> = [];

      for (const current of currentFrontier) {
        const neighbors = this.getNeighbors(current.nodeId);

        for (const neighborId of neighbors) {
          const edgeWeight = this.getEdgeWeight(current.nodeId, neighborId);
          const incoming = current.activation * edgeWeight * cfg.decayFactor;

          if (incoming < cfg.activationThreshold) continue;

          const existing = activations.get(neighborId);
          const neighborNode = this.nodes.get(neighborId);
          const neighborLabel = neighborNode ? neighborNode.label : neighborId;

          if (!existing) {
            const entry = {
              activation: incoming,
              path: [...current.path, neighborLabel],
            };
            activations.set(neighborId, entry);
            nextFrontier.push({
              nodeId: neighborId,
              activation: incoming,
              path: entry.path,
            });
          } else if (incoming > existing.activation) {
            existing.activation = incoming;
            existing.path = [...current.path, neighborLabel];
          }
        }
      }

      // Sort and truncate frontier by firing cap
      nextFrontier.sort((a, b) => b.activation - a.activation);
      currentFrontier = nextFrontier.slice(0, cfg.firingCap);
    }

    return activations;
  }

  getStats(): AssociativeNetworkStats {
    const nodeCount = this.nodes.size;
    const edgeCount = this.edges.size;

    let episodeCount = 0;
    let turnCount = 0;
    for (const node of this.nodes.values()) {
      if (node.kind === "episode") episodeCount += 1;
      if (node.kind === "turn") turnCount += 1;
    }

    const degrees: Array<{ label: string; degree: number }> = [];
    for (const [id, neighbors] of this.adjacency.entries()) {
      const node = this.nodes.get(id);
      if (node && (node.kind === "entity" || node.kind === "concept")) {
        degrees.push({ label: node.label, degree: neighbors.size });
      }
    }
    degrees.sort((a, b) => b.degree - a.degree);

    return {
      nodeCount,
      edgeCount,
      episodeCount,
      turnCount,
      averageDegree: nodeCount > 0 ? (edgeCount * 2) / nodeCount : 0,
      mostConnectedEntities: degrees.slice(0, 10),
    };
  }
}
