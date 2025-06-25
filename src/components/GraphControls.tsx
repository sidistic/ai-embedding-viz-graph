'use client';
import React from 'react';

interface GraphControlsProps {
  strategies: Array<{ name: string; description: string }>;
  currentStrategy: string;
  currentOptions: any;
  onStrategyChange: (strategy: string, options: any) => void;
  disabled: boolean;
}

export default function GraphControls({
  strategies,
  currentStrategy,
  currentOptions,
  onStrategyChange,
  disabled
}: GraphControlsProps) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-300">Connection:</label>
        <select
          value={currentStrategy}
          onChange={(e) => onStrategyChange(e.target.value, currentOptions)}
          disabled={disabled}
          className="px-3 py-1 bg-gray-700 text-white rounded border border-gray-600 text-sm disabled:opacity-50"
        >
          {strategies.map(strategy => (
            <option key={strategy.name} value={strategy.name}>
              {strategy.description}
            </option>
          ))}
        </select>
      </div>

      {currentStrategy === 'threshold' && (
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-300">
            Threshold: {currentOptions.threshold?.toFixed(2)}
          </label>
          <input
            type="range"
            min="0.3"
            max="0.9"
            step="0.05"
            value={currentOptions.threshold || 0.7}
            onChange={(e) => onStrategyChange(currentStrategy, {
              ...currentOptions,
              threshold: parseFloat(e.target.value)
            })}
            className="w-24"
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}