import React, { useState, useEffect, useCallback } from 'react';
import Chart from './components/Chart/Chart';
import TitleBar from './components/CustomTitleBar/TitleBar';
import CommandPalette from './components/CommandPalette/CommandPalette';
import IndicatorPanel from './components/IndicatorPanel/IndicatorPanel';
import ParameterDialog from './components/ParameterDialog/ParameterDialog';
import OHLCTooltip from './components/OHLCTooltip/OHLCTooltip';
import { CSVLoader, CSVSymbol } from './utils/csvLoader';
import { ActiveIndicator, Indicator } from './types/indicator.types';
import { 
  OHLC, 
  VolumeData,
  ChartSettings 
} from './types/chart.types';
import { PreferencesManager } from './database';

const App: React.FC = () => {
  const [chartData, setChartData] = useState<OHLC[]>([]);
  const [volumeData, setVolumeData] = useState<VolumeData[]>([]);
  const [currentSymbol, setCurrentSymbol] = useState<CSVSymbol | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState('>');
  const [activeIndicators, setActiveIndicators] = useState<ActiveIndicator[]>([]);
  const [preferencesManager, setPreferencesManager] = useState<PreferencesManager | null>(null);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);
  const [showParameterDialog, setShowParameterDialog] = useState(false);
  const [selectedIndicatorForConfig, setSelectedIndicatorForConfig] = useState<Indicator | null>(null);
  const [ohlcTooltip, setOhlcTooltip] = useState<{
    data: OHLC | null;
    position: { x: number; y: number };
    isVisible: boolean;
  }>({
    data: null,
    position: { x: 0, y: 0 },
    isVisible: false
  });

  const [chartSettings] = useState<ChartSettings>({
    theme: 'dark',
    showVolume: true,
    showGrid: true,
    indicators: [],
    timeFrame: '1h',
    symbol: { symbol: 'BTC/USD', name: 'Bitcoin', exchange: 'Crypto', type: 'crypto' },
  });

  // Generate sample data
  const generateSampleData = useCallback(() => {
    const data: OHLC[] = [];
    const volume: VolumeData[] = [];
    let time = new Date();
    time.setHours(time.getHours() - 1000);
    let basePrice = 50000;
    
    for (let i = 0; i < 1000; i++) {
      const variance = (Math.random() - 0.5) * 1000;
      const open = basePrice + variance;
      const close = open + (Math.random() - 0.5) * 1000;
      const high = Math.max(open, close) + Math.random() * 500;
      const low = Math.min(open, close) - Math.random() * 500;
      
      data.push({
        time: Math.floor(time.getTime() / 1000),
        open,
        high,
        low,
        close,
      });
      
      volume.push({
        time: Math.floor(time.getTime() / 1000),
        value: Math.random() * 1000000,
        color: close >= open ? '#26a69a' : '#ef5350',
      });
      
      basePrice = close;
      time = new Date(time.getTime() + 60 * 60 * 1000);
    }
    
    return { data, volume };
  }, []);

  // Initialize IndexedDB and load user preferences
  useEffect(() => {
    const initializeDatabase = async () => {
      try {
        const prefsManager = PreferencesManager.getInstance();
        await prefsManager.initialize();
        setPreferencesManager(prefsManager);
        
        // Load saved preferences
        const savedIndicators = await prefsManager.getActiveIndicators();
        const lastSymbol = await prefsManager.getLastSelectedSymbol();
        
        setActiveIndicators(savedIndicators);
        
        // Load symbols and set the last selected one or first available
        const csvLoader = CSVLoader.getInstance();
        const symbols = await csvLoader.initializeSymbols();
        
        if (lastSymbol && symbols.find(s => s.filename === lastSymbol.filename)) {
          handleSymbolChange(lastSymbol, false); // Don't save to preferences again
        } else if (symbols.length > 0) {
          handleSymbolChange(symbols[0]);
        } else {
          // Fallback to generated data
          const { data, volume } = generateSampleData();
          setChartData(data);
          setVolumeData(volume);
        }
        
        console.log('Database and preferences loaded successfully');
      } catch (error) {
        console.error('Failed to initialize database:', error);
        // Continue with default initialization
        const csvLoader = CSVLoader.getInstance();
        const symbols = await csvLoader.initializeSymbols();
        if (symbols.length > 0) {
          handleSymbolChange(symbols[0]);
        } else {
          const { data, volume } = generateSampleData();
          setChartData(data);
          setVolumeData(volume);
        }
      } finally {
        setIsLoadingPreferences(false);
      }
    };
    
    initializeDatabase();
  }, [generateSampleData]);

  // Global keyboard listener for Ctrl+P and Ctrl+I
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        setCommandPaletteQuery('>');
        setShowCommandPalette(true);
      } else if (e.ctrlKey && e.key === 'i') {
        e.preventDefault();
        setCommandPaletteQuery('+');
        setShowCommandPalette(true);
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Cleanup database connection on component unmount
  useEffect(() => {
    return () => {
      if (preferencesManager) {
        preferencesManager.close();
      }
    };
  }, [preferencesManager]);

  const handleSymbolChange = async (symbol: CSVSymbol, saveToPreferences: boolean = true) => {
    setIsLoadingData(true);
    setCurrentSymbol(symbol);
    
    try {
      const csvLoader = CSVLoader.getInstance();
      const { data, volumeData: volume } = await csvLoader.loadSymbolData(symbol);
      
      setChartData(data);
      setVolumeData(volume);
      
      // Save to preferences if requested
      if (saveToPreferences && preferencesManager) {
        await preferencesManager.saveLastSelectedSymbol(symbol);
      }
      
      console.log(`Loaded ${data.length} data points for ${symbol.displayName}`);
    } catch (error) {
      console.error('Error loading symbol data:', error);
      // Fallback to generated data
      const { data, volume } = generateSampleData();
      setChartData(data);
      setVolumeData(volume);
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleIndicatorSelect = async (indicator: Indicator) => {
    // Always allow adding indicators (can have multiple of same type with different params)
    const hasParameters = Object.keys(indicator.parameters).length > 0;
    
    if (hasParameters) {
      // Show parameter dialog
      setSelectedIndicatorForConfig(indicator);
      setShowParameterDialog(true);
      setShowCommandPalette(false); // Close command palette
    } else {
      // No parameters, add directly with defaults
      await addIndicatorWithValues(indicator, {});
    }
  };

  const addIndicatorWithValues = async (indicator: Indicator, values: { [key: string]: any }) => {
    // Extract default values and merge with provided values
    const finalValues: { [key: string]: any } = {};
    Object.keys(indicator.parameters).forEach(key => {
      const param = indicator.parameters[key];
      finalValues[key] = values[key] !== undefined ? values[key] : param.default;
    });
    
    // Generate unique ID for this instance
    const instanceId = `${indicator.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const activeIndicator: ActiveIndicator = {
      ...indicator,
      id: instanceId, // Use unique instance ID
      baseId: indicator.id, // Original ID for loading JS files
      isActive: true,
      addedAt: new Date(),
      values: finalValues
    };
    
    const updatedIndicators = [...activeIndicators, activeIndicator];
    setActiveIndicators(updatedIndicators);
    
    // Save to preferences
    if (preferencesManager) {
      await preferencesManager.saveActiveIndicators(updatedIndicators);
    }
    
    console.log(`Added indicator: ${indicator.name}`, finalValues);
  };

  const handleParameterDialogConfirm = async (values: { [key: string]: any }) => {
    if (selectedIndicatorForConfig) {
      await addIndicatorWithValues(selectedIndicatorForConfig, values);
      setShowParameterDialog(false);
      setSelectedIndicatorForConfig(null);
    }
  };

  const handleParameterDialogCancel = () => {
    setShowParameterDialog(false);
    setSelectedIndicatorForConfig(null);
  };

  const handleRemoveIndicator = async (indicatorId: string) => {
    const updatedIndicators = activeIndicators.filter(indicator => indicator.id !== indicatorId);
    setActiveIndicators(updatedIndicators);
    
    // Save to preferences
    if (preferencesManager) {
      await preferencesManager.saveActiveIndicators(updatedIndicators);
    }
    
    console.log(`Removed indicator: ${indicatorId}`);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-chart-bg">
      {/* Custom Title Bar */}
      <TitleBar 
        title="Genome Explorer" 
        currentSymbol={currentSymbol?.displayName}
        timeframe={currentSymbol?.timeframe}
      />
      
      {/* Full-screen Chart */}
      <div className="absolute inset-0 pt-8">
        <Chart 
          data={chartData}
          volumeData={volumeData}
          activeIndicators={activeIndicators}
          settings={chartSettings}
          onCrosshairMove={setOhlcTooltip}
        />
      </div>

      {/* Loading Indicators */}
      {isLoadingPreferences && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/50 backdrop-blur-md text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 z-50">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
          <span>Loading preferences...</span>
        </div>
      )}
      
      {isLoadingData && !isLoadingPreferences && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white/20 dark:bg-gray-900/25 backdrop-blur-xl border border-white/15 dark:border-gray-600/20 rounded-lg shadow-2xl px-8 py-6 flex items-center gap-4 max-w-md">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            <div>
              <div className="text-white font-medium text-lg">
                Loading {currentSymbol?.displayName || 'data'}...
              </div>
              {currentSymbol && (
                <div className="text-white/70 text-sm mt-1">
                  {currentSymbol.fileSizeKB}KB • {currentSymbol.lineCount.toLocaleString()} candles • {currentSymbol.exchange}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Current Symbol Display */}
      {currentSymbol && !isLoadingData && (
        <div className="absolute top-20 right-4 bg-black/30 backdrop-blur-md text-white px-3 py-2 rounded-lg shadow-lg text-sm">
          <span className="font-medium">{currentSymbol.displayName}</span>
          <span className="text-white/70 ml-2">• {currentSymbol.timeframe}</span>
        </div>
      )}

      {/* Indicator Panel */}
      <IndicatorPanel
        indicators={activeIndicators}
        onRemoveIndicator={handleRemoveIndicator}
      />

      {/* Command Palette */}
      <CommandPalette
        isVisible={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onSymbolSelect={handleSymbolChange}
        onIndicatorSelect={handleIndicatorSelect}
        initialQuery={commandPaletteQuery}
      />

      {/* Parameter Dialog */}
      <ParameterDialog
        indicator={selectedIndicatorForConfig}
        isVisible={showParameterDialog}
        onConfirm={handleParameterDialogConfirm}
        onCancel={handleParameterDialogCancel}
      />

      {/* OHLC Tooltip */}
      <OHLCTooltip
        data={ohlcTooltip.data}
        position={ohlcTooltip.position}
        isVisible={ohlcTooltip.isVisible}
      />
    </div>
  );
};

export default App;