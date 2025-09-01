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
  
  private static calculateBuiltInIndicator(activeIndicator: ActiveIndicator, data: OHLC[]): { time: number; value: number }[] | null {
    const baseId = activeIndicator.baseId || activeIndicator.id;
    console.log(`Calculating built-in indicator: ${baseId} (original id: ${activeIndicator.id})`);
    
    switch (baseId.toLowerCase()) {
      case 'sma':
        return this.calculateSMA(data, activeIndicator.values);
      case 'ema':
        return this.calculateEMA(data, activeIndicator.values);
      case 'rsi':
        return this.calculateRSI(data, activeIndicator.values);
      case 'macd':
        console.log('Calling calculateMACD with data length:', data.length, 'parameters:', activeIndicator.values);
        return this.calculateMACD(data, activeIndicator.values);
      default:
        console.warn(`No built-in calculation for indicator: ${baseId}`);
        return null;
    }
  }

  private static calculateSMA(data: OHLC[], parameters: any): { time: number; value: number }[] {
    const period = parameters.period || 20;
    const source = parameters.source || 'close';
    const result: { time: number; value: number }[] = [];
    
    for (let i = period - 1; i < data.length; i++) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += (data[j] as any)[source];
      }
      
      result.push({
        time: data[i].time,
        value: sum / period
      });
    }
    
    return result;
  }

  private static calculateEMA(data: OHLC[], parameters: any): { time: number; value: number }[] {
    const period = parameters.period || 20;
    const source = parameters.source || 'close';
    const multiplier = 2 / (period + 1);
    const result: { time: number; value: number }[] = [];
    
    if (data.length === 0) return result;
    
    // Start with SMA for the first value
    let ema = (data[0] as any)[source];
    result.push({ time: data[0].time, value: ema });
    
    for (let i = 1; i < data.length; i++) {
      ema = ((data[i] as any)[source] - ema) * multiplier + ema;
      result.push({
        time: data[i].time,
        value: ema
      });
    }
    
    return result;
  }

  private static calculateRSI(data: OHLC[], parameters: any): { time: number; value: number }[] {
    const period = parameters.period || 14;
    const result: { time: number; value: number }[] = [];
    
    if (data.length < period + 1) return result;
    
    const gains: number[] = [];
    const losses: number[] = [];
    
    // Calculate price changes
    for (let i = 1; i < data.length; i++) {
      const change = data[i].close - data[i - 1].close;
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }
    
    // Calculate RSI
    for (let i = period - 1; i < gains.length; i++) {
      const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b) / period;
      const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b) / period;
      
      const rs = avgGain / avgLoss;
      const rsi = 100 - (100 / (1 + rs));
      
      result.push({
        time: data[i + 1].time,
        value: rsi
      });
    }
    
    return result;
  }

  private static calculateMACD(data: OHLC[], parameters: any): any {
    const fastPeriod = parameters.fastPeriod || 12;
    const slowPeriod = parameters.slowPeriod || 26;
    const signalPeriod = parameters.signalPeriod || 9;
    
    if (!data || data.length < slowPeriod) {
      console.warn('Not enough data for MACD calculation');
      return { macd: [], signal: [], histogram: [] };
    }
    
    // Calculate EMAs
    const fastEMA = this.calculateEMA(data, { period: fastPeriod, source: 'close' });
    const slowEMA = this.calculateEMA(data, { period: slowPeriod, source: 'close' });
    
    if (!fastEMA || !slowEMA || fastEMA.length === 0 || slowEMA.length === 0) {
      console.warn('EMA calculations failed for MACD');
      return { macd: [], signal: [], histogram: [] };
    }
    
    // Calculate MACD line - align by time since slow EMA starts later
    const slowEMAMap = new Map(slowEMA.map(item => [item.time, item.value]));
    const macdLine: { time: number; value: number }[] = [];
    
    for (const fastItem of fastEMA) {
      const slowValue = slowEMAMap.get(fastItem.time);
      if (slowValue !== undefined && fastItem.time && fastItem.value !== undefined) {
        macdLine.push({
          time: fastItem.time,
          value: fastItem.value - slowValue
        });
      }
    }
    
    // Calculate Signal line (EMA of MACD)
    const signalLine = this.calculateEMA(macdLine.map(item => ({
      time: item.time,
      open: item.value,
      high: item.value,
      low: item.value,
      close: item.value
    })), { period: signalPeriod, source: 'close' });
    
    // Calculate Histogram (MACD - Signal)
    const signalMap = new Map(signalLine.map(item => [item.time, item.value]));
    const histogram: { time: number; value: number }[] = [];
    
    for (const macdItem of macdLine) {
      const signalValue = signalMap.get(macdItem.time);
      if (signalValue !== undefined) {
        histogram.push({
          time: macdItem.time,
          value: macdItem.value - signalValue
        });
      }
    }
    
    console.log(`MACD calculated - MACD: ${macdLine.length}, Signal: ${signalLine.length}, Histogram: ${histogram.length} points`);
    
    return {
      macd: macdLine,
      signal: signalLine,
      histogram: histogram
    };
  }
  
  static async calculateIndicator(activeIndicator: ActiveIndicator, data: OHLC[]): Promise<IndicatorResult[]> {
    const results: IndicatorResult[] = [];
    
    try {
      const baseId = activeIndicator.baseId || activeIndicator.id;
      let calculatedData = null;
      
      // Try to load external JavaScript calculation file first
      if (window.require) {
        try {
          const fs = window.require('fs');
          const path = window.require('path');
          const { DataFolderManager } = await import('./dataFolderManager');
          const dataFolderManager = DataFolderManager.getInstance();
          const indicatorsPath = dataFolderManager.getIndicatorsPath();
          
          if (indicatorsPath) {
            const jsFilePath = path.join(indicatorsPath, `${baseId}.js`);
            
            // Check if file exists before trying to require it
            if (fs.existsSync(jsFilePath)) {
              const calculationModule = window.require(jsFilePath);
              const functionName = `calculate${baseId.toUpperCase()}`;
              
              if (calculationModule[functionName]) {
                calculatedData = calculationModule[functionName](data, activeIndicator.values);
              } else {
                console.warn(`Function ${functionName} not found in ${baseId}.js`);
              }
            }
          }
        } catch (fileError) {
          console.debug(`External indicator file not found for ${baseId}, using built-in calculation`);
        }
      }
      
      // If no external calculation was found, use built-in
      if (!calculatedData) {
        calculatedData = this.calculateBuiltInIndicator(activeIndicator, data);
        
        if (!calculatedData) {
          console.warn(`No calculation available for indicator ${baseId}`);
          return results;
        }
      }
      
      // Handle different data structures
      if (!calculatedData) {
        console.warn(`No calculated data for ${baseId}`);
        return results;
      }
      
      // Handle multi-series indicators (like MACD)
      if (typeof calculatedData === 'object' && !Array.isArray(calculatedData)) {
        console.log(`Multi-series indicator detected for ${baseId}:`, Object.keys(calculatedData));
        
        // For MACD, create multiple series
        if (baseId.toLowerCase() === 'macd') {
          const macdData = calculatedData as any;
          
          // Add MACD line
          if (macdData.macd && Array.isArray(macdData.macd)) {
            results.push({
              id: `${activeIndicator.id}_macd`,
              name: `${activeIndicator.name} (MACD)`,
              type: 'line',
              data: macdData.macd,
              color: activeIndicator.values.macdColor || '#2196F3',
              lineWidth: activeIndicator.style.lineWidth || 2,
              lineStyle: activeIndicator.style.lineStyle || 'solid'
            });
          }
          
          // Add Signal line
          if (macdData.signal && Array.isArray(macdData.signal)) {
            results.push({
              id: `${activeIndicator.id}_signal`,
              name: `${activeIndicator.name} (Signal)`,
              type: 'line',
              data: macdData.signal,
              color: activeIndicator.values.signalColor || '#FF9800',
              lineWidth: activeIndicator.style.lineWidth || 2,
              lineStyle: activeIndicator.style.lineStyle || 'solid'
            });
          }
          
          // Add Histogram (as area or line)
          if (macdData.histogram && Array.isArray(macdData.histogram)) {
            results.push({
              id: `${activeIndicator.id}_histogram`,
              name: `${activeIndicator.name} (Histogram)`,
              type: 'line',
              data: macdData.histogram,
              color: activeIndicator.values.histogramColor || '#4CAF50',
              lineWidth: activeIndicator.style.lineWidth || 1,
              lineStyle: activeIndicator.style.lineStyle || 'solid'
            });
          }
          
          console.log(`Created ${results.length} series for MACD`);
          return results;
        }
      }
      
      // Handle single-series indicators
      if (!Array.isArray(calculatedData)) {
        console.error(`Calculated data for ${baseId} is not an array:`, calculatedData);
        return results;
      }
      
      console.log(`Successfully calculated ${baseId} with ${calculatedData.length} data points`);
      
      // Add the calculated data to results
      results.push({
        id: activeIndicator.id,
        name: activeIndicator.name,
        type: 'line',
        data: calculatedData,
        color: activeIndicator.values.color || activeIndicator.style.color || '#2196F3',
        lineWidth: activeIndicator.style.lineWidth,
        lineStyle: activeIndicator.style.lineStyle
      });
      
    } catch (error) {
      console.error(`Error calculating indicator ${activeIndicator.id}:`, error);
      
      // Try built-in calculation as last resort
      try {
        const calculatedData = this.calculateBuiltInIndicator(activeIndicator, data);
        if (calculatedData && Array.isArray(calculatedData)) {
          console.log(`Fallback calculation successful for ${activeIndicator.id} with ${calculatedData.length} points`);
          results.push({
            id: activeIndicator.id,
            name: activeIndicator.name,
            type: 'line',
            data: calculatedData,
            color: activeIndicator.values.color || activeIndicator.style.color || '#2196F3',
            lineWidth: activeIndicator.style.lineWidth,
            lineStyle: activeIndicator.style.lineStyle
          });
        } else {
          console.error(`Fallback calculation returned invalid data for ${activeIndicator.id}:`, calculatedData);
        }
      } catch (fallbackError) {
        console.error(`Fallback calculation also failed for ${activeIndicator.id}:`, fallbackError);
      }
    }
    
    return results;
  }
}