import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client';
import ItemCard from './ItemCard';
import { ArrowLeft, Play, Edit3, Save, Plus } from 'lucide-react';

export default function PersonProfile({ refreshKey, onRefresh }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [person, setPerson] = useState(null);
  const [items, setItems] = useState([]);
  const [logs, setLogs] = useState([]);
  const [tab, setTab] = useState('items');
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [addNote, setAddNote] = useState('');

  useEffect(() => {
    api.getPerson(id).then(p => { setPerson(p); setNotes(p.context_notes || ''); });
    api.getPersonItems(id).then(setItems);
    api.getPersonLogs(id).then(setLogs);
  }, [id, refreshKey]);

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
      const session = await api.startMeeting({ person_id: id });
      navigate(`/meeting/person/${id}`);
    } catch (e) {
      alert(e.message);
    }
  };

  if (!person) return <div className="p-8 text-zinc-500">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-4">
      <button onClick={() => navigate('/people')} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 mb-3">
        <ArrowLeft size={14} /> People
      </button>

      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">{person.display_name}</h2>
          <p className="text-sm text-zinc-500">{person.role || 'No role set'} &middot; {person.reporting_level}</p>
        </div>
        <button onClick={startMeeting}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-4 py-2 rounded-lg">
          <Play size={14} /> Start Meeting
        </button>
      </div>

      {/* Context Notes */}
      <div className="mb-4 p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Context Notes</span>
          <button onClick={() => editingNotes ? saveNotes() : setEditingNotes(true)}
            className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
            {editingNotes ? <><Save size={12} /> Save</> : <><Edit3 size={12} /> Edit</>}
          </button>
        </div>
        {editingNotes ? (
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-300 outline-none resize-none min-h-[80px]" />
        ) : (
          <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-sans">{notes || 'No context notes yet.'}</pre>
        )}
        <div className="flex gap-2 mt-2">
          <input placeholder="Add context note..." value={addNote} onChange={e => setAddNote(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addContextNote()}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 outline-none" />
          <button onClick={addContextNote} className="text-xs text-emerald-500 hover:text-emerald-400"><Plus size={14} /></button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-zinc-800 mb-3">
        <button onClick={() => setTab('items')}
          className={`pb-2 text-sm ${tab === 'items' ? 'text-zinc-100 border-b-2 border-emerald-500' : 'text-zinc-500 hover:text-zinc-300'}`}>
          Open Items ({items.length})
        </button>
        <button onClick={() => setTab('history')}
          className={`pb-2 text-sm ${tab === 'history' ? 'text-zinc-100 border-b-2 border-emerald-500' : 'text-zinc-500 hover:text-zinc-300'}`}>
          History ({logs.length})
        </button>
      </div>

      {tab === 'items' && (
        <div className="flex flex-col gap-2">
          {items.length === 0 && <div className="text-center text-zinc-600 py-8 text-sm">No open items</div>}
          {items.map(item => <ItemCard key={item.id} item={item} onUpdate={onRefresh} compact />)}
        </div>
      )}

      {tab === 'history' && (
        <div className="flex flex-col gap-2">
          {logs.length === 0 && <div className="text-center text-zinc-600 py-8 text-sm">No history</div>}
          {logs.map(l => (
            <div key={l.id} className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <span className="badge bg-zinc-700 text-zinc-400">{l.log_type.replace('_', ' ')}</span>
                <span className="text-xs text-zinc-600">{new Date(l.created_at).toLocaleDateString()}</span>
              </div>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap">{l.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
