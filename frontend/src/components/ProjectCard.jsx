import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import ItemCard from './ItemCard';
import DraggableItemList from './DraggableItemList';
import { ArrowLeft, Play, Edit3, Save, Plus, Settings, X, Archive, ArchiveRestore, Trash2, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import Avatar from './Avatar';

export default function ProjectCard({ refreshKey, onRefresh, itemUpdate }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [items, setItems] = useState([]);
  const [completedItems, setCompletedItems] = useState([]);
  const [logs, setLogs] = useState([]);
  const [tab, setTab] = useState('items');
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [addNote, setAddNote] = useState('');
  const [editingDetails, setEditingDetails] = useState(false);
  const [availablePeople, setAvailablePeople] = useState([]);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [detailsForm, setDetailsForm] = useState({ name: '', short_code: '', status: '' });
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    api.getProject(id).then(p => {
      setProject(p);
      setNotes(p.context_notes || '');
      setDetailsForm({ name: p.name, short_code: p.short_code || '', status: p.status });
    });
    api.getProjectItems(id, 'open').then(setItems);
    api.getProjectItems(id, 'done').then(setCompletedItems);
    api.getProjectLogs(id).then(setLogs);
    api.listPeople().then(setAvailablePeople);
  }, [id, refreshKey]);

  // Merge WebSocket item updates
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

  const saveDetails = async () => {
    await api.updateProject(id, detailsForm);
    const updated = await api.getProject(id);
    setProject(updated);
    setEditingDetails(false);
  };

  const saveNotes = async () => {
    await api.updateProject(id, { context_notes: notes });
    setEditingNotes(false);
  };

  const addContextNote = async () => {
    if (!addNote.trim()) return;
    const updated = (notes ? notes + '\n' : '') + addNote.trim();
    await api.updateProject(id, { context_notes: updated });
    setNotes(updated);
    setAddNote('');
  };

  const startMeeting = async () => {
    try {
      await api.startMeeting({ project_id: id });
      navigate(`/meeting/project/${id}`);
    } catch (e) {
      if (e.message.includes('409')) {
        if (confirm('There is an active meeting session. End it and start a new one?')) {
          await api.forceEndActiveMeeting();
          await api.startMeeting({ project_id: id });
          navigate(`/meeting/project/${id}`);
        }
      } else {
        alert(e.message);
      }
    }
  };

  const toggleArchive = async () => {
    await api.updateProject(id, { is_archived: !project.is_archived });
    navigate('/projects');
  };

  const handleDelete = async () => {
    await api.deleteProject(id);
    navigate('/projects');
  };

  if (!project) return <div className="p-8 text-zinc-600">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-4">
      <button onClick={() => navigate('/projects')} className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-300 mb-3 transition-colors">
        <ArrowLeft size={14} /> Projects
      </button>

      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-zinc-100">{project.name}</h2>
            <button onClick={() => setEditingDetails(!editingDetails)}
              className="text-zinc-600 hover:text-zinc-300 transition-colors" title="Edit details">
              <Settings size={16} />
            </button>
          </div>
          <p className="text-sm text-zinc-600">{project.short_code ? `[${project.short_code}]` : ''} {project.status.replace('_', ' ')}</p>
        </div>
        <div className="flex items-center gap-2">
          {project.is_archived && (
            <button onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-xs rounded-lg px-3 py-2 text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all">
              <Trash2 size={14} /> Delete
            </button>
          )}
          <button onClick={toggleArchive}
            className="flex items-center gap-1.5 text-xs glass glass-hover rounded-lg px-3 py-2 text-zinc-500 hover:text-zinc-200 transition-all">
            {project.is_archived ? <><ArchiveRestore size={14} /> Restore</> : <><Archive size={14} /> Archive</>}
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
              <label className="text-xs text-zinc-600 mb-0.5 block">Project Name</label>
              <input value={detailsForm.name} onChange={e => setDetailsForm({...detailsForm, name: e.target.value})}
                className="w-full glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" />
            </div>
            <div>
              <label className="text-xs text-zinc-600 mb-0.5 block">Short Code</label>
              <input value={detailsForm.short_code} onChange={e => setDetailsForm({...detailsForm, short_code: e.target.value})}
                className="w-full glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" placeholder="e.g. PBJY" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-zinc-600 mb-0.5 block">Status</label>
              <select value={detailsForm.status} onChange={e => setDetailsForm({...detailsForm, status: e.target.value})}
                className="w-full glass-input rounded px-3 py-1.5 text-sm text-zinc-300 outline-none">
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="complete">Complete</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="col-span-2 flex justify-end gap-2 mt-1">
              <button onClick={() => setEditingDetails(false)} className="text-xs text-zinc-600 px-3 py-1">Cancel</button>
              <button onClick={saveDetails} className="text-xs bg-blue-600/80 hover:bg-blue-500 text-white rounded px-3 py-1.5 border border-blue-500/20 transition-all">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 p-3 glass rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Context Notes</span>
          <button onClick={() => editingNotes ? saveNotes() : setEditingNotes(true)}
            className="text-xs text-zinc-600 hover:text-zinc-300 flex items-center gap-1 transition-colors">
            {editingNotes ? <><Save size={12} /> Save</> : <><Edit3 size={12} /> Edit</>}
          </button>
        </div>
        {editingNotes ? (
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            className="w-full glass-input rounded p-2 text-sm text-zinc-300 outline-none resize-none min-h-[80px]" />
        ) : (
          <pre className="text-sm text-zinc-400 whitespace-pre-wrap font-sans">{notes || 'No context notes yet.'}</pre>
        )}
        <div className="flex gap-2 mt-2">
          <input placeholder="Add context note..." value={addNote} onChange={e => setAddNote(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addContextNote()}
            className="flex-1 glass-input rounded px-2 py-1 text-xs text-zinc-300 outline-none" />
          <button onClick={addContextNote} className="text-xs text-blue-400 hover:text-blue-300 transition-colors"><Plus size={14} /></button>
        </div>
      </div>

      {/* Team Members */}
      <div className="mb-4 p-3 glass rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide flex items-center gap-1"><Users size={12} /> Team</span>
          <button onClick={() => setShowAddPerson(!showAddPerson)} className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors">
            <Plus size={14} />
          </button>
        </div>
        {project.people?.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {project.people.map(pe => (
              <div key={pe.id} className="flex items-center gap-1.5 badge bg-indigo-500/10 text-indigo-400 border border-indigo-500/15">
                <Avatar src={pe.avatar} name={pe.display_name} size="xs" />
                <Link to={`/people/${pe.id}`} className="hover:text-indigo-300">{pe.display_name}</Link>
                <button onClick={async () => { await api.unlinkProjectPerson(id, pe.id); const u = await api.getProject(id); setProject(u); }}
                  className="text-indigo-600 hover:text-indigo-300 ml-0.5"><X size={10} /></button>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-xs text-zinc-700 italic">No team members assigned</span>
        )}
        {showAddPerson && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {availablePeople.filter(pe => !project.people?.some(pp => pp.id === pe.id)).map(pe => (
              <button key={pe.id} onClick={async () => { await api.linkProjectPerson(id, pe.id); const u = await api.getProject(id); setProject(u); setShowAddPerson(false); }}
                className="badge glass glass-hover text-zinc-400 hover:text-zinc-200 cursor-pointer flex items-center gap-1">
                <Avatar src={pe.avatar} name={pe.display_name} size="xs" />
                + {pe.display_name}
              </button>
            ))}
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
            <h3 className="text-lg font-semibold text-zinc-100 mb-2">Permanently delete {project.name}?</h3>
            <p className="text-sm text-zinc-400 mb-5">This will remove this project and all its linked items and history. This cannot be undone.</p>
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
