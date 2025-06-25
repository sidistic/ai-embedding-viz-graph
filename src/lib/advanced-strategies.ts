// advanced-strategies.ts - Examples of advanced strategies that can be easily added

import { ConnectionStrategy, SearchStrategy, GraphNode, GraphLink, SearchResult, ConnectionOptions, SearchOptions } from '@/types';

/**
 * Example 1: Temporal Connection Strategy
 * Connects nodes based on temporal proximity (if metadata contains timestamps)
 */
export class TemporalConnectionStrategy implements ConnectionStrategy {
  name = 'temporal';
  description = 'Connect nodes by temporal proximity';

  generateConnections(nodes: GraphNode[], options?: ConnectionOptions): GraphLink[] {
    const timeWindow = options?.timeWindow || 86400000; // 24 hours in milliseconds
    const maxConnections = options?.maxConnections || 5;
    const links: GraphLink[] = [];

    // Extract timestamps from metadata
    const nodesWithTime = nodes
      .map(node => ({
        ...node,
        timestamp: this.extractTimestamp(node)
      }))
      .filter(node => node.timestamp !== null)
      .sort((a, b) => a.timestamp! - b.timestamp!);

    // Connect nodes within time windows
    for (let i = 0; i < nodesWithTime.length; i++) {
      const sourceNode = nodesWithTime[i];
      const connections: Array<{node: typeof sourceNode; similarity: number}> = [];

      // Look for nodes within time window
      for (let j = i + 1; j < nodesWithTime.length; j++) {
        const targetNode = nodesWithTime[j];
        const timeDiff = Math.abs(targetNode.timestamp! - sourceNode.timestamp!);
        
        if (timeDiff > timeWindow) break; // Nodes are sorted, so we can break
        
        // Calculate similarity based on time proximity and content
        const temporalSimilarity = 1 - (timeDiff / timeWindow);
        const contentSimilarity = sourceNode.embedding && targetNode.embedding
          ? this.calculateCosineSimilarity(sourceNode.embedding, targetNode.embedding)
          : 0.5;
        
        const combinedSimilarity = (temporalSimilarity * 0.4) + (contentSimilarity * 0.6);
        
        connections.push({ node: targetNode, similarity: combinedSimilarity });
      }

      // Take top connections
      connections
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, maxConnections)
        .forEach(conn => {
          links.push({
            source: sourceNode.id,
            target: conn.node.id,
            similarity: conn.similarity,
            distance: 50 + (1 - conn.similarity) * 100
          });
        });
    }

    return links;
  }

  private extractTimestamp(node: GraphNode): number | null {
    const metadata = node.metadata;
    if (!metadata) return null;

    // Try various timestamp fields
    const timeFields = ['timestamp', 'created_at', 'date', 'time'];
    for (const field of timeFields) {
      if (metadata[field]) {
        const time = new Date(metadata[field]).getTime();
        if (!isNaN(time)) return time;
      }
    }

    return null;
  }

  private calculateCosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }
    
    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);
    
    return magnitudeA && magnitudeB ? dotProduct / (magnitudeA * magnitudeB) : 0;
  }
}

/**
 * Example 2: Community Detection Connection Strategy
 * Uses Louvain algorithm for community detection
 */
export class CommunityConnectionStrategy implements ConnectionStrategy {
  name = 'community';
  description = 'Connect nodes based on detected communities';

  generateConnections(nodes: GraphNode[], options?: ConnectionOptions): GraphLink[] {
    const resolution = options?.resolution || 1.0;
    const minCommunitySize = options?.minCommunitySize || 2;
    
    // First, create a similarity matrix
    const similarities = this.buildSimilarityMatrix(nodes);
    
    // Detect communities using simplified Louvain-style algorithm
    const communities = this.detectCommunities(nodes, similarities, resolution);
    
    // Filter out small communities
    const validCommunities = communities.filter(c => c.length >= minCommunitySize);
    
    const links: GraphLink[] = [];
    
    // Create connections within communities
    validCommunities.forEach(community => {
      this.connectWithinCommunity(community, similarities, links);
    });
    
    // Create some inter-community connections
    this.connectBetweenCommunities(validCommunities, similarities, links);
    
    return links;
  }

  private buildSimilarityMatrix(nodes: GraphNode[]): Map<string, Map<string, number>> {
    const matrix = new Map<string, Map<string, number>>();
    
    nodes.forEach(node => {
      matrix.set(node.id, new Map());
    });
    
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeA = nodes[i];
        const nodeB = nodes[j];
        
        let similarity = 0;
        if (nodeA.embedding && nodeB.embedding) {
          similarity = this.calculateCosineSimilarity(nodeA.embedding, nodeB.embedding);
        }
        
        matrix.get(nodeA.id)!.set(nodeB.id, similarity);
        matrix.get(nodeB.id)!.set(nodeA.id, similarity);
      }
    }
    
    return matrix;
  }

  private detectCommunities(
    nodes: GraphNode[], 
    similarities: Map<string, Map<string, number>>, 
    resolution: number
  ): GraphNode[][] {
    // Simplified community detection - in practice, you'd use a proper algorithm
    const communities: GraphNode[][] = [];
    const assigned = new Set<string>();
    
    nodes.forEach(node => {
      if (assigned.has(node.id)) return;
      
      const community = [node];
      assigned.add(node.id);
      
      // Find similar nodes to add to this community
      const nodeSimMap = similarities.get(node.id)!;
      const candidates = Array.from(nodeSimMap.entries())
        .filter(([targetId, sim]) => !assigned.has(targetId) && sim > 0.6)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5);
      
      candidates.forEach(([targetId]) => {
        const targetNode = nodes.find(n => n.id === targetId);
        if (targetNode && !assigned.has(targetId)) {
          community.push(targetNode);
          assigned.add(targetId);
        }
      });
      
      communities.push(community);
    });
    
    return communities;
  }

  private connectWithinCommunity(
    community: GraphNode[], 
    similarities: Map<string, Map<string, number>>, 
    links: GraphLink[]
  ): void {
    for (let i = 0; i < community.length; i++) {
      for (let j = i + 1; j < community.length; j++) {
        const nodeA = community[i];
        const nodeB = community[j];
        const similarity = similarities.get(nodeA.id)?.get(nodeB.id) || 0;
        
        if (similarity > 0.3) {
          links.push({
            source: nodeA.id,
            target: nodeB.id,
            similarity,
            distance: 40 + (1 - similarity) * 80
          });
        }
      }
    }
  }

  private connectBetweenCommunities(
    communities: GraphNode[][], 
    similarities: Map<string, Map<string, number>>, 
    links: GraphLink[]
  ): void {
    // Connect best representatives between communities
    for (let i = 0; i < communities.length; i++) {
      for (let j = i + 1; j < communities.length; j++) {
        const commA = communities[i];
        const commB = communities[j];
        
        let bestConnection: {nodeA: GraphNode; nodeB: GraphNode; similarity: number} | null = null;
        
        commA.forEach(nodeA => {
          commB.forEach(nodeB => {
            const similarity = similarities.get(nodeA.id)?.get(nodeB.id) || 0;
            if (!bestConnection || similarity > bestConnection.similarity) {
              bestConnection = { nodeA, nodeB, similarity };
            }
          });
        });
        
        if (bestConnection && bestConnection.similarity > 0.4) {
          links.push({
            source: bestConnection.nodeA.id,
            target: bestConnection.nodeB.id,
            similarity: bestConnection.similarity,
            distance: 100 + (1 - bestConnection.similarity) * 50
          });
        }
      }
    }
  }

  private calculateCosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }
    
    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);
    
    return magnitudeA && magnitudeB ? dotProduct / (magnitudeA * magnitudeB) : 0;
  }
}

/**
 * Example 3: AI-Powered Search Strategy
 * Uses embeddings and advanced ranking algorithms
 */
export class AISearchStrategy implements SearchStrategy {
  name = 'ai_powered';
  description = 'AI-powered semantic search with context understanding';

  search(nodes: GraphNode[], query: string, options?: SearchOptions): SearchResult[] {
    const { maxResults = 10 } = options || {};
    
    // Combine multiple search approaches
    const textResults = this.performTextSearch(nodes, query);
    const semanticResults = this.performSemanticSearch(nodes, query);
    const contextResults = this.performContextualSearch(nodes, query);
    
    // Merge and rank results using AI-inspired scoring
    const mergedResults = this.mergeResults([textResults, semanticResults, contextResults]);
    
    return mergedResults
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }

  private performTextSearch(nodes: GraphNode[], query: string): SearchResult[] {
    const results: SearchResult[] = [];
    const queryTerms = query.toLowerCase().split(/\s+/);
    
    nodes.forEach(node => {
      const text = node.text.toLowerCase();
      let score = 0;
      const highlights: string[] = [];
      
      queryTerms.forEach(term => {
        if (text.includes(term)) {
          score += text === term ? 1.0 : 0.6;
          
          // Extract context around match
          const index = text.indexOf(term);
          const start = Math.max(0, index - 30);
          const end = Math.min(text.length, index + term.length + 30);
          highlights.push(node.text.substring(start, end));
        }
      });
      
      if (score > 0) {
        results.push({
          node,
          score: score / queryTerms.length,
          matchType: 'partial',
          highlights
        });
      }
    });
    
    return results;
  }

  private performSemanticSearch(nodes: GraphNode[], query: string): SearchResult[] {
    // This would require generating an embedding for the query
    // For now, we'll simulate semantic understanding
    const results: SearchResult[] = [];
    
    const semanticKeywords = this.extractSemanticKeywords(query);
    
    nodes.forEach(node => {
      let semanticScore = 0;
      const nodeText = node.text.toLowerCase();
      
      semanticKeywords.forEach(keyword => {
        if (nodeText.includes(keyword)) {
          semanticScore += 0.8;
        }
      });
      
      // Boost score based on category relevance
      if (node.category) {
        const categoryScore = this.getCategoryRelevance(query, node.category);
        semanticScore += categoryScore * 0.5;
      }
      
      if (semanticScore > 0) {
        results.push({
          node,
          score: Math.min(1.0, semanticScore),
          matchType: 'semantic',
          highlights: [`Semantic match for: ${query}`]
        });
      }
    });
    
    return results;
  }

  private performContextualSearch(nodes: GraphNode[], query: string): SearchResult[] {
    // Advanced contextual understanding
    const results: SearchResult[] = [];
    const context = this.analyzeQueryContext(query);
    
    nodes.forEach(node => {
      let contextScore = 0;
      
      // Score based on metadata relevance
      if (node.metadata) {
        contextScore += this.scoreMetadataRelevance(node.metadata, context);
      }
      
      // Score based on text patterns
      contextScore += this.scoreTextPatterns(node.text, context);
      
      if (contextScore > 0.3) {
        results.push({
          node,
          score: contextScore,
          matchType: 'metadata',
          highlights: [`Contextual match: ${context.intent}`]
        });
      }
    });
    
    return results;
  }

  private extractSemanticKeywords(query: string): string[] {
    // Simple semantic expansion - in practice, you'd use an LLM or knowledge graph
    const expansions: Record<string, string[]> = {
      'ai': ['artificial intelligence', 'machine learning', 'neural network', 'deep learning'],
      'technology': ['tech', 'innovation', 'digital', 'computer', 'software'],
      'climate': ['environment', 'global warming', 'sustainability', 'carbon'],
      'sports': ['athletics', 'competition', 'game', 'tournament', 'championship']
    };
    
    const keywords: string[] = [];
    const queryLower = query.toLowerCase();
    
    Object.entries(expansions).forEach(([key, values]) => {
      if (queryLower.includes(key)) {
        keywords.push(...values);
      }
    });
    
    return keywords;
  }

  private getCategoryRelevance(query: string, category: string): number {
    const queryLower = query.toLowerCase();
    const categoryLower = category.toLowerCase();
    
    if (queryLower.includes(categoryLower)) return 1.0;
    
    // Category similarity mapping
    const similarCategories: Record<string, string[]> = {
      'technology': ['tech', 'sci/tech', 'science'],
      'sports': ['athletics', 'games'],
      'business': ['finance', 'economy', 'market'],
      'world': ['news', 'politics', 'international']
    };
    
    const similar = similarCategories[categoryLower] || [];
    return similar.some(s => queryLower.includes(s)) ? 0.7 : 0;
  }

  private analyzeQueryContext(query: string): { intent: string; entities: string[]; sentiment: string } {
    // Simple intent analysis - in practice, you'd use NLP libraries
    const queryLower = query.toLowerCase();
    
    let intent = 'general';
    if (queryLower.includes('what') || queryLower.includes('how')) intent = 'question';
    if (queryLower.includes('find') || queryLower.includes('search')) intent = 'search';
    if (queryLower.includes('show') || queryLower.includes('display')) intent = 'display';
    
    const entities = query.split(/\s+/).filter(word => 
      word.length > 3 && 
      !['what', 'how', 'find', 'search', 'show', 'display', 'the', 'and', 'for'].includes(word.toLowerCase())
    );
    
    let sentiment = 'neutral';
    if (queryLower.includes('good') || queryLower.includes('best')) sentiment = 'positive';
    if (queryLower.includes('bad') || queryLower.includes('worst')) sentiment = 'negative';
    
    return { intent, entities, sentiment };
  }

  private scoreMetadataRelevance(metadata: Record<string, any>, context: any): number {
    let score = 0;
    
    context.entities.forEach((entity: string) => {
      Object.values(metadata).forEach(value => {
        if (typeof value === 'string' && value.toLowerCase().includes(entity.toLowerCase())) {
          score += 0.3;
        }
      });
    });
    
    return Math.min(1.0, score);
  }

  private scoreTextPatterns(text: string, context: any): number {
    let score = 0;
    const textLower = text.toLowerCase();
    
    // Pattern-based scoring
    if (context.intent === 'question' && (textLower.includes('answer') || textLower.includes('solution'))) {
      score += 0.4;
    }
    
    if (context.sentiment === 'positive' && (textLower.includes('success') || textLower.includes('achieve'))) {
      score += 0.3;
    }
    
    return score;
  }

  private mergeResults(resultGroups: SearchResult[][]): SearchResult[] {
    const mergedMap = new Map<string, SearchResult>();
    
    resultGroups.forEach((results, groupIndex) => {
      results.forEach(result => {
        const existing = mergedMap.get(result.node.id);
        
        if (existing) {
          // Combine scores with diminishing returns
          existing.score = existing.score + (result.score * 0.5);
          existing.highlights = [...existing.highlights, ...result.highlights];
        } else {
          mergedMap.set(result.node.id, { 
            ...result, 
            score: result.score * (1 - groupIndex * 0.1) // Slightly prefer earlier groups
          });
        }
      });
    });
    
    return Array.from(mergedMap.values());
  }
}

// Example of how to register these strategies
export function registerAdvancedStrategies(
  connectionService: ConnectionStrategyService, 
  searchService: SearchStrategyService
) {
  connectionService.register(new TemporalConnectionStrategy());
  connectionService.register(new CommunityConnectionStrategy());
  searchService.register(new AISearchStrategy());
}