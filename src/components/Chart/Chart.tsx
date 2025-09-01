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
  const subChartsRef = useRef<Map<string, IChartApi>>(new Map());
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [subChartIndicators, setSubChartIndicators] = useState<ActiveIndicator[]>([]);
  const [isInitializing, setIsInitializing] = useState(false);
  const initTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isDisposed = useRef<boolean>(false);
  const indicatorSeriesMap = useRef<Map<string, { series: any, data: any[], color: string, name: string, baseIndicator: ActiveIndicator }>>(new Map());
  const subChartTooltips = useRef<Map<string, HTMLDivElement>>(new Map());

  const updateIndicatorTooltipData = (time: number, paneType: 'main' | 'sub' = 'main') => {
    if (!onIndicatorData) return;
    
    const tooltipData: { [indicatorId: string]: { time: number; value: number; color: string; name: string }[] } = {};
    
    // Group series by base indicator, filtered by pane type
    const indicatorGroups = new Map<string, { time: number; value: number; color: string; name: string }[]>();
    
    // Iterate through all series stored in the map
    indicatorSeriesMap.current.forEach(({ data, color, name, baseIndicator }) => {
      // Only include indicators from the specified pane
      if (baseIndicator.pane !== paneType) return;
      
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
    
    // Update the tooltip data if we have any (only for main pane)
    if (paneType === 'main' && Object.keys(tooltipData).length > 0) {
      onIndicatorData(tooltipData);
    }
    
    // For sub-charts, we'll handle tooltips differently (individual tooltips per chart)
    return tooltipData;
  };

  const updateSubChartTooltip = (indicatorId: string, time: number, param: any) => {
    const tooltipData = updateIndicatorTooltipData(time, 'sub');
    if (!tooltipData) return;
    
    const indicatorData = tooltipData[indicatorId];
    
    if (!indicatorData || indicatorData.length === 0) {
      // Hide tooltip if no data
      const tooltip = subChartTooltips.current.get(indicatorId);
      if (tooltip) {
        tooltip.style.display = 'none';
      }
      return;
    }

    // Get or create tooltip element
    let tooltip = subChartTooltips.current.get(indicatorId);
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.style.cssText = `
        position: absolute;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 8px;
        border-radius: 4px;
        font-size: 12px;
        pointer-events: none;
        z-index: 1000;
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        max-width: 250px;
      `;
      document.body.appendChild(tooltip);
      subChartTooltips.current.set(indicatorId, tooltip);
    }

    // Build tooltip content
    const lines = indicatorData.map(item => 
      `<div style="color: ${item.color}; margin: 2px 0;">
        <strong>${item.name}:</strong> ${item.value.toFixed(4)}
      </div>`
    ).join('');

    tooltip.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 4px; color: #fff;">
        ${indicatorData[0]?.name?.split('(')[0] || 'Indicator'}
      </div>
      ${lines}
    `;

    // Position tooltip near mouse
    if (param.point) {
      const rect = document.getElementById(`sub-chart-${indicatorId}`)?.getBoundingClientRect();
      if (rect) {
        tooltip.style.left = `${rect.left + param.point.x + 10}px`;
        tooltip.style.top = `${rect.top + param.point.y - 10}px`;
        tooltip.style.display = 'block';
      }
    }
  };

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

    setIsInitializing(true);
    initTimeoutRef.current = setTimeout(() => {
      if (!mainChartContainerRef.current) {
        setIsInitializing(false);
        return;
      }
      
      // Reset disposal flag - we're creating a new chart
      isDisposed.current = false;

      // Clear indicator series map for fresh start
      indicatorSeriesMap.current.clear();

      // Clean up existing sub-chart tooltips
      subChartTooltips.current.forEach((tooltip) => {
        try {
          if (tooltip.parentNode) {
            document.body.removeChild(tooltip);
          }
        } catch (error) {
          console.debug('Error removing tooltip:', error);
        }
      });
      subChartTooltips.current.clear();

      // Clear existing charts
      if (mainChartRef.current) {
        safeRemoveChart(mainChartRef.current, 'main chart');
        mainChartRef.current = null;
      }
      subChartsRef.current.forEach((chart, id) => {
        safeRemoveChart(chart, `sub-chart ${id}`);
      });
      subChartsRef.current.clear();
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;

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
          
          const processingPromises = mainIndicators.map(async (activeIndicator) => {
            try {
              // Use full data for indicator calculations if available, fallback to visible data
              const dataForCalculation = fullDataForIndicators?.data || data;
              const indicatorSeries = await DynamicIndicatorCalculator.calculateIndicator(activeIndicator, dataForCalculation);
              
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
                
                // Filter indicator data to match visible chart data range
                const firstVisibleTime = data[0]?.time || 0;
                const lastVisibleTime = data[data.length - 1]?.time || 0;
                
                const visibleIndicatorData = validData.filter(point => 
                  point.time >= firstVisibleTime && point.time <= lastVisibleTime
                );
                
                // Only add to chart if there's visible data
                const dataToUse = visibleIndicatorData.length > 0 ? visibleIndicatorData : validData;
                lineSeries.setData(dataToUse as any);
                
                // Store each series individually for generic tooltip handling
                indicatorSeriesMap.current.set(series.id, {
                  series: lineSeries,
                  data: dataToUse,
                  color: series.color,
                  name: series.name,
                  baseIndicator: activeIndicator
                });
              });
            } catch (error) {
              console.warn(`Error adding indicator ${activeIndicator.name}:`, error);
            }
          });
          
          // Wait for all indicators to be processed
          Promise.all(processingPromises).then(() => {
            console.log('All main indicators processed and stored for tooltip handling');
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

          // Calculate and add indicator data - use full data if available
          const dataForCalculation = fullDataForIndicators?.data || data;
          const indicatorSeries = await DynamicIndicatorCalculator.calculateIndicator(indicator, dataForCalculation);
          
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
            // Filter indicator data to match visible chart data range
            const firstVisibleTime = data[0]?.time || 0;
            const lastVisibleTime = data[data.length - 1]?.time || 0;
            
            const visibleIndicatorData = validData.filter(point => 
              point.time >= firstVisibleTime && point.time <= lastVisibleTime
            );
            
            // Use visible data if available, otherwise use all valid data
            const dataToDisplay = visibleIndicatorData.length > 0 ? visibleIndicatorData : validData;
            lineSeries.setData(dataToDisplay as any);
            
            // Store each series individually for generic tooltip handling
            indicatorSeriesMap.current.set(series.id, {
              series: lineSeries,
              data: dataToDisplay,
              color: series.color,
              name: series.name,
              baseIndicator: indicator
            });
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
                
                // Position cursor/crosshair on the last candle for sub-chart
                setTimeout(() => {
                  try {
                    if (subChart && !(subChart as any)._internal_disposed && data.length > 0) {
                      subChart.timeScale().scrollToPosition(0, false);
                    }
                  } catch (error) {
                    console.debug('Error positioning sub-chart crosshair on last candle:', error);
                  }
                }, 200);
              } else if (data.length > 0) {
                subChart.timeScale().fitContent();
                
                // Position cursor/crosshair on the last candle for small sub-chart datasets
                setTimeout(() => {
                  try {
                    if (subChart && !(subChart as any)._internal_disposed && data.length > 0) {
                      subChart.timeScale().scrollToPosition(0, false);
                    }
                  } catch (error) {
                    console.debug('Error positioning sub-chart crosshair on last candle (small dataset):', error);
                  }
                }, 200);
              }
            } catch (error) {
              console.debug('Error positioning sub-chart:', error);
            }
          }, 150);

          // Add individual tooltip handler for this sub-chart
          const subChartCrosshairHandler = (param: any) => {
            if (param && param.time !== undefined) {
              updateSubChartTooltip(indicator.id, param.time, param);
            } else {
              // Hide tooltip when crosshair is not visible
              const tooltip = subChartTooltips.current.get(indicator.id);
              if (tooltip) {
                tooltip.style.display = 'none';
              }
            }
          };
          subChart.subscribeCrosshairMove(subChartCrosshairHandler);

          // Store cleanup function for this sub-chart
          (subChart as any)._cleanup = () => {
            try {
              subChart.unsubscribeCrosshairMove(subChartCrosshairHandler);
              // Remove tooltip element
              const tooltip = subChartTooltips.current.get(indicator.id);
              if (tooltip) {
                document.body.removeChild(tooltip);
                subChartTooltips.current.delete(indicator.id);
              }
            } catch (error) {
              console.debug('Error cleaning up sub-chart tooltip:', error);
            }
          };

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

                // Handle indicator tooltips generically (only main pane indicators)
                if (onIndicatorData && param && param.time !== undefined) {
                  updateIndicatorTooltipData(param.time, 'main');
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
                // Sub-charts will have their own individual tooltips (implemented separately)
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