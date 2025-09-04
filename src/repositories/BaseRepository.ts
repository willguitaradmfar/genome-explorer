import { IndexedDBManager } from '../database/IndexedDBManager';
import { DatabaseConfig, QueryOptions } from '../database/types';

export interface IRepository<T> {
  initialize(): Promise<void>;
  get(id: string): Promise<T | null>;
  getAll(): Promise<T[]>;
  create(data: T): Promise<string | number>;
  update(id: string, data: Partial<T>): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

export abstract class BaseRepository<T extends { id: string }> implements IRepository<T> {
  protected dbManager: IndexedDBManager;
  protected storeName: string;
  private isInitialized: boolean = false;

  constructor(storeName: string) {
    this.storeName = storeName;
    this.dbManager = new IndexedDBManager(this.getDatabaseConfig());
  }

  protected abstract getDatabaseConfig(): DatabaseConfig;

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log(`${this.constructor.name} already initialized, skipping`);
      return;
    }
    
    try {
      console.log(`Initializing ${this.constructor.name}...`);
      await this.dbManager.initialize();
      this.isInitialized = true;
      console.log(`${this.constructor.name} initialized successfully`);
    } catch (error) {
      console.error(`Failed to initialize ${this.constructor.name}:`, error);
      throw error;
    }
  }

  protected ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error(`${this.constructor.name} not initialized. Call initialize() first.`);
    }
  }

  async get(id: string): Promise<T | null> {
    this.ensureInitialized();
    return await this.dbManager.get<T>(this.storeName, id);
  }

  async getAll(options?: QueryOptions): Promise<T[]> {
    this.ensureInitialized();
    return await this.dbManager.getAll<T>(this.storeName, options);
  }

  async create(data: T): Promise<string> {
    this.ensureInitialized();
    const key = await this.dbManager.add(this.storeName, data);
    return key.toString();
  }

  async update(id: string, data: Partial<T>): Promise<void> {
    this.ensureInitialized();
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`Entity with id ${id} not found`);
    }
    
    const updated = { ...existing, ...data, id };
    await this.dbManager.put(this.storeName, updated);
  }

  async save(data: T): Promise<void> {
    this.ensureInitialized();
    await this.dbManager.put(this.storeName, data);
  }

  async delete(id: string): Promise<void> {
    this.ensureInitialized();
    await this.dbManager.delete(this.storeName, id);
  }

  async clear(): Promise<void> {
    this.ensureInitialized();
    await this.dbManager.clear(this.storeName);
  }

  async count(query?: IDBKeyRange | IDBValidKey): Promise<number> {
    this.ensureInitialized();
    return await this.dbManager.count(this.storeName, query);
  }

  async bulkCreate(items: T[]): Promise<void> {
    this.ensureInitialized();
    await this.dbManager.bulkPut(this.storeName, items);
  }

  async bulkDelete(ids: string[]): Promise<void> {
    this.ensureInitialized();
    await this.dbManager.bulkDelete(this.storeName, ids);
  }

  close(): void {
    this.dbManager.close();
    this.isInitialized = false;
  }
}