export class DataFolderManager {
  private static instance: DataFolderManager;
  private dataPath: string = '';

  private constructor() {
    this.initializeDefaultPath();
  }

  private initializeDefaultPath() {
    // Try to get saved path from localStorage
    const savedPath = localStorage.getItem('dataFolderPath');
    if (savedPath) {
      this.dataPath = savedPath;
      return;
    }

    // Use default path based on current working directory
    if (window.require) {
      // Electron environment
      const path = window.require('path');
      const process = window.require('process');
      this.dataPath = path.join(process.cwd(), 'data');
    } else {
      // Web environment - use relative path
      this.dataPath = './data';
    }
    
    console.log(`Default data path initialized: ${this.dataPath}`);
  }

  static getInstance(): DataFolderManager {
    if (!DataFolderManager.instance) {
      DataFolderManager.instance = new DataFolderManager();
    }
    return DataFolderManager.instance;
  }

  async setDataPath(folderPath: string): Promise<void> {
    try {
      // Check if we're in an Electron environment
      if (window.electron?.fs) {
        const exists = await window.electron.fs.exists(folderPath);
        
        if (!exists) {
          await window.electron.fs.mkdir(folderPath, { recursive: true });
        }

        // Create subdirectories
        const subdirs = ['symbols', 'indicators', 'cache'];
        for (const subdir of subdirs) {
          const subdirPath = `${folderPath}/${subdir}`;
          const subdirExists = await window.electron.fs.exists(subdirPath);
          if (!subdirExists) {
            await window.electron.fs.mkdir(subdirPath, { recursive: true });
          }
        }

        this.dataPath = folderPath;
        
        // Save to localStorage for persistence
        localStorage.setItem('dataFolderPath', folderPath);
        
        console.log(`Data folder configured: ${folderPath}`);
      } else {
        // For web environment, just save the path
        this.dataPath = folderPath;
        localStorage.setItem('dataFolderPath', folderPath);
        console.log(`Data folder path saved (web mode): ${folderPath}`);
      }
    } catch (error) {
      console.error('Error setting data path:', error);
      throw new Error(`Failed to configure data folder: ${error}`);
    }
  }

  getDataPath(): string {
    return this.dataPath;
  }

  getSymbolsPath(): string {
    const basePath = this.getDataPath();
    return basePath ? `${basePath}/symbols` : '';
  }

  getIndicatorsPath(): string {
    const basePath = this.getDataPath();
    return basePath ? `${basePath}/indicators` : '';
  }

  getCachePath(): string {
    const basePath = this.getDataPath();
    return basePath ? `${basePath}/cache` : '';
  }

  isConfigured(): boolean {
    return !!this.dataPath;
  }

  async validatePath(folderPath: string): Promise<boolean> {
    if (window.electron?.fs) {
      try {
        const stats = await window.electron.fs.stat(folderPath);
        return stats.isDirectory();
      } catch {
        // Path doesn't exist, but we can create it
        return true;
      }
    }
    // In web mode, we can't validate, so assume it's valid
    return true;
  }
}

// Type declaration for Electron API
declare global {
  interface Window {
    electron?: {
      fs: {
        exists: (path: string) => Promise<boolean>;
        mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
        stat: (path: string) => Promise<{ isDirectory: () => boolean }>;
      };
    };
  }
}