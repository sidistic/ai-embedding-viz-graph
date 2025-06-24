'use client';
import React, { useState, useCallback } from 'react';
import { DataPoint, GraphData } from '@/types';
import { DataProcessor } from '@/lib/dataProcessor';
import { EmbeddingService } from '@/lib/embeddingService';
import GraphVisualization from '@/components/visualization/GraphVisualization';
import FileUpload from '@/components/FileUpload';

export default function Home() {
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState<DataPoint | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [connectionStrategy, setConnectionStrategy] = useState<'top3' | 'top5' | 'threshold'>('top5');
  const [similarityThreshold, setSimilarityThreshold] = useState(0.7);

  const handleFileLoad = useCallback((data: DataPoint[]) => {
    setDataPoints(data);
    setError('');
    
    // Generate graph if embeddings exist
    if (data.some(d => d.embedding)) {
      const graph = DataProcessor.generateGraph(data, connectionStrategy, similarityThreshold);
      setGraphData(graph);
    }
  }, [connectionStrategy, similarityThreshold]);

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
      const texts = dataPoints.map(d => d.text);
      
      const embeddings = await service.generateEmbeddings(texts, (prog, stat) => {
        setProgress(prog);
        setStatus(stat);
      });

      const updatedData = dataPoints.map((point, index) => ({
        ...point,
        embedding: embeddings[index]
      }));

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

  const downloadEmbeddings = () => {
    const dataWithEmbeddings = dataPoints.filter(d => d.embedding);
    if (dataWithEmbeddings.length === 0) {
      setError('No embeddings to download');
      return;
    }

    const blob = new Blob([JSON.stringify(dataWithEmbeddings, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `embeddings_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const regenerateGraph = () => {
    if (dataPoints.some(d => d.embedding)) {
      const graph = DataProcessor.generateGraph(dataPoints, connectionStrategy, similarityThreshold);
      setGraphData(graph);
    }
  };

  const handleNodeClick = (node: DataPoint) => {
    setSelectedNode(node);
  };

  // Dummy function to satisfy the interface but not used for reading
  const handleNodeHover = (node: DataPoint | null) => {
    // This function is required by the interface but we don't use it for reading anymore
    // Only used internally in GraphVisualization for visual feedback
  };

  const hasEmbeddings = dataPoints.some(d => d.embedding);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto p-4">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">
            Data Visualization & Graph Analysis
          </h1>
          <p className="text-gray-300">
            Upload data, generate embeddings, and explore connections through interactive graphs
          </p>
        </header>

        {/* Controls Section - Top */}
        <div className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* File Upload */}
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <h3 className="text-lg font-semibold mb-3 text-white">1. Upload Data</h3>
              <FileUpload onFileLoad={handleFileLoad} onError={setError} />
              <div className="mt-2 text-sm text-gray-400">
                Loaded: <span className="text-white font-medium">{dataPoints.length}</span> items
                {hasEmbeddings && (
                  <span className="text-green-400 ml-2">
                    ({dataPoints.filter(d => d.embedding).length} with embeddings)
                  </span>
                )}
              </div>
            </div>

            {/* API Key */}
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <h3 className="text-lg font-semibold mb-3 text-white">2. OpenAI API Key</h3>
              <input
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full p-2 bg-gray-700 text-white rounded border border-gray-600 placeholder-gray-400 text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">
                Required for generating embeddings
              </p>
            </div>

            {/* Generate Embeddings */}
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <h3 className="text-lg font-semibold mb-3 text-white">3. Generate Embeddings</h3>
              
              <div className="space-y-2">
                <button
                  onClick={generateEmbeddings}
                  disabled={loading || !dataPoints.length || !apiKey}
                  className="w-full p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition-colors text-sm"
                >
                  {loading ? 'Generating...' : hasEmbeddings ? 'Regenerate' : 'Generate'}
                </button>
                
                {hasEmbeddings && (
                  <button
                    onClick={downloadEmbeddings}
                    className="w-full p-2 bg-green-600 hover:bg-green-700 rounded transition-colors text-sm"
                  >
                    Download
                  </button>
                )}
              </div>

              {loading && (
                <div className="mt-3">
                  <div className="bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{status}</p>
                </div>
              )}
            </div>

            {/* Graph Settings */}
            <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <h3 className="text-lg font-semibold mb-3 text-white">4. Graph Settings</h3>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">
                    Connection Strategy:
                  </label>
                  <select
                    value={connectionStrategy}
                    onChange={(e) => {
                      setConnectionStrategy(e.target.value as any);
                      if (hasEmbeddings) regenerateGraph();
                    }}
                    className="w-full p-2 bg-gray-700 text-white rounded border border-gray-600 text-sm"
                  >
                    <option value="top3">Top 3</option>
                    <option value="top5">Top 5</option>
                    <option value="threshold">Threshold</option>
                  </select>
                </div>

                {connectionStrategy === 'threshold' && (
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">
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
                      className="w-full"
                    />
                  </div>
                )}
                
                {hasEmbeddings && (
                  <button
                    onClick={regenerateGraph}
                    className="w-full p-2 bg-purple-600 hover:bg-purple-700 rounded transition-colors text-sm"
                  >
                    Regenerate
                  </button>
                )}
              </div>
              
              <div className="mt-3 pt-3 border-t border-gray-700 text-xs text-gray-400">
                <div>Nodes: <span className="text-white">{graphData.nodes.length}</span></div>
                <div>Links: <span className="text-white">{graphData.links.length}</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 bg-red-900 p-4 rounded-lg border border-red-700">
            <p className="text-red-300">{error}</p>
            <button
              onClick={() => setError('')}
              className="mt-2 text-red-400 hover:text-red-200 text-sm font-medium"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Visualization Section - Bottom */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          
          {/* Graph Visualization */}
          <div className="lg:col-span-3">
            <div className="bg-gray-800 rounded-lg border border-gray-700" style={{ height: '70vh' }}>
              {graphData.nodes.length > 0 ? (
                <GraphVisualization
                  graphData={graphData}
                  onNodeClick={handleNodeClick}
                  onNodeHover={handleNodeHover}
                  selectedNodeId={selectedNode?.id || null}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <div className="text-center">
                    <div className="text-6xl mb-4">📊</div>
                    <div className="space-y-2">
                      <p className="text-lg">Ready to visualize your data</p>
                      <p className="text-sm">
                        1. Upload a CSV/JSON file<br/>
                        2. Generate embeddings<br/>
                        3. Click nodes to explore
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Node Details Card */}
          <div className="lg:col-span-1">
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4" style={{ height: '70vh' }}>
              {selectedNode ? (
                <div className="h-full flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">Node Details</h3>
                    <button
                      onClick={() => setSelectedNode(null)}
                      className="text-gray-400 hover:text-white transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto space-y-4">
                    {/* Node ID */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">ID</label>
                      <p className="text-sm text-gray-100 bg-gray-700 p-2 rounded">{selectedNode.id}</p>
                    </div>

                    {/* Text Content */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Text</label>
                      <div className="text-sm text-gray-100 bg-gray-700 p-3 rounded max-h-32 overflow-y-auto">
                        {selectedNode.text}
                      </div>
                    </div>

                    {/* Category */}
                    {selectedNode.category && (
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Category</label>
                        <p className="text-sm text-gray-100 bg-gray-700 p-2 rounded">{selectedNode.category}</p>
                      </div>
                    )}

                    {/* Embedding Info */}
                    {selectedNode.embedding && (
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Embedding</label>
                        <p className="text-sm text-gray-100 bg-gray-700 p-2 rounded">
                          {selectedNode.embedding.length} dimensions
                        </p>
                        <details className="mt-2">
                          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300">
                            Show first 10 values
                          </summary>
                          <div className="mt-2 text-xs text-gray-300 bg-gray-600 p-2 rounded font-mono">
                            [{selectedNode.embedding.slice(0, 10).map(v => v.toFixed(4)).join(', ')}...]
                          </div>
                        </details>
                      </div>
                    )}

                    {/* Metadata */}
                    {selectedNode.metadata && Object.keys(selectedNode.metadata).length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Metadata</label>
                        <div className="text-xs text-gray-100 bg-gray-700 p-3 rounded overflow-x-auto">
                          <pre>{JSON.stringify(selectedNode.metadata, null, 2)}</pre>
                        </div>
                      </div>
                    )}

                    {/* Connected Nodes */}
                    {graphData.links.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">
                          Connected Nodes ({
                            graphData.links.filter(link => 
                              link.source === selectedNode.id || link.target === selectedNode.id
                            ).length
                          })
                        </label>
                        <div className="space-y-2 max-h-32 overflow-y-auto">
                          {graphData.links
                            .filter(link => link.source === selectedNode.id || link.target === selectedNode.id)
                            .slice(0, 5)
                            .map((link, index) => {
                              const connectedNodeId = link.source === selectedNode.id ? link.target : link.source;
                              const connectedNode = graphData.nodes.find(n => n.id === connectedNodeId);
                              return (
                                <div key={index} className="text-xs bg-gray-700 p-2 rounded">
                                  <div className="font-medium text-gray-200">
                                    {connectedNode?.text.substring(0, 50)}...
                                  </div>
                                  <div className="text-gray-400 mt-1">
                                    Similarity: {link.similarity.toFixed(3)}
                                  </div>
                                </div>
                              );
                            })}
                          {graphData.links.filter(link => 
                            link.source === selectedNode.id || link.target === selectedNode.id
                          ).length > 5 && (
                            <div className="text-xs text-gray-400 text-center py-2">
                              ... and {graphData.links.filter(link => 
                                link.source === selectedNode.id || link.target === selectedNode.id
                              ).length - 5} more
                            </div>
                          )}
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
                    <p className="text-sm">Click on a node in the graph to view its details</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}