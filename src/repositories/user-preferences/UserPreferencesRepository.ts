import { DatabaseConfig } from '../../database/types';
import { BaseRepository } from '../BaseRepository';
import { CSVSymbol } from '../../utils/csvLoader';

export interface UserPreferences {
  id: string;
  lastSelectedSymbol?: CSVSymbol;
  theme: 'dark' | 'light';
  showVolume: boolean;
  showGrid: boolean;
  autoSave: boolean;
  lastUpdated: Date;
}

export class UserPreferencesRepository extends BaseRepository<UserPreferences> {
  private static instance: UserPreferencesRepository;
  private readonly USER_PREFS_KEY = 'user_preferences_v1';

  private constructor() {
    super('userPreferences');
  }

  static getInstance(): UserPreferencesRepository {
    if (!UserPreferencesRepository.instance) {
      UserPreferencesRepository.instance = new UserPreferencesRepository();
    }
    return UserPreferencesRepository.instance;
  }

  protected getDatabaseConfig(): DatabaseConfig {
    return {
      name: 'TradingSystemDB',
      version: 6, // Versão atualizada para incluir nova tabela indicatorConfigs
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
            { name: 'symbolIndicator', keyPath: ['symbolId', 'indicatorId'] },
            { name: 'isEnabled', keyPath: 'isEnabled' },
            { name: 'pane', keyPath: 'pane' },
            { name: 'createdAt', keyPath: 'createdAt' }
          ]
        }
      }
    };
  }

  async getUserPreferences(): Promise<UserPreferences> {
    try {
      const prefs = await this.get(this.USER_PREFS_KEY);
      
      if (!prefs) {
        return this.getDefaultPreferences();
      }

      return prefs;
    } catch (error) {
      console.error('Failed to get user preferences:', error);
      return this.getDefaultPreferences();
    }
  }

  async saveUserPreferences(preferences: Partial<UserPreferences>): Promise<void> {
    try {
      const currentPrefs = await this.getUserPreferences();
      
      const updatedPrefs: UserPreferences = {
        ...currentPrefs,
        ...preferences,
        id: this.USER_PREFS_KEY,
        lastUpdated: new Date()
      };

      await this.save(updatedPrefs);
      console.log('User preferences saved successfully');
    } catch (error) {
      console.error('Failed to save user preferences:', error);
      throw error;
    }
  }

  async saveLastSelectedSymbol(symbol: CSVSymbol): Promise<void> {
    await this.saveUserPreferences({ lastSelectedSymbol: symbol });
  }

  async getLastSelectedSymbol(): Promise<CSVSymbol | null> {
    const prefs = await this.getUserPreferences();
    return prefs.lastSelectedSymbol || null;
  }

  // Removed activeIndicators management - now handled by IndicatorConfigRepository
  // This keeps UserPreferences focused on UI/app preferences only

  async saveTheme(theme: 'dark' | 'light'): Promise<void> {
    await this.saveUserPreferences({ theme });
  }

  async getTheme(): Promise<'dark' | 'light'> {
    const prefs = await this.getUserPreferences();
    return prefs.theme || 'dark';
  }

  async saveChartSettings(showVolume: boolean, showGrid: boolean): Promise<void> {
    await this.saveUserPreferences({ showVolume, showGrid });
  }

  async getChartSettings(): Promise<{ showVolume: boolean; showGrid: boolean }> {
    const prefs = await this.getUserPreferences();
    return {
      showVolume: prefs.showVolume ?? true,
      showGrid: prefs.showGrid ?? true
    };
  }

  async clearAllPreferences(): Promise<void> {
    try {
      await this.clear();
      console.log('All user preferences cleared');
    } catch (error) {
      console.error('Failed to clear user preferences:', error);
      throw error;
    }
  }

  private getDefaultPreferences(): UserPreferences {
    return {
      id: this.USER_PREFS_KEY,
      theme: 'dark',
      showVolume: true,
      showGrid: true,
      autoSave: true,
      lastUpdated: new Date()
    };
  }

  async exportPreferences(): Promise<UserPreferences> {
    const prefs = await this.getUserPreferences();
    console.log('Current user preferences:', JSON.stringify(prefs, null, 2));
    return prefs;
  }

  async importPreferences(preferences: UserPreferences): Promise<void> {
    preferences.id = this.USER_PREFS_KEY;
    preferences.lastUpdated = new Date();
    await this.save(preferences);
    console.log('User preferences imported successfully');
  }
}