import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Search, X, CheckCircle, Circle, MessageSquare, User, FolderKanban, Calendar, StickyNote, Mail } from 'lucide-react';
import Avatar from './Avatar';

const TYPE_COLORS = {
  followup: 'text-sky-400',
  todo: 'text-blue-400',
  reminder: 'text-rose-400',
  discussion: 'text-indigo-400',
  goal: 'text-violet-400',
  note: 'text-slate-400',
};

export default function QuickSearch({ onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ people: [], projects: [], items: [], meetings: [], notes: [] });
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults({ people: [], projects: [], items: [], meetings: [], notes: [] });
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await api.universalSearch(query.trim());
        setResults(data);
      } catch {}
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const go = (path) => { navigate(path); onClose(); };

  const hasResults = results.people.length > 0 || results.projects.length > 0 || results.items.length > 0 || results.meetings?.length > 0 || results.notes?.length > 0;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[12vh] z-50 px-4" onClick={onClose}>
      <div className="rounded-xl w-full max-w-xl shadow-2xl shadow-black/50 border border-white/10 bg-zinc-900/95 backdrop-blur-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center border-b border-white/[0.06] px-4">
          <Search size={16} className="text-zinc-500" />
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search everything — items, notes, people, projects..."
            className="flex-1 bg-transparent px-3 py-3.5 text-sm text-zinc-200 outline-none placeholder-zinc-600" />
          <div className="flex items-center gap-2">
            {loading && <div className="w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />}
            <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors"><X size={16} /></button>
          </div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {/* People */}
          {results.people.length > 0 && (
            <div className="mb-2">
              <div className="flex items-center gap-1.5 px-2 py-1">
                <User size={12} className="text-indigo-400" />
                <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">People</span>
              </div>
              {results.people.map(p => (
                <button key={p.id} onClick={() => go(`/people/${p.id}`)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded text-sm text-zinc-300 hover:bg-white/[0.05] transition-colors">
                  <Avatar src={p.avatar} name={p.display_name} size="sm" />
                  <div className="flex-1 text-left min-w-0">
                    <span className="font-medium">{p.display_name}</span>
                    {p.name !== p.display_name && <span className="text-zinc-600 ml-1.5">({p.name})</span>}
                    {p.role && <span className="text-xs text-zinc-600 ml-1.5">{p.role}</span>}
                  </div>
                  {p.is_archived && <span className="text-xs text-zinc-700">archived</span>}
                </button>
              ))}
            </div>
          )}

          {/* Projects */}
          {results.projects.length > 0 && (
            <div className="mb-2">
              <div className="flex items-center gap-1.5 px-2 py-1">
                <FolderKanban size={12} className="text-cyan-400" />
                <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Projects</span>
              </div>
              {results.projects.map(p => (
                <button key={p.id} onClick={() => go(`/projects/${p.id}`)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded text-sm text-zinc-300 hover:bg-white/[0.05] transition-colors text-left">
                  <span className="font-medium">{p.name}</span>
                  {p.short_code && <span className="text-xs text-zinc-600">[{p.short_code}]</span>}
                  <span className={`text-xs ml-auto ${p.is_archived ? 'text-zinc-700' : 'text-zinc-600'}`}>{p.is_archived ? 'archived' : p.status}</span>
                </button>
              ))}
            </div>
          )}

          {/* Meetings */}
          {results.meetings?.length > 0 && (
            <div className="mb-2">
              <div className="flex items-center gap-1.5 px-2 py-1">
                <Calendar size={12} className="text-emerald-400" />
                <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Meetings</span>
              </div>
              {results.meetings.map(m => (
                <button key={m.id} onClick={() => go(`/meetings/${m.id}`)}
                  className="w-full text-left px-3 py-2 rounded hover:bg-white/[0.05] transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-300 font-medium">{m.title || 'Untitled Meeting'}</span>
                    <span className="text-xs text-zinc-600">{new Date(m.started_at).toLocaleDateString()}</span>
                    {m.attendees?.length > 0 && (
                      <span className="text-xs text-indigo-400/60">{m.attendees.join(', ')}</span>
                    )}
                    {m.project_name && (
                      <span className="text-xs text-cyan-400/60">{m.project_name}</span>
                    )}
                  </div>
                  {m.matching_notes && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <MessageSquare size={10} className="text-zinc-600" />
                      <span className="text-xs text-zinc-500 italic">{m.matching_notes}</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Notes */}
          {results.notes?.length > 0 && (
            <div className="mb-2">
              <div className="flex items-center gap-1.5 px-2 py-1">
                <StickyNote size={12} className="text-amber-400" />
                <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Notes</span>
              </div>
              {results.notes.map(n => (
                <button key={n.id} onClick={() => go(`/notes/${n.id}`)}
                  className="w-full text-left px-3 py-2 rounded hover:bg-white/[0.05] transition-colors">
                  <div className="flex items-center gap-2">
                    {n.source_type === 'email'
                      ? <Mail size={12} className="text-amber-400/60 flex-shrink-0" />
                      : <StickyNote size={12} className="text-blue-400/60 flex-shrink-0" />
                    }
                    <span className="text-sm text-zinc-300 font-medium">{n.title || '(untitled)'}</span>
                    <span className="text-xs text-zinc-600">{new Date(n.created_at).toLocaleDateString()}</span>
                    {n.linked_people?.length > 0 && (
                      <span className="text-xs text-indigo-400/60">{n.linked_people.map(p => p.display_name).join(', ')}</span>
                    )}
                    {n.linked_projects?.length > 0 && (
                      <span className="text-xs text-cyan-400/60">{n.linked_projects.map(p => p.short_code || p.name).join(', ')}</span>
                    )}
                  </div>
                  {n.matching_body && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-xs text-zinc-500 italic">{n.matching_body}</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Items */}
          {results.items.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 px-2 py-1">
                <Circle size={12} className="text-blue-400" />
                <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Items</span>
              </div>
              {results.items.map(i => {
                const dest = i.linked_people?.[0] ? `/people/${i.linked_people[0].id}`
                  : i.linked_projects?.[0] ? `/projects/${i.linked_projects[0].id}`
                  : '/';
                return (
                  <button key={i.id} onClick={() => go(dest)}
                    className="w-full text-left px-3 py-2 rounded hover:bg-white/[0.05] transition-colors">
                    <div className="flex items-start gap-2">
                      {i.status === 'done'
                        ? <CheckCircle size={14} className="text-blue-400/50 mt-0.5 flex-shrink-0" />
                        : <Circle size={14} className="text-zinc-600 mt-0.5 flex-shrink-0" />
                      }
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${i.status === 'done' ? 'text-zinc-500 line-through' : 'text-zinc-300'}`}>
                          {i.raw_text}
                        </p>
                        {i.matching_note && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <MessageSquare size={10} className="text-zinc-600" />
                            <span className="text-xs text-zinc-500 italic">Note: {i.matching_note}</span>
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          {i.effective_type && <span className={`text-xs ${TYPE_COLORS[i.effective_type] || 'text-zinc-500'}`}>{i.effective_type}</span>}
                          {i.linked_people?.map(p => (
                            <span key={p.id} className="text-xs text-indigo-400/60">{p.display_name}</span>
                          ))}
                          {i.linked_projects?.map(p => (
                            <span key={p.id} className="text-xs text-cyan-400/60">{p.short_code || p.name}</span>
                          ))}
                          <span className="text-xs text-zinc-700 ml-auto">{i.status === 'done' ? 'completed' : 'open'}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* No results */}
          {query.trim().length >= 2 && !loading && !hasResults && (
            <div className="text-center text-zinc-700 py-8 text-sm">No results for "{query}"</div>
          )}

          {/* Hint */}
          {!query && (
            <div className="text-center text-zinc-700 py-8 text-sm">
              Search across items, notes, people, and projects
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
