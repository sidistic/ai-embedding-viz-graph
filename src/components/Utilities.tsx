'use client';
import React, { useState, useEffect } from 'react';
import { DataPoint, GraphData, DataStats } from '@/types';
import { DataProcessor } from '@/lib/dataProcessor';
import { EmbeddingService } from '@/lib/embeddingService';

interface UtilitiesProps {
  dataPoints: DataPoint[];
  graphData: GraphData;
  onExport?: (data: string, filename: string) => void;
  onError?: (error: string) => void;
}

export default function Utilities({ dataPoints, graphData, onExport, onError }: UtilitiesProps) {
  const [stats, setStats] = useState<DataStats | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('json');
  const [includeEmbeddings, setIncludeEmbeddings] = useState(true);
  const [performanceMetrics, setPerformanceMetrics] = useState<{
    loadTime: number;
    graphGenerationTime: number;
    memoryUsage: string;
  } | null>(null);

  // Calculate statistics when data changes
  useEffect(() => {
    if (dataPoints.length > 0) {
      const startTime = performance.now();
      const dataStats = DataProcessor.getDataStats(dataPoints);
      const endTime = performance.now();
      
      setStats(dataStats);
      
      // Update performance metrics
      setPerformanceMetrics(prev => ({
        ...prev!,
        loadTime: endTime - startTime,
        memoryUsage: getMemoryUsage()
      }));
    }
  }, [dataPoints]);

  // Monitor graph generation performance
  useEffect(() => {
    if (graphData.nodes.length > 0) {
      setPerformanceMetrics(prev => ({
        ...prev!,
        graphGenerationTime: Date.now() // This would be set from parent component ideally
      }));
    }
  }, [graphData]);

  const getMemoryUsage = (): string => {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return `${(memory.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB`;
    }
    return 'N/A';
  };

  const handleExport = (format: 'json' | 'csv', includeEmbeddings: boolean) => {
    try {
      if (dataPoints.length === 0) {
        onError?.('No data to export');
        return;
      }

      const exportData = DataProcessor.exportData(dataPoints, format, includeEmbeddings);
      const filename = `data_export_${new Date().toISOString().split('T')[0]}.${format}`;
      
      if (onExport) {
        onExport(exportData, filename);
      } else {
        // Fallback: direct download
        const blob = new Blob([exportData], {
          type: format === 'json' ? 'application/json' : 'text/csv'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error: any) {
      onError?.(`Export failed: ${error.message}`);
    }
  };

  const exportGraphData = () => {
    try {
      const graphExport = {
        metadata: {
          exportDate: new Date().toISOString(),
          nodeCount: graphData.nodes.length,
          linkCount: graphData.links.length,
          categories: Array.from(new Set(graphData.nodes.map(n => n.category).filter(Boolean)))
        },
        nodes: graphData.nodes,
        links: graphData.links
      };

      const blob = new Blob([JSON.stringify(graphExport, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `graph_export_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      onError?.(`Graph export failed: ${error.message}`);
    }
  };

  const clearAllData = () => {
    if (window.confirm('Are you sure you want to clear all data? This action cannot be undone.')) {
      // This would trigger a callback to parent component
      window.location.reload();
    }
  };

  const getOptimizationTips = () => {
    if (!stats) return [];

    const tips: string[] = [];

    if (stats.totalItems > 10000) {
      tips.push('💡 Large dataset detected. Consider processing in smaller batches for better performance.');
    }

    if (stats.averageTextLength > 1000) {
      tips.push('📝 Long text items detected. Consider summarizing content before embedding generation to reduce costs.');
    }

    if (stats.categories.length > 20) {
      tips.push('🏷️ Many categories detected. Consider grouping similar categories for cleaner visualization.');
    }

    if (stats.withEmbeddings < stats.totalItems && stats.totalItems > 100) {
      tips.push('🔧 Not all items have embeddings. Generate embeddings for complete graph analysis.');
    }

    if (graphData.links.length === 0 && stats.withEmbeddings > 0) {
      tips.push('🔗 No connections found. Try adjusting the similarity threshold or connection strategy.');
    }

    return tips;
  };

  if (!stats) {
    return null;
  }

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Dataset Utilities</h3>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          {showAdvanced ? '▼' : '▶'} Advanced Tools
        </button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-gray-700/50 p-3 rounded">
          <div className="text-gray-300">Total Items</div>
          <div className="text-white font-bold text-lg">{stats.totalItems.toLocaleString()}</div>
        </div>
        <div className="bg-gray-700/50 p-3 rounded">
          <div className="text-gray-300">With Embeddings</div>
          <div className="text-white font-bold text-lg">{stats.withEmbeddings.toLocaleString()}</div>
        </div>
        <div className="bg-gray-700/50 p-3 rounded">
          <div className="text-gray-300">Categories</div>
          <div className="text-white font-bold text-lg">{stats.categories.length}</div>
        </div>
        <div className="bg-gray-700/50 p-3 rounded">
          <div className="text-gray-300">Avg Text Length</div>
          <div className="text-white font-bold text-lg">{stats.averageTextLength}</div>
        </div>
      </div>

      {/* Quick Export */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-300">Quick Export</h4>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleExport('json', true)}
            disabled={stats.withEmbeddings === 0}
            className="p-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition-colors text-sm"
          >
            Export JSON
          </button>
          <button
            onClick={() => handleExport('csv', true)}
            disabled={stats.withEmbeddings === 0}
            className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition-colors text-sm"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Optimization Tips */}
      {getOptimizationTips().length > 0 && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded p-3">
          <h4 className="text-sm font-medium text-yellow-200 mb-2">💡 Optimization Tips</h4>
          <div className="space-y-1">
            {getOptimizationTips().map((tip, index) => (
              <div key={index} className="text-xs text-yellow-300">{tip}</div>
            ))}
          </div>
        </div>
      )}

      {/* Advanced Tools */}
      {showAdvanced && (
        <div className="space-y-4 pt-4 border-t border-gray-600">
          
          {/* Advanced Export Options */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-300">Advanced Export</h4>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Format</label>
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as 'json' | 'csv')}
                  className="w-full p-2 bg-gray-700 text-white rounded border border-gray-600 text-sm"
                >
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                </select>
              </div>
              
              <div>
                <label className="block text-xs text-gray-400 mb-1">Options</label>
                <label className="flex items-center gap-2 p-2">
                  <input
                    type="checkbox"
                    checked={includeEmbeddings}
                    onChange={(e) => setIncludeEmbeddings(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-gray-300">Include embeddings</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleExport(exportFormat, includeEmbeddings)}
                disabled={dataPoints.length === 0}
                className="p-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition-colors text-sm"
              >
                Custom Export
              </button>
              <button
                onClick={exportGraphData}
                disabled={graphData.nodes.length === 0}
                className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition-colors text-sm"
              >
                Export Graph
              </button>
            </div>
          </div>

          {/* Performance Metrics */}
          {performanceMetrics && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-300">Performance</h4>
              <div className="bg-gray-700/30 p-3 rounded text-xs">
                <div className="grid grid-cols-2 gap-2 text-gray-400">
                  <div>Memory Usage: <span className="text-white">{performanceMetrics.memoryUsage}</span></div>
                  <div>Load Time: <span className="text-white">{performanceMetrics.loadTime.toFixed(1)}ms</span></div>
                </div>
              </div>
            </div>
          )}

          {/* Dataset Information */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-300">Dataset Details</h4>
            <div className="bg-gray-700/30 p-3 rounded text-xs space-y-1">
              <div className="text-gray-400">
                Processing Time: <span className="text-white">{stats.processingTime}ms</span>
              </div>
              {stats.embeddingDimensions > 0 && (
                <div className="text-gray-400">
                  Embedding Dimensions: <span className="text-white">{stats.embeddingDimensions}</span>
                </div>
              )}
              <div className="text-gray-400">
                Categories: <span className="text-white">{stats.categories.join(', ') || 'None'}</span>
              </div>
            </div>
          </div>

          {/* Data Management */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-300">Data Management</h4>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  const dataUrl = 'data:application/json;charset=utf-8,' + 
                    encodeURIComponent(JSON.stringify({
                      dataPoints: dataPoints.slice(0, 5),
                      format: 'sample',
                      instructions: 'This is a sample of your data format. Use this as a template for new uploads.'
                    }, null, 2));
                  const a = document.createElement('a');
                  a.href = dataUrl;
                  a.download = 'data_template.json';
                  a.click();
                }}
                disabled={dataPoints.length === 0}
                className="p-2 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded transition-colors text-sm"
              >
                Export Template
              </button>
              
              <button
                onClick={clearAllData}
                className="p-2 bg-red-600 hover:bg-red-700 rounded transition-colors text-sm"
              >
                Clear All Data
              </button>
            </div>
          </div>

          {/* Usage Tips */}
          <details className="bg-gray-700/20 rounded p-3">
            <summary className="text-sm text-gray-300 cursor-pointer hover:text-white">
              📚 Usage Tips & Best Practices
            </summary>
            <div className="mt-2 text-xs text-gray-400 space-y-2">
              <div><strong className="text-gray-300">Large Datasets:</strong> Process in batches of 1000-5000 items for optimal performance</div>
              <div><strong className="text-gray-300">Text Preprocessing:</strong> Clean and normalize text before embedding generation</div>
              <div><strong className="text-gray-300">Categories:</strong> Use consistent category names for better graph clustering</div>
              <div><strong className="text-gray-300">Embeddings:</strong> Generate embeddings in one session to ensure consistency</div>
              <div><strong className="text-gray-300">Graph Visualization:</strong> Experiment with different connection strategies for optimal layout</div>
              <div><strong className="text-gray-300">Search:</strong> Use specific keywords for better search results</div>
              <div><strong className="text-gray-300">Export:</strong> Include embeddings in exports to avoid regeneration costs</div>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}