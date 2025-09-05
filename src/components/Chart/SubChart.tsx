import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import {
  createChart,
  IChartApi,
  ColorType,
  CrosshairMode,
  LineStyle
} from 'lightweight-charts';
import { OHLC, ChartSettings, VolumeData } from '../../types/chart.types';
import { DynamicIndicatorCalculator } from '../../utils/dynamicIndicatorCalculator';
import { ActiveIndicator } from '../../types/indicator.types';

interface SubChartProps {
  data: OHLC[];
  activeIndicators?: ActiveIndicator[];
  settings?: Partial<ChartSettings>;
  onIndicatorData?: (dataOrUpdater: {
    [indicatorId: string]: { time: number; value: number; color: string; name: string }[]
  }) => void;
  fullDataForIndicators?: { data: OHLC[], volumeData: VolumeData[] } | null;
  timeScaleRange?: any;
  onChartReady?: (chart: IChartApi) => void;
  onChartRemoved?: () => void;
}

const SubChart: React.FC<SubChartProps> = ({
  data,
  activeIndicators,
  settings,
  onIndicatorData,
  fullDataForIndicators,
  timeScaleRange,
  onChartReady,
  onChartRemoved
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const indicatorSeriesMap = useRef<Map<string, { series: any, data: any[], color: string, name: string, baseIndicator: ActiveIndicator }>>(new Map());
  const chartInitialized = useRef<boolean>(false);
  const syncingRef = useRef<boolean>(false);

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
    height: 120,
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

  // Don't render if no sub indicators - memoize to prevent unnecessary recalculations
  const subPaneIndicators = useMemo(() => {
    return activeIndicators?.filter(ind => ind.pane === 'sub') || [];
  }, [activeIndicators?.length, activeIndicators?.map(ind => ind.id + ind.pane).join(',')]);
  
  // Process indicators function - memoized to prevent recreation
  const processIndicators = useCallback(async () => {
    if (!chartRef.current || !subPaneIndicators.length) {
      return;
    }

    // Clear existing series first to prevent duplicates
    indicatorSeriesMap.current.forEach((seriesData) => {
      try {
        chartRef.current?.removeSeries(seriesData.series);
      } catch (error) {
        // Ignore removal errors
      }
    });
    indicatorSeriesMap.current.clear();
    
    for (const activeIndicator of subPaneIndicators) {
      try {
        const dataForCalculation = fullDataForIndicators?.data || data;
        const indicatorSeries = await DynamicIndicatorCalculator.calculateIndicator(activeIndicator, dataForCalculation);
        
        indicatorSeries.forEach(series => {
          if (!series.data || !Array.isArray(series.data) || series.data.length === 0) {
            return;
          }
          
          const validData = series.data.filter(point => 
            point && 
            point.time !== undefined && 
            point.time !== null && 
            point.value !== undefined && 
            point.value !== null && 
            typeof point.value === 'number' &&
            !isNaN(point.value)
          );
          
          if (validData.length === 0) {
            return;
          }

          // Add appropriate series type based on indicator output
          let chartSeries: any;
          if (series.type === 'histogram') {
            chartSeries = chartRef.current!.addHistogramSeries({
              color: series.color,
              title: series.name,
            });
          } else {
            chartSeries = chartRef.current!.addLineSeries({
              color: series.color,
              lineWidth: series.lineWidth as any,
              title: series.name,
            });
          }
          
          // Use all valid indicator data - no temporal filtering to maintain alignment
          const dataToUse = validData;
          
          // Handle histogram data with colors
          if (series.type === 'histogram') {
            const histogramData = dataToUse
              .filter(point => point.value !== null && point.value !== undefined) // Remove null/undefined values for histogram
              .map(point => ({
                ...point,
                color: (point.value || 0) >= 0 ? '#22c55e' : '#ef4444'
              }));
            chartSeries.setData(histogramData as any);
          } else {
            const lineData = dataToUse.filter(point => point.value !== null && point.value !== undefined); // Remove null/undefined values for line series
            chartSeries.setData(lineData as any);
          }
          
          indicatorSeriesMap.current.set(series.id, {
            series: chartSeries,
            data: dataToUse,
            color: series.color,
            name: series.name,
            baseIndicator: activeIndicator
          });
        });
      } catch (error) {
        console.warn(`Error processing indicator ${activeIndicator.name}:`, error);
      }
    }
  }, [subPaneIndicators, data, fullDataForIndicators]);
  
  // Sub chart initialization
  useEffect(() => {
    if (!chartContainerRef.current || !data || data.length === 0 || subPaneIndicators.length === 0) {
      return;
    }

    const chart = createChart(chartContainerRef.current, {
      ...createChartOptions(),
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
    });

    chartRef.current = chart;

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

    // No time scale sync needed

    // Only add crosshair handler if tooltip callback is provided
    if (onIndicatorData) {
      const crosshairHandler = (param: any) => {
        if (param && param.time !== undefined) {
          updateIndicatorTooltipData(param.time);
        }
      };
      chart.subscribeCrosshairMove(crosshairHandler);
    }

    chartInitialized.current = true;
    
    // Notify parent about chart ready
    if (onChartReady) {
      onChartReady(chart);
    }

    // Trigger indicator processing after chart is ready
    setTimeout(() => {
      if (subPaneIndicators.length > 0 && chartRef.current) {
        processIndicators();
      }
    }, 100);

    return () => {
      if (onChartRemoved) {
        onChartRemoved();
      }
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      chartInitialized.current = false;
    };
  }, [data?.length, settings, subPaneIndicators.length]);

  // Sync time scale from main chart (unidirectional only)
  useEffect(() => {
    if (!chartRef.current || !timeScaleRange || syncingRef.current) return;
    
    syncingRef.current = true;
    try {
      chartRef.current.timeScale().setVisibleLogicalRange(timeScaleRange);
    } catch (error) {
      console.debug('Error syncing time scale to sub chart:', error);
    } finally {
      syncingRef.current = false;
    }
  }, [timeScaleRange]);

  // Handle indicators when activeIndicators change - use memoized indicators
  useEffect(() => {
    if (chartInitialized.current && chartRef.current && subPaneIndicators.length > 0) {
      console.log('[SubChart] Active indicators changed, processing...');
      processIndicators();
    }
  }, [subPaneIndicators.length, subPaneIndicators.map(ind => ind.id).join(',')]);

  // Don't render if no sub indicators
  if (subPaneIndicators.length === 0) {
    return null;
  }

  return (
    <div style={{ width: '100%', height: '120px' }}>
      <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

export default SubChart;