import { CSVSymbol } from '../utils/csvLoader';
import { ActiveIndicator } from '../types/indicator.types';

export interface UserPreferences {
  id: string;
  lastSelectedSymbol?: CSVSymbol;
  activeIndicators: ActiveIndicator[];
  theme: 'dark' | 'light';
  showVolume: boolean;
  showGrid: boolean;
  autoSave: boolean;
  lastUpdated: Date;
}

export interface DatabaseSchema {
  userPreferences: UserPreferences;
}

export interface DatabaseConfig {
  name: string;
  version: number;
  stores: {
    [key: string]: {
      keyPath: string;
      indexes?: { [indexName: string]: string | string[] };
    };
  };
}

export interface DatabaseError extends Error {
  code?: string;
  source?: string;
}