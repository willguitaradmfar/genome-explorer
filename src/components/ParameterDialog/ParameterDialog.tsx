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
  const [activeTab, setActiveTab] = useState<'parameters' | 'technical'>('parameters');

  // Initialize values when indicator changes
  useEffect(() => {
    if (indicator) {
      const initialValues: { [key: string]: any } = {};
      Object.entries(indicator.parameters).forEach(([key, param]) => {
        initialValues[key] = param.default;
      });
      setValues(initialValues);
      setErrors({});
      setActiveTab('parameters'); // Reset to parameters tab
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

  const renderTechnicalInfo = () => {
    if (!indicator) return null;

    const formatJsonValue = (value: any, level = 0): React.ReactNode => {
      const indent = '  '.repeat(level);
      
      if (value === null) return <span className="json-null">null</span>;
      if (typeof value === 'boolean') return <span className="json-boolean">{String(value)}</span>;
      if (typeof value === 'number') return <span className="json-number">{value}</span>;
      if (typeof value === 'string') return <span className="json-string">"{value}"</span>;
      
      if (Array.isArray(value)) {
        if (value.length === 0) return <span className="json-array">[]</span>;
        return (
          <div className="json-array">
            <span>[</span>
            <div className="json-content">
              {value.map((item, index) => (
                <div key={index} className="json-item">
                  {indent}  {formatJsonValue(item, level + 1)}
                  {index < value.length - 1 ? ',' : ''}
                </div>
              ))}
            </div>
            <span>{indent}]</span>
          </div>
        );
      }
      
      if (typeof value === 'object') {
        const entries = Object.entries(value);
        if (entries.length === 0) return <span className="json-object">{"{}"}</span>;
        
        return (
          <div className="json-object">
            <span>{'{'}</span>
            <div className="json-content">
              {entries.map(([key, val], index) => (
                <div key={key} className="json-item">
                  <span className="json-key">{indent}  "{key}"</span>: {formatJsonValue(val, level + 1)}
                  {index < entries.length - 1 ? ',' : ''}
                </div>
              ))}
            </div>
            <span>{indent}{'}'}</span>
          </div>
        );
      }
      
      return String(value);
    };

    const renderParametersTable = () => {
      const parameters = indicator.parameters;
      if (!parameters || Object.keys(parameters).length === 0) {
        return <div className="table-empty">No parameters available</div>;
      }

      return (
        <div className="technical-table">
          <table>
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Type</th>
                <th>Default</th>
                <th>Min</th>
                <th>Max</th>
                <th>Step</th>
                <th>Options</th>
                <th>Label</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(parameters).map(([key, param]) => (
                <tr key={key}>
                  <td className="param-key">{key}</td>
                  <td className="param-type">{param.type}</td>
                  <td className="param-value">{String(param.default)}</td>
                  <td className="param-value">{param.min !== undefined ? String(param.min) : '-'}</td>
                  <td className="param-value">{param.max !== undefined ? String(param.max) : '-'}</td>
                  <td className="param-value">{param.step !== undefined ? String(param.step) : '-'}</td>
                  <td className="param-value">{param.options ? param.options.join(', ') : '-'}</td>
                  <td className="param-label">{param.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    };

    const renderOutputsTable = () => {
      const outputs = (indicator as any).outputs;
      if (!outputs || Object.keys(outputs).length === 0) {
        return <div className="table-empty">No outputs available</div>;
      }

      return (
        <div className="technical-table">
          <table>
            <thead>
              <tr>
                <th>Output</th>
                <th>Type</th>
                <th>Name</th>
                <th>Display Name</th>
                <th>Default Color</th>
                <th>Range</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(outputs).map(([key, output]: [string, any]) => (
                <tr key={key}>
                  <td className="output-key">{key}</td>
                  <td className="output-type">{output.type}</td>
                  <td className="output-name">{output.name}</td>
                  <td className="output-display">{output.displayName}</td>
                  <td className="output-color">
                    {output.defaultColor && (
                      <div className="color-preview">
                        <div 
                          className="color-swatch" 
                          style={{ backgroundColor: output.defaultColor }}
                        ></div>
                        <span>{output.defaultColor}</span>
                      </div>
                    )}
                  </td>
                  <td className="output-range">
                    {output.range ? `${output.range.min} - ${output.range.max}` : '-'}
                  </td>
                  <td className="output-description">{output.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    };

    return (
      <div className="technical-info">
        <div className="technical-section">
          <h4 className="technical-section-title">Basic Information</h4>
          <div className="technical-info-grid">
            <div className="technical-info-item">
              <span className="technical-info-label">ID:</span>
              <span className="technical-info-value">{indicator.id}</span>
            </div>
            <div className="technical-info-item">
              <span className="technical-info-label">Type:</span>
              <span className="technical-info-value">{indicator.type}</span>
            </div>
            <div className="technical-info-item">
              <span className="technical-info-label">Pane:</span>
              <span className="technical-info-value">{indicator.pane}</span>
            </div>
          </div>
        </div>

        <div className="technical-section">
          <h4 className="technical-section-title">Parameters</h4>
          {renderParametersTable()}
        </div>

        {(indicator as any).outputs && (
          <div className="technical-section">
            <h4 className="technical-section-title">Outputs</h4>
            {renderOutputsTable()}
          </div>
        )}

        <div className="technical-section">
          <h4 className="technical-section-title">Style Configuration</h4>
          <div className="json-viewer">
            {formatJsonValue(indicator.style)}
          </div>
        </div>

        <div className="technical-section">
          <h4 className="technical-section-title">Complete JSON</h4>
          <div className="json-viewer">
            {formatJsonValue(indicator)}
          </div>
        </div>
      </div>
    );
  };

  if (!isVisible || !indicator) {
    return null;
  }

  const hasParameters = Object.keys(indicator.parameters).length > 0;

  return (
    <div className="parameter-dialog-overlay">
      <div className="parameter-dialog">
        <div className="parameter-dialog-header">
          <div className="parameter-dialog-header-content">
            <h3 className="parameter-dialog-title">Configure {indicator.name}</h3>
            <p className="parameter-dialog-description">{indicator.description}</p>
          </div>
          <button 
            type="button"
            onClick={onCancel}
            className="parameter-dialog-close"
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="parameter-dialog-tabs">
          <button
            type="button"
            onClick={() => setActiveTab('parameters')}
            className={`parameter-dialog-tab ${activeTab === 'parameters' ? 'active' : ''}`}
          >
            Parameters
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('technical')}
            className={`parameter-dialog-tab ${activeTab === 'technical' ? 'active' : ''}`}
          >
            Technical Info
          </button>
        </div>

        {/* Tab Content */}
        <div className="parameter-dialog-content">
          {activeTab === 'parameters' ? (
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
          ) : (
            <div className="technical-info-container">
              {renderTechnicalInfo()}
              <div className="parameter-dialog-actions">
                <button
                  type="button"
                  onClick={onCancel}
                  className="parameter-dialog-button parameter-dialog-cancel"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ParameterDialog;