import OpenAI from 'openai';
import { NewsArticle, EmbeddingJob } from '@/types';
import { DataProcessor } from './dataProcessor';

export class EmbeddingService {
  private openai: OpenAI;
  private readonly MODEL = 'text-embedding-3-small'; // Cheaper and faster than ada-002
  private readonly MAX_BATCH_SIZE = 50; // OpenAI limit
  private readonly MAX_RETRIES = 3;

  constructor(apiKey: string) {
    this.openai = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true // Note: In production, do this server-side
    });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: this.MODEL,
        input: text.replace(/\n/g, ' ').trim(),
      });

      return response.data[0].embedding;
    } catch (error: any) {
      if (error?.status === 429) {
        // Rate limit hit, wait and retry
        await this.delay(1000);
        throw new Error('Rate limit exceeded');
      }
      throw new Error(`OpenAI API error: ${error?.message || 'Unknown error'}`);
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    try {
      // Clean texts
      const cleanTexts = texts.map(text => 
        text.replace(/\n/g, ' ').trim()
      ).filter(text => text.length > 0);

      if (cleanTexts.length === 0) return [];

      const response = await this.openai.embeddings.create({
        model: this.MODEL,
        input: cleanTexts,
      });

      return response.data.map(item => item.embedding);
    } catch (error: any) {
      if (error?.status === 429) {
        await this.delay(1000);
        throw new Error('Rate limit exceeded');
      }
      throw new Error(`OpenAI API error: ${error?.message || 'Unknown error'}`);
    }
  }

  async processArticlesWithEmbeddings(
    articles: NewsArticle[],
    onProgress?: (progress: number, status: string) => void
  ): Promise<NewsArticle[]> {
    const result: NewsArticle[] = [...articles];
    
    try {
      // Prepare texts for embedding
      const texts = articles.map(article => 
        DataProcessor.combineTextForEmbedding(article)
      );

      onProgress?.(10, 'Preparing texts...');

      // Process in batches to avoid rate limits
      const batches = this.createBatches(texts, this.MAX_BATCH_SIZE);
      let processedCount = 0;

      onProgress?.(20, `Processing ${batches.length} batches...`);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        let retries = 0;
        let batchEmbeddings: number[][] = [];

        while (retries < this.MAX_RETRIES) {
          try {
            onProgress?.(
              20 + (60 * (i + 1)) / batches.length,
              `Processing batch ${i + 1}/${batches.length}...`
            );

            batchEmbeddings = await this.generateEmbeddings(batch);
            break; // Success, exit retry loop
          } catch (error: any) {
            retries++;
            if (retries >= this.MAX_RETRIES) {
              throw new Error(`Failed to process batch ${i + 1} after ${this.MAX_RETRIES} retries: ${error.message}`);
            }
            
            // Exponential backoff
            await this.delay(Math.pow(2, retries) * 1000);
            onProgress?.(
              20 + (60 * i) / batches.length,
              `Retrying batch ${i + 1}... (attempt ${retries + 1})`
            );
          }
        }

        // Assign embeddings to articles
        for (let j = 0; j < batch.length; j++) {
          const articleIndex = processedCount + j;
          if (articleIndex < result.length && j < batchEmbeddings.length) {
            result[articleIndex].embedding = batchEmbeddings[j];
          }
        }

        processedCount += batch.length;

        // Add delay between batches to be nice to the API
        if (i < batches.length - 1) {
          await this.delay(200);
        }
      }

      onProgress?.(90, 'Calculating similarities...');

      // Validate all embeddings were generated
      const articlesWithEmbeddings = result.filter(article => article.embedding);
      if (articlesWithEmbeddings.length !== articles.length) {
        console.warn(`Only ${articlesWithEmbeddings.length}/${articles.length} articles got embeddings`);
      }

      onProgress?.(100, 'Complete!');
      return result;

    } catch (error: any) {
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async estimateCost(textCount: number): Promise<{ tokens: number; cost: number }> {
    // Rough estimation: ~750 words = 1000 tokens
    // text-embedding-3-small: $0.00002 / 1K tokens
    const avgWordsPerText = 50; // Conservative estimate for news titles + descriptions
    const avgTokensPerText = Math.ceil((avgWordsPerText * 4) / 3); // ~67 tokens per text
    const totalTokens = textCount * avgTokensPerText;
    const cost = (totalTokens / 1000) * 0.00002; // $0.00002 per 1K tokens

    return {
      tokens: totalTokens,
      cost: Math.round(cost * 10000) / 10000 // Round to 4 decimal places
    };
  }

  getEmbeddingStats(articles: NewsArticle[]) {
    const withEmbeddings = articles.filter(a => a.embedding);
    const dimensions = withEmbeddings.length > 0 ? withEmbeddings[0].embedding?.length || 0 : 0;

    return {
      total: articles.length,
      withEmbeddings: withEmbeddings.length,
      dimensions,
      completionRate: Math.round((withEmbeddings.length / articles.length) * 100)
    };
  }
}