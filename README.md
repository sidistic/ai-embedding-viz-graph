# Data Visualization & Graph Analysis

This is a Next.js application for exploring text datasets using AI embeddings and interactive graph visualizations. It's designed to test and prototype the visualization components that will be integrated into the main AI Notes application.

## Features

- 📊 **Interactive Graph Visualization**: Force-directed graph using D3.js
- 🤖 **AI Embeddings**: Generate semantic embeddings using OpenAI's API
- 🔗 **Similarity Analysis**: Find and visualize content similarities
- 📝 **AG News Dataset**: Pre-loaded sample from the AG News classification dataset
- 🎨 **Real-time Interaction**: Click, drag, zoom, and hover on graph nodes
- 📈 **Analytics Dashboard**: Real-time stats and configuration controls

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment

Copy the environment template and add your OpenAI API key:

```bash
cp .env.local.template .env.local
```

Edit `.env.local` and add your OpenAI API key:

```
OPENAI_API_KEY=sk-your-actual-api-key-here
```

### 3. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## How to Use

### 1. Load Sample Data
- The app automatically loads a sample of AG News articles
- 4 categories: World, Sports, Business, Sci/Tech
- ~20 sample articles for testing

### 2. Generate Embeddings
- Click "Generate Embeddings" to create semantic vectors for each article
- Requires OpenAI API key (cost: ~$0.0001 for sample dataset)
- Progress is shown in real-time

### 3. Explore the Graph
- **Nodes**: Represent articles, colored by category
- **Links**: Show semantic similarity between articles
- **Interactions**:
  - Click and drag nodes to move them
  - Zoom with mouse wheel
  - Hover over nodes to see connections
  - Click nodes to view article details

### 4. Customize Visualization
- Toggle labels and similarity links
- Adjust similarity threshold (0.3 - 0.9)
- View real-time statistics

## Architecture

### Core Components

- **DataProcessor**: Loads and processes CSV data, calculates similarities
- **EmbeddingService**: Handles OpenAI API calls with rate limiting and batching
- **GraphVisualization**: D3.js-powered interactive graph component
- **Main Page**: Orchestrates data flow and user interactions

### Data Flow

1. Load CSV data → Parse articles → Generate embeddings
2. Calculate cosine similarity between embeddings
3. Create graph structure (nodes + links)
4. Render interactive D3.js visualization

## Testing with Different Datasets

### AG News Dataset
- **Size**: 120,000 training + 7,600 test samples
- **Format**: CSV with class, title, description
- **Categories**: World, Sports, Business, Sci/Tech
- **Download**: Available on Kaggle, Hugging Face

### Reddit Comments Dataset
- **Size**: ~260,000 threads/comments
- **Format**: CSV files
- **Use case**: Conversation-like text, good for testing semantic search

### 20 Newsgroups Dataset
- **Size**: ~20,000 documents across 20 categories
- **Format**: Text files or CSV
- **Use case**: Well-structured discussions, great for link detection

### Custom Data
Replace the sample data in `src/lib/dataProcessor.ts` or modify `loadCSVData()` to load your own CSV files with columns:
- `class`: Category/label
- `title`: Main text
- `description`: Additional text

## Cost Estimation

Embeddings cost with OpenAI's `text-embedding-3-small`:
- **Rate**: $0.00002 per 1K tokens
- **Sample dataset**: ~$0.0001 (20 articles)
- **Full AG News**: ~$2.40 (120K articles)
- **Estimation**: Built-in cost calculator before processing


## Technologies Used

- **Next.js 15**: React framework with App Router
- **TypeScript**: Type safety and better DX
- **D3.js**: Data visualization and graph rendering
- **OpenAI API**: Embedding generation
- **Tailwind CSS**: Styling and responsive design
- **Papaparse**: CSV parsing
- **Lodash**: Utility functions

## API Reference

### DataProcessor
```typescript
// Load CSV data
static async loadCSVData(csvContent: string): Promise<NewsArticle[]>

// Calculate similarity between embeddings
static calculateCosineSimilarity(emb1: number[], emb2: number[]): number

// Find similar article pairs
static findSimilarPairs(articles: NewsArticle[], threshold: number): SimilarityPair[]
```

### EmbeddingService
```typescript
// Generate single embedding
async generateEmbedding(text: string): Promise<number[]>

// Process articles with progress tracking
async processArticlesWithEmbeddings(
  articles: NewsArticle[],
  onProgress?: (progress: number, status: string) => void
): Promise<NewsArticle[]>

// Estimate API costs
async estimateCost(textCount: number): Promise<{ tokens: number; cost: number }>
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with the sample dataset
5. Submit a pull request

## License

MIT License - feel free to use this code in your own projects!
