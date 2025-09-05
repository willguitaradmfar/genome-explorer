import React, { useState, useRef } from 'react';
import { IChartApi } from 'lightweight-charts';
import { OHLC, ChartSettings, VolumeData } from '../../types/chart.types';
import { ActiveIndicator } from '../../types/indicator.types';
import MainChart from './MainChart';
import SubChart from './SubChart';
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
  const [timeScaleRange, setTimeScaleRange] = useState<any>(null);
  const subChartsRef = useRef<Map<string, IChartApi>>(new Map());
  const mainChartRef = useRef<IChartApi | null>(null);
  const mainChartContainerRef = useRef<HTMLDivElement>(null);

  // Get sub-pane indicators (each will get its own chart)
  const subPaneIndicators = activeIndicators?.filter(ind => ind.pane === 'sub') || [];
  const mainPaneIndicators = activeIndicators?.filter(ind => ind.pane === 'main') || [];

  const handleTimeScaleChange = (range: any) => {
    setTimeScaleRange(range);
  };

  const handleMainChartReady = (chart: IChartApi) => {
    mainChartRef.current = chart;
    if (onChartReady) {
      onChartReady({});
    }
  };

  const handleSubChartReady = (indicatorId: string, chart: IChartApi) => {
    subChartsRef.current.set(indicatorId, chart);
    
    // Force main chart to resize when a subchart is added
    setTimeout(() => {
      if (mainChartRef.current && mainChartContainerRef.current) {
        mainChartRef.current.applyOptions({
          width: mainChartContainerRef.current.clientWidth,
          height: mainChartContainerRef.current.clientHeight,
        });
      }
    }, 100);
  };

  const handleSubChartRemoved = (indicatorId: string) => {
    subChartsRef.current.delete(indicatorId);
    
    // Force main chart to resize when a subchart is removed
    setTimeout(() => {
      if (mainChartRef.current && mainChartContainerRef.current) {
        mainChartRef.current.applyOptions({
          width: mainChartContainerRef.current.clientWidth,
          height: mainChartContainerRef.current.clientHeight,
        });
      }
    }, 100);
  };

  // Force main chart resize when number of subcharts changes
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (mainChartRef.current && mainChartContainerRef.current) {
        mainChartRef.current.applyOptions({
          width: mainChartContainerRef.current.clientWidth,
          height: mainChartContainerRef.current.clientHeight,
        });
      }
    }, 200); // Longer delay to ensure DOM has updated

    return () => clearTimeout(timer);
  }, [subPaneIndicators.length]);

  const handleIndicatorDataUpdate = (newData: {
    [indicatorId: string]: { time: number; value: number; color: string; name: string }[]
  }) => {
    if (onIndicatorData) {
      onIndicatorData(newData);
    }
  };

  return (
    <div className="chart-container">
      {/* Main Chart */}
      <div className="main-chart-wrapper" ref={mainChartContainerRef}>
        <MainChart
          data={data}
          volumeData={volumeData}
          activeIndicators={mainPaneIndicators}
          settings={settings}
          onDataUpdate={onDataUpdate}
          onCrosshairMove={onCrosshairMove}
          onIndicatorData={handleIndicatorDataUpdate}
          fullDataForIndicators={fullDataForIndicators}
          onTimeScaleChange={handleTimeScaleChange}
          onChartReady={handleMainChartReady}
        />
      </div>
      
      {/* Sub Charts - One for each sub-pane indicator */}
      {subPaneIndicators.map((indicator) => (
        <div key={indicator.id} className="sub-chart-wrapper">
          <SubChart
            data={data}
            activeIndicators={[indicator]}
            settings={settings}
            onIndicatorData={handleIndicatorDataUpdate}
            fullDataForIndicators={fullDataForIndicators}
            timeScaleRange={timeScaleRange}
            onChartReady={(chart: IChartApi) => handleSubChartReady(indicator.id, chart)}
            onChartRemoved={() => handleSubChartRemoved(indicator.id)}
          />
        </div>
      ))}
    </div>
  );
};

export default Chart;