import Papa from 'papaparse';
import { NewsArticle, AG_NEWS_CATEGORIES, SimilarityPair } from '@/types';

export class DataProcessor {
  static async loadCSVData(csvContent: string): Promise<NewsArticle[]> {
    return new Promise((resolve, reject) => {
      Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            const articles: NewsArticle[] = results.data.map((row: any, index: number) => ({
              id: `article_${index + 1}`,
              title: row.title?.trim() || '',
              description: row.description?.trim() || '',
              category: AG_NEWS_CATEGORIES[row.class as keyof typeof AG_NEWS_CATEGORIES] || 'Unknown',
              categoryIndex: parseInt(row.class) || 0,
            }));

            // Filter out any invalid entries
            const validArticles = articles.filter(article => 
              article.title && article.description && article.category !== 'Unknown'
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

  static async loadSampleData(): Promise<NewsArticle[]> {
    // In a real app, you'd fetch this from a file or API
    // For now, we'll use the sample data directly
    const csvContent = `class,title,description
1,"Ukraine War: Latest Updates from Eastern Front","Military analysts report significant developments in the ongoing conflict as international diplomatic efforts continue to seek peaceful resolution."
1,"Climate Summit Reaches Historic Agreement","World leaders at COP28 agree on landmark deal to transition away from fossil fuels over the next decade with binding commitments."
1,"China-US Trade Relations Show Signs of Improvement","Economic indicators suggest warming ties between the two superpowers following recent high-level diplomatic meetings and trade negotiations."
2,"NBA Finals: Lakers vs Celtics Epic Game 7 Showdown","Historic rivalry renewed as two most successful franchises battle for championship in winner-take-all finale at TD Garden."
2,"World Cup 2024: Argentina Defends Title Successfully","Lionel Messi leads Argentina to consecutive World Cup victory with dramatic penalty shootout win over Brazil in final."
3,"Federal Reserve Raises Interest Rates by 0.75%","Central bank implements aggressive monetary policy tightening to combat persistent inflation affecting global economic recovery."
3,"Tesla Stock Surges on New Battery Technology Breakthrough","Electric vehicle manufacturer announces revolutionary solid-state battery capable of 1000-mile range and 5-minute charging."
4,"AI Breakthrough: ChatGPT-5 Demonstrates Human-Level Reasoning","OpenAI releases advanced language model capable of complex problem-solving and scientific research tasks previously impossible for machines."
4,"Quantum Computer Achieves Major Milestone in Error Correction","IBM researchers demonstrate fault-tolerant quantum computing system with potential to revolutionize cryptography and drug discovery."`;

    return this.loadCSVData(csvContent);
  }

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

  static findSimilarPairs(
    articles: NewsArticle[], 
    threshold: number = 0.7
  ): SimilarityPair[] {
    const pairs: SimilarityPair[] = [];

    for (let i = 0; i < articles.length; i++) {
      for (let j = i + 1; j < articles.length; j++) {
        const article1 = articles[i];
        const article2 = articles[j];

        if (!article1.embedding || !article2.embedding) {
          continue;
        }

        const similarity = this.calculateCosineSimilarity(
          article1.embedding,
          article2.embedding
        );

        if (similarity >= threshold) {
          pairs.push({
            id1: article1.id,
            id2: article2.id,
            similarity
          });
        }
      }
    }

    return pairs.sort((a, b) => b.similarity - a.similarity);
  }

  static combineTextForEmbedding(article: NewsArticle): string {
    return `${article.title}. ${article.description}`;
  }

  static async processArticlesInBatches<T>(
    articles: T[],
    batchSize: number,
    processor: (batch: T[]) => Promise<T[]>
  ): Promise<T[]> {
    const results: T[] = [];
    
    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, i + batchSize);
      const processedBatch = await processor(batch);
      results.push(...processedBatch);
      
      // Add small delay between batches to avoid rate limits
      if (i + batchSize < articles.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  static getArticleStats(articles: NewsArticle[]) {
    const stats = {
      total: articles.length,
      byCategory: {} as Record<string, number>,
      withEmbeddings: articles.filter(a => a.embedding).length,
      averageTextLength: 0
    };

    let totalLength = 0;
    articles.forEach(article => {
      // Count by category
      stats.byCategory[article.category] = (stats.byCategory[article.category] || 0) + 1;
      
      // Calculate text length
      totalLength += this.combineTextForEmbedding(article).length;
    });

    stats.averageTextLength = Math.round(totalLength / articles.length);

    return stats;
  }
}