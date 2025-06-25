import { 
  DataPoint, 
  GraphData, 
  GraphNode, 
  GraphLink, 
  ConnectionOptions,
  CATEGORY_COLORS 
} from '@/types';
import { ConnectionStrategyService } from './connection-strategies';

export interface GraphOptions {
  connectionStrategy: string;
  connectionOptions?: ConnectionOptions;
  nodeEnhancements?: boolean;
}

export class GraphService {
  private connectionService: ConnectionStrategyService;

  constructor() {
    this.connectionService = new ConnectionStrategyService();
  }

  /**
   * Generate a complete graph from data points
   */
  generateGraph(dataPoints: DataPoint[], options: GraphOptions): GraphData {
    const { connectionStrategy, connectionOptions, nodeEnhancements = true } = options;

    // Filter to points with embeddings
    const pointsWithEmbeddings = dataPoints.filter(point => point.embedding);
    
    if (pointsWithEmbeddings.length === 0) {
      return { nodes: [], links: [] };
    }

    // Create enhanced nodes
    const nodes: GraphNode[] = pointsWithEmbeddings.map(point => ({
      ...point,
      size: nodeEnhancements ? this.calculateNodeSize(point) : 8,
      color: this.getNodeColor(point)
    }));

    // Generate connections using strategy
    const links = this.connectionService.generateConnections(
      connectionStrategy,
      nodes,
      connectionOptions
    );

    return { nodes, links };
  }

  /**
   * Update graph with new connection strategy
   */
  updateConnections(
    currentGraph: GraphData, 
    connectionStrategy: string, 
    connectionOptions?: ConnectionOptions
  ): GraphData {
    if (currentGraph.nodes.length === 0) {
      return currentGraph;
    }

    const links = this.connectionService.generateConnections(
      connectionStrategy,
      currentGraph.nodes,
      connectionOptions
    );

    return {
      ...currentGraph,
      links
    };
  }

  /**
   * Get available connection strategies
   */
  getConnectionStrategies() {
    return this.connectionService.getAll().map(strategy => ({
      name: strategy.name,
      description: strategy.description
    }));
  }

  /**
   * Register a new connection strategy
   */
  registerConnectionStrategy(strategy: any) {
    this.connectionService.register(strategy);
  }

  /**
   * Get graph statistics
   */
  getGraphStats(graphData: GraphData) {
    const { nodes, links } = graphData;
    
    const categories = new Set(nodes.map(n => n.category).filter(Boolean));
    const avgSimilarity = links.length > 0 
      ? links.reduce((sum, link) => sum + link.similarity, 0) / links.length
      : 0;

    const connectionDistribution = this.getConnectionDistribution(nodes, links);
    const densityScore = this.calculateDensity(nodes.length, links.length);

    return {
      nodeCount: nodes.length,
      linkCount: links.length,
      categoryCount: categories.size,
      categories: Array.from(categories),
      avgSimilarity: Math.round(avgSimilarity * 1000) / 1000,
      densityScore,
      connectionDistribution,
      isConnected: this.isGraphConnected(nodes, links)
    };
  }

  /**
   * Find similar nodes to a given node
   */
  findSimilarNodes(
    targetNode: GraphNode,
    allNodes: GraphNode[],
    maxResults: number = 5,
    minSimilarity: number = 0.5
  ): { node: GraphNode; similarity: number }[] {
    if (!targetNode.embedding) return [];

    const similarities: { node: GraphNode; similarity: number }[] = [];

    for (const node of allNodes) {
      if (node.id === targetNode.id || !node.embedding) continue;

      const similarity = this.calculateCosineSimilarity(targetNode.embedding, node.embedding);
      if (similarity >= minSimilarity) {
        similarities.push({ node, similarity });
      }
    }

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxResults);
  }

  /**
   * Get node neighborhoods (connected nodes)
   */
  getNodeNeighborhood(nodeId: string, graphData: GraphData): {
    node: GraphNode;
    neighbors: Array<{node: GraphNode; link: GraphLink}>;
  } | null {
    const node = graphData.nodes.find(n => n.id === nodeId);
    if (!node) return null;

    const neighbors: Array<{node: GraphNode; link: GraphLink}> = [];

    graphData.links.forEach(link => {
      let neighborNode: GraphNode | undefined;
      
      if (link.source === nodeId) {
        neighborNode = graphData.nodes.find(n => n.id === link.target);
      } else if (link.target === nodeId) {
        neighborNode = graphData.nodes.find(n => n.id === link.source);
      }

      if (neighborNode) {
        neighbors.push({ node: neighborNode, link });
      }
    });

    return {
      node,
      neighbors: neighbors.sort((a, b) => b.link.similarity - a.link.similarity)
    };
  }

  /**
   * Calculate shortest path between two nodes
   */
  findShortestPath(
    startId: string, 
    endId: string, 
    graphData: GraphData
  ): GraphNode[] | null {
    if (startId === endId) {
      const node = graphData.nodes.find(n => n.id === startId);
      return node ? [node] : null;
    }

    // Build adjacency list
    const adjacency = new Map<string, string[]>();
    graphData.nodes.forEach(node => {
      adjacency.set(node.id, []);
    });

    graphData.links.forEach(link => {
      adjacency.get(link.source)?.push(link.target);
      adjacency.get(link.target)?.push(link.source);
    });

    // BFS to find shortest path
    const queue: { nodeId: string; path: string[] }[] = [{ nodeId: startId, path: [startId] }];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { nodeId, path } = queue.shift()!;
      
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      if (nodeId === endId) {
        return path.map(id => graphData.nodes.find(n => n.id === id)!).filter(Boolean);
      }

      const neighbors = adjacency.get(nodeId) || [];
      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          queue.push({ nodeId: neighborId, path: [...path, neighborId] });
        }
      }
    }

    return null; // No path found
  }

  // Private helper methods
  private calculateNodeSize(point: DataPoint): number {
    const baseSize = 8;
    const textLengthFactor = Math.log(point.text.length + 1) * 0.5;
    const metadataFactor = point.metadata ? Object.keys(point.metadata).length * 0.3 : 0;
    
    return Math.max(baseSize, Math.min(20, baseSize + textLengthFactor + metadataFactor));
  }

  private getNodeColor(point: DataPoint): string {
    if (point.category) {
      return CATEGORY_COLORS[point.category as keyof typeof CATEGORY_COLORS] || CATEGORY_COLORS.default;
    }
    return CATEGORY_COLORS.default;
  }

  private calculateCosineSimilarity(embedding1: number[], embedding2: number[]): number {
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

  private getConnectionDistribution(nodes: GraphNode[], links: GraphLink[]) {
    const connectionCounts = new Map<string, number>();
    
    nodes.forEach(node => {
      connectionCounts.set(node.id, 0);
    });

    links.forEach(link => {
      connectionCounts.set(link.source, (connectionCounts.get(link.source) || 0) + 1);
      connectionCounts.set(link.target, (connectionCounts.get(link.target) || 0) + 1);
    });

    const counts = Array.from(connectionCounts.values());
    const avgConnections = counts.reduce((sum, count) => sum + count, 0) / counts.length;
    const maxConnections = Math.max(...counts);
    const minConnections = Math.min(...counts);

    return {
      average: Math.round(avgConnections * 100) / 100,
      max: maxConnections,
      min: minConnections,
      distribution: this.getDistributionBuckets(counts)
    };
  }

  private getDistributionBuckets(counts: number[]) {
    const buckets = { '0': 0, '1-2': 0, '3-5': 0, '6-10': 0, '10+': 0 };
    
    counts.forEach(count => {
      if (count === 0) buckets['0']++;
      else if (count <= 2) buckets['1-2']++;
      else if (count <= 5) buckets['3-5']++;
      else if (count <= 10) buckets['6-10']++;
      else buckets['10+']++;
    });

    return buckets;
  }

  private calculateDensity(nodeCount: number, linkCount: number): number {
    if (nodeCount <= 1) return 0;
    const maxPossibleLinks = (nodeCount * (nodeCount - 1)) / 2;
    return linkCount / maxPossibleLinks;
  }

  private isGraphConnected(nodes: GraphNode[], links: GraphLink[]): boolean {
    if (nodes.length <= 1) return true;

    // Build adjacency list
    const adjacency = new Map<string, Set<string>>();
    nodes.forEach(node => {
      adjacency.set(node.id, new Set());
    });

    links.forEach(link => {
      adjacency.get(link.source)?.add(link.target);
      adjacency.get(link.target)?.add(link.source);
    });

    // DFS from first node
    const visited = new Set<string>();
    const stack = [nodes[0].id];

    while (stack.length > 0) {
      const nodeId = stack.pop()!;
      if (visited.has(nodeId)) continue;
      
      visited.add(nodeId);
      const neighbors = adjacency.get(nodeId) || new Set();
      neighbors.forEach(neighborId => {
        if (!visited.has(neighborId)) {
          stack.push(neighborId);
        }
      });
    }

    return visited.size === nodes.length;
  }
}