import React from 'react';
import { ActiveIndicator } from '../../types/indicator.types';

interface IndicatorPanelProps {
  indicators: ActiveIndicator[];
  onRemoveIndicator: (indicatorId: string) => void;
}

const IndicatorPanel: React.FC<IndicatorPanelProps> = ({
  indicators,
  onRemoveIndicator,
}) => {
  if (indicators.length === 0) {
    return null;
  }

  return (
    <div className="absolute top-10 left-4 z-20">
      <div className="bg-black/10 backdrop-blur-xl border border-white/15 rounded-lg shadow-2xl w-80 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-white/10 dark:border-gray-600/20">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <h3 className="text-sm font-bold text-white dark:text-white drop-shadow-sm">
              Indicators ({indicators.length})
            </h3>
          </div>
        </div>

        {/* Indicators List */}
        <div className="p-2 space-y-1 overflow-y-auto">
          {indicators.map((indicator) => (
            <div
              key={indicator.id}
              className="flex items-center justify-between p-2 hover:bg-white/10 dark:hover:bg-white/10 rounded transition-colors group"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {/* Indicator Icon */}
                <span className="text-sm">
                  {indicator.type === 'overlay' ? '📊' : '📉'}
                </span>
                
                {/* Color indicator */}
                <div 
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ 
                    backgroundColor: indicator.values?.color || 
                                   indicator.style?.color || 
                                   indicator.style?.macdColor || 
                                   indicator.style?.upperColor || 
                                   '#2196F3' 
                  }}
                />
                
                {/* Indicator Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-white dark:text-white truncate drop-shadow-sm">
                    {indicator.name}
                    {/* Show parameters if they exist */}
                    {indicator.values && Object.keys(indicator.values).length > 0 && (
                      <span className="ml-1 text-white/80">
                        ({Object.entries(indicator.values)
                          .map(([key, value]) => {
                            // Skip color parameter in display (it's shown as the dot)
                            if (key === 'color') {
                              return null;
                            }
                            // Format parameter display
                            if (typeof value === 'number') {
                              return value.toString();
                            }
                            if (typeof value === 'string' && value !== 'close') {
                              return value;
                            }
                            return null;
                          })
                          .filter(Boolean)
                          .join(', ')})
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-white/60 dark:text-white/60 truncate font-medium">
                    {indicator.type} • {indicator.pane}
                  </div>
                </div>
              </div>

              {/* Remove Button */}
              <button
                onClick={() => onRemoveIndicator(indicator.id)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded transition-all duration-200 flex-shrink-0"
                title="Remove indicator"
              >
                <svg className="w-3 h-3 text-red-400 hover:text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 bg-white/10 dark:bg-white/10 border-t border-white/10 dark:border-white/10">
          <div className="text-xs text-white/70 dark:text-white/70 font-medium text-center">
            Press Ctrl+I to add more indicators
          </div>
        </div>
      </div>
    </div>
  );
};

export default IndicatorPanel;