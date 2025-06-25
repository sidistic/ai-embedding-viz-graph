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

// Search functionality types
export interface SearchResult {
  node: GraphNode;
  score: number;
  matchType: 'exact' | 'partial' | 'semantic' | 'metadata';
  matchedText?: string;
  highlights?: string[];
}

export interface SearchOptions {
  query: string;
  maxResults?: number;
  includeMetadata?: boolean;
  caseSensitive?: boolean;
  useSemanticSearch?: boolean;
  semanticThreshold?: number;
  searchFields?: ('text' | 'category' | 'metadata')[];
}

export interface SearchState {
  query: string;
  results: SearchResult[];
  isActive: boolean;
  highlightedNodes: Set<string>;
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

// Enhanced data processing types for large datasets
export interface DataProcessingOptions {
  chunkSize?: number;
  skipValidation?: boolean;
  enableStreaming?: boolean;
  maxFileSize?: number; // in MB
  supportedFormats?: string[];
}

export interface ProcessingProgress {
  stage: 'loading' | 'parsing' | 'validating' | 'processing' | 'complete';
  progress: number;
  current: number;
  total: number;
  message: string;
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
  enableSearch: boolean;
  searchHighlightColor: string;
}

// Connection strategy types
export type ConnectionStrategy = 'top3' | 'top5' | 'top10' | 'threshold' | 'adaptive' | 'category_based';

// File upload types
export interface FileUploadResult {
  data: DataPoint[];
  hasEmbeddings: boolean;
  errors?: string[];
  stats?: DataStats;
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

// Categories for sample datasets (expanded)
export const AG_NEWS_CATEGORIES = {
  1: 'World',
  2: 'Sports', 
  3: 'Business',
  4: 'Sci/Tech'
} as const;

export const REDDIT_CATEGORIES = {
  'askreddit': 'Q&A',
  'worldnews': 'World',
  'technology': 'Technology',
  'science': 'Science',
  'politics': 'Politics'
} as const;

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

// Utility types
export type ProgressCallback = (progress: number, status: string) => void;
export type ErrorCallback = (error: string) => void;
export type ProcessingCallback = (progress: ProcessingProgress) => void;