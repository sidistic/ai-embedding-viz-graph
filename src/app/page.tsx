'use client';
import React, { useState, useEffect } from 'react';
import { NewsArticle, VisualizationConfig } from '@/types';
import { DataProcessor } from '@/lib/dataProcessor';
import { EmbeddingService } from '@/lib/embeddingService';
import GraphVisualization from '@/components/visualization/GraphVisualization';

export default function Home() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);
  const [hoveredArticle, setHoveredArticle] = useState<NewsArticle | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [embeddingService, setEmbeddingService] = useState<EmbeddingService | null>(null);
  const [vizConfig, setVizConfig] = useState<Partial<VisualizationConfig>>({
    linkThreshold: 0.6,
    showLabels: true,
    showLinks: true
  });

  // Load API key from environment and sample data on component mount
  useEffect(() => {
    // Try to get API key from environment (for development)
    const envApiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    if (envApiKey && envApiKey.startsWith('sk-')) {
      setApiKey(envApiKey);
    }
    
    loadSampleData();
  }, []);

  // Initialize embedding service when API key is provided
  useEffect(() => {
    if (apiKey && apiKey.startsWith('sk-')) {
      setEmbeddingService(new EmbeddingService(apiKey));
      setShowApiKeyInput(false);
    }
  }, [apiKey]);

  const loadSampleData = async () => {
    try {
      setLoading(true);
      setError(null);
      setStatus('Loading sample data...');
      
      const sampleArticles = await DataProcessor.loadSampleData();
      setArticles(sampleArticles);
      setStatus(`Loaded ${sampleArticles.length} articles`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const generateEmbeddings = async () => {
    if (!embeddingService) {
      setShowApiKeyInput(true);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setProgress(0);

      const cost = await embeddingService.estimateCost(articles.length);
      const confirmed = window.confirm(
        `This will generate embeddings for ${articles.length} articles.\n` +
        `Estimated cost: $${cost.cost.toFixed(4)} (${cost.tokens} tokens)\n\n` +
        `Continue?`
      );

      if (!confirmed) {
        setLoading(false);
        return;
      }

      const processedArticles = await embeddingService.processArticlesWithEmbeddings(
        articles,
        (prog, stat) => {
          setProgress(prog);
          setStatus(stat);
        }
      );

      setArticles(processedArticles);
      setProgress(100);
      setStatus('Embeddings generated successfully!');
    } catch (err: any) {
      setError(err.message);
      setProgress(0);
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  const handleNodeClick = (article: NewsArticle) => {
    setSelectedArticle(article);
  };

  const handleNodeHover = (article: NewsArticle | null) => {
    setHoveredArticle(article);
  };

  const handleApiKeySubmit = () => {
    if (apiKey && apiKey.startsWith('sk-')) {
      setEmbeddingService(new EmbeddingService(apiKey));
      setShowApiKeyInput(false);
    } else {
      alert('Please enter a valid OpenAI API key starting with "sk-"');
    }
  };

  const stats = DataProcessor.getArticleStats(articles);
  const embeddingStats = embeddingService?.getEmbeddingStats(articles);
  const hasEmbeddings = articles.some(a => a.embedding);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto p-4">
        {/* Header */}
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">
            Data Visualization & Graph Analysis
          </h1>
          <p className="text-gray-300">
            Exploring AG News dataset with embeddings and similarity graphs
          </p>
        </header>

        {/* API Key Input Modal */}
        {showApiKeyInput && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full mx-4 border border-gray-600">
              <h3 className="text-lg font-semibold mb-4 text-white">OpenAI API Key Required</h3>
              <p className="text-gray-300 mb-4">
                To generate embeddings, please enter your OpenAI API key:
              </p>
              <input
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full p-3 border border-gray-600 rounded-md mb-4 bg-gray-700 text-white placeholder-gray-400"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setShowApiKeyInput(false)}
                  className="flex-1 px-4 py-2 border border-gray-600 rounded-md text-gray-300 hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApiKeySubmit}
                  disabled={!apiKey}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-600"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Left Controls Panel */}
          <div className="lg:col-span-1 space-y-4">
            {/* Data Stats */}
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <h3 className="font-semibold mb-3 text-white">Dataset Stats</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-300">Total Articles:</span>
                  <span className="font-medium text-white">{stats.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">With Embeddings:</span>
                  <span className="font-medium text-white">{stats.withEmbeddings}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">Avg Text Length:</span>
                  <span className="font-medium text-white">{stats.averageTextLength || 0}</span>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-700">
                <h4 className="font-medium text-sm mb-2 text-white">By Category:</h4>
                {Object.entries(stats.byCategory).map(([category, count]) => (
                  <div key={category} className="flex justify-between text-sm">
                    <span className="text-gray-300">{category}:</span>
                    <span className="font-medium text-white">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Controls */}
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <h3 className="font-semibold mb-3 text-white">Controls</h3>
              
              <div className="space-y-3">
                <button
                  onClick={loadSampleData}
                  disabled={loading}
                  className="w-full px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:bg-gray-500"
                >
                  Reload Data
                </button>

                <button
                  onClick={generateEmbeddings}
                  disabled={loading || articles.length === 0}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-500"
                >
                  {hasEmbeddings ? 'Regenerate Embeddings' : 'Generate Embeddings'}
                </button>

                <button
                  onClick={() => setShowApiKeyInput(true)}
                  className="w-full px-4 py-2 border border-blue-600 text-blue-400 rounded-md hover:bg-blue-600 hover:text-white"
                >
                  {apiKey ? 'Change API Key' : 'Set API Key'}
                </button>
              </div>
            </div>

            {/* Visualization Settings */}
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <h3 className="font-semibold mb-3 text-white">Visualization</h3>
              
              <div className="space-y-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={vizConfig.showLabels}
                    onChange={(e) => setVizConfig(prev => ({ ...prev, showLabels: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-300">Show Labels</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={vizConfig.showLinks}
                    onChange={(e) => setVizConfig(prev => ({ ...prev, showLinks: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-300">Show Similarity Links</span>
                </label>

                <div>
                  <label className="block text-sm mb-1 text-gray-300">
                    Link Threshold: {vizConfig.linkThreshold?.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min="0.3"
                    max="0.9"
                    step="0.05"
                    value={vizConfig.linkThreshold || 0.6}
                    onChange={(e) => setVizConfig(prev => ({ 
                      ...prev, 
                      linkThreshold: parseFloat(e.target.value) 
                    }))}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {/* Loading Progress */}
            {loading && (
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <h3 className="font-semibold mb-3 text-white">Progress</h3>
                <div className="space-y-2">
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-sm text-gray-300">{status}</p>
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="bg-red-900 border border-red-700 rounded-lg p-4">
                <p className="text-red-300 text-sm">{error}</p>
                <button
                  onClick={() => setError(null)}
                  className="mt-2 text-red-400 hover:text-red-200 font-medium text-sm"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>

          {/* Main Visualization - Much Larger */}
          <div className="lg:col-span-3">
            <div className="bg-gray-900 rounded-lg border border-gray-700" style={{ height: '80vh' }}>
              {articles.length > 0 ? (
                <GraphVisualization
                  articles={articles}
                  config={vizConfig}
                  onNodeClick={handleNodeClick}
                  onNodeHover={handleNodeHover}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <div className="text-center">
                    <div className="text-6xl mb-4">📊</div>
                    <p>Load data to see visualization</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Article Details Panel */}
          <div className="lg:col-span-1 space-y-4">
            {/* Selected Article */}
            {selectedArticle && (
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <h3 className="font-semibold mb-3 text-white">Selected Article</h3>
                <div className="space-y-2">
                  <div>
                    <span className="text-xs text-gray-400 uppercase">Category</span>
                    <p className="font-medium text-white">{selectedArticle.category}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 uppercase">Title</span>
                    <p className="font-medium text-gray-200">{selectedArticle.title}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 uppercase">Description</span>
                    <p className="text-sm text-gray-300">{selectedArticle.description}</p>
                  </div>
                  {selectedArticle.embedding && (
                    <div>
                      <span className="text-xs text-gray-400 uppercase">Embedding</span>
                      <p className="text-xs text-gray-400">
                        {selectedArticle.embedding.length} dimensions
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Hovered Article */}
            {hoveredArticle && hoveredArticle !== selectedArticle && (
              <div className="bg-blue-900 p-4 rounded-lg border border-blue-700">
                <h3 className="font-semibold mb-2 text-blue-100">Hovering</h3>
                <div className="space-y-1">
                  <p className="font-medium text-sm text-blue-200">{hoveredArticle.category}</p>
                  <p className="text-sm text-blue-300">{hoveredArticle.title}</p>
                </div>
              </div>
            )}

            {/* Embedding Stats */}
            {embeddingStats && (
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <h3 className="font-semibold mb-3 text-white">Embedding Stats</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Completion:</span>
                    <span className="font-medium text-white">{embeddingStats.completionRate}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Dimensions:</span>
                    <span className="font-medium text-white">{embeddingStats.dimensions}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Ready for Analysis:</span>
                    <span className="font-medium text-white">{embeddingStats.withEmbeddings}/{embeddingStats.total}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}