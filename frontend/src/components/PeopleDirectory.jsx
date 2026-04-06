import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { UserPlus, Search, Archive, Users, Building2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import Avatar from './Avatar';

const LEVEL_COLORS = {
  executive: 'bg-violet-500/15 text-violet-400 border border-violet-500/20',
  director: 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20',
  manager: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
  ic: 'bg-sky-500/15 text-sky-400 border border-sky-500/20',
};

const LEVEL_LABELS = { executive: 'Executive', director: 'Director', manager: 'Manager', ic: 'IC' };
const PAGE_SIZE = 50;

export default function PeopleDirectory({ refreshKey }) {
  const [people, setPeople] = useState([]);
  const [total, setTotal] = useState(0);
  const [allProjects, setAllProjects] = useState([]);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [scope, setScope] = useState('my_org');
  const [page, setPage] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', display_name: '', role: '', reporting_level: 'ic',
    profile: { spouse: '', anniversary: '', children: '', pets: '', birthday: '', hobbies: '', location: '', general: '' },
    selectedProjects: [],
  });

  useEffect(() => {
    const params = {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    };
    if (showArchived) params.include_archived = 'true';
    if (search) params.search = search;
    if (scope === 'my_org') params.my_org = 'true';
    api.listPeople(params).then(r => {
      setPeople(r.people || r);
      setTotal(r.total || (r.people || r).length);
    }).catch(console.error);
  }, [refreshKey, showArchived, search, scope, page]);

  useEffect(() => { api.listProjects().then(p => setAllProjects(p)).catch(console.error); }, []);
  useEffect(() => { setPage(0); }, [search, scope, showArchived]);

  const displayNameDupe = (() => {
    const dn = (form.display_name || form.name).trim().toLowerCase();
    if (!dn) return null;
    return people.find(p => p.display_name.toLowerCase() === dn);
  })();

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const profileData = {
      ...form.profile,
      children: form.profile.children ? form.profile.children.split(',').map(s => s.trim()).filter(Boolean) : [],
      pets: form.profile.pets ? form.profile.pets.split(',').map(s => s.trim()).filter(Boolean) : [],
    };
    const { selectedProjects, ...personData } = form;
    const newPerson = await api.createPerson({ ...personData, display_name: form.display_name || form.name, profile: profileData });
    for (const proj of selectedProjects) {
      await api.linkPersonProject(newPerson.id, proj.id);
    }
    setForm({ name: '', display_name: '', role: '', reporting_level: 'ic',
      profile: { spouse: '', anniversary: '', children: '', pets: '', birthday: '', hobbies: '', location: '', general: '' },
      selectedProjects: [] });
    setShowForm(false);
    setPage(0);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const showingFrom = page * PAGE_SIZE + 1;
  const showingTo = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 page-transition">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-zinc-200">People</h2>
          <span className="text-xs text-zinc-600">{total}</span>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 text-xs glass glass-hover rounded-lg px-3 py-1.5 text-zinc-400 hover:text-zinc-200 transition-all">
          <UserPlus size={14} /> Add Person
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-4 p-3 glass rounded-lg grid grid-cols-2 gap-2 relative z-20 overflow-visible">
          <input placeholder="Full name *" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
            className="glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" />
          <input placeholder="Display name" value={form.display_name} onChange={e => setForm({...form, display_name: e.target.value})}
            className="glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" />
          <input placeholder="Role / title" value={form.role} onChange={e => setForm({...form, role: e.target.value})}
            className="glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" />
          <select value={form.reporting_level} onChange={e => setForm({...form, reporting_level: e.target.value})}
            className="glass-input rounded px-3 py-1.5 text-sm text-zinc-300">
            <option value="executive">Executive</option>
            <option value="director">Director</option>
            <option value="manager">Manager</option>
            <option value="ic">Individual Contributor</option>
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
          <div className="col-span-2">
            <label className="text-xs text-zinc-600 mb-1 block">Projects</label>
            <ProjectTypeaheadMulti
              projects={allProjects}
              selected={form.selectedProjects}
              onAdd={(proj) => {
                if (!form.selectedProjects.find(p => p.id === proj.id)) {
                  setForm({...form, selectedProjects: [...form.selectedProjects, proj]});
                }
              }}
              onRemove={(projId) => setForm({...form, selectedProjects: form.selectedProjects.filter(p => p.id !== projId)})}
            />
          </div>
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
        <div className="flex gap-1">
          <button onClick={() => setScope('my_org')}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-all ${scope === 'my_org' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'glass text-zinc-500 hover:text-zinc-300'}`}>
            <Users size={12} /> My Org
          </button>
          <button onClick={() => setScope('all')}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-all ${scope === 'all' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'glass text-zinc-500 hover:text-zinc-300'}`}>
            <Building2 size={12} /> All
          </button>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-zinc-600 cursor-pointer whitespace-nowrap">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="rounded" />
          <Archive size={12} /> Archived
        </label>
      </div>

      <div className="flex flex-col gap-1">
        {people.map(p => (
          <Link key={p.id} to={`/people/${p.id}`}
            className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/[0.04] transition-all">
            <div className="flex items-center gap-3">
              <Avatar src={p.avatar} name={p.display_name} size="md" />
              <div>
                <span className={`text-sm font-medium ${p.is_archived ? 'text-zinc-500' : 'text-zinc-200'}`} title={p.name}>{p.display_name}</span>
                {p.is_archived && <span className="text-xs text-zinc-600 ml-1.5 badge bg-zinc-500/10 border border-zinc-500/15">archived</span>}
                {p.role && <span className="text-xs text-zinc-600 ml-2">{p.role}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {p.open_item_count > 0 && (
                <span className="text-xs text-zinc-600">{p.open_item_count} open</span>
              )}
              <span className={`badge ${LEVEL_COLORS[p.reporting_level] || 'bg-zinc-500/10 text-zinc-500 border border-zinc-500/15'}`}>{LEVEL_LABELS[p.reporting_level] || p.reporting_level}</span>
            </div>
          </Link>
        ))}
        {people.length === 0 && <div className="text-center text-zinc-700 py-8 text-sm">No people found</div>}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.06]">
          <span className="text-xs text-zinc-600">{showingFrom}–{showingTo} of {total}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="p-1 glass rounded text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-all">
              <ChevronLeft size={14} />
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="p-1 glass rounded text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-all">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


function ProjectTypeaheadMulti({ projects, selected, onAdd, onRemove }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  const filtered = projects.filter(p =>
    !p.is_archived &&
    !selected.find(s => s.id === p.id) &&
    (query === '' ||
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      (p.short_code && p.short_code.toLowerCase().includes(query.toLowerCase())))
  ).slice(0, 10);

  const handleSelect = (project) => {
    onAdd(project);
    setQuery('');
    setOpen(false);
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
    <div>
      <div ref={containerRef} className="relative z-50">
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); setHighlightIdx(0); }}
          onFocus={() => { if (query) setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder="Add project..."
          className="w-full glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none"
        />
        {open && query.length > 0 && filtered.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border border-white/10 max-h-48 overflow-y-auto shadow-xl bg-zinc-900/95 backdrop-blur-xl">
            {filtered.map((p, idx) => (
              <button key={p.id} type="button" onClick={() => handleSelect(p)}
                className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                  idx === highlightIdx ? 'bg-blue-500/15 text-zinc-200' : 'text-zinc-300 hover:bg-white/[0.04]'
                }`}>
                {p.name} {p.short_code && <span className="text-xs text-zinc-600">[{p.short_code}]</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selected.map(pr => (
            <div key={pr.id} className="flex items-center gap-1.5 badge bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <span>{pr.short_code || pr.name}</span>
              <button type="button" onClick={() => onRemove(pr.id)}
                className="text-cyan-600 hover:text-cyan-300 ml-0.5"><X size={10} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
