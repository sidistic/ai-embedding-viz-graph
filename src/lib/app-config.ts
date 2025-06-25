// app-config.ts - Centralized configuration and service registry
import { AppConfig } from '@/types';
import { ConnectionStrategyService } from './connection-strategies';
import { SearchStrategyService } from './search-strategies';
import { GraphService } from './graph-service';
import { DataService } from './data-service';

export const DEFAULT_CONFIG: AppConfig = {
  defaultConnectionStrategy: 'adaptive',
  defaultSearchStrategy: 'text',
  visualization: {
    nodeSize: { min: 6, max: 20 },
    linkStrength: { min: 0.1, max: 1.0 },
    colors: {
      'World': '#ef4444',
      'Sports': '#3b82f6',
      'Business': '#10b981',
      'Sci/Tech': '#f59e0b',
      'Technology': '#f59e0b',
      'default': '#6b7280'
    }
  }
};

/**
 * Service Registry - Manages all application services
 * This provides a clean way to access services throughout the app
 */
export class ServiceRegistry {
  private static instance: ServiceRegistry;
  
  public readonly connectionService: ConnectionStrategyService;
  public readonly searchService: SearchStrategyService;
  public readonly graphService: GraphService;
  public readonly dataService = DataService;
  public readonly config: AppConfig;

  private constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.connectionService = new ConnectionStrategyService();
    this.searchService = new SearchStrategyService();
    this.graphService = new GraphService();
    
    this.initializeServices();
  }

  static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  private initializeServices() {
    // Register any custom strategies here
    this.registerCustomStrategies();
  }

  private registerCustomStrategies() {
    // Example: Register a custom connection strategy
    // this.connectionService.register(new MyCustomConnectionStrategy());
    
    // Example: Register a custom search strategy  
    // this.searchService.register(new MyCustomSearchStrategy());
  }

  /**
   * Get available strategies for UI dropdowns
   */
  getAvailableStrategies() {
    return {
      connection: this.connectionService.getAll().map(s => ({
        name: s.name,
        description: s.description
      })),
      search: this.searchService.getAll().map(s => ({
        name: s.name, 
        description: s.description
      }))
    };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<AppConfig>) {
    Object.assign(this.config, updates);
  }
}

// React Hook for accessing services
import { useCallback, useMemo } from 'react';

export function useServices() {
  const registry = useMemo(() => ServiceRegistry.getInstance(), []);
  
  const generateGraph = useCallback((dataPoints: DataPoint[], options: any) => {
    return registry.graphService.generateGraph(dataPoints, options);
  }, [registry]);

  const searchNodes = useCallback((strategy: string, nodes: GraphNode[], query: string, options?: any) => {
    return registry.searchService.search(strategy, nodes, query, options);
  }, [registry]);

  const loadData = useCallback(async (content: string, format: string, options?: any) => {
    switch (format) {
      case 'csv':
        return registry.dataService.loadFromCSV(content, options);
      case 'json':
        return registry.dataService.loadFromJSON(content, options);
      case 'txt':
        return registry.dataService.loadFromText(content);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }, [registry]);

  return {
    registry,
    generateGraph,
    searchNodes,
    loadData,
    strategies: registry.getAvailableStrategies(),
    config: registry.config
  };
}

// Context Provider for dependency injection (optional but recommended)
import React, { createContext, useContext, ReactNode } from 'react';

const ServiceContext = createContext<ServiceRegistry | null>(null);

export function ServiceProvider({ children }: { children: ReactNode }) {
  const registry = useMemo(() => ServiceRegistry.getInstance(), []);
  
  return (
    <ServiceContext.Provider value={registry}>
      {children}
    </ServiceContext.Provider>
  );
}

export function useServiceContext(): ServiceRegistry {
  const context = useContext(ServiceContext);
  if (!context) {
    throw new Error('useServiceContext must be used within ServiceProvider');
  }
  return context;
}