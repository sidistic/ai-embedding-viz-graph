# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Development**: `npm run dev` - Start Next.js development server on localhost:3000
- **Build**: `npm run build` - Build production version
- **Production**: `npm run start` - Start production server
- **Linting**: `npm run lint` - Run Next.js ESLint checks
- **Type Check**: `npm run type-check` - Run TypeScript compiler without emit

## Architecture Overview

This is a Next.js 15 application for visualizing text datasets using AI embeddings and D3.js force-directed graphs. The app is designed as a testing prototype for visualization components that will be integrated into a larger AI Notes application.

### Core Data Flow
1. **Data Ingestion**: CSV/JSON files → DataProcessor → DataPoint objects
2. **Embedding Generation**: Text → OpenAI API → Vector embeddings
3. **Similarity Calculation**: Cosine similarity between embeddings
4. **Graph Generation**: Similarity pairs → D3.js force-directed visualization
5. **Search & Interaction**: Real-time text search and node exploration

### Key Components

**Main Page** (`src/app/page.tsx`):
- Central orchestrator managing all state and data flow
- Handles file uploads, API key management, embedding generation
- Coordinates between data processing, visualization, and search

**DataProcessor** (`src/lib/dataProcessor.ts`):
- Static utility class for data manipulation and graph generation
- Supports multiple connection strategies: top3/5/10, threshold, adaptive, category-based
- Handles CSV/JSON parsing, similarity calculations, and data export
- Enhanced search functionality with text matching, metadata search, and semantic search hooks

**EmbeddingService** (`src/lib/embeddingService.ts`):
- Manages OpenAI API interactions with rate limiting and batch processing
- Supports concurrent request processing for large datasets
- Includes cost estimation, error handling, and session management
- Uses `text-embedding-3-small` model for cost efficiency

**GraphVisualization** (`src/components/visualization/GraphVisualization.tsx`):
- D3.js-powered interactive graph using force simulation
- Supports node selection, hover effects, search highlighting, and zoom/pan
- Responsive design with dynamic sizing and color coding by category

### Data Types & Architecture

**Core Data Structure**:
- `DataPoint`: Base data unit with id, text, category, embedding, metadata
- `GraphNode`: DataPoint + D3 visualization properties (position, size, color)
- `GraphLink`: Connection between nodes with similarity score and distance

**Search System**:
- Text-based search with highlighting and scoring
- Support for exact, partial, metadata, and semantic matching
- Real-time results with configurable result limits and field selection

**Connection Strategies**:
- `top3/5/10`: Connect to N most similar nodes
- `threshold`: Connect nodes above similarity threshold
- `adaptive`: Dynamic connection count based on similarity distribution
- `category_based`: Prioritize same-category connections with cross-category links

### Environment Requirements

**Required Environment Variables**:
- `OPENAI_API_KEY`: OpenAI API key for embedding generation (stored in `.env.local`)

**Dependencies**:
- Core: Next.js 15, React 19, TypeScript 5
- Visualization: D3.js for graph rendering
- Data: Papaparse for CSV parsing, Lodash for utilities
- Styling: Tailwind CSS 4

### File Upload & Data Processing

**Supported Formats**:
- CSV with columns: id, text/title/description, category/label/class, embedding (JSON array), metadata
- JSON arrays with similar structure
- **TXT files with intelligent auto-chunking**: Automatically splits large text files by paragraphs, sentences, or semantic breaks
- Maximum file size: 50MB (configurable, up to 100MB+ with streaming)
- Streaming support for large datasets with progress tracking

**Auto-Chunking System**:
- **Adaptive Strategy Detection**: Analyzes text structure to choose optimal chunking method
- **Multiple Chunking Strategies**:
  - `paragraph`: Chunks by paragraph breaks (good for structured documents)
  - `sentence`: Chunks by sentence boundaries (good for prose)
  - `semantic`: Chunks by topic/section breaks (good for large documents)
  - `fixed`: Fixed-size chunks with word boundaries (fallback)
  - `adaptive`: Combines strategies based on content analysis
- **Configurable Parameters**: Chunk size (150-2000 chars), overlap (100-200 chars), structure preservation
- **Auto-Category Detection**: Identifies content categories (Technology, Science, Business, etc.) based on keywords
- **Context Preservation**: Maintains semantic coherence with configurable overlap between chunks

**Sample Datasets**:
- AG News: 4-category news classification dataset (World, Sports, Business, Sci/Tech)
- Included sample in `src/data/ag_news_sample.csv`

### Performance Considerations

**Large Dataset Handling**:
- Chunked processing (default 1000 items per chunk)
- Concurrent API requests with rate limiting (3 concurrent, 200ms delay)
- Progress tracking for all operations
- Memory-efficient streaming for file processing

**Embedding Generation**:
- Batch size: 50 items per API request (OpenAI limit)
- Automatic retry with exponential backoff
- Cost estimation before processing
- Session management for cancellation support

### Development Guidelines

**Data Processing**:
- Always use DataProcessor static methods for consistency
- Handle embeddings as optional - app works without them
- Validate data at ingestion and before processing
- Use ProcessingProgress for user feedback on long operations

**Visualization**:
- Graph regeneration is expensive - only trigger when necessary
- Search and selection are mutually exclusive states
- Use connection strategies appropriate for dataset size
- Color coding follows CATEGORY_COLORS mapping

**API Integration**:
- Always estimate costs before embedding generation
- Handle rate limits and API errors gracefully
- Use EmbeddingService session management for large datasets
- Validate API keys before processing

### Common Patterns

**Error Handling**:
- User-friendly error messages in UI error state
- Console logging for debugging
- Graceful degradation when embeddings unavailable

**State Management**:
- Single source of truth in main page component
- Clear separation between data, UI, and processing state
- Progress tracking for all async operations

**File I/O**:
- Support both CSV and JSON formats
- Metadata extraction from additional columns
- Export functionality with embedding inclusion options