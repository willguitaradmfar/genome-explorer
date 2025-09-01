import { Indicator, ActiveIndicator } from '../types/indicator.types';
import { DataFolderManager } from './dataFolderManager';

export class IndicatorLoader {
  private static instance: IndicatorLoader;
  private availableIndicators: Indicator[] = [];

  private constructor() {}

  static getInstance(): IndicatorLoader {
    if (!IndicatorLoader.instance) {
      IndicatorLoader.instance = new IndicatorLoader();
    }
    return IndicatorLoader.instance;
  }

  async initializeIndicators(forceReload: boolean = false): Promise<Indicator[]> {
    // Return cached indicators unless force reload is requested
    if (!forceReload && this.availableIndicators.length > 0) {
      return this.availableIndicators;
    }
    try {
      // Get configured data path
      const dataFolderManager = DataFolderManager.getInstance();
      const indicatorsPath = dataFolderManager.getIndicatorsPath();
      
      if (!indicatorsPath) {
        console.warn('Data folder not configured. Please configure the data folder first.');
        this.availableIndicators = [];
        return this.availableIndicators;
      }
      
      // In Electron, we can read files directly
      if (window.require) {
        const fs = window.require('fs');
        const path = window.require('path');
        
        const dataDir = indicatorsPath;
        
        try {
          const files = fs.readdirSync(dataDir);
          const indicators: Indicator[] = [];
          
          for (const file of files) {
            if (file.endsWith('.json')) {
              try {
                const filePath = path.join(dataDir, file);
                const content = fs.readFileSync(filePath, 'utf8');
                const indicator: Indicator = JSON.parse(content);
                indicators.push(indicator);
              } catch (error) {
                console.warn(`Error loading indicator ${file}:`, error);
              }
            }
          }
          
          this.availableIndicators = indicators;
        } catch (error) {
          console.warn('Could not read indicators directory:', error);
          // Fallback to hardcoded indicators
          this.availableIndicators = this.getDefaultIndicators();
        }
      } else {
        // Fallback for web environment
        this.availableIndicators = this.getDefaultIndicators();
      }
      
      return this.availableIndicators;
    } catch (error) {
      console.error('Error initializing indicators:', error);
      return [];
    }
  }

  getAvailableIndicators(): Indicator[] {
    return this.availableIndicators;
  }

  getAllIndicators(): Indicator[] {
    // Return all indicators, no filtering by symbol
    return this.availableIndicators;
  }

  private getDefaultIndicators(): Indicator[] {
    // No fallback indicators - system requires JSON files
    return [];
  }

  createActiveIndicator(indicator: Indicator): ActiveIndicator {
    // Extract default values from parameters
    const values: { [key: string]: any } = {};
    Object.keys(indicator.parameters).forEach(key => {
      const param = indicator.parameters[key];
      values[key] = param.default;
    });
    
    return {
      ...indicator,
      baseId: indicator.id,
      isActive: true,
      addedAt: new Date(),
      values
    };
  }
}