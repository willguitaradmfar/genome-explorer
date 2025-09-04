import { IndicatorConfigRepository, IndicatorConfiguration } from '../repositories/indicator-configs/IndicatorConfigRepository';
import { ActiveIndicator, Indicator } from '../types/indicator.types';
import { IndicatorLoader } from './indicatorLoader';
import { CSVSymbol } from './csvLoader';

/**
 * Gerenciador central de indicadores
 * Coordena o carregamento automático de indicadores por símbolo
 * e a persistência das configurações
 */
export class IndicatorManager {
  private static instance: IndicatorManager;
  private indicatorConfigRepo: IndicatorConfigRepository;
  private indicatorLoader: IndicatorLoader;
  private currentSymbolId: string | null = null;
  private availableIndicators: Map<string, Indicator> = new Map();

  private constructor() {
    this.indicatorConfigRepo = IndicatorConfigRepository.getInstance();
    this.indicatorLoader = IndicatorLoader.getInstance();
    this.initializeAvailableIndicators();
  }

  /**
   * Obtém instância singleton do gerenciador
   */
  static getInstance(): IndicatorManager {
    if (!IndicatorManager.instance) {
      IndicatorManager.instance = new IndicatorManager();
    }
    return IndicatorManager.instance;
  }

  /**
   * Inicializa o sistema carregando indicadores disponíveis
   */
  private async initializeAvailableIndicators(): Promise<void> {
    try {
      // Carrega todos os indicadores disponíveis do sistema
      const indicators = await this.indicatorLoader.loadAvailableIndicators();
      
      indicators.forEach(indicator => {
        this.availableIndicators.set(indicator.id, indicator);
      });
      
      console.log(`[IndicatorManager] Loaded ${indicators.length} available indicators`);
    } catch (error) {
      console.error('[IndicatorManager] Failed to load available indicators:', error);
    }
  }

  /**
   * Inicializa os repositórios necessários
   */
  async initialize(): Promise<void> {
    try {
      await this.indicatorConfigRepo.initialize();
      console.log('[IndicatorManager] Initialized successfully');
    } catch (error) {
      console.error('[IndicatorManager] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Carrega todos os indicadores globais configurados (para inicialização da app)
   */
  async loadGlobalIndicators(): Promise<ActiveIndicator[]> {
    try {
      console.log('[IndicatorManager] Loading global indicators for app initialization');
      
      const allConfigs = await this.indicatorConfigRepo.getAllConfigurations();
      const activeConfigs = allConfigs.filter(config => config.isEnabled);
      
      const activeIndicators: ActiveIndicator[] = [];
      
      for (const config of activeConfigs) {
        const baseIndicator = this.availableIndicators.get(config.indicatorId);
        
        if (baseIndicator) {
          const activeIndicator = this.indicatorConfigRepo.convertConfigToActiveIndicator(
            config,
            this.createActiveIndicatorFromBase(baseIndicator, config)
          );
          
          activeIndicators.push(activeIndicator);
          console.log(`[IndicatorManager] Loaded global indicator: ${activeIndicator.name}`);
        } else {
          console.warn(`[IndicatorManager] Base indicator not found: ${config.indicatorId}`);
        }
      }
      
      console.log(`[IndicatorManager] Loaded ${activeIndicators.length} global indicators for app initialization`);
      return activeIndicators;
      
    } catch (error) {
      console.error('[IndicatorManager] Failed to load global indicators:', error);
      return [];
    }
  }

  /**
   * Define o símbolo atual (indicadores são globais e não mudam)
   */
  async setCurrentSymbol(symbol: CSVSymbol): Promise<void> {
    try {
      const symbolId = this.getSymbolId(symbol);
      this.currentSymbolId = symbolId;
      
      console.log(`[IndicatorManager] Setting current symbol to: ${symbolId} - indicators remain global`);
    } catch (error) {
      console.error('[IndicatorManager] Failed to set current symbol:', error);
    }
  }

  /**
   * Adiciona um novo indicador global e salva sua configuração
   */
  async addIndicator(
    indicator: Indicator, 
    parameters?: { [key: string]: any },
    customStyle?: any
  ): Promise<ActiveIndicator> {
    try {
      // Cria ActiveIndicator com ID único global
      const activeIndicator: ActiveIndicator = {
        ...indicator,
        id: `indicator_${indicator.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        baseId: indicator.id,
        isActive: true,
        addedAt: new Date(),
        values: parameters || {},
        style: customStyle || indicator.style
      };

      // Salva configuração global no repositório 
      await this.indicatorConfigRepo.saveIndicatorConfig(
        'global', // Usa 'global' como symbolId para indicadores globais
        activeIndicator
      );

      console.log(`[IndicatorManager] Added and saved global indicator: ${indicator.name} (${activeIndicator.id})`);
      return activeIndicator;
      
    } catch (error) {
      console.error(`[IndicatorManager] Failed to add indicator ${indicator.name}:`, error);
      throw error;
    }
  }

  /**
   * Remove um indicador e sua configuração
   */
  async removeIndicator(activeIndicator: ActiveIndicator): Promise<void> {
    try {
      await this.indicatorConfigRepo.removeIndicatorConfig(activeIndicator.id);
      console.log(`[IndicatorManager] Removed indicator: ${activeIndicator.name} (${activeIndicator.id})`);
    } catch (error) {
      console.error(`[IndicatorManager] Failed to remove indicator:`, error);
      throw error;
    }
  }

  /**
   * Atualiza parâmetros de um indicador existente
   */
  async updateIndicatorParameters(
    activeIndicator: ActiveIndicator,
    newParameters: { [key: string]: any }
  ): Promise<void> {
    if (!this.currentSymbolId) {
      throw new Error('No current symbol set.');
    }

    try {
      await this.indicatorConfigRepo.updateIndicatorParameters(
        this.currentSymbolId,
        activeIndicator.baseId,
        newParameters
      );

      console.log(`[IndicatorManager] Updated parameters for indicator: ${activeIndicator.name}`);
    } catch (error) {
      console.error(`[IndicatorManager] Failed to update indicator parameters:`, error);
      throw error;
    }
  }

  /**
   * Ativa/desativa um indicador
   */
  async toggleIndicator(activeIndicator: ActiveIndicator, enabled: boolean): Promise<void> {
    if (!this.currentSymbolId) {
      throw new Error('No current symbol set.');
    }

    try {
      await this.indicatorConfigRepo.toggleIndicatorConfig(
        this.currentSymbolId,
        activeIndicator.baseId,
        enabled
      );

      console.log(`[IndicatorManager] Toggled indicator ${activeIndicator.name} to ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error(`[IndicatorManager] Failed to toggle indicator:`, error);
      throw error;
    }
  }

  /**
   * Obtém indicadores disponíveis para seleção
   */
  getAvailableIndicators(): Indicator[] {
    return Array.from(this.availableIndicators.values());
  }

  /**
   * Obtém estatísticas das configurações
   */
  async getStats(): Promise<{
    totalConfigs: number;
    configsBySymbol: { [symbolId: string]: number };
    enabledConfigs: number;
    disabledConfigs: number;
  }> {
    return await this.indicatorConfigRepo.getConfigurationStats();
  }

  /**
   * Reset completo - remove todas as configurações (para debug/admin)
   */
  async clearAllConfigurations(): Promise<void> {
    await this.indicatorConfigRepo.clearAllConfigurations();
    console.log('[IndicatorManager] All indicator configurations cleared');
  }

  /**
   * Gera ID único para um símbolo baseado em suas propriedades
   */
  private getSymbolId(symbol: CSVSymbol): string {
    // Usa filename como ID principal, mas pode ser estendido
    return symbol.filename.replace('.csv', '');
  }

  /**
   * Cria ActiveIndicator a partir de um Indicator base e configuração
   */
  private createActiveIndicatorFromBase(
    baseIndicator: Indicator,
    config: IndicatorConfiguration
  ): ActiveIndicator {
    return {
      ...baseIndicator,
      id: `${config.symbolId}_${config.indicatorId}_${Date.now()}`,
      baseId: config.indicatorId,
      isActive: config.isEnabled,
      addedAt: config.createdAt,
      values: config.parameters,
      style: config.style
    };
  }

  /**
   * Obtém o símbolo atual
   */
  getCurrentSymbolId(): string | null {
    return this.currentSymbolId;
  }

  /**
   * Verifica se um indicador específico está configurado para o símbolo atual
   */
  async isIndicatorConfiguredForCurrentSymbol(indicatorId: string): Promise<boolean> {
    if (!this.currentSymbolId) return false;

    try {
      const configs = await this.indicatorConfigRepo.getIndicatorConfigsForSymbol(this.currentSymbolId);
      return configs.some(config => config.indicatorId === indicatorId && config.isEnabled);
    } catch (error) {
      console.error('[IndicatorManager] Failed to check indicator configuration:', error);
      return false;
    }
  }
}