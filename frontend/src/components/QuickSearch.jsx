import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Search, X } from 'lucide-react';

export default function QuickSearch({ onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ people: [], projects: [], items: [] });
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!query.trim()) { setResults({ people: [], projects: [], items: [] }); return; }
    const t = setTimeout(async () => {
      const [people, projects, items] = await Promise.all([
        api.listPeople(),
        api.listProjects(),
        api.listCaptures({ search: query, limit: 5 }),
      ]);
      setResults({
        people: people.filter(p => p.display_name.toLowerCase().includes(query.toLowerCase()) || p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5),
        projects: projects.filter(p => p.name.toLowerCase().includes(query.toLowerCase()) || (p.short_code || '').toLowerCase().includes(query.toLowerCase())).slice(0, 5),
        items: items.slice(0, 5),
      });
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  const go = (path) => { navigate(path); onClose(); };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-[15vh] z-50" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center border-b border-zinc-800 px-4">
          <Search size={16} className="text-zinc-500" />
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search people, projects, items..."
            className="flex-1 bg-transparent px-3 py-3 text-sm text-zinc-200 outline-none" />
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={16} /></button>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {results.people.length > 0 && (
            <div className="mb-2">
              <span className="text-xs text-zinc-500 px-2">People</span>
              {results.people.map(p => (
                <button key={p.id} onClick={() => go(`/people/${p.id}`)}
                  className="w-full text-left px-3 py-2 rounded text-sm text-zinc-300 hover:bg-zinc-800">{p.display_name} <span className="text-zinc-600">{p.role}</span></button>
              ))}
            </div>
          )}
          {results.projects.length > 0 && (
            <div className="mb-2">
              <span className="text-xs text-zinc-500 px-2">Projects</span>
              {results.projects.map(p => (
                <button key={p.id} onClick={() => go(`/projects/${p.id}`)}
                  className="w-full text-left px-3 py-2 rounded text-sm text-zinc-300 hover:bg-zinc-800">{p.name} {p.short_code && <span className="text-zinc-600">[{p.short_code}]</span>}</button>
              ))}
            </div>
          )}
          {results.items.length > 0 && (
            <div>
              <span className="text-xs text-zinc-500 px-2">Items</span>
              {results.items.map(i => (
                <div key={i.id} className="px-3 py-2 rounded text-sm text-zinc-400 hover:bg-zinc-800">{i.raw_text.slice(0, 80)}</div>
              ))}
            </div>
          )}
          {query && results.people.length === 0 && results.projects.length === 0 && results.items.length === 0 && (
            <div className="text-center text-zinc-600 py-4 text-sm">No results</div>
          )}
        </div>
      </div>
    </div>
  );
}
