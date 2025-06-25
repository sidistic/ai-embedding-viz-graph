import { SearchStrategy, GraphNode, SearchResult, SearchOptions } from '@/types';

// Text-based search strategy
export class TextSearchStrategy implements SearchStrategy {
  name = 'text';
  description = 'Search by text content with highlighting';

  search(nodes: GraphNode[], query: string, options?: SearchOptions): SearchResult[] {
    const {
      maxResults = 5,
      caseSensitive = false,
      searchFields = ['text', 'category']
    } = options || {};

    if (!query.trim()) return [];

    const normalizedQuery = caseSensitive ? query : query.toLowerCase();
    const queryTerms = normalizedQuery.split(/\s+/).filter(term => term.length > 0);
    const results: SearchResult[] = [];

    for (const node of nodes) {
      const scores: number[] = [];
      const highlights: string[] = [];

      // Search in text
      if (searchFields.includes('text')) {
        const textScore = this.scoreTextMatch(node.text, queryTerms, caseSensitive);
        if (textScore.score > 0) {
          scores.push(textScore.score);
          highlights.push(...textScore.highlights);
        }
      }

      // Search in category
      if (searchFields.includes('category') && node.category) {
        const categoryText = caseSensitive ? node.category : node.category.toLowerCase();
        if (queryTerms.some(term => categoryText.includes(term))) {
          scores.push(1.0);
          highlights.push(node.category);
        }
      }

      // Search in metadata
      if (searchFields.includes('metadata') && options?.includeMetadata && node.metadata) {
        const metadataScore = this.searchMetadata(node.metadata, queryTerms, caseSensitive);
        if (metadataScore.score > 0) {
          scores.push(metadataScore.score * 0.7);
          highlights.push(...metadataScore.highlights);
        }
      }

      if (scores.length > 0) {
        const maxScore = Math.max(...scores);
        const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        const finalScore = (maxScore * 0.7) + (avgScore * 0.3);

        const hasExactMatch = this.hasExactMatch(node.text, queryTerms, caseSensitive);

        results.push({
          node,
          score: finalScore,
          matchType: hasExactMatch ? 'exact' : 'partial',
          matchedText: highlights.join(', '),
          highlights
        });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }

  private scoreTextMatch(
    text: string,
    queryTerms: string[],
    caseSensitive: boolean
  ): { score: number; highlights: string[] } {
    const normalizedText = caseSensitive ? text : text.toLowerCase();
    const highlights: string[] = [];
    let totalScore = 0;

    for (const term of queryTerms) {
      if (normalizedText.includes(term)) {
        const exactMatch = normalizedText === term;
        const startMatch = normalizedText.startsWith(term);
        const wordBoundaryMatch = new RegExp(`\\b${term}\\b`).test(normalizedText);
        
        if (exactMatch) {
          totalScore += 1.0;
        } else if (wordBoundaryMatch) {
          totalScore += 0.8;
        } else if (startMatch) {
          totalScore += 0.6;
        } else {
          totalScore += 0.4;
        }

        // Extract context for highlighting
        const index = normalizedText.indexOf(term);
        const start = Math.max(0, index - 20);
        const end = Math.min(text.length, index + term.length + 20);
        highlights.push(text.substring(start, end));
      }
    }

    return {
      score: totalScore / queryTerms.length,
      highlights
    };
  }

  private hasExactMatch(text: string, queryTerms: string[], caseSensitive: boolean): boolean {
    const normalizedText = caseSensitive ? text : text.toLowerCase();
    return queryTerms.every(term => normalizedText.includes(term));
  }

  private searchMetadata(
    metadata: Record<string, any>,
    queryTerms: string[],
    caseSensitive: boolean
  ): { score: number; highlights: string[] } {
    const highlights: string[] = [];
    let score = 0;
    let matches = 0;

    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === 'string') {
        const normalizedValue = caseSensitive ? value : value.toLowerCase();
        for (const term of queryTerms) {
          if (normalizedValue.includes(term)) {
            score += 0.5;
            matches++;
            highlights.push(`${key}: ${value}`);
          }
        }
      }
    }

    return {
      score: matches > 0 ? score / queryTerms.length : 0,
      highlights
    };
  }
}

// Fuzzy search strategy
export class FuzzySearchStrategy implements SearchStrategy {
  name = 'fuzzy';
  description = 'Fuzzy text matching with typo tolerance';

  search(nodes: GraphNode[], query: string, options?: SearchOptions): SearchResult[] {
    const {
      maxResults = 5,
      caseSensitive = false,
      searchFields = ['text', 'category']
    } = options || {};

    if (!query.trim()) return [];

    const results: SearchResult[] = [];

    for (const node of nodes) {
      let bestScore = 0;
      let bestMatch = '';
      const highlights: string[] = [];

      // Search in different fields
      if (searchFields.includes('text')) {
        const score = this.fuzzyMatch(query, node.text, caseSensitive);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = node.text;
          highlights.push(node.text.substring(0, 50) + '...');
        }
      }

      if (searchFields.includes('category') && node.category) {
        const score = this.fuzzyMatch(query, node.category, caseSensitive);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = node.category;
          highlights.push(node.category);
        }
      }

      if (bestScore > 0.3) { // Fuzzy threshold
        results.push({
          node,
          score: bestScore,
          matchType: bestScore > 0.8 ? 'exact' : 'partial',
          matchedText: bestMatch,
          highlights
        });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }

  private fuzzyMatch(query: string, text: string, caseSensitive: boolean): number {
    const q = caseSensitive ? query : query.toLowerCase();
    const t = caseSensitive ? text : text.toLowerCase();

    if (q === t) return 1.0;
    if (t.includes(q)) return 0.8;

    // Simple fuzzy matching using edit distance
    const distance = this.levenshteinDistance(q, t);
    const maxLength = Math.max(q.length, t.length);
    
    if (maxLength === 0) return 0;
    
    const similarity = 1 - (distance / maxLength);
    return Math.max(0, similarity);
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }
}

// Category-based search strategy
export class CategorySearchStrategy implements SearchStrategy {
  name = 'category';
  description = 'Search primarily by category with fallback to text';

  search(nodes: GraphNode[], query: string, options?: SearchOptions): SearchResult[] {
    const { maxResults = 5, caseSensitive = false } = options || {};

    if (!query.trim()) return [];

    const normalizedQuery = caseSensitive ? query : query.toLowerCase();
    const results: SearchResult[] = [];

    for (const node of nodes) {
      let score = 0;
      let matchType: SearchResult['matchType'] = 'partial';
      const highlights: string[] = [];

      // Primary: exact category match
      if (node.category) {
        const normalizedCategory = caseSensitive ? node.category : node.category.toLowerCase();
        if (normalizedCategory === normalizedQuery) {
          score = 1.0;
          matchType = 'exact';
          highlights.push(node.category);
        } else if (normalizedCategory.includes(normalizedQuery)) {
          score = 0.8;
          highlights.push(node.category);
        }
      }

      // Secondary: text search
      if (score === 0) {
        const normalizedText = caseSensitive ? node.text : node.text.toLowerCase();
        if (normalizedText.includes(normalizedQuery)) {
          score = 0.6;
          highlights.push(node.text.substring(0, 50) + '...');
        }
      }

      if (score > 0) {
        results.push({
          node,
          score,
          matchType,
          matchedText: highlights.join(', '),
          highlights
        });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }
}

// Semantic search strategy (placeholder for future implementation)
export class SemanticSearchStrategy implements SearchStrategy {
  name = 'semantic';
  description = 'Semantic search using embeddings (requires embedding service)';

  search(nodes: GraphNode[], query: string, options?: SearchOptions): SearchResult[] {
    // TODO: Implement semantic search
    // This would require:
    // 1. Generate embedding for search query
    // 2. Calculate similarity with node embeddings
    // 3. Return most similar nodes
    
    console.warn('Semantic search not yet implemented');
    return [];
  }
}

// Service to manage search strategies
export class SearchStrategyService {
  private strategies = new Map<string, SearchStrategy>();

  constructor() {
    this.registerDefaultStrategies();
  }

  private registerDefaultStrategies() {
    this.register(new TextSearchStrategy());
    this.register(new FuzzySearchStrategy());
    this.register(new CategorySearchStrategy());
    this.register(new SemanticSearchStrategy());
  }

  register(strategy: SearchStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  get(name: string): SearchStrategy | undefined {
    return this.strategies.get(name);
  }

  getAll(): SearchStrategy[] {
    return Array.from(this.strategies.values());
  }

  search(
    strategyName: string,
    nodes: GraphNode[],
    query: string,
    options?: SearchOptions
  ): SearchResult[] {
    const strategy = this.get(strategyName);
    if (!strategy) {
      throw new Error(`Unknown search strategy: ${strategyName}`);
    }

    return strategy.search(nodes, query, options);
  }

  // Convenience method for multi-strategy search
  searchMultiple(
    strategyNames: string[],
    nodes: GraphNode[],
    query: string,
    options?: SearchOptions
  ): Map<string, SearchResult[]> {
    const results = new Map<string, SearchResult[]>();

    for (const strategyName of strategyNames) {
      try {
        const strategyResults = this.search(strategyName, nodes, query, options);
        results.set(strategyName, strategyResults);
      } catch (error) {
        console.warn(`Search strategy '${strategyName}' failed:`, error);
        results.set(strategyName, []);
      }
    }

    return results;
  }
}