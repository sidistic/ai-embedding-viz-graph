'use client';
import React, { useCallback, useRef, useState } from 'react';
import { DataPoint } from '@/types';
import { DataProcessor } from '@/lib/dataProcessor';

interface FileUploadProps {
  onFileLoad: (data: DataPoint[]) => void;
  onError: (error: string) => void;
}

export default function FileUpload({ onFileLoad, onError }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const processingRef = useRef(false);

  const processFile = useCallback(async (file: File) => {
    if (!file || processingRef.current) return;

    processingRef.current = true;
    setIsLoading(true);
    onError(''); // Clear previous errors

    try {
      const content = await readFileContent(file);
      let data: DataPoint[] = [];

      if (file.name.toLowerCase().endsWith('.json')) {
        data = await DataProcessor.loadJSONData(content);
      } else if (file.name.toLowerCase().endsWith('.csv')) {
        data = await DataProcessor.loadCSVData(content);
      } else {
        throw new Error('Unsupported file format. Please use CSV or JSON files.');
      }

      if (data.length === 0) {
        throw new Error('No valid data found in file. Please check the file format.');
      }

      // Log successful loading info
      const stats = DataProcessor.getDataStats(data);
      console.log('File loaded successfully:', {
        totalItems: stats.total,
        withEmbeddings: stats.withEmbeddings,
        categories: Array.from(stats.categories),
        embeddingDimensions: stats.embeddingDimensions
      });

      onFileLoad(data);
    } catch (error: any) {
      console.error('File processing error:', error);
      onError(error.message || 'Failed to process file');
    } finally {
      setIsLoading(false);
      processingRef.current = false;
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [onFileLoad, onError]);

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
          accept=".csv,.json"
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
            </>
          ) : (
            <>
              <div className="text-4xl text-gray-400 mb-2">📁</div>
              <p className="text-white font-medium">
                {isDragging ? 'Drop file here' : 'Click to upload or drag & drop'}
              </p>
              <p className="text-gray-400 text-sm">
                Supports CSV and JSON files
              </p>
            </>
          )}
        </div>
      </div>

      {/* File Format Info */}
      <div className="bg-gray-800/50 rounded-lg p-3 text-sm">
        <h4 className="text-white font-medium mb-2">Expected File Formats:</h4>
        <div className="space-y-2 text-gray-300">
          <div>
            <span className="font-medium text-blue-400">CSV:</span> Must have a 'text' column. 
            Optional: 'id', 'category', 'embedding' (JSON array), 'metadata' (JSON object)
          </div>
          <div>
            <span className="font-medium text-green-400">JSON:</span> Array of objects with 'text' property. 
            Optional: 'id', 'category', 'embedding', 'metadata'
          </div>
        </div>
      </div>

      {/* Sample Data Button */}
      <button
        onClick={loadSampleData}
        disabled={isLoading || processingRef.current}
        className="w-full p-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded transition-colors"
      >
        Load Sample Data (AG News)
      </button>
    </div>
  );

  // Load sample data function
  async function loadSampleData() {
    if (processingRef.current) return;
    
    processingRef.current = true;
    setIsLoading(true);
    try {
      const sampleData = await generateSampleData();
      onFileLoad(sampleData);
    } catch (error: any) {
      onError(error.message);
    } finally {
      setIsLoading(false);
      processingRef.current = false;
    }
  }
}

// Utility function to read file content
function readFileContent(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      resolve(content);
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    reader.readAsText(file);
  });
}

// Generate sample data for testing
async function generateSampleData(): Promise<DataPoint[]> {
  const sampleData: DataPoint[] = [
    {
      id: 'news_1',
      text: 'Breaking: Climate Summit Reaches Historic Agreement on Carbon Emissions',
      category: 'World',
      metadata: { source: 'Reuters', date: '2024-01-15' }
    },
    {
      id: 'news_2', 
      text: 'NBA Finals Game 7: Lakers vs Celtics in Epic Championship Battle',
      category: 'Sports',
      metadata: { source: 'ESPN', date: '2024-01-14' }
    },
    {
      id: 'news_3',
      text: 'Federal Reserve Announces Interest Rate Decision Amid Economic Uncertainty',
      category: 'Business', 
      metadata: { source: 'Bloomberg', date: '2024-01-13' }
    },
    {
      id: 'news_4',
      text: 'AI Breakthrough: New Language Model Demonstrates Advanced Reasoning Capabilities',
      category: 'Technology',
      metadata: { source: 'TechCrunch', date: '2024-01-12' }
    },
    {
      id: 'news_5',
      text: 'European Union Implements New Digital Privacy Regulations for Tech Companies',
      category: 'World',
      metadata: { source: 'BBC', date: '2024-01-11' }
    },
    {
      id: 'news_6',
      text: 'World Cup Qualifiers: Surprising Upsets in South American Tournament',
      category: 'Sports',
      metadata: { source: 'FIFA', date: '2024-01-10' }
    },
    {
      id: 'news_7',
      text: 'Tesla Announces Revolutionary Battery Technology with 1000-Mile Range',
      category: 'Business',
      metadata: { source: 'MarketWatch', date: '2024-01-09' }
    },
    {
      id: 'news_8',
      text: 'Quantum Computing Milestone: Error-Free Calculations Achieved for First Time',
      category: 'Technology',
      metadata: { source: 'Nature', date: '2024-01-08' }
    }
  ];

  return sampleData;
}