import React, { useState, useEffect, useRef } from 'react';

interface DataFolderModalProps {
  isVisible: boolean;
  onConfirm: (path: string) => void;
  onCancel: () => void;
  currentPath?: string;
}

const DataFolderModal: React.FC<DataFolderModalProps> = ({
  isVisible,
  onConfirm,
  onCancel,
  currentPath = ''
}) => {
  const [folderPath, setFolderPath] = useState(currentPath);
  const [error, setError] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isVisible && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isVisible]);

  useEffect(() => {
    setFolderPath(currentPath);
    setError('');
  }, [currentPath, isVisible]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!folderPath.trim()) {
      setError('Por favor, insira um caminho válido');
      return;
    }

    onConfirm(folderPath.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  if (!isVisible) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center"
      onClick={onCancel}
    >
      <div 
        className="bg-gray-900 rounded-lg shadow-2xl p-6 w-[500px] max-w-[90vw] border border-gray-700"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 className="text-xl font-semibold text-white mb-4">
          Configurar Pasta de Dados
        </h2>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Caminho da pasta data:
            </label>
            <input
              ref={inputRef}
              type="text"
              value={folderPath}
              onChange={(e) => {
                setFolderPath(e.target.value);
                setError('');
              }}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="/caminho/para/data"
            />
            {error && (
              <p className="mt-2 text-sm text-red-400">{error}</p>
            )}
          </div>

          <div className="text-sm text-gray-400 mb-4">
            <p>As seguintes subpastas serão criadas automaticamente:</p>
            <ul className="list-disc list-inside mt-2">
              <li>data/symbols</li>
              <li>data/indicators</li>
              <li>data/cache</li>
            </ul>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Confirmar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DataFolderModal;