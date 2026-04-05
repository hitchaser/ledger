import { useState } from 'react';
import { Check, X, Loader2, ChevronDown, ChevronUp, Pencil, Save, Pin, PinOff, Calendar, MessageSquare, Link2, Repeat, Plus, User, FolderKanban } from 'lucide-react';
import { api } from '../api/client';
import { Link } from 'react-router-dom';
import Avatar from './Avatar';

const TYPE_COLORS = {
  followup: 'bg-sky-500/15 text-sky-400 border border-sky-500/20',
  todo: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
  reminder: 'bg-rose-500/15 text-rose-400 border border-rose-500/20',
  discussion: 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20',
  goal: 'bg-violet-500/15 text-violet-400 border border-violet-500/20',
  note: 'bg-slate-500/15 text-slate-400 border border-slate-500/20',
  profile_update: 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20',
};

const RECURRENCE_OPTIONS = ['', 'daily', 'weekly', 'biweekly', 'monthly'];
const TYPE_OPTIONS = ['', 'todo', 'followup', 'reminder', 'discussion', 'goal', 'note'];

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDueDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = d - now;
  const days = Math.ceil(diff / 86400000);
  if (days < 0) return `Overdue ${Math.abs(days)}d`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

export default function ItemCard({ item, onUpdate, compact = false, readonly = false }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [editType, setEditType] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editRecurrence, setEditRecurrence] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [showPredPicker, setShowPredPicker] = useState(false);
  const [openItems, setOpenItems] = useState([]);
  const [predSearch, setPredSearch] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showRecurrencePicker, setShowRecurrencePicker] = useState(false);
  const type = item.effective_type;
  const isProcessing = !item.ai_processed_at && !item.manual_type;
  const isDone = item.status === 'done';
  const displayText = (!expanded && !editing && item.raw_text.length > 120) ? item.raw_text.slice(0, 120) + '...' : item.raw_text;
  const dueLabel = formatDueDate(item.due_date);
  const isOverdue = item.due_date && new Date(item.due_date) < new Date() && !isDone;

  const markDone = async () => {
    await api.updateCapture(item.id, { status: 'done' });
    onUpdate?.();
  };

  const reopen = async () => {
    await api.updateCapture(item.id, { status: 'open' });
    onUpdate?.();
  };

  const deleteItem = async () => {
    await api.deleteCapture(item.id);
    onUpdate?.();
  };

  const togglePin = async () => {
    await api.updateCapture(item.id, { is_pinned: !item.is_pinned });
    onUpdate?.();
  };

  const startEdit = async () => {
    setEditText(item.raw_text);
    setEditType(item.manual_type || item.effective_type || '');
    setEditDueDate(item.due_date ? new Date(item.due_date).toISOString().split('T')[0] : '');
    setEditRecurrence(item.recurrence || '');
    setEditing(true);
    // Load open items for predecessor picker
    const items = await api.listCaptures({ status: 'open', limit: 50 });
    setOpenItems(items.filter(i => i.id !== item.id));
  };

  const saveEdit = async () => {
    const updates = {
      manual_type: editType || '',
      due_date: editDueDate || '',
      recurrence: editRecurrence || '',
    };
    if (editText.trim() && editText.trim() !== item.raw_text) {
      updates.raw_text = editText.trim();
    }
    await api.updateCapture(item.id, updates);
    setEditing(false);
    onUpdate?.();
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    await api.addNote(item.id, newNote.trim());
    setNewNote('');
    onUpdate?.();
  };

  const quickSetDueDate = async (dateStr) => {
    await api.updateCapture(item.id, { due_date: dateStr || '' });
    setShowDatePicker(false);
    onUpdate?.();
  };

  const quickSetRecurrence = async (rec) => {
    await api.updateCapture(item.id, { recurrence: rec || '' });
    setShowRecurrencePicker(false);
    onUpdate?.();
  };

  return (
    <div className={`group glass glass-hover rounded-lg ${compact ? 'px-3 py-2' : 'px-4 py-3'} transition-all ${item.is_pinned ? 'border-blue-500/20' : ''}`}>
      <div className="flex items-start gap-3">
        {!readonly && !isDone && (
          <button onClick={markDone} className="mt-0.5 flex-shrink-0 w-5 h-5 rounded border border-white/10 hover:border-blue-400/50 hover:bg-blue-500/10 flex items-center justify-center transition-all">
            <Check size={12} className="md:opacity-0 md:group-hover:opacity-100 text-blue-400 transition-opacity" />
          </button>
        )}
        {isDone && (
          <button onClick={reopen} className="mt-0.5 flex-shrink-0 w-5 h-5 rounded border border-blue-500/30 bg-blue-500/10 hover:border-zinc-500 hover:bg-transparent flex items-center justify-center transition-all" title="Reopen">
            <Check size={12} className="text-blue-400 group-hover:text-zinc-500" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-1">
            {item.is_pinned && <Pin size={12} className="text-blue-400 mt-0.5 flex-shrink-0" />}
            {item.recurrence && <Repeat size={12} className="text-violet-400 mt-0.5 flex-shrink-0" title={`Recurring: ${item.recurrence}`} />}
            <p className={`text-sm leading-relaxed ${isDone ? 'text-zinc-500 line-through' : 'text-zinc-300'}`}>
              {displayText}
              {item.raw_text.length > 120 && !editing && (
                <button onClick={() => setExpanded(!expanded)} className="ml-1 text-zinc-600 hover:text-zinc-400">
                  {expanded ? <ChevronUp size={14} className="inline" /> : <ChevronDown size={14} className="inline" />}
                </button>
              )}
            </p>
          </div>

          {editing ? (
            <div className="mt-2">
            <input value={editText} onChange={e => setEditText(e.target.value)}
              className="w-full glass-input rounded px-2 py-1.5 text-sm text-zinc-200 outline-none mb-2" />
            <div className="flex flex-wrap items-center gap-2">
              <select value={editType} onChange={e => setEditType(e.target.value)}
                className="glass-input rounded px-2 py-1 text-xs text-zinc-300 outline-none">
                <option value="">Type...</option>
                {TYPE_OPTIONS.filter(Boolean).map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
              <input type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)}
                className="glass-input rounded px-2 py-1 text-xs text-zinc-300 outline-none" />
              <select value={editRecurrence} onChange={e => setEditRecurrence(e.target.value)}
                className="glass-input rounded px-2 py-1 text-xs text-zinc-300 outline-none">
                <option value="">No repeat</option>
                {RECURRENCE_OPTIONS.filter(Boolean).map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {/* Predecessors in edit mode */}
            <div className="mt-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-zinc-500"><Link2 size={11} className="inline mr-0.5" />Depends on:</span>
                <button onClick={() => setShowPredPicker(!showPredPicker)} className="text-xs text-blue-400 hover:text-blue-300"><Plus size={12} className="inline" /> Add</button>
              </div>
              {item.predecessors?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-1">
                  {item.predecessors.map(p => (
                    <div key={p.id} className="badge bg-amber-500/10 text-amber-400 border border-amber-500/15 flex items-center gap-1">
                      <span className="max-w-[200px] truncate">{p.raw_text}</span>
                      <button onClick={async () => { await api.removePredecessor(item.id, p.id); onUpdate?.(); }}
                        className="text-amber-600 hover:text-amber-300"><X size={10} /></button>
                    </div>
                  ))}
                </div>
              )}
              {showPredPicker && (
                <div className="mt-1">
                  <input value={predSearch} onChange={e => setPredSearch(e.target.value)} placeholder="Search items..."
                    className="w-full glass-input rounded px-2 py-1 text-xs text-zinc-300 outline-none mb-1" />
                  <div className="max-h-60 overflow-y-auto flex flex-col gap-0.5">
                    {openItems
                      .filter(i => !item.predecessors?.some(p => p.id === i.id))
                      .filter(i => !predSearch || i.raw_text.toLowerCase().includes(predSearch.toLowerCase()))
                      .map(i => (
                        <button key={i.id}
                          onClick={async () => { await api.addPredecessor(item.id, i.id); setShowPredPicker(false); setPredSearch(''); onUpdate?.(); }}
                          className="w-full text-left px-2 py-1 rounded text-xs text-zinc-400 hover:bg-white/[0.04] truncate transition-colors flex-shrink-0">
                          {i.raw_text.slice(0, 80)}
                        </button>
                      ))
                    }
                    {openItems.filter(i => !item.predecessors?.some(p => p.id === i.id)).length === 0 && (
                      <span className="text-xs text-zinc-700 px-2 py-1">No other open items</span>
                    )}
                  </div>
                </div>
              )}
            </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {isProcessing && <span className="badge bg-white/5 text-zinc-500 border border-white/10"><Loader2 size={10} className="inline animate-spin mr-1" />classifying</span>}
              {type && <span className={`badge ${TYPE_COLORS[type] || TYPE_COLORS.note}`}>{type.replace('_', ' ')}</span>}
              {dueLabel && <span className={`badge ${isOverdue ? 'bg-rose-500/20 text-rose-400 border border-rose-500/25' : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/15'}`}><Calendar size={10} className="inline mr-0.5" />{dueLabel}</span>}
              {item.recurrence && <span className="badge bg-violet-500/10 text-violet-400 border border-violet-500/15"><Repeat size={10} className="inline mr-0.5" />{item.recurrence}</span>}
              {item.linked_people?.map(p => (
                <Link key={p.id} to={`/people/${p.id}`} title={p.name || p.display_name} className="badge bg-indigo-500/10 text-indigo-400 border border-indigo-500/15 hover:bg-indigo-500/20 cursor-pointer transition-colors flex items-center gap-1">
                  <Avatar src={p.avatar} name={p.display_name} size="xs" />
                  {p.display_name}
                </Link>
              ))}
              {item.linked_projects?.map(p => (
                <Link key={p.id} to={`/projects/${p.id}`} className="badge bg-cyan-500/10 text-cyan-400 border border-cyan-500/15 hover:bg-cyan-500/20 cursor-pointer transition-colors">
                  {p.short_code || p.name}
                </Link>
              ))}
              {item.predecessors?.length > 0 && (
                <span className="badge bg-amber-500/10 text-amber-400 border border-amber-500/15" title={item.predecessors.map(p => p.raw_text).join(', ')}>
                  <Link2 size={10} className="inline mr-0.5" />{item.predecessors.length} dep
                </span>
              )}
              <span className="text-xs text-zinc-700 ml-auto">{timeAgo(item.created_at)}</span>
            </div>
          )}

          {/* Notes thread */}
          {item.notes?.length > 0 && !editing && (
            <button onClick={() => setShowNotes(!showNotes)} className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 mt-1.5 transition-colors">
              <MessageSquare size={11} /> {item.notes.length} note{item.notes.length > 1 ? 's' : ''}
            </button>
          )}
          {showNotes && item.notes?.map(n => (
            <div key={n.id} className="flex items-start gap-2 mt-1 ml-2 pl-2 border-l border-white/[0.06]">
              <p className="text-xs text-zinc-400 flex-1">{n.content}</p>
              <span className="text-xs text-zinc-700 flex-shrink-0">{timeAgo(n.created_at)}</span>
            </div>
          ))}
          {/* Add note input */}
          {!readonly && !editing && (showNotes || item.notes?.length === 0) && (
            <div className="flex gap-2 mt-1.5">
              <input value={newNote} onChange={e => setNewNote(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addNote()}
                placeholder="Add a note..."
                className="flex-1 glass-input rounded px-2 py-0.5 text-xs text-zinc-300 outline-none" />
            </div>
          )}
        </div>

        {/* Action buttons */}
        {!readonly && editing && (
          <div className="flex items-center gap-1">
            <button onClick={saveEdit} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded glass"><Save size={12} /> Save</button>
            <button onClick={() => { setEditing(false); setShowPredPicker(false); }} className="text-xs text-zinc-600 hover:text-zinc-400 px-2 py-1">Cancel</button>
          </div>
        )}
        {!readonly && !editing && (
          <div className="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-all relative">
            <button onClick={togglePin} className={`mt-0.5 p-1 transition-all ${item.is_pinned ? 'text-blue-400' : 'text-zinc-700 hover:text-zinc-400'}`} title={item.is_pinned ? 'Unpin' : 'Pin'}>
              {item.is_pinned ? <PinOff size={13} /> : <Pin size={13} />}
            </button>
            <button onClick={() => { setShowDatePicker(!showDatePicker); setShowRecurrencePicker(false); }}
              className={`mt-0.5 p-1 transition-all ${item.due_date ? 'text-zinc-400' : 'text-zinc-700 hover:text-zinc-400'}`} title="Set due date">
              <Calendar size={13} />
            </button>
            <button onClick={() => { setShowRecurrencePicker(!showRecurrencePicker); setShowDatePicker(false); }}
              className={`mt-0.5 p-1 transition-all ${item.recurrence ? 'text-violet-400' : 'text-zinc-700 hover:text-zinc-400'}`} title="Set recurrence">
              <Repeat size={13} />
            </button>
            <button onClick={() => setShowNotes(!showNotes)} className="mt-0.5 p-1 text-zinc-700 hover:text-zinc-400" title="Notes">
              <MessageSquare size={13} />
            </button>
            <button onClick={startEdit} className="mt-0.5 p-1 text-zinc-700 hover:text-zinc-400" title="Edit">
              <Pencil size={13} />
            </button>
            <button onClick={deleteItem} className="mt-0.5 p-1 text-zinc-700 hover:text-rose-400" title="Delete">
              <X size={14} />
            </button>
            {showDatePicker && (
              <div className="absolute right-0 top-full mt-1 z-50 rounded-lg border border-white/10 shadow-xl bg-zinc-900/95 backdrop-blur-xl p-2 min-w-[160px]">
                <input type="date" defaultValue={item.due_date ? new Date(item.due_date).toISOString().split('T')[0] : ''}
                  onChange={e => quickSetDueDate(e.target.value)}
                  className="w-full glass-input rounded px-2 py-1 text-xs text-zinc-300 outline-none mb-1" autoFocus />
                <div className="flex flex-col gap-0.5">
                  {[
                    { label: 'Today', value: new Date().toISOString().split('T')[0] },
                    { label: 'Tomorrow', value: new Date(Date.now() + 86400000).toISOString().split('T')[0] },
                    { label: 'Next week', value: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0] },
                  ].map(opt => (
                    <button key={opt.label} onClick={() => quickSetDueDate(opt.value)}
                      className="text-left text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05] px-2 py-1 rounded transition-colors">
                      {opt.label}
                    </button>
                  ))}
                  {item.due_date && (
                    <button onClick={() => quickSetDueDate('')}
                      className="text-left text-xs text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10 px-2 py-1 rounded transition-colors">
                      Clear date
                    </button>
                  )}
                </div>
              </div>
            )}
            {showRecurrencePicker && (
              <div className="absolute right-0 top-full mt-1 z-50 rounded-lg border border-white/10 shadow-xl bg-zinc-900/95 backdrop-blur-xl p-1 min-w-[120px]">
                {['daily', 'weekly', 'biweekly', 'monthly'].map(r => (
                  <button key={r} onClick={() => quickSetRecurrence(r)}
                    className={`w-full text-left text-xs px-2 py-1.5 rounded transition-colors ${
                      item.recurrence === r ? 'text-violet-400 bg-violet-500/10' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]'
                    }`}>
                    {r}
                  </button>
                ))}
                {item.recurrence && (
                  <button onClick={() => quickSetRecurrence('')}
                    className="w-full text-left text-xs text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10 px-2 py-1.5 rounded transition-colors">
                    No repeat
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
