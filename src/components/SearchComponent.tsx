'use client';
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { SearchOptions, SearchResult, GraphNode } from '@/types';
import { DataProcessor } from '@/lib/dataProcessor';

interface SearchComponentProps {
  nodes: GraphNode[];
  onSearchResults: (results: SearchResult[]) => void;
  onClearSearch: () => void;
  disabled?: boolean;
}

export default function SearchComponent({
  nodes,
  onSearchResults,
  onClearSearch,
  disabled = false
}: SearchComponentProps) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchOptions, setSearchOptions] = useState<Partial<SearchOptions>>({
    maxResults: 5,
    includeMetadata: true,
    caseSensitive: false,
    useSemanticSearch: false,
    semanticThreshold: 0.7,
    searchFields: ['text', 'category', 'metadata']
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced search function
  const performSearch = useCallback(
    (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        onSearchResults([]);
        onClearSearch();
        return;
      }

      setIsSearching(true);

      try {
        const searchResults = DataProcessor.searchNodes(nodes, {
          query: searchQuery,
          ...searchOptions
        } as SearchOptions);

        setResults(searchResults);
        onSearchResults(searchResults);
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
        onSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [nodes, searchOptions, onSearchResults, onClearSearch]
  );

  // Handle search input with debouncing
  const handleSearchChange = useCallback((newQuery: string) => {
    setQuery(newQuery);

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Set new timeout for debounced search
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(newQuery);
    }, 300);
  }, [performSearch]);

  // Handle search option changes
  const handleOptionChange = useCallback(<K extends keyof SearchOptions>(
    key: K,
    value: SearchOptions[K]
  ) => {
    setSearchOptions(prev => ({
      ...prev,
      [key]: value
    }));

    // Re-search if query exists
    if (query.trim()) {
      performSearch(query);
    }
  }, [query, performSearch]);

  // Clear search
  const handleClearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    onClearSearch();
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
  }, [onClearSearch]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Stats
  const hasEmbeddings = useMemo(() => 
    nodes.some(node => node.embedding), 
    [nodes]
  );

  const searchStats = useMemo(() => ({
    totalNodes: nodes.length,
    categoriesCount: new Set(nodes.map(n => n.category).filter(Boolean)).size,
    hasEmbeddings
  }), [nodes, hasEmbeddings]);

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Search Graph</h3>
        <div className="text-xs text-gray-400">
          {searchStats.totalNodes} nodes • {searchStats.categoriesCount} categories
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <div className="relative">
          <input
            type="text"
            placeholder="Search nodes by text, category, or metadata..."
            value={query}
            onChange={(e) => handleSearchChange(e.target.value)}
            disabled={disabled || nodes.length === 0}
            className="w-full p-3 pr-20 bg-gray-700 text-white rounded border border-gray-600 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          
          {/* Search indicators */}
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
            {isSearching && (
              <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            )}
            
            {query && (
              <button
                onClick={handleClearSearch}
                className="text-gray-400 hover:text-white transition-colors"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Quick stats */}
        {query && results.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 text-xs text-gray-400 bg-gray-700 px-3 py-1 rounded border border-gray-600">
            Found {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
          </div>
        )}
      </div>

      {/* Advanced Options Toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="text-sm text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
      >
        {showAdvanced ? '▼' : '▶'} Advanced Options
      </button>

      {/* Advanced Search Options */}
      {showAdvanced && (
        <div className="space-y-3 p-3 bg-gray-700/50 rounded border border-gray-600">
          {/* Max Results */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-300 mb-1">Max Results</label>
              <select
                value={searchOptions.maxResults}
                onChange={(e) => handleOptionChange('maxResults', parseInt(e.target.value))}
                className="w-full p-2 bg-gray-700 text-white rounded border border-gray-600 text-sm"
              >
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={15}>15</option>
              </select>
            </div>

            {/* Case Sensitive */}
            <div>
              <label className="block text-xs text-gray-300 mb-1">Case Sensitive</label>
              <label className="flex items-center gap-2 p-2">
                <input
                  type="checkbox"
                  checked={searchOptions.caseSensitive || false}
                  onChange={(e) => handleOptionChange('caseSensitive', e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm text-gray-300">Match case</span>
              </label>
            </div>
          </div>

          {/* Search Fields */}
          <div>
            <label className="block text-xs text-gray-300 mb-2">Search In</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'text', label: 'Text' },
                { key: 'category', label: 'Category' },
                { key: 'metadata', label: 'Metadata' }
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={searchOptions.searchFields?.includes(key as any) || false}
                    onChange={(e) => {
                      const current = searchOptions.searchFields || [];
                      const updated = e.target.checked
                        ? [...current, key]
                        : current.filter(f => f !== key);
                      handleOptionChange('searchFields', updated as any);
                    }}
                    className="w-4 h-4"
                  />
                  <span className="text-gray-300">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Include Metadata */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={searchOptions.includeMetadata || false}
              onChange={(e) => handleOptionChange('includeMetadata', e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-gray-300">Include metadata in search</span>
          </label>

          {/* Semantic Search */}
          <div className="opacity-50">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={false}
                disabled={true}
                className="w-4 h-4"
              />
              <span className="text-gray-400">Semantic search (coming soon)</span>
            </label>
            <p className="text-xs text-gray-500 mt-1">
              Requires embedding generation for search queries
            </p>
          </div>
        </div>
      )}

      {/* Search Results */}
      {results.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-300">Search Results</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {results.map((result, index) => (
              <div
                key={result.node.id}
                className="p-3 bg-gray-700/50 rounded border border-gray-600 hover:bg-gray-700/70 transition-colors cursor-pointer"
                onClick={() => {
                  // This will be handled by the parent component
                  console.log('Selected search result:', result.node.id);
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-white">
                        #{index + 1}
                      </span>
                      {result.node.category && (
                        <span className="px-2 py-0.5 bg-blue-600 text-blue-100 text-xs rounded">
                          {result.node.category}
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 text-xs rounded ${
                          result.matchType === 'exact' ? 'bg-green-600 text-green-100' :
                          result.matchType === 'semantic' ? 'bg-purple-600 text-purple-100' :
                          result.matchType === 'partial' ? 'bg-yellow-600 text-yellow-100' :
                          'bg-gray-600 text-gray-100'
                        }`}
                      >
                        {result.matchType}
                      </span>
                    </div>
                    
                    <p className="text-sm text-gray-200 truncate" title={result.node.text}>
                      {result.node.text}
                    </p>
                    
                    {result.matchedText && (
                      <p className="text-xs text-gray-400 mt-1 truncate">
                        Match: {result.matchedText}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex-shrink-0 text-right">
                    <div className="text-xs text-gray-400">
                      Score: {(result.score * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Results */}
      {query && !isSearching && results.length === 0 && (
        <div className="text-center py-6 text-gray-400">
          <div className="text-2xl mb-2">🔍</div>
          <p className="text-sm">No results found for "{query}"</p>
          <p className="text-xs mt-1">Try different keywords or adjust search options</p>
        </div>
      )}

      {/* No Data State */}
      {nodes.length === 0 && (
        <div className="text-center py-6 text-gray-400">
          <div className="text-2xl mb-2">📊</div>
          <p className="text-sm">No data to search</p>
          <p className="text-xs mt-1">Upload data to enable search functionality</p>
        </div>
      )}
    </div>
  );
}