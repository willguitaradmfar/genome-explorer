import React, { useState, useEffect } from 'react';
import { Indicator, ParameterConfig } from '../../types/indicator.types';
import './ParameterDialog.css';

interface ParameterDialogProps {
  indicator: Indicator | null;
  isVisible: boolean;
  onConfirm: (values: { [key: string]: any }) => void;
  onCancel: () => void;
}

const ParameterDialog: React.FC<ParameterDialogProps> = ({
  indicator,
  isVisible,
  onConfirm,
  onCancel
}) => {
  const [values, setValues] = useState<{ [key: string]: any }>({});
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Initialize values when indicator changes
  useEffect(() => {
    if (indicator) {
      const initialValues: { [key: string]: any } = {};
      Object.entries(indicator.parameters).forEach(([key, param]) => {
        initialValues[key] = param.default;
      });
      setValues(initialValues);
      setErrors({});
    }
  }, [indicator]);

  const validateValue = (_key: string, value: any, param: ParameterConfig): string | null => {
    if (param.type === 'number') {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) {
        return `${param.label} must be a number`;
      }
      if (param.min !== undefined && numValue < param.min) {
        return `${param.label} must be at least ${param.min}`;
      }
      if (param.max !== undefined && numValue > param.max) {
        return `${param.label} must be at most ${param.max}`;
      }
    }
    return null;
  };

  const handleValueChange = (key: string, value: any) => {
    const param = indicator?.parameters[key];
    if (!param) return;

    let processedValue = value;
    
    // Process value based on type
    if (param.type === 'number') {
      processedValue = parseFloat(value) || param.default;
    } else if (param.type === 'boolean') {
      processedValue = Boolean(value);
    }

    setValues(prev => ({
      ...prev,
      [key]: processedValue
    }));

    // Validate
    const error = validateValue(key, processedValue, param);
    setErrors(prev => ({
      ...prev,
      [key]: error || ''
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!indicator) return;

    // Validate all values
    const newErrors: { [key: string]: string } = {};
    let hasErrors = false;

    Object.entries(indicator.parameters).forEach(([key, param]) => {
      const error = validateValue(key, values[key], param);
      if (error) {
        newErrors[key] = error;
        hasErrors = true;
      }
    });

    setErrors(newErrors);

    if (!hasErrors) {
      onConfirm(values);
    }
  };

  const renderInput = (key: string, param: ParameterConfig) => {
    const value = values[key] ?? param.default;
    const error = errors[key];

    switch (param.type) {
      case 'number':
        return (
          <div key={key} className="parameter-input-group">
            <label className="parameter-label">{param.label}</label>
            <input
              type="number"
              value={value}
              min={param.min}
              max={param.max}
              step={param.step || 1}
              onChange={(e) => handleValueChange(key, e.target.value)}
              className={`flex-1 bg-gray-800/50 backdrop-blur border border-white/20 rounded px-3 py-2 text-white placeholder-white/60 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 ${error ? 'border-red-400 focus:border-red-400 focus:ring-red-400/30' : ''}`}
            />
            {error && <span className="parameter-error">{error}</span>}
          </div>
        );

      case 'select':
        return (
          <div key={key} className="parameter-input-group">
            <label className="parameter-label">{param.label}</label>
            <select
              value={value}
              onChange={(e) => handleValueChange(key, e.target.value)}
              className="flex-1 bg-gray-800/50 backdrop-blur border border-white/20 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30"
            >
              {param.options?.map(option => (
                <option key={option} value={option} className="bg-gray-800 text-white">
                  {option.toUpperCase()}
                </option>
              ))}
            </select>
            {error && <span className="parameter-error">{error}</span>}
          </div>
        );

      case 'boolean':
        return (
          <div key={key} className="parameter-input-group parameter-checkbox-group">
            <label className="parameter-checkbox-label">
              <input
                type="checkbox"
                checked={value}
                onChange={(e) => handleValueChange(key, e.target.checked)}
                className="parameter-checkbox"
              />
              <span className="parameter-checkbox-text">{param.label}</span>
            </label>
            {error && <span className="parameter-error">{error}</span>}
          </div>
        );

      case 'color':
        return (
          <div key={key} className="parameter-input-group">
            <label className="parameter-label">{param.label}</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={value}
                onChange={(e) => handleValueChange(key, e.target.value)}
                className="w-12 h-10 border border-white/20 rounded cursor-pointer bg-transparent"
              />
              <input
                type="text"
                value={value}
                onChange={(e) => handleValueChange(key, e.target.value)}
                placeholder="#2196F3"
                className="flex-1 bg-gray-800/50 backdrop-blur border border-white/20 rounded px-3 py-2 text-white placeholder-white/60 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30"
              />
            </div>
            {error && <span className="parameter-error">{error}</span>}
          </div>
        );

      default:
        return null;
    }
  };

  if (!isVisible || !indicator) {
    return null;
  }

  const hasParameters = Object.keys(indicator.parameters).length > 0;

  return (
    <div className="parameter-dialog-overlay">
      <div className="parameter-dialog">
        <div className="parameter-dialog-header">
          <h3 className="parameter-dialog-title">Configure {indicator.name}</h3>
          <p className="parameter-dialog-description">{indicator.description}</p>
        </div>

        <form onSubmit={handleSubmit} className="parameter-dialog-form">
          {hasParameters ? (
            <div className="parameter-inputs">
              {Object.entries(indicator.parameters).map(([key, param]) =>
                renderInput(key, param)
              )}
            </div>
          ) : (
            <div className="parameter-no-params">
              <p>This indicator has no configurable parameters.</p>
            </div>
          )}

          <div className="parameter-dialog-actions">
            <button
              type="button"
              onClick={onCancel}
              className="parameter-dialog-button parameter-dialog-cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="parameter-dialog-button parameter-dialog-confirm"
            >
              Add Indicator
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ParameterDialog;