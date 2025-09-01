import { OHLC, VolumeData } from '../types/chart.types';

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

  private constructor() {}

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
      // In Electron, we can read files directly
      if (window.require) {
        const fs = window.require('fs');
        const path = window.require('path');
        
        const dataDir = path.join(process.cwd(), 'data', 'symbols');
        
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
    try {
      if (window.require) {
        const fs = window.require('fs');
        const path = window.require('path');
        
        const filePath = path.join(process.cwd(), 'data', 'symbols', symbol.filename);
        const csvContent = fs.readFileSync(filePath, 'utf8');
        
        return this.parseCSVContent(csvContent);
      } else {
        // Fallback: try to fetch from public folder or generate sample data
        console.warn('File system not available, generating sample data for', symbol.symbol);
        return this.generateSampleData(symbol.symbol);
      }
    } catch (error) {
      console.error('Error loading symbol data:', error);
      return this.generateSampleData(symbol.symbol);
    }
  }

  private parseCSVContent(csvContent: string): { data: OHLC[], volumeData: VolumeData[] } {
    const lines = csvContent.trim().split('\n');
    const data: OHLC[] = [];
    const volumeData: VolumeData[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      const columns = line.split(',');
      if (columns.length < 12) continue;

      try {
        const timestamp = parseInt(columns[0]);
        const open = parseFloat(columns[1].replace(/"/g, ''));
        const high = parseFloat(columns[2].replace(/"/g, ''));
        const low = parseFloat(columns[3].replace(/"/g, ''));
        const close = parseFloat(columns[4].replace(/"/g, ''));
        const volume = parseFloat(columns[5].replace(/"/g, ''));

        // Convert timestamp from milliseconds to seconds
        const time = Math.floor(timestamp / 1000);

        data.push({
          time,
          open,
          high,
          low,
          close,
        });

        volumeData.push({
          time,
          value: volume,
          color: close >= open ? '#26a69a' : '#ef5350',
        });
      } catch (error) {
        console.warn('Error parsing CSV line:', line, error);
      }
    }

    console.log(`Loaded ${data.length} candles for symbol`);
    return { data, volumeData };
  }

  private generateSampleData(symbol: string): { data: OHLC[], volumeData: VolumeData[] } {
    // Generate sample data based on symbol type
    let basePrice = 50000;
    if (symbol.includes('ETH')) basePrice = 3000;
    if (symbol.includes('SOL')) basePrice = 150;

    const data: OHLC[] = [];
    const volumeData: VolumeData[] = [];
    let time = new Date();
    time.setHours(time.getHours() - 1000);

    for (let i = 0; i < 1000; i++) {
      const variance = (Math.random() - 0.5) * (basePrice * 0.02);
      const open = basePrice + variance;
      const close = open + (Math.random() - 0.5) * (basePrice * 0.02);
      const high = Math.max(open, close) + Math.random() * (basePrice * 0.01);
      const low = Math.min(open, close) - Math.random() * (basePrice * 0.01);

      data.push({
        time: Math.floor(time.getTime() / 1000),
        open,
        high,
        low,
        close,
      });

      volumeData.push({
        time: Math.floor(time.getTime() / 1000),
        value: Math.random() * 1000000,
        color: close >= open ? '#26a69a' : '#ef5350',
      });

      basePrice = close;
      time = new Date(time.getTime() + 60 * 60 * 1000);
    }

    return { data, volumeData };
  }
}