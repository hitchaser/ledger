import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import Avatar from './Avatar';
import { X } from 'lucide-react';

export default function PersonTypeahead({ value, onChange, exclude = [], placeholder = "Search people...", clearOnSelect = false }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);

  // Load selected person details on mount if value is set
  useEffect(() => {
    if (value && !selected) {
      api.getPerson(value).then(p => setSelected({ id: p.id, display_name: p.display_name, name: p.name, avatar: p.avatar, role: p.role })).catch(() => {});
    }
    if (!value) setSelected(null);
  }, [value]);

  const search = (q) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const r = await api.searchPeople(q, 30);
      setResults(r.filter(p => !exclude.includes(p.id)));
      setHighlightIdx(0);
    }, 150);
  };

  const handleInput = (e) => {
    const q = e.target.value;
    setQuery(q);
    if (q) {
      setOpen(true);
      search(q);
    } else {
      setOpen(false);
      setResults([]);
    }
  };

  const handleSelect = (person) => {
    if (clearOnSelect) {
      // Don't lock in — just fire callback and reset for next entry
      setQuery('');
      setOpen(false);
      setResults([]);
      onChange(person);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSelected(person);
      setQuery('');
      setOpen(false);
      setResults([]);
      onChange(person);
    }
  };

  const handleClear = () => {
    setSelected(null);
    setQuery('');
    setResults([]);
    onChange(null);
  };

  const handleKeyDown = (e) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); handleSelect(results[highlightIdx]); }
    if (e.key === 'Escape') { setOpen(false); }
  };

  const handleFocus = () => {
    if (query) setOpen(true);
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (selected) {
    return (
      <div className="flex items-center gap-2 glass-input rounded px-3 py-1.5">
        <Avatar src={selected.avatar} name={selected.display_name} size="xs" />
        <span className="text-sm text-zinc-200 flex-1" title={selected.name}>{selected.display_name}</span>
        <button onClick={handleClear} className="text-zinc-600 hover:text-zinc-300 transition-colors"><X size={14} /></button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative z-50">
      <input
        ref={inputRef}
        value={query}
        onChange={handleInput}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none"
      />
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border border-white/10 max-h-48 overflow-y-auto shadow-xl bg-zinc-900">
          {results.map((p, idx) => (
            <button
              key={p.id}
              onClick={() => handleSelect(p)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                idx === highlightIdx ? 'bg-blue-500/15 text-zinc-200' : 'text-zinc-300 hover:bg-white/[0.04]'
              }`}
            >
              <Avatar src={p.avatar} name={p.display_name} size="xs" />
              <div className="flex-1 min-w-0">
                <div className="truncate">{p.display_name}</div>
                {p.role && <div className="text-xs text-zinc-500 truncate">{p.role}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
