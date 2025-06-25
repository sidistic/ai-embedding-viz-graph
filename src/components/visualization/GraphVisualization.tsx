'use client';
import React, { useEffect, useRef, useCallback, useState } from 'react';
import * as d3 from 'd3';
import { GraphData, GraphNode, GraphLink, DataPoint, CATEGORY_COLORS, SearchResult } from '@/types';

interface GraphVisualizationProps {
  graphData: GraphData;
  onNodeClick: (node: DataPoint) => void;
  onNodeHover: (node: DataPoint | null) => void;
  selectedNodeId?: string | null;
  searchResults?: SearchResult[];
  searchHighlightColor?: string;
}

export default function GraphVisualization({
  graphData,
  onNodeClick,
  onNodeHover,
  selectedNodeId,
  searchResults = [],
  searchHighlightColor = '#ff6b35'
}: GraphVisualizationProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [isReady, setIsReady] = useState(false);
  
  // Refs for D3 selections
  const nodesRef = useRef<d3.Selection<SVGCircleElement, GraphNode, SVGGElement, unknown> | null>(null);
  const linksRef = useRef<d3.Selection<SVGLineElement, GraphLink, SVGGElement, unknown> | null>(null);
  const labelsRef = useRef<d3.Selection<SVGTextElement, GraphNode, SVGGElement, unknown> | null>(null);
  const searchHighlightsRef = useRef<d3.Selection<SVGCircleElement, GraphNode, SVGGElement, unknown> | null>(null);

  // Get search result node IDs for quick lookup
  const searchResultIds = new Set(searchResults.map(r => r.node.id));
  const hasSearchResults = searchResults.length > 0;

  // Update dimensions on resize
  const updateDimensions = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const newDimensions = {
        width: Math.max(rect.width || 800, 400),
        height: Math.max(rect.height || 600, 400)
      };
      
      if (newDimensions.width !== dimensions.width || newDimensions.height !== dimensions.height) {
        setDimensions(newDimensions);
      }
    }
  }, [dimensions]);

  useEffect(() => {
    updateDimensions();
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    return () => resizeObserver.disconnect();
  }, [updateDimensions]);

  // Handle search highlighting
  useEffect(() => {
    if (!nodesRef.current || !linksRef.current || !labelsRef.current) return;

    const nodes = nodesRef.current;
    const links = linksRef.current;
    const labels = labelsRef.current;
    const searchHighlights = searchHighlightsRef.current;

    if (hasSearchResults) {
      // Apply search highlighting
      nodes
        .style('opacity', (n: any) => searchResultIds.has(n.id) ? 1 : 0.3)
        .attr('stroke-width', (n: any) => searchResultIds.has(n.id) ? 3 : 2);

      links.style('opacity', 0.2);
      labels.style('opacity', (n: any) => searchResultIds.has(n.id) ? 1 : 0.3);

      // Update search highlights
      if (searchHighlights) {
        searchHighlights
          .style('opacity', (n: any) => searchResultIds.has(n.id) ? 0.8 : 0);
      }
    } else if (selectedNodeId) {
      // Apply selection highlighting (existing logic)
      const selectedNode = graphData.nodes.find(n => n.id === selectedNodeId);
      if (selectedNode) {
        const connectedIds = new Set<string>();
        const getLinkId = (sourceOrTarget: any): string => {
          return typeof sourceOrTarget === 'string' ? sourceOrTarget : sourceOrTarget.id;
        };

        const isConnectedLink = (link: any) => {
          const sourceId = getLinkId(link.source);
          const targetId = getLinkId(link.target);
          return sourceId === selectedNode.id || targetId === selectedNode.id;
        };

        graphData.links.forEach(link => {
          const sourceId = getLinkId(link.source);
          const targetId = getLinkId(link.target);
          
          if (sourceId === selectedNode.id || targetId === selectedNode.id) {
            connectedIds.add(sourceId === selectedNode.id ? targetId : sourceId);
          }
        });

        nodes
          .attr('stroke', (n: any) => n.id === selectedNode.id ? '#fbbf24' : '#ffffff')
          .attr('stroke-width', (n: any) => n.id === selectedNode.id ? 4 : 2)
          .style('opacity', (n: any) => 
            n.id === selectedNode.id || connectedIds.has(n.id) ? 1 : 0.3
          );

        links
          .style('opacity', (l: any) => isConnectedLink(l) ? 1 : 0.1)
          .attr('stroke', (l: any) => isConnectedLink(l) ? '#00ff88' : '#64748b')
          .attr('stroke-width', (l: any) => 
            isConnectedLink(l) ? Math.sqrt(l.similarity * 5) + 3 : Math.sqrt(l.similarity * 3) + 1
          );

        labels.style('opacity', (n: any) => 
          n.id === selectedNode.id || connectedIds.has(n.id) ? 1 : 0.3
        );

        if (searchHighlights) {
          searchHighlights.style('opacity', 0);
        }
      }
    } else {
      // Reset all styling
      nodes
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 2)
        .style('opacity', 1);

      links
        .style('opacity', 0.6)
        .attr('stroke', '#64748b')
        .attr('stroke-width', (d: any) => Math.sqrt(d.similarity * 3) + 1);

      labels.style('opacity', 0.9);

      if (searchHighlights) {
        searchHighlights.style('opacity', 0);
      }
    }
  }, [selectedNodeId, searchResults, hasSearchResults, searchResultIds, graphData]);

  // Main visualization effect
  useEffect(() => {
    if (!svgRef.current || !graphData.nodes.length) {
      setIsReady(false);
      return;
    }

    // Stop previous simulation
    if (simulationRef.current) {
      simulationRef.current.stop();
    }

    const svg = d3.select(svgRef.current);
    const { width, height } = dimensions;

    // Clear previous content
    svg.selectAll('*').remove();

    // Create zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Create main container
    const container = svg.append('g').attr('class', 'main-container');

    // Create groups for layers (order matters for rendering)
    const linksGroup = container.append('g').attr('class', 'links');
    const searchHighlightGroup = container.append('g').attr('class', 'search-highlights');
    const nodesGroup = container.append('g').attr('class', 'nodes');
    const labelsGroup = container.append('g').attr('class', 'labels');

    // Create simulation
    const simulation = d3.forceSimulation<GraphNode>(graphData.nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(graphData.links)
        .id(d => d.id)
        .distance(d => d.distance || 80)
        .strength(0.3)
      )
      .force('charge', d3.forceManyBody()
        .strength(-400)
        .distanceMax(300)
      )
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide()
        .radius(d => (d.size || 8) + 4)
        .strength(0.8)
      );

    simulationRef.current = simulation;

    // Create links
    const links = linksGroup
      .selectAll('line')
      .data(graphData.links)
      .enter()
      .append('line')
      .attr('class', 'graph-link')
      .attr('stroke', '#64748b')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', d => Math.sqrt(d.similarity * 3) + 1)
      .style('pointer-events', 'none');

    linksRef.current = links;

    // Create search highlight rings (behind nodes)
    const searchHighlights = searchHighlightGroup
      .selectAll('circle')
      .data(graphData.nodes)
      .enter()
      .append('circle')
      .attr('class', 'search-highlight')
      .attr('r', d => (d.size || 8) + 6)
      .attr('fill', 'none')
      .attr('stroke', searchHighlightColor)
      .attr('stroke-width', 3)
      .style('opacity', 0)
      .style('pointer-events', 'none')
      .style('filter', `drop-shadow(0px 0px 8px ${searchHighlightColor})`);

    searchHighlightsRef.current = searchHighlights;

    // Create nodes
    const nodes = nodesGroup
      .selectAll('circle')
      .data(graphData.nodes)
      .enter()
      .append('circle')
      .attr('class', 'graph-node')
      .attr('r', d => d.size || 8)
      .attr('fill', d => getNodeColor(d))
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .style('filter', 'drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.3))')
      .on('click', handleNodeClick)
      .on('mouseover', handleNodeMouseOver)
      .on('mouseout', handleNodeMouseOut);

    nodesRef.current = nodes;

    // Create labels
    const labels = labelsGroup
      .selectAll('text')
      .data(graphData.nodes)
      .enter()
      .append('text')
      .attr('class', 'graph-label')
      .text(d => truncateText(d.text, 20))
      .attr('font-size', '10px')
      .attr('font-family', 'Arial, sans-serif')
      .attr('font-weight', '500')
      .attr('text-anchor', 'middle')
      .attr('dy', d => (d.size || 8) + 15)
      .attr('fill', '#e5e7eb')
      .style('pointer-events', 'none')
      .style('text-shadow', '1px 1px 2px rgba(0, 0, 0, 0.8)')
      .style('opacity', 0.9);

    labelsRef.current = labels;

    // Add drag behavior
    const drag = d3.drag<SVGCircleElement, GraphNode>()
      .on('start', function(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', function(event, d) {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', function(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    nodes.call(drag);

    // Node event handlers
    function handleNodeClick(event: MouseEvent, d: GraphNode) {
      event.stopPropagation();
      onNodeClick(d);
    }

    function handleNodeMouseOver(event: MouseEvent, d: GraphNode) {
      if (d.id !== selectedNodeId && !hasSearchResults) {
        d3.select(event.currentTarget as SVGCircleElement)
          .transition()
          .duration(200)
          .attr('r', (d.size || 8) * 1.3)
          .attr('stroke-width', 3);

        highlightConnections(d, '#fbbf24', true);
      }
    }

    function handleNodeMouseOut(event: MouseEvent, d: GraphNode) {
      if (d.id !== selectedNodeId && !hasSearchResults) {
        d3.select(event.currentTarget as SVGCircleElement)
          .transition()
          .duration(200)
          .attr('r', d.size || 8)
          .attr('stroke-width', 2);

        resetHighlights();
      }
    }

    // Enhanced highlight connections function
    function highlightConnections(node: GraphNode, highlightColor: string = '#fbbf24', isHover: boolean = false) {
      if (hasSearchResults) return; // Don't override search highlighting

      const connectedIds = new Set<string>();
      const getLinkId = (sourceOrTarget: any): string => {
        return typeof sourceOrTarget === 'string' ? sourceOrTarget : sourceOrTarget.id;
      };

      const isConnectedLink = (link: any) => {
        const sourceId = getLinkId(link.source);
        const targetId = getLinkId(link.target);
        return sourceId === node.id || targetId === node.id;
      };

      graphData.links.forEach(link => {
        const sourceId = getLinkId(link.source);
        const targetId = getLinkId(link.target);
        
        if (sourceId === node.id || targetId === node.id) {
          connectedIds.add(sourceId === node.id ? targetId : sourceId);
        }
      });

      nodes.style('opacity', n => 
        n.id === node.id || connectedIds.has(n.id) ? 1 : 0.3
      );

      links
        .style('opacity', l => isConnectedLink(l) ? 1 : 0.1)
        .attr('stroke', l => isConnectedLink(l) ? highlightColor : '#64748b')
        .attr('stroke-width', l => 
          isConnectedLink(l) ? Math.sqrt(l.similarity * 5) + 3 : Math.sqrt(l.similarity * 3) + 1
        );

      labels.style('opacity', n => 
        n.id === node.id || connectedIds.has(n.id) ? 1 : 0.3
      );
    }

    // Reset highlights function
    function resetHighlights() {
      if (hasSearchResults) return; // Don't override search highlighting

      nodes.style('opacity', 1);
      links
        .style('opacity', 0.6)
        .attr('stroke', '#64748b')
        .attr('stroke-width', d => Math.sqrt(d.similarity * 3) + 1);
      labels.style('opacity', 0.9);
    }

    // Update positions on simulation tick
    simulation.on('tick', () => {
      links
        .attr('x1', d => {
          const sourceX = (d.source as any).x;
          return isNaN(sourceX) ? 0 : sourceX;
        })
        .attr('y1', d => {
          const sourceY = (d.source as any).y;
          return isNaN(sourceY) ? 0 : sourceY;
        })
        .attr('x2', d => {
          const targetX = (d.target as any).x;
          return isNaN(targetX) ? 0 : targetX;
        })
        .attr('y2', d => {
          const targetY = (d.target as any).y;
          return isNaN(targetY) ? 0 : targetY;
        });

      nodes
        .attr('cx', d => isNaN(d.x!) ? 0 : d.x!)
        .attr('cy', d => isNaN(d.y!) ? 0 : d.y!);

      searchHighlights
        .attr('cx', d => isNaN(d.x!) ? 0 : d.x!)
        .attr('cy', d => isNaN(d.y!) ? 0 : d.y!);

      labels
        .attr('x', d => isNaN(d.x!) ? 0 : d.x!)
        .attr('y', d => isNaN(d.y!) ? 0 : d.y!);
    });

    // Background click to deselect
    svg.on('click', function(event) {
      if (event.target === svg.node()) {
        onNodeClick(null as any);
      }
    });

    setIsReady(true);

    // Cleanup
    return () => {
      simulation.stop();
      simulationRef.current = null;
    };

  }, [graphData, dimensions]);

  // Helper functions
  const getNodeColor = (node: GraphNode): string => {
    if (node.color) return node.color;
    if (node.category) {
      return CATEGORY_COLORS[node.category as keyof typeof CATEGORY_COLORS] || CATEGORY_COLORS.default;
    }
    return CATEGORY_COLORS.default;
  };

  const truncateText = (text: string, maxLength: number): string => {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  const getCategoryStats = () => {
    const stats: Record<string, number> = {};
    graphData.nodes.forEach(node => {
      if (node.category) {
        stats[node.category] = (stats[node.category] || 0) + 1;
      }
    });
    return stats;
  };

  return (
    <div 
      ref={containerRef} 
      className="relative w-full h-full bg-gray-900 rounded-lg overflow-hidden"
    >
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full"
        style={{ background: '#1e293b' }}
      />
      
      {/* Enhanced UI overlays */}
      {isReady && (
        <>
          {/* Legend */}
          <div className="absolute top-4 left-4 bg-gray-800/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-gray-600 max-w-xs">
            <h4 className="font-semibold text-sm mb-2 text-white">Categories</h4>
            <div className="space-y-1">
              {Object.entries(getCategoryStats()).map(([category, count]) => (
                <div key={category} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full border border-white/20" 
                      style={{ backgroundColor: getNodeColor({ category } as GraphNode) }}
                    />
                    <span className="text-gray-200">{category}</span>
                  </div>
                  <span className="text-gray-400">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Search Results Indicator */}
          {hasSearchResults && (
            <div className="absolute top-4 right-4 bg-orange-800/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-orange-600">
              <div className="text-xs text-orange-200">
                <div className="text-orange-100 font-medium mb-1">
                  🔍 Search Results ({searchResults.length})
                </div>
                <div>Highlighted nodes match your search</div>
                <div className="flex items-center gap-1 mt-1">
                  <div 
                    className="w-2 h-2 rounded-full border"
                    style={{ borderColor: searchHighlightColor }}
                  />
                  <span>Search highlight</span>
                </div>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="absolute bottom-4 left-4 bg-gray-800/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-gray-600">
            <div className="text-xs text-gray-300 space-y-1">
              <div className="text-white font-medium mb-2">Controls</div>
              <div>• <strong>Click</strong> node to select</div>
              <div>• <strong>Drag</strong> nodes to move</div>
              <div>• <strong>Scroll</strong> to zoom</div>
              <div>• <strong>Hover</strong> to highlight connections</div>
            </div>
          </div>

          {/* Enhanced Stats */}
          <div className="absolute bottom-4 right-4 bg-gray-800/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-gray-600">
            <div className="text-xs text-gray-300 space-y-1">
              <div className="text-white font-medium mb-1">Graph Statistics</div>
              <div>Nodes: <span className="text-white font-medium">{graphData.nodes.length}</span></div>
              <div>Connections: <span className="text-white font-medium">{graphData.links.length}</span></div>
              <div>Avg similarity: <span className="text-white font-medium">
                {graphData.links.length > 0 
                  ? (graphData.links.reduce((sum, link) => sum + link.similarity, 0) / graphData.links.length).toFixed(3)
                  : '0'
                }
              </span></div>
              {hasSearchResults && (
                <div className="pt-1 border-t border-gray-600">
                  <div>Search results: <span className="text-orange-400 font-medium">{searchResults.length}</span></div>
                </div>
              )}
            </div>
          </div>

          {/* Selected node indicator */}
          {selectedNodeId && !hasSearchResults && (
            <div className="absolute top-1/2 right-4 bg-blue-800/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-blue-600 transform -translate-y-1/2">
              <div className="text-xs text-blue-200">
                <div className="text-blue-100 font-medium mb-1">Node Selected</div>
                <div>Connections highlighted in <span className="text-green-400 font-bold">bright green</span></div>
                <div>Click another node or background to change selection</div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Loading indicator */}
      {!isReady && graphData.nodes.length > 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
            <p className="text-white">Initializing graph...</p>
          </div>
        </div>
      )}
    </div>
  );
}