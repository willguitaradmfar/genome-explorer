export interface Trade {
  id: string;
  entryTime: number;
  exitTime?: number;
  entryPrice: number;
  exitPrice?: number;
  type: 'long' | 'short';
  quantity: number;
  profit?: number;
  profitPercent?: number;
  status: 'open' | 'closed';
  stopLoss?: number;
  takeProfit?: number;
  reason?: string;
}

export interface BacktestResult {
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  finalCapital: number;
  totalReturn: number;
  totalReturnPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  trades: Trade[];
  equityCurve: Array<{ time: number; value: number }>;
  dailyReturns: Array<{ date: string; return: number }>;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  parameters: StrategyParameter[];
  code?: string;
  type: 'builtin' | 'custom';
}

export interface StrategyParameter {
  name: string;
  label: string;
  type: 'number' | 'boolean' | 'select' | 'range';
  value: any;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: any }>;
}

export interface BacktestConfig {
  strategy: Strategy;
  symbol: string;
  timeframe: string;
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  commission: number;
  slippage: number;
  pyramiding: number;
  positionSize: number | 'percent' | 'fixed';
  riskPerTrade?: number;
}

export interface BacktestStatus {
  isRunning: boolean;
  progress: number;
  currentDate?: Date;
  message?: string;
  error?: string;
}