import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import ItemCard from './ItemCard';
import DraggableItemList from './DraggableItemList';
import PersonTypeahead from './PersonTypeahead';
import { useMentions } from '../hooks/useMentions';
import MentionDropdown from './MentionDropdown';
import Avatar from './Avatar';
import { Square, Send, Copy, ChevronDown, ChevronUp, X, ArrowLeft } from 'lucide-react';

export default function MeetingDetail({ refreshKey, onRefresh, itemUpdate }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]);
  const [ending, setEnding] = useState(false);
  const [summary, setSummary] = useState(null);
  const [metaOpen, setMetaOpen] = useState(false);
  const [captureText, setCaptureText] = useState('');
  const [prep, setPrep] = useState(null);
  const notesRef = useRef(null);
  const saveTimerRef = useRef(null);
  const captureInputRef = useRef(null);
  const mentions = useMentions();

  const isActive = meeting && !meeting.ended_at;

  const loadMeeting = useCallback(async () => {
    const data = await api.getMeeting(id);
    setMeeting(data);
    setTitle(data.title || '');
    setNotes(data.notes || '');
    // Expand metadata if pre-populated with attendees or project
    if ((data.attendees?.length > 0 || data.project_id) && !data.ended_at) {
      setMetaOpen(true);
    }
  }, [id]);

  const loadItems = useCallback(async () => {
    if (!meeting) return;
    // Load items from all attendees + project
    const allItems = {};
    for (const a of (meeting.attendees || [])) {
      const personItems = await api.getPersonItems(a.id, 'open');
      personItems.forEach(i => { allItems[i.id] = i; });
    }
    if (meeting.project_id) {
      const projItems = await api.getProjectItems(meeting.project_id, 'open');
      projItems.forEach(i => { allItems[i.id] = i; });
    }
    setItems(Object.values(allItems));
  }, [meeting?.attendees, meeting?.project_id]);

  useEffect(() => { loadMeeting(); }, [loadMeeting]);
  useEffect(() => { if (meeting) loadItems(); }, [meeting?.id, meeting?.attendees?.length, meeting?.project_id]);

  // Load prep stats for first attendee or project
  useEffect(() => {
    if (!meeting) return;
    if (meeting.attendees?.length > 0) {
      api.getMeetingPrep('person', meeting.attendees[0].id).then(setPrep).catch(() => {});
    } else if (meeting.project_id) {
      api.getMeetingPrep('project', meeting.project_id).then(setPrep).catch(() => {});
    }
  }, [meeting?.id, meeting?.attendees?.length, meeting?.project_id]);

  // Merge WebSocket item updates
  useEffect(() => {
    if (!itemUpdate) return;
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === itemUpdate.id);
      if (idx >= 0) { const u = [...prev]; u[idx] = itemUpdate; return u; }
      return prev;
    });
  }, [itemUpdate]);

  // Auto-save notes with debounce
  const saveNotes = useCallback((value) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      api.updateMeeting(id, { notes: value }).catch(() => {});
    }, 500);
  }, [id]);

  const handleNotesChange = (e) => {
    const val = e.target.value;
    setNotes(val);
    saveNotes(val);
  };

  // Auto-save title with debounce
  const saveTitleRef = useRef(null);
  const handleTitleChange = (e) => {
    const val = e.target.value;
    setTitle(val);
    if (saveTitleRef.current) clearTimeout(saveTitleRef.current);
    saveTitleRef.current = setTimeout(() => {
      api.updateMeeting(id, { title: val }).catch(() => {});
    }, 500);
  };

  const addAttendee = async (person) => {
    if (!person) return;
    const updated = await api.addMeetingAttendee(id, person.id);
    setMeeting(updated);
  };

  const removeAttendee = async (personId) => {
    const updated = await api.removeMeetingAttendee(id, personId);
    setMeeting(updated);
  };

  const endMeeting = async () => {
    if (!meeting) return;
    setEnding(true);
    // Save latest notes before ending
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    await api.updateMeeting(id, { notes, title });
    const result = await api.endMeeting(id);
    setSummary(result);
    setEnding(false);
    setMeeting(result);
  };

  const capture = async () => {
    const t = captureText.trim();
    if (!t) return;
    const result = await api.createCapture(t);
    // Link to all attendees + project
    for (const a of (meeting.attendees || [])) {
      await api.linkPerson(result.id, a.id);
    }
    if (meeting.project_id) {
      await api.linkProject(result.id, meeting.project_id);
    }
    setCaptureText('');
    onRefresh?.();
    loadItems();
  };

  // Handle bullet-point formatting in notes
  const handleNotesKeyDown = (e) => {
    if (e.key === 'Enter') {
      const textarea = e.target;
      const { selectionStart, value } = textarea;
      const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
      const currentLine = value.slice(lineStart, selectionStart);
      const bulletMatch = currentLine.match(/^(\s*)([-*•])\s/);
      if (bulletMatch) {
        // If the current line is just a bullet with no content, remove it
        if (currentLine.trim() === bulletMatch[2]) {
          e.preventDefault();
          const newVal = value.slice(0, lineStart) + '\n' + value.slice(selectionStart);
          setNotes(newVal);
          saveNotes(newVal);
          setTimeout(() => { textarea.selectionStart = textarea.selectionEnd = lineStart + 1; }, 0);
          return;
        }
        e.preventDefault();
        const indent = bulletMatch[1];
        const bullet = bulletMatch[2];
        const insertion = `\n${indent}${bullet} `;
        const newVal = value.slice(0, selectionStart) + insertion + value.slice(selectionStart);
        setNotes(newVal);
        saveNotes(newVal);
        setTimeout(() => { textarea.selectionStart = textarea.selectionEnd = selectionStart + insertion.length; }, 0);
      }
    }
  };

  if (!meeting) return <div className="p-8 text-zinc-600">Loading meeting...</div>;

  // Summary modal
  if (summary && summary.ai_summary !== undefined && summary.ended_at) {
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
            <div className="p-3 bg-white/[0.03] rounded-lg text-sm text-zinc-600 mb-4 italic border border-white/[0.06]">AI summary unavailable</div>
          )}
          <div className="flex justify-end gap-2">
            {summary.ai_summary && (
              <button onClick={() => navigator.clipboard.writeText(summary.ai_summary)}
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 px-3 py-1.5 glass rounded transition-all">
                <Copy size={12} /> Copy
              </button>
            )}
            <button onClick={() => { setSummary(null); navigate('/meetings'); }}
              className="text-xs bg-blue-600/80 hover:bg-blue-500 text-white rounded px-3 py-1.5 border border-blue-500/20 transition-all">
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Ended meeting — read-only view
  if (!isActive) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-4">
        <button onClick={() => navigate('/meetings')} className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-300 mb-3 transition-colors">
          <ArrowLeft size={14} /> Meetings
        </button>
        <h2 className="text-xl font-semibold text-zinc-100 mb-1">{meeting.title || 'Untitled Meeting'}</h2>
        <div className="flex items-center gap-3 text-xs text-zinc-600 mb-4">
          <span>{new Date(meeting.started_at).toLocaleDateString()} {new Date(meeting.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          {meeting.ended_at && <span>— {new Date(meeting.ended_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
          <span>{meeting.items_resolved} resolved &middot; {meeting.items_added} added</span>
        </div>

        {(meeting.attendees?.length > 0 || meeting.project) && (
          <div className="flex items-center gap-3 mb-4">
            {meeting.attendees?.map(a => (
              <div key={a.id} className="flex items-center gap-1.5 badge bg-indigo-500/10 text-indigo-400 border border-indigo-500/15 cursor-pointer"
                onClick={() => navigate(`/people/${a.id}`)}>
                <Avatar src={a.avatar} name={a.display_name} size="xs" />
                <span>{a.display_name}</span>
              </div>
            ))}
            {meeting.project && (
              <span className="badge bg-cyan-500/10 text-cyan-400 border border-cyan-500/15 cursor-pointer"
                onClick={() => navigate(`/projects/${meeting.project.id}`)}>
                {meeting.project.short_code || meeting.project.name}
              </span>
            )}
          </div>
        )}

        {meeting.notes && (
          <div className="mb-4">
            <h4 className="text-xs text-zinc-600 font-medium uppercase tracking-wide mb-2">Notes</h4>
            <div className="p-3 glass rounded-lg text-sm text-zinc-300 whitespace-pre-wrap">
              {formatBullets(meeting.notes)}
            </div>
          </div>
        )}

        {meeting.ai_summary && (
          <div className="mb-4">
            <h4 className="text-xs text-zinc-600 font-medium uppercase tracking-wide mb-2">Summary</h4>
            <div className="p-3 glass rounded-lg text-sm text-zinc-400 whitespace-pre-wrap">{meeting.ai_summary}</div>
          </div>
        )}
      </div>
    );
  }

  // Active meeting — notes-first layout
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] flex-shrink-0">
        <input value={title} onChange={handleTitleChange}
          placeholder="Untitled Meeting"
          className="flex-1 bg-transparent text-lg font-semibold text-zinc-100 outline-none placeholder-zinc-700" />
        <button onClick={() => setMetaOpen(!metaOpen)}
          className="text-xs text-zinc-600 hover:text-zinc-300 flex items-center gap-1 glass rounded px-2 py-1 transition-all">
          {metaOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {metaOpen ? 'Hide Details' : 'Details'}
        </button>
        <button onClick={endMeeting} disabled={ending}
          className="flex items-center gap-1.5 text-xs bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 rounded px-3 py-1.5 border border-rose-500/20 disabled:opacity-40 transition-all">
          <Square size={12} /> {ending ? 'Ending...' : 'End Meeting'}
        </button>
      </div>

      {/* Metadata (collapsible) */}
      {metaOpen && (
        <div className="px-4 py-3 border-b border-white/[0.06] space-y-2 flex-shrink-0 bg-white/[0.01]">
          {/* Attendees */}
          <div>
            <span className="text-xs text-zinc-600 font-medium uppercase tracking-wide">Attendees</span>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {(meeting.attendees || []).map(a => (
                <div key={a.id} className="flex items-center gap-1.5 badge bg-indigo-500/10 text-indigo-400 border border-indigo-500/15">
                  <Avatar src={a.avatar} name={a.display_name} size="xs" />
                  <span>{a.display_name}</span>
                  <button onClick={() => removeAttendee(a.id)} className="text-indigo-600 hover:text-indigo-300 ml-0.5"><X size={10} /></button>
                </div>
              ))}
              <div className="w-48">
                <PersonTypeahead
                  onChange={addAttendee}
                  exclude={(meeting.attendees || []).map(a => a.id)}
                  placeholder="Add attendee..."
                />
              </div>
            </div>
          </div>

          {/* Project + Prep */}
          <div className="flex items-center gap-4">
            {meeting.project && (
              <span className="text-xs text-cyan-400">
                Project: {meeting.project.short_code || meeting.project.name}
              </span>
            )}
            {prep && (
              <span className="text-xs text-zinc-500">
                {prep.days_since !== null
                  ? <>{prep.days_since}d since last &middot; {prep.items_resolved} resolved &middot; {prep.new_items} new &middot; {prep.open_items} open</>
                  : <>First meeting &middot; {prep.open_items} open items</>
                }
              </span>
            )}
          </div>
        </div>
      )}

      {/* Notes area — main content */}
      <div className="flex-1 overflow-y-auto p-4">
        <textarea
          ref={notesRef}
          value={notes}
          onChange={handleNotesChange}
          onKeyDown={handleNotesKeyDown}
          placeholder="Meeting notes... (use - or * for bullets)"
          className="w-full bg-transparent text-sm text-zinc-200 outline-none resize-none placeholder-zinc-700 leading-relaxed"
          style={{ minHeight: 'calc(100vh - 320px)' }}
          autoFocus
        />
      </div>

      {/* Capture section */}
      <div className="border-t border-white/[0.06] px-4 py-3 flex-shrink-0">
        <div className="relative flex items-center gap-2">
          <div className="flex-1 relative">
            <input type="text" placeholder="Capture item for this meeting... (@ to mention)" value={captureText}
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
        {items.length > 0 && (
          <div className="mt-3">
            <h4 className="text-xs text-zinc-600 font-medium uppercase tracking-wide mb-2">Open Items ({items.length})</h4>
            <div className="max-h-48 overflow-y-auto">
              <DraggableItemList items={items} setItems={setItems} onUpdate={() => { onRefresh?.(); loadItems(); }} compact />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatBullets(text) {
  // Simple rendering: lines starting with - or * get bullet formatting
  return text;
}
