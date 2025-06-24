import { DataPoint, ProgressCallback } from '@/types';
import { DataProcessor } from './dataProcessor';

interface OpenAIEmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export class EmbeddingService {
  private apiKey: string;
  private readonly MODEL = 'text-embedding-3-small'; // Cheaper and faster
  private readonly MAX_BATCH_SIZE = 50; // OpenAI API limit
  private readonly MAX_RETRIES = 3;
  private readonly RATE_LIMIT_DELAY = 200; // ms between requests

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Generate embeddings for multiple texts with progress tracking
   */
  async generateEmbeddings(
    texts: string[],
    onProgress?: ProgressCallback
  ): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const results: number[][] = [];
    const batches = this.createBatches(texts, this.MAX_BATCH_SIZE);
    
    onProgress?.(0, 'Starting embedding generation...');

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const startIndex = i * this.MAX_BATCH_SIZE;
      
      onProgress?.(
        (i / batches.length) * 90, // Leave 10% for completion
        `Processing batch ${i + 1}/${batches.length} (${batch.length} items)`
      );

      let retries = 0;
      let batchResults: number[][] = [];

      while (retries < this.MAX_RETRIES) {
        try {
          batchResults = await this.processBatch(batch);
          break; // Success!
        } catch (error: any) {
          retries++;
          
          if (retries >= this.MAX_RETRIES) {
            throw new Error(
              `Failed to process batch ${i + 1} after ${this.MAX_RETRIES} retries: ${error.message}`
            );
          }

          // Exponential backoff
          const delay = Math.pow(2, retries) * 1000;
          onProgress?.(
            (i / batches.length) * 90,
            `Retrying batch ${i + 1} (attempt ${retries + 1}/${this.MAX_RETRIES})...`
          );
          
          await this.delay(delay);
        }
      }

      results.push(...batchResults);

      // Rate limiting between batches
      if (i < batches.length - 1) {
        await this.delay(this.RATE_LIMIT_DELAY);
      }
    }

    onProgress?.(100, 'Embedding generation complete!');
    return results;
  }

  /**
   * Process a single batch of texts
   */
  private async processBatch(texts: string[]): Promise<number[][]> {
    // Clean and validate texts
    const cleanTexts = texts
      .map(text => text.replace(/\n/g, ' ').trim())
      .filter(text => text.length > 0);

    if (cleanTexts.length === 0) {
      return [];
    }

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.MODEL,
          input: cleanTexts,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please try again in a moment.');
        } else if (response.status === 401) {
          throw new Error('Invalid API key. Please check your OpenAI API key.');
        } else if (response.status === 400) {
          throw new Error(`Bad request: ${errorData.error?.message || 'Invalid request format'}`);
        } else {
          throw new Error(`API error (${response.status}): ${errorData.error?.message || 'Unknown error'}`);
        }
      }

      const data: OpenAIEmbeddingResponse = await response.json();
      
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Invalid response format from OpenAI API');
      }

      // Sort by index to maintain order
      const sortedData = data.data.sort((a, b) => a.index - b.index);
      return sortedData.map(item => item.embedding);

    } catch (error: any) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Network error. Please check your internet connection.');
      }
      throw error;
    }
  }

  /**
   * Process DataPoints and add embeddings
   */
  async processDataPointsWithEmbeddings(
    dataPoints: DataPoint[],
    onProgress?: ProgressCallback
  ): Promise<DataPoint[]> {
    if (dataPoints.length === 0) {
      return [];
    }

    const result: DataPoint[] = [...dataPoints];
    
    try {
      onProgress?.(5, 'Preparing texts for embedding...');
      
      // Prepare texts using the combineTextForEmbedding method
      const texts = dataPoints.map(point => 
        DataProcessor.combineTextForEmbedding(point)
      );

      onProgress?.(10, 'Generating embeddings...');

      // Generate embeddings with progress tracking
      const embeddings = await this.generateEmbeddings(texts, (progress, status) => {
        // Map progress from 10-95%
        const mappedProgress = 10 + (progress * 0.85);
        onProgress?.(mappedProgress, status);
      });

      onProgress?.(95, 'Assigning embeddings to data points...');

      // Assign embeddings to data points
      for (let i = 0; i < result.length; i++) {
        if (i < embeddings.length) {
          result[i] = {
            ...result[i],
            embedding: embeddings[i]
          };
        }
      }

      // Validate results
      const successCount = result.filter(point => point.embedding).length;
      if (successCount !== dataPoints.length) {
        console.warn(`Only ${successCount}/${dataPoints.length} data points received embeddings`);
      }

      onProgress?.(100, `Successfully generated ${successCount} embeddings!`);
      return result;

    } catch (error: any) {
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }

  /**
   * Estimate cost for embedding generation
   */
  async estimateCost(textCount: number, sampleTexts?: string[]): Promise<{
    tokens: number;
    cost: number;
    costPerItem: number;
  }> {
    // Use sample texts for better estimation, or use conservative defaults
    let avgTokensPerText = 75; // Conservative default
    
    if (sampleTexts && sampleTexts.length > 0) {
      // Rough estimation: ~0.75 tokens per word
      const avgWords = sampleTexts
        .slice(0, 10) // Sample first 10
        .reduce((sum, text) => sum + text.split(/\s+/).length, 0) / 
        Math.min(sampleTexts.length, 10);
      
      avgTokensPerText = Math.ceil(avgWords * 0.75);
    }

    const totalTokens = textCount * avgTokensPerText;
    
    // text-embedding-3-small pricing: $0.00002 per 1K tokens
    const costPer1KTokens = 0.00002;
    const totalCost = (totalTokens / 1000) * costPer1KTokens;
    const costPerItem = totalCost / textCount;

    return {
      tokens: totalTokens,
      cost: Math.round(totalCost * 100000) / 100000, // Round to 5 decimal places
      costPerItem: Math.round(costPerItem * 100000) / 100000
    };
  }

  /**
   * Get embedding statistics for a dataset
   */
  getEmbeddingStats(dataPoints: DataPoint[]) {
    const withEmbeddings = dataPoints.filter(point => point.embedding);
    const dimensions = withEmbeddings.length > 0 ? withEmbeddings[0].embedding?.length || 0 : 0;

    return {
      total: dataPoints.length,
      withEmbeddings: withEmbeddings.length,
      withoutEmbeddings: dataPoints.length - withEmbeddings.length,
      dimensions,
      completionRate: dataPoints.length > 0 ? Math.round((withEmbeddings.length / dataPoints.length) * 100) : 0,
      isComplete: withEmbeddings.length === dataPoints.length && dataPoints.length > 0
    };
  }

  /**
   * Validate API key format
   */
  static validateApiKey(apiKey: string): boolean {
    return apiKey.startsWith('sk-') && apiKey.length > 20;
  }

  /**
   * Create batches from array
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Delay utility for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}