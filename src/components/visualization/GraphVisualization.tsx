'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { NewsArticle, GraphData, GraphNode, GraphLink, CATEGORY_COLORS, VisualizationConfig } from '@/types';
import { DataProcessor } from '@/lib/dataProcessor';

interface Props {
  articles: NewsArticle[];
  config?: Partial<VisualizationConfig>;
  onNodeClick?: (article: NewsArticle) => void;
  onNodeHover?: (article: NewsArticle | null) => void;
}

const defaultConfig: VisualizationConfig = {
  width: 800,
  height: 600,
  nodeSize: { min: 6, max: 16 },
  linkStrength: { min: 0.1, max: 1.0 },
  colors: CATEGORY_COLORS,
  showLabels: true,
  showLinks: true,
  linkThreshold: 0.6
};

export default function GraphVisualization({ 
  articles, 
  config = {}, 
  onNodeClick, 
  onNodeHover 
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const finalConfig = { ...defaultConfig, ...config };

  // Update dimensions on resize with debouncing
  const updateDimensions = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const newDimensions = {
        width: Math.max(rect.width || 800, 400),
        height: Math.max(rect.height || 600, 400)
      };
      
      // Only update if dimensions actually changed
      if (newDimensions.width !== dimensions.width || newDimensions.height !== dimensions.height) {
        setDimensions(newDimensions);
      }
    }
  }, [dimensions.width, dimensions.height]);

  useEffect(() => {
    updateDimensions();
    
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [updateDimensions]);

  // Create graph data from articles
  const createGraphData = useCallback((): GraphData => {
    const nodes: GraphNode[] = articles.map((article, index) => ({
      id: article.id,
      title: article.title,
      category: article.category,
      categoryIndex: article.categoryIndex,
      description: article.description,
      embedding: article.embedding,
      x: dimensions.width / 2 + (Math.random() - 0.5) * 200,
      y: dimensions.height / 2 + (Math.random() - 0.5) * 200,
      group: article.categoryIndex,
      size: Math.max(
        finalConfig.nodeSize.min,
        Math.min(
          finalConfig.nodeSize.max,
          Math.sqrt(article.title.length) * 2 + 6
        )
      )
    }));

    const links: GraphLink[] = [];
    
    if (finalConfig.showLinks && articles.some(a => a.embedding)) {
      const similarities = DataProcessor.findSimilarPairs(articles, finalConfig.linkThreshold);
      
      similarities.forEach(pair => {
        links.push({
          source: pair.id1,
          target: pair.id2,
          value: pair.similarity,
          distance: 120 * (1 - pair.similarity) + 50 // Closer for more similar
        });
      });
    }

    return { nodes, links };
  }, [articles, dimensions, finalConfig.showLinks, finalConfig.linkThreshold, finalConfig.nodeSize]);

  useEffect(() => {
    if (!svgRef.current || articles.length === 0) return;

    // Stop previous simulation if it exists
    if (simulationRef.current) {
      simulationRef.current.stop();
    }

    // Clear previous visualization
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current);
    const { width, height } = dimensions;

    // Create graph data
    const graphData = createGraphData();

    // Set up zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Create main container
    const container = svg.append('g');

    // Create force simulation
    const simulation = d3.forceSimulation<GraphNode>(graphData.nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(graphData.links)
        .id(d => d.id)
        .distance(d => d.distance)
        .strength(0.2)
      )
      .force('charge', d3.forceManyBody()
        .strength(-300)
        .distanceMax(200)
      )
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide()
        .radius(d => d.size + 4)
        .strength(0.8)
      )
      .force('x', d3.forceX(width / 2).strength(0.01))
      .force('y', d3.forceY(height / 2).strength(0.01));

    simulationRef.current = simulation;

    // Create links with better visibility
    const link = container.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(graphData.links)
      .enter().append('line')
      .attr('stroke', '#64748b') // Better gray color
      .attr('stroke-opacity', 0.8)
      .attr('stroke-width', d => Math.sqrt(d.value * 4) + 1)
      .style('filter', 'drop-shadow(0px 0px 2px rgba(100, 116, 139, 0.5))');

    // Create node groups for better interaction
    const nodeGroup = container.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(graphData.nodes)
      .enter().append('g')
      .attr('class', 'node-group')
      .style('cursor', 'pointer');

    // Add node circles
    const node = nodeGroup.append('circle')
      .attr('r', d => d.size)
      .attr('fill', d => finalConfig.colors[d.category] || '#6b7280')
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 2)
      .style('filter', 'drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.3))')
      .on('click', (event, d) => {
        event.stopPropagation();
        setSelectedNode(d.id === selectedNode ? null : d.id);
        const article = articles.find(a => a.id === d.id);
        if (article && onNodeClick) onNodeClick(article);
      })
      .on('mouseover', (event, d) => {
        setHoveredNode(d.id);
        const article = articles.find(a => a.id === d.id);
        if (article && onNodeHover) onNodeHover(article);
        
        // Highlight effect
        d3.select(event.currentTarget)
          .transition()
          .duration(200)
          .attr('stroke-width', 4)
          .attr('r', d.size * 1.2);
        
        // Highlight connected nodes and links
        const connectedLinks = graphData.links.filter(l => 
          (l.source as any).id === d.id || (l.target as any).id === d.id
        );
        const connectedNodeIds = new Set(connectedLinks.flatMap(l => 
          [(l.source as any).id, (l.target as any).id]
        ));

        node.style('opacity', n => connectedNodeIds.has(n.id) || n.id === d.id ? 1 : 0.3);
        link.style('opacity', l => 
          (l.source as any).id === d.id || (l.target as any).id === d.id ? 1 : 0.2
        );

        // Highlight connected links
        link.attr('stroke', l =>
          (l.source as any).id === d.id || (l.target as any).id === d.id ? '#fbbf24' : '#64748b'
        );
      })
      .on('mouseout', (event, d) => {
        setHoveredNode(null);
        if (onNodeHover) onNodeHover(null);
        
        // Remove highlight effect
        d3.select(event.currentTarget)
          .transition()
          .duration(200)
          .attr('stroke-width', 2)
          .attr('r', d.size);
        
        // Reset opacity and colors
        node.style('opacity', 1);
        link.style('opacity', 0.8)
          .attr('stroke', '#64748b');
      });

    // Add labels if enabled
    let labels: d3.Selection<SVGTextElement, GraphNode, SVGGElement, unknown> | null = null;
    if (finalConfig.showLabels) {
      labels = nodeGroup.append('text')
        .text(d => d.title.length > 25 ? d.title.substring(0, 25) + '...' : d.title)
        .attr('font-size', '11px')
        .attr('font-family', 'Arial, sans-serif')
        .attr('font-weight', '500')
        .attr('text-anchor', 'middle')
        .attr('dy', d => d.size + 18)
        .attr('fill', '#e5e7eb') // Light gray for visibility on dark background
        .style('pointer-events', 'none')
        .style('text-shadow', '1px 1px 2px rgba(0, 0, 0, 0.8)')
        .style('opacity', 0.9);
    }

    // Add drag behavior
    const drag = d3.drag<SVGGElement, GraphNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    nodeGroup.call(drag);

    // Update positions on each simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as any).x)
        .attr('y1', d => (d.source as any).y)
        .attr('x2', d => (d.target as any).x)
        .attr('y2', d => (d.target as any).y);

      nodeGroup
        .attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Click on empty space to deselect
    svg.on('click', () => {
      setSelectedNode(null);
      if (onNodeClick) onNodeClick(null as any);
    });

    // Cleanup function
    return () => {
      simulation.stop();
      simulationRef.current = null;
    };

  }, [articles, dimensions, finalConfig, createGraphData, selectedNode, onNodeClick, onNodeHover]);

  return (
    <div 
      ref={containerRef} 
      className="relative w-full h-full bg-gray-900 rounded-lg overflow-hidden border border-gray-700"
    >
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full"
      />
      
      {/* Legend */}
      <div className="absolute top-4 left-4 bg-gray-800/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-gray-600">
        <h4 className="font-semibold text-sm mb-2 text-white">Categories</h4>
        <div className="space-y-1">
          {Object.entries(finalConfig.colors).map(([category, color]) => (
            <div key={category} className="flex items-center gap-2 text-xs">
              <div 
                className="w-3 h-3 rounded-full border border-white/20" 
                style={{ backgroundColor: color }}
              />
              <span className="text-gray-200">{category}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="absolute top-4 right-4 bg-gray-800/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-gray-600">
        <div className="text-xs text-gray-300 space-y-1">
          <div>• Click and drag nodes</div>
          <div>• Zoom with mouse wheel</div>
          <div>• Hover to see connections</div>
          <div>• Click empty space to deselect</div>
        </div>
      </div>

      {/* Stats */}
      <div className="absolute bottom-4 left-4 bg-gray-800/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-gray-600">
        <div className="text-xs text-gray-300 space-y-1">
          <div className="text-white font-medium">Graph Stats</div>
          <div>Nodes: <span className="text-white">{articles.length}</span></div>
          <div>With embeddings: <span className="text-white">{articles.filter(a => a.embedding).length}</span></div>
          <div>Similarities: <span className="text-white">{DataProcessor.findSimilarPairs(articles, finalConfig.linkThreshold).length}</span></div>
          <div>Threshold: <span className="text-white">{finalConfig.linkThreshold?.toFixed(2)}</span></div>
        </div>
      </div>

      {/* Selected node indicator */}
      {selectedNode && (
        <div className="absolute bottom-4 right-4 bg-blue-800/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-blue-600">
          <div className="text-xs text-blue-200">
            <div className="text-blue-100 font-medium mb-1">Selected Node</div>
            <div>ID: {selectedNode}</div>
          </div>
        </div>
      )}
    </div>
  );
}