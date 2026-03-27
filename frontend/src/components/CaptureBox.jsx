import { useState, useRef } from 'react';
import { Send } from 'lucide-react';
import { api } from '../api/client';

export default function CaptureBox({ onCapture }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  const submit = async () => {
    const t = text.trim();
    if (!t || loading) return;
    setLoading(true);
    try {
      await api.createCapture(t);
      setText('');
      onCapture?.();
    } catch (e) {
      console.error('Capture failed:', e);
    }
    setLoading(false);
    inputRef.current?.focus();
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-b border-zinc-800 bg-zinc-900/50 px-4 py-3">
      <div className="flex items-center gap-2 max-w-4xl mx-auto">
        <input
          id="capture-input"
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder="What's on your mind..."
          autoFocus
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-emerald-500 transition-colors"
        />
        <button
          onClick={submit}
          disabled={loading || !text.trim()}
          className="p-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Send size={16} className="text-white" />
        </button>
      </div>
    </div>
  );
}
