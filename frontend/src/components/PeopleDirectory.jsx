import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { UserPlus, Search } from 'lucide-react';

const LEVEL_COLORS = {
  director: 'bg-purple-500/20 text-purple-400',
  manager: 'bg-blue-500/20 text-blue-400',
  employee: 'bg-emerald-500/20 text-emerald-400',
  peer: 'bg-amber-500/20 text-amber-400',
  other: 'bg-zinc-500/20 text-zinc-400',
};

export default function PeopleDirectory({ refreshKey }) {
  const [people, setPeople] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', display_name: '', role: '', reporting_level: 'employee', context_notes: '' });

  useEffect(() => { api.listPeople().then(setPeople).catch(console.error); }, [refreshKey]);

  const filtered = people.filter(p =>
    p.display_name.toLowerCase().includes(search.toLowerCase()) ||
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    await api.createPerson({ ...form, display_name: form.display_name || form.name });
    setForm({ name: '', display_name: '', role: '', reporting_level: 'employee', context_notes: '' });
    setShowForm(false);
    api.listPeople().then(setPeople);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-200">People</h2>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-300">
          <UserPlus size={14} /> Add Person
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-4 p-3 bg-zinc-900 border border-zinc-800 rounded-lg grid grid-cols-2 gap-2">
          <input placeholder="Full name *" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" />
          <input placeholder="Display name" value={form.display_name} onChange={e => setForm({...form, display_name: e.target.value})}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" />
          <input placeholder="Role / title" value={form.role} onChange={e => setForm({...form, role: e.target.value})}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" />
          <select value={form.reporting_level} onChange={e => setForm({...form, reporting_level: e.target.value})}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200">
            <option value="director">Director</option>
            <option value="manager">Manager</option>
            <option value="employee">Employee</option>
            <option value="peer">Peer</option>
            <option value="other">Other</option>
          </select>
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
        <input type="text" placeholder="Search people..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-8 pr-3 py-2 text-sm text-zinc-300 outline-none focus:border-zinc-500" />
      </div>

      <div className="flex flex-col gap-1">
        {filtered.map(p => (
          <Link key={p.id} to={`/people/${p.id}`}
            className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-zinc-800/70 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-medium text-zinc-400">
                {p.display_name[0]}
              </div>
              <div>
                <span className="text-sm text-zinc-200 font-medium">{p.display_name}</span>
                {p.role && <span className="text-xs text-zinc-500 ml-2">{p.role}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`badge ${LEVEL_COLORS[p.reporting_level] || LEVEL_COLORS.other}`}>{p.reporting_level}</span>
              {p.open_item_count > 0 && (
                <span className="text-xs text-zinc-500">{p.open_item_count} open</span>
              )}
            </div>
          </Link>
        ))}
        {filtered.length === 0 && <div className="text-center text-zinc-600 py-8 text-sm">No people found</div>}
      </div>
    </div>
  );
}
