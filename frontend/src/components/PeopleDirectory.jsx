import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { UserPlus, Search, Archive } from 'lucide-react';
import Avatar from './Avatar';

const LEVEL_COLORS = {
  director: 'bg-violet-500/15 text-violet-400 border border-violet-500/20',
  manager: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
  employee: 'bg-sky-500/15 text-sky-400 border border-sky-500/20',
  peer: 'bg-slate-500/15 text-slate-400 border border-slate-500/20',
  other: 'bg-zinc-500/10 text-zinc-500 border border-zinc-500/15',
};

export default function PeopleDirectory({ refreshKey }) {
  const [people, setPeople] = useState([]);
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', display_name: '', role: '', reporting_level: 'employee',
    profile: { spouse: '', anniversary: '', children: '', pets: '', birthday: '', hobbies: '', location: '', general: '' },
    selectedProjectIds: [],
  });

  useEffect(() => { api.listPeople(showArchived).then(setPeople).catch(console.error); }, [refreshKey, showArchived]);
  useEffect(() => { api.listProjects().then(setProjects).catch(console.error); }, []);
  const displayNameDupe = (() => {
    const dn = (form.display_name || form.name).trim().toLowerCase();
    if (!dn) return null;
    return people.find(p => p.display_name.toLowerCase() === dn);
  })();

  const filtered = people.filter(p =>
    p.display_name.toLowerCase().includes(search.toLowerCase()) ||
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const profileData = {
      ...form.profile,
      children: form.profile.children ? form.profile.children.split(',').map(s => s.trim()).filter(Boolean) : [],
      pets: form.profile.pets ? form.profile.pets.split(',').map(s => s.trim()).filter(Boolean) : [],
    };
    const { selectedProjectIds, ...personData } = form;
    const newPerson = await api.createPerson({ ...personData, display_name: form.display_name || form.name, profile: profileData });
    // Link selected projects
    for (const projId of selectedProjectIds) {
      await api.linkPersonProject(newPerson.id, projId);
    }
    setForm({ name: '', display_name: '', role: '', reporting_level: 'employee',
      profile: { spouse: '', anniversary: '', children: '', pets: '', birthday: '', hobbies: '', location: '', general: '' },
      selectedProjectIds: [] });
    setShowForm(false);
    api.listPeople(showArchived).then(setPeople);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-200">People</h2>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 text-xs glass glass-hover rounded-lg px-3 py-1.5 text-zinc-400 hover:text-zinc-200 transition-all">
          <UserPlus size={14} /> Add Person
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-4 p-3 glass rounded-lg grid grid-cols-2 gap-2">
          <input placeholder="Full name *" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
            className="glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" />
          <input placeholder="Display name" value={form.display_name} onChange={e => setForm({...form, display_name: e.target.value})}
            className="glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" />
          <input placeholder="Role / title" value={form.role} onChange={e => setForm({...form, role: e.target.value})}
            className="glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" />
          <select value={form.reporting_level} onChange={e => setForm({...form, reporting_level: e.target.value})}
            className="glass-input rounded px-3 py-1.5 text-sm text-zinc-300">
            <option value="director">Director</option>
            <option value="manager">Manager</option>
            <option value="employee">Employee</option>
            <option value="peer">Peer</option>
            <option value="other">Other</option>
          </select>
          <div className="col-span-2 border-t border-white/[0.04] pt-2 mt-1">
            <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Profile (optional)</span>
          </div>
          <input placeholder="Spouse / Partner" value={form.profile.spouse} onChange={e => setForm({...form, profile: {...form.profile, spouse: e.target.value}})}
            className="glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" />
          <input placeholder="Birthday" value={form.profile.birthday} onChange={e => setForm({...form, profile: {...form.profile, birthday: e.target.value}})}
            className="glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" />
          <input placeholder="Anniversary" value={form.profile.anniversary} onChange={e => setForm({...form, profile: {...form.profile, anniversary: e.target.value}})}
            className="glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" />
          <input placeholder="Location" value={form.profile.location} onChange={e => setForm({...form, profile: {...form.profile, location: e.target.value}})}
            className="glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" />
          <input placeholder="Children (comma separated)" value={form.profile.children} onChange={e => setForm({...form, profile: {...form.profile, children: e.target.value}})}
            className="glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" />
          <input placeholder="Pets (comma separated)" value={form.profile.pets} onChange={e => setForm({...form, profile: {...form.profile, pets: e.target.value}})}
            className="glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" />
          <input placeholder="Hobbies" value={form.profile.hobbies} onChange={e => setForm({...form, profile: {...form.profile, hobbies: e.target.value}})}
            className="col-span-2 glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" />
          <textarea placeholder="General notes..." value={form.profile.general} onChange={e => setForm({...form, profile: {...form.profile, general: e.target.value}})}
            className="col-span-2 glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none resize-none h-16" />
          {projects.length > 0 && (
            <div className="col-span-2">
              <label className="text-xs text-zinc-600 mb-1 block">Projects</label>
              <div className="flex flex-wrap gap-1.5">
                {projects.map(pr => {
                  const selected = form.selectedProjectIds.includes(pr.id);
                  return (
                    <button key={pr.id} type="button"
                      onClick={() => setForm({...form, selectedProjectIds: selected
                        ? form.selectedProjectIds.filter(pid => pid !== pr.id)
                        : [...form.selectedProjectIds, pr.id]
                      })}
                      className={`badge cursor-pointer transition-all ${selected
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                        : 'glass text-zinc-500 hover:text-zinc-300'
                      }`}>
                      {pr.short_code || pr.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {displayNameDupe && (
            <div className="col-span-2 p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
              Display name "{form.display_name || form.name}" is already used by <strong>{displayNameDupe.name}</strong>. Consider a unique name (e.g. first name + last initial) to avoid linking confusion.
            </div>
          )}
          <div className="col-span-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="text-xs text-zinc-600 px-3 py-1">Cancel</button>
            <button type="submit" className="text-xs bg-blue-600/80 hover:bg-blue-500 text-white rounded px-3 py-1.5 border border-blue-500/20 transition-all">Create</button>
          </div>
        </form>
      )}

      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input type="text" placeholder="Search people..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full glass-input rounded-lg pl-8 pr-3 py-2 text-sm text-zinc-300 outline-none" />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-zinc-600 cursor-pointer whitespace-nowrap">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="rounded" />
          <Archive size={12} /> Archived
        </label>
      </div>

      <div className="flex flex-col gap-1">
        {filtered.map(p => (
          <Link key={p.id} to={`/people/${p.id}`}
            className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/[0.04] transition-all">
            <div className="flex items-center gap-3">
              <Avatar src={p.avatar} name={p.display_name} size="md" />
              <div>
                <span className={`text-sm font-medium ${p.is_archived ? 'text-zinc-500' : 'text-zinc-200'}`}>{p.display_name}</span>
                {p.is_archived && <span className="text-xs text-zinc-600 ml-1.5 badge bg-zinc-500/10 border border-zinc-500/15">archived</span>}
                {p.role && <span className="text-xs text-zinc-600 ml-2">{p.role}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`badge ${LEVEL_COLORS[p.reporting_level] || LEVEL_COLORS.other}`}>{p.reporting_level}</span>
              {p.open_item_count > 0 && (
                <span className="text-xs text-zinc-600">{p.open_item_count} open</span>
              )}
            </div>
          </Link>
        ))}
        {filtered.length === 0 && <div className="text-center text-zinc-700 py-8 text-sm">No people found</div>}
      </div>
    </div>
  );
}
