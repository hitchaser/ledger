import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import ItemCard from './ItemCard';
import { useMentions } from '../hooks/useMentions';
import MentionDropdown from './MentionDropdown';
import { Square, Send, Copy, Save, X } from 'lucide-react';

export default function MeetingMode({ refreshKey, onRefresh }) {
  const { type, id } = useParams();
  const navigate = useNavigate();
  const [entity, setEntity] = useState(null);
  const [items, setItems] = useState([]);
  const [logs, setLogs] = useState([]);
  const [session, setSession] = useState(null);
  const [captureText, setCaptureText] = useState('');
  const [ending, setEnding] = useState(false);
  const [summary, setSummary] = useState(null);
  const [addNote, setAddNote] = useState('');
  const [notes, setNotes] = useState('');
  const captureInputRef = useRef(null);
  const mentions = useMentions();

  const isPerson = type === 'person';

  const loadData = useCallback(async () => {
    const data = isPerson ? await api.getPerson(id) : await api.getProject(id);
    setEntity(data);
    setNotes(data.context_notes || '');
    const itms = isPerson ? await api.getPersonItems(id) : await api.getProjectItems(id);
    setItems(itms);
    const lgs = isPerson ? await api.getPersonLogs(id) : await api.getProjectLogs(id);
    setLogs(lgs);
  }, [id, isPerson]);

  useEffect(() => {
    loadData();
    api.getActiveMeeting().then(s => { if (s) setSession(s); });

    // Auto-end session if user navigates away without clicking End Meeting
    return () => {
      api.getActiveMeeting().then(s => {
        if (s && s.id) {
          api.endMeeting(s.id).catch(() => {});
        }
      }).catch(() => {});
    };
  }, [loadData]);

  // Reload items when AI classification completes (via WebSocket → refreshKey)
  useEffect(() => {
    if (refreshKey > 0) loadData();
  }, [refreshKey, loadData]);

  const capture = async () => {
    const t = captureText.trim();
    if (!t) return;
    const result = await api.createCapture(t);
    // Directly link to the meeting's person/project — no hashtag guessing
    if (isPerson) await api.linkPerson(result.id, id);
    else await api.linkProject(result.id, id);
    setCaptureText('');
    onRefresh?.();
    loadData();
  };

  const endMeeting = async () => {
    if (!session) return;
    setEnding(true);
    const result = await api.endMeeting(session.id);
    setSummary(result);
    setEnding(false);
  };

  const closeSummary = () => {
    setSummary(null);
    navigate(isPerson ? `/people/${id}` : `/projects/${id}`);
  };

  const copySummary = () => {
    if (summary?.ai_summary) navigator.clipboard.writeText(summary.ai_summary);
  };

  const addContextNote = async () => {
    if (!addNote.trim()) return;
    if (isPerson && entity.profile) {
      const profile = { ...entity.profile };
      const existing = profile.general || '';
      profile.general = (existing ? existing + '\n' : '') + addNote.trim();
      await api.updatePerson(id, { profile });
    } else {
      const updated = (notes ? notes + '\n' : '') + addNote.trim();
      if (isPerson) await api.updatePerson(id, { context_notes: updated });
      else await api.updateProject(id, { context_notes: updated });
      setNotes(updated);
    }
    setAddNote('');
    loadData();
  };

  if (!entity) return <div className="p-8 text-zinc-600">Loading meeting...</div>;

  if (summary) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="glass rounded-xl max-w-lg w-full p-6 border-white/10 shadow-2xl shadow-black/40">
          <h3 className="text-lg font-semibold text-zinc-100 mb-3">Meeting Summary</h3>
          <div className="text-sm text-zinc-500 mb-2">
            {summary.items_resolved} resolved &middot; {summary.items_added} added
          </div>
          {summary.ai_summary ? (
            <div className="p-3 bg-white/[0.03] rounded-lg text-sm text-zinc-300 mb-4 whitespace-pre-wrap border border-white/[0.06]">{summary.ai_summary}</div>
          ) : (
            <div className="p-3 bg-white/[0.03] rounded-lg text-sm text-zinc-600 mb-4 italic border border-white/[0.06]">AI summary unavailable (Ollama may be offline)</div>
          )}
          <div className="flex justify-end gap-2">
            {summary.ai_summary && (
              <button onClick={copySummary} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 px-3 py-1.5 glass rounded transition-all">
                <Copy size={12} /> Copy
              </button>
            )}
            <button onClick={closeSummary} className="text-xs text-zinc-600 px-3 py-1.5">Close</button>
            <button onClick={closeSummary} className="text-xs bg-blue-600/80 hover:bg-blue-500 text-white rounded px-3 py-1.5 border border-blue-500/20 transition-all">
              <Save size={12} className="inline mr-1" /> Save & Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="w-2/5 border-r border-white/[0.06] overflow-y-auto p-4 bg-black/20">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-zinc-100">{entity.display_name || entity.name}</h2>
          <button onClick={endMeeting} disabled={ending || !session}
            className="flex items-center gap-1 text-xs bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 rounded px-3 py-1.5 border border-rose-500/20 disabled:opacity-40 transition-all">
            <Square size={12} /> {ending ? 'Ending...' : 'End Meeting'}
          </button>
        </div>
        <p className="text-xs text-zinc-600 mb-3">{entity.role || entity.status || ''}</p>

        {/* Structured Profile (person meetings) */}
        {isPerson && entity.profile && (
          <div className="mb-4">
            <h4 className="text-xs text-zinc-600 font-medium uppercase tracking-wide mb-2">Profile</h4>
            <div className="glass rounded p-2 space-y-1">
              {[
                { key: 'spouse', label: 'Spouse' },
                { key: 'anniversary', label: 'Anniversary' },
                { key: 'birthday', label: 'Birthday' },
                { key: 'children', label: 'Children', isList: true },
                { key: 'pets', label: 'Pets', isList: true },
                { key: 'hobbies', label: 'Hobbies' },
                { key: 'location', label: 'Location' },
              ].map(({ key, label, isList }) => {
                const val = entity.profile[key];
                const display = isList ? (val && val.length > 0 ? val.join(', ') : '') : (val || '');
                if (!display) return null;
                return (
                  <div key={key} className="flex items-baseline gap-2">
                    <span className="text-xs text-zinc-600 w-20 flex-shrink-0 text-right">{label}</span>
                    <span className="text-xs text-zinc-300">{display}</span>
                  </div>
                );
              })}
              {entity.profile.general && (
                <>
                  <div className="border-t border-white/[0.04] my-1" />
                  <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-sans">{entity.profile.general}</pre>
                </>
              )}
              {!entity.profile.spouse && !entity.profile.birthday && !(entity.profile.children?.length) && !entity.profile.general && (
                <p className="text-xs text-zinc-700 italic">No profile details yet</p>
              )}
            </div>
          </div>
        )}

        {/* Context Notes (project meetings or fallback) */}
        {(!isPerson || !entity.profile) && (
          <div className="mb-4">
            <h4 className="text-xs text-zinc-600 font-medium uppercase tracking-wide mb-2">Context Notes</h4>
            <pre className="text-sm text-zinc-400 whitespace-pre-wrap font-sans glass rounded p-2 min-h-[60px]">
              {notes || 'No notes yet.'}
            </pre>
          </div>
        )}

        <div className="mb-4">
          <h4 className="text-xs text-zinc-600 font-medium uppercase tracking-wide mb-1">Quick Note → General Notes</h4>
          <div className="flex gap-2">
            <input placeholder="Add to general notes..." value={addNote} onChange={e => setAddNote(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addContextNote()}
              className="flex-1 glass-input rounded px-2 py-1 text-xs text-zinc-300 outline-none" />
          </div>
        </div>

        <h4 className="text-xs text-zinc-600 font-medium uppercase tracking-wide mb-2">Recent History</h4>
        <div className="flex flex-col gap-2">
          {logs.slice(0, 3).map(l => (
            <div key={l.id} className="p-2 glass rounded text-xs text-zinc-500">
              <span className="text-zinc-600">{new Date(l.created_at).toLocaleDateString()}</span>
              <p className="mt-1 text-zinc-400">{l.content.slice(0, 200)}{l.content.length > 200 ? '...' : ''}</p>
            </div>
          ))}
          {logs.length === 0 && <p className="text-xs text-zinc-700">No history yet</p>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="text-sm font-semibold text-zinc-400 mb-3">Open Items</h3>
        <div className="flex flex-col gap-2 mb-4">
          {items.length === 0 && <p className="text-sm text-zinc-700">No open items</p>}
          {items.map(item => (
            <ItemCard key={item.id} item={item} onUpdate={() => { onRefresh?.(); loadData(); }} compact />
          ))}
        </div>

        <div className="relative mt-4 pt-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <input type="text" placeholder="Add item for this meeting... (@ to mention)" value={captureText}
                ref={captureInputRef}
                onChange={e => { setCaptureText(e.target.value); mentions.updateMention(e.target.value, e.target.selectionStart); }}
                onKeyDown={e => { if (mentions.handleMentionKey(e, captureText, setCaptureText)) return; if (e.key === 'Enter') capture(); }}
                className="w-full glass-input rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none" />
              {mentions.isActive && (
                <MentionDropdown results={mentions.mentionResults} selectedIndex={mentions.selectedIndex} position="above"
                  onSelect={item => { setCaptureText(mentions.selectMention(captureText, item)); captureInputRef.current?.focus(); }} />
              )}
            </div>
            <button onClick={capture} className="p-2 bg-blue-600/80 hover:bg-blue-500 rounded-lg border border-blue-500/20 transition-all">
              <Send size={14} className="text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
