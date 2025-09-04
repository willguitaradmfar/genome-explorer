import { DatabaseConfig } from '../../database/types';
import { OHLC, VolumeData } from '../../types/chart.types';
import { CSVSymbol, CSVRow } from '../../utils/csvLoader';
import { DataFolderManager } from '../../utils/dataFolderManager';
import { IndexedDBManager } from '../../database/IndexedDBManager';

/**
 * Estrutura de dados armazenada na tabela symbolData
 * Cada linha representa um ponto de dados OHLC com prefixo do símbolo no ID
 */
export interface OHLCDataPoint {
  id: string;         // Formato: "symbol_filename_timestamp" (chave primária única)
  symbolId: string;   // Identificador do símbolo (filename sem extensão)
  time: number;       // Timestamp da vela
  open: number;       // Preço de abertura
  high: number;       // Preço máximo
  low: number;        // Preço mínimo  
  close: number;      // Preço de fechamento
  volume: number;     // Volume negociado
}

/**
 * Metadados sobre cada símbolo carregado
 */
export interface SymbolMetadata {
  id: string;           // Identificador do símbolo (filename sem extensão)
  filename: string;     // Nome do arquivo CSV original
  symbol: CSVSymbol;    // Informações completas do símbolo
  lastUpdated: Date;    // Quando foi carregado pela última vez
  dataCount: number;    // Quantidade de pontos de dados
  fileSizeKB: number;   // Tamanho do arquivo original em KB
}

/**
 * Cache em memória para acesso rápido aos dados recentemente usados
 */
interface MemoryCache {
  [symbolId: string]: {
    data: OHLC[];         // Dados formatados para o gráfico
    volumeData: VolumeData[]; // Dados de volume formatados
    lastLoaded: Date;     // Timestamp do último carregamento
  };
}

/**
 * Repositório responsável por gerenciar dados de símbolos no IndexedDB
 * 
 * ARQUITETURA SIMPLIFICADA:
 * - Uma única tabela 'symbolData' para todos os símbolos
 * - IDs únicos com formato: "symbol_filename_timestamp"
 * - Ex: "btcusdt_1h_1640995200" para BTC 1h no timestamp 1640995200
 * 
 * FLUXO DE CARREGAMENTO:
 * 1. Verifica cache em memória (válido por 1 hora)
 * 2. Se não encontrar, verifica dados na tabela symbolData
 * 3. Se não existir dados, carrega do arquivo CSV
 * 4. Salva dados na tabela e atualiza cache
 */
export class SymbolDataRepository {
  private static instance: SymbolDataRepository;
  private dbManager: IndexedDBManager;
  private memoryCache: MemoryCache = {};
  private isInitialized = false;

  // Tempo de validade do cache em memória (1 hora)
  private readonly MEMORY_CACHE_TTL = 60 * 60 * 1000;

  private constructor() {
    console.log('[SymbolDataRepository] Creating new instance');
    this.dbManager = new IndexedDBManager(this.getDatabaseConfig());
  }

  /**
   * Obtém a instância singleton do repositório
   */
  static getInstance(): SymbolDataRepository {
    if (!SymbolDataRepository.instance) {
      SymbolDataRepository.instance = new SymbolDataRepository();
    }
    return SymbolDataRepository.instance;
  }

  /**
   * Configuração do banco de dados (versão fixa para evitar conflitos)
   */
  private getDatabaseConfig(): DatabaseConfig {
    return {
      name: 'TradingSystemDB',
      version: 6, // Versão atualizada para incluir nova tabela indicatorConfigs
      stores: {
        // Tabela de preferências do usuário
        userPreferences: {
          keyPath: 'id',
          indexes: [
            { name: 'lastUpdated', keyPath: 'lastUpdated' },
            { name: 'theme', keyPath: 'theme' }
          ]
        },
        // Tabela de metadados dos símbolos
        symbolMetadata: {
          keyPath: 'id',
          indexes: [
            { name: 'filename', keyPath: 'filename' },
            { name: 'symbol', keyPath: 'symbol.symbol' },
            { name: 'lastUpdated', keyPath: 'lastUpdated' }
          ]
        },
        // Tabela única para dados de todos os símbolos
        symbolData: {
          keyPath: 'id',
          indexes: [
            { name: 'symbolId', keyPath: 'symbolId' },    // Índice por símbolo
            { name: 'time', keyPath: 'time' },           // Índice por tempo
            { name: 'close', keyPath: 'close' },         // Índice por preço
            { name: 'volume', keyPath: 'volume' }        // Índice por volume
          ]
        },
        // Nova tabela para configurações de indicadores
        indicatorConfigs: {
          keyPath: 'id',
          indexes: [
            { name: 'symbolId', keyPath: 'symbolId' },
            { name: 'indicatorId', keyPath: 'indicatorId' },
            { name: 'symbolIndicator', keyPath: ['symbolId', 'indicatorId'] },
            { name: 'isEnabled', keyPath: 'isEnabled' },
            { name: 'pane', keyPath: 'pane' },
            { name: 'createdAt', keyPath: 'createdAt' }
          ]
        }
      }
    };
  }

  /**
   * Inicializa o repositório e conexão com o banco
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[SymbolDataRepository] Already initialized, skipping');
      return;
    }

    try {
      console.log('[SymbolDataRepository] Initializing database connection...');
      await this.dbManager.initialize();
      this.isInitialized = true;
      console.log('[SymbolDataRepository] Database connection established successfully');
    } catch (error) {
      console.error('[SymbolDataRepository] Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Gera ID único para o símbolo baseado no filename
   */
  private generateSymbolId(filename: string): string {
    return filename.replace('.csv', '').toLowerCase();
  }

  /**
   * Gera ID único para um ponto de dados
   */
  private generateDataPointId(symbolId: string, timestamp: number): string {
    return `${symbolId}_${timestamp}`;
  }

  /**
   * MÉTODO PRINCIPAL: Obtém dados do símbolo
   * Implementa cache em camadas: Memória → IndexedDB → Arquivo CSV
   */
  async getSymbolData(symbol: CSVSymbol): Promise<{ data: OHLC[]; volumeData: VolumeData[] }> {
    console.log(`[SymbolDataRepository] === Getting data for symbol: ${symbol.displayName} ===`);
    const symbolId = this.generateSymbolId(symbol.filename);

    // CAMADA 1: Verificar cache em memória
    const memoryCacheResult = this.checkMemoryCache(symbolId, symbol.displayName);
    if (memoryCacheResult) {
      return memoryCacheResult;
    }

    try {
      // CAMADA 2: Verificar dados na tabela IndexedDB
      const indexedDBResult = await this.loadFromIndexedDB(symbolId, symbol.displayName);
      if (indexedDBResult) {
        // Atualizar cache em memória com dados do IndexedDB
        this.updateMemoryCache(symbolId, indexedDBResult);
        return indexedDBResult;
      }

      // CAMADA 3: Não existe dados, carregar do arquivo CSV
      console.log(`[SymbolDataRepository] No data found in IndexedDB, loading from CSV file`);
      return await this.loadFromCSVAndSave(symbol);

    } catch (error) {
      console.error(`[SymbolDataRepository] Error in getSymbolData for ${symbol.displayName}:`, error);
      // Fallback: tentar carregar diretamente do arquivo
      return await this.loadFromCSVAndSave(symbol);
    }
  }

  /**
   * CAMADA 1: Verifica se os dados estão em cache na memória
   */
  private checkMemoryCache(symbolId: string, symbolName: string): { data: OHLC[]; volumeData: VolumeData[] } | null {
    const cached = this.memoryCache[symbolId];
    if (!cached) {
      console.log(`[SymbolDataRepository] No memory cache found for ${symbolName}`);
      return null;
    }

    const cacheAge = Date.now() - cached.lastLoaded.getTime();
    if (cacheAge < this.MEMORY_CACHE_TTL) {
      console.log(`[SymbolDataRepository] Using memory cache for ${symbolName} (age: ${Math.round(cacheAge / 1000)}s)`);
      return {
        data: cached.data,
        volumeData: cached.volumeData
      };
    }

    // Cache expirado, remover
    console.log(`[SymbolDataRepository] Memory cache expired for ${symbolName} (age: ${Math.round(cacheAge / 1000)}s)`);
    delete this.memoryCache[symbolId];
    return null;
  }

  /**
   * CAMADA 2: Carrega dados da tabela IndexedDB
   */
  private async loadFromIndexedDB(symbolId: string, symbolName: string): Promise<{ data: OHLC[]; volumeData: VolumeData[] } | null> {
    try {
      console.log(`[SymbolDataRepository] Checking IndexedDB for symbol: ${symbolId}`);
      
      // Buscar dados do símbolo usando índice
      const dataPoints = await this.dbManager.getAll<OHLCDataPoint>('symbolData', {
        index: 'symbolId',
        query: symbolId
      });
      
      if (dataPoints.length === 0) {
        console.log(`[SymbolDataRepository] No data found for symbol ${symbolId} in IndexedDB`);
        return null;
      }

      console.log(`[SymbolDataRepository] Loading ${symbolName} from IndexedDB with ${dataPoints.length} points`);
      
      // Ordenar por timestamp para garantir ordem cronológica
      dataPoints.sort((a, b) => a.time - b.time);
      
      return this.convertToOHLCFormat(dataPoints);

    } catch (error) {
      console.log(`[SymbolDataRepository] Error loading ${symbolId} from IndexedDB:`, (error as Error).message);
      return null;
    }
  }

  /**
   * Converte dados do formato IndexedDB para formato usado pelo gráfico
   */
  private convertToOHLCFormat(dataPoints: OHLCDataPoint[]): { data: OHLC[]; volumeData: VolumeData[] } {
    console.log(`[SymbolDataRepository] Converting ${dataPoints.length} data points to OHLC format`);
    
    const data: OHLC[] = [];
    const volumeData: VolumeData[] = [];

    for (const point of dataPoints) {
      // Dados OHLC para o gráfico principal
      data.push({
        time: point.time,
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close
      });

      // Dados de volume com cor baseada no movimento (verde/vermelho)
      volumeData.push({
        time: point.time,
        value: point.volume,
        color: point.close >= point.open ? '#26a69a' : '#ef5350'
      });
    }

    return { data, volumeData };
  }

  /**
   * Atualiza o cache em memória com novos dados
   */
  private updateMemoryCache(symbolId: string, result: { data: OHLC[]; volumeData: VolumeData[] }): void {
    this.memoryCache[symbolId] = {
      data: result.data,
      volumeData: result.volumeData,
      lastLoaded: new Date()
    };
    console.log(`[SymbolDataRepository] Updated memory cache for symbol ${symbolId}`);
  }

  /**
   * CAMADA 3: Carrega dados do arquivo CSV e salva no IndexedDB
   */
  private async loadFromCSVAndSave(symbol: CSVSymbol): Promise<{ data: OHLC[]; volumeData: VolumeData[] }> {
    console.log(`[SymbolDataRepository] === Starting CSV load for ${symbol.displayName} ===`);
    
    // Passo 1: Carregar e processar arquivo CSV
    const { data, volumeData } = await this.loadAndParseCSVFile(symbol);
    
    if (data.length === 0) {
      console.warn(`[SymbolDataRepository] No valid data found in ${symbol.filename}`);
      return { data: [], volumeData: [] };
    }

    // Passo 2: Salvar dados no IndexedDB
    await this.saveDataToIndexedDB(symbol, data, volumeData);

    // Passo 3: Atualizar cache em memória
    const symbolId = this.generateSymbolId(symbol.filename);
    this.updateMemoryCache(symbolId, { data, volumeData });

    console.log(`[SymbolDataRepository] === Successfully completed CSV load for ${symbol.displayName} ===`);
    return { data, volumeData };
  }

  /**
   * Carrega e processa arquivo CSV do disco
   */
  private async loadAndParseCSVFile(symbol: CSVSymbol): Promise<{ data: OHLC[]; volumeData: VolumeData[] }> {
    console.log(`[SymbolDataRepository] Loading CSV file for ${symbol.displayName}`);
    
    const dataFolderManager = DataFolderManager.getInstance();
    const symbolsPath = dataFolderManager.getSymbolsPath();
    
    if (!symbolsPath) {
      throw new Error('Data folder not configured - please set up data folder first');
    }

    // Usar módulo fs do Node.js (disponível no Electron)
    if (!window.require) {
      throw new Error('File system access not available - this feature requires Electron environment');
    }

    const fs = window.require('fs');
    const path = window.require('path');
    
    const filePath = path.join(symbolsPath, symbol.filename);
    console.log(`[SymbolDataRepository] Reading file: ${filePath}`);
    
    try {
      const csvText = fs.readFileSync(filePath, 'utf8');
      console.log(`[SymbolDataRepository] File loaded successfully, size: ${csvText.length} characters`);
      return this.parseCSVData(csvText);
    } catch (error) {
      console.error(`[SymbolDataRepository] Error reading file ${filePath}:`, error);
      throw new Error(`Failed to read CSV file: ${(error as Error).message}`);
    }
  }

  /**
   * Processa conteúdo CSV e converte para dados OHLC
   */
  private parseCSVData(csvText: string): { data: OHLC[]; volumeData: VolumeData[] } {
    const lines = csvText.trim().split('\n');
    const data: OHLC[] = [];
    const volumeData: VolumeData[] = [];

    console.log(`[SymbolDataRepository] Parsing CSV with ${lines.length} lines`);

    let validLines = 0;
    let skippedLines = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const result = this.parseCSVLine(line, i + 1);
        if (result) {
          data.push(result.ohlc);
          volumeData.push(result.volume);
          validLines++;
        } else {
          skippedLines++;
        }
      } catch (error) {
        skippedLines++;
        // Log apenas a cada 1000 erros para não poluir o console
        if (skippedLines % 1000 === 0) {
          console.warn(`[SymbolDataRepository] Skipped ${skippedLines} invalid lines so far`);
        }
      }
    }

    console.log(`[SymbolDataRepository] CSV parsing completed: ${validLines} valid lines, ${skippedLines} skipped`);
    return { data, volumeData };
  }

  /**
   * Processa uma linha individual do CSV
   */
  private parseCSVLine(line: string, _lineNumber: number): { ohlc: OHLC; volume: VolumeData } | null {
    const columns = line.split(',');
    if (columns.length < 12) {
      return null; // Linha inválida, muito poucas colunas
    }

    // Função para limpar aspas duplas e converter para número
    const cleanValue = (value: string): number => parseFloat(value.replace(/"/g, ''));

    try {
      // Extrair dados da linha CSV
      const row: CSVRow = {
        timestamp: cleanValue(columns[0]),
        open: cleanValue(columns[1]),
        high: cleanValue(columns[2]),
        low: cleanValue(columns[3]),
        close: cleanValue(columns[4]),
        volume: cleanValue(columns[5]),
        close_time: cleanValue(columns[6]),
        quote_asset_volume: cleanValue(columns[7]),
        count: parseInt(columns[8].replace(/"/g, '')),
        taker_buy_base_asset_volume: cleanValue(columns[9]),
        taker_buy_quote_asset_volume: cleanValue(columns[10]),
        ignore: cleanValue(columns[11])
      };

      // Validar dados essenciais
      if (!this.isValidOHLCData(row)) {
        return null;
      }

      // Converter timestamp de milissegundos para segundos se necessário
      const time = row.timestamp > 10000000000 ? Math.floor(row.timestamp / 1000) : row.timestamp;

      return {
        ohlc: {
          time,
          open: row.open,
          high: row.high,
          low: row.low,
          close: row.close
        },
        volume: {
          time,
          value: row.volume,
          color: row.close >= row.open ? '#26a69a' : '#ef5350'
        }
      };
    } catch (error) {
      return null; // Erro no parsing, linha inválida
    }
  }

  /**
   * Valida se os dados OHLC são logicamente consistentes
   */
  private isValidOHLCData(row: CSVRow): boolean {
    // Verificar se todos os campos essenciais são números válidos
    if (isNaN(row.timestamp) || isNaN(row.open) || isNaN(row.high) || 
        isNaN(row.low) || isNaN(row.close) || isNaN(row.volume)) {
      return false;
    }

    // Verificar lógica OHLC: high deve ser >= max(open, close) e low deve ser <= min(open, close)
    if (row.high < Math.max(row.open, row.close) || row.low > Math.min(row.open, row.close)) {
      return false;
    }

    // Verificar valores positivos (preços e volume não podem ser negativos)
    if (row.open < 0 || row.high < 0 || row.low < 0 || row.close < 0 || row.volume < 0) {
      return false;
    }

    return true;
  }

  /**
   * Salva dados processados no IndexedDB
   */
  private async saveDataToIndexedDB(symbol: CSVSymbol, data: OHLC[], volumeData: VolumeData[]): Promise<void> {
    const symbolId = this.generateSymbolId(symbol.filename);
    console.log(`[SymbolDataRepository] Saving ${data.length} data points for symbol ${symbolId} to IndexedDB`);
    
    // Converter dados para formato da tabela
    const dataPoints: OHLCDataPoint[] = data.map(point => ({
      id: this.generateDataPointId(symbolId, point.time),
      symbolId: symbolId,
      time: point.time,
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
      volume: volumeData.find(v => v.time === point.time)?.value || 0
    }));

    // Salvar dados usando operação em lote para melhor performance
    await this.dbManager.bulkPut('symbolData', dataPoints);
    
    // Salvar metadados do símbolo
    const metadata: SymbolMetadata = {
      id: symbolId,
      filename: symbol.filename,
      symbol: symbol,
      lastUpdated: new Date(),
      dataCount: data.length,
      fileSizeKB: symbol.fileSizeKB
    };
    
    await this.dbManager.put('symbolMetadata', metadata);
    
    console.log(`[SymbolDataRepository] Successfully saved ${data.length} points and metadata for ${symbol.displayName}`);
  }

  /**
   * MÉTODOS UTILITÁRIOS E DE GERENCIAMENTO
   */

  /**
   * Obtém metadados de todos os símbolos carregados
   */
  async getSymbolMetadata(): Promise<SymbolMetadata[]> {
    try {
      const metadata = await this.dbManager.getAll<SymbolMetadata>('symbolMetadata');
      console.log(`[SymbolDataRepository] Retrieved metadata for ${metadata.length} symbols`);
      return metadata;
    } catch (error) {
      console.error('[SymbolDataRepository] Error getting symbol metadata:', error);
      return [];
    }
  }

  /**
   * Remove dados de um símbolo específico
   */
  async removeSymbolData(symbol: CSVSymbol): Promise<void> {
    const symbolId = this.generateSymbolId(symbol.filename);
    
    console.log(`[SymbolDataRepository] Removing data for ${symbol.displayName} (${symbolId})`);
    
    try {
      // Buscar todos os pontos de dados do símbolo
      const dataPoints = await this.dbManager.getAll<OHLCDataPoint>('symbolData', {
        index: 'symbolId',
        query: symbolId
      });

      // Remover todos os pontos de dados
      const idsToDelete = dataPoints.map(point => point.id);
      await this.dbManager.bulkDelete('symbolData', idsToDelete);
      
      // Remover metadados
      await this.dbManager.delete('symbolMetadata', symbolId);
      
      // Limpar cache em memória
      delete this.memoryCache[symbolId];
      
      console.log(`[SymbolDataRepository] Successfully removed ${dataPoints.length} data points for ${symbol.displayName}`);
    } catch (error) {
      console.error(`[SymbolDataRepository] Error removing symbol data for ${symbol.displayName}:`, error);
      throw error;
    }
  }

  /**
   * Obtém informações sobre o cache e uso do banco
   */
  async getCacheInfo(): Promise<{
    totalSymbols: number;
    totalDataPoints: number;
    memCacheSize: number;
    symbolIds: string[];
  }> {
    const metadata = await this.getSymbolMetadata();
    
    const info = {
      totalSymbols: metadata.length,
      totalDataPoints: metadata.reduce((sum, m) => sum + m.dataCount, 0),
      memCacheSize: Object.keys(this.memoryCache).length,
      symbolIds: metadata.map(m => m.id)
    };

    console.log('[SymbolDataRepository] Cache info:', info);
    return info;
  }

  /**
   * Limpa todo o cache em memória
   */
  clearMemoryCache(): void {
    const clearedSymbols = Object.keys(this.memoryCache).length;
    this.memoryCache = {};
    console.log(`[SymbolDataRepository] Cleared memory cache for ${clearedSymbols} symbols`);
  }

  /**
   * Fecha conexões e limpa recursos
   */
  close(): void {
    console.log('[SymbolDataRepository] Closing repository and cleaning up resources');
    
    this.dbManager.close();
    this.isInitialized = false;
    this.memoryCache = {};
    
    console.log('[SymbolDataRepository] Repository closed successfully');
  }
}