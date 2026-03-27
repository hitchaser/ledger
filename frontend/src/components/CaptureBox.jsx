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
    <div className="border-b border-white/[0.06] bg-black/30 backdrop-blur-xl px-4 py-3">
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
          className="flex-1 glass-input rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all"
        />
        <button
          onClick={submit}
          disabled={loading || !text.trim()}
          className="p-2.5 rounded-lg bg-blue-600/80 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all backdrop-blur-sm border border-blue-500/20"
        >
          <Send size={16} className="text-white" />
        </button>
      </div>
    </div>
  );
}
