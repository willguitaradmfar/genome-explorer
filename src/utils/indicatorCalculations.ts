import { OHLC } from '../types/chart.types';
import { ActiveIndicator } from '../types/indicator.types';

export interface IndicatorData {
  time: number;
  value: number;
  color?: string;
}

export interface IndicatorSeries {
  id: string;
  name: string;
  type: 'line' | 'area';
  data: IndicatorData[];
  color: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
}

export class IndicatorCalculator {
  
  static calculateSMA(data: OHLC[], period: number, source: keyof OHLC = 'close'): IndicatorData[] {
    const result: IndicatorData[] = [];
    
    for (let i = period - 1; i < data.length; i++) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += data[j][source] as number;
      }
      
      result.push({
        time: data[i].time,
        value: sum / period
      });
    }
    
    return result;
  }
  
  static calculateRSI(data: OHLC[], period: number = 14): IndicatorData[] {
    const result: IndicatorData[] = [];
    const changes: number[] = [];
    
    // Calculate price changes
    for (let i = 1; i < data.length; i++) {
      changes.push(data[i].close - data[i - 1].close);
    }
    
    // Calculate RSI
    for (let i = period - 1; i < changes.length; i++) {
      let gains = 0;
      let losses = 0;
      
      for (let j = i - period + 1; j <= i; j++) {
        if (changes[j] > 0) {
          gains += changes[j];
        } else {
          losses += Math.abs(changes[j]);
        }
      }
      
      const avgGain = gains / period;
      const avgLoss = losses / period;
      
      if (avgLoss === 0) {
        result.push({
          time: data[i + 1].time,
          value: 100
        });
      } else {
        const rs = avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));
        
        result.push({
          time: data[i + 1].time,
          value: rsi
        });
      }
    }
    
    return result;
  }
  
  static calculateBollingerBands(data: OHLC[], period: number = 20, multiplier: number = 2): {
    upper: IndicatorData[];
    middle: IndicatorData[];
    lower: IndicatorData[];
  } {
    const sma = this.calculateSMA(data, period, 'close');
    const upper: IndicatorData[] = [];
    const middle: IndicatorData[] = [];
    const lower: IndicatorData[] = [];
    
    for (let i = period - 1; i < data.length; i++) {
      // Calculate standard deviation
      let sum = 0;
      const smaValue = sma[i - period + 1].value;
      
      for (let j = i - period + 1; j <= i; j++) {
        sum += Math.pow(data[j].close - smaValue, 2);
      }
      
      const stdDev = Math.sqrt(sum / period);
      
      const time = data[i].time;
      const middleValue = smaValue;
      const upperValue = middleValue + (stdDev * multiplier);
      const lowerValue = middleValue - (stdDev * multiplier);
      
      upper.push({ time, value: upperValue });
      middle.push({ time, value: middleValue });
      lower.push({ time, value: lowerValue });
    }
    
    return { upper, middle, lower };
  }
  
  static calculateMACD(data: OHLC[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): {
    macd: IndicatorData[];
    signal: IndicatorData[];
    histogram: IndicatorData[];
  } {
    const fastEMA = this.calculateEMA(data, fastPeriod);
    const slowEMA = this.calculateEMA(data, slowPeriod);
    const macdLine: IndicatorData[] = [];
    
    // Calculate MACD line
    const startIndex = Math.max(fastEMA.length, slowEMA.length) - Math.min(fastEMA.length, slowEMA.length);
    
    for (let i = startIndex; i < Math.min(fastEMA.length, slowEMA.length); i++) {
      macdLine.push({
        time: fastEMA[i].time,
        value: fastEMA[i].value - slowEMA[i - startIndex].value
      });
    }
    
    // Calculate signal line (EMA of MACD)
    const signalLine = this.calculateEMAFromData(macdLine, signalPeriod);
    
    // Calculate histogram
    const histogram: IndicatorData[] = [];
    for (let i = 0; i < Math.min(macdLine.length, signalLine.length); i++) {
      if (macdLine[i + (macdLine.length - signalLine.length)]) {
        histogram.push({
          time: signalLine[i].time,
          value: macdLine[i + (macdLine.length - signalLine.length)].value - signalLine[i].value
        });
      }
    }
    
    return {
      macd: macdLine,
      signal: signalLine,
      histogram
    };
  }
  
  private static calculateEMA(data: OHLC[], period: number): IndicatorData[] {
    const result: IndicatorData[] = [];
    const multiplier = 2 / (period + 1);
    
    // First EMA is just SMA
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += data[i].close;
    }
    let ema = sum / period;
    
    result.push({
      time: data[period - 1].time,
      value: ema
    });
    
    // Calculate remaining EMAs
    for (let i = period; i < data.length; i++) {
      ema = (data[i].close * multiplier) + (ema * (1 - multiplier));
      result.push({
        time: data[i].time,
        value: ema
      });
    }
    
    return result;
  }
  
  private static calculateEMAFromData(data: IndicatorData[], period: number): IndicatorData[] {
    const result: IndicatorData[] = [];
    const multiplier = 2 / (period + 1);
    
    if (data.length < period) return [];
    
    // First EMA is just SMA
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += data[i].value;
    }
    let ema = sum / period;
    
    result.push({
      time: data[period - 1].time,
      value: ema
    });
    
    // Calculate remaining EMAs
    for (let i = period; i < data.length; i++) {
      ema = (data[i].value * multiplier) + (ema * (1 - multiplier));
      result.push({
        time: data[i].time,
        value: ema
      });
    }
    
    return result;
  }
  
  static calculateIndicator(indicator: ActiveIndicator, data: OHLC[]): IndicatorSeries[] {
    const series: IndicatorSeries[] = [];
    
    switch (indicator.id) {
      case 'sma_20':
      case 'sma_50': {
        const period = indicator.values.period || 20;
        const indicatorData = this.calculateSMA(data, period, indicator.values.source as keyof OHLC || 'close');
        
        series.push({
          id: indicator.id,
          name: indicator.name,
          type: 'line',
          data: indicatorData,
          color: indicator.style.color || '#2196F3',
          lineWidth: indicator.style.lineWidth,
          lineStyle: indicator.style.lineStyle
        });
        break;
      }
      
      case 'rsi_14': {
        const period = indicator.values.period || 14;
        const indicatorData = this.calculateRSI(data, period);
        
        series.push({
          id: indicator.id,
          name: indicator.name,
          type: 'line',
          data: indicatorData,
          color: indicator.style.color || '#9C27B0',
          lineWidth: indicator.style.lineWidth,
          lineStyle: indicator.style.lineStyle
        });
        break;
      }
      
      case 'bollinger_bands': {
        const period = indicator.values.period || 20;
        const multiplier = indicator.values.multiplier || 2;
        const bands = this.calculateBollingerBands(data, period, multiplier);
        
        series.push(
          {
            id: `${indicator.id}_upper`,
            name: `${indicator.name} Upper`,
            type: 'line',
            data: bands.upper,
            color: indicator.style.upperColor || '#E91E63',
            lineWidth: indicator.style.lineWidth,
            lineStyle: indicator.style.lineStyle
          },
          {
            id: `${indicator.id}_middle`,
            name: `${indicator.name} Middle`,
            type: 'line',
            data: bands.middle,
            color: indicator.style.middleColor || '#9E9E9E',
            lineWidth: indicator.style.lineWidth,
            lineStyle: indicator.style.lineStyle
          },
          {
            id: `${indicator.id}_lower`,
            name: `${indicator.name} Lower`,
            type: 'line',
            data: bands.lower,
            color: indicator.style.lowerColor || '#E91E63',
            lineWidth: indicator.style.lineWidth,
            lineStyle: indicator.style.lineStyle
          }
        );
        break;
      }
      
      case 'macd': {
        const fastPeriod = indicator.values.fastPeriod || 12;
        const slowPeriod = indicator.values.slowPeriod || 26;
        const signalPeriod = indicator.values.signalPeriod || 9;
        const macd = this.calculateMACD(data, fastPeriod, slowPeriod, signalPeriod);
        
        series.push(
          {
            id: `${indicator.id}_macd`,
            name: `${indicator.name} Line`,
            type: 'line',
            data: macd.macd,
            color: indicator.style.macdColor || '#00BCD4',
            lineWidth: indicator.style.lineWidth,
            lineStyle: indicator.style.lineStyle || 'solid'
          },
          {
            id: `${indicator.id}_signal`,
            name: `${indicator.name} Signal`,
            type: 'line',
            data: macd.signal,
            color: indicator.style.signalColor || '#FF5722',
            lineWidth: indicator.style.lineWidth,
            lineStyle: indicator.style.lineStyle || 'solid'
          },
          {
            id: `${indicator.id}_histogram`,
            name: `${indicator.name} Histogram`,
            type: 'area',
            data: macd.histogram,
            color: indicator.style.histogramColor || '#4CAF50',
            lineWidth: 1,
            lineStyle: 'solid'
          }
        );
        break;
      }
    }
    
    return series;
  }
}