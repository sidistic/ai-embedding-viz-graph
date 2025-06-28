'use client';
import React, { useCallback, useRef, useState } from 'react';
import { DataPoint, DataProcessingOptions, ProcessingProgress } from '@/types';
import { DataProcessor } from '@/lib/dataProcessor';

interface FileUploadProps {
  onFileLoad: (data: DataPoint[]) => void;
  onError: (error: string) => void;
  onProgress?: (progress: ProcessingProgress) => void;
}

export default function FileUpload({ onFileLoad, onError, onProgress }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fileInfo, setFileInfo] = useState<{
    name: string;
    size: number;
    type: string;
  } | null>(null);
  const processingRef = useRef(false);

  const processFile = useCallback(async (file: File) => {
    if (!file || processingRef.current) return;

    processingRef.current = true;
    setIsLoading(true);
    setFileInfo({
      name: file.name,
      size: file.size,
      type: file.type
    });
    onError(''); // Clear previous errors

    try {
      // Check file size (50MB limit)
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (file.size > maxSize) {
        throw new Error(`File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds 50MB limit`);
      }

      onProgress?.({
        stage: 'loading',
        progress: 5,
        current: 0,
        total: 1,
        message: 'Reading file...'
      });

      const content = await readFileContent(file);
      let data: DataPoint[] = [];

      const processingOptions: DataProcessingOptions = {
        chunkSize: 1000,
        skipValidation: file.size > 10 * 1024 * 1024, // Skip validation for files > 10MB
        maxFileSize: 50,
        supportedFormats: ['.json', '.csv', '.txt']
      };

      if (file.name.toLowerCase().endsWith('.json')) {
        data = await DataProcessor.loadJSONData(content, processingOptions, onProgress);
      } else if (file.name.toLowerCase().endsWith('.csv')) {
        data = await DataProcessor.loadCSVData(content, processingOptions, onProgress);
      } else if (file.name.toLowerCase().endsWith('.txt')) {
        // Handle plain text files
        data = await processTxtFile(content, onProgress);
      } else {
        throw new Error('Unsupported file format. Please use CSV, JSON, or TXT files.');
      }

      if (data.length === 0) {
        throw new Error('No valid data found in file. Please check the file format.');
      }

      // Log successful loading info
      const stats = DataProcessor.getDataStats(data);
      console.log('File loaded successfully:', {
        fileName: file.name,
        fileSize: `${(file.size / 1024 / 1024).toFixed(2)}MB`,
        totalItems: stats.totalItems,
        withEmbeddings: stats.withEmbeddings,
        categories: stats.categories,
        embeddingDimensions: stats.embeddingDimensions,
        processingTime: `${stats.processingTime}ms`
      });

      onFileLoad(data);
      
      onProgress?.({
        stage: 'complete',
        progress: 100,
        current: data.length,
        total: data.length,
        message: `Successfully loaded ${data.length} items from ${file.name}`
      });

    } catch (error: any) {
      console.error('File processing error:', error);
      onError(error.message || 'Failed to process file');
    } finally {
      setIsLoading(false);
      processingRef.current = false;
      setFileInfo(null);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [onFileLoad, onError, onProgress]);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && !processingRef.current) {
      processFile(file);
    }
  }, [processFile]);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];
    if (file && !processingRef.current) {
      processFile(file);
    }
  }, [processFile]);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleClick = useCallback(() => {
    if (!processingRef.current) {
      fileInputRef.current?.click();
    }
  }, []);

  return (
    <div className="space-y-3">
      {/* Drop Zone */}
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all duration-200
          ${isDragging 
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' 
            : 'border-gray-600 hover:border-gray-500'
          }
          ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-800/50'}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.json,.txt"
          onChange={handleFileChange}
          disabled={isLoading}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          style={{ display: 'none' }}
        />
        
        <div className="space-y-2">
          {isLoading ? (
            <>
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
              <p className="text-blue-400 font-medium">Processing file...</p>
              {fileInfo && (
                <div className="text-xs text-gray-400">
                  <div>{fileInfo.name}</div>
                  <div>{(fileInfo.size / 1024 / 1024).toFixed(2)}MB</div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-4xl text-gray-400 mb-2">📁</div>
              <p className="text-white font-medium">
                {isDragging ? 'Drop file here' : 'Click to upload or drag & drop'}
              </p>
              <p className="text-gray-400 text-sm">
                Supports CSV, JSON, and TXT files (up to 50MB)
              </p>
            </>
          )}
        </div>
      </div>

      {/* Enhanced File Format Info */}
      <div className="bg-gray-800/50 rounded-lg p-3 text-sm">
        <h4 className="text-white font-medium mb-3">Supported File Formats:</h4>
        <div className="space-y-3 text-gray-300">
          <div>
            <span className="font-medium text-blue-400">CSV:</span>
            <div className="ml-4 text-xs space-y-1">
              <div>• Required: 'text' column</div>
              <div>• Optional: 'id', 'category', 'title', 'description'</div>
              <div>• Optional: 'embedding' (JSON array), 'metadata' (JSON object)</div>
            </div>
          </div>
          
          <div>
            <span className="font-medium text-green-400">JSON:</span>
            <div className="ml-4 text-xs space-y-1">
              <div>• Array of objects with 'text' property</div>
              <div>• Optional: 'id', 'category', 'embedding', 'metadata'</div>
              <div>• Supports nested objects and arrays</div>
            </div>
          </div>

          <div>
            <span className="font-medium text-yellow-400">TXT:</span>
            <div className="ml-4 text-xs space-y-1">
              <div>• <strong>Auto-chunks large text files</strong> by paragraphs/sentences</div>
              <div>• Intelligent chunking strategy detection (adaptive, semantic, fixed)</div>
              <div>• Configurable chunk sizes (150-2000 characters) with overlap</div>
              <div>• Preserves document structure and context</div>
              <div>• Lines starting with '#' are treated as categories</div>
              <div>• Auto-detects content categories (Technology, Science, etc.)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Sample Data Buttons */}
      <div className="grid grid-cols-1 gap-2">
        <button
          onClick={() => loadSampleData('ag_news')}
          disabled={isLoading || processingRef.current}
          className="w-full p-2 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded transition-colors text-sm"
        >
          Load Sample: AG News Dataset (20 items)
        </button>

        <button
          onClick={() => loadSampleData('reddit')}
          disabled={isLoading || processingRef.current}
          className="w-full p-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded transition-colors text-sm"
        >
          Load Sample: Reddit Comments (15 items)
        </button>

        <button
          onClick={() => loadSampleData('research_papers')}
          disabled={isLoading || processingRef.current}
          className="w-full p-2 bg-purple-700 hover:bg-purple-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded transition-colors text-sm"
        >
          Load Sample: Research Papers (10 items)
        </button>
      </div>

      {/* Performance Tips */}
      <details className="bg-gray-700/30 rounded p-3">
        <summary className="text-sm text-gray-300 cursor-pointer hover:text-white">
          💡 Auto-Chunking & Performance Tips
        </summary>
        <div className="mt-2 text-xs text-gray-400 space-y-2">
          <div className="text-yellow-300 font-medium">📝 Text File Auto-Chunking:</div>
          <div className="ml-2 space-y-1">
            <div>• Upload entire books, articles, or documents as single .txt files</div>
            <div>• System automatically chunks by paragraphs, sentences, or semantic breaks</div>
            <div>• Preserves context with configurable overlap between chunks</div>
            <div>• Auto-detects content categories and optimal chunk sizes</div>
          </div>
          
          <div className="text-blue-300 font-medium">⚡ Performance Optimization:</div>
          <div className="ml-2 space-y-1">
            <div>• Files &gt;10MB: validation skipped for faster processing</div>
            <div>• Large files (&gt;100MB): automatic streaming with 64MB chunks</div>
            <div>• Memory-efficient processing with garbage collection</div>
            <div>• Adaptive batch sizes based on available memory</div>
            <div>• Use TXT for raw text, CSV for structured data</div>
          </div>
        </div>
      </details>
    </div>
  );

  // Load sample data function
  async function loadSampleData(type: 'ag_news' | 'reddit' | 'research_papers') {
    if (processingRef.current) return;
    
    processingRef.current = true;
    setIsLoading(true);
    
    try {
      onProgress?.({
        stage: 'loading',
        progress: 10,
        current: 0,
        total: 1,
        message: 'Generating sample data...'
      });

      const sampleData = await generateSampleData(type, onProgress);
      onFileLoad(sampleData);
    } catch (error: any) {
      onError(error.message);
    } finally {
      setIsLoading(false);
      processingRef.current = false;
    }
  }
}

// Utility function to read file content with streaming for large files
function readFileContent(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    // For very large files, use streaming approach
    if (file.size > 100 * 1024 * 1024) { // 100MB threshold
      readFileInChunks(file)
        .then(resolve)
        .catch(reject);
      return;
    }

    // Standard approach for smaller files
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        if (!content) {
          reject(new Error('File content is empty'));
          return;
        }
        resolve(content);
      } catch (error) {
        reject(new Error('Failed to process file content'));
      }
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file - file may be corrupted or too large'));
    };
    reader.onabort = () => {
      reject(new Error('File reading was aborted'));
    };
    
    try {
      reader.readAsText(file);
    } catch (error) {
      reject(new Error('Failed to start file reading - file may be too large for browser memory'));
    }
  });
}

// Stream large files in chunks to avoid memory issues
async function readFileInChunks(file: File): Promise<string> {
  const chunkSize = 64 * 1024 * 1024; // 64MB chunks
  const chunks: string[] = [];
  let offset = 0;

  while (offset < file.size) {
    const slice = file.slice(offset, offset + chunkSize);
    const chunk = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string || '');
      reader.onerror = () => reject(new Error('Failed to read file chunk'));
      reader.readAsText(slice);
    });
    
    chunks.push(chunk);
    offset += chunkSize;
    
    // Allow other tasks to run
    await new Promise(resolve => setTimeout(resolve, 1));
  }

  return chunks.join('');
}

// Enhanced text chunking interface
interface ChunkingOptions {
  strategy: 'sentence' | 'paragraph' | 'semantic' | 'fixed' | 'adaptive';
  maxChunkSize: number;
  minChunkSize: number;
  overlap: number;
  preserveStructure: boolean;
}

// Process plain text files with intelligent auto-chunking
async function processTxtFile(
  content: string,
  onProgress?: (progress: ProcessingProgress) => void
): Promise<DataPoint[]> {
  onProgress?.({
    stage: 'parsing',
    progress: 10,
    current: 0,
    total: 1,
    message: 'Analyzing text structure...'
  });

  // Auto-detect best chunking strategy
  const chunkingOptions = detectOptimalChunking(content);
  
  onProgress?.({
    stage: 'parsing',
    progress: 20,
    current: 0,
    total: 1,
    message: `Using ${chunkingOptions.strategy} chunking strategy...`
  });

  // Chunk the text based on detected strategy
  const chunks = await chunkText(content, chunkingOptions, onProgress);
  
  onProgress?.({
    stage: 'processing',
    progress: 80,
    current: chunks.length,
    total: chunks.length,
    message: `Created ${chunks.length} text chunks...`
  });

  // Convert chunks to DataPoints
  const dataPoints: DataPoint[] = chunks.map((chunk, index) => ({
    id: `chunk_${index + 1}`,
    text: chunk.text,
    category: chunk.category || detectContentCategory(chunk.text),
    metadata: {
      chunkIndex: index + 1,
      totalChunks: chunks.length,
      chunkSize: chunk.text.length,
      chunkStrategy: chunkingOptions.strategy,
      startPosition: chunk.startPosition,
      endPosition: chunk.endPosition,
      source: 'txt_upload_chunked',
      originalLength: content.length,
      hasOverlap: chunk.hasOverlap || false
    }
  }));

  onProgress?.({
    stage: 'validating',
    progress: 95,
    current: dataPoints.length,
    total: dataPoints.length,
    message: 'Validating chunked data...'
  });

  // Filter out chunks that are too short or empty
  const validChunks = dataPoints.filter(chunk => 
    chunk.text.trim().length >= chunkingOptions.minChunkSize
  );

  onProgress?.({
    stage: 'complete',
    progress: 100,
    current: validChunks.length,
    total: validChunks.length,
    message: `Successfully created ${validChunks.length} text chunks`
  });

  return validChunks;
}

// Detect optimal chunking strategy based on text characteristics
function detectOptimalChunking(content: string): ChunkingOptions {
  const textLength = content.length;
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgParagraphLength = paragraphs.length > 0 ? textLength / paragraphs.length : 0;
  const avgSentenceLength = sentences.length > 0 ? textLength / sentences.length : 0;

  console.log('Text analysis:', {
    totalLength: textLength,
    paragraphCount: paragraphs.length,
    sentenceCount: sentences.length,
    avgParagraphLength: Math.round(avgParagraphLength),
    avgSentenceLength: Math.round(avgSentenceLength)
  });

  // Adaptive strategy selection
  if (textLength < 10000) {
    // Small texts: use paragraph chunking
    return {
      strategy: 'paragraph',
      maxChunkSize: 2000,
      minChunkSize: 100,
      overlap: 100,
      preserveStructure: true
    };
  } else if (avgParagraphLength > 500 && avgParagraphLength < 2000) {
    // Well-structured documents: use paragraph chunking
    return {
      strategy: 'paragraph',
      maxChunkSize: 1500,
      minChunkSize: 200,
      overlap: 150,
      preserveStructure: true
    };
  } else if (avgSentenceLength > 50 && avgSentenceLength < 300) {
    // Regular prose: use sentence-based chunking
    return {
      strategy: 'sentence',
      maxChunkSize: 1200,
      minChunkSize: 150,
      overlap: 100,
      preserveStructure: true
    };
  } else if (textLength > 100000) {
    // Very large texts: use semantic chunking
    return {
      strategy: 'semantic',
      maxChunkSize: 1000,
      minChunkSize: 200,
      overlap: 200,
      preserveStructure: false
    };
  } else {
    // Default: adaptive chunking
    return {
      strategy: 'adaptive',
      maxChunkSize: 1000,
      minChunkSize: 150,
      overlap: 100,
      preserveStructure: true
    };
  }
}

// Intelligent text chunking with multiple strategies
async function chunkText(
  content: string, 
  options: ChunkingOptions,
  onProgress?: (progress: ProcessingProgress) => void
): Promise<Array<{
  text: string;
  category?: string;
  startPosition: number;
  endPosition: number;
  hasOverlap?: boolean;
}>> {
  const chunks: Array<{
    text: string;
    category?: string;
    startPosition: number;
    endPosition: number;
    hasOverlap?: boolean;
  }> = [];

  let currentCategory = 'General';

  switch (options.strategy) {
    case 'paragraph':
      return chunkByParagraphs(content, options, onProgress);
    
    case 'sentence':
      return chunkBySentences(content, options, onProgress);
    
    case 'semantic':
      return chunkBySemantic(content, options, onProgress);
    
    case 'fixed':
      return chunkByFixedSize(content, options, onProgress);
    
    case 'adaptive':
    default:
      return chunkAdaptive(content, options, onProgress);
  }
}

// Paragraph-based chunking
async function chunkByParagraphs(
  content: string, 
  options: ChunkingOptions,
  onProgress?: (progress: ProcessingProgress) => void
): Promise<Array<{text: string; category?: string; startPosition: number; endPosition: number; hasOverlap?: boolean}>> {
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const chunks: Array<{text: string; category?: string; startPosition: number; endPosition: number; hasOverlap?: boolean}> = [];
  
  let currentChunk = '';
  let startPos = 0;
  let currentCategory = 'General';

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i].trim();
    
    // Check for category markers
    const categoryMatch = paragraph.match(/^#\s*(.+)$/);
    if (categoryMatch) {
      currentCategory = categoryMatch[1].trim();
      continue;
    }

    // Skip very short paragraphs
    if (paragraph.length < 50) continue;

    // If adding this paragraph would exceed max size, save current chunk
    if (currentChunk.length + paragraph.length > options.maxChunkSize && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        category: currentCategory,
        startPosition: startPos,
        endPosition: startPos + currentChunk.length,
        hasOverlap: false
      });
      
      // Handle overlap
      if (options.overlap > 0) {
        const overlapText = currentChunk.slice(-options.overlap);
        currentChunk = overlapText + '\n\n' + paragraph;
      } else {
        currentChunk = paragraph;
      }
      startPos = content.indexOf(paragraph, startPos);
    } else {
      if (currentChunk.length > 0) {
        currentChunk += '\n\n' + paragraph;
      } else {
        currentChunk = paragraph;
        startPos = content.indexOf(paragraph, startPos);
      }
    }

    // Progress update
    if (i % 10 === 0) {
      onProgress?.({
        stage: 'processing',
        progress: 30 + (i / paragraphs.length) * 40,
        current: i,
        total: paragraphs.length,
        message: `Processing paragraph ${i + 1}/${paragraphs.length}...`
      });
      
      // Allow UI to update
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }

  // Add final chunk
  if (currentChunk.trim().length >= options.minChunkSize) {
    chunks.push({
      text: currentChunk.trim(),
      category: currentCategory,
      startPosition: startPos,
      endPosition: startPos + currentChunk.length,
      hasOverlap: false
    });
  }

  return chunks;
}

// Sentence-based chunking
async function chunkBySentences(
  content: string, 
  options: ChunkingOptions,
  onProgress?: (progress: ProcessingProgress) => void
): Promise<Array<{text: string; category?: string; startPosition: number; endPosition: number; hasOverlap?: boolean}>> {
  // Advanced sentence splitting that handles abbreviations
  const sentences = content.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.trim().length > 0);
  const chunks: Array<{text: string; category?: string; startPosition: number; endPosition: number; hasOverlap?: boolean}> = [];
  
  let currentChunk = '';
  let startPos = 0;
  let currentCategory = 'General';

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();
    
    // Check for category markers
    if (sentence.startsWith('#')) {
      const categoryMatch = sentence.match(/^#\s*(.+)$/);
      if (categoryMatch) {
        currentCategory = categoryMatch[1].trim();
        continue;
      }
    }

    // If adding this sentence would exceed max size, save current chunk
    if (currentChunk.length + sentence.length > options.maxChunkSize && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        category: currentCategory,
        startPosition: startPos,
        endPosition: startPos + currentChunk.length,
        hasOverlap: options.overlap > 0
      });
      
      // Handle overlap
      if (options.overlap > 0) {
        const overlapText = currentChunk.slice(-options.overlap);
        currentChunk = overlapText + ' ' + sentence;
      } else {
        currentChunk = sentence;
      }
      startPos = content.indexOf(sentence, startPos);
    } else {
      if (currentChunk.length > 0) {
        currentChunk += ' ' + sentence;
      } else {
        currentChunk = sentence;
        startPos = content.indexOf(sentence, startPos);
      }
    }

    // Progress update
    if (i % 50 === 0) {
      onProgress?.({
        stage: 'processing',
        progress: 30 + (i / sentences.length) * 40,
        current: i,
        total: sentences.length,
        message: `Processing sentence ${i + 1}/${sentences.length}...`
      });
      
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }

  // Add final chunk
  if (currentChunk.trim().length >= options.minChunkSize) {
    chunks.push({
      text: currentChunk.trim(),
      category: currentCategory,
      startPosition: startPos,
      endPosition: startPos + currentChunk.length,
      hasOverlap: false
    });
  }

  return chunks;
}

// Semantic chunking (topic-aware)
async function chunkBySemantic(
  content: string, 
  options: ChunkingOptions,
  onProgress?: (progress: ProcessingProgress) => void
): Promise<Array<{text: string; category?: string; startPosition: number; endPosition: number; hasOverlap?: boolean}>> {
  // Split by semantic breaks (double newlines, section headers, etc.)
  const semanticBreaks = content.split(/(?:\n\s*\n|\n\s*#{1,6}\s|\n\s*-{3,}|\n\s*={3,})/);
  const chunks: Array<{text: string; category?: string; startPosition: number; endPosition: number; hasOverlap?: boolean}> = [];
  
  let currentChunk = '';
  let startPos = 0;
  let currentCategory = 'General';

  for (let i = 0; i < semanticBreaks.length; i++) {
    const section = semanticBreaks[i].trim();
    
    if (section.length === 0) continue;

    // Detect topic changes based on common patterns
    const topicPattern = /^(chapter|section|part|\d+\.|\w+:)/i;
    if (topicPattern.test(section) && currentChunk.length > options.minChunkSize) {
      // Save current chunk before starting new topic
      chunks.push({
        text: currentChunk.trim(),
        category: currentCategory,
        startPosition: startPos,
        endPosition: startPos + currentChunk.length,
        hasOverlap: false
      });
      currentChunk = section;
      startPos = content.indexOf(section, startPos);
    } else if (currentChunk.length + section.length > options.maxChunkSize && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        category: currentCategory,
        startPosition: startPos,
        endPosition: startPos + currentChunk.length,
        hasOverlap: options.overlap > 0
      });
      
      // Handle overlap
      if (options.overlap > 0) {
        const overlapText = currentChunk.slice(-options.overlap);
        currentChunk = overlapText + '\n\n' + section;
      } else {
        currentChunk = section;
      }
      startPos = content.indexOf(section, startPos);
    } else {
      if (currentChunk.length > 0) {
        currentChunk += '\n\n' + section;
      } else {
        currentChunk = section;
        startPos = content.indexOf(section, startPos);
      }
    }

    if (i % 20 === 0) {
      onProgress?.({
        stage: 'processing',
        progress: 30 + (i / semanticBreaks.length) * 40,
        current: i,
        total: semanticBreaks.length,
        message: `Processing semantic section ${i + 1}/${semanticBreaks.length}...`
      });
      
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }

  // Add final chunk
  if (currentChunk.trim().length >= options.minChunkSize) {
    chunks.push({
      text: currentChunk.trim(),
      category: currentCategory,
      startPosition: startPos,
      endPosition: startPos + currentChunk.length,
      hasOverlap: false
    });
  }

  return chunks;
}

// Fixed-size chunking with word boundaries
async function chunkByFixedSize(
  content: string, 
  options: ChunkingOptions,
  onProgress?: (progress: ProcessingProgress) => void
): Promise<Array<{text: string; category?: string; startPosition: number; endPosition: number; hasOverlap?: boolean}>> {
  const chunks: Array<{text: string; category?: string; startPosition: number; endPosition: number; hasOverlap?: boolean}> = [];
  const words = content.split(/\s+/);
  
  let currentChunk = '';
  let startPos = 0;
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    
    if (currentChunk.length + word.length + 1 > options.maxChunkSize && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        category: detectContentCategory(currentChunk),
        startPosition: startPos,
        endPosition: startPos + currentChunk.length,
        hasOverlap: options.overlap > 0
      });
      
      // Handle overlap
      if (options.overlap > 0) {
        const overlapWords = currentChunk.split(/\s+/).slice(-Math.floor(options.overlap / 10));
        currentChunk = overlapWords.join(' ') + ' ' + word;
      } else {
        currentChunk = word;
      }
      startPos = content.indexOf(currentChunk, startPos);
    } else {
      if (currentChunk.length > 0) {
        currentChunk += ' ' + word;
      } else {
        currentChunk = word;
        startPos = content.indexOf(word, startPos);
      }
    }

    if (i % 1000 === 0) {
      onProgress?.({
        stage: 'processing',
        progress: 30 + (i / words.length) * 40,
        current: i,
        total: words.length,
        message: `Processing word ${i + 1}/${words.length}...`
      });
      
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }

  // Add final chunk
  if (currentChunk.trim().length >= options.minChunkSize) {
    chunks.push({
      text: currentChunk.trim(),
      category: detectContentCategory(currentChunk),
      startPosition: startPos,
      endPosition: startPos + currentChunk.length,
      hasOverlap: false
    });
  }

  return chunks;
}

// Adaptive chunking (combines multiple strategies)
async function chunkAdaptive(
  content: string, 
  options: ChunkingOptions,
  onProgress?: (progress: ProcessingProgress) => void
): Promise<Array<{text: string; category?: string; startPosition: number; endPosition: number; hasOverlap?: boolean}>> {
  // First try paragraph chunking, then sentence chunking for large paragraphs
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const chunks: Array<{text: string; category?: string; startPosition: number; endPosition: number; hasOverlap?: boolean}> = [];
  
  let currentCategory = 'General';

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i].trim();
    
    // Check for category markers
    const categoryMatch = paragraph.match(/^#\s*(.+)$/);
    if (categoryMatch) {
      currentCategory = categoryMatch[1].trim();
      continue;
    }

    if (paragraph.length <= options.maxChunkSize) {
      // Paragraph fits in one chunk
      if (paragraph.length >= options.minChunkSize) {
        chunks.push({
          text: paragraph,
          category: currentCategory,
          startPosition: content.indexOf(paragraph),
          endPosition: content.indexOf(paragraph) + paragraph.length,
          hasOverlap: false
        });
      }
    } else {
      // Paragraph is too large, split by sentences
      const sentences = paragraph.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.trim().length > 0);
      let currentChunk = '';
      let chunkStart = content.indexOf(paragraph);
      
      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > options.maxChunkSize && currentChunk.length > 0) {
          chunks.push({
            text: currentChunk.trim(),
            category: currentCategory,
            startPosition: chunkStart,
            endPosition: chunkStart + currentChunk.length,
            hasOverlap: options.overlap > 0
          });
          
          if (options.overlap > 0) {
            const overlapText = currentChunk.slice(-options.overlap);
            currentChunk = overlapText + ' ' + sentence;
          } else {
            currentChunk = sentence;
          }
          chunkStart = content.indexOf(sentence, chunkStart);
        } else {
          if (currentChunk.length > 0) {
            currentChunk += ' ' + sentence;
          } else {
            currentChunk = sentence;
            chunkStart = content.indexOf(sentence, chunkStart);
          }
        }
      }
      
      // Add final chunk from this paragraph
      if (currentChunk.trim().length >= options.minChunkSize) {
        chunks.push({
          text: currentChunk.trim(),
          category: currentCategory,
          startPosition: chunkStart,
          endPosition: chunkStart + currentChunk.length,
          hasOverlap: false
        });
      }
    }

    if (i % 10 === 0) {
      onProgress?.({
        stage: 'processing',
        progress: 30 + (i / paragraphs.length) * 40,
        current: i,
        total: paragraphs.length,
        message: `Processing paragraph ${i + 1}/${paragraphs.length}...`
      });
      
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }

  return chunks;
}

// Auto-detect content category based on keywords
function detectContentCategory(text: string): string {
  const lowerText = text.toLowerCase();
  
  // Define category keywords
  const categories = {
    'Technology': ['ai', 'artificial intelligence', 'machine learning', 'computer', 'software', 'algorithm', 'data', 'programming', 'code', 'digital', 'internet', 'tech'],
    'Science': ['research', 'study', 'experiment', 'hypothesis', 'theory', 'scientific', 'analysis', 'discovery', 'evidence', 'methodology'],
    'Business': ['company', 'market', 'financial', 'revenue', 'profit', 'business', 'corporate', 'economy', 'industry', 'commercial'],
    'Health': ['health', 'medical', 'medicine', 'patient', 'treatment', 'disease', 'therapy', 'clinical', 'healthcare', 'wellness'],
    'Education': ['education', 'learning', 'student', 'teacher', 'school', 'university', 'course', 'academic', 'knowledge', 'training'],
    'News': ['news', 'report', 'according', 'source', 'announced', 'statement', 'breaking', 'update', 'journalist', 'media']
  };
  
  let maxScore = 0;
  let detectedCategory = 'General';
  
  for (const [category, keywords] of Object.entries(categories)) {
    const score = keywords.reduce((count, keyword) => {
      const matches = (lowerText.match(new RegExp(keyword, 'g')) || []).length;
      return count + matches;
    }, 0);
    
    if (score > maxScore) {
      maxScore = score;
      detectedCategory = category;
    }
  }
  
  return detectedCategory;
}

// Enhanced sample data generators
async function generateSampleData(
  type: 'ag_news' | 'reddit' | 'research_papers',
  onProgress?: (progress: ProcessingProgress) => void
): Promise<DataPoint[]> {
  
  onProgress?.({
    stage: 'loading',
    progress: 20,
    current: 0,
    total: 1,
    message: 'Generating sample data...'
  });

  let sampleData: DataPoint[] = [];

  switch (type) {
    case 'ag_news':
      sampleData = [
        {
          id: 'ag_1',
          text: 'Breaking: Climate Summit Reaches Historic Agreement on Carbon Emissions with 195 Countries Signing Landmark Deal',
          category: 'World',
          metadata: { source: 'Reuters', date: '2024-01-15', importance: 'high' }
        },
        {
          id: 'ag_2', 
          text: 'NBA Finals Game 7: Lakers Defeat Celtics 108-102 in Epic Championship Battle, LeBron James Named Finals MVP',
          category: 'Sports',
          metadata: { source: 'ESPN', date: '2024-01-14', sport: 'basketball' }
        },
        {
          id: 'ag_3',
          text: 'Federal Reserve Announces 0.25% Interest Rate Cut Amid Economic Uncertainty and Inflation Concerns',
          category: 'Business', 
          metadata: { source: 'Bloomberg', date: '2024-01-13', sector: 'finance' }
        },
        {
          id: 'ag_4',
          text: 'AI Breakthrough: New Language Model GPT-5 Demonstrates Advanced Reasoning Capabilities and Multimodal Understanding',
          category: 'Technology',
          metadata: { source: 'TechCrunch', date: '2024-01-12', sector: 'artificial_intelligence' }
        },
        {
          id: 'ag_5',
          text: 'European Union Implements Comprehensive Digital Privacy Regulations Affecting Tech Giants Across Global Markets',
          category: 'World',
          metadata: { source: 'BBC', date: '2024-01-11', region: 'europe' }
        },
        {
          id: 'ag_6',
          text: 'World Cup Qualifiers: Argentina Secures Victory Against Brazil 2-1 in Dramatic South American Tournament Final',
          category: 'Sports',
          metadata: { source: 'FIFA', date: '2024-01-10', sport: 'football' }
        },
        {
          id: 'ag_7',
          text: 'Tesla Announces Revolutionary Solid-State Battery Technology Promising 1000-Mile Range and 5-Minute Charging',
          category: 'Business',
          metadata: { source: 'MarketWatch', date: '2024-01-09', sector: 'automotive' }
        },
        {
          id: 'ag_8',
          text: 'Quantum Computing Milestone: IBM Achieves Error-Free Calculations on 1000-Qubit Processor for First Time',
          category: 'Technology',
          metadata: { source: 'Nature', date: '2024-01-08', sector: 'quantum_computing' }
        },
        {
          id: 'ag_9',
          text: 'Global Food Crisis: UN Reports 345 Million People Face Acute Food Insecurity Worldwide, Urgent Action Needed',
          category: 'World',
          metadata: { source: 'UN News', date: '2024-01-07', topic: 'humanitarian' }
        },
        {
          id: 'ag_10',
          text: 'Olympic Swimming Records Shattered: Katie Ledecky Breaks 1500m Freestyle World Record by 3 Seconds',
          category: 'Sports',
          metadata: { source: 'Olympic Channel', date: '2024-01-06', sport: 'swimming' }
        },
        {
          id: 'ag_11',
          text: 'Cryptocurrency Market Surge: Bitcoin Reaches $75,000 All-Time High as Institutional Adoption Accelerates',
          category: 'Business',
          metadata: { source: 'CoinDesk', date: '2024-01-05', sector: 'cryptocurrency' }
        },
        {
          id: 'ag_12',
          text: 'Space Exploration Success: SpaceX Falcon Heavy Launches Mars Colonization Mission with Advanced Life Support Systems',
          category: 'Technology',
          metadata: { source: 'Space News', date: '2024-01-04', sector: 'aerospace' }
        },
        {
          id: 'ag_13',
          text: 'International Trade Agreement: Pacific Nations Sign Comprehensive Economic Partnership Boosting Regional Commerce',
          category: 'World',
          metadata: { source: 'Trade Weekly', date: '2024-01-03', region: 'pacific' }
        },
        {
          id: 'ag_14',
          text: 'Tennis Grand Slam: Novak Djokovic Wins Record 25th Grand Slam Title at Australian Open, Extends GOAT Debate',
          category: 'Sports',
          metadata: { source: 'Tennis.com', date: '2024-01-02', sport: 'tennis' }
        },
        {
          id: 'ag_15',
          text: 'Green Energy Breakthrough: New Solar Panel Technology Achieves 50% Efficiency in Laboratory Testing',
          category: 'Technology',
          metadata: { source: 'Clean Energy News', date: '2024-01-01', sector: 'renewable_energy' }
        },
        {
          id: 'ag_16',
          text: 'Global Health Initiative: WHO Announces Successful Eradication of Malaria in 15 African Countries Through Innovative Vaccine Program',
          category: 'World',
          metadata: { source: 'WHO', date: '2023-12-31', topic: 'health' }
        },
        {
          id: 'ag_17',
          text: 'Major League Baseball: Home Run Record Broken as Aaron Judge Hits 75th Homer, Surpassing Babe Ruth Era',
          category: 'Sports',
          metadata: { source: 'MLB.com', date: '2023-12-30', sport: 'baseball' }
        },
        {
          id: 'ag_18',
          text: 'Stock Market Rally: S&P 500 Closes at Record High 6,000 Points Driven by Tech Sector and AI Investment Boom',
          category: 'Business',
          metadata: { source: 'Wall Street Journal', date: '2023-12-29', sector: 'finance' }
        },
        {
          id: 'ag_19',
          text: 'Medical Innovation: CRISPR Gene Therapy Successfully Cures Type 1 Diabetes in Clinical Trial Patients',
          category: 'Technology',
          metadata: { source: 'Medical Journal', date: '2023-12-28', sector: 'biotechnology' }
        },
        {
          id: 'ag_20',
          text: 'Climate Action: Amazon Rainforest Deforestation Drops to Lowest Level in 50 Years Following International Conservation Efforts',
          category: 'World',
          metadata: { source: 'Environmental Times', date: '2023-12-27', topic: 'environment' }
        }
      ];
      break;

    case 'reddit':
      sampleData = [
        {
          id: 'reddit_1',
          text: 'What productivity app changed your life? I recently started using Notion and it completely transformed how I organize my thoughts and projects.',
          category: 'AskReddit',
          metadata: { subreddit: 'AskReddit', upvotes: 2847, comments: 892 }
        },
        {
          id: 'reddit_2',
          text: 'The new iPhone 15 Pro Max camera is incredible for astrophotography. Here are some shots I took of the Milky Way last weekend without any additional equipment.',
          category: 'Technology',
          metadata: { subreddit: 'photography', upvotes: 15672, comments: 234 }
        },
        {
          id: 'reddit_3',
          text: 'LPT: When learning a new language, change your phone interface to that language. You use your phone so much that you\'ll pick up common words quickly.',
          category: 'LifeProTips',
          metadata: { subreddit: 'LifeProTips', upvotes: 8934, comments: 456 }
        },
        {
          id: 'reddit_4',
          text: 'Scientists have successfully reversed aging in mice using a new gene therapy technique. Human trials are expected to begin next year.',
          category: 'Science',
          metadata: { subreddit: 'science', upvotes: 12567, comments: 1203 }
        },
        {
          id: 'reddit_5',
          text: 'After 15 years of smoking, I finally quit cold turkey 6 months ago. The difference in my health and energy levels is remarkable.',
          category: 'PersonalGrowth',
          metadata: { subreddit: 'decidingtobebetter', upvotes: 5678, comments: 789 }
        },
        {
          id: 'reddit_6',
          text: 'The new electric vehicle charging infrastructure is expanding rapidly. Found 12 fast-charging stations on my road trip from LA to Seattle.',
          category: 'Technology',
          metadata: { subreddit: 'electricvehicles', upvotes: 3421, comments: 167 }
        },
        {
          id: 'reddit_7',
          text: 'Why do we still use QWERTY keyboards when more efficient layouts like Dvorak exist? Is it just tradition at this point?',
          category: 'AskReddit',
          metadata: { subreddit: 'AskReddit', upvotes: 7823, comments: 1456 }
        },
        {
          id: 'reddit_8',
          text: 'Breakthrough in quantum computing: Google\'s new chip solved a problem in 5 minutes that would take classical computers 10 quintillion years.',
          category: 'Technology',
          metadata: { subreddit: 'technology', upvotes: 18945, comments: 2134 }
        },
        {
          id: 'reddit_9',
          text: 'Started meditation 30 days ago using a simple breathing technique. My anxiety levels have decreased significantly and sleep quality improved.',
          category: 'PersonalGrowth',
          metadata: { subreddit: 'meditation', upvotes: 4567, comments: 298 }
        },
        {
          id: 'reddit_10',
          text: 'The James Webb Space Telescope images of distant galaxies are absolutely mind-blowing. We\'re seeing light from 13 billion years ago.',
          category: 'Science',
          metadata: { subreddit: 'space', upvotes: 23451, comments: 1876 }
        },
        {
          id: 'reddit_11',
          text: 'Remote work has changed everything about work-life balance. What are the long-term implications for city planning and real estate?',
          category: 'Discussion',
          metadata: { subreddit: 'futurology', upvotes: 6789, comments: 934 }
        },
        {
          id: 'reddit_12',
          text: 'Climate change is accelerating faster than predicted. The latest IPCC report shows we have even less time than we thought.',
          category: 'Environment',
          metadata: { subreddit: 'environment', upvotes: 11234, comments: 1567 }
        },
        {
          id: 'reddit_13',
          text: 'Machine learning is revolutionizing drug discovery. New AI models can predict molecular behavior and identify potential treatments faster than ever.',
          category: 'Science',
          metadata: { subreddit: 'MachineLearning', upvotes: 8765, comments: 432 }
        },
        {
          id: 'reddit_14',
          text: 'The rise of plant-based meat alternatives is fascinating. Impossible Burger and Beyond Meat taste remarkably similar to real meat now.',
          category: 'Food',
          metadata: { subreddit: 'food', upvotes: 5432, comments: 891 }
        },
        {
          id: 'reddit_15',
          text: 'Cryptocurrency adoption in developing countries is growing rapidly as people seek alternatives to unstable local currencies.',
          category: 'Finance',
          metadata: { subreddit: 'cryptocurrency', upvotes: 9876, comments: 1345 }
        }
      ];
      break;

    case 'research_papers':
      sampleData = [
        {
          id: 'paper_1',
          text: 'Attention Is All You Need: A Novel Neural Network Architecture Based Solely on Attention Mechanisms for Machine Translation Tasks',
          category: 'Computer Science',
          metadata: { authors: 'Vaswani et al.', journal: 'NIPS', year: 2017, citations: 58000 }
        },
        {
          id: 'paper_2',
          text: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding and Natural Language Processing Applications',
          category: 'Computer Science',
          metadata: { authors: 'Devlin et al.', journal: 'NAACL', year: 2019, citations: 42000 }
        },
        {
          id: 'paper_3',
          text: 'Deep Reinforcement Learning for Autonomous Vehicle Navigation in Complex Urban Environments with Dynamic Obstacles',
          category: 'Robotics',
          metadata: { authors: 'Chen et al.', journal: 'IEEE Robotics', year: 2023, citations: 156 }
        },
        {
          id: 'paper_4',
          text: 'CRISPR-Cas9 Gene Editing Efficiency Enhancement Through Novel Guide RNA Design and Optimization Strategies',
          category: 'Biology',
          metadata: { authors: 'Garcia et al.', journal: 'Nature Biotechnology', year: 2023, citations: 234 }
        },
        {
          id: 'paper_5',
          text: 'Quantum Error Correction Using Surface Codes: Implementation on Superconducting Quantum Processors',
          category: 'Physics',
          metadata: { authors: 'Kumar et al.', journal: 'Physical Review', year: 2023, citations: 89 }
        },
        {
          id: 'paper_6',
          text: 'Climate Change Impact on Global Agriculture: Machine Learning Models for Crop Yield Prediction Under Extreme Weather',
          category: 'Environmental Science',
          metadata: { authors: 'Johnson et al.', journal: 'Nature Climate Change', year: 2023, citations: 178 }
        },
        {
          id: 'paper_7',
          text: 'Novel Drug Discovery Through Generative AI: Accelerating Pharmaceutical Development Using Large Language Models',
          category: 'Medicine',
          metadata: { authors: 'Williams et al.', journal: 'Cell', year: 2023, citations: 201 }
        },
        {
          id: 'paper_8',
          text: 'Federated Learning for Privacy-Preserving Healthcare Analytics: A Comprehensive Survey and Future Directions',
          category: 'Computer Science',
          metadata: { authors: 'Lee et al.', journal: 'ACM Computing Surveys', year: 2023, citations: 134 }
        },
        {
          id: 'paper_9',
          text: 'Sustainable Energy Storage: Advanced Lithium-Sulfur Battery Technology with Enhanced Cycle Life and Safety',
          category: 'Materials Science',
          metadata: { authors: 'Anderson et al.', journal: 'Advanced Materials', year: 2023, citations: 167 }
        },
        {
          id: 'paper_10',
          text: 'Neural Architecture Search for Efficient Edge Computing: Optimizing Deep Learning Models for Mobile Devices',
          category: 'Computer Science',
          metadata: { authors: 'Zhang et al.', journal: 'ICLR', year: 2023, citations: 245 }
        }
      ];
      break;
  }

  // Simulate processing time
  for (let i = 0; i <= 100; i += 10) {
    await new Promise(resolve => setTimeout(resolve, 50));
    onProgress?.({
      stage: 'processing',
      progress: i,
      current: Math.floor((i / 100) * sampleData.length),
      total: sampleData.length,
      message: `Generating sample data... ${i}%`
    });
  }

  return sampleData;
}