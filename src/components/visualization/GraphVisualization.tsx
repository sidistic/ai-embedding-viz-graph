'use client';
import React, { useEffect, useRef, useCallback, useState } from 'react';
import * as d3 from 'd3';
import { GraphData, GraphNode, GraphLink, DataPoint, CATEGORY_COLORS } from '@/types';

interface GraphVisualizationProps {
  graphData: GraphData;
  onNodeClick: (node: DataPoint) => void;
  onNodeHover: (node: DataPoint | null) => void;
  selectedNodeId?: string | null;
}

export default function GraphVisualization({
  graphData,
  onNodeClick,
  onNodeHover,
  selectedNodeId
}: GraphVisualizationProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [isReady, setIsReady] = useState(false);

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

    // Node click handler
    function handleNodeClick(event: MouseEvent, d: GraphNode) {
      event.stopPropagation();
      onNodeClick(d);
      centerOnNode(d);
    }

    // Node hover handlers - only for visual feedback, no reading
    function handleNodeMouseOver(event: MouseEvent, d: GraphNode) {
      // Enlarge node
      d3.select(event.currentTarget as SVGCircleElement)
        .transition()
        .duration(200)
        .attr('r', (d.size || 8) * 1.3)
        .attr('stroke-width', 3);

      // Highlight connected nodes and links
      highlightConnections(d);
      
      // Don't call onNodeHover for reading - only for visual feedback
    }

    function handleNodeMouseOut(event: MouseEvent, d: GraphNode) {
      // Reset node size
      d3.select(event.currentTarget as SVGCircleElement)
        .transition()
        .duration(200)
        .attr('r', d.size || 8)
        .attr('stroke-width', 2);

      // Reset all highlights
      resetHighlights();
      
      // Don't call onNodeHover(null)
    }

    // Highlight connections function
    function highlightConnections(node: GraphNode) {
      const connectedIds = new Set<string>();
      const connectedLinks = new Set<GraphLink>();

      graphData.links.forEach(link => {
        if (link.source === node.id || link.target === node.id) {
          connectedLinks.add(link);
          connectedIds.add(link.source === node.id ? link.target : link.source);
        }
      });

      // Dim unconnected nodes
      nodes.style('opacity', n => 
        n.id === node.id || connectedIds.has(n.id) ? 1 : 0.3
      );

      // Highlight connected links
      links
        .style('opacity', l => connectedLinks.has(l) ? 1 : 0.1)
        .attr('stroke', l => connectedLinks.has(l) ? '#fbbf24' : '#64748b')
        .attr('stroke-width', l => 
          connectedLinks.has(l) ? Math.sqrt(l.similarity * 5) + 2 : Math.sqrt(l.similarity * 3) + 1
        );

      // Dim unconnected labels
      labels.style('opacity', n => 
        n.id === node.id || connectedIds.has(n.id) ? 1 : 0.3
      );
    }

    // Reset highlights function
    function resetHighlights() {
      nodes.style('opacity', 1);
      links
        .style('opacity', 0.6)
        .attr('stroke', '#64748b')
        .attr('stroke-width', d => Math.sqrt(d.similarity * 3) + 1);
      labels.style('opacity', 0.9);
    }

    // Fixed center on node function
    function centerOnNode(node: GraphNode) {
      // Ensure node has valid coordinates before proceeding
      if (!node.x || !node.y || isNaN(node.x) || isNaN(node.y)) {
        console.warn('Node does not have valid coordinates:', node);
        return;
      }

      // Zoom and center on the node
      const scale = 1.5;
      const transform = d3.zoomIdentity
        .translate(width / 2 - node.x * scale, height / 2 - node.y * scale)
        .scale(scale);

      svg.transition()
        .duration(750)
        .call(zoom.transform, transform);

      // Find connected nodes
      const connectedNodeIds = new Set<string>();
      graphData.links.forEach(link => {
        if (link.source === node.id) {
          connectedNodeIds.add(link.target);
        } else if (link.target === node.id) {
          connectedNodeIds.add(link.source);
        }
      });

      const connectedNodes = graphData.nodes.filter(n => 
        connectedNodeIds.has(n.id) && n.x && n.y && !isNaN(n.x) && !isNaN(n.y)
      );

      // Arrange connected nodes in a circle around the selected node only if we have valid coordinates
      if (connectedNodes.length > 0 && node.x && node.y) {
        setTimeout(() => {
          const radius = 120;
          
          // Store original positions to avoid jumping
          const originalPositions = new Map();
          connectedNodes.forEach(connectedNode => {
            originalPositions.set(connectedNode.id, { x: connectedNode.x, y: connectedNode.y });
          });
          
          connectedNodes.forEach((connectedNode, index) => {
            const angle = (2 * Math.PI * index) / connectedNodes.length;
            const newX = node.x! + Math.cos(angle) * radius;
            const newY = node.y! + Math.sin(angle) * radius;
            
            // Only set fixed positions if they're valid
            if (!isNaN(newX) && !isNaN(newY)) {
              connectedNode.fx = newX;
              connectedNode.fy = newY;
            }
          });

          // Fix the center node temporarily only if it has valid coordinates
          if (node.x && node.y && !isNaN(node.x) && !isNaN(node.y)) {
            node.fx = node.x;
            node.fy = node.y;
          }

          // Gently restart simulation
          simulation.alpha(0.2).restart();

          // Release fixed positions after animation
          setTimeout(() => {
            connectedNodes.forEach(n => {
              n.fx = null;
              n.fy = null;
            });
            node.fx = null;
            node.fy = null;
          }, 2000);
        }, 750);
      }
    }

    // Update positions on simulation tick
    simulation.on('tick', () => {
      // Ensure all coordinates are valid before updating
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

      labels
        .attr('x', d => isNaN(d.x!) ? 0 : d.x!)
        .attr('y', d => isNaN(d.y!) ? 0 : d.y!);
    });

    // Clear selection on background click
    svg.on('click', (event) => {
      if (event.target === svg.node()) {
        onNodeClick(null as any);
      }
    });

    // Update selected node styling
    updateSelectedNodeStyling();

    function updateSelectedNodeStyling() {
      nodes.attr('stroke', d => 
        d.id === selectedNodeId ? '#fbbf24' : '#ffffff'
      ).attr('stroke-width', d => 
        d.id === selectedNodeId ? 4 : 2
      );
    }

    setIsReady(true);

    // Cleanup
    return () => {
      simulation.stop();
      simulationRef.current = null;
    };

  }, [graphData, dimensions, selectedNodeId, onNodeClick]);

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
      
      {/* Legend */}
      {isReady && (
        <>
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

          {/* Controls */}
          <div className="absolute top-4 right-4 bg-gray-800/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-gray-600">
            <div className="text-xs text-gray-300 space-y-1">
              <div className="text-white font-medium mb-2">Controls</div>
              <div>• <strong>Click</strong> node to select & center</div>
              <div>• <strong>Drag</strong> nodes to move</div>
              <div>• <strong>Scroll</strong> to zoom</div>
              <div>• <strong>Hover</strong> to highlight connections</div>
            </div>
          </div>

          {/* Stats */}
          <div className="absolute bottom-4 left-4 bg-gray-800/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-gray-600">
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
            </div>
          </div>

          {/* Selected node indicator */}
          {selectedNodeId && (
            <div className="absolute bottom-4 right-4 bg-blue-800/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-blue-600">
              <div className="text-xs text-blue-200">
                <div className="text-blue-100 font-medium mb-1">Node Selected</div>
                <div>Click background to deselect</div>
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