import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Toast({ message, type = 'info', onDismiss, duration = 5000 }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [onDismiss, duration]);

  const colors = {
    info: 'bg-blue-500/15 border-blue-500/25 text-blue-400',
    success: 'bg-sky-500/15 border-sky-500/25 text-sky-400',
    error: 'bg-rose-500/15 border-rose-500/25 text-rose-400',
  };

  return (
    <div className={`fixed bottom-4 right-4 ${colors[type]} border rounded-lg px-4 py-3 flex items-center gap-3 shadow-xl shadow-black/30 backdrop-blur-xl z-50`}>
      <span className="text-sm">{message}</span>
      <button onClick={onDismiss} className="opacity-60 hover:opacity-100 transition-opacity"><X size={14} /></button>
    </div>
  );
}
