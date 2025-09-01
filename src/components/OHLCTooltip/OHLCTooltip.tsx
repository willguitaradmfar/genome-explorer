import React from 'react';
import { OHLC } from '../../types/chart.types';

interface OHLCTooltipProps {
  data: OHLC | null;
  position: { x: number; y: number };
  isVisible: boolean;
}

const OHLCTooltip: React.FC<OHLCTooltipProps> = ({ data, position, isVisible }) => {
  if (!isVisible || !data) return null;

  const formatPrice = (price: number): string => {
    return price.toFixed(2);
  };

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

  const change = data.close - data.open;
  const changePercent = ((change / data.open) * 100);
  const isPositive = change >= 0;

  return (
    <div
      className="fixed pointer-events-none z-[9999] select-none"
      style={{
        left: position.x + 15,
        top: position.y - 10,
        transform: 'translateY(-50%)',
      }}
    >
      <div className="bg-black/80 backdrop-blur-md border border-gray-600/30 rounded-lg shadow-2xl p-4 min-w-[250px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-600/20">
          <div className="text-white font-bold text-sm">
            {formatTime(data.time)}
          </div>
          <div className={`text-sm font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
            {isPositive ? '+' : ''}{change.toFixed(2)} ({changePercent.toFixed(2)}%)
          </div>
        </div>

        {/* OHLC Data */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400 font-medium">Open:</span>
            <span className="text-white font-mono">{formatPrice(data.open)}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-400 font-medium">High:</span>
            <span className="text-green-400 font-mono">{formatPrice(data.high)}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-400 font-medium">Low:</span>
            <span className="text-red-400 font-mono">{formatPrice(data.low)}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-400 font-medium">Close:</span>
            <span className={`font-mono ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
              {formatPrice(data.close)}
            </span>
          </div>
        </div>

        {/* Range Information */}
        <div className="mt-3 pt-2 border-t border-gray-600/20">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Range: {formatPrice(data.high - data.low)}</span>
            <span>Body: {formatPrice(Math.abs(data.close - data.open))}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OHLCTooltip;