import { DatabaseConfig, DatabaseError } from './types';

export class IndexedDBManager {
  private dbName: string;
  private version: number;
  private db: IDBDatabase | null = null;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
    this.dbName = config.name;
    this.version = config.version;
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB not supported'));
        return;
      }

      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        const error: DatabaseError = new Error('Failed to open database');
        error.code = 'DATABASE_OPEN_ERROR';
        error.source = 'IndexedDBManager.initialize';
        reject(error);
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        console.log(`IndexedDB initialized: ${this.dbName} v${this.version}`);
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object stores based on config
        Object.entries(this.config.stores).forEach(([storeName, storeConfig]) => {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { 
              keyPath: storeConfig.keyPath 
            });
            
            // Create indexes if specified
            if (storeConfig.indexes) {
              Object.entries(storeConfig.indexes).forEach(([indexName, indexKey]) => {
                store.createIndex(indexName, indexKey, { unique: false });
              });
            }
            
            console.log(`Created object store: ${storeName}`);
          }
        });
      };
    });
  }

  async get<T>(storeName: string, key: string): Promise<T | null> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onerror = () => {
        const error: DatabaseError = new Error(`Failed to get item from ${storeName}`);
        error.code = 'GET_ERROR';
        reject(error);
      };

      request.onsuccess = () => {
        resolve(request.result || null);
      };
    });
  }

  async put<T>(storeName: string, data: T): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onerror = () => {
        const error: DatabaseError = new Error(`Failed to put item in ${storeName}`);
        error.code = 'PUT_ERROR';
        reject(error);
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }

  async delete(storeName: string, key: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onerror = () => {
        const error: DatabaseError = new Error(`Failed to delete item from ${storeName}`);
        error.code = 'DELETE_ERROR';
        reject(error);
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onerror = () => {
        const error: DatabaseError = new Error(`Failed to get all items from ${storeName}`);
        error.code = 'GET_ALL_ERROR';
        reject(error);
      };

      request.onsuccess = () => {
        resolve(request.result || []);
      };
    });
  }

  async clear(storeName: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onerror = () => {
        const error: DatabaseError = new Error(`Failed to clear ${storeName}`);
        error.code = 'CLEAR_ERROR';
        reject(error);
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log(`Database ${this.dbName} closed`);
    }
  }
}