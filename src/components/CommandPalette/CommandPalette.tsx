import React, { useState, useEffect, useRef } from 'react';
import { CSVLoader, CSVSymbol } from '../../utils/csvLoader';
import { IndicatorLoader } from '../../utils/indicatorLoader';
import { Indicator } from '../../types/indicator.types';

interface CommandPaletteProps {
  isVisible: boolean;
  onClose: () => void;
  onSymbolSelect: (symbol: CSVSymbol) => void;
  onIndicatorSelect: (indicator: Indicator) => void;
  initialQuery?: string;
}

interface SearchResult {
  type: 'symbol' | 'indicator' | 'command';
  id: string;
  title: string;
  subtitle?: string;
  icon: string;
  action?: () => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({
  isVisible,
  onClose,
  onSymbolSelect,
  onIndicatorSelect,
  initialQuery = '>',
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [availableSymbols, setAvailableSymbols] = useState<CSVSymbol[]>([]);
  const [availableIndicators, setAvailableIndicators] = useState<Indicator[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load available symbols and indicators
  useEffect(() => {
    const initData = async () => {
      const csvLoader = CSVLoader.getInstance();
      const symbols = await csvLoader.initializeSymbols();
      setAvailableSymbols(symbols);

      const indicatorLoader = IndicatorLoader.getInstance();
      const indicators = await indicatorLoader.initializeIndicators();
      setAvailableIndicators(indicators);
    };
    initData();
  }, []);

  // Reload data when CommandPalette becomes visible
  useEffect(() => {
    if (isVisible) {
      const reloadData = async () => {
        console.log('Reloading symbols and indicators from disk...');
        const csvLoader = CSVLoader.getInstance();
        const symbols = await csvLoader.initializeSymbols(true); // Force reload
        setAvailableSymbols(symbols);

        const indicatorLoader = IndicatorLoader.getInstance();
        const indicators = await indicatorLoader.initializeIndicators(true); // Force reload
        setAvailableIndicators(indicators);
      };
      reloadData();
    }
  }, [isVisible]);

  // Focus input when visible
  useEffect(() => {
    if (isVisible && inputRef.current) {
      setQuery(initialQuery);
      setSelectedIndex(0);
      inputRef.current.focus();
      // Position cursor after the initial query
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(initialQuery.length, initialQuery.length);
        }
      }, 0);
    }
  }, [isVisible, initialQuery]);

  // Update search results based on query
  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }

    const searchResults: SearchResult[] = [];

    // Symbol search (when query starts with >)
    if (query.startsWith('>')) {
      const symbolQuery = query.slice(1).toLowerCase();
      
      const symbolResults = availableSymbols
        .filter(symbol => 
          symbol.displayName.toLowerCase().includes(symbolQuery) ||
          symbol.symbol.toLowerCase().includes(symbolQuery) ||
          symbol.filename.toLowerCase().includes(symbolQuery)
        )
        .map(symbol => ({
          type: 'symbol' as const,
          id: symbol.filename,
          title: symbol.displayName,
          subtitle: `${symbol.description} • ${symbol.exchange} • ${symbol.timeframe} • ${symbol.lineCount} lines • ${symbol.fileSizeKB}KB`,
          icon: symbol.type === 'stock' ? '📊' : '📈',
          action: () => {
            onSymbolSelect(symbol);
            onClose();
          }
        }));

      searchResults.push(...symbolResults);
    }
    // Indicator search (when query starts with +)
    else if (query.startsWith('+')) {
      const indicatorQuery = query.slice(1).toLowerCase();
      
      // Show all indicators, no filtering by symbol
      const indicatorResults = availableIndicators
        .filter((indicator: Indicator) => 
          indicator.name.toLowerCase().includes(indicatorQuery) ||
          indicator.description.toLowerCase().includes(indicatorQuery) ||
          indicator.id.toLowerCase().includes(indicatorQuery)
        )
        .map((indicator: Indicator) => ({
          type: 'indicator' as const,
          id: indicator.id,
          title: indicator.name,
          subtitle: `${indicator.description} • ${indicator.type}`,
          icon: indicator.type === 'overlay' ? '📊' : '📉',
          action: () => {
            onIndicatorSelect(indicator);
            onClose();
          }
        }));

      searchResults.push(...indicatorResults);
    } else {
      // Help commands when no prefix
      searchResults.push(
        {
          type: 'command',
          id: 'help-symbols',
          title: 'Search Symbols',
          subtitle: 'Type ">" to search for trading symbols',
          icon: '❓',
          action: () => setQuery('>')
        },
        {
          type: 'command',
          id: 'help-indicators',
          title: 'Search Indicators',
          subtitle: 'Type "+" to search for chart indicators',
          icon: '❓',
          action: () => setQuery('+')
        }
      );
    }

    setResults(searchResults);
    setSelectedIndex(0);
  }, [query, availableSymbols, availableIndicators, onSymbolSelect, onIndicatorSelect, onClose]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isVisible) return;

      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]?.action) {
            results[selectedIndex].action();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, results, selectedIndex, onClose]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-start justify-center pt-24">
      <div className="bg-white/20 dark:bg-gray-900/25 backdrop-blur-xl border border-white/20 dark:border-gray-600 rounded-lg shadow-2xl w-full max-w-4xl mx-4 overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center px-4 py-3 border-b border-white/10 dark:border-gray-600/20">
          <svg className="w-5 h-5 text-white/70 dark:text-white/70 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type > to search symbols, + for indicators, or search for commands..."
            className="flex-1 bg-transparent text-white dark:text-white placeholder-white/60 dark:placeholder-white/60 focus:outline-none text-lg font-medium"
          />
          <div className="text-xs text-white/60 dark:text-white/60 ml-3 font-medium">
            ESC to close
          </div>
        </div>

        {/* Results */}
        <div className="max-h-[600px] overflow-y-auto">
          {results.length === 0 && query && (
            <div className="p-4 text-center text-white/70 dark:text-white/70 font-medium">
              {query.startsWith('>') ? 'No symbols found' : 
               query.startsWith('+') ? 'No indicators found' : 
               'No results found'}
            </div>
          )}
          
          {results.length === 0 && !query && (
            <div className="p-6 text-center">
              <div className="text-4xl mb-2">⌨️</div>
              <h3 className="text-lg font-bold text-white dark:text-white mb-2 drop-shadow-md">Command Palette</h3>
              <p className="text-white/70 dark:text-white/70 text-sm font-medium">
                Type <code className="bg-white/20 dark:bg-white/20 px-2 py-1 rounded font-bold">&gt;</code> for symbols • <code className="bg-white/20 dark:bg-white/20 px-2 py-1 rounded font-bold">+</code> for indicators
              </p>
            </div>
          )}

          {results.map((result, index) => (
            <div
              key={result.id}
              className={`flex items-center px-4 py-3 cursor-pointer transition-colors ${
                index === selectedIndex
                  ? 'bg-white/20 dark:bg-white/20 border-l-2 border-blue-400'
                  : 'hover:bg-white/10 dark:hover:bg-white/10'
              }`}
              onClick={() => result.action?.()}
            >
              <span className="text-xl mr-3">{result.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white dark:text-white truncate drop-shadow-sm">
                  {result.title}
                </div>
                {result.subtitle && (
                  <div className="text-sm text-white/70 dark:text-white/70 truncate font-medium">
                    {result.subtitle}
                  </div>
                )}
              </div>
              {index === selectedIndex && (
                <div className="text-xs text-white/60 dark:text-white/60 ml-2 font-medium">↵</div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div className="px-4 py-2 bg-white/10 dark:bg-white/10 border-t border-white/10 dark:border-white/10">
            <div className="flex items-center justify-between text-xs text-white/70 dark:text-white/70 font-medium">
              <span>↑↓ navigate • ↵ select • esc close</span>
              <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CommandPalette;