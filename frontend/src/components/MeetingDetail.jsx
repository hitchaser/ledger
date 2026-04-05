import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import ItemCard from './ItemCard';
import DraggableItemList from './DraggableItemList';
import PersonTypeahead from './PersonTypeahead';
import { useMentions } from '../hooks/useMentions';
import MentionDropdown from './MentionDropdown';
import Avatar from './Avatar';
import { Square, Send, Copy, ChevronDown, ChevronUp, X, ArrowLeft, FolderKanban, Trash2 } from 'lucide-react';

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
  const [allProjects, setAllProjects] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const notesRef = useRef(null);
  const saveTimerRef = useRef(null);
  const captureInputRef = useRef(null);
  const mentions = useMentions();
  const attendeeTypeaheadRef = useRef(null);

  const isActive = meeting && !meeting.ended_at;

  const loadMeeting = useCallback(async () => {
    const data = await api.getMeeting(id);
    setMeeting(data);
    setTitle(data.title || '');
    setNotes(data.notes || '');
    // Expand metadata if pre-populated with attendees or project
    if (data.attendees?.length > 0 || data.project_id) {
      setMetaOpen(true);
    }
  }, [id]);

  const loadItems = useCallback(async () => {
    if (!meeting) return;
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
  useEffect(() => { api.listProjects().then(setAllProjects).catch(() => {}); }, []);

  // Auto-end active meeting if user navigates away
  useEffect(() => {
    if (!meeting || meeting.ended_at) return;
    return () => {
      // Fire-and-forget: end the active session on unmount
      api.getActiveMeeting().then(s => {
        if (s && s.id) api.endMeeting(s.id).catch(() => {});
      }).catch(() => {});
    };
  }, [meeting?.id, meeting?.ended_at]);

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

  const setProject = async (projectId) => {
    const updated = await api.updateMeeting(id, { project_id: projectId || '' });
    setMeeting(updated);
    setShowProjectPicker(false);
    setProjectSearch('');
  };

  const endMeeting = async () => {
    if (!meeting) return;
    setEnding(true);
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

  const deleteMeeting = async () => {
    await api.deleteMeeting(id);
    navigate('/meetings');
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

  // Summary modal (shown right after ending)
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
            <button onClick={() => { setSummary(null); }}
              className="text-xs bg-blue-600/80 hover:bg-blue-500 text-white rounded px-3 py-1.5 border border-blue-500/20 transition-all">
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Shared metadata section (used by both active and ended meetings)
  const metadataSection = (
    <div className="px-4 py-3 border-b border-white/[0.06] space-y-3 flex-shrink-0 bg-white/[0.01]">
      {/* Attendees */}
      <div>
        <span className="text-xs text-zinc-600 font-medium uppercase tracking-wide">Attendees</span>
        <div className="mt-1.5">
          <div className="w-56 mb-2">
            <PersonTypeahead
              ref={attendeeTypeaheadRef}
              onChange={addAttendee}
              exclude={(meeting.attendees || []).map(a => a.id)}
              placeholder="Add attendee..."
              clearOnSelect
            />
          </div>
          {(meeting.attendees || []).length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {(meeting.attendees || []).map(a => (
                <div key={a.id} className="flex items-center gap-1.5 badge bg-indigo-500/10 text-indigo-400 border border-indigo-500/15">
                  <Avatar src={a.avatar} name={a.display_name} size="xs" />
                  <span>{a.display_name}</span>
                  <button onClick={() => removeAttendee(a.id)} className="text-indigo-600 hover:text-indigo-300 ml-0.5"><X size={10} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Project */}
      <div>
        <span className="text-xs text-zinc-600 font-medium uppercase tracking-wide flex items-center gap-1">
          <FolderKanban size={12} /> Project
        </span>
        <div className="mt-1.5">
          <ProjectTypeahead
            projects={allProjects}
            onSelect={(p) => setProject(p.id)}
            placeholder="Add project..."
          />
          {meeting.project && (
            <div className="flex items-center gap-2 mt-2">
              <span className="badge bg-cyan-500/10 text-cyan-400 border border-cyan-500/15 cursor-pointer"
                onClick={() => navigate(`/projects/${meeting.project.id}`)}>
                {meeting.project.short_code || meeting.project.name}
              </span>
              <button onClick={() => setProject('')} className="text-cyan-600 hover:text-cyan-300 transition-colors"><X size={10} /></button>
            </div>
          )}
        </div>
      </div>

      {/* Prep stats */}
      {prep && (
        <div className="text-xs text-zinc-500">
          {prep.days_since !== null
            ? <>{prep.days_since}d since last &middot; {prep.items_resolved} resolved &middot; {prep.new_items} new &middot; {prep.open_items} open</>
            : <>First meeting &middot; {prep.open_items} open items</>
          }
        </div>
      )}
    </div>
  );

  // Ended meeting — editable view
  if (!isActive) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] flex-shrink-0">
          <button onClick={() => navigate('/meetings')} className="text-zinc-600 hover:text-zinc-300 transition-colors">
            <ArrowLeft size={16} />
          </button>
          <input value={title} onChange={handleTitleChange}
            placeholder="Untitled Meeting"
            className="flex-1 bg-transparent text-lg font-semibold text-zinc-100 outline-none placeholder-zinc-700" />
          <div className="flex items-center gap-2 text-xs text-zinc-600">
            <span>{new Date(meeting.started_at).toLocaleDateString()} {new Date(meeting.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            {meeting.ended_at && <span>— {new Date(meeting.ended_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
          <button onClick={() => setMetaOpen(!metaOpen)}
            className="text-xs text-zinc-600 hover:text-zinc-300 flex items-center gap-1 glass rounded px-2 py-1 transition-all">
            {metaOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {metaOpen ? 'Hide Details' : 'Details'}
          </button>
          <button onClick={() => setConfirmDelete(true)}
            className="text-zinc-700 hover:text-rose-400 transition-colors" title="Delete meeting">
            <Trash2 size={14} />
          </button>
        </div>

        {/* Metadata */}
        {metaOpen && metadataSection}

        {/* Notes — editable */}
        <div className="flex-1 overflow-y-auto p-4">
          <textarea
            ref={notesRef}
            value={notes}
            onChange={handleNotesChange}
            onKeyDown={handleNotesKeyDown}
            placeholder="Meeting notes..."
            className="w-full bg-transparent text-sm text-zinc-200 outline-none resize-none placeholder-zinc-700 leading-relaxed"
            style={{ minHeight: 'calc(100vh - 320px)' }}
          />
        </div>

        {/* Summary (read-only) */}
        {meeting.ai_summary && (
          <div className="border-t border-white/[0.06] px-4 py-3 flex-shrink-0">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-xs text-zinc-600 font-medium uppercase tracking-wide">Summary</h4>
              <div className="flex items-center gap-2 text-xs text-zinc-600">
                <span>{meeting.items_resolved} resolved &middot; {meeting.items_added} added</span>
                <button onClick={() => navigator.clipboard.writeText(meeting.ai_summary)}
                  className="flex items-center gap-1 text-zinc-600 hover:text-zinc-300 transition-colors">
                  <Copy size={10} /> Copy
                </button>
              </div>
            </div>
            <div className="p-2 glass rounded text-sm text-zinc-400 whitespace-pre-wrap max-h-40 overflow-y-auto">{meeting.ai_summary}</div>
          </div>
        )}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass rounded-xl max-w-sm w-full p-6 border-white/10 shadow-2xl shadow-black/40">
            <h3 className="text-lg font-semibold text-zinc-100 mb-2">Delete this meeting?</h3>
            <p className="text-sm text-zinc-400 mb-5">This will permanently remove the meeting, its notes, and summary. Captured items will be kept.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-zinc-500 px-3 py-1.5">Cancel</button>
              <button onClick={deleteMeeting}
                className="text-xs bg-rose-600/80 hover:bg-rose-500 text-white rounded px-3 py-1.5 border border-rose-500/20 transition-all">
                Yes, delete
              </button>
            </div>
          </div>
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
        <button onClick={() => setConfirmDelete(true)}
          className="text-zinc-700 hover:text-rose-400 transition-colors" title="Delete meeting">
          <Trash2 size={14} />
        </button>
        <button onClick={endMeeting} disabled={ending}
          className="flex items-center gap-1.5 text-xs bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 rounded px-3 py-1.5 border border-rose-500/20 disabled:opacity-40 transition-all">
          <Square size={12} /> {ending ? 'Ending...' : 'End Meeting'}
        </button>
      </div>

      {/* Metadata (collapsible) */}
      {metaOpen && metadataSection}

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
            <input type="text" placeholder="Add task/item linked to this meeting's attendees & project..." value={captureText}
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
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass rounded-xl max-w-sm w-full p-6 border-white/10 shadow-2xl shadow-black/40">
            <h3 className="text-lg font-semibold text-zinc-100 mb-2">Delete this meeting?</h3>
            <p className="text-sm text-zinc-400 mb-5">This will permanently remove the meeting, its notes, and summary. Captured items will be kept.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-zinc-500 px-3 py-1.5">Cancel</button>
              <button onClick={deleteMeeting}
                className="text-xs bg-rose-600/80 hover:bg-rose-500 text-white rounded px-3 py-1.5 border border-rose-500/20 transition-all">
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function ProjectTypeahead({ projects, onSelect, placeholder = "Search projects..." }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  const filtered = projects.filter(p =>
    !p.is_archived &&
    (query === '' ||
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      (p.short_code && p.short_code.toLowerCase().includes(query.toLowerCase())))
  ).slice(0, 10);

  const handleSelect = (project) => {
    setQuery('');
    setOpen(false);
    onSelect(project);
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
    <div ref={containerRef} className="relative z-50 w-56">
      <input
        ref={inputRef}
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); setHighlightIdx(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full glass-input rounded px-3 py-1.5 text-sm text-zinc-200 outline-none"
      />
      {open && query.length > 0 && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border border-white/10 max-h-48 overflow-y-auto shadow-xl bg-zinc-900/95 backdrop-blur-xl">
          {filtered.map((p, idx) => (
            <button key={p.id} onClick={() => handleSelect(p)}
              className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                idx === highlightIdx ? 'bg-blue-500/15 text-zinc-200' : 'text-zinc-300 hover:bg-white/[0.04]'
              }`}>
              {p.name} {p.short_code && <span className="text-xs text-zinc-600">[{p.short_code}]</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
