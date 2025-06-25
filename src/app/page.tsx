'use client';
import React, { useState, useCallback, useMemo } from 'react';
import { DataPoint, GraphData, SearchResult, SearchState, ConnectionStrategy, ProcessingProgress } from '@/types';
import { DataProcessor } from '@/lib/dataProcessor';
import { EmbeddingService } from '@/lib/embeddingService';
import GraphVisualization from '@/components/visualization/GraphVisualization';
import SearchComponent from '@/components/SearchComponent';
import FileUpload from '@/components/FileUpload';

export default function Home() {
  // Core data state
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState<DataPoint | null>(null);
  
  // Search state
  const [searchState, setSearchState] = useState<SearchState>({
    query: '',
    results: [],
    isActive: false,
    highlightedNodes: new Set()
  });

  // API and processing state
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  
  // Processing state for large datasets
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress | null>(null);

  // Graph configuration
  const [connectionStrategy, setConnectionStrategy] = useState<ConnectionStrategy>('adaptive');
  const [similarityThreshold, setSimilarityThreshold] = useState(0.7);

  // Enhanced file loading with progress tracking
  const handleFileLoad = useCallback(async (data: DataPoint[]) => {
    try {
      setError('');
      setProcessingProgress({
        stage: 'loading',
        progress: 0,
        current: 0,
        total: data.length,
        message: 'Processing uploaded data...'
      });

      // Process data in chunks for large datasets
      const processedData = await new Promise<DataPoint[]>((resolve) => {
        setTimeout(() => {
          setProcessingProgress({
            stage: 'validating',
            progress: 50,
            current: data.length / 2,
            total: data.length,
            message: 'Validating data format...'
          });

          // Validate and clean data
          const validData = data.filter(point => point.text && point.text.length > 0);
          
          setProcessingProgress({
            stage: 'complete',
            progress: 100,
            current: validData.length,
            total: validData.length,
            message: `Successfully loaded ${validData.length} items`
          });

          resolve(validData);
        }, 100);
      });

      setDataPoints(processedData);
      
      // Generate graph if embeddings exist
      if (processedData.some(d => d.embedding)) {
        const graph = DataProcessor.generateGraph(processedData, connectionStrategy, similarityThreshold);
        setGraphData(graph);
      }

      // Log statistics
      const stats = DataProcessor.getDataStats(processedData);
      console.log('Dataset loaded:', stats);

    } catch (err: any) {
      setError(`Failed to process data: ${err.message}`);
    } finally {
      setProcessingProgress(null);
    }
  }, [connectionStrategy, similarityThreshold]);

  // Enhanced embedding generation with better progress tracking
  const generateEmbeddings = async () => {
    if (!apiKey) {
      setError('Please enter OpenAI API key');
      return;
    }

    if (!dataPoints.length) {
      setError('Please upload data first');
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      const service = new EmbeddingService(apiKey);
      
      // Estimate cost for large datasets
      const costEstimate = await service.estimateCost(
        dataPoints.length,
        dataPoints.slice(0, 10).map(d => d.text)
      );

      // Warn user about cost for large datasets
      if (dataPoints.length > 1000) {
        const confirmed = window.confirm(
          `You're about to generate embeddings for ${dataPoints.length} items.\n` +
          `Estimated cost: $${costEstimate.cost.toFixed(4)}\n` +
          `This may take several minutes. Continue?`
        );
        
        if (!confirmed) {
          setLoading(false);
          return;
        }
      }

      const updatedData = await service.processDataPointsWithEmbeddings(
        dataPoints,
        (prog: ProcessingProgress) => {
          setProgress(prog.progress);
          setStatus(prog.message);
        }
      );

      setDataPoints(updatedData);
      
      // Generate graph
      const graph = DataProcessor.generateGraph(updatedData, connectionStrategy, similarityThreshold);
      setGraphData(graph);
      
      setStatus('Graph generated successfully!');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Search functionality
  const handleSearchResults = useCallback((results: SearchResult[]) => {
    setSearchState(prev => ({
      ...prev,
      results,
      isActive: results.length > 0,
      highlightedNodes: new Set(results.map(r => r.node.id))
    }));

    // If we have search results, clear node selection to avoid conflicts
    if (results.length > 0) {
      setSelectedNode(null);
    }
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchState({
      query: '',
      results: [],
      isActive: false,
      highlightedNodes: new Set()
    });
  }, []);

  // Enhanced graph regeneration
  const regenerateGraph = useCallback(() => {
    if (dataPoints.some(d => d.embedding)) {
      try {
        const graph = DataProcessor.generateGraph(dataPoints, connectionStrategy, similarityThreshold);
        setGraphData(graph);
        
        // Clear search if active
        if (searchState.isActive) {
          handleClearSearch();
        }
      } catch (err: any) {
        setError(`Failed to regenerate graph: ${err.message}`);
      }
    }
  }, [dataPoints, connectionStrategy, similarityThreshold, searchState.isActive, handleClearSearch]);

  // Node interaction handlers
  const handleNodeClick = useCallback((node: DataPoint | null) => {
    setSelectedNode(node);
    
    // Clear search highlighting when selecting a node
    if (node && searchState.isActive) {
      handleClearSearch();
    }
  }, [searchState.isActive, handleClearSearch]);

  const handleNodeHover = useCallback((node: DataPoint | null) => {
    // This function is required by the interface but we use it for internal hover effects
  }, []);

  // Enhanced data export
  const downloadData = useCallback((format: 'json' | 'csv' = 'json', includeEmbeddings = true) => {
    try {
      const filteredData = includeEmbeddings 
        ? dataPoints.filter(d => d.embedding)
        : dataPoints;
        
      if (filteredData.length === 0) {
        setError(`No data ${includeEmbeddings ? 'with embeddings ' : ''}to download`);
        return;
      }

      const content = DataProcessor.exportData(filteredData, format, includeEmbeddings);
      const blob = new Blob([content], {
        type: format === 'json' ? 'application/json' : 'text/csv'
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `data_${includeEmbeddings ? 'with_embeddings_' : ''}${new Date().toISOString().split('T')[0]}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(`Failed to export data: ${err.message}`);
    }
  }, [dataPoints]);

  // Computed values
  const hasEmbeddings = useMemo(() => dataPoints.some(d => d.embedding), [dataPoints]);
  const stats = useMemo(() => DataProcessor.getDataStats(dataPoints), [dataPoints]);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <header className="p-4 border-b border-gray-700">
        <h1 className="text-2xl font-bold text-white mb-1">
          Data Visualization & Graph Analysis
        </h1>
        <p className="text-gray-300 text-sm">
          Upload data, generate embeddings, search through content, and explore connections through interactive graphs
        </p>
      </header>

      {/* Top Controls Bar - Graph Settings & Search */}
      <div className="p-4 border-b border-gray-700 bg-gray-800">
        <div className="flex flex-wrap items-center gap-4">
          
          {/* Graph Settings */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-300">
                Connection:
              </label>
              <select
                value={connectionStrategy}
                onChange={(e) => {
                  setConnectionStrategy(e.target.value as ConnectionStrategy);
                  if (hasEmbeddings) regenerateGraph();
                }}
                className="px-3 py-1 bg-gray-700 text-white rounded border border-gray-600 text-sm"
              >
                <option value="top3">Top 3</option>
                <option value="top5">Top 5</option>
                <option value="top10">Top 10</option>
                <option value="threshold">Threshold</option>
                <option value="adaptive">Adaptive</option>
                <option value="category_based">Category-based</option>
              </select>
            </div>

            {connectionStrategy === 'threshold' && (
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-300">
                  Threshold: {similarityThreshold.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0.3"
                  max="0.9"
                  step="0.05"
                  value={similarityThreshold}
                  onChange={(e) => {
                    setSimilarityThreshold(parseFloat(e.target.value));
                    if (hasEmbeddings) regenerateGraph();
                  }}
                  className="w-24"
                />
              </div>
            )}

            {hasEmbeddings && (
              <button
                onClick={regenerateGraph}
                className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded transition-colors text-sm"
              >
                Regenerate
              </button>
            )}
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 ml-auto">
            <SearchComponent
              nodes={graphData.nodes}
              onSearchResults={handleSearchResults}
              onClearSearch={handleClearSearch}
              disabled={graphData.nodes.length === 0}
            />
          </div>

          {/* Stats */}
          <div className="text-xs text-gray-400 border-l border-gray-600 pl-4">
            <span className="mr-4">Nodes: <span className="text-white">{graphData.nodes.length}</span></span>
            <span>Links: <span className="text-white">{graphData.links.length}</span></span>
          </div>
        </div>
      </div>

      {/* Processing Progress Display */}
      {processingProgress && (
        <div className="mx-4 mt-4 bg-blue-900 p-3 rounded-lg border border-blue-700">
          <div className="flex items-center justify-between mb-2">
            <p className="text-blue-300 font-medium text-sm">
              {processingProgress.message}
            </p>
            <span className="text-blue-200 text-xs">
              {processingProgress.current}/{processingProgress.total}
            </span>
          </div>
          <div className="bg-blue-800 rounded-full h-2">
            <div 
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${processingProgress.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mx-4 mt-4 bg-red-900 p-3 rounded-lg border border-red-700">
          <p className="text-red-300 text-sm">{error}</p>
          <button
            onClick={() => setError('')}
            className="mt-2 text-red-400 hover:text-red-200 text-xs font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar - Data & Embeddings */}
        <div className="w-80 bg-gray-800 border-r border-gray-700 p-4 overflow-y-auto">
          <div className="space-y-6">
            
            {/* File Upload */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-white flex items-center gap-2">
                <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">1</span>
                Upload Data
              </h3>
              <FileUpload onFileLoad={handleFileLoad} onError={setError} />
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

            {/* API Key */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-white flex items-center gap-2">
                <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">2</span>
                OpenAI API Key
              </h3>
              <input
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full p-3 bg-gray-700 text-white rounded border border-gray-600 placeholder-gray-400"
              />
              <p className="text-xs text-gray-400 mt-2">
                Required for generating embeddings
              </p>
            </div>

            {/* Generate Embeddings */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-white flex items-center gap-2">
                <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">3</span>
                Generate Embeddings
              </h3>
              
              <div className="space-y-3">
                <button
                  onClick={generateEmbeddings}
                  disabled={loading || !dataPoints.length || !apiKey}
                  className="w-full p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition-colors font-medium"
                >
                  {loading ? 'Generating...' : hasEmbeddings ? 'Regenerate Embeddings' : 'Generate Embeddings'}
                </button>
                
                {hasEmbeddings && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => downloadData('json')}
                      className="p-2 bg-green-600 hover:bg-green-700 rounded transition-colors text-sm font-medium"
                    >
                      JSON
                    </button>
                    <button
                      onClick={() => downloadData('csv')}
                      className="p-2 bg-green-600 hover:bg-green-700 rounded transition-colors text-sm font-medium"
                    >
                      CSV
                    </button>
                  </div>
                )}
              </div>

              {loading && (
                <div className="mt-4">
                  <div className="bg-gray-700 rounded-full h-3">
                    <div 
                      className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-sm text-gray-400 mt-2">{status}</p>
                </div>
              )}

              {/* Embedding Stats */}
              {hasEmbeddings && (
                <div className="mt-4 bg-gray-700 p-3 rounded text-sm">
                  <div className="text-white font-medium mb-2">Embedding Statistics</div>
                  <div className="space-y-1 text-gray-300">
                    <div>Total items: {stats.totalItems}</div>
                    <div>With embeddings: {stats.withEmbeddings}</div>
                    <div>Dimensions: {dataPoints.find(d => d.embedding)?.embedding?.length || 0}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Graph Area */}
        <div className="flex-1 bg-gray-900">
          {graphData.nodes.length > 0 ? (
            <GraphVisualization
              graphData={graphData}
              onNodeClick={handleNodeClick}
              onNodeHover={handleNodeHover}
              selectedNodeId={selectedNode?.id || null}
              searchResults={searchState.results}
              searchHighlightColor="#ff6b35"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <div className="text-6xl mb-4">📊</div>
                <div className="space-y-2">
                  <p className="text-xl">Ready to visualize your data</p>
                  <p className="text-sm max-w-md">
                    Upload a CSV or JSON file, add your OpenAI API key, generate embeddings, 
                    and explore the connections between your data points.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar - Node Details / Search Results */}
        <div className="w-80 bg-gray-800 border-l border-gray-700 p-4 overflow-y-auto">
          {/* Search Results Priority Display */}
          {searchState.isActive && searchState.results.length > 0 ? (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Search Results</h3>
                <button
                  onClick={handleClearSearch}
                  className="text-gray-400 hover:text-white transition-colors text-lg"
                >
                  ✕
                </button>
              </div>
              
              <div className="flex-1 space-y-3">
                {searchState.results.map((result, index) => (
                  <div
                    key={result.node.id}
                    className="p-3 bg-gray-700/50 rounded border border-gray-600 hover:bg-gray-700/70 transition-colors cursor-pointer"
                    onClick={() => handleNodeClick(result.node)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">
                          #{index + 1}
                        </span>
                        {result.node.category && (
                          <span className="px-2 py-0.5 bg-blue-600 text-blue-100 text-xs rounded">
                            {result.node.category}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">
                        {(result.score * 100).toFixed(0)}%
                      </span>
                    </div>
                    
                    <p className="text-sm text-gray-200 line-clamp-3" title={result.node.text}>
                      {result.node.text}
                    </p>
                    
                    {result.matchedText && (
                      <p className="text-xs text-gray-400 mt-2 line-clamp-2">
                        Match: {result.matchedText}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : selectedNode ? (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Node Details</h3>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-gray-400 hover:text-white transition-colors text-lg"
                >
                  ✕
                </button>
              </div>
              
              <div className="flex-1 space-y-4">
                {/* Node ID */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">ID</label>
                  <div className="text-sm text-gray-100 bg-gray-700 p-3 rounded">{selectedNode.id}</div>
                </div>

                {/* Text Content */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Text</label>
                  <div className="text-sm text-gray-100 bg-gray-700 p-3 rounded max-h-40 overflow-y-auto">
                    {selectedNode.text}
                  </div>
                </div>

                {/* Category */}
                {selectedNode.category && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Category</label>
                    <div className="text-sm text-gray-100 bg-gray-700 p-3 rounded flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full border border-white/20" 
                        style={{ backgroundColor: (graphData.nodes.find(n => n.id === selectedNode.id) as any)?.color }}
                      />
                      {selectedNode.category}
                    </div>
                  </div>
                )}

                {/* Embedding Info */}
                {selectedNode.embedding && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Embedding</label>
                    <div className="text-sm text-gray-100 bg-gray-700 p-3 rounded">
                      <div className="mb-2">{selectedNode.embedding.length} dimensions</div>
                      <details>
                        <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300 mb-2">
                          Show first 10 values
                        </summary>
                        <div className="text-xs text-gray-300 bg-gray-600 p-2 rounded font-mono overflow-x-auto">
                          [{selectedNode.embedding.slice(0, 10).map(v => v.toFixed(4)).join(', ')}...]
                        </div>
                      </details>
                    </div>
                  </div>
                )}

                {/* Connected Nodes */}
                {graphData.links.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Connected Nodes ({
                        graphData.links.filter(link => 
                          link.source === selectedNode.id || link.target === selectedNode.id
                        ).length
                      })
                    </label>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {graphData.links
                        .filter(link => link.source === selectedNode.id || link.target === selectedNode.id)
                        .slice(0, 10)
                        .map((link, index) => {
                          const connectedNodeId = link.source === selectedNode.id ? link.target : link.source;
                          const connectedNode = graphData.nodes.find(n => n.id === connectedNodeId);
                          return (
                            <div 
                              key={index} 
                              className="text-xs bg-gray-700 p-3 rounded hover:bg-gray-600 cursor-pointer transition-colors"
                              onClick={() => connectedNode && setSelectedNode(connectedNode)}
                            >
                              <div className="font-medium text-gray-200 mb-1">
                                {connectedNode?.text.substring(0, 60)}...
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-gray-400">
                                  Similarity: {link.similarity.toFixed(3)}
                                </span>
                                {connectedNode?.category && (
                                  <span className="text-xs bg-gray-600 px-2 py-1 rounded">
                                    {connectedNode.category}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                {selectedNode.metadata && Object.keys(selectedNode.metadata).length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Metadata</label>
                    <div className="text-xs text-gray-100 bg-gray-700 p-3 rounded overflow-x-auto">
                      <pre className="whitespace-pre-wrap">{JSON.stringify(selectedNode.metadata, null, 2)}</pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">
              <div className="text-center">
                <div className="text-4xl mb-4">🎯</div>
                <p className="text-lg mb-2">No node selected</p>
                <p className="text-sm">Click on a node in the graph or search to view details and connections</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}