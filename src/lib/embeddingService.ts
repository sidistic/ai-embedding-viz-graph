import { DataPoint, ProgressCallback, ProcessingProgress } from '@/types';
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

interface ProcessingSession {
  id: string;
  totalItems: number;
  processedItems: number;
  embeddings: number[][];
  errors: string[];
  startTime: number;
  estimatedCost: number;
}

export class EmbeddingService {
  private apiKey: string;
  private readonly MODEL = 'text-embedding-3-small'; // Cheaper and faster
  private readonly MAX_BATCH_SIZE = 50; // OpenAI API limit
  private readonly MAX_RETRIES = 3;
  private readonly RATE_LIMIT_DELAY = 200; // ms between requests
  private readonly MAX_CONCURRENT_REQUESTS = 3; // Parallel processing limit
  
  // Session management for large datasets
  private currentSession: ProcessingSession | null = null;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Enhanced processing for DataPoints with session management
   */
  async processDataPointsWithEmbeddings(
    dataPoints: DataPoint[],
    onProgress?: (progress: ProcessingProgress) => void
  ): Promise<DataPoint[]> {
    if (dataPoints.length === 0) {
      return [];
    }

    const sessionId = `session_${Date.now()}`;
    const startTime = Date.now();

    try {
      // Initialize session
      this.currentSession = {
        id: sessionId,
        totalItems: dataPoints.length,
        processedItems: 0,
        embeddings: [],
        errors: [],
        startTime,
        estimatedCost: 0
      };

      onProgress?.({
        stage: 'loading',
        progress: 5,
        current: 0,
        total: dataPoints.length,
        message: 'Initializing embedding generation...'
      });

      // Estimate cost
      const texts = dataPoints.map(point => DataProcessor.combineTextForEmbedding(point));
      const costEstimate = await this.estimateCost(texts.length, texts.slice(0, 10));
      this.currentSession.estimatedCost = costEstimate.cost;

      // Warn for large datasets
      if (dataPoints.length > 1000) {
        console.log(`Processing large dataset: ${dataPoints.length} items, estimated cost: $${costEstimate.cost.toFixed(4)}`);
      }

      onProgress?.({
        stage: 'processing',
        progress: 10,
        current: 0,
        total: dataPoints.length,
        message: `Generating embeddings (estimated cost: $${costEstimate.cost.toFixed(4)})...`
      });

      // Generate embeddings with advanced chunking
      const embeddings = await this.generateEmbeddingsAdvanced(texts, (progress, status) => {
        const mappedProgress = 10 + (progress * 0.80); // Map to 10-90%
        this.currentSession!.processedItems = Math.floor((progress / 100) * dataPoints.length);
        
        onProgress?.({
          stage: 'processing',
          progress: mappedProgress,
          current: this.currentSession!.processedItems,
          total: dataPoints.length,
          message: status
        });
      });

      onProgress?.({
        stage: 'processing',
        progress: 95,
        current: dataPoints.length,
        total: dataPoints.length,
        message: 'Assigning embeddings to data points...'
      });

      // Assign embeddings to data points
      const result: DataPoint[] = dataPoints.map((point, index) => ({
        ...point,
        embedding: index < embeddings.length ? embeddings[index] : undefined
      }));

      // Validate results
      const successCount = result.filter(point => point.embedding).length;
      const failureCount = dataPoints.length - successCount;

      if (failureCount > 0) {
        console.warn(`${failureCount} items failed to get embeddings`);
      }

      const processingTime = Date.now() - startTime;
      const actualCost = (successCount / 1000) * 0.00002; // Rough calculation

      onProgress?.({
        stage: 'complete',
        progress: 100,
        current: successCount,
        total: dataPoints.length,
        message: `Complete! Generated ${successCount} embeddings in ${(processingTime / 1000).toFixed(1)}s`
      });

      // Log session summary
      console.log('Embedding session completed:', {
        sessionId,
        totalItems: dataPoints.length,
        successfulEmbeddings: successCount,
        failedEmbeddings: failureCount,
        processingTimeMs: processingTime,
        estimatedCost: costEstimate.cost,
        actualCost
      });

      return result;

    } catch (error: any) {
      console.error('Embedding generation failed:', error);
      throw new Error(`Embedding generation failed: ${error.message}`);
    } finally {
      this.currentSession = null;
    }
  }

  /**
   * Advanced embedding generation with parallel processing and better error handling
   */
  private async generateEmbeddingsAdvanced(
    texts: string[],
    onProgress?: ProgressCallback
  ): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const results: number[][] = new Array(texts.length);
    const batches = this.createBatches(texts, this.MAX_BATCH_SIZE);
    const totalBatches = batches.length;
    
    onProgress?.(0, 'Starting embedding generation...');

    // Process batches with controlled concurrency
    const concurrentLimit = Math.min(this.MAX_CONCURRENT_REQUESTS, totalBatches);
    const batchQueues: Promise<void>[] = [];
    let completedBatches = 0;
    let batchIndex = 0;

    // Create worker functions for concurrent processing
    const processBatchWorker = async (): Promise<void> => {
      while (batchIndex < totalBatches) {
        const currentBatchIndex = batchIndex++;
        const batch = batches[currentBatchIndex];
        const startIndex = currentBatchIndex * this.MAX_BATCH_SIZE;
        
        let retries = 0;
        let batchResults: number[][] = [];

        while (retries < this.MAX_RETRIES) {
          try {
            onProgress?.(
              (completedBatches / totalBatches) * 90,
              `Processing batch ${currentBatchIndex + 1}/${totalBatches} (${batch.length} items)`
            );

            batchResults = await this.processBatch(batch);
            
            // Store results in correct positions
            batchResults.forEach((embedding, localIndex) => {
              results[startIndex + localIndex] = embedding;
            });

            break; // Success!

          } catch (error: any) {
            retries++;
            
            if (retries >= this.MAX_RETRIES) {
              console.error(`Batch ${currentBatchIndex + 1} failed after ${this.MAX_RETRIES} retries:`, error);
              
              // Fill with null embeddings for failed items
              for (let i = 0; i < batch.length; i++) {
                results[startIndex + i] = [];
              }
              break;
            }

            // Exponential backoff
            const delay = Math.pow(2, retries) * 1000;
            onProgress?.(
              (completedBatches / totalBatches) * 90,
              `Retrying batch ${currentBatchIndex + 1} (attempt ${retries + 1}/${this.MAX_RETRIES})...`
            );
            
            await this.delay(delay);
          }
        }

        completedBatches++;
        
        // Rate limiting between batches
        if (batchIndex < totalBatches) {
          await this.delay(this.RATE_LIMIT_DELAY);
        }
      }
    };

    // Start concurrent workers
    for (let i = 0; i < concurrentLimit; i++) {
      batchQueues.push(processBatchWorker());
    }

    // Wait for all workers to complete
    await Promise.all(batchQueues);

    onProgress?.(100, 'Embedding generation complete!');
    
    // Filter out failed embeddings
    return results.filter(embedding => embedding.length > 0);
  }

  /**
   * Process a single batch with enhanced error handling
   */
  private async processBatch(texts: string[]): Promise<number[][]> {
    // Clean and validate texts
    const cleanTexts = texts
      .map(text => text.replace(/\n/g, ' ').trim())
      .filter(text => text.length > 0)
      .map(text => text.substring(0, 8000)); // Truncate very long texts

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
          encoding_format: 'float'
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
        } else if (response.status >= 500) {
          throw new Error(`Server error (${response.status}): Please try again later`);
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
   * Enhanced cost estimation with better accuracy
   */
  async estimateCost(textCount: number, sampleTexts?: string[]): Promise<{
    tokens: number;
    cost: number;
    costPerItem: number;
    processingTime: number;
  }> {
    // Use sample texts for better estimation, or use conservative defaults
    let avgTokensPerText = 75; // Conservative default
    
    if (sampleTexts && sampleTexts.length > 0) {
      // More accurate estimation using sample texts
      const sampleWordCounts = sampleTexts
        .slice(0, Math.min(20, sampleTexts.length))
        .map(text => text.split(/\s+/).length);
      
      const avgWords = sampleWordCounts.reduce((sum, count) => sum + count, 0) / sampleWordCounts.length;
      
      // Better token estimation: ~0.75 tokens per word for English
      avgTokensPerText = Math.ceil(avgWords * 0.75);
      
      // Account for longer texts having slightly fewer tokens per word
      if (avgWords > 100) {
        avgTokensPerText = Math.ceil(avgTokensPerText * 0.9);
      }
    }

    const totalTokens = textCount * avgTokensPerText;
    
    // text-embedding-3-small pricing: $0.00002 per 1K tokens
    const costPer1KTokens = 0.00002;
    const totalCost = (totalTokens / 1000) * costPer1KTokens;
    const costPerItem = totalCost / textCount;

    // Estimate processing time (rough calculation)
    const estimatedProcessingTime = Math.ceil((textCount / this.MAX_BATCH_SIZE) * 2); // ~2 seconds per batch

    return {
      tokens: totalTokens,
      cost: Math.round(totalCost * 100000) / 100000, // Round to 5 decimal places
      costPerItem: Math.round(costPerItem * 100000) / 100000,
      processingTime: estimatedProcessingTime
    };
  }

  /**
   * Generate embeddings for search queries (single or small batch)
   */
  async generateSearchEmbedding(query: string): Promise<number[]> {
    try {
      const embeddings = await this.generateEmbeddings([query]);
      return embeddings[0] || [];
    } catch (error: any) {
      console.error('Search embedding generation failed:', error);
      throw new Error(`Failed to generate search embedding: ${error.message}`);
    }
  }

  /**
   * Basic embedding generation (for compatibility)
   */
  async generateEmbeddings(texts: string[], onProgress?: ProgressCallback): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const results: number[][] = [];
    const batches = this.createBatches(texts, this.MAX_BATCH_SIZE);
    
    onProgress?.(0, 'Starting embedding generation...');

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      onProgress?.(
        (i / batches.length) * 90,
        `Processing batch ${i + 1}/${batches.length} (${batch.length} items)`
      );

      let retries = 0;
      let batchResults: number[][] = [];

      while (retries < this.MAX_RETRIES) {
        try {
          batchResults = await this.processBatch(batch);
          break;
        } catch (error: any) {
          retries++;
          
          if (retries >= this.MAX_RETRIES) {
            throw new Error(`Failed to process batch ${i + 1} after ${this.MAX_RETRIES} retries: ${error.message}`);
          }

          const delay = Math.pow(2, retries) * 1000;
          await this.delay(delay);
        }
      }

      results.push(...batchResults);

      if (i < batches.length - 1) {
        await this.delay(this.RATE_LIMIT_DELAY);
      }
    }

    onProgress?.(100, 'Embedding generation complete!');
    return results;
  }

  /**
   * Get session information (useful for monitoring large processing jobs)
   */
  getSessionInfo(): ProcessingSession | null {
    return this.currentSession;
  }

  /**
   * Cancel current processing session
   */
  cancelSession(): void {
    if (this.currentSession) {
      console.log(`Canceling session ${this.currentSession.id}`);
      this.currentSession = null;
    }
  }

  /**
   * Get embedding statistics for a dataset
   */
  getEmbeddingStats(dataPoints: DataPoint[]) {
    const withEmbeddings = dataPoints.filter(point => point.embedding);
    const dimensions = withEmbeddings.length > 0 ? withEmbeddings[0].embedding?.length || 0 : 0;

    // Calculate quality metrics
    const avgEmbeddingMagnitude = withEmbeddings.length > 0 
      ? withEmbeddings.reduce((sum, point) => {
          const magnitude = Math.sqrt(point.embedding!.reduce((s, v) => s + v * v, 0));
          return sum + magnitude;
        }, 0) / withEmbeddings.length
      : 0;

    return {
      total: dataPoints.length,
      withEmbeddings: withEmbeddings.length,
      withoutEmbeddings: dataPoints.length - withEmbeddings.length,
      dimensions,
      completionRate: dataPoints.length > 0 ? Math.round((withEmbeddings.length / dataPoints.length) * 100) : 0,
      isComplete: withEmbeddings.length === dataPoints.length && dataPoints.length > 0,
      avgMagnitude: Math.round(avgEmbeddingMagnitude * 1000) / 1000,
      qualityScore: avgEmbeddingMagnitude > 0.1 ? 'Good' : avgEmbeddingMagnitude > 0.05 ? 'Fair' : 'Poor'
    };
  }

  /**
   * Validate API key format and test connection
   */
  static validateApiKey(apiKey: string): boolean {
    return apiKey.startsWith('sk-') && apiKey.length > 20;
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<{ success: boolean; model?: string; error?: string }> {
    try {
      const testEmbedding = await this.generateEmbeddings(['test connection']);
      return {
        success: true,
        model: this.MODEL
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
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