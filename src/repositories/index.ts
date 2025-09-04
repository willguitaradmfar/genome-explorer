export { BaseRepository, type IRepository } from './BaseRepository';
export { UserPreferencesRepository, type UserPreferences } from './user-preferences/UserPreferencesRepository';
export { SymbolDataRepository, type OHLCDataPoint, type SymbolMetadata } from './symbol-data/SymbolDataRepository';
export { IndicatorConfigRepository, type IndicatorConfiguration } from './indicator-configs/IndicatorConfigRepository';

import { UserPreferencesRepository } from './user-preferences/UserPreferencesRepository';

export async function initializeRepositories(): Promise<UserPreferencesRepository> {
  const prefsRepo = UserPreferencesRepository.getInstance();
  await prefsRepo.initialize();
  return prefsRepo;
}

let globalPreferencesRepository: UserPreferencesRepository | null = null;

export async function getGlobalPreferencesRepository(): Promise<UserPreferencesRepository> {
  if (!globalPreferencesRepository) {
    globalPreferencesRepository = await initializeRepositories();
  }
  return globalPreferencesRepository;
}