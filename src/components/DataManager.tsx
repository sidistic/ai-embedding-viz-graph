'use client';
import React from 'react';
import { DataStats } from '@/types';
import FileUpload from './FileUpload';

interface DataManagerProps {
  stats: DataStats;
  hasEmbeddings: boolean;
  loading: boolean;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  onDataLoad: (data: DataPoint[]) => void;
  onGenerateEmbeddings: () => void;
  onExport: (format: 'json' | 'csv', includeEmbeddings: boolean) => void;
}

export default function DataManager({
  stats,
  hasEmbeddings,
  loading,
  apiKey,
  onApiKeyChange,
  onDataLoad,
  onGenerateEmbeddings,
  onExport
}: DataManagerProps) {
  return (
    <div className="p-4 space-y-6">
      {/* Step 1: Upload Data */}
      <div>
        <h3 className="text-lg font-semibold mb-3 text-white flex items-center gap-2">
          <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">1</span>
          Upload Data
        </h3>
        <FileUpload onFileLoad={onDataLoad} />
        <div className="mt-3 text-sm text-gray-400 bg-gray-700 p-3 rounded">
          <div>Loaded: <span className="text-white font-medium">{stats.totalItems}</span> items</div>
          <div>Categories: <span className="text-white font-medium">{stats.categories.length}</span></div>
          {hasEmbeddings && (
            <div className="text-green-400 mt-1">
              {stats.withEmbeddings} with embeddings
            </div>
          )}
        </div>
      </div>

      {/* Step 2: API Key */}
      <div>
        <h3 className="text-lg font-semibold mb-3 text-white flex items-center gap-2">
          <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">2</span>
          OpenAI API Key
        </h3>
        <input
          type="password"
          placeholder="sk-..."
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          className="w-full p-3 bg-gray-700 text-white rounded border border-gray-600 placeholder-gray-400"
        />
      </div>

      {/* Step 3: Generate Embeddings */}
      <div>
        <h3 className="text-lg font-semibold mb-3 text-white flex items-center gap-2">
          <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">3</span>
          Generate Embeddings
        </h3>
        
        <button
          onClick={onGenerateEmbeddings}
          disabled={loading || !stats.totalItems || !apiKey}
          className="w-full p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition-colors font-medium"
        >
          {loading ? 'Generating...' : hasEmbeddings ? 'Regenerate' : 'Generate Embeddings'}
        </button>

        {hasEmbeddings && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button
              onClick={() => onExport('json', true)}
              className="p-2 bg-green-600 hover:bg-green-700 rounded transition-colors text-sm font-medium"
            >
              Export JSON
            </button>
            <button
              onClick={() => onExport('csv', true)}
              className="p-2 bg-green-600 hover:bg-green-700 rounded transition-colors text-sm font-medium"
            >
              Export CSV
            </button>
          </div>
        )}
      </div>
    </div>
  );
}