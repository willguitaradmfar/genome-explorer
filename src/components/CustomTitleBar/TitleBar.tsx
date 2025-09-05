import React from 'react';

interface TitleBarProps {
  title?: string;
  currentSymbol?: string;
  timeframe?: string;
}

// Declare electron API types
declare global {
  interface Window {
    require?: any;
    electronAPI?: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
    };
  }
}

const TitleBar: React.FC<TitleBarProps> = ({ 
  title = 'Genome Explorer', 
  currentSymbol, 
  timeframe 
}) => {
  // Detect if running on macOS
  const isMacOS = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  const handleMinimize = () => {
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('window-minimize');
      }
    } catch (error) {
      console.log('Minimize not available in this context');
    }
  };

  const handleMaximize = () => {
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('window-maximize');
      }
    } catch (error) {
      console.log('Maximize not available in this context');
    }
  };

  const handleClose = () => {
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('window-close');
      }
    } catch (error) {
      console.log('Close not available in this context');
    }
  };

  return (
    <div 
      className="fixed top-0 left-0 right-0 h-8 bg-gray-900/95 backdrop-blur-md border-b border-gray-700/50 flex items-center px-4 z-50 select-none" 
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left side - Empty space for balance */}
      <div className="flex items-center gap-3 flex-shrink-0 w-20"></div>

      {/* Center - Title */}
      <div className="flex-1 flex justify-center items-center">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-200 truncate">{title}</span>
          {currentSymbol && (
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 bg-gray-600 rounded-full"></div>
              <span className="text-sm font-bold text-white">{currentSymbol}</span>
              {timeframe && (
                <span className="text-xs text-gray-400 bg-gray-700/50 px-2 py-1 rounded">{timeframe}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right side - Window Controls (only on Windows/Linux) */}
      <div className="flex items-center gap-4 flex-shrink-0">
        {!isMacOS && (
          <div 
            className="flex items-center gap-1" 
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <button
              onClick={handleMinimize}
              className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-gray-700/60 transition-colors"
              title="Minimize"
            >
              <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            
            <button
              onClick={handleMaximize}
              className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-gray-700/60 transition-colors"
              title="Maximize"
            >
              <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V6a2 2 0 012-2h2M4 16v2a2 2 0 002 2h2M16 4h2a2 2 0 012 2v2M16 20h2a2 2 0 002-2v-2" />
              </svg>
            </button>
            
            <button
              onClick={handleClose}
              className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-red-500/60 transition-colors group"
              title="Close"
            >
              <svg className="w-3 h-3 text-gray-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TitleBar;