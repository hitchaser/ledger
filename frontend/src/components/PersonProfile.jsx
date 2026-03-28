import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import ItemCard from './ItemCard';
import { ArrowLeft, Play, Edit3, Save, Plus, Settings, X } from 'lucide-react';

export default function PersonProfile({ refreshKey, onRefresh }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [person, setPerson] = useState(null);
  const [items, setItems] = useState([]);
  const [completedItems, setCompletedItems] = useState([]);
  const [logs, setLogs] = useState([]);
  const [tab, setTab] = useState('items');
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [addNote, setAddNote] = useState('');
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsForm, setDetailsForm] = useState({ name: '', display_name: '', role: '', reporting_level: '', email: '' });

  useEffect(() => {
    api.getPerson(id).then(p => {
      setPerson(p);
      setNotes(p.context_notes || '');
      setDetailsForm({ name: p.name, display_name: p.display_name, role: p.role || '', reporting_level: p.reporting_level, email: p.email || '' });
    });
    api.getPersonItems(id, 'open').then(setItems);
    api.getPersonItems(id, 'done').then(setCompletedItems);
    api.getPersonLogs(id).then(setLogs);
  }, [id, refreshKey]);

  const saveDetails = async () => {
    await api.updatePerson(id, detailsForm);
    const updated = await api.getPerson(id);
    setPerson(updated);
    setEditingDetails(false);
  };

  const saveNotes = async () => {
    await api.updatePerson(id, { context_notes: notes });
    setEditingNotes(false);
  };

  const addContextNote = async () => {
    if (!addNote.trim()) return;
    const date = new Date().toISOString().split('T')[0];
    const updated = (notes ? notes + '\n' : '') + `[${date}] ${addNote.trim()}`;
    await api.updatePerson(id, { context_notes: updated });
    setNotes(updated);
    setAddNote('');
  };

  const startMeeting = async () => {
    try {
      await api.startMeeting({ person_id: id });
      navigate(`/meeting/person/${id}`);
    } catch (e) {
      alert(e.message);
    }
  };

  if (!person) return <div className="p-8 text-zinc-600">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-4">
      <button onClick={() => navigate('/people')} className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-300 mb-3 transition-colors">
        <ArrowLeft size={14} /> People
      </button>

      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-zinc-100">{person.display_name}</h2>
            <button onClick={() => setEditingDetails(!editingDetails)}
              className="text-zinc-600 hover:text-zinc-300 transition-colors" title="Edit details">
              <Settings size={16} />
            </button>
          </div>
          <p className="text-sm text-zinc-600">{person.role || 'No role set'} &middot; {person.reporting_level}{person.email ? ` · ${person.email}` : ''}</p>
        </div>
        <button onClick={startMeeting}
          className="flex items-center gap-1.5 bg-blue-600/80 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg border border-blue-500/20 transition-all">
          <Play size={14} /> Start Meeting
        </button>
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
                <option value="director">Director</option>
                <option value="manager">Manager</option>
                <option value="employee">Employee</option>
                <option value="peer">Peer</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-zinc-600 mb-0.5 block">Email</label>
              <input value={detailsForm.email} onChange={e => setDetailsForm({...detailsForm, email: e.target.value})}
                className="w-full glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none" />
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
        <div className="flex flex-col gap-2">
          {items.length === 0 && <div className="text-center text-zinc-700 py-8 text-sm">No open items</div>}
          {items.map(item => <ItemCard key={item.id} item={item} onUpdate={onRefresh} compact />)}
        </div>
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
    </div>
  );
}
