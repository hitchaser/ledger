import { useState, useRef, useCallback } from 'react';
import { api } from '../api/client';
import { Upload, Loader2 } from 'lucide-react';

/**
 * Drop target for .eml email files.
 *
 * Props:
 *   - onImported(note)  — callback fired with the created/existing note
 *   - compact (bool)    — inline vs card variant
 */
export default function EmlDropZone({ onImported, compact = false }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleFile = useCallback(async (file) => {
    setError(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.eml')) {
      setError('Please drop an .eml file');
      return;
    }
    setBusy(true);
    try {
      const result = await api.importEml(file);
      onImported?.(result);
    } catch (e) {
      setError(e.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  }, [onImported]);

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    handleFile(file);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const onClick = () => {
    if (busy) return;
    fileInputRef.current?.click();
  };

  const baseClasses = compact
    ? 'rounded-lg border border-dashed px-3 py-2 text-xs flex items-center gap-2 cursor-pointer transition-all'
    : 'rounded-lg border border-dashed px-4 py-6 text-sm flex items-center justify-center gap-2 cursor-pointer transition-all';

  const stateClasses = isDragOver
    ? 'border-blue-400/60 bg-blue-500/10 text-blue-300'
    : 'border-white/15 bg-white/[0.02] text-zinc-500 hover:border-white/25 hover:text-zinc-400';

  return (
    <div>
      <div
        className={`${baseClasses} ${stateClasses}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onClick={onClick}
        role="button"
        tabIndex={0}
      >
        {busy ? (
          <>
            <Loader2 size={compact ? 12 : 14} className="animate-spin" />
            <span>Importing...</span>
          </>
        ) : (
          <>
            <Upload size={compact ? 12 : 14} />
            <span>{isDragOver ? 'Drop the .eml here' : 'Drag an email (.eml) here to import'}</span>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".eml"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>
      {error && (
        <div className="mt-1 text-xs text-rose-400">{error}</div>
      )}
    </div>
  );
}
