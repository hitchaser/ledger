import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { FolderPlus, Search } from 'lucide-react';

const STATUS_COLORS = {
  active: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
  on_hold: 'bg-slate-500/15 text-slate-400 border border-slate-500/20',
  complete: 'bg-sky-500/15 text-sky-400 border border-sky-500/20',
  cancelled: 'bg-zinc-500/10 text-zinc-500 border border-zinc-500/15',
};

export default function ProjectDirectory({ refreshKey }) {
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', short_code: '', context_notes: '' });

  useEffect(() => { api.listProjects().then(setProjects).catch(console.error); }, [refreshKey]);

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.short_code || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    await api.createProject(form);
    setForm({ name: '', short_code: '', context_notes: '' });
    setShowForm(false);
    api.listProjects().then(setProjects);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-200">Projects</h2>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 text-xs glass glass-hover rounded-lg px-3 py-1.5 text-zinc-400 hover:text-zinc-200 transition-all">
          <FolderPlus size={14} /> Add Project
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-4 p-3 glass rounded-lg grid grid-cols-2 gap-2">
          <input placeholder="Project name *" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
            className="glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" />
          <input placeholder="Short code (e.g. PBJY)" value={form.short_code} onChange={e => setForm({...form, short_code: e.target.value})}
            className="glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" />
          <textarea placeholder="Context notes..." value={form.context_notes} onChange={e => setForm({...form, context_notes: e.target.value})}
            className="col-span-2 glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none resize-none h-16" />
          <div className="col-span-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="text-xs text-zinc-600 px-3 py-1">Cancel</button>
            <button type="submit" className="text-xs bg-blue-600/80 hover:bg-blue-500 text-white rounded px-3 py-1.5 border border-blue-500/20 transition-all">Create</button>
          </div>
        </form>
      )}

      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
        <input type="text" placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full glass-input rounded-lg pl-8 pr-3 py-2 text-sm text-zinc-300 outline-none" />
      </div>

      <div className="flex flex-col gap-1">
        {filtered.map(p => (
          <Link key={p.id} to={`/projects/${p.id}`}
            className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/[0.04] transition-all">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-xs font-bold text-zinc-400">
                {(p.short_code || p.name.slice(0, 2)).toUpperCase()}
              </div>
              <span className="text-sm text-zinc-200 font-medium">{p.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`badge ${STATUS_COLORS[p.status] || STATUS_COLORS.active}`}>{p.status.replace('_', ' ')}</span>
              {p.open_item_count > 0 && (
                <span className="text-xs text-zinc-600">{p.open_item_count} open</span>
              )}
            </div>
          </Link>
        ))}
        {filtered.length === 0 && <div className="text-center text-zinc-700 py-8 text-sm">No projects found</div>}
      </div>
    </div>
  );
}
