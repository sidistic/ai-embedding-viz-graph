'use client';
import React, { useEffect, useRef, useState } from 'react';
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
  nodeSize: { min: 4, max: 12 },
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
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const finalConfig = { ...defaultConfig, ...config };

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: rect.width || 800,
          height: rect.height || 600
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Create graph data from articles
  const createGraphData = (): GraphData => {
    const nodes: GraphNode[] = articles.map((article, index) => ({
      id: article.id,
      title: article.title,
      category: article.category,
      categoryIndex: article.categoryIndex,
      description: article.description,
      embedding: article.embedding,
      x: Math.random() * dimensions.width,
      y: Math.random() * dimensions.height,
      group: article.categoryIndex,
      size: Math.max(
        finalConfig.nodeSize.min,
        Math.min(
          finalConfig.nodeSize.max,
          article.title.length / 10 + 4
        )
      )
    }));

    const links: GraphLink[] = [];
    
    if (finalConfig.showLinks) {
      const similarities = DataProcessor.findSimilarPairs(articles, finalConfig.linkThreshold);
      
      similarities.forEach(pair => {
        links.push({
          source: pair.id1,
          target: pair.id2,
          value: pair.similarity,
          distance: 100 * (1 - pair.similarity) + 30 // Closer for more similar
        });
      });
    }

    return { nodes, links };
  };

  useEffect(() => {
    if (!svgRef.current || articles.length === 0) return;

    // Clear previous visualization
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current);
    const { width, height } = dimensions;

    // Create graph data
    const graphData = createGraphData();

    // Set up zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
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
        .strength(0.3)
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => d.size + 2));

    // Create links
    const link = container.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(graphData.links)
      .enter().append('line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', d => Math.sqrt(d.value * 3));

    // Create nodes
    const node = container.append('g')
      .attr('class', 'nodes')
      .selectAll('circle')
      .data(graphData.nodes)
      .enter().append('circle')
      .attr('r', d => d.size)
      .attr('fill', d => finalConfig.colors[d.category] || '#999')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        setSelectedNode(d.id === selectedNode ? null : d.id);
        const article = articles.find(a => a.id === d.id);
        if (article && onNodeClick) onNodeClick(article);
      })
      .on('mouseover', (event, d) => {
        setHoveredNode(d.id);
        const article = articles.find(a => a.id === d.id);
        if (article && onNodeHover) onNodeHover(article);
        
        // Highlight connected nodes
        const connectedLinks = graphData.links.filter(l => 
          (l.source as any).id === d.id || (l.target as any).id === d.id
        );
        const connectedNodeIds = new Set(connectedLinks.flatMap(l => 
          [(l.source as any).id, (l.target as any).id]
        ));

        node.style('opacity', n => connectedNodeIds.has(n.id) || n.id === d.id ? 1 : 0.3);
        link.style('opacity', l => 
          (l.source as any).id === d.id || (l.target as any).id === d.id ? 0.8 : 0.1
        );
      })
      .on('mouseout', () => {
        setHoveredNode(null);
        if (onNodeHover) onNodeHover(null);
        
        // Reset opacity
        node.style('opacity', 1);
        link.style('opacity', 0.6);
      });

    // Add labels if enabled
    let labels: d3.Selection<SVGTextElement, GraphNode, SVGGElement, unknown> | null = null;
    if (finalConfig.showLabels) {
      labels = container.append('g')
        .attr('class', 'labels')
        .selectAll('text')
        .data(graphData.nodes)
        .enter().append('text')
        .text(d => d.title.length > 30 ? d.title.substring(0, 30) + '...' : d.title)
        .attr('font-size', '10px')
        .attr('font-family', 'Arial, sans-serif')
        .attr('text-anchor', 'middle')
        .attr('dy', d => d.size + 15)
        .style('pointer-events', 'none')
        .style('opacity', 0.7);
    }

    // Add drag behavior
    const drag = d3.drag<SVGCircleElement, GraphNode>()
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

    node.call(drag);

    // Update positions on each simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as any).x)
        .attr('y1', d => (d.source as any).y)
        .attr('x2', d => (d.target as any).x)
        .attr('y2', d => (d.target as any).y);

      node
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);

      if (labels) {
        labels
          .attr('x', d => d.x)
          .attr('y', d => d.y);
      }
    });

    // Cleanup function
    return () => {
      simulation.stop();
    };

  }, [articles, dimensions, finalConfig, selectedNode]);

  return (
    <div 
      ref={containerRef} 
      className="relative w-full h-full border border-gray-300 rounded-lg bg-white overflow-hidden"
    >
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full"
      />
      
      {/* Legend */}
      <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border">
        <h4 className="font-semibold text-sm mb-2">Categories</h4>
        <div className="space-y-1">
          {Object.entries(finalConfig.colors).map(([category, color]) => (
            <div key={category} className="flex items-center gap-2 text-xs">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: color }}
              />
              <span>{category}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border">
        <div className="text-xs text-gray-600 space-y-1">
          <div>• Click and drag nodes</div>
          <div>• Zoom with mouse wheel</div>
          <div>• Hover to see connections</div>
        </div>
      </div>

      {/* Stats */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border">
        <div className="text-xs text-gray-600 space-y-1">
          <div>Nodes: {articles.length}</div>
          <div>With embeddings: {articles.filter(a => a.embedding).length}</div>
          <div>Similarities: {DataProcessor.findSimilarPairs(articles, finalConfig.linkThreshold).length}</div>
        </div>
      </div>
    </div>
  );
}