import { useState, useRef, useCallback } from 'react';
import { api } from '../api/client';
import { Upload, Loader2 } from 'lucide-react';

/**
 * Drop target for Outlook .ics files.
 *
 * Props:
 *   - meetingId  (optional) — if present, drops POST to /api/meetings/:id/import-ics.
 *                              if absent, the component creates a new meeting first.
 *   - currentNotes (optional, string) — latest textarea value to send with the import,
 *                                       used by the server's notes merge.
 *   - compact    (bool) — inline (MeetingDetail) vs card (MeetingsList) variant
 *   - onParsed(result) — callback fired with the endpoint response
 *   - onBeforeImport() — optional hook (e.g. pause autosave)
 */
export default function IcsDropZone({ meetingId, currentNotes, compact = false, onParsed, onBeforeImport }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleFile = useCallback(async (file) => {
    setError(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.ics')) {
      setError('Please drop an .ics file');
      return;
    }
    setBusy(true);
    try {
      onBeforeImport?.();
      let targetMeetingId = meetingId;
      if (!targetMeetingId) {
        // Create the meeting first; reuse 409 force-end pattern.
        try {
          const session = await api.startMeeting({});
          targetMeetingId = session.id;
        } catch (e) {
          if (e.message && e.message.includes('409')) {
            if (confirm('There is an active meeting session. End it and start a new one?')) {
              await api.forceEndActiveMeeting();
              const session = await api.startMeeting({});
              targetMeetingId = session.id;
            } else {
              setBusy(false);
              return;
            }
          } else {
            throw e;
          }
        }
      }
      const result = await api.importIcsToMeeting(targetMeetingId, file, currentNotes);
      onParsed?.(result);
    } catch (e) {
      setError(e.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  }, [meetingId, currentNotes, onBeforeImport, onParsed]);

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
            <span>{isDragOver ? 'Drop the .ics here' : 'Drag an Outlook meeting (.ics) here'}</span>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".ics"
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
