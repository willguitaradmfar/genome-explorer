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
  fullDataForIndicators?: { data: OHLC[], volumeData: VolumeData[] } | null;
  onChartReady?: (chartMethods: any) => void;
}

const Chart: React.FC<ChartProps> = ({ 
  data, 
  volumeData, 
  activeIndicators,
  settings,
  onDataUpdate,
  onCrosshairMove,
  onIndicatorData,
  fullDataForIndicators,
  onChartReady
}) => {
  const mainChartContainerRef = useRef<HTMLDivElement>(null);
  const mainChartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const initTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isDisposed = useRef<boolean>(false);
  const indicatorSeriesMap = useRef<Map<string, { series: any, data: any[], color: string, name: string, baseIndicator: ActiveIndicator }>>(new Map());
  const [renderedIndicators, setRenderedIndicators] = useState<Set<string>>(new Set());
  const chartInitialized = useRef<boolean>(false);

  const updateIndicatorTooltipData = (time: number) => {
    if (!onIndicatorData) return;
    
    const tooltipData: { [indicatorId: string]: { time: number; value: number; color: string; name: string }[] } = {};
    
    // Group series by base indicator (only main pane indicators)
    const indicatorGroups = new Map<string, { time: number; value: number; color: string; name: string }[]>();
    
    // Iterate through all series stored in the map
    indicatorSeriesMap.current.forEach(({ data, color, name, baseIndicator }) => {
      // Only include main pane indicators
      if (baseIndicator.pane !== 'main') return;
      
      if (data) {
        // Find the data point closest to the given time
        const dataPoint = data.find((point: any) => point.time === time);
        if (dataPoint && dataPoint.value !== undefined) {
          const baseId = baseIndicator.id;
          
          if (!indicatorGroups.has(baseId)) {
            indicatorGroups.set(baseId, []);
          }
          
          indicatorGroups.get(baseId)!.push({
            time: dataPoint.time,
            value: dataPoint.value,
            color: color,
            name: name
          });
        }
      }
    });
    
    // Convert grouped data to tooltip format
    indicatorGroups.forEach((seriesData, indicatorId) => {
      if (seriesData.length > 0) {
        tooltipData[indicatorId] = seriesData;
      }
    });
    
    // Update the tooltip data
    if (Object.keys(tooltipData).length > 0) {
      onIndicatorData(tooltipData);
    }
  };



  // Incremental indicator management - add/remove individual indicators without full chart recreation
  useEffect(() => {
    if (!chartInitialized.current || !activeIndicators || !mainChartRef.current) {
      return;
    }

    // Filter only main pane indicators
    const mainPaneIndicators = activeIndicators.filter(indicator => indicator.pane === 'main');
    const currentIndicatorIds = new Set(mainPaneIndicators.map(ind => ind.id));
    const previousIndicatorIds = renderedIndicators;

    // Find indicators to add (new ones)
    const indicatorsToAdd = mainPaneIndicators.filter(indicator => 
      !previousIndicatorIds.has(indicator.id)
    );
    
    // Find indicators to remove (no longer active)
    const indicatorIdsToRemove = Array.from(previousIndicatorIds).filter(id => 
      !currentIndicatorIds.has(id)
    );

    // Remove indicators that are no longer active
    indicatorIdsToRemove.forEach(indicatorId => {
      console.log(`[Chart] Removing indicator layer: ${indicatorId}`);
      
      // Find all series belonging to this indicator and remove them
      const seriesToRemove: string[] = [];
      indicatorSeriesMap.current.forEach((seriesData, seriesId) => {
        if (seriesData.baseIndicator.id === indicatorId) {
          seriesToRemove.push(seriesId);
          try {
            mainChartRef.current?.removeSeries(seriesData.series);
            console.log(`[Chart] Removed series ${seriesId} from indicator ${indicatorId}`);
          } catch (error) {
            console.warn(`[Chart] Error removing series ${seriesId}:`, error);
          }
        }
      });
      
      // Clean up series data from map
      seriesToRemove.forEach(seriesId => {
        indicatorSeriesMap.current.delete(seriesId);
      });
    });

    // Add new indicators as layers
    if (indicatorsToAdd.length > 0) {
      console.log(`[Chart] Adding ${indicatorsToAdd.length} new indicator layers`);
      
      const addIndicatorPromises = indicatorsToAdd.map(async (activeIndicator) => {
        try {
          console.log(`[Chart] Adding indicator layer: ${activeIndicator.name} (${activeIndicator.id})`);
          
          // Use full data for indicator calculations if available, fallback to visible data
          const dataForCalculation = fullDataForIndicators?.data || data;
          const indicatorSeries = await DynamicIndicatorCalculator.calculateIndicator(activeIndicator, dataForCalculation);
          
          indicatorSeries.forEach(series => {
            // Validate that series.data is an array
            if (!series.data || !Array.isArray(series.data)) {
              console.warn(`[Chart] Invalid data structure for indicator ${activeIndicator.name}:`, series.data);
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
              console.warn(`[Chart] No valid data for indicator ${activeIndicator.name}`);
              return;
            }
            
            // Add line series to existing chart as a new layer
            const lineSeries = mainChartRef.current!.addLineSeries({
              color: series.color,
              lineWidth: series.lineWidth as any,
              title: series.name,
            });
            
            // Filter indicator data to match visible chart data range
            const firstVisibleTime = data[0]?.time || 0;
            const lastVisibleTime = data[data.length - 1]?.time || 0;
            
            const visibleIndicatorData = validData.filter(point => 
              point.time >= firstVisibleTime && point.time <= lastVisibleTime
            );
            
            // Only add to chart if there's visible data
            const dataToUse = visibleIndicatorData.length > 0 ? visibleIndicatorData : validData;
            lineSeries.setData(dataToUse as any);
            
            // Store series for tooltip handling
            indicatorSeriesMap.current.set(series.id, {
              series: lineSeries,
              data: dataToUse,
              color: series.color,
              name: series.name,
              baseIndicator: activeIndicator
            });
            
            console.log(`[Chart] Successfully added indicator series: ${series.name}`);
          });
        } catch (error) {
          console.warn(`[Chart] Error adding indicator ${activeIndicator.name}:`, error);
        }
      });
      
      // Wait for all new indicators to be processed
      Promise.all(addIndicatorPromises).then(() => {
        console.log(`[Chart] All new indicator layers added successfully`);
      });
    }

    // Update the rendered indicators set
    setRenderedIndicators(new Set(currentIndicatorIds));
  }, [activeIndicators, data, fullDataForIndicators]);

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

  const safeRemoveChart = (chart: IChartApi | null, name: string) => {
    if (!chart) return;
    
    try {
      console.debug(`Removing chart: ${name}`);
      isDisposed.current = true;
      chart.remove();
    } catch (error) {
      console.debug(`Error removing ${name}:`, error);
      isDisposed.current = true;
    }
  };




  useEffect(() => {
    if (!mainChartContainerRef.current || !data || data.length === 0) return;

    initTimeoutRef.current = setTimeout(() => {
      if (!mainChartContainerRef.current) {
        return;
      }
      
      // Reset disposal flag - we're creating a new chart
      isDisposed.current = false;
      chartInitialized.current = false;

      // Clear indicator series map for fresh start
      indicatorSeriesMap.current.clear();
      setRenderedIndicators(new Set());

      // Clear existing charts
      if (mainChartRef.current) {
        safeRemoveChart(mainChartRef.current, 'main chart');
        mainChartRef.current = null;
      }
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;

      const handleResize = () => {
        if (mainChartRef.current && mainChartContainerRef.current) {
          mainChartRef.current.applyOptions({
            width: mainChartContainerRef.current.clientWidth,
            height: mainChartContainerRef.current.clientHeight,
          });
        }
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

        // Mark chart as initialized so incremental indicator system can take over
        chartInitialized.current = true;
        
        // Initial indicators will be handled by the incremental system in the next effect cycle
        // This prevents duplication and ensures consistent behavior

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
                
                // Position cursor/crosshair on the last candle
                setTimeout(() => {
                  try {
                    if (mainChart && data.length > 0) {
                      // Set crosshair position to the last candle
                      mainChart.timeScale().scrollToPosition(0, false); // Scroll to rightmost position
                    }
                  } catch (error) {
                    console.debug('Error positioning crosshair on last candle:', error);
                  }
                }, 150);
              } else if (mainChart && data.length > 0) {
                // For small datasets, show all data
                mainChart.timeScale().fitContent();
                
                // Position cursor/crosshair on the last candle for small datasets too
                setTimeout(() => {
                  try {
                    if (mainChart && data.length > 0) {
                      mainChart.timeScale().scrollToPosition(0, false); // Scroll to rightmost position
                    }
                  } catch (error) {
                    console.debug('Error positioning crosshair on last candle (small dataset):', error);
                  }
                }, 150);
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

        // Add crosshair move handler for OHLC tooltip and indicator tooltips
        if (onCrosshairMove || onIndicatorData) {
          const crosshairHandler = (param: any) => {
            try {
              // Handle OHLC tooltip
              if (onCrosshairMove) {
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

              // Handle indicator tooltips
              if (onIndicatorData && param && param.time !== undefined) {
                updateIndicatorTooltipData(param.time);
              }
            } catch (error) {
              console.debug('Error handling crosshair move:', error);
            }
          };
          
          mainChart.subscribeCrosshairMove(crosshairHandler);
        }


      } catch (error) {
        console.error('Error creating main chart:', error);
      }

      
      // Setup chart methods for external use
      if (onChartReady) {
        onChartReady({
          // Chart API methods (if needed)
        });
      }
    }, 250); // 250ms debounce to allow cleanup to complete

    // Cleanup
    return () => {
      // Mark as disposed
      isDisposed.current = true;
      
      // Cancel any pending initialization
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }
      
      // Remove event listeners
      window.removeEventListener('resize', () => {});
      
      // Cleanup charts with proper sequencing
      try {
        // Clear series references first
        candlestickSeriesRef.current = null;
        volumeSeriesRef.current = null;
        
        // Main chart cleanup
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
      }
    };
  }, [data, volumeData, settings]);



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
    </div>
  );
};

export default Chart;