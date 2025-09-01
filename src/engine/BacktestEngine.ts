import { OHLC } from '../types/chart.types';
import { Trade, BacktestResult, BacktestConfig } from '../types/backtest.types';

export class BacktestEngine {
  private config: BacktestConfig;
  private data: OHLC[];
  private trades: Trade[] = [];
  private currentPosition: Trade | null = null;
  private capital: number;
  private equityCurve: Array<{ time: number; value: number }> = [];
  private openPositions: number = 0;

  constructor(config: BacktestConfig, data: OHLC[]) {
    this.config = config;
    this.data = data;
    this.capital = config.initialCapital;
  }

  async run(onProgress?: (progress: number) => void): Promise<BacktestResult> {
    
    for (let i = 50; i < this.data.length; i++) {
      const currentBar = this.data[i];
      const previousBars = this.data.slice(Math.max(0, i - 100), i);
      
      // Update progress
      if (onProgress) {
        onProgress((i / this.data.length) * 100);
      }

      // Execute strategy logic
      const signal = this.executeStrategy(currentBar, previousBars);
      
      // Process signal
      if (signal) {
        this.processSignal(signal, currentBar, i);
      }

      // Check stop loss and take profit
      this.checkExitConditions(currentBar);

      // Record equity
      this.equityCurve.push({
        time: currentBar.time,
        value: this.calculateEquity(currentBar.close)
      });
    }

    // Close any remaining positions
    if (this.currentPosition) {
      this.closePosition(this.currentPosition, this.data[this.data.length - 1]);
    }

    return this.generateResults();
  }

  private executeStrategy(currentBar: OHLC, previousBars: OHLC[]): any {
    // Simple Moving Average Crossover Strategy as example
    const fastMA = this.calculateSMA(previousBars.map(b => b.close), 20);
    const slowMA = this.calculateSMA(previousBars.map(b => b.close), 50);
    
    if (previousBars.length < 50) return null;

    const prevFastMA = this.calculateSMA(previousBars.slice(0, -1).map(b => b.close), 20);
    const prevSlowMA = this.calculateSMA(previousBars.slice(0, -1).map(b => b.close), 50);

    // Buy signal
    if (fastMA > slowMA && prevFastMA <= prevSlowMA && !this.currentPosition) {
      return { type: 'buy', price: currentBar.close };
    }

    // Sell signal
    if (fastMA < slowMA && prevFastMA >= prevSlowMA && this.currentPosition) {
      return { type: 'sell', price: currentBar.close };
    }

    return null;
  }

  private processSignal(signal: any, currentBar: OHLC, index: number) {
    if (signal.type === 'buy' && this.openPositions < this.config.pyramiding) {
      this.openPosition('long', currentBar, index);
    } else if (signal.type === 'sell' && this.currentPosition) {
      this.closePosition(this.currentPosition, currentBar);
    }
  }

  private openPosition(type: 'long' | 'short', bar: OHLC, index: number) {
    const positionSize = this.calculatePositionSize(bar.close);
    
    const trade: Trade = {
      id: `trade_${Date.now()}_${index}`,
      entryTime: bar.time,
      entryPrice: bar.close,
      type,
      quantity: positionSize,
      status: 'open',
      stopLoss: type === 'long' ? bar.close * 0.98 : bar.close * 1.02,
      takeProfit: type === 'long' ? bar.close * 1.05 : bar.close * 0.95,
    };

    this.currentPosition = trade;
    this.trades.push(trade);
    this.openPositions++;
    
    // Deduct from capital
    const cost = positionSize * bar.close * (1 + this.config.commission / 100);
    this.capital -= cost;
  }

  private closePosition(trade: Trade, bar: OHLC) {
    trade.exitTime = bar.time;
    trade.exitPrice = bar.close;
    trade.status = 'closed';
    
    const grossProfit = trade.type === 'long' 
      ? (trade.exitPrice - trade.entryPrice) * trade.quantity
      : (trade.entryPrice - trade.exitPrice) * trade.quantity;
    
    const commission = (trade.quantity * trade.exitPrice * this.config.commission / 100);
    trade.profit = grossProfit - commission;
    trade.profitPercent = (trade.profit / (trade.entryPrice * trade.quantity)) * 100;
    
    // Add to capital
    this.capital += (trade.quantity * trade.exitPrice) - commission;
    
    this.currentPosition = null;
    this.openPositions--;
  }

  private checkExitConditions(bar: OHLC) {
    if (!this.currentPosition || this.currentPosition.status === 'closed') return;

    const trade = this.currentPosition;
    
    // Check stop loss
    if (trade.stopLoss) {
      if ((trade.type === 'long' && bar.low <= trade.stopLoss) ||
          (trade.type === 'short' && bar.high >= trade.stopLoss)) {
        trade.reason = 'Stop Loss';
        this.closePosition(trade, bar);
        return;
      }
    }

    // Check take profit
    if (trade.takeProfit) {
      if ((trade.type === 'long' && bar.high >= trade.takeProfit) ||
          (trade.type === 'short' && bar.low <= trade.takeProfit)) {
        trade.reason = 'Take Profit';
        this.closePosition(trade, bar);
      }
    }
  }

  private calculatePositionSize(price: number): number {
    if (this.config.positionSize === 'percent') {
      return (this.capital * 0.1) / price; // 10% of capital
    } else if (typeof this.config.positionSize === 'number') {
      return this.config.positionSize;
    }
    return 1;
  }

  private calculateEquity(currentPrice: number): number {
    let equity = this.capital;
    
    if (this.currentPosition && this.currentPosition.status === 'open') {
      const unrealizedPnL = this.currentPosition.type === 'long'
        ? (currentPrice - this.currentPosition.entryPrice) * this.currentPosition.quantity
        : (this.currentPosition.entryPrice - currentPrice) * this.currentPosition.quantity;
      equity += unrealizedPnL;
    }
    
    return equity;
  }

  private calculateSMA(values: number[], period: number): number {
    if (values.length < period) return 0;
    const sum = values.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
  }

  private generateResults(): BacktestResult {
    const closedTrades = this.trades.filter(t => t.status === 'closed');
    const winningTrades = closedTrades.filter(t => t.profit! > 0);
    const losingTrades = closedTrades.filter(t => t.profit! <= 0);
    
    // const totalProfit = closedTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
    const totalReturn = this.capital - this.config.initialCapital;
    const totalReturnPercent = (totalReturn / this.config.initialCapital) * 100;
    
    const averageWin = winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + t.profit!, 0) / winningTrades.length
      : 0;
    
    const averageLoss = losingTrades.length > 0
      ? Math.abs(losingTrades.reduce((sum, t) => sum + t.profit!, 0) / losingTrades.length)
      : 0;
    
    const profitFactor = averageLoss > 0 ? averageWin / averageLoss : averageWin;
    
    const maxDrawdown = this.calculateMaxDrawdown();
    const sharpeRatio = this.calculateSharpeRatio();
    
    return {
      startDate: new Date(this.data[0].time * 1000),
      endDate: new Date(this.data[this.data.length - 1].time * 1000),
      initialCapital: this.config.initialCapital,
      finalCapital: this.capital,
      totalReturn,
      totalReturnPercent,
      totalTrades: closedTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0,
      averageWin,
      averageLoss,
      profitFactor,
      maxDrawdown: maxDrawdown.value,
      maxDrawdownPercent: maxDrawdown.percent,
      sharpeRatio,
      trades: this.trades,
      equityCurve: this.equityCurve,
      dailyReturns: this.calculateDailyReturns(),
    };
  }

  private calculateMaxDrawdown(): { value: number; percent: number } {
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;
    let peak = this.equityCurve[0]?.value || this.config.initialCapital;
    
    for (const point of this.equityCurve) {
      if (point.value > peak) {
        peak = point.value;
      }
      const drawdown = peak - point.value;
      const drawdownPercent = (drawdown / peak) * 100;
      
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPercent = drawdownPercent;
      }
    }
    
    return { value: maxDrawdown, percent: maxDrawdownPercent };
  }

  private calculateSharpeRatio(): number {
    const returns = this.calculateDailyReturns();
    if (returns.length === 0) return 0;
    
    const avgReturn = returns.reduce((sum, r) => sum + r.return, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r.return - avgReturn, 2), 0) / returns.length
    );
    
    return stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized
  }

  private calculateDailyReturns(): Array<{ date: string; return: number }> {
    const dailyReturns: Array<{ date: string; return: number }> = [];
    let lastValue = this.config.initialCapital;
    
    for (let i = 0; i < this.equityCurve.length; i++) {
      const currentValue = this.equityCurve[i].value;
      const dailyReturn = ((currentValue - lastValue) / lastValue) * 100;
      
      dailyReturns.push({
        date: new Date(this.equityCurve[i].time * 1000).toISOString().split('T')[0],
        return: dailyReturn,
      });
      
      lastValue = currentValue;
    }
    
    return dailyReturns;
  }
}