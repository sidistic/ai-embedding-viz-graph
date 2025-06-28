import Papa from 'papaparse';
import { 
  DataPoint, 
  GraphData, 
  GraphNode, 
  GraphLink, 
  ConnectionStrategy, 
  SimilarityPair, 
  CATEGORY_COLORS,
  SearchOptions,
  SearchResult,
  DataProcessingOptions,
  ProcessingProgress,
  ProcessingCallback,
  DataStats
} from '@/types';

export class DataProcessor {
  private static readonly MAX_FILE_SIZE_MB = 50; // 50MB limit
  private static readonly CHUNK_SIZE = 1000; // Process in chunks
  
  /**
   * Enhanced CSV parser with streaming support for large files
   */
  static async loadCSVData(
    csvContent: string, 
    options: DataProcessingOptions = {},
    onProgress?: ProcessingCallback
  ): Promise<DataPoint[]> {
    const startTime = Date.now();
    const {
      chunkSize = this.CHUNK_SIZE,
      skipValidation = false,
      maxFileSize = this.MAX_FILE_SIZE_MB
    } = options;

    // Check file size
    const fileSizeKB = new Blob([csvContent]).size / 1024;
    const fileSizeMB = fileSizeKB / 1024;
    
    if (fileSizeMB > maxFileSize) {
      throw new Error(`File size (${fileSizeMB.toFixed(1)}MB) exceeds limit of ${maxFileSize}MB`);
    }

    onProgress?.({
      stage: 'loading',
      progress: 10,
      current: 0,
      total: 1,
      message: 'Starting CSV parsing...'
    });

    return new Promise((resolve, reject) => {
      const results: DataPoint[] = [];
      let processedRows = 0;
      let totalRows = 0;
      let lastProgressUpdate = 0;
      const progressThrottle = 500; // Throttle progress updates to every 500ms
      
      // Memory management for large datasets
      const maxMemoryItems = 50000; // Process in chunks if larger
      let currentChunk: DataPoint[] = [];
      const chunks: DataPoint[][] = [];

      Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        worker: false, // Keep in main thread for progress tracking
        step: (row, parser) => {
          if (row.errors?.length > 0 && !skipValidation) {
            console.warn('CSV parsing error:', row.errors);
          }

          try {
            const dataPoint = this.parseRowToDataPoint(row.data, processedRows);
            if (dataPoint.text && dataPoint.text.length > 0) {
              currentChunk.push(dataPoint);
              
              // Memory management: if chunk gets too large, move to chunks array
              if (currentChunk.length >= maxMemoryItems) {
                chunks.push([...currentChunk]);
                currentChunk = []; // Clear current chunk to free memory
                
                // Force garbage collection hint
                if (global.gc) {
                  global.gc();
                }
              }
            }
            
            processedRows++;

            // Throttled progress updates to prevent UI blocking
            const now = Date.now();
            if (now - lastProgressUpdate >= progressThrottle || processedRows % Math.max(1, Math.floor(chunkSize / 10)) === 0) {
              lastProgressUpdate = now;
              onProgress?.({
                stage: 'parsing',
                progress: 10 + Math.min(70, (processedRows / (totalRows || processedRows)) * 70),
                current: processedRows,
                total: totalRows || processedRows,
                message: `Processed ${processedRows} rows...`
              });
            }

          } catch (error) {
            if (!skipValidation) {
              console.warn(`Error processing row ${processedRows}:`, error);
            }
          }
        },
        complete: () => {
          try {
            // Combine all chunks with current chunk
            if (currentChunk.length > 0) {
              chunks.push(currentChunk);
            }
            
            // Flatten all chunks into results array
            const allResults = chunks.flat();
            
            onProgress?.({
              stage: 'validating',
              progress: 85,
              current: allResults.length,
              total: allResults.length,
              message: 'Validating processed data...'
            });

            // Final validation
            const validResults = skipValidation ? allResults : this.validateDataPoints(allResults);
            
            onProgress?.({
              stage: 'complete',
              progress: 100,
              current: validResults.length,
              total: validResults.length,
              message: `Successfully loaded ${validResults.length} items`
            });

            const processingTime = Date.now() - startTime;
            console.log(`CSV processing completed in ${processingTime}ms: ${validResults.length} items`);
            
            resolve(validResults);
          } catch (error: any) {
            reject(new Error(`Failed to process CSV data: ${error.message}`));
          }
        },
        error: (error) => {
          reject(new Error(`CSV parsing failed: ${error.message}`));
        }
      });
    });
  }

  /**
   * Enhanced JSON parser with better error handling
   */
  static async loadJSONData(
    jsonContent: string,
    options: DataProcessingOptions = {},
    onProgress?: ProcessingCallback
  ): Promise<DataPoint[]> {
    const startTime = Date.now();
    const { chunkSize = this.CHUNK_SIZE, skipValidation = false } = options;

    onProgress?.({
      stage: 'loading',
      progress: 10,
      current: 0,
      total: 1,
      message: 'Parsing JSON...'
    });

    try {
      const data = JSON.parse(jsonContent);
      
      if (!Array.isArray(data)) {
        throw new Error('JSON must contain an array of items');
      }

      onProgress?.({
        stage: 'parsing',
        progress: 30,
        current: 0,
        total: data.length,
        message: `Processing ${data.length} items...`
      });

      const results: DataPoint[] = [];
      
      // Process in chunks for large datasets
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        
        chunk.forEach((item: any, index: number) => {
          try {
            const dataPoint: DataPoint = {
              id: item.id || `item_${i + index + 1}`,
              text: item.text || item.title || item.description || item.content || '',
              category: item.category || item.label || item.class || undefined,
              embedding: Array.isArray(item.embedding) ? item.embedding : undefined,
              metadata: item.metadata || this.extractMetadata(item)
            };

            if (dataPoint.text && dataPoint.text.length > 0) {
              results.push(dataPoint);
            }
          } catch (error) {
            if (!skipValidation) {
              console.warn(`Error processing item ${i + index}:`, error);
            }
          }
        });

        // Update progress
        const progress = 30 + ((i + chunkSize) / data.length) * 60;
        onProgress?.({
          stage: 'processing',
          progress: Math.min(progress, 90),
          current: i + chunkSize,
          total: data.length,
          message: `Processed ${Math.min(i + chunkSize, data.length)}/${data.length} items`
        });

        // Allow UI to update for large datasets
        if (results.length % 1000 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }

      onProgress?.({
        stage: 'complete',
        progress: 100,
        current: results.length,
        total: results.length,
        message: `Successfully loaded ${results.length} items`
      });

      const processingTime = Date.now() - startTime;
      console.log(`JSON processing completed in ${processingTime}ms: ${results.length} items`);
      
      return results;

    } catch (error: any) {
      throw new Error(`JSON parsing failed: ${error.message}`);
    }
  }

  /**
   * ENHANCED SEARCH FUNCTIONALITY
   */
  static searchNodes(
    nodes: GraphNode[],
    options: SearchOptions
  ): SearchResult[] {
    const {
      query,
      maxResults = 5,
      includeMetadata = true,
      caseSensitive = false,
      useSemanticSearch = false,
      semanticThreshold = 0.7,
      searchFields = ['text', 'category', 'metadata']
    } = options;

    if (!query || query.trim().length === 0) {
      return [];
    }

    const normalizedQuery = caseSensitive ? query : query.toLowerCase();
    const queryTerms = normalizedQuery.split(/\s+/).filter(term => term.length > 0);
    const results: SearchResult[] = [];

    for (const node of nodes) {
      const scores: number[] = [];
      const highlights: string[] = [];
      const matchTypes: SearchResult['matchType'][] = [];

      // Search in text field
      if (searchFields.includes('text')) {
        const textScore = this.scoreTextMatch(node.text, queryTerms, caseSensitive);
        if (textScore.score > 0) {
          scores.push(textScore.score);
          highlights.push(...textScore.highlights);
          matchTypes.push(textScore.isExact ? 'exact' : 'partial');
        }
      }

      // Search in category
      if (searchFields.includes('category') && node.category) {
        const categoryText = caseSensitive ? node.category : node.category.toLowerCase();
        if (queryTerms.some(term => categoryText.includes(term))) {
          scores.push(1.0);
          highlights.push(node.category);
          matchTypes.push('exact');
        }
      }

      // Search in metadata
      if (searchFields.includes('metadata') && includeMetadata && node.metadata) {
        const metadataScore = this.searchMetadata(node.metadata, queryTerms, caseSensitive);
        if (metadataScore.score > 0) {
          scores.push(metadataScore.score * 0.7); // Lower weight for metadata
          highlights.push(...metadataScore.highlights);
          matchTypes.push('metadata');
        }
      }

      // Semantic search using embeddings
      if (useSemanticSearch && node.embedding) {
        const semanticScore = this.calculateSemanticSimilarity(query, node, semanticThreshold);
        if (semanticScore > 0) {
          scores.push(semanticScore);
          matchTypes.push('semantic');
        }
      }

      // Calculate final score
      if (scores.length > 0) {
        const maxScore = Math.max(...scores);
        const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        const finalScore = (maxScore * 0.7) + (avgScore * 0.3); // Weighted combination

        results.push({
          node,
          score: finalScore,
          matchType: matchTypes.includes('exact') ? 'exact' : 
                   matchTypes.includes('semantic') ? 'semantic' :
                   matchTypes.includes('partial') ? 'partial' : 'metadata',
          matchedText: highlights.join(', '),
          highlights
        });
      }
    }

    // Sort by score and return top results
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }

  /**
   * Score text matching with highlighting
   */
  private static scoreTextMatch(
    text: string,
    queryTerms: string[],
    caseSensitive: boolean
  ): { score: number; highlights: string[]; isExact: boolean } {
    const normalizedText = caseSensitive ? text : text.toLowerCase();
    const highlights: string[] = [];
    let totalScore = 0;
    let exactMatches = 0;

    for (const term of queryTerms) {
      if (normalizedText.includes(term)) {
        const exactMatch = normalizedText === term;
        const startMatch = normalizedText.startsWith(term);
        const wordBoundaryMatch = new RegExp(`\\b${term}\\b`).test(normalizedText);
        
        if (exactMatch) {
          totalScore += 1.0;
          exactMatches++;
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
      highlights,
      isExact: exactMatches === queryTerms.length
    };
  }

  /**
   * Search within metadata fields
   */
  private static searchMetadata(
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

  /**
   * Calculate semantic similarity for search (requires embedding service)
   */
  private static calculateSemanticSimilarity(
    query: string,
    node: GraphNode,
    threshold: number
  ): number {
    // This would require generating an embedding for the search query
    // Implementation would involve:
    // 1. Generate embedding for search query using EmbeddingService
    // 2. Calculate cosine similarity with node embedding
    // 3. Return similarity if above threshold, 0 otherwise
    
    // For now, return 0 - this can be enhanced with actual semantic search
    // TODO: Implement semantic search when embedding service is available in search context
    return 0;
  }

  /**
   * Find similar nodes using embeddings (for recommendations)
   */
  static findSimilarNodes(
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
   * ENHANCED GRAPH GENERATION with adaptive strategies
   */
  static generateGraph(
    dataPoints: DataPoint[],
    strategy: ConnectionStrategy = 'adaptive',
    threshold: number = 0.7
  ): GraphData {
    const pointsWithEmbeddings = dataPoints.filter(point => point.embedding);
    
    if (pointsWithEmbeddings.length === 0) {
      return { nodes: [], links: [] };
    }

    // Create enhanced nodes
    const nodes: GraphNode[] = pointsWithEmbeddings.map(point => ({
      ...point,
      size: this.calculateNodeSize(point),
      color: this.getNodeColor(point)
    }));

    const links: GraphLink[] = [];

    // Apply enhanced connection strategies
    for (let i = 0; i < pointsWithEmbeddings.length; i++) {
      const sourcePoint = pointsWithEmbeddings[i];
      if (!sourcePoint.embedding) continue;

      const similarities: { index: number; similarity: number; targetId: string }[] = [];
      
      for (let j = 0; j < pointsWithEmbeddings.length; j++) {
        if (i === j) continue;
        const targetPoint = pointsWithEmbeddings[j];
        if (!targetPoint.embedding) continue;

        const similarity = this.calculateCosineSimilarity(sourcePoint.embedding, targetPoint.embedding);
        similarities.push({ index: j, similarity, targetId: targetPoint.id });
      }

      similarities.sort((a, b) => b.similarity - a.similarity);

      let selectedConnections: typeof similarities = [];

      switch (strategy) {
        case 'top3':
          selectedConnections = similarities.slice(0, 3);
          break;
          
        case 'top5':
          selectedConnections = similarities.slice(0, 5);
          break;

        case 'top10':
          selectedConnections = similarities.slice(0, 10);
          break;
          
        case 'threshold':
          selectedConnections = similarities.filter(s => s.similarity >= threshold);
          break;

        case 'adaptive':
          // Adaptive strategy: more connections for nodes with high similarity variance
          const avgSimilarity = similarities.slice(0, 10).reduce((sum, s) => sum + s.similarity, 0) / Math.min(10, similarities.length);
          const connectionCount = avgSimilarity > 0.7 ? 3 : avgSimilarity > 0.5 ? 5 : 7;
          selectedConnections = similarities.slice(0, connectionCount).filter(s => s.similarity > 0.3);
          break;

        case 'category_based':
          // Connect within category + best cross-category connections
          const sameCategory = similarities.filter(s => {
            const targetPoint = pointsWithEmbeddings[s.index];
            return targetPoint.category === sourcePoint.category;
          }).slice(0, 3);
          
          const differentCategory = similarities.filter(s => {
            const targetPoint = pointsWithEmbeddings[s.index];
            return targetPoint.category !== sourcePoint.category;
          }).slice(0, 2);
          
          selectedConnections = [...sameCategory, ...differentCategory];
          break;

        default:
          selectedConnections = similarities.slice(0, 5);
      }

      // Create links
      selectedConnections.forEach(conn => {
        const existingLink = links.find(link => 
          (link.source === sourcePoint.id && link.target === conn.targetId) ||
          (link.target === sourcePoint.id && link.source === conn.targetId)
        );

        if (!existingLink && conn.similarity > 0.05) {
          links.push({
            source: sourcePoint.id,
            target: conn.targetId,
            similarity: conn.similarity,
            distance: 30 + (1 - conn.similarity) * 120
          });
        }
      });
    }

    return { nodes, links };
  }

  /**
   * Calculate adaptive node size based on content and connections
   */
  private static calculateNodeSize(point: DataPoint): number {
    const baseSize = 8;
    const textLengthFactor = Math.log(point.text.length + 1) * 0.5;
    const metadataFactor = point.metadata ? Object.keys(point.metadata).length * 0.3 : 0;
    
    return Math.max(baseSize, Math.min(20, baseSize + textLengthFactor + metadataFactor));
  }

  /**
   * Enhanced node color assignment
   */
  private static getNodeColor(point: DataPoint): string {
    if (point.category) {
      return CATEGORY_COLORS[point.category as keyof typeof CATEGORY_COLORS] || CATEGORY_COLORS.default;
    }
    return CATEGORY_COLORS.default;
  }

  /**
   * Enhanced data validation
   */
  private static validateDataPoints(dataPoints: DataPoint[]): DataPoint[] {
    return dataPoints.filter(point => {
      if (!point.id || !point.text) return false;
      if (point.text.length < 3) return false; // Minimum text length
      if (point.embedding && !Array.isArray(point.embedding)) return false;
      return true;
    });
  }

  /**
   * Parse CSV row to DataPoint
   */
  private static parseRowToDataPoint(row: any, index: number): DataPoint {
    const point: DataPoint = {
      id: row.id || `item_${index + 1}`,
      text: (row.text || row.title || row.description || row.content || '').trim(),
      category: row.category?.trim() || row.label?.trim() || row.class?.trim() || undefined,
    };

    // Parse embedding
    if (row.embedding && typeof row.embedding === 'string') {
      try {
        point.embedding = JSON.parse(row.embedding);
      } catch (e) {
        console.warn(`Failed to parse embedding for item ${index}:`, e);
      }
    } else if (Array.isArray(row.embedding)) {
      point.embedding = row.embedding;
    }

    // Parse metadata
    if (row.metadata && typeof row.metadata === 'string') {
      try {
        point.metadata = JSON.parse(row.metadata);
      } catch (e) {
        point.metadata = { raw: row.metadata };
      }
    } else {
      point.metadata = this.extractMetadata(row);
    }

    return point;
  }

  /**
   * Extract metadata from unknown object structure
   */
  private static extractMetadata(item: any): Record<string, any> {
    const metadata: Record<string, any> = {};
    const excludeFields = ['id', 'text', 'title', 'description', 'content', 'category', 'label', 'class', 'embedding', 'metadata'];
    
    Object.keys(item).forEach(key => {
      if (!excludeFields.includes(key) && item[key] !== undefined && item[key] !== '') {
        metadata[key] = item[key];
      }
    });

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  static calculateCosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same length');
    }

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

    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }

    return dotProduct / (magnitude1 * magnitude2);
  }

  /**
   * Get enhanced statistics about the dataset
   */
  static getDataStats(dataPoints: DataPoint[]): DataStats {
    const startTime = Date.now();
    
    const stats: DataStats = {
      totalItems: dataPoints.length,
      withEmbeddings: dataPoints.filter(d => d.embedding).length,
      categories: [],
      averageTextLength: 0,
      fileSize: 0,
      embeddingDimensions: 0,
      processingTime: 0
    };

    if (dataPoints.length === 0) {
      return stats;
    }

    const categories = new Set<string>();
    let totalLength = 0;

    dataPoints.forEach(point => {
      if (point.category) {
        categories.add(point.category);
      }
      
      totalLength += this.combineTextForEmbedding(point).length;

      if (point.embedding && stats.embeddingDimensions === 0) {
        stats.embeddingDimensions = point.embedding.length;
      }
    });

    stats.categories = Array.from(categories);
    stats.averageTextLength = Math.round(totalLength / dataPoints.length);
    stats.processingTime = Date.now() - startTime;

    return stats;
  }

  /**
   * Combine text fields for embedding generation
   */
  static combineTextForEmbedding(dataPoint: DataPoint): string {
    let text = dataPoint.text || '';
    
    if (dataPoint.category) {
      text = `Category: ${dataPoint.category}. ${text}`;
    }

    if (dataPoint.metadata) {
      const relevantFields = ['title', 'description', 'summary', 'content', 'tags'];
      relevantFields.forEach(field => {
        if (dataPoint.metadata![field] && typeof dataPoint.metadata![field] === 'string') {
          text += ` ${dataPoint.metadata![field]}`;
        }
      });
    }

    return text.trim();
  }

  /**
   * Export data with various format options
   */
  static exportData(
    dataPoints: DataPoint[], 
    format: 'json' | 'csv' = 'json',
    includeEmbeddings: boolean = true
  ): string {
    const dataToExport = includeEmbeddings 
      ? dataPoints.filter(d => d.embedding)
      : dataPoints;
    
    if (format === 'json') {
      return JSON.stringify(dataToExport, null, 2);
    } else {
      const headers = ['id', 'text', 'category'];
      if (includeEmbeddings) headers.push('embedding');
      headers.push('metadata');
      
      const rows = [headers.join(',')];
      
      dataToExport.forEach(point => {
        const row = [
          `"${point.id}"`,
          `"${point.text.replace(/"/g, '""')}"`,
          `"${point.category || ''}"`
        ];
        
        if (includeEmbeddings) {
          row.push(`"${JSON.stringify(point.embedding || [])}"`);
        }
        
        row.push(`"${JSON.stringify(point.metadata || {})}"`);
        rows.push(row.join(','));
      });
      
      return rows.join('\n');
    }
  }
}