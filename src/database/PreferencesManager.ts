import { IndexedDBManager } from './IndexedDBManager';
import { UserPreferences, DatabaseConfig } from './types';
import { CSVSymbol } from '../utils/csvLoader';
import { ActiveIndicator } from '../types/indicator.types';

export class PreferencesManager {
  private static instance: PreferencesManager;
  private dbManager: IndexedDBManager;
  private readonly USER_PREFS_KEY = 'user_preferences_v1';
  private isInitialized = false;

  private constructor() {
    const config: DatabaseConfig = {
      name: 'TradingSystemDB',
      version: 1,
      stores: {
        userPreferences: {
          keyPath: 'id',
          indexes: {
            lastUpdated: 'lastUpdated',
            theme: 'theme'
          }
        }
      }
    };

    this.dbManager = new IndexedDBManager(config);
  }

  static getInstance(): PreferencesManager {
    if (!PreferencesManager.instance) {
      PreferencesManager.instance = new PreferencesManager();
    }
    return PreferencesManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.dbManager.initialize();
      this.isInitialized = true;
      console.log('PreferencesManager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize PreferencesManager:', error);
      throw error;
    }
  }

  async getUserPreferences(): Promise<UserPreferences> {
    if (!this.isInitialized) {
      throw new Error('PreferencesManager not initialized');
    }

    try {
      const prefs = await this.dbManager.get<UserPreferences>('userPreferences', this.USER_PREFS_KEY);
      
      if (!prefs) {
        // Return default preferences if none exist
        return this.getDefaultPreferences();
      }

      return prefs;
    } catch (error) {
      console.error('Failed to get user preferences:', error);
      return this.getDefaultPreferences();
    }
  }

  async saveUserPreferences(preferences: Partial<UserPreferences>): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('PreferencesManager not initialized');
    }

    try {
      // Get current preferences or defaults
      const currentPrefs = await this.getUserPreferences();
      
      // Merge with new preferences
      const updatedPrefs: UserPreferences = {
        ...currentPrefs,
        ...preferences,
        id: this.USER_PREFS_KEY,
        lastUpdated: new Date()
      };

      await this.dbManager.put('userPreferences', updatedPrefs);
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

  async saveActiveIndicators(indicators: ActiveIndicator[]): Promise<void> {
    await this.saveUserPreferences({ activeIndicators: indicators });
  }

  async getActiveIndicators(): Promise<ActiveIndicator[]> {
    const prefs = await this.getUserPreferences();
    return prefs.activeIndicators || [];
  }

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
    if (!this.isInitialized) {
      throw new Error('PreferencesManager not initialized');
    }

    try {
      await this.dbManager.clear('userPreferences');
      console.log('All user preferences cleared');
    } catch (error) {
      console.error('Failed to clear user preferences:', error);
      throw error;
    }
  }

  private getDefaultPreferences(): UserPreferences {
    return {
      id: this.USER_PREFS_KEY,
      activeIndicators: [],
      theme: 'dark',
      showVolume: true,
      showGrid: true,
      autoSave: true,
      lastUpdated: new Date()
    };
  }

  close(): void {
    this.dbManager.close();
    this.isInitialized = false;
  }

  // Utility method for debugging
  async exportPreferences(): Promise<UserPreferences> {
    const prefs = await this.getUserPreferences();
    console.log('Current user preferences:', JSON.stringify(prefs, null, 2));
    return prefs;
  }

  // Utility method for importing preferences
  async importPreferences(preferences: UserPreferences): Promise<void> {
    preferences.id = this.USER_PREFS_KEY;
    preferences.lastUpdated = new Date();
    await this.dbManager.put('userPreferences', preferences);
    console.log('User preferences imported successfully');
  }
}