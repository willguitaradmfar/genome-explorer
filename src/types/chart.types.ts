export interface OHLC {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface ChartData {
  data: OHLC[];
  volumeData: VolumeData[];
}

export interface VolumeData {
  time: number;
  value: number;
  color?: string;
}

export interface Indicator {
  name: string;
  enabled: boolean;
  period?: number;
  color?: string;
  lineWidth?: number;
}

export type TimeFrame = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w' | '1M';

export interface Symbol {
  symbol: string;
  name: string;
  exchange: string;
  type: 'crypto' | 'forex' | 'stock';
}

export interface ChartIndicatorSeries {
  id: string;
  name: string;
  type: 'line' | 'area';
  data: { time: number; value: number; color?: string }[];
  color: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  paneIndex?: number; // 0 = main chart, 1+ = separate panes
}

export interface ChartSettings {
  theme: 'dark' | 'light';
  showVolume: boolean;
  showGrid: boolean;
  indicators: Indicator[];
  timeFrame: TimeFrame;
  symbol: Symbol;
}

export interface MarketData {
  symbol: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  marketCap?: number;
  lastUpdate: Date;
}