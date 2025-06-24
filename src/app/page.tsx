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
  const [hoveredNode, setHoveredNode] = useState<DataPoint | null>(null);
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

  const handleNodeHover = (node: DataPoint | null) => {
    setHoveredNode(node);
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

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Controls Panel */}
          <div className="lg:col-span-1 space-y-4 max-h-screen overflow-y-auto">
            
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
                className="w-full p-2 bg-gray-700 text-white rounded border border-gray-600 placeholder-gray-400"
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
                  className="w-full p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition-colors"
                >
                  {loading ? 'Generating...' : hasEmbeddings ? 'Regenerate Embeddings' : 'Generate Embeddings'}
                </button>
                
                {hasEmbeddings && (
                  <button
                    onClick={downloadEmbeddings}
                    className="w-full p-2 bg-green-600 hover:bg-green-700 rounded transition-colors"
                  >
                    Download Embeddings
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
                  <p className="text-sm text-gray-400 mt-1">{status}</p>
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
                    className="w-full p-2 bg-gray-700 text-white rounded border border-gray-600"
                  >
                    <option value="top3">Top 3 connections per node</option>
                    <option value="top5">Top 5 connections per node</option>
                    <option value="threshold">Similarity threshold</option>
                  </select>
                </div>

                {connectionStrategy === 'threshold' && (
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">
                      Similarity Threshold: {similarityThreshold.toFixed(2)}
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
                    className="w-full p-2 bg-purple-600 hover:bg-purple-700 rounded transition-colors"
                  >
                    Regenerate Graph
                  </button>
                )}
              </div>
              
              <div className="mt-3 pt-3 border-t border-gray-700 text-sm text-gray-400">
                <div>Nodes: <span className="text-white">{graphData.nodes.length}</span></div>
                <div>Connections: <span className="text-white">{graphData.links.length}</span></div>
              </div>
            </div>

            {/* Selected Node Info */}
            {selectedNode && (
              <div className="bg-blue-900 p-4 rounded-lg border border-blue-700">
                <h3 className="text-lg font-semibold mb-2 text-blue-100">Selected Node</h3>
                <div className="text-sm space-y-2">
                  <div>
                    <span className="text-blue-300 font-medium">Text:</span>
                    <p className="text-blue-100 mt-1">{selectedNode.text}</p>
                  </div>
                  {selectedNode.category && (
                    <div>
                      <span className="text-blue-300 font-medium">Category:</span>
                      <p className="text-blue-100">{selectedNode.category}</p>
                    </div>
                  )}
                  {selectedNode.embedding && (
                    <div>
                      <span className="text-blue-300 font-medium">Embedding:</span>
                      <p className="text-blue-100">{selectedNode.embedding.length} dimensions</p>
                    </div>
                  )}
                  {selectedNode.metadata && (
                    <div>
                      <span className="text-blue-300 font-medium">Metadata:</span>
                      <pre className="text-xs text-blue-100 mt-1 bg-blue-800 p-2 rounded overflow-x-auto">
                        {JSON.stringify(selectedNode.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Hover Preview */}
            {hoveredNode && hoveredNode !== selectedNode && (
              <div className="bg-yellow-900 p-3 rounded-lg border border-yellow-700">
                <h4 className="text-sm font-semibold text-yellow-100 mb-1">Hovering</h4>
                <p className="text-xs text-yellow-200">
                  {hoveredNode.text.length > 100 
                    ? hoveredNode.text.substring(0, 100) + '...' 
                    : hoveredNode.text
                  }
                </p>
                {hoveredNode.category && (
                  <p className="text-xs text-yellow-300 mt-1">
                    Category: {hoveredNode.category}
                  </p>
                )}
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="bg-red-900 p-4 rounded-lg border border-red-700">
                <p className="text-red-300">{error}</p>
                <button
                  onClick={() => setError('')}
                  className="mt-2 text-red-400 hover:text-red-200 text-sm font-medium"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>

          {/* Visualization Panel */}
          <div className="lg:col-span-3">
            <div className="bg-gray-800 rounded-lg border border-gray-700" style={{ height: '80vh' }}>
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
                        3. Explore the graph
                      </p>
                    </div>
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