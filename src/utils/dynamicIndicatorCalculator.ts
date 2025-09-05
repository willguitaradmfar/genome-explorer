import { OHLC } from '../types/chart.types';
import { ActiveIndicator } from '../types/indicator.types';

export interface IndicatorResult {
  id: string;
  name: string;
  type: 'line' | 'area' | 'histogram';
  data: { time: number; value: number | null; color?: string }[];
  color: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
}

export class DynamicIndicatorCalculator {

  // Align indicator data with main data timeline to prevent visual shifts
  private static alignIndicatorData(
    indicatorData: { time: number; value: number }[],
    mainData: OHLC[]
  ): { time: number; value: number | null }[] {
    const aligned: { time: number; value: number | null }[] = [];
    
    // Create a map of indicator data by time for fast lookup
    const indicatorMap = new Map<number, number>();
    indicatorData.forEach(point => {
      indicatorMap.set(point.time, point.value);
    });
    
    // Fill all time points from main data
    mainData.forEach(mainPoint => {
      const value = indicatorMap.get(mainPoint.time);
      aligned.push({
        time: mainPoint.time,
        value: value !== undefined ? value : null
      });
    });
    
    return aligned;
  }
  
  static async calculateIndicator(activeIndicator: ActiveIndicator, data: OHLC[]): Promise<IndicatorResult[]> {
    return new Promise((resolve) => {
      // Use requestAnimationFrame to run calculation in next frame, preventing UI blocking
      requestAnimationFrame(async () => {
        const results: IndicatorResult[] = [];
        
        try {
          const baseId = activeIndicator.baseId || activeIndicator.id;
          console.log(`Calculating indicator: ${baseId} (id: ${activeIndicator.id})`);
          
          // Only try to load external JavaScript calculation files
          if (!window.require) {
            console.warn('File system not available - indicator calculations require Electron environment');
            resolve(results);
            return;
          }
          
          const fs = window.require('fs');
          const path = window.require('path');
          const { DataFolderManager } = await import('./dataFolderManager');
          const dataFolderManager = DataFolderManager.getInstance();
          const indicatorsPath = dataFolderManager.getIndicatorsPath();
          
          if (!indicatorsPath) {
            console.warn('Data folder not configured - cannot load indicator calculations');
            resolve(results);
            return;
          }
          
          const jsFilePath = path.join(indicatorsPath, `${baseId}.js`);
          
          // Check if calculation file exists
          if (!fs.existsSync(jsFilePath)) {
            console.warn(`Calculation file not found: ${jsFilePath}`);
            resolve(results);
            return;
          }
          
          // Load and execute the calculation function
          delete require.cache[jsFilePath]; // Clear cache to allow hot reloading
          const calculationModule = window.require(jsFilePath);
          const functionName = `calculate${baseId.toUpperCase()}`;
          
          if (!calculationModule[functionName]) {
            console.error(`Function ${functionName} not found in ${baseId}.js`);
            resolve(results);
            return;
          }
          
          console.log(`Calling ${functionName} with ${data.length} data points`);
          
          // Break up heavy calculations using setTimeout to yield control back to UI
          setTimeout(async () => {
            try {
              const calculatedData = calculationModule[functionName](data, activeIndicator.values);
      
              if (!calculatedData) {
                console.warn(`No data returned from ${functionName}`);
                resolve(results);
                return;
              }
              
              // Handle different return types generically
              if (Array.isArray(calculatedData)) {
                // Single series - simple array of {time, value} - align with main data
                console.log(`Single series indicator with ${calculatedData.length} points`);
                const alignedData = this.alignIndicatorData(calculatedData, data);
                
                results.push({
                  id: activeIndicator.id,
                  name: activeIndicator.name,
                  type: 'line',
                  data: alignedData,
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
                    
                    // Determine series type based on name
                    const seriesType = this.getSeriesTypeForName(seriesName);
                    
                    // Align multi-series data with main data timeline
                    const alignedData = this.alignIndicatorData(seriesData as any[], data);
                    
                    results.push({
                      id: `${activeIndicator.id}_${seriesName}`,
                      name: `${activeIndicator.name} (${seriesName})`,
                      type: seriesType,
                      data: alignedData,
                      color: seriesColor,
                      lineWidth: activeIndicator.style.lineWidth || 2,
                      lineStyle: activeIndicator.style.lineStyle || 'solid'
                    });
                  }
                });
                
              } else {
                console.error(`Invalid data format returned from ${functionName}:`, typeof calculatedData);
                resolve(results);
                return;
              }
              
              console.log(`Successfully created ${results.length} series for ${baseId}`);
              resolve(results);
              
            } catch (error) {
              console.error(`Error calculating indicator ${activeIndicator.id}:`, error);
              resolve(results);
            }
          }, 0); // Use setTimeout 0 to yield control back to UI thread
          
        } catch (error) {
          console.error(`Error calculating indicator ${activeIndicator.id}:`, error);
          resolve(results);
        }
      });
    });
  }
  
  private static getSeriesTypeForName(seriesName: string): 'line' | 'area' | 'histogram' {
    // Series that should be rendered as histograms
    const histogramTypes = ['histogram', 'volume', 'bar'];
    
    if (histogramTypes.includes(seriesName.toLowerCase())) {
      return 'histogram';
    }
    
    // Default to line for everything else
    return 'line';
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