// Core data types
export interface DataPoint {
  id: string;
  text: string;
  category?: string;
  embedding?: number[];
  metadata?: Record<string, any>;
}

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

// Strategy Pattern Interfaces
export interface ConnectionStrategy {
  name: string;
  description: string;
  generateConnections(
    nodes: GraphNode[], 
    options?: ConnectionOptions
  ): GraphLink[];
}

export interface SearchStrategy {
  name: string;
  description: string;
  search(
    nodes: GraphNode[], 
    query: string, 
    options?: SearchOptions
  ): SearchResult[];
}

// Strategy Options
export interface ConnectionOptions {
  threshold?: number;
  maxConnections?: number;
  minSimilarity?: number;
  categoryWeight?: number;
  [key: string]: any;
}

export interface SearchOptions {
  maxResults?: number;
  includeMetadata?: boolean;
  caseSensitive?: boolean;
  searchFields?: ('text' | 'category' | 'metadata')[];
  [key: string]: any;
}

// Search types
export interface SearchResult {
  node: GraphNode;
  score: number;
  matchType: 'exact' | 'partial' | 'semantic' | 'metadata';
  matchedText?: string;
  highlights?: string[];
}

export interface SearchState {
  query: string;
  results: SearchResult[];
  isActive: boolean;
  highlightedNodes: Set<string>;
  strategy: string;
}

// Processing types
export interface ProcessingProgress {
  stage: 'loading' | 'parsing' | 'validating' | 'processing' | 'complete';
  progress: number;
  current: number;
  total: number;
  message: string;
}

export interface DataStats {
  totalItems: number;
  withEmbeddings: number;
  categories: string[];
  averageTextLength: number;
  fileSize: number;
  embeddingDimensions: number;
  processingTime: number;
}

// Service Events
export interface ServiceEvent<T = any> {
  type: string;
  data?: T;
  timestamp: number;
}

// Configuration
export interface AppConfig {
  defaultConnectionStrategy: string;
  defaultSearchStrategy: string;
  visualization: {
    nodeSize: { min: number; max: number };
    linkStrength: { min: number; max: number };
    colors: Record<string, string>;
  };
}

// Legacy types for backward compatibility
export type ConnectionStrategyType = 'top3' | 'top5' | 'top10' | 'threshold' | 'adaptive' | 'category_based';
export type ProgressCallback = (progress: number, status: string) => void;
export type ErrorCallback = (error: string) => void;
export type ProcessingCallback = (progress: ProcessingProgress) => void;

// Constants
export const CATEGORY_COLORS = {
  'World': '#ef4444',
  'Sports': '#3b82f6', 
  'Business': '#10b981',
  'Sci/Tech': '#f59e0b',
  'Technology': '#f59e0b',
  'Q&A': '#8b5cf6',
  'Science': '#06b6d4',
  'Politics': '#f97316',
  'default': '#6b7280'
} as const;