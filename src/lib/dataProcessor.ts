import Papa from 'papaparse';
import { DataPoint, GraphData, GraphNode, GraphLink, ConnectionStrategy, SimilarityPair, CATEGORY_COLORS } from '@/types';

export class DataProcessor {
  /**
   * Parse CSV content into DataPoint array
   */
  static async loadCSVData(csvContent: string): Promise<DataPoint[]> {
    return new Promise((resolve, reject) => {
      Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            const articles: DataPoint[] = results.data.map((row: any, index: number) => {
              const point: DataPoint = {
                id: row.id || `item_${index + 1}`,
                text: row.text?.trim() || row.title?.trim() || row.description?.trim() || '',
                category: row.category?.trim() || undefined,
              };

              // Parse embedding if exists
              if (row.embedding && typeof row.embedding === 'string') {
                try {
                  point.embedding = JSON.parse(row.embedding);
                } catch (e) {
                  console.warn(`Failed to parse embedding for item ${index}:`, e);
                }
              }

              // Parse metadata if exists
              if (row.metadata && typeof row.metadata === 'string') {
                try {
                  point.metadata = JSON.parse(row.metadata);
                } catch (e) {
                  // If metadata parsing fails, store as string
                  point.metadata = { raw: row.metadata };
                }
              }

              // Add any other fields as metadata
              const excludeFields = ['id', 'text', 'title', 'description', 'category', 'embedding', 'metadata'];
              const otherFields = Object.keys(row).filter(key => !excludeFields.includes(key));
              if (otherFields.length > 0) {
                if (!point.metadata) point.metadata = {};
                otherFields.forEach(field => {
                  if (point.metadata && row[field] !== undefined && row[field] !== '') {
                    point.metadata[field] = row[field];
                  }
                });
              }

              return point;
            });

            // Filter out invalid entries
            const validArticles = articles.filter(article => 
              article.text && article.text.length > 0
            );

            resolve(validArticles);
          } catch (error) {
            reject(new Error(`Error processing CSV data: ${error}`));
          }
        },
        error: (error) => {
          reject(new Error(`Error parsing CSV: ${error.message}`));
        }
      });
    });
  }

  /**
   * Parse JSON content into DataPoint array
   */
  static async loadJSONData(jsonContent: string): Promise<DataPoint[]> {
    try {
      const data = JSON.parse(jsonContent);
      
      if (!Array.isArray(data)) {
        throw new Error('JSON must contain an array of items');
      }

      return data.map((item: any, index: number) => ({
        id: item.id || `item_${index + 1}`,
        text: item.text || item.title || item.description || '',
        category: item.category || undefined,
        embedding: item.embedding || undefined,
        metadata: item.metadata || undefined
      })).filter(item => item.text && item.text.length > 0);
    } catch (error) {
      throw new Error(`Error parsing JSON: ${error}`);
    }
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
   * MAIN GRAPH GENERATION METHOD - EASY TO HACK!
   * 
   * This is where you can easily modify connection strategies.
   * Add new strategies by modifying the switch statement below.
   */
  static generateGraph(
    dataPoints: DataPoint[],
    strategy: ConnectionStrategy = 'top5',
    threshold: number = 0.7
  ): GraphData {
    // Filter points that have embeddings
    const pointsWithEmbeddings = dataPoints.filter(point => point.embedding);
    
    if (pointsWithEmbeddings.length === 0) {
      return { nodes: [], links: [] };
    }

    // Create nodes with additional properties for visualization
    const nodes: GraphNode[] = pointsWithEmbeddings.map(point => ({
      ...point,
      size: Math.max(8, Math.min(16, Math.sqrt(point.text.length) + 6)),
      color: point.category ? CATEGORY_COLORS[point.category as keyof typeof CATEGORY_COLORS] || CATEGORY_COLORS.default : CATEGORY_COLORS.default
    }));

    const links: GraphLink[] = [];

    // Generate connections for each node
    for (let i = 0; i < pointsWithEmbeddings.length; i++) {
      const sourcePoint = pointsWithEmbeddings[i];
      if (!sourcePoint.embedding) continue;

      // Calculate similarities to all other points
      const similarities: { index: number; similarity: number; targetId: string }[] = [];
      
      for (let j = 0; j < pointsWithEmbeddings.length; j++) {
        if (i === j) continue;
        const targetPoint = pointsWithEmbeddings[j];
        if (!targetPoint.embedding) continue;

        const similarity = this.calculateCosineSimilarity(sourcePoint.embedding, targetPoint.embedding);
        similarities.push({ 
          index: j, 
          similarity, 
          targetId: targetPoint.id 
        });
      }

      // Sort by similarity (highest first)
      similarities.sort((a, b) => b.similarity - a.similarity);

      // Apply connection strategy - THIS IS WHERE YOU CAN EASILY HACK!
      let selectedConnections: typeof similarities = [];

      switch (strategy) {
        case 'top3':
          selectedConnections = similarities.slice(0, 3);
          break;
          
        case 'top5':
          selectedConnections = similarities.slice(0, 5);
          break;
          
        case 'threshold':
          selectedConnections = similarities.filter(s => s.similarity >= threshold);
          break;

        // ADD YOUR CUSTOM STRATEGIES HERE:
        // case 'custom_strategy':
        //   selectedConnections = similarities.filter(s => yourCustomLogic(s));
        //   break;
        
        // case 'category_based':
        //   selectedConnections = similarities.filter(s => {
        //     const targetPoint = pointsWithEmbeddings[s.index];
        //     return targetPoint.category === sourcePoint.category && s.similarity > 0.5;
        //   });
        //   break;

        // case 'smart_clustering':
        //   // Example: Connect to top 2 within category + top 1 outside category
        //   const sameCategory = similarities.filter(s => {
        //     const targetPoint = pointsWithEmbeddings[s.index];
        //     return targetPoint.category === sourcePoint.category;
        //   }).slice(0, 2);
        //   
        //   const differentCategory = similarities.filter(s => {
        //     const targetPoint = pointsWithEmbeddings[s.index];
        //     return targetPoint.category !== sourcePoint.category;
        //   }).slice(0, 1);
        //   
        //   selectedConnections = [...sameCategory, ...differentCategory];
        //   break;

        default:
          selectedConnections = similarities.slice(0, 5);
      }

      // Create links for selected connections
      selectedConnections.forEach(conn => {
        // Avoid duplicate links
        const existingLink = links.find(link => 
          (link.source === sourcePoint.id && link.target === conn.targetId) ||
          (link.target === sourcePoint.id && link.source === conn.targetId)
        );

        if (!existingLink && conn.similarity > 0.05) { // Minimum similarity filter
          links.push({
            source: sourcePoint.id,
            target: conn.targetId,
            similarity: conn.similarity,
            distance: 50 + (1 - conn.similarity) * 150 // Closer for more similar
          });
        }
      });
    }

    return { nodes, links };
  }

  /**
   * Find similar pairs across all data points
   */
  static findSimilarPairs(
    dataPoints: DataPoint[], 
    threshold: number = 0.7
  ): SimilarityPair[] {
    const pairs: SimilarityPair[] = [];

    for (let i = 0; i < dataPoints.length; i++) {
      for (let j = i + 1; j < dataPoints.length; j++) {
        const point1 = dataPoints[i];
        const point2 = dataPoints[j];

        if (!point1.embedding || !point2.embedding) {
          continue;
        }

        const similarity = this.calculateCosineSimilarity(
          point1.embedding,
          point2.embedding
        );

        if (similarity >= threshold) {
          pairs.push({
            id1: point1.id,
            id2: point2.id,
            similarity
          });
        }
      }
    }

    return pairs.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Combine text fields for embedding generation
   */
  static combineTextForEmbedding(dataPoint: DataPoint): string {
    let text = dataPoint.text || '';
    
    // Add category if available
    if (dataPoint.category) {
      text = `Category: ${dataPoint.category}. ${text}`;
    }

    // Add relevant metadata
    if (dataPoint.metadata) {
      const relevantFields = ['title', 'description', 'summary', 'content'];
      relevantFields.forEach(field => {
        if (dataPoint.metadata![field] && typeof dataPoint.metadata![field] === 'string') {
          text += ` ${dataPoint.metadata![field]}`;
        }
      });
    }

    return text.trim();
  }

  /**
   * Get statistics about the dataset
   */
  static getDataStats(dataPoints: DataPoint[]) {
    const stats = {
      total: dataPoints.length,
      byCategory: {} as Record<string, number>,
      withEmbeddings: dataPoints.filter(d => d.embedding).length,
      averageTextLength: 0,
      categories: new Set<string>(),
      embeddingDimensions: 0
    };

    if (dataPoints.length === 0) {
      return stats;
    }

    let totalLength = 0;
    dataPoints.forEach(point => {
      // Count by category
      if (point.category) {
        stats.byCategory[point.category] = (stats.byCategory[point.category] || 0) + 1;
        stats.categories.add(point.category);
      }
      
      // Calculate text length
      const textLength = this.combineTextForEmbedding(point).length;
      totalLength += textLength;

      // Get embedding dimensions
      if (point.embedding && stats.embeddingDimensions === 0) {
        stats.embeddingDimensions = point.embedding.length;
      }
    });

    stats.averageTextLength = Math.round(totalLength / dataPoints.length);

    return stats;
  }

  /**
   * Export data with embeddings
   */
  static exportData(dataPoints: DataPoint[], format: 'json' | 'csv' = 'json'): string {
    const dataWithEmbeddings = dataPoints.filter(d => d.embedding);
    
    if (format === 'json') {
      return JSON.stringify(dataWithEmbeddings, null, 2);
    } else {
      // CSV format
      const headers = ['id', 'text', 'category', 'embedding', 'metadata'];
      const rows = [headers.join(',')];
      
      dataWithEmbeddings.forEach(point => {
        const row = [
          `"${point.id}"`,
          `"${point.text.replace(/"/g, '""')}"`,
          `"${point.category || ''}"`,
          `"${JSON.stringify(point.embedding)}"`,
          `"${JSON.stringify(point.metadata || {})}"`
        ];
        rows.push(row.join(','));
      });
      
      return rows.join('\n');
    }
  }
}