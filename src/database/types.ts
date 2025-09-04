export interface StoreConfig {
  keyPath: string;
  autoIncrement?: boolean;
  indexes?: Array<{
    name: string;
    keyPath: string | string[];
    unique?: boolean;
    multiEntry?: boolean;
  }>;
}

export interface DatabaseConfig {
  name: string;
  version: number;
  stores: {
    [storeName: string]: StoreConfig;
  };
}

export interface DatabaseError extends Error {
  code?: string;
  source?: string;
}

export interface QueryOptions {
  index?: string;
  query?: IDBKeyRange | IDBValidKey;
  direction?: IDBCursorDirection;
  limit?: number;
  offset?: number;
}

export interface Transaction {
  store: IDBObjectStore;
  tx: IDBTransaction;
}