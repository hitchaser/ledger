import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import Avatar from './Avatar';
import EmlDropZone from './EmlDropZone';
import { Plus, Search, StickyNote, Mail } from 'lucide-react';
import { useDelayedLoading } from '../hooks/useDelayedLoading';

export default function NotesList() {
  const navigate = useNavigate();
  const [notes, setNotes] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');

  const loadNotes = () => {
    const params = { limit: 200 };
    if (sourceFilter !== 'all') params.source_type = sourceFilter;
    api.listNotes(params).then(data => {
      setNotes(data.notes || []);
      setTotal(data.total || 0);
      setLoading(false);
    });
  };

  useEffect(() => {
    setLoading(true);
    loadNotes();
  }, [sourceFilter]);

  const filtered = useMemo(() => {
    if (!search.trim()) return notes;
    const q = search.toLowerCase();
    return notes.filter(n => {
      const title = (n.title || '').toLowerCase();
      const body = (n.body || '').toLowerCase();
      const people = (n.linked_people || []).map(p => p.display_name.toLowerCase()).join(' ');
      return title.includes(q) || body.includes(q) || people.includes(q);
    });
  }, [notes, search]);

  const showLoading = useDelayedLoading(loading);
  if (loading) return showLoading ? <div className="p-8 text-zinc-600">Loading...</div> : null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 page-transition">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-100">Notes</h2>
        <button onClick={() => navigate('/notes/new')}
          className="flex items-center gap-1.5 bg-blue-600/80 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded border border-blue-500/20 transition-all">
          <Plus size={12} /> New Note
        </button>
      </div>

      <div className="mb-3">
        <EmlDropZone
          onImported={(result) => {
            if (result.note) {
              navigate(`/notes/${result.note.id}`);
            }
          }}
        />
      </div>

      {/* Source filter */}
      <div className="flex items-center gap-1 mb-3">
        {[
          { value: 'all', label: 'All' },
          { value: 'manual', label: 'Notes', icon: StickyNote },
          { value: 'email', label: 'Emails', icon: Mail },
        ].map(({ value, label, icon: Icon }) => (
          <button key={value} onClick={() => setSourceFilter(value)}
            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-all ${
              sourceFilter === value
                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                : 'text-zinc-500 hover:text-zinc-300 glass border border-transparent'
            }`}>
            {Icon && <Icon size={12} />}
            {label}
          </button>
        ))}
      </div>

      {notes.length > 5 && (
        <div className="flex items-center gap-2 mb-3 glass rounded-lg px-3 py-2">
          <Search size={14} className="text-zinc-600 flex-shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Filter by title, body, or person..."
            className="flex-1 bg-transparent text-sm text-zinc-200 outline-none placeholder-zinc-600" />
        </div>
      )}

      {notes.length === 0 ? (
        <div className="text-center text-zinc-700 py-16 text-sm">
          No notes yet. Create one or drag an .eml to import.
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-zinc-700 py-12 text-sm">
          No notes match "{search}"
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {filtered.map(n => {
            const isEmail = n.source_type === 'email';
            const date = new Date(n.created_at);
            const title = n.title || (n.body || '').slice(0, 60) + ((n.body || '').length > 60 ? '...' : '');
            return (
              <button key={n.id} onClick={() => navigate(`/notes/${n.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 glass rounded-lg hover:bg-white/[0.04] transition-all text-left">
                {isEmail
                  ? <Mail size={14} className="text-amber-400/70 flex-shrink-0" />
                  : <StickyNote size={14} className="text-blue-400/70 flex-shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-200 truncate">{title}</span>
                    {(n.linked_projects || []).map(p => (
                      <span key={p.id} className="text-xs text-cyan-400/70 flex-shrink-0">{p.short_code || p.name}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-zinc-600">
                      {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {isEmail && n.email_from && (
                      <span className="text-xs text-zinc-600 truncate">from {n.email_from}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center -space-x-1.5 flex-shrink-0">
                  {(n.linked_people || []).slice(0, 4).map(p => (
                    <Avatar key={p.id} src={p.avatar} name={p.display_name} size="xs" />
                  ))}
                  {(n.linked_people || []).length > 4 && (
                    <span className="text-xs text-zinc-600 ml-1">+{n.linked_people.length - 4}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
