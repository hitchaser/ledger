import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';

/**
 * Reusable typeahead for selecting a project.
 *
 * Props:
 *   - projects (optional)  — pre-fetched array; if absent the component fetches its own
 *   - exclude  (optional)  — array of project IDs to hide from the dropdown
 *   - onSelect(project)    — called with the picked project
 *   - placeholder
 *   - clearOnSelect (bool) — clear input after a pick (default true)
 */
export default function ProjectTypeahead({
  projects: providedProjects,
  exclude = [],
  onSelect,
  placeholder = 'Search projects...',
  clearOnSelect = true,
}) {
  const [projects, setProjects] = useState(providedProjects || []);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Self-fetch if no projects provided
  useEffect(() => {
    if (providedProjects) {
      setProjects(providedProjects);
      return;
    }
    api.listProjects().then(setProjects).catch(() => {});
  }, [providedProjects]);

  const excludeSet = new Set(exclude);
  const filtered = projects
    .filter(p => !p.is_archived && !excludeSet.has(p.id))
    .filter(p =>
      query === '' ||
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      (p.short_code && p.short_code.toLowerCase().includes(query.toLowerCase()))
    )
    .slice(0, 10);

  const handleSelect = (project) => {
    if (clearOnSelect) setQuery('');
    setOpen(false);
    onSelect?.(project);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleKeyDown = (e) => {
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); handleSelect(filtered[highlightIdx]); }
    if (e.key === 'Escape') { setOpen(false); }
  };

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className={`relative w-56 ${open && filtered.length > 0 ? 'z-50' : ''}`}>
      <input
        ref={inputRef}
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); setHighlightIdx(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none"
      />
      {open && query.length > 0 && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border border-white/10 max-h-48 overflow-y-auto shadow-xl bg-zinc-900">
          {filtered.map((p, idx) => (
            <button key={p.id} onClick={() => handleSelect(p)}
              className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                idx === highlightIdx ? 'bg-blue-500/15 text-zinc-200' : 'text-zinc-300 hover:bg-white/[0.04]'
              }`}>
              {p.name} {p.short_code && <span className="text-xs text-zinc-600">[{p.short_code}]</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
