import { ConnectionStrategy, GraphNode, GraphLink, ConnectionOptions } from '@/types';

// Utility function for cosine similarity
function calculateCosineSimilarity(embedding1: number[], embedding2: number[]): number {
  if (embedding1.length !== embedding2.length) return 0;

  let dotProduct = 0;
  let magnitude1 = 0; 
  let magnitude2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    magnitude1 += embedding1[i] * embedding1[i];
    magnitude2 += embedding2[i] * embedding2[i];
  }

  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  if (magnitude1 === 0 || magnitude2 === 0) return 0;
  return dotProduct / (magnitude1 * magnitude2);
}

// Base class for similarity-based strategies
abstract class SimilarityConnectionStrategy implements ConnectionStrategy {
  abstract name: string;
  abstract description: string;

  protected calculateAllSimilarities(nodes: GraphNode[]): Array<{
    source: string;
    target: string; 
    similarity: number;
  }> {
    const similarities: Array<{source: string; target: string; similarity: number}> = [];
    
    for (let i = 0; i < nodes.length; i++) {
      const sourceNode = nodes[i];
      if (!sourceNode.embedding) continue;

      for (let j = i + 1; j < nodes.length; j++) {
        const targetNode = nodes[j];
        if (!targetNode.embedding) continue;

        const similarity = calculateCosineSimilarity(sourceNode.embedding, targetNode.embedding);
        if (similarity > 0.05) { // Minimum threshold to avoid noise
          similarities.push({
            source: sourceNode.id,
            target: targetNode.id,
            similarity
          });
        }
      }
    }

    return similarities.sort((a, b) => b.similarity - a.similarity);
  }

  protected createLink(source: string, target: string, similarity: number): GraphLink {
    return {
      source,
      target,
      similarity,
      distance: 30 + (1 - similarity) * 120
    };
  }

  abstract generateConnections(nodes: GraphNode[], options?: ConnectionOptions): GraphLink[];
}

// Top-K connection strategies
export class TopKConnectionStrategy extends SimilarityConnectionStrategy {
  constructor(private k: number) {
    super();
  }

  get name(): string {
    return `top${this.k}`;
  }

  get description(): string {
    return `Connect each node to its top ${this.k} most similar nodes`;
  }

  generateConnections(nodes: GraphNode[], options?: ConnectionOptions): GraphLink[] {
    const similarities = this.calculateAllSimilarities(nodes);
    const links: GraphLink[] = [];
    const nodeConnections = new Map<string, number>();

    // Group similarities by source node
    const bySource = new Map<string, Array<{target: string; similarity: number}>>();
    
    similarities.forEach(sim => {
      if (!bySource.has(sim.source)) {
        bySource.set(sim.source, []);
      }
      bySource.get(sim.source)!.push({target: sim.target, similarity: sim.similarity});

      if (!bySource.has(sim.target)) {
        bySource.set(sim.target, []);
      }
      bySource.get(sim.target)!.push({target: sim.source, similarity: sim.similarity});
    });

    // Connect each node to its top K neighbors
    nodes.forEach(node => {
      const connections = bySource.get(node.id) || [];
      const topK = connections
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, this.k);

      topK.forEach(conn => {
        // Avoid duplicate links
        const linkExists = links.some(link => 
          (link.source === node.id && link.target === conn.target) ||
          (link.target === node.id && link.source === conn.target)
        );

        if (!linkExists) {
          links.push(this.createLink(node.id, conn.target, conn.similarity));
        }
      });
    });

    return links;
  }
}

// Threshold-based strategy
export class ThresholdConnectionStrategy extends SimilarityConnectionStrategy {
  name = 'threshold';
  description = 'Connect nodes with similarity above threshold';

  generateConnections(nodes: GraphNode[], options?: ConnectionOptions): GraphLink[] {
    const threshold = options?.threshold || 0.7;
    const similarities = this.calculateAllSimilarities(nodes);
    
    return similarities
      .filter(sim => sim.similarity >= threshold)
      .map(sim => this.createLink(sim.source, sim.target, sim.similarity));
  }
}

// Adaptive strategy - adjusts connections based on similarity distribution
export class AdaptiveConnectionStrategy extends SimilarityConnectionStrategy {
  name = 'adaptive';
  description = 'Dynamically adjust connections based on similarity patterns';

  generateConnections(nodes: GraphNode[], options?: ConnectionOptions): GraphLink[] {
    const similarities = this.calculateAllSimilarities(nodes);
    const links: GraphLink[] = [];

    // Group by source node
    const bySource = new Map<string, Array<{target: string; similarity: number}>>();
    similarities.forEach(sim => {
      if (!bySource.has(sim.source)) {
        bySource.set(sim.source, []);
      }
      bySource.get(sim.source)!.push({target: sim.target, similarity: sim.similarity});

      if (!bySource.has(sim.target)) {
        bySource.set(sim.target, []);
      }
      bySource.get(sim.target)!.push({target: sim.source, similarity: sim.similarity});
    });

    // Adaptive logic for each node
    nodes.forEach(node => {
      const connections = bySource.get(node.id) || [];
      if (connections.length === 0) return;

      connections.sort((a, b) => b.similarity - a.similarity);
      
      // Calculate adaptive parameters
      const avgSimilarity = connections.slice(0, 10).reduce((sum, c) => sum + c.similarity, 0) / Math.min(10, connections.length);
      const connectionCount = avgSimilarity > 0.7 ? 3 : avgSimilarity > 0.5 ? 5 : 7;
      const minThreshold = Math.max(0.3, avgSimilarity * 0.5);

      // Select connections
      const selected = connections
        .slice(0, connectionCount)
        .filter(c => c.similarity > minThreshold);

      selected.forEach(conn => {
        const linkExists = links.some(link => 
          (link.source === node.id && link.target === conn.target) ||
          (link.target === node.id && link.source === conn.target)
        );

        if (!linkExists) {
          links.push(this.createLink(node.id, conn.target, conn.similarity));
        }
      });
    });

    return links;
  }
}

// Category-based strategy - prioritizes connections within categories
export class CategoryConnectionStrategy extends SimilarityConnectionStrategy {
  name = 'category_based';
  description = 'Prioritize connections within same category, with some cross-category links';

  generateConnections(nodes: GraphNode[], options?: ConnectionOptions): GraphLink[] {
    const similarities = this.calculateAllSimilarities(nodes);
    const links: GraphLink[] = [];
    const categoryWeight = options?.categoryWeight || 0.7;

    // Group by source and categorize by same/different category
    const bySource = new Map<string, {
      sameCategory: Array<{target: string; similarity: number}>;
      differentCategory: Array<{target: string; similarity: number}>;
    }>();

    similarities.forEach(sim => {
      const sourceNode = nodes.find(n => n.id === sim.source);
      const targetNode = nodes.find(n => n.id === sim.target);
      
      if (!sourceNode || !targetNode) return;

      const sameCategory = sourceNode.category === targetNode.category;

      [sim.source, sim.target].forEach((nodeId, index) => {
        const otherId = index === 0 ? sim.target : sim.source;
        
        if (!bySource.has(nodeId)) {
          bySource.set(nodeId, { sameCategory: [], differentCategory: [] });
        }

        const group = bySource.get(nodeId)!;
        if (sameCategory) {
          group.sameCategory.push({target: otherId, similarity: sim.similarity});
        } else {
          group.differentCategory.push({target: otherId, similarity: sim.similarity});
        }
      });
    });

    // Connect each node
    nodes.forEach(node => {
      const connections = bySource.get(node.id);
      if (!connections) return;

      // Sort by similarity
      connections.sameCategory.sort((a, b) => b.similarity - a.similarity);
      connections.differentCategory.sort((a, b) => b.similarity - a.similarity);

      // Select connections: prioritize same category
      const sameCount = Math.min(3, connections.sameCategory.length);
      const diffCount = Math.min(2, connections.differentCategory.length);

      const selected = [
        ...connections.sameCategory.slice(0, sameCount),
        ...connections.differentCategory.slice(0, diffCount)
      ];

      selected.forEach(conn => {
        const linkExists = links.some(link => 
          (link.source === node.id && link.target === conn.target) ||
          (link.target === node.id && link.source === conn.target)
        );

        if (!linkExists) {
          links.push(this.createLink(node.id, conn.target, conn.similarity));
        }
      });
    });

    return links;
  }
}

// Service to manage connection strategies
export class ConnectionStrategyService {
  private strategies = new Map<string, ConnectionStrategy>();

  constructor() {
    this.registerDefaultStrategies();
  }

  private registerDefaultStrategies() {
    this.register(new TopKConnectionStrategy(3));
    this.register(new TopKConnectionStrategy(5));
    this.register(new TopKConnectionStrategy(10));
    this.register(new ThresholdConnectionStrategy());
    this.register(new AdaptiveConnectionStrategy());
    this.register(new CategoryConnectionStrategy());
  }

  register(strategy: ConnectionStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  get(name: string): ConnectionStrategy | undefined {
    return this.strategies.get(name);
  }

  getAll(): ConnectionStrategy[] {
    return Array.from(this.strategies.values());
  }

  generateConnections(
    strategyName: string, 
    nodes: GraphNode[], 
    options?: ConnectionOptions
  ): GraphLink[] {
    const strategy = this.get(strategyName);
    if (!strategy) {
      throw new Error(`Unknown connection strategy: ${strategyName}`);
    }

    return strategy.generateConnections(nodes, options);
  }
}