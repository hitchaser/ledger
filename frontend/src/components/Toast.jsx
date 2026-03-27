import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Toast({ message, type = 'info', onDismiss, duration = 5000 }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [onDismiss, duration]);

  const colors = {
    info: 'bg-blue-500/20 border-blue-500/30 text-blue-400',
    success: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400',
    error: 'bg-red-500/20 border-red-500/30 text-red-400',
  };

  return (
    <div className={`fixed bottom-4 right-4 ${colors[type]} border rounded-lg px-4 py-3 flex items-center gap-3 shadow-xl z-50`}>
      <span className="text-sm">{message}</span>
      <button onClick={onDismiss} className="opacity-60 hover:opacity-100"><X size={14} /></button>
    </div>
  );
}
