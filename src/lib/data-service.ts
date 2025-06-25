import Papa from 'papaparse';
import { DataPoint, DataStats, ProcessingProgress, ProcessingCallback } from '@/types';

export interface DataLoadOptions {
  chunkSize?: number;
  skipValidation?: boolean;
  maxFileSize?: number; // in MB
}

export class DataService {
  private static readonly DEFAULT_CHUNK_SIZE = 1000;
  private static readonly DEFAULT_MAX_SIZE_MB = 50;

  /**
   * Load data from CSV content
   */
  static async loadFromCSV(
    csvContent: string,
    options: DataLoadOptions = {},
    onProgress?: ProcessingCallback
  ): Promise<DataPoint[]> {
    const {
      chunkSize = this.DEFAULT_CHUNK_SIZE,
      skipValidation = false,
      maxFileSize = this.DEFAULT_MAX_SIZE_MB
    } = options;

    this.validateFileSize(csvContent, maxFileSize);

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

      Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        step: (row, parser) => {
          if (row.errors?.length > 0 && !skipValidation) {
            console.warn('CSV parsing error:', row.errors);
          }

          try {
            const dataPoint = this.parseCSVRow(row.data, processedRows);
            if (this.isValidDataPoint(dataPoint)) {
              results.push(dataPoint);
            }
            
            processedRows++;

            if (processedRows % Math.max(1, Math.floor(chunkSize / 10)) === 0) {
              onProgress?.({
                stage: 'parsing',
                progress: 10 + Math.min(70, (processedRows / (processedRows + 100)) * 70),
                current: processedRows,
                total: processedRows + 100, // Estimate
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
          onProgress?.({
            stage: 'complete',
            progress: 100,
            current: results.length,
            total: results.length,
            message: `Successfully loaded ${results.length} items`
          });

          resolve(results);
        },
        error: (error) => {
          reject(new Error(`CSV parsing failed: ${error.message}`));
        }
      });
    });
  }

  /**
   * Load data from JSON content
   */
  static async loadFromJSON(
    jsonContent: string,
    options: DataLoadOptions = {},
    onProgress?: ProcessingCallback
  ): Promise<DataPoint[]> {
    const { chunkSize = this.DEFAULT_CHUNK_SIZE, skipValidation = false } = options;

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
      
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        
        chunk.forEach((item: any, index: number) => {
          try {
            const dataPoint = this.parseJSONItem(item, i + index);
            if (this.isValidDataPoint(dataPoint)) {
              results.push(dataPoint);
            }
          } catch (error) {
            if (!skipValidation) {
              console.warn(`Error processing item ${i + index}:`, error);
            }
          }
        });

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

      return results;
    } catch (error: any) {
      throw new Error(`JSON parsing failed: ${error.message}`);
    }
  }

  /**
   * Load data from plain text
   */
  static async loadFromText(
    textContent: string,
    onProgress?: ProcessingCallback
  ): Promise<DataPoint[]> {
    const lines = textContent.split('\n').filter(line => line.trim().length > 0);
    const dataPoints: DataPoint[] = [];
    let currentCategory = 'General';
    
    onProgress?.({
      stage: 'parsing',
      progress: 20,
      current: 0,
      total: lines.length,
      message: 'Processing text lines...'
    });

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      
      if (trimmedLine.startsWith('#')) {
        currentCategory = trimmedLine.substring(1).trim();
        return;
      }
      
      if (trimmedLine.length < 10) return;
      
      dataPoints.push({
        id: `txt_${index + 1}`,
        text: trimmedLine,
        category: currentCategory,
        metadata: {
          lineNumber: index + 1,
          source: 'txt_upload'
        }
      });

      if (index % 100 === 0) {
        onProgress?.({
          stage: 'parsing',
          progress: 20 + (index / lines.length) * 60,
          current: index,
          total: lines.length,
          message: `Processed ${index}/${lines.length} lines...`
        });
      }
    });

    onProgress?.({
      stage: 'complete',
      progress: 100,
      current: dataPoints.length,
      total: dataPoints.length,
      message: `Successfully loaded ${dataPoints.length} items`
    });

    return dataPoints;
  }

  /**
   * Get statistics about a dataset
   */
  static getStats(dataPoints: DataPoint[]): DataStats {
    const startTime = Date.now();
    
    if (dataPoints.length === 0) {
      return {
        totalItems: 0,
        withEmbeddings: 0,
        categories: [],
        averageTextLength: 0,
        fileSize: 0,
        embeddingDimensions: 0,
        processingTime: 0
      };
    }

    const categories = new Set<string>();
    let totalLength = 0;
    let embeddingDimensions = 0;
    let withEmbeddings = 0;

    dataPoints.forEach(point => {
      if (point.category) {
        categories.add(point.category);
      }
      
      totalLength += this.combineTextFields(point).length;

      if (point.embedding) {
        withEmbeddings++;
        if (embeddingDimensions === 0) {
          embeddingDimensions = point.embedding.length;
        }
      }
    });

    return {
      totalItems: dataPoints.length,
      withEmbeddings,
      categories: Array.from(categories),
      averageTextLength: Math.round(totalLength / dataPoints.length),
      fileSize: 0, // Would need to be calculated from original file
      embeddingDimensions,
      processingTime: Date.now() - startTime
    };
  }

  /**
   * Combine text fields for processing
   */
  static combineTextFields(dataPoint: DataPoint): string {
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
   * Export data in different formats
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
      return this.exportToCSV(dataToExport, includeEmbeddings);
    }
  }

  // Private helper methods
  private static validateFileSize(content: string, maxSizeMB: number): void {
    const fileSizeKB = new Blob([content]).size / 1024;
    const fileSizeMB = fileSizeKB / 1024;
    
    if (fileSizeMB > maxSizeMB) {
      throw new Error(`File size (${fileSizeMB.toFixed(1)}MB) exceeds limit of ${maxSizeMB}MB`);
    }
  }

  private static parseCSVRow(row: any, index: number): DataPoint {
    return {
      id: row.id || `item_${index + 1}`,
      text: (row.text || row.title || row.description || row.content || '').trim(),
      category: row.category?.trim() || row.label?.trim() || row.class?.trim() || undefined,
      embedding: this.parseEmbedding(row.embedding),
      metadata: this.parseMetadata(row.metadata) || this.extractMetadata(row)
    };
  }

  private static parseJSONItem(item: any, index: number): DataPoint {
    return {
      id: item.id || `item_${index + 1}`,
      text: item.text || item.title || item.description || item.content || '',
      category: item.category || item.label || item.class || undefined,
      embedding: Array.isArray(item.embedding) ? item.embedding : undefined,
      metadata: item.metadata || this.extractMetadata(item)
    };
  }

  private static parseEmbedding(embeddingData: any): number[] | undefined {
    if (!embeddingData) return undefined;
    
    if (Array.isArray(embeddingData)) return embeddingData;
    
    if (typeof embeddingData === 'string') {
      try {
        return JSON.parse(embeddingData);
      } catch {
        return undefined;
      }
    }
    
    return undefined;
  }

  private static parseMetadata(metadataData: any): Record<string, any> | undefined {
    if (!metadataData) return undefined;
    
    if (typeof metadataData === 'object') return metadataData;
    
    if (typeof metadataData === 'string') {
      try {
        return JSON.parse(metadataData);
      } catch {
        return { raw: metadataData };
      }
    }
    
    return undefined;
  }

  private static extractMetadata(item: any): Record<string, any> | undefined {
    const metadata: Record<string, any> = {};
    const excludeFields = ['id', 'text', 'title', 'description', 'content', 'category', 'label', 'class', 'embedding', 'metadata'];
    
    Object.keys(item).forEach(key => {
      if (!excludeFields.includes(key) && item[key] !== undefined && item[key] !== '') {
        metadata[key] = item[key];
      }
    });

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  private static isValidDataPoint(point: DataPoint): boolean {
    return Boolean(point.id && point.text && point.text.length >= 3);
  }

  private static exportToCSV(dataPoints: DataPoint[], includeEmbeddings: boolean): string {
    const headers = ['id', 'text', 'category'];
    if (includeEmbeddings) headers.push('embedding');
    headers.push('metadata');
    
    const rows = [headers.join(',')];
    
    dataPoints.forEach(point => {
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