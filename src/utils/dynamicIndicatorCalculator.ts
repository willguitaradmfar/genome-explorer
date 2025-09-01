import { OHLC } from '../types/chart.types';
import { ActiveIndicator } from '../types/indicator.types';

export interface IndicatorResult {
  id: string;
  name: string;
  type: 'line' | 'area';
  data: { time: number; value: number; color?: string }[];
  color: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
}

export class DynamicIndicatorCalculator {

  
  static async calculateIndicator(activeIndicator: ActiveIndicator, data: OHLC[]): Promise<IndicatorResult[]> {
    const results: IndicatorResult[] = [];
    
    try {
      const baseId = activeIndicator.baseId || activeIndicator.id;
      console.log(`Calculating indicator: ${baseId} (id: ${activeIndicator.id})`);
      
      // Only try to load external JavaScript calculation files
      if (!window.require) {
        console.warn('File system not available - indicator calculations require Electron environment');
        return results;
      }
      
      const fs = window.require('fs');
      const path = window.require('path');
      const { DataFolderManager } = await import('./dataFolderManager');
      const dataFolderManager = DataFolderManager.getInstance();
      const indicatorsPath = dataFolderManager.getIndicatorsPath();
      
      if (!indicatorsPath) {
        console.warn('Data folder not configured - cannot load indicator calculations');
        return results;
      }
      
      const jsFilePath = path.join(indicatorsPath, `${baseId}.js`);
      
      // Check if calculation file exists
      if (!fs.existsSync(jsFilePath)) {
        console.warn(`Calculation file not found: ${jsFilePath}`);
        return results;
      }
      
      // Load and execute the calculation function
      delete require.cache[jsFilePath]; // Clear cache to allow hot reloading
      const calculationModule = window.require(jsFilePath);
      const functionName = `calculate${baseId.toUpperCase()}`;
      
      if (!calculationModule[functionName]) {
        console.error(`Function ${functionName} not found in ${baseId}.js`);
        return results;
      }
      
      console.log(`Calling ${functionName} with ${data.length} data points`);
      const calculatedData = calculationModule[functionName](data, activeIndicator.values);
      
      if (!calculatedData) {
        console.warn(`No data returned from ${functionName}`);
        return results;
      }
      
      // Handle different return types generically
      if (Array.isArray(calculatedData)) {
        // Single series - simple array of {time, value}
        console.log(`Single series indicator with ${calculatedData.length} points`);
        results.push({
          id: activeIndicator.id,
          name: activeIndicator.name,
          type: 'line',
          data: calculatedData,
          color: activeIndicator.values.color || activeIndicator.style.color || '#2196F3',
          lineWidth: activeIndicator.style.lineWidth || 2,
          lineStyle: activeIndicator.style.lineStyle || 'solid'
        });
        
      } else if (typeof calculatedData === 'object') {
        // Multi-series - object with named arrays
        console.log(`Multi-series indicator detected:`, Object.keys(calculatedData));
        
        // Create a series for each property in the returned object
        Object.entries(calculatedData).forEach(([seriesName, seriesData]) => {
          if (Array.isArray(seriesData) && seriesData.length > 0) {
            const seriesColor = activeIndicator.values[`${seriesName}Color`] || 
                              this.getDefaultColorForSeries(seriesName, Object.keys(calculatedData).indexOf(seriesName));
            
            results.push({
              id: `${activeIndicator.id}_${seriesName}`,
              name: `${activeIndicator.name} (${seriesName})`,
              type: 'line',
              data: seriesData,
              color: seriesColor,
              lineWidth: activeIndicator.style.lineWidth || 2,
              lineStyle: activeIndicator.style.lineStyle || 'solid'
            });
          }
        });
        
      } else {
        console.error(`Invalid data format returned from ${functionName}:`, typeof calculatedData);
        return results;
      }
      
      console.log(`Successfully created ${results.length} series for ${baseId}`);
      
    } catch (error) {
      console.error(`Error calculating indicator ${activeIndicator.id}:`, error);
    }
    
    return results;
  }
  
  private static getDefaultColorForSeries(seriesName: string, index: number): string {
    // Default color palette for multi-series indicators
    const colors = ['#2196F3', '#FF9800', '#4CAF50', '#9C27B0', '#F44336', '#00BCD4'];
    
    // Common series name mappings
    const colorMap: Record<string, string> = {
      'macd': '#2196F3',
      'signal': '#FF9800', 
      'histogram': '#4CAF50',
      'upper': '#2196F3',
      'middle': '#FF9800',
      'lower': '#4CAF50',
      'fast': '#2196F3',
      'slow': '#FF9800'
    };
    
    return colorMap[seriesName.toLowerCase()] || colors[index % colors.length];
  }
}