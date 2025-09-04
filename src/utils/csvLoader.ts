import { OHLC, VolumeData } from '../types/chart.types';
import { DataFolderManager } from './dataFolderManager';
import { SymbolDataRepository } from '../repositories/symbol-data/SymbolDataRepository';

export interface CSVSymbol {
  filename: string;
  symbol: string;
  name: string;
  description: string;
  exchange: string;
  type: string;
  timeframe: string;
  baseAsset: string;
  quoteAsset: string;
  displayName: string;
  lineCount: number;
  fileSizeKB: number;
}

// CSV structure: timestamp,open,high,low,close,volume,close_time,quote_asset_volume,count,taker_buy_base_asset_volume,taker_buy_quote_asset_volume,ignore
export interface CSVRow {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  close_time: number;
  quote_asset_volume: number;
  count: number;
  taker_buy_base_asset_volume: number;
  taker_buy_quote_asset_volume: number;
  ignore: number;
}

export class CSVLoader {
  private static instance: CSVLoader;
  private availableSymbols: CSVSymbol[] = [];
  private symbolDataRepository: SymbolDataRepository;

  private constructor() {
    this.symbolDataRepository = SymbolDataRepository.getInstance();
  }

  static getInstance(): CSVLoader {
    if (!CSVLoader.instance) {
      CSVLoader.instance = new CSVLoader();
    }
    return CSVLoader.instance;
  }

  async initializeSymbols(forceReload: boolean = false): Promise<CSVSymbol[]> {
    // Return cached symbols unless force reload is requested
    if (!forceReload && this.availableSymbols.length > 0) {
      return this.availableSymbols;
    }
    try {
      // Get configured data path
      const dataFolderManager = DataFolderManager.getInstance();
      const symbolsPath = dataFolderManager.getSymbolsPath();
      
      if (!symbolsPath) {
        console.warn('Data folder not configured. Please configure the data folder first.');
        this.availableSymbols = [];
        return this.availableSymbols;
      }
      
      // In Electron, we can read files directly
      if (window.require) {
        const fs = window.require('fs');
        const path = window.require('path');
        
        const dataDir = symbolsPath;
        
        try {
          const files = fs.readdirSync(dataDir);
          const csvFiles = files.filter((file: string) => file.endsWith('.csv'));
          
          this.availableSymbols = [];
          
          for (const file of csvFiles) {
            try {
              const filePath = path.join(dataDir, file);
              const stats = fs.statSync(filePath);
              const fileSizeKB = Math.round(stats.size / 1024);
              
              // Count lines in CSV file
              const content = fs.readFileSync(filePath, 'utf8');
              const lineCount = content.split('\n').filter((line: string) => line.trim()).length;
              
              // Try to load metadata from JSON file
              const jsonFile = file.replace('.csv', '.json');
              const jsonPath = path.join(dataDir, jsonFile);
              
              let symbolInfo: CSVSymbol;
              
              if (fs.existsSync(jsonPath)) {
                try {
                  const jsonContent = fs.readFileSync(jsonPath, 'utf8');
                  const metadata = JSON.parse(jsonContent);
                  symbolInfo = {
                    filename: file,
                    symbol: metadata.symbol || file.replace('.csv', '').toUpperCase(),
                    name: metadata.name || 'Unknown',
                    description: metadata.description || '',
                    exchange: metadata.exchange || 'Unknown',
                    type: metadata.type || 'unknown',
                    timeframe: metadata.timeframe || 'unknown',
                    baseAsset: metadata.baseAsset || '',
                    quoteAsset: metadata.quoteAsset || '',
                    displayName: `${metadata.name || metadata.symbol} (${metadata.timeframe})`,
                    lineCount,
                    fileSizeKB
                  };
                } catch (jsonError) {
                  console.warn(`Error parsing JSON metadata for ${file}:`, jsonError);
                  symbolInfo = this.parseSymbolFromFilename(file, lineCount, fileSizeKB);
                }
              } else {
                console.warn(`No JSON metadata found for ${file}, using fallback parsing`);
                symbolInfo = this.parseSymbolFromFilename(file, lineCount, fileSizeKB);
              }
              
              this.availableSymbols.push(symbolInfo);
            } catch (fileError) {
              console.warn(`Error reading file ${file}:`, fileError);
              // Add file with unknown stats
              const symbolInfo = this.parseSymbolFromFilename(file, 0, 0);
              this.availableSymbols.push(symbolInfo);
            }
          }
          
          // Sort by symbol name
          this.availableSymbols.sort((a, b) => a.symbol.localeCompare(b.symbol));
        } catch (error) {
          console.warn('Could not read data directory:', error);
          // Fallback: no symbols available
          this.availableSymbols = [];
        }
      } else {
        // Fallback for web environment - no symbols available
        console.warn('Web environment detected - CSV file listing not available');
        this.availableSymbols = [];
      }
      
      return this.availableSymbols;
    } catch (error) {
      console.error('Error initializing symbols:', error);
      return [];
    }
  }

  getAvailableSymbols(): CSVSymbol[] {
    return this.availableSymbols;
  }

  private parseSymbolFromFilename(filename: string, lineCount: number = 0, fileSizeKB: number = 0): CSVSymbol {
    // Extract symbol and timeframe from filename like "btcusdt_1h.csv"
    const nameWithoutExt = filename.replace('.csv', '');
    const parts = nameWithoutExt.split('_');
    
    const symbol = parts[0].toUpperCase();
    const timeframe = parts[1] || 'unknown';
    
    // Create display name and extract base/quote assets
    let displayName, name, baseAsset, quoteAsset, type = 'crypto';
    
    if (symbol.includes('USDT')) {
      const base = symbol.replace('USDT', '');
      baseAsset = base;
      quoteAsset = 'USDT';
      name = this.formatSymbolName(base);
      displayName = `${name} (${timeframe})`;
    } else if (symbol.includes('USD') && !symbol.includes('USDT')) {
      const base = symbol.replace('USD', '');
      baseAsset = base;
      quoteAsset = 'USD';
      name = this.formatSymbolName(base);
      displayName = `${name} (${timeframe})`;
    } else if (symbol.includes('BTC') && !symbol.startsWith('BTC')) {
      const base = symbol.replace('BTC', '');
      baseAsset = base;
      quoteAsset = 'BTC';
      name = this.formatSymbolName(base);
      displayName = `${name} (${timeframe})`;
    } else if (symbol.includes('ETH') && !symbol.startsWith('ETH')) {
      const base = symbol.replace('ETH', '');
      baseAsset = base;
      quoteAsset = 'ETH';
      name = this.formatSymbolName(base);
      displayName = `${name} (${timeframe})`;
    } else {
      // For files that don't follow standard naming, use filename
      baseAsset = symbol;
      quoteAsset = '';
      name = symbol;
      displayName = `${nameWithoutExt.toUpperCase()} (${timeframe})`;
      type = 'unknown';
    }

    return {
      filename,
      symbol,
      name,
      description: `${name} trading data`,
      exchange: 'Unknown',
      type,
      timeframe,
      baseAsset,
      quoteAsset,
      displayName,
      lineCount,
      fileSizeKB
    };
  }

  private formatSymbolName(symbol: string): string {
    const symbolMap: Record<string, string> = {
      'BTC': 'Bitcoin',
      'ETH': 'Ethereum',
      'SOL': 'Solana',
      'ADA': 'Cardano',
      'DOT': 'Polkadot',
      'MATIC': 'Polygon',
      'BNB': 'Binance Coin',
      'XRP': 'Ripple',
      'LINK': 'Chainlink',
      'AVAX': 'Avalanche',
      'UNI': 'Uniswap',
      'LTC': 'Litecoin',
      'DOGE': 'Dogecoin',
      'SHIB': 'Shiba Inu',
      'ATOM': 'Cosmos',
      'FTM': 'Fantom',
      'ALGO': 'Algorand',
      'ICP': 'Internet Computer',
      'VET': 'VeChain',
      'SAND': 'The Sandbox',
      'MANA': 'Decentraland',
      'CRO': 'Cronos',
      'NEAR': 'Near Protocol',
      'APE': 'ApeCoin',
      'FIL': 'Filecoin',
      'TRX': 'TRON',
      'ETC': 'Ethereum Classic',
    };

    return symbolMap[symbol] || symbol;
  }

  async loadSymbolData(symbol: CSVSymbol): Promise<{ data: OHLC[], volumeData: VolumeData[] }> {
    console.log(`[CSVLoader] Loading symbol data for: ${symbol.displayName}`);
    
    try {
      // Always ensure repository is initialized before use
      await this.ensureRepositoryInitialized();
      
      // Use repository to load data (from IndexedDB or file)
      const result = await this.symbolDataRepository.getSymbolData(symbol);
      console.log(`[CSVLoader] Successfully loaded ${result.data.length} data points for ${symbol.displayName}`);
      return result;
    } catch (error) {
      console.error(`[CSVLoader] Error loading symbol data:`, error);
      throw error;
    }
  }

  private async ensureRepositoryInitialized(): Promise<void> {
    if (!this.symbolDataRepository) {
      console.log(`[CSVLoader] Creating new SymbolDataRepository instance`);
      this.symbolDataRepository = SymbolDataRepository.getInstance();
    }
    
    // Always try to initialize - BaseRepository handles the check internally
    try {
      await this.symbolDataRepository.initialize();
      console.log(`[CSVLoader] SymbolDataRepository ready`);
    } catch (error) {
      console.error(`[CSVLoader] Failed to initialize SymbolDataRepository:`, error);
      throw error;
    }
  }

  async getFullData(symbol: CSVSymbol): Promise<{ data: OHLC[], volumeData: VolumeData[] } | null> {
    try {
      await this.ensureRepositoryInitialized();
      return await this.symbolDataRepository.getSymbolData(symbol);
    } catch (error) {
      console.error('Error getting full data:', error);
      return null;
    }
  }



}