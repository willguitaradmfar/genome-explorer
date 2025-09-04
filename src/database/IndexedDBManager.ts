import { DatabaseConfig, DatabaseError, QueryOptions, StoreConfig } from './types';

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
        const oldVersion = event.oldVersion;
        
        Object.entries(this.config.stores).forEach(([storeName, storeConfig]) => {
          if (!db.objectStoreNames.contains(storeName)) {
            this.createObjectStore(db, storeName, storeConfig);
          } else if (oldVersion < this.version) {
            this.updateObjectStore(db, storeName, storeConfig, event);
          }
        });
      };
    });
  }

  private createObjectStore(db: IDBDatabase, storeName: string, config: StoreConfig): void {
    const store = db.createObjectStore(storeName, {
      keyPath: config.keyPath,
      autoIncrement: config.autoIncrement || false
    });

    if (config.indexes) {
      config.indexes.forEach(index => {
        store.createIndex(index.name, index.keyPath, {
          unique: index.unique || false,
          multiEntry: index.multiEntry || false
        });
      });
    }

    console.log(`Created object store: ${storeName}`);
  }

  private updateObjectStore(_db: IDBDatabase, storeName: string, config: StoreConfig, event: IDBVersionChangeEvent): void {
    const transaction = (event.target as IDBOpenDBRequest).transaction;
    if (!transaction) return;

    const store = transaction.objectStore(storeName);

    if (config.indexes) {
      const existingIndexes = Array.from(store.indexNames);
      const newIndexes = config.indexes.map(idx => idx.name);

      existingIndexes.forEach(indexName => {
        if (!newIndexes.includes(indexName)) {
          store.deleteIndex(indexName);
        }
      });

      config.indexes.forEach(index => {
        if (!store.indexNames.contains(index.name)) {
          store.createIndex(index.name, index.keyPath, {
            unique: index.unique || false,
            multiEntry: index.multiEntry || false
          });
        }
      });
    }
  }

  async get<T>(storeName: string, key: IDBValidKey): Promise<T | null> {
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

  async getAll<T>(storeName: string, options?: QueryOptions): Promise<T[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      
      let source: IDBObjectStore | IDBIndex = store;
      if (options?.index) {
        source = store.index(options.index);
      }

      const results: T[] = [];
      let count = 0;
      const limit = options?.limit || Infinity;
      const offset = options?.offset || 0;

      const request = source.openCursor(options?.query || null, options?.direction);

      request.onerror = () => {
        const error: DatabaseError = new Error(`Failed to query ${storeName}`);
        error.code = 'QUERY_ERROR';
        reject(error);
      };

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        
        if (cursor) {
          if (count >= offset && results.length < limit) {
            results.push(cursor.value);
          }
          count++;
          
          if (results.length < limit) {
            cursor.continue();
          } else {
            resolve(results);
          }
        } else {
          resolve(results);
        }
      };
    });
  }

  async put<T>(storeName: string, data: T): Promise<IDBValidKey> {
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
        resolve(request.result);
      };
    });
  }

  async add<T>(storeName: string, data: T): Promise<IDBValidKey> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.add(data);

      request.onerror = () => {
        const error: DatabaseError = new Error(`Failed to add item to ${storeName}`);
        error.code = 'ADD_ERROR';
        reject(error);
      };

      request.onsuccess = () => {
        resolve(request.result);
      };
    });
  }

  async delete(storeName: string, key: IDBValidKey): Promise<void> {
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

  async count(storeName: string, query?: IDBKeyRange | IDBValidKey): Promise<number> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.count(query);

      request.onerror = () => {
        const error: DatabaseError = new Error(`Failed to count items in ${storeName}`);
        error.code = 'COUNT_ERROR';
        reject(error);
      };

      request.onsuccess = () => {
        resolve(request.result);
      };
    });
  }

  async bulkPut<T>(storeName: string, items: T[]): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      let hasError = false;

      transaction.onerror = () => {
        hasError = true;
        const error: DatabaseError = new Error(`Failed to bulk put items in ${storeName}`);
        error.code = 'BULK_PUT_ERROR';
        reject(error);
      };

      transaction.oncomplete = () => {
        if (!hasError) {
          resolve();
        }
      };

      items.forEach(item => {
        store.put(item);
      });
    });
  }

  async bulkDelete(storeName: string, keys: IDBValidKey[]): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      let hasError = false;

      transaction.onerror = () => {
        hasError = true;
        const error: DatabaseError = new Error(`Failed to bulk delete items from ${storeName}`);
        error.code = 'BULK_DELETE_ERROR';
        reject(error);
      };

      transaction.oncomplete = () => {
        if (!hasError) {
          resolve();
        }
      };

      keys.forEach(key => {
        store.delete(key);
      });
    });
  }

  getDatabase(): IDBDatabase | null {
    return this.db;
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log(`Database ${this.dbName} closed`);
    }
  }

  async deleteDatabase(): Promise<void> {
    this.close();
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.dbName);

      request.onerror = () => {
        const error: DatabaseError = new Error(`Failed to delete database ${this.dbName}`);
        error.code = 'DELETE_DATABASE_ERROR';
        reject(error);
      };

      request.onsuccess = () => {
        console.log(`Database ${this.dbName} deleted`);
        resolve();
      };
    });
  }
}