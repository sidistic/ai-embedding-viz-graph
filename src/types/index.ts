// Data types for visualization project
export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  category: string;
  categoryIndex: number;
  embedding?: number[];
}

export interface GraphNode {
  id: string;
  title: string;
  category: string;
  categoryIndex: number;
  x: number;
  y: number;
  group: number;
  size: number;
  description?: string;
  embedding?: number[];
}

export interface GraphLink {
  source: string;
  target: string;
  value: number; // similarity score
  distance: number;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface EmbeddingJob {
  id: string;
  text: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  embedding?: number[];
  error?: string;
}

export interface VisualizationConfig {
  width: number;
  height: number;
  nodeSize: {
    min: number;
    max: number;
  };
  linkStrength: {
    min: number;
    max: number;
  };
  colors: {
    [category: string]: string;
  };
  showLabels: boolean;
  showLinks: boolean;
  linkThreshold: number; // minimum similarity to show link
}

export interface SimilarityPair {
  id1: string;
  id2: string;
  similarity: number;
}

// Categories for AG News dataset
export const AG_NEWS_CATEGORIES = {
  1: 'World',
  2: 'Sports', 
  3: 'Business',
  4: 'Sci/Tech'
} as const;

export const CATEGORY_COLORS = {
  'World': '#e74c3c',
  'Sports': '#3498db',
  'Business': '#2ecc71',
  'Sci/Tech': '#f39c12'
} as const;