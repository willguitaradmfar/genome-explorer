import { DatabaseConfig } from '../../database/types';
import { BaseRepository } from '../BaseRepository';
import { ActiveIndicator } from '../../types/indicator.types';

/**
 * Configuração persistente de indicadores para um símbolo específico
 * Armazena quais indicadores devem ser aplicados automaticamente
 */
export interface IndicatorConfiguration {
  id: string;
  symbolId: string; // ID do símbolo (filename ou identificador único)
  indicatorId: string; // ID do indicador (baseId do ActiveIndicator)
  indicatorName: string; // Nome do indicador para facilitar busca
  parameters: { [key: string]: any }; // Parâmetros configurados para o indicador
  style: {
    color?: string;
    upperColor?: string;
    lowerColor?: string;
    middleColor?: string;
    macdColor?: string;
    signalColor?: string;
    histogramColor?: string;
    lineWidth: number;
    lineStyle: 'solid' | 'dashed' | 'dotted';
  };
  pane: 'main' | 'sub'; // Painel onde o indicador deve aparecer
  isEnabled: boolean; // Se o indicador está ativo
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Repositório para gerenciar configurações persistentes de indicadores
 * Permite salvar, carregar e gerenciar indicadores por símbolo
 */
export class IndicatorConfigRepository extends BaseRepository<IndicatorConfiguration> {
  private static instance: IndicatorConfigRepository;

  private constructor() {
    super('indicatorConfigs');
  }

  /**
   * Obtém instância singleton do repositório
   */
  static getInstance(): IndicatorConfigRepository {
    if (!IndicatorConfigRepository.instance) {
      IndicatorConfigRepository.instance = new IndicatorConfigRepository();
    }
    return IndicatorConfigRepository.instance;
  }

  /**
   * Configuração do banco de dados com tabela específica para configurações de indicadores
   */
  protected getDatabaseConfig(): DatabaseConfig {
    return {
      name: 'TradingSystemDB',
      version: 6, // Versão incrementada para criar nova tabela indicatorConfigs
      stores: {
        userPreferences: {
          keyPath: 'id',
          indexes: [
            { name: 'lastUpdated', keyPath: 'lastUpdated' },
            { name: 'theme', keyPath: 'theme' }
          ]
        },
        symbolMetadata: {
          keyPath: 'id',
          indexes: [
            { name: 'filename', keyPath: 'filename' },
            { name: 'symbol', keyPath: 'symbol.symbol' },
            { name: 'lastUpdated', keyPath: 'lastUpdated' }
          ]
        },
        symbolData: {
          keyPath: 'id',
          indexes: [
            { name: 'symbolId', keyPath: 'symbolId' },
            { name: 'time', keyPath: 'time' },
            { name: 'close', keyPath: 'close' },
            { name: 'volume', keyPath: 'volume' }
          ]
        },
        indicatorConfigs: {
          keyPath: 'id',
          indexes: [
            { name: 'symbolId', keyPath: 'symbolId' },
            { name: 'indicatorId', keyPath: 'indicatorId' },
            { name: 'symbolIndicator', keyPath: ['symbolId', 'indicatorId'] }, // Índice composto
            { name: 'isEnabled', keyPath: 'isEnabled' },
            { name: 'pane', keyPath: 'pane' },
            { name: 'createdAt', keyPath: 'createdAt' }
          ]
        }
      }
    };
  }

  /**
   * Salva a configuração de um indicador para um símbolo específico
   */
  async saveIndicatorConfig(
    symbolId: string, 
    activeIndicator: ActiveIndicator
  ): Promise<void> {
    try {
      // Use o ID único do activeIndicator para permitir múltiplas instâncias do mesmo indicador
      const configId = activeIndicator.id;
      
      const config: IndicatorConfiguration = {
        id: configId,
        symbolId: symbolId,
        indicatorId: activeIndicator.baseId,
        indicatorName: activeIndicator.name,
        parameters: activeIndicator.values || {},
        style: activeIndicator.style,
        pane: activeIndicator.pane,
        isEnabled: activeIndicator.isActive,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await this.save(config);
      console.log(`[IndicatorConfigRepository] Saved config for indicator ${activeIndicator.name} on symbol ${symbolId}`);
    } catch (error) {
      console.error(`[IndicatorConfigRepository] Failed to save indicator config:`, error);
      throw error;
    }
  }

  /**
   * Carrega todas as configurações de indicadores para um símbolo específico
   */
  async getIndicatorConfigsForSymbol(symbolId: string): Promise<IndicatorConfiguration[]> {
    try {
      // Busca usando o índice de symbolId para eficiência
      const allConfigs = await this.getAll();
      const symbolConfigs = allConfigs.filter(config => 
        config.symbolId === symbolId && config.isEnabled
      );
      
      console.log(`[IndicatorConfigRepository] Loaded ${symbolConfigs.length} indicator configs for symbol ${symbolId}`);
      return symbolConfigs;
    } catch (error) {
      console.error(`[IndicatorConfigRepository] Failed to load indicator configs for symbol ${symbolId}:`, error);
      return [];
    }
  }

  /**
   * Remove configuração de um indicador específico usando o ID único da instância
   */
  async removeIndicatorConfig(activeIndicatorId: string): Promise<void> {
    try {
      await this.delete(activeIndicatorId);
      console.log(`[IndicatorConfigRepository] Removed config for indicator instance ${activeIndicatorId}`);
    } catch (error) {
      console.error(`[IndicatorConfigRepository] Failed to remove indicator config:`, error);
      throw error;
    }
  }

  /**
   * Atualiza o status (ativo/inativo) de um indicador
   */
  async toggleIndicatorConfig(
    symbolId: string, 
    indicatorId: string, 
    isEnabled: boolean
  ): Promise<void> {
    try {
      const configId = `${symbolId}_${indicatorId}`;
      const existingConfig = await this.get(configId);
      
      if (existingConfig) {
        const updatedConfig: IndicatorConfiguration = {
          ...existingConfig,
          isEnabled: isEnabled,
          updatedAt: new Date()
        };
        
        await this.save(updatedConfig);
        console.log(`[IndicatorConfigRepository] Toggled indicator ${indicatorId} to ${isEnabled ? 'enabled' : 'disabled'} for symbol ${symbolId}`);
      }
    } catch (error) {
      console.error(`[IndicatorConfigRepository] Failed to toggle indicator config:`, error);
      throw error;
    }
  }

  /**
   * Atualiza parâmetros de um indicador
   */
  async updateIndicatorParameters(
    symbolId: string, 
    indicatorId: string, 
    parameters: { [key: string]: any }
  ): Promise<void> {
    try {
      const configId = `${symbolId}_${indicatorId}`;
      const existingConfig = await this.get(configId);
      
      if (existingConfig) {
        const updatedConfig: IndicatorConfiguration = {
          ...existingConfig,
          parameters: { ...existingConfig.parameters, ...parameters },
          updatedAt: new Date()
        };
        
        await this.save(updatedConfig);
        console.log(`[IndicatorConfigRepository] Updated parameters for indicator ${indicatorId} on symbol ${symbolId}`);
      }
    } catch (error) {
      console.error(`[IndicatorConfigRepository] Failed to update indicator parameters:`, error);
      throw error;
    }
  }

  /**
   * Converte configuração de indicador de volta para ActiveIndicator
   */
  convertConfigToActiveIndicator(
    config: IndicatorConfiguration, 
    baseIndicator: ActiveIndicator
  ): ActiveIndicator {
    return {
      ...baseIndicator,
      id: config.id, // USA O ID ORIGINAL da configuração salva para evitar duplicação
      baseId: config.indicatorId,
      isActive: config.isEnabled,
      values: config.parameters,
      style: config.style,
      pane: config.pane,
      addedAt: config.createdAt
    };
  }

  /**
   * Carrega todas as configurações de indicadores (para debug/administração)
   */
  async getAllConfigurations(): Promise<IndicatorConfiguration[]> {
    try {
      const allConfigs = await this.getAll();
      console.log(`[IndicatorConfigRepository] Total indicator configurations: ${allConfigs.length}`);
      return allConfigs;
    } catch (error) {
      console.error(`[IndicatorConfigRepository] Failed to load all configurations:`, error);
      return [];
    }
  }

  /**
   * Limpa todas as configurações de indicadores (para reset/debug)
   */
  async clearAllConfigurations(): Promise<void> {
    try {
      await this.clear();
      console.log('[IndicatorConfigRepository] All indicator configurations cleared');
    } catch (error) {
      console.error('[IndicatorConfigRepository] Failed to clear configurations:', error);
      throw error;
    }
  }

  /**
   * Obtém estatísticas das configurações
   */
  async getConfigurationStats(): Promise<{
    totalConfigs: number;
    configsBySymbol: { [symbolId: string]: number };
    enabledConfigs: number;
    disabledConfigs: number;
  }> {
    try {
      const allConfigs = await this.getAll();
      
      const stats = {
        totalConfigs: allConfigs.length,
        configsBySymbol: {} as { [symbolId: string]: number },
        enabledConfigs: allConfigs.filter(c => c.isEnabled).length,
        disabledConfigs: allConfigs.filter(c => !c.isEnabled).length
      };
      
      // Agrupa por símbolo
      allConfigs.forEach(config => {
        stats.configsBySymbol[config.symbolId] = (stats.configsBySymbol[config.symbolId] || 0) + 1;
      });
      
      return stats;
    } catch (error) {
      console.error('[IndicatorConfigRepository] Failed to get stats:', error);
      return {
        totalConfigs: 0,
        configsBySymbol: {},
        enabledConfigs: 0,
        disabledConfigs: 0
      };
    }
  }
}