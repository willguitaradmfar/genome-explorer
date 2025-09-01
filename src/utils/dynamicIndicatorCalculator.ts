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
    switch (baseId) {
      case 'sma':
        return this.calculateSMA(data, activeIndicator.values);
      case 'ema':
        return this.calculateEMA(data, activeIndicator.values);
      case 'rsi':
        return this.calculateRSI(data, activeIndicator.values);
      case 'macd':
        return this.calculateMACD(data, activeIndicator.values);
      default:
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

  private static calculateMACD(data: OHLC[], parameters: any): { time: number; value: number }[] {
    const fastPeriod = parameters.fastPeriod || 12;
    const slowPeriod = parameters.slowPeriod || 26;
    const result: { time: number; value: number }[] = [];
    
    // Calculate EMAs
    const fastEMA = this.calculateEMA(data, { period: fastPeriod, source: 'close' });
    const slowEMA = this.calculateEMA(data, { period: slowPeriod, source: 'close' });
    
    // Calculate MACD line
    const minLength = Math.min(fastEMA.length, slowEMA.length);
    for (let i = 0; i < minLength; i++) {
      if (fastEMA[i] && slowEMA[i]) {
        result.push({
          time: fastEMA[i].time,
          value: fastEMA[i].value - slowEMA[i].value
        });
      }
    }
    
    return result;
  }
  
  static async calculateIndicator(activeIndicator: ActiveIndicator, data: OHLC[]): Promise<IndicatorResult[]> {
    const results: IndicatorResult[] = [];
    
    try {
      // Load the corresponding JavaScript calculation file
      if (window.require) {
        const baseId = activeIndicator.baseId || activeIndicator.id;
        const path = window.require('path');
        const jsFilePath = path.join(process.cwd(), 'data', 'indicators', `${baseId}.js`);
        
        // Load the calculation function
        const calculationModule = window.require(jsFilePath);
        const functionName = `calculate${baseId.toUpperCase()}`;
        
        if (calculationModule[functionName]) {
          const calculatedData = calculationModule[functionName](data, activeIndicator.values);
          
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
          console.warn(`Function ${functionName} not found in ${activeIndicator.id}.js`);
        }
      } else {
        // Fallback for web environment - use built-in calculations
        const calculatedData = this.calculateBuiltInIndicator(activeIndicator, data);
        if (calculatedData) {
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
          console.warn(`No built-in calculation available for ${activeIndicator.id}`);
        }
      }
      
    } catch (error) {
      console.error(`Error calculating indicator ${activeIndicator.id}:`, error);
    }
    
    return results;
  }
}