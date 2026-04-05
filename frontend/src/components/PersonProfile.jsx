import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import ItemCard from './ItemCard';
import DraggableItemList from './DraggableItemList';
import AvatarUpload from './AvatarUpload';
import PersonTypeahead from './PersonTypeahead';
import { ArrowLeft, Play, Edit3, Save, Plus, Settings, X, Archive, ArchiveRestore, Trash2, FolderKanban, GitBranch } from 'lucide-react';
import { Link } from 'react-router-dom';

const DEFAULT_PROFILE = {
  spouse: '', anniversary: '', children: [], pets: [],
  birthday: '', hobbies: '', location: '', general: ''
};

const PROFILE_FIELDS = [
  { key: 'spouse', label: 'Spouse / Partner' },
  { key: 'anniversary', label: 'Anniversary' },
  { key: 'birthday', label: 'Birthday' },
  { key: 'children', label: 'Children', isList: true },
  { key: 'pets', label: 'Pets', isList: true },
  { key: 'hobbies', label: 'Hobbies' },
  { key: 'location', label: 'Location' },
  { key: 'address', label: 'Address' },
];

function displayValue(val, isList) {
  if (isList) return val && val.length > 0 ? val.join(', ') : 'Unknown';
  return val || 'Unknown';
}

export default function PersonProfile({ refreshKey, onRefresh, itemUpdate }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [person, setPerson] = useState(null);
  const [items, setItems] = useState([]);
  const [completedItems, setCompletedItems] = useState([]);
  const [logs, setLogs] = useState([]);
  const [tab, setTab] = useState('items');
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsForm, setDetailsForm] = useState({ name: '', display_name: '', role: '', reporting_level: '', email: '', manager_id: '' });
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ ...DEFAULT_PROFILE });
  const [allPeople, setAllPeople] = useState([]); // For display name dupe check
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [quickNote, setQuickNote] = useState('');
  const [availableProjects, setAvailableProjects] = useState([]);
  const [showAddProject, setShowAddProject] = useState(false);

  useEffect(() => {
    api.getPerson(id).then(p => {
      setPerson(p);
      setDetailsForm({ name: p.name, display_name: p.display_name, role: p.role || '', reporting_level: p.reporting_level, email: p.email || '', manager_id: p.manager_id || '' });
      setProfileForm({ ...DEFAULT_PROFILE, ...(p.profile || {}) });
    });
    api.getPersonItems(id, 'open').then(setItems);
    api.getPersonItems(id, 'done').then(setCompletedItems);
    api.getPersonLogs(id).then(setLogs);
    api.listPeople({ limit: 5000 }).then(r => setAllPeople(r.people || r));
    api.listProjects().then(setAvailableProjects);
  }, [id, refreshKey]);

  // Merge WebSocket item updates into local state
  useEffect(() => {
    if (!itemUpdate) return;
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === itemUpdate.id);
      if (idx >= 0) { const u = [...prev]; u[idx] = itemUpdate; return u; }
      return prev;
    });
    setCompletedItems(prev => {
      const idx = prev.findIndex(i => i.id === itemUpdate.id);
      if (idx >= 0) { const u = [...prev]; u[idx] = itemUpdate; return u; }
      return prev;
    });
  }, [itemUpdate]);

  const detailsDisplayNameDupe = (() => {
    const dn = detailsForm.display_name.trim().toLowerCase();
    if (!dn) return null;
    return allPeople.find(p => p.display_name.toLowerCase() === dn && p.id !== id);
  })();

  const profile = person?.profile ? { ...DEFAULT_PROFILE, ...person.profile } : DEFAULT_PROFILE;

  const saveDetails = async () => {
    await api.updatePerson(id, detailsForm);
    const updated = await api.getPerson(id);
    setPerson(updated);
    setEditingDetails(false);
  };

  const saveProfile = async () => {
    // Convert comma-separated strings back to arrays for list fields
    const profileData = { ...profileForm };
    if (typeof profileData.children === 'string') {
      profileData.children = profileData.children.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (typeof profileData.pets === 'string') {
      profileData.pets = profileData.pets.split(',').map(s => s.trim()).filter(Boolean);
    }
    await api.updatePerson(id, { profile: profileData });
    const updated = await api.getPerson(id);
    setPerson(updated);
    setProfileForm({ ...DEFAULT_PROFILE, ...(updated.profile || {}) });
    setEditingProfile(false);
  };

  const startMeeting = async () => {
    try {
      await api.startMeeting({ person_id: id });
      navigate(`/meeting/person/${id}`);
    } catch (e) {
      if (e.message.includes('409')) {
        if (confirm('There is an active meeting session. End it and start a new one?')) {
          await api.forceEndActiveMeeting();
          await api.startMeeting({ person_id: id });
          navigate(`/meeting/person/${id}`);
        }
      } else {
        alert(e.message);
      }
    }
  };

  const toggleArchive = async () => {
    await api.updatePerson(id, { is_archived: !person.is_archived });
    navigate('/people');
  };

  const handleDelete = async () => {
    await api.deletePerson(id);
    navigate('/people');
  };

  if (!person) return <div className="p-8 text-zinc-600">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-4">
      <button onClick={() => navigate('/people')} className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-300 mb-3 transition-colors">
        <ArrowLeft size={14} /> People
      </button>

      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-4">
          <AvatarUpload
            src={person.avatar}
            name={person.display_name}
            onUpload={async (dataUrl) => { await api.updatePerson(id, { avatar: dataUrl }); const u = await api.getPerson(id); setPerson(u); }}
            onRemove={async () => { await api.updatePerson(id, { avatar: '' }); const u = await api.getPerson(id); setPerson(u); }}
          />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-zinc-100">{person.display_name}</h2>
              <button onClick={() => setEditingDetails(!editingDetails)}
                className="text-zinc-600 hover:text-zinc-300 transition-colors" title="Edit details">
                <Settings size={16} />
              </button>
            </div>
            {person.name !== person.display_name && <p className="text-xs text-zinc-500">{person.name}</p>}
            <p className="text-sm text-zinc-600">
              {person.role || 'No role set'} &middot; {({'executive':'Executive','manager':'Management','ic':'IC'})[person.reporting_level] || person.reporting_level}
              {person.email ? ` · ${person.email}` : ''}
              {person.manager && <> &middot; Reports to <Link to={`/people/${person.manager.id}`} className="text-blue-400 hover:text-blue-300">{person.manager.display_name}</Link></>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {person.is_archived && (
            <button onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-xs rounded-lg px-3 py-2 text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all">
              <Trash2 size={14} /> Delete
            </button>
          )}
          <button onClick={() => navigate(`/org-chart?focus=${id}`)}
            className="flex items-center gap-1.5 text-xs glass glass-hover rounded-lg px-3 py-2 text-zinc-500 hover:text-zinc-200 transition-all">
            <GitBranch size={14} /> See Org
          </button>
          <button onClick={toggleArchive}
            className="flex items-center gap-1.5 text-xs glass glass-hover rounded-lg px-3 py-2 text-zinc-500 hover:text-zinc-200 transition-all">
            {person.is_archived ? <><ArchiveRestore size={14} /> Restore</> : <><Archive size={14} /> Archive</>}
          </button>
          <button onClick={startMeeting}
            className="flex items-center gap-1.5 bg-blue-600/80 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg border border-blue-500/20 transition-all">
            <Play size={14} /> Start Meeting
          </button>
        </div>
      </div>

      {editingDetails && (
        <div className="mb-4 p-3 glass rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Edit Details</span>
            <button onClick={() => setEditingDetails(false)} className="text-zinc-600 hover:text-zinc-300"><X size={14} /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-zinc-600 mb-0.5 block">Full Name</label>
              <input value={detailsForm.name} onChange={e => setDetailsForm({...detailsForm, name: e.target.value})}
                className="w-full glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" />
            </div>
            <div>
              <label className="text-xs text-zinc-600 mb-0.5 block">Display Name</label>
              <input value={detailsForm.display_name} onChange={e => setDetailsForm({...detailsForm, display_name: e.target.value})}
                className="w-full glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" />
            </div>
            <div>
              <label className="text-xs text-zinc-600 mb-0.5 block">Role / Title</label>
              <input value={detailsForm.role} onChange={e => setDetailsForm({...detailsForm, role: e.target.value})}
                className="w-full glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" />
            </div>
            <div>
              <label className="text-xs text-zinc-600 mb-0.5 block">Reporting Level</label>
              <select value={detailsForm.reporting_level} onChange={e => setDetailsForm({...detailsForm, reporting_level: e.target.value})}
                className="w-full glass-input rounded px-3 py-1.5 text-sm text-zinc-300 outline-none">
                <option value="executive">Executive</option>
                <option value="manager">Management</option>
                <option value="ic">Individual Contributor</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-600 mb-0.5 block">Email</label>
              <input value={detailsForm.email} onChange={e => setDetailsForm({...detailsForm, email: e.target.value})}
                className="w-full glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" />
            </div>
            <div>
              <label className="text-xs text-zinc-600 mb-0.5 block">Reports To</label>
              <PersonTypeahead
                value={detailsForm.manager_id || null}
                onChange={(p) => setDetailsForm({...detailsForm, manager_id: p?.id || ''})}
                exclude={[id]}
                placeholder="Search for manager..."
              />
            </div>
            {detailsDisplayNameDupe && (
              <div className="col-span-2 p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                Display name "{detailsForm.display_name}" is already used by <strong>{detailsDisplayNameDupe.name}</strong>. Consider a unique name to avoid linking confusion.
              </div>
            )}
            <div className="col-span-2 flex justify-end gap-2 mt-1">
              <button onClick={() => setEditingDetails(false)} className="text-xs text-zinc-600 px-3 py-1">Cancel</button>
              <button onClick={saveDetails} className="text-xs bg-blue-600/80 hover:bg-blue-500 text-white rounded px-3 py-1.5 border border-blue-500/20 transition-all">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Structured Profile Card */}
      <div className="mb-4 p-3 glass rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Profile</span>
          <button onClick={() => {
            if (editingProfile) { saveProfile(); } else {
              setProfileForm({
                ...DEFAULT_PROFILE, ...profile,
                children: Array.isArray(profile.children) ? profile.children.join(', ') : profile.children || '',
                pets: Array.isArray(profile.pets) ? profile.pets.join(', ') : profile.pets || '',
              });
              setEditingProfile(true);
            }
          }}
            className="text-xs text-zinc-600 hover:text-zinc-300 flex items-center gap-1 transition-colors">
            {editingProfile ? <><Save size={12} /> Save</> : <><Edit3 size={12} /> Edit</>}
          </button>
        </div>

        {editingProfile ? (
          <div className="grid grid-cols-2 gap-2">
            {PROFILE_FIELDS.map(({ key, label, isList }) => (
              <div key={key}>
                <label className="text-xs text-zinc-600 mb-0.5 block">{label}{isList ? ' (comma separated)' : ''}</label>
                <input
                  value={profileForm[key] || ''}
                  onChange={e => setProfileForm({ ...profileForm, [key]: e.target.value })}
                  placeholder="Unknown"
                  className="w-full glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none"
                />
              </div>
            ))}
            <div className="col-span-2">
              <label className="text-xs text-zinc-600 mb-0.5 block">General Notes</label>
              <textarea
                value={profileForm.general || ''}
                onChange={e => setProfileForm({ ...profileForm, general: e.target.value })}
                placeholder="Any additional notes..."
                className="w-full glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none resize-y min-h-[160px]"
              />
            </div>
            <div className="col-span-2 flex justify-end gap-2 mt-1">
              <button onClick={() => setEditingProfile(false)} className="text-xs text-zinc-600 px-3 py-1">Cancel</button>
              <button onClick={saveProfile} className="text-xs bg-blue-600/80 hover:bg-blue-500 text-white rounded px-3 py-1.5 border border-blue-500/20 transition-all">Save Profile</button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {PROFILE_FIELDS.map(({ key, label, isList }) => {
              const val = profile[key];
              const display = displayValue(val, isList);
              const isUnknown = display === 'Unknown';
              return (
                <div key={key} className="flex items-baseline gap-3">
                  <span className="text-xs text-zinc-600 w-28 flex-shrink-0 text-right">{label}</span>
                  <span className={`text-sm ${isUnknown ? 'text-zinc-700 italic' : 'text-zinc-300'}`}>{display}</span>
                </div>
              );
            })}
            {profile.general && (
              <>
                <div className="border-t border-white/[0.04] my-2" />
                <div>
                  <span className="text-xs text-zinc-600">General Notes</span>
                  <pre className="text-sm text-zinc-400 whitespace-pre-wrap font-sans mt-1">{profile.general}</pre>
                </div>
              </>
            )}
          </div>
        )}

        {/* Assigned Projects */}
        {!editingProfile && (
          <div className="mt-3 pt-2 border-t border-white/[0.04]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-zinc-600 flex items-center gap-1"><FolderKanban size={12} /> Projects</span>
              <button onClick={() => setShowAddProject(!showAddProject)} className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors">
                <Plus size={14} />
              </button>
            </div>
            {person.projects?.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {person.projects.map(pr => (
                  <div key={pr.id} className="badge bg-cyan-500/10 text-cyan-400 border border-cyan-500/15 flex items-center gap-1">
                    <Link to={`/projects/${pr.id}`} className="hover:text-cyan-300">{pr.short_code || pr.name}</Link>
                    <button onClick={async () => { await api.unlinkPersonProject(id, pr.id); const u = await api.getPerson(id); setPerson(u); }}
                      className="text-cyan-600 hover:text-cyan-300 ml-0.5"><X size={10} /></button>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-xs text-zinc-700 italic">No projects assigned</span>
            )}
            {showAddProject && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {availableProjects.filter(pr => !person.projects?.some(pp => pp.id === pr.id)).map(pr => (
                  <button key={pr.id} onClick={async () => { await api.linkPersonProject(id, pr.id); const u = await api.getPerson(id); setPerson(u); setShowAddProject(false); }}
                    className="badge glass glass-hover text-zinc-400 hover:text-zinc-200 cursor-pointer">
                    + {pr.short_code || pr.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Quick add to general notes */}
        {!editingProfile && (
          <div className="flex gap-2 mt-3 pt-2 border-t border-white/[0.04]">
            <input placeholder="Add to general notes..." value={quickNote}
              onChange={e => setQuickNote(e.target.value)}
              onKeyDown={async e => {
                if (e.key === 'Enter' && quickNote.trim()) {
                  const p = { ...DEFAULT_PROFILE, ...profile };
                  const existing = p.general || '';
                  p.general = (existing ? existing + '\n' : '') + quickNote.trim();
                  await api.updatePerson(id, { profile: p });
                  setQuickNote('');
                  const updated = await api.getPerson(id);
                  setPerson(updated);
                  setProfileForm({ ...DEFAULT_PROFILE, ...(updated.profile || {}) });
                }
              }}
              className="flex-1 glass-input rounded px-2 py-1 text-xs text-zinc-300 outline-none" />
          </div>
        )}
      </div>

      <div className="flex gap-4 border-b border-white/[0.06] mb-3">
        <button onClick={() => setTab('items')}
          className={`pb-2 text-sm transition-colors ${tab === 'items' ? 'text-zinc-100 border-b-2 border-blue-500' : 'text-zinc-600 hover:text-zinc-300'}`}>
          Open ({items.length})
        </button>
        <button onClick={() => setTab('completed')}
          className={`pb-2 text-sm transition-colors ${tab === 'completed' ? 'text-zinc-100 border-b-2 border-blue-500' : 'text-zinc-600 hover:text-zinc-300'}`}>
          Completed ({completedItems.length})
        </button>
        <button onClick={() => setTab('history')}
          className={`pb-2 text-sm transition-colors ${tab === 'history' ? 'text-zinc-100 border-b-2 border-blue-500' : 'text-zinc-600 hover:text-zinc-300'}`}>
          History ({logs.length})
        </button>
      </div>

      {tab === 'items' && (
        <DraggableItemList items={items} setItems={setItems} onUpdate={onRefresh} compact />
      )}

      {tab === 'completed' && (
        <div className="flex flex-col gap-2">
          {completedItems.length === 0 && <div className="text-center text-zinc-700 py-8 text-sm">No completed items</div>}
          {completedItems.map(item => <ItemCard key={item.id} item={item} onUpdate={onRefresh} compact readonly />)}
        </div>
      )}

      {tab === 'history' && (
        <div className="flex flex-col gap-2">
          {logs.length === 0 && <div className="text-center text-zinc-700 py-8 text-sm">No history</div>}
          {logs.map(l => (
            <div key={l.id} className="p-3 glass rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <span className="badge bg-white/5 text-zinc-500 border border-white/10">{l.log_type.replace('_', ' ')}</span>
                <span className="text-xs text-zinc-700">{new Date(l.created_at).toLocaleDateString()}</span>
              </div>
              <p className="text-sm text-zinc-400 whitespace-pre-wrap">{l.content}</p>
            </div>
          ))}
        </div>
      )}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass rounded-xl max-w-sm w-full p-6 border-white/10 shadow-2xl shadow-black/40">
            <h3 className="text-lg font-semibold text-zinc-100 mb-2">Permanently delete {person.display_name}?</h3>
            <p className="text-sm text-zinc-400 mb-5">This will remove this person and all their linked items and history. This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-zinc-500 px-3 py-1.5">Cancel</button>
              <button onClick={handleDelete}
                className="text-xs bg-rose-600/80 hover:bg-rose-500 text-white rounded px-3 py-1.5 border border-rose-500/20 transition-all">
                Yes, delete permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
