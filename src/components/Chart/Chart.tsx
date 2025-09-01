import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  ColorType,
  CrosshairMode,
  LineStyle
} from 'lightweight-charts';
import { OHLC, ChartSettings, VolumeData } from '../../types/chart.types';
import { DynamicIndicatorCalculator } from '../../utils/dynamicIndicatorCalculator';
import { ActiveIndicator } from '../../types/indicator.types';
import './Chart.css';

interface ChartProps {
  data: OHLC[];
  volumeData?: VolumeData[];
  activeIndicators?: ActiveIndicator[];
  settings?: Partial<ChartSettings>;
  onDataUpdate?: (data: OHLC) => void;
  onCrosshairMove?: (tooltip: {
    data: OHLC | null;
    position: { x: number; y: number };
    isVisible: boolean;
  }) => void;
  onIndicatorData?: (dataOrUpdater: {
    [indicatorId: string]: { time: number; value: number; color: string; name: string }[]
  } | ((prev: {
    [indicatorId: string]: { time: number; value: number; color: string; name: string }[]
  }) => {
    [indicatorId: string]: { time: number; value: number; color: string; name: string }[]
  })) => void;
}

const Chart: React.FC<ChartProps> = ({ 
  data, 
  volumeData, 
  activeIndicators,
  settings,
  onDataUpdate,
  onCrosshairMove,
  onIndicatorData
}) => {
  const mainChartContainerRef = useRef<HTMLDivElement>(null);
  const mainChartRef = useRef<IChartApi | null>(null);
  const subChartsRef = useRef<Map<string, IChartApi>>(new Map());
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [subChartIndicators, setSubChartIndicators] = useState<ActiveIndicator[]>([]);
  const [isInitializing, setIsInitializing] = useState(false);
  const initTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Separate indicators by pane type
  useEffect(() => {
    if (activeIndicators) {
      const subIndicators = activeIndicators.filter(indicator => indicator.pane === 'sub');
      setSubChartIndicators(subIndicators);
    }
  }, [activeIndicators]);

  const createChartOptions = (isMainChart = true) => ({
    width: 800,
    height: isMainChart ? 400 : 150,
    layout: {
      background: {
        type: ColorType.Solid,
        color: settings?.theme === 'light' ? '#ffffff' : '#1e222d',
      },
      textColor: settings?.theme === 'light' ? '#191919' : '#d1d4dc',
    },
    grid: {
      vertLines: {
        visible: settings?.showGrid !== false,
        color: settings?.theme === 'light' 
          ? 'rgba(42, 46, 57, 0.1)' 
          : 'rgba(42, 46, 57, 0.5)',
      },
      horzLines: {
        visible: settings?.showGrid !== false,
        color: settings?.theme === 'light'
          ? 'rgba(42, 46, 57, 0.1)'
          : 'rgba(42, 46, 57, 0.5)',
      },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        width: 1 as any,
        color: 'rgba(224, 227, 235, 0.1)',
        style: LineStyle.Solid,
      },
      horzLine: {
        visible: true,
        labelVisible: true,
      },
    },
    rightPriceScale: {
      borderColor: 'rgba(197, 203, 206, 0.8)',
      visible: true,
    },
    timeScale: {
      borderColor: 'rgba(197, 203, 206, 0.8)',
      timeVisible: true,
      secondsVisible: false,
    },
  });

  // Safe chart removal function
  const safeRemoveChart = (chart: IChartApi | null, name: string) => {
    if (!chart) return;
    
    try {
      // Check if chart is already disposed
      if ((chart as any)._internal_disposed) {
        console.debug(`Chart ${name} already disposed`);
        return;
      }
      
      // Call custom cleanup if it exists (for sub-charts)
      if ((chart as any)._cleanup) {
        try {
          (chart as any)._cleanup();
        } catch (cleanupError) {
          console.debug(`Error during ${name} cleanup:`, cleanupError);
        }
      }
      
      // Stop any ongoing operations by clearing all series first
      try {
        const series = (chart as any).series?.();
        if (series && Array.isArray(series)) {
          series.forEach((s: any) => {
            try {
              chart.removeSeries(s);
            } catch (seriesError) {
              console.debug(`Error removing series from ${name}:`, seriesError);
            }
          });
        }
      } catch (seriesCleanupError) {
        console.debug(`Error cleaning up series for ${name}:`, seriesCleanupError);
      }
      
      // Final removal with additional safety checks
      setTimeout(() => {
        try {
          if (chart && !(chart as any)._internal_disposed) {
            chart.remove();
            console.debug(`Successfully removed chart: ${name}`);
          }
        } catch (finalError) {
          console.warn(`Final error removing ${name}:`, finalError);
        }
      }, 5);
      
    } catch (error) {
      console.warn(`Error removing ${name}:`, error);
    }
  };

  useEffect(() => {
    if (!mainChartContainerRef.current || isInitializing) return;

    // Clear any pending initialization
    if (initTimeoutRef.current) {
      clearTimeout(initTimeoutRef.current);
    }

    setIsInitializing(true);

    // Debounce chart creation to prevent rapid re-creation and allow cleanup to complete
    initTimeoutRef.current = setTimeout(() => {
      if (!mainChartContainerRef.current) {
        setIsInitializing(false);
        return;
      }

      // Clear existing charts safely with proper disposal sequence
      try {
        // First, clear all series references to stop any ongoing operations
        candlestickSeriesRef.current = null;
        volumeSeriesRef.current = null;
        
        // Clear sub-charts first
        subChartsRef.current.forEach((chart, id) => {
          safeRemoveChart(chart, `sub-chart ${id}`);
        });
        subChartsRef.current.clear();
        
        // Then clear main chart
        if (mainChartRef.current) {
          // Add a small delay to ensure any pending operations complete
          setTimeout(() => {
            safeRemoveChart(mainChartRef.current, 'main chart');
          }, 10);
        }
        mainChartRef.current = null;
        
      } catch (error) {
        console.warn('Error during chart cleanup:', error);
        mainChartRef.current = null;
        candlestickSeriesRef.current = null;
        volumeSeriesRef.current = null;
        subChartsRef.current.clear();
      }

      const handleResize = () => {
        if (mainChartRef.current && mainChartContainerRef.current) {
          mainChartRef.current.applyOptions({
            width: mainChartContainerRef.current.clientWidth,
            height: mainChartContainerRef.current.clientHeight,
          });
        }
        subChartsRef.current.forEach((chart, id) => {
          const container = document.getElementById(`sub-chart-${id}`);
          if (container) {
            chart.applyOptions({
              width: container.clientWidth,
              height: 150,
            });
          }
        });
      };

      try {
        // Create main chart
        const mainChart = createChart(mainChartContainerRef.current, {
          ...createChartOptions(true),
          width: mainChartContainerRef.current.clientWidth,
          height: mainChartContainerRef.current.clientHeight,
        });

        mainChartRef.current = mainChart;

        // Add candlestick series
        const candlestickSeries = mainChart.addCandlestickSeries({
          upColor: '#26a69a',
          downColor: '#ef5350',
          borderVisible: false,
          wickUpColor: '#26a69a',
          wickDownColor: '#ef5350',
        });
        candlestickSeriesRef.current = candlestickSeries;

        // Add volume series if enabled
        if (settings?.showVolume !== false && volumeData) {
          const volumeSeries = mainChart.addHistogramSeries({
            color: '#26a69a',
            priceFormat: {
              type: 'volume',
            },
            priceScaleId: '',
          });
          
          volumeSeries.priceScale().applyOptions({
            scaleMargins: {
              top: 0.8,
              bottom: 0,
            },
          });
          
          volumeSeriesRef.current = volumeSeries;
        }

        // Add main chart (overlay) indicators
        if (activeIndicators) {
          const mainIndicators = activeIndicators.filter(indicator => indicator.pane === 'main');
          const indicatorDataMap: { [indicatorId: string]: { time: number; value: number; color: string; name: string }[] } = {};
          
          const processingPromises = mainIndicators.map(async (activeIndicator) => {
            try {
              const indicatorSeries = await DynamicIndicatorCalculator.calculateIndicator(activeIndicator, data);
              
              indicatorSeries.forEach(series => {
                // Validate that series.data is an array
                if (!series.data || !Array.isArray(series.data)) {
                  console.warn(`Invalid data structure for overlay indicator ${activeIndicator.name}:`, series.data);
                  return;
                }
                
                // Validate and filter data
                const validData = series.data.filter(point => 
                  point && 
                  point.time !== undefined && 
                  point.time !== null && 
                  point.value !== undefined && 
                  point.value !== null && 
                  !isNaN(point.value)
                );
                
                if (validData.length === 0) {
                  console.warn(`No valid data for overlay indicator ${activeIndicator.name}`);
                  return;
                }
                
                const lineSeries = mainChart.addLineSeries({
                  color: series.color,
                  lineWidth: series.lineWidth as any,
                  title: series.name,
                });
                lineSeries.setData(validData as any);
                
                // Store indicator data for tooltip
                indicatorDataMap[activeIndicator.id] = validData.map(point => ({
                  time: point.time,
                  value: point.value,
                  color: series.color,
                  name: activeIndicator.name
                }));
              });
            } catch (error) {
              console.warn(`Error adding indicator ${activeIndicator.name}:`, error);
            }
          });
          
          // Wait for all indicators to be processed and send data
          Promise.all(processingPromises).then(() => {
            if (onIndicatorData && Object.keys(indicatorDataMap).length > 0) {
              onIndicatorData(prev => ({
                ...prev,
                ...indicatorDataMap
              }));
            }
          });
        }

        // Set main chart data
        if (data && data.length > 0) {
          candlestickSeries.setData(data as any);
          
          // Position chart at the last candle
          setTimeout(() => {
            try {
              if (mainChart && data.length > 20) {
                // Show the last 50-100 candles for better context
                const visibleRange = Math.min(100, Math.floor(data.length * 0.8));
                const fromIndex = Math.max(0, data.length - visibleRange);
                const toIndex = data.length - 1;
                
                mainChart.timeScale().setVisibleLogicalRange({
                  from: fromIndex,
                  to: toIndex
                });
              } else if (mainChart && data.length > 0) {
                // For small datasets, show all data
                mainChart.timeScale().fitContent();
              }
            } catch (error) {
              console.debug('Error positioning chart at last candle:', error);
            }
          }, 100);
          
          setIsLoading(false);
        }

        if (volumeData && volumeSeriesRef.current) {
          volumeSeriesRef.current.setData(volumeData as any);
        }

        // Handle resize
        window.addEventListener('resize', handleResize);

        // Add crosshair move handler for OHLC tooltip (only for main chart)
        if (onCrosshairMove) {
          const mainOnlyCrosshairHandler = (param: any) => {
            try {
              const seriesData = param.seriesData?.get(candlestickSeriesRef.current);
              if (seriesData && param.point) {
                onCrosshairMove({
                  data: seriesData,
                  position: { x: param.point.x, y: param.point.y },
                  isVisible: true
                });
              } else {
                onCrosshairMove({
                  data: null,
                  position: { x: 0, y: 0 },
                  isVisible: false
                });
              }
            } catch (error) {
              console.debug('Error handling crosshair move:', error);
            }
          };
          
          mainChart.subscribeCrosshairMove(mainOnlyCrosshairHandler);
        }

      } catch (error) {
        console.error('Error creating main chart:', error);
      }

      setIsInitializing(false);
    }, 250); // 250ms debounce to allow cleanup to complete

    // Cleanup
    return () => {
      // Cancel any pending initialization
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }
      setIsInitializing(false);
      
      // Remove event listeners
      window.removeEventListener('resize', () => {});
      
      // Cleanup charts with proper sequencing
      try {
        // Clear series references first
        candlestickSeriesRef.current = null;
        volumeSeriesRef.current = null;
        
        // Sub-charts first
        subChartsRef.current.forEach((chart, id) => {
          safeRemoveChart(chart, `sub-chart ${id} in cleanup`);
        });
        subChartsRef.current.clear();
        
        // Main chart last
        if (mainChartRef.current) {
          safeRemoveChart(mainChartRef.current, 'main chart in cleanup');
          mainChartRef.current = null;
        }
      } catch (cleanupError) {
        console.warn('Error during effect cleanup:', cleanupError);
        // Force clear references
        mainChartRef.current = null;
        candlestickSeriesRef.current = null;
        volumeSeriesRef.current = null;
        subChartsRef.current.clear();
      }
    };
  }, [data, volumeData, settings, activeIndicators]);

  // Create sub-charts for sub-pane indicators
  useEffect(() => {
    if (isInitializing) return;

    subChartIndicators.forEach(async (indicator) => {
      const containerId = `sub-chart-${indicator.id}`;
      const container = document.getElementById(containerId);
      
      if (container && !subChartsRef.current.has(indicator.id)) {
        try {
          const subChart = createChart(container, {
            ...createChartOptions(false),
            width: container.clientWidth,
          });

          subChartsRef.current.set(indicator.id, subChart);

          // Calculate and add indicator data
          const indicatorSeries = await DynamicIndicatorCalculator.calculateIndicator(indicator, data);
          
          indicatorSeries.forEach(series => {
            // Validate that series.data is an array
            if (!series.data || !Array.isArray(series.data)) {
              console.warn(`Invalid data structure for indicator ${indicator.name}:`, series.data);
              return;
            }
            
            // Validate and filter data
            const validData = series.data.filter(point => 
              point && 
              point.time !== undefined && 
              point.time !== null && 
              point.value !== undefined && 
              point.value !== null && 
              !isNaN(point.value)
            );
            
            if (validData.length === 0) {
              console.warn(`No valid data for indicator ${indicator.name}`);
              return;
            }
            
            const lineSeries = subChart.addLineSeries({
              color: series.color,
              lineWidth: series.lineWidth as any,
              title: series.name,
            });
            lineSeries.setData(validData as any);
            
            // Store indicator data for tooltip (sub-chart indicators)
            if (onIndicatorData) {
              onIndicatorData(prev => ({
                ...prev,
                [indicator.id]: validData.map(point => ({
                  time: point.time,
                  value: point.value,
                  color: series.color,
                  name: indicator.name
                }))
              }));
            }
          });

          // Position sub-chart at the same range as main chart
          setTimeout(() => {
            try {
              if (mainChartRef.current && data.length > 20) {
                // Get the same visible range as the main chart
                const visibleRange = Math.min(100, Math.floor(data.length * 0.8));
                const fromIndex = Math.max(0, data.length - visibleRange);
                const toIndex = data.length - 1;
                
                subChart.timeScale().setVisibleLogicalRange({
                  from: fromIndex,
                  to: toIndex
                });
              } else if (data.length > 0) {
                subChart.timeScale().fitContent();
              }
            } catch (error) {
              console.debug('Error positioning sub-chart:', error);
            }
          }, 150);

          // Sync time scale and crosshair with main chart
          if (mainChartRef.current) {
            const mainChart = mainChartRef.current;
            
            // Sync time scale changes
            const timeScaleHandler = (timeRange: any) => {
              try {
                if (timeRange && subChart && !(subChart as any)._internal_disposed) {
                  // Validate that the time range is reasonable for the data length
                  if (data && data.length > 1) {
                    subChart.timeScale().setVisibleRange(timeRange);
                  }
                }
              } catch (error) {
                console.debug('Time scale sync error (sub-chart may be disposed):', error);
              }
            };
            mainChart.timeScale().subscribeVisibleTimeRangeChange(timeScaleHandler);
            
            // Sync visible logical range changes (for zoom and navigation)
            let syncingRange = false;
            
            const logicalRangeHandler = (logicalRange: any) => {
              if (syncingRange || !logicalRange) return;
              syncingRange = true;
              try {
                if (subChart && !(subChart as any)._internal_disposed && data && data.length > 1) {
                  // Validate logical range before applying
                  if (logicalRange.from !== null && logicalRange.to !== null && 
                      logicalRange.from >= 0 && logicalRange.to >= logicalRange.from) {
                    subChart.timeScale().setVisibleLogicalRange(logicalRange);
                  }
                }
              } catch (error) {
                console.debug('Logical range sync error (sub-chart):', error);
              }
              setTimeout(() => { syncingRange = false; }, 0);
            };
            mainChart.timeScale().subscribeVisibleLogicalRangeChange(logicalRangeHandler);
            
            // Sync scroll position from sub-chart to main chart
            const subLogicalRangeHandler = (logicalRange: any) => {
              if (syncingRange || !logicalRange) return;
              syncingRange = true;
              try {
                if (mainChart && !(mainChart as any)._internal_disposed && data && data.length > 1) {
                  // Validate logical range before applying
                  if (logicalRange.from !== null && logicalRange.to !== null && 
                      logicalRange.from >= 0 && logicalRange.to >= logicalRange.from) {
                    mainChart.timeScale().setVisibleLogicalRange(logicalRange);
                  }
                }
              } catch (error) {
                console.debug('Logical range sync error (main-chart):', error);
              }
              setTimeout(() => { syncingRange = false; }, 0);
            };
            subChart.timeScale().subscribeVisibleLogicalRangeChange(subLogicalRangeHandler);
            
            // Enhanced crosshair synchronization
            let syncingCrosshair = false;
            
            const mainCrosshairHandler = (param: any) => {
              if (syncingCrosshair) return;
              syncingCrosshair = true;
              
              try {
                // Handle OHLC tooltip
                if (onCrosshairMove && param) {
                  const seriesData = param.seriesData?.get(candlestickSeriesRef.current);
                  if (seriesData && param.point) {
                    onCrosshairMove({
                      data: seriesData,
                      position: { x: param.point.x, y: param.point.y },
                      isVisible: true
                    });
                  } else {
                    onCrosshairMove({
                      data: null,
                      position: { x: 0, y: 0 },
                      isVisible: false
                    });
                  }
                }

                if (subChart && !(subChart as any)._internal_disposed) {
                  if (param.time !== undefined) {
                    // Try to move sub-chart crosshair to the same time
                    if ((subChart as any).setCrosshairPosition) {
                      (subChart as any).setCrosshairPosition(param.point?.x, param.point?.y, param.time);
                    }
                  } else {
                    // Clear crosshair on sub-chart when main chart crosshair is cleared
                    if ((subChart as any).clearCrosshairPosition) {
                      (subChart as any).clearCrosshairPosition();
                    }
                  }
                }
              } catch (error) {
                // Fallback: just ensure charts are synchronized without throwing errors
                console.debug('Crosshair sync fallback for sub-chart:', error);
              }
              
              setTimeout(() => { syncingCrosshair = false; }, 0);
            };
            
            const subCrosshairHandler = (param: any) => {
              if (syncingCrosshair) return;
              syncingCrosshair = true;
              
              try {
                if (mainChart && !(mainChart as any)._internal_disposed) {
                  if (param.time !== undefined) {
                    // Try to move main chart crosshair to the same time
                    if ((mainChart as any).setCrosshairPosition) {
                      (mainChart as any).setCrosshairPosition(param.point?.x, param.point?.y, param.time);
                    }
                  } else {
                    // Clear crosshair on main chart when sub-chart crosshair is cleared
                    if ((mainChart as any).clearCrosshairPosition) {
                      (mainChart as any).clearCrosshairPosition();
                    }
                  }
                }
              } catch (error) {
                // Fallback: just ensure charts are synchronized without throwing errors
                console.debug('Crosshair sync fallback for main chart:', error);
              }
              
              setTimeout(() => { syncingCrosshair = false; }, 0);
            };
            
            mainChart.subscribeCrosshairMove(mainCrosshairHandler);
            subChart.subscribeCrosshairMove(subCrosshairHandler);
            
            // Store cleanup functions for this sub-chart
            const cleanup = () => {
              try {
                if (mainChart && !(mainChart as any)._internal_disposed) {
                  mainChart.timeScale().unsubscribeVisibleTimeRangeChange(timeScaleHandler);
                  mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(logicalRangeHandler);
                  mainChart.unsubscribeCrosshairMove(mainCrosshairHandler);
                }
              } catch (error) {
                console.debug('Error cleaning up main chart subscriptions:', error);
              }
              
              try {
                if (subChart && !(subChart as any)._internal_disposed) {
                  subChart.timeScale().unsubscribeVisibleLogicalRangeChange(subLogicalRangeHandler);
                  subChart.unsubscribeCrosshairMove(subCrosshairHandler);
                }
              } catch (error) {
                console.debug('Error cleaning up sub-chart subscriptions:', error);
              }
            };
            
            // Store cleanup function for later use
            (subChart as any)._cleanup = cleanup;
          }
        } catch (error) {
          console.warn(`Error creating sub-chart for ${indicator.name}:`, error);
        }
      }
    });
  }, [subChartIndicators, data, isInitializing]);

  // Update data in real-time
  useEffect(() => {
    if (!candlestickSeriesRef.current || !data || data.length === 0) return;

    try {
      const lastData = data[data.length - 1];
      candlestickSeriesRef.current.update(lastData as any);

      if (volumeData && volumeSeriesRef.current && volumeData.length > 0) {
        const lastVolume = volumeData[volumeData.length - 1];
        volumeSeriesRef.current.update(lastVolume as any);
      }

      if (onDataUpdate) {
        onDataUpdate(lastData);
      }
    } catch (error) {
      console.warn('Error updating chart data:', error);
    }
  }, [data, volumeData, onDataUpdate]);

  return (
    <div className="chart-container">
      {isLoading && (
        <div className="chart-loading">
          <div className="loading-spinner"></div>
          <p>Loading chart...</p>
        </div>
      )}
      
      {/* Main Chart */}
      <div ref={mainChartContainerRef} className="main-chart-canvas" />
      
      {/* Sub Charts */}
      {subChartIndicators.map((indicator) => (
        <div key={indicator.id} className="sub-chart-container">
          <div className="sub-chart-header">
            <span className="sub-chart-title">{indicator.name}</span>
          </div>
          <div 
            id={`sub-chart-${indicator.id}`}
            className="sub-chart-canvas"
          />
        </div>
      ))}
    </div>
  );
};

export default Chart;