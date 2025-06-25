'use client';
import React from 'react';
import { DataPoint, SearchResult, GraphData } from '@/types';

interface NodeDetailsProps {
  selectedNode: DataPoint | null;
  searchResults: SearchResult[];
  graphData: GraphData;
  onNodeSelect: (node: DataPoint) => void;
  onClearSelection: () => void;
  onClearSearch: () => void;
  graphService: any; // Would be properly typed
}

export default function NodeDetails({
  selectedNode,
  searchResults,
  graphData,
  onNodeSelect,
  onClearSelection,
  onClearSearch,
  graphService
}: NodeDetailsProps) {
  const showSearchResults = searchResults.length > 0;

  if (showSearchResults) {
    return (
      <div className="p-4 h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Search Results</h3>
          <button onClick={onClearSearch} className="text-gray-400 hover:text-white">✕</button>
        </div>
        
        <div className="space-y-3 flex-1 overflow-y-auto">
          {searchResults.map((result, index) => (
            <div
              key={result.node.id}
              className="p-3 bg-gray-700/50 rounded border border-gray-600 hover:bg-gray-700/70 transition-colors cursor-pointer"
              onClick={() => onNodeSelect(result.node)}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-sm font-medium text-white">#{index + 1}</span>
                <span className="text-xs text-gray-400">{(result.score * 100).toFixed(0)}%</span>
              </div>
              <p className="text-sm text-gray-200 line-clamp-3">{result.node.text}</p>
              {result.matchedText && (
                <p className="text-xs text-gray-400 mt-2">Match: {result.matchedText}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (selectedNode) {
    const neighborhood = graphService.getNodeNeighborhood(selectedNode.id, graphData);
    
    return (
      <div className="p-4 h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Node Details</h3>
          <button onClick={onClearSelection} className="text-gray-400 hover:text-white">✕</button>
        </div>
        
        <div className="space-y-4 flex-1 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">ID</label>
            <div className="text-sm text-gray-100 bg-gray-700 p-3 rounded">{selectedNode.id}</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Text</label>
            <div className="text-sm text-gray-100 bg-gray-700 p-3 rounded max-h-40 overflow-y-auto">
              {selectedNode.text}
            </div>
          </div>

          {selectedNode.category && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Category</label>
              <div className="text-sm text-gray-100 bg-gray-700 p-3 rounded">
                {selectedNode.category}
              </div>
            </div>
          )}

          {neighborhood && neighborhood.neighbors.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Connected Nodes ({neighborhood.neighbors.length})
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {neighborhood.neighbors.slice(0, 10).map((conn, index) => (
                  <div 
                    key={index}
                    className="text-xs bg-gray-700 p-3 rounded hover:bg-gray-600 cursor-pointer transition-colors"
                    onClick={() => onNodeSelect(conn.node)}
                  >
                    <div className="font-medium text-gray-200 mb-1">
                      {conn.node.text.substring(0, 60)}...
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">
                        Similarity: {conn.link.similarity.toFixed(3)}
                      </span>
                      {conn.node.category && (
                        <span className="text-xs bg-gray-600 px-2 py-1 rounded">
                          {conn.node.category}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 h-full flex items-center justify-center text-gray-400">
      <div className="text-center">
        <div className="text-4xl mb-4">🎯</div>
        <p className="text-lg mb-2">No node selected</p>
        <p className="text-sm">Click on a node or search to view details</p>
      </div>
    </div>
  );
}