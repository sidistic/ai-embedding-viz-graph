'use client';
import React, { useState } from 'react';

interface SearchInterfaceProps {
  strategies: Array<{ name: string; description: string }>;
  onSearch: (query: string, strategy: string) => void;
  onClear: () => void;
  disabled: boolean;
  currentStrategy: string;
}

export default function SearchInterface({
  strategies,
  onSearch,
  onClear,
  disabled,
  currentStrategy
}: SearchInterfaceProps) {
  const [query, setQuery] = useState('');
  const [strategy, setStrategy] = useState(currentStrategy);

  const handleSearch = (newQuery: string) => {
    setQuery(newQuery);
    if (newQuery.trim()) {
      onSearch(newQuery, strategy);
    } else {
      onClear();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={strategy}
        onChange={(e) => setStrategy(e.target.value)}
        disabled={disabled}
        className="px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 text-sm"
      >
        {strategies.map(s => (
          <option key={s.name} value={s.name}>{s.description}</option>
        ))}
      </select>
      
      <input
        type="text"
        placeholder="Search nodes..."
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        disabled={disabled}
        className="px-3 py-1 bg-gray-700 text-white rounded border border-gray-600 placeholder-gray-400 w-64"
      />
      
      {query && (
        <button
          onClick={() => {
            setQuery('');
            onClear();
          }}
          className="text-gray-400 hover:text-white"
        >
          ✕
        </button>
      )}
    </div>
  );
}