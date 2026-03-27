import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { FolderPlus, Search } from 'lucide-react';

const STATUS_COLORS = {
  active: 'bg-emerald-500/20 text-emerald-400',
  on_hold: 'bg-amber-500/20 text-amber-400',
  complete: 'bg-blue-500/20 text-blue-400',
  cancelled: 'bg-zinc-500/20 text-zinc-400',
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
          className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-300">
          <FolderPlus size={14} /> Add Project
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-4 p-3 bg-zinc-900 border border-zinc-800 rounded-lg grid grid-cols-2 gap-2">
          <input placeholder="Project name *" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" />
          <input placeholder="Short code (e.g. PBJY)" value={form.short_code} onChange={e => setForm({...form, short_code: e.target.value})}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" />
          <textarea placeholder="Context notes..." value={form.context_notes} onChange={e => setForm({...form, context_notes: e.target.value})}
            className="col-span-2 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 outline-none resize-none h-16" />
          <div className="col-span-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="text-xs text-zinc-500 px-3 py-1">Cancel</button>
            <button type="submit" className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded px-3 py-1.5">Create</button>
          </div>
        </form>
      )}

      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input type="text" placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-8 pr-3 py-2 text-sm text-zinc-300 outline-none focus:border-zinc-500" />
      </div>

      <div className="flex flex-col gap-1">
        {filtered.map(p => (
          <Link key={p.id} to={`/projects/${p.id}`}
            className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-zinc-800/70 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400">
                {(p.short_code || p.name.slice(0, 2)).toUpperCase()}
              </div>
              <span className="text-sm text-zinc-200 font-medium">{p.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`badge ${STATUS_COLORS[p.status] || STATUS_COLORS.active}`}>{p.status.replace('_', ' ')}</span>
              {p.open_item_count > 0 && (
                <span className="text-xs text-zinc-500">{p.open_item_count} open</span>
              )}
            </div>
          </Link>
        ))}
        {filtered.length === 0 && <div className="text-center text-zinc-600 py-8 text-sm">No projects found</div>}
      </div>
    </div>
  );
}
