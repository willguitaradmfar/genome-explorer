export interface IndicatorStyle {
  color?: string;
  upperColor?: string;
  lowerColor?: string;
  middleColor?: string;
  macdColor?: string;
  signalColor?: string;
  histogramColor?: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
}

export interface ParameterConfig {
  type: 'number' | 'select' | 'boolean' | 'color';
  default: any;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  label: string;
}

export interface IndicatorParameters {
  [key: string]: ParameterConfig;
}

export interface IndicatorValues {
  [key: string]: any;
}

export interface Indicator {
  id: string;
  name: string;
  description: string;
  type: 'overlay' | 'oscillator';
  pane: 'main' | 'sub';
  parameters: IndicatorParameters;
  style: IndicatorStyle;
}

export interface ActiveIndicator extends Indicator {
  baseId: string; // Original indicator ID for loading JS files
  isActive: boolean;
  addedAt: Date;
  values: IndicatorValues;
}