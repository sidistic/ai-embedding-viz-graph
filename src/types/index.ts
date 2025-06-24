// Core data types
export interface DataPoint {
  id: string;
  text: string;
  category?: string;
  embedding?: number[];
  metadata?: Record<string, any>;
}

// Graph visualization types
export interface GraphNode extends DataPoint {
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  connections?: string[];
  size?: number;
  color?: string;
}

export interface GraphLink {
  source: string;
  target: string;
  similarity: number;
  distance?: number;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// Embedding and processing types
export interface EmbeddingJob {
  id: string;
  text: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  embedding?: number[];
  error?: string;
}

export interface SimilarityPair {
  id1: string;
  id2: string;
  similarity: number;
}

// Configuration types
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
  linkThreshold: number;
}

// Connection strategy types
export type ConnectionStrategy = 'top3' | 'top5' | 'threshold';

// File upload types
export interface FileUploadResult {
  data: DataPoint[];
  hasEmbeddings: boolean;
  errors?: string[];
}

// Categories for sample datasets
export const AG_NEWS_CATEGORIES = {
  1: 'World',
  2: 'Sports', 
  3: 'Business',
  4: 'Sci/Tech'
} as const;

export const CATEGORY_COLORS = {
  'World': '#ef4444',
  'Sports': '#3b82f6',
  'Business': '#10b981',
  'Sci/Tech': '#f59e0b',
  'Technology': '#f59e0b',
  'default': '#6b7280'
} as const;

// Utility types
export type ProgressCallback = (progress: number, status: string) => void;
export type ErrorCallback = (error: string) => void;