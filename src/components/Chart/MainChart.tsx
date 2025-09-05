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

interface MainChartProps {
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
  }) => void;
  fullDataForIndicators?: { data: OHLC[], volumeData: VolumeData[] } | null;
  onTimeScaleChange?: (range: any) => void;
  onChartReady?: (chart: IChartApi) => void;
}

const MainChart: React.FC<MainChartProps> = ({
  data,
  volumeData,
  activeIndicators,
  settings,
  onDataUpdate,
  onCrosshairMove,
  onIndicatorData,
  fullDataForIndicators,
  onTimeScaleChange,
  onChartReady
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const indicatorSeriesMap = useRef<Map<string, { series: any, data: any[], color: string, name: string, baseIndicator: ActiveIndicator }>>(new Map());
  const [renderedIndicators, setRenderedIndicators] = useState<Set<string>>(new Set());
  const chartInitialized = useRef<boolean>(false);

  const updateIndicatorTooltipData = (time: number) => {
    if (!onIndicatorData) return;
    
    const tooltipData: { [indicatorId: string]: { time: number; value: number; color: string; name: string }[] } = {};
    const indicatorGroups = new Map<string, { time: number; value: number; color: string; name: string }[]>();
    
    indicatorSeriesMap.current.forEach(({ data, color, name, baseIndicator }) => {
      if (data) {
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
    
    indicatorGroups.forEach((seriesData, indicatorId) => {
      if (seriesData.length > 0) {
        tooltipData[indicatorId] = seriesData;
      }
    });
    
    if (Object.keys(tooltipData).length > 0) {
      onIndicatorData(tooltipData);
    }
  };

  const createChartOptions = () => ({
    width: 800,
    height: 400,
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

  // Main chart initialization
  useEffect(() => {
    if (!chartContainerRef.current || !data || data.length === 0) return;

    const chart = createChart(chartContainerRef.current, {
      ...createChartOptions(),
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
    });

    chartRef.current = chart;

    // Add candlestick series
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    candlestickSeriesRef.current = candlestickSeries;

    // Add volume series if enabled
    if (settings?.showVolume !== false && volumeData) {
      const volumeSeries = chart.addHistogramSeries({
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
      volumeSeries.setData(volumeData as any);
    }

    // Set data
    candlestickSeries.setData(data as any);

    // Handle resize
    const handleResize = () => {
      if (chart && chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener('resize', handleResize);

    // Time scale change handler
    const timeScaleHandler = () => {
      if (onTimeScaleChange) {
        const range = chart.timeScale().getVisibleLogicalRange();
        onTimeScaleChange(range);
      }
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(timeScaleHandler);

    // Simple crosshair handler - only for OHLC tooltip and main chart indicators
    const crosshairHandler = (param: any) => {
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

      if (onIndicatorData && param && param.time !== undefined) {
        updateIndicatorTooltipData(param.time);
      }
    };
    chart.subscribeCrosshairMove(crosshairHandler);

    chartInitialized.current = true;
    setIsLoading(false);

    // Process indicators after chart is fully initialized
    setTimeout(() => {
      if (activeIndicators && activeIndicators.length > 0) {
        console.log('[MainChart] Triggering indicator processing after chart ready');
        setRenderedIndicators(new Set()); // Reset to trigger indicator processing
      }
    }, 100);

    if (onChartReady) {
      onChartReady(chart);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      chartInitialized.current = false;
    };
  }, [data, volumeData, settings]);

  // Handle main pane indicators
  useEffect(() => {
    console.log('[MainChart] Processing indicators...', {
      chartInitialized: chartInitialized.current,
      activeIndicators: activeIndicators?.length,
      chartRef: !!chartRef.current
    });
    
    if (!chartInitialized.current || !activeIndicators || !chartRef.current) {
      console.log('[MainChart] Skipping indicator processing - not ready');
      return;
    }

    const mainPaneIndicators = activeIndicators.filter(indicator => indicator.pane === 'main');
    const currentIndicatorIds = new Set(mainPaneIndicators.map(ind => ind.id));
    const previousIndicatorIds = renderedIndicators;
    
    console.log('[MainChart] Indicator processing:', {
      mainPaneIndicators: mainPaneIndicators.length,
      currentIds: Array.from(currentIndicatorIds),
      previousIds: Array.from(previousIndicatorIds)
    });

    // Remove indicators
    const indicatorIdsToRemove = Array.from(previousIndicatorIds).filter(id => 
      !currentIndicatorIds.has(id)
    );

    indicatorIdsToRemove.forEach(indicatorId => {
      const seriesToRemove: string[] = [];
      indicatorSeriesMap.current.forEach((seriesData, seriesId) => {
        if (seriesData.baseIndicator.id === indicatorId) {
          seriesToRemove.push(seriesId);
          try {
            chartRef.current?.removeSeries(seriesData.series);
          } catch (error) {
            console.warn(`Error removing series ${seriesId}:`, error);
          }
        }
      });
      
      seriesToRemove.forEach(seriesId => {
        indicatorSeriesMap.current.delete(seriesId);
      });
    });

    // Add new indicators
    const indicatorsToAdd = mainPaneIndicators.filter(indicator => 
      !previousIndicatorIds.has(indicator.id)
    );

    if (indicatorsToAdd.length > 0) {
      console.log('[MainChart] Adding indicators:', indicatorsToAdd.map(ind => ind.name));
      const addIndicatorPromises = indicatorsToAdd.map(async (activeIndicator) => {
        try {
          const dataForCalculation = fullDataForIndicators?.data || data;
          const indicatorSeries = await DynamicIndicatorCalculator.calculateIndicator(activeIndicator, dataForCalculation);
          
          indicatorSeries.forEach(series => {
            if (!series.data || !Array.isArray(series.data)) {
              return;
            }
            
            const validData = series.data.filter(point => 
              point && 
              point.time !== undefined && 
              point.time !== null && 
              point.value !== undefined && 
              point.value !== null && 
              !isNaN(point.value)
            );
            
            if (validData.length === 0) {
              return;
            }
            
            const lineSeries = chartRef.current!.addLineSeries({
              color: series.color,
              lineWidth: series.lineWidth as any,
              title: series.name,
            });
            
            const firstVisibleTime = data[0]?.time || 0;
            const lastVisibleTime = data[data.length - 1]?.time || 0;
            
            const visibleIndicatorData = validData.filter(point => 
              point.time >= firstVisibleTime && point.time <= lastVisibleTime
            );
            
            const dataToUse = visibleIndicatorData.length > 0 ? visibleIndicatorData : validData;
            lineSeries.setData(dataToUse as any);
            
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
      
      Promise.all(addIndicatorPromises);
    }

    setRenderedIndicators(new Set(currentIndicatorIds));
  }, [activeIndicators, data, fullDataForIndicators]);

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
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          color: '#d1d4dc',
          zIndex: 10
        }}>
          <div style={{
            border: '4px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '50%',
            borderTop: '4px solid #2962ff',
            width: '40px',
            height: '40px',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 20px'
          }} />
          <p>Loading chart...</p>
        </div>
      )}
      <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

export default MainChart;