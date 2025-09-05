import React from 'react';

interface SubChartTooltipProps {
  position: { x: number; y: number };
  isVisible: boolean;
  indicatorValues: { [indicatorId: string]: { time: number; value: number; color: string; name: string }[] };
  time?: number;
}

const SubChartTooltip: React.FC<SubChartTooltipProps> = ({ 
  position, 
  isVisible, 
  indicatorValues,
  time
}) => {
  if (!isVisible || !time || Object.keys(indicatorValues).length === 0) return null;

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatValue = (value: number, precision: number = 4): string => {
    return value.toFixed(precision);
  };

  return (
    <div
      className="fixed pointer-events-none z-[9999] select-none"
      style={{
        left: position.x + 15,
        top: position.y - 10,
        transform: 'translateY(-50%)',
      }}
    >
      <div className="bg-black/10 backdrop-blur-md border border-gray-600/10 rounded-lg shadow-2xl p-4 min-w-[200px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-600/20">
          <div className="text-white font-bold text-sm">
            {formatTime(time)}
          </div>
        </div>

        {/* Indicator Values */}
        <div className="space-y-2">
          {Object.entries(indicatorValues).map(([indicatorId, seriesArray]) => (
            <div key={indicatorId} className="space-y-1">
              {seriesArray.map((series, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: series.color }}
                    />
                    <span className="text-gray-200 text-sm font-medium">
                      {series.name}
                    </span>
                  </div>
                  <span className="text-white font-mono text-sm">
                    {formatValue(series.value)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SubChartTooltip;