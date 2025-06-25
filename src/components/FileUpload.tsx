'use client';
import React, { useCallback, useRef, useState } from 'react';
import { DataPoint, ProcessingProgress } from '@/types';
import { DataService } from '@/lib/data-service';

interface FileUploadProps {
  onFileLoad: (data: DataPoint[]) => void;
  onError?: (error: string) => void;
  onProgress?: (progress: ProcessingProgress) => void;
}

export default function FileUpload({ onFileLoad, onError, onProgress }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const processFile = useCallback(async (file: File) => {
    if (!file || isLoading) return;

    setIsLoading(true);
    const error = (msg: string) => {
      onError?.(msg);
      setIsLoading(false);
    };

    try {
      // Validate file
      if (file.size > 50 * 1024 * 1024) {
        throw new Error(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB`);
      }

      // Read file content
      const content = await readFile(file);
      let data: DataPoint[] = [];

      // Route to appropriate loader
      const extension = file.name.toLowerCase().split('.').pop();
      switch (extension) {
        case 'csv':
          data = await DataService.loadFromCSV(content, {}, onProgress);
          break;
        case 'json':
          data = await DataService.loadFromJSON(content, {}, onProgress);
          break;
        case 'txt':
          data = await DataService.loadFromText(content, onProgress);
          break;
        default:
          throw new Error(`Unsupported file type: ${extension}`);
      }

      if (data.length === 0) {
        throw new Error('No valid data found in file');
      }

      onFileLoad(data);
    } catch (err: any) {
      error(err.message);
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [isLoading, onFileLoad, onError, onProgress]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const loadSampleData = useCallback(async (type: 'ag_news' | 'reddit' | 'research') => {
    setIsLoading(true);
    try {
      const data = await generateSampleData(type);
      onFileLoad(data);
    } catch (err: any) {
      onError?.(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [onFileLoad, onError]);

  return (
    <div className="space-y-4">
      {/* Main Drop Zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all
          ${isDragging ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-600'}
          ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-500 hover:bg-gray-800/50'}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.json,.txt"
          onChange={handleFileSelect}
          disabled={isLoading}
          className="hidden"
        />
        
        {isLoading ? (
          <div className="space-y-2">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
            <p className="text-blue-400 font-medium">Processing file...</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-4xl mb-2">📁</div>
            <p className="text-white font-medium">
              {isDragging ? 'Drop file here' : 'Click to upload or drag & drop'}
            </p>
            <p className="text-gray-400 text-sm">CSV, JSON, and TXT files (up to 50MB)</p>
          </div>
        )}
      </div>

      {/* Sample Data Buttons */}
      <div className="grid grid-cols-1 gap-2">
        <button
          onClick={() => loadSampleData('ag_news')}
          disabled={isLoading}
          className="p-2 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-800 rounded transition-colors text-sm"
        >
          Load Sample: AG News (20 items)
        </button>
        <button
          onClick={() => loadSampleData('reddit')}
          disabled={isLoading}
          className="p-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-800 rounded transition-colors text-sm"
        >
          Load Sample: Reddit Comments (15 items)
        </button>
        <button
          onClick={() => loadSampleData('research')}
          disabled={isLoading}
          className="p-2 bg-purple-700 hover:bg-purple-600 disabled:bg-gray-800 rounded transition-colors text-sm"
        >
          Load Sample: Research Papers (10 items)
        </button>
      </div>

      {/* Format Help */}
      <details className="bg-gray-700/30 rounded p-3">
        <summary className="text-sm text-gray-300 cursor-pointer hover:text-white">
          💡 Supported Formats
        </summary>
        <div className="mt-2 text-xs text-gray-400 space-y-1">
          <div><strong>CSV:</strong> 'text', 'category', 'embedding' columns</div>
          <div><strong>JSON:</strong> Array of objects with 'text' property</div>
          <div><strong>TXT:</strong> One item per line, # for categories</div>
        </div>
      </details>
    </div>
  );
}

// Utility functions
function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

async function generateSampleData(type: 'ag_news' | 'reddit' | 'research'): Promise<DataPoint[]> {
  // This would be moved to a separate sample data service
  const samples = {
    ag_news: [
      {
        id: 'ag_1',
        text: 'Breaking: Climate Summit Reaches Historic Agreement on Carbon Emissions',
        category: 'World',
        metadata: { source: 'Reuters', date: '2024-01-15' }
      },
      {
        id: 'ag_2',
        text: 'NBA Finals Game 7: Lakers Defeat Celtics 108-102 in Epic Championship Battle',
        category: 'Sports',
        metadata: { source: 'ESPN', date: '2024-01-14' }
      },
      // ... more samples
    ],
    reddit: [
      {
        id: 'reddit_1',
        text: 'What productivity app changed your life? I recently started using Notion and it completely transformed how I organize my thoughts.',
        category: 'AskReddit',
        metadata: { subreddit: 'AskReddit', upvotes: 2847 }
      },
      // ... more samples
    ],
    research: [
      {
        id: 'paper_1',
        text: 'Attention Is All You Need: A Novel Neural Network Architecture Based Solely on Attention Mechanisms',
        category: 'Computer Science',
        metadata: { authors: 'Vaswani et al.', journal: 'NIPS', year: 2017 }
      },
      // ... more samples
    ]
  };

  return samples[type] || [];
}