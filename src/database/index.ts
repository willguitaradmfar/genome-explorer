// Main exports for the database module
export { IndexedDBManager } from './IndexedDBManager';
export { PreferencesManager } from './PreferencesManager';
export type {
  UserPreferences,
  DatabaseSchema,
  DatabaseConfig,
  DatabaseError
} from './types';

import { PreferencesManager } from './PreferencesManager';

// Convenience function to get a ready-to-use PreferencesManager
export async function initializeDatabase(): Promise<PreferencesManager> {
  const prefsManager = PreferencesManager.getInstance();
  await prefsManager.initialize();
  return prefsManager;
}

// Global database instance (optional convenience)
let globalPreferencesManager: PreferencesManager | null = null;

export async function getGlobalPreferencesManager(): Promise<PreferencesManager> {
  if (!globalPreferencesManager) {
    globalPreferencesManager = await initializeDatabase();
  }
  return globalPreferencesManager;
}