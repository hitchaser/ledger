import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useDelayedLoading } from '../hooks/useDelayedLoading';
import PersonTypeahead from './PersonTypeahead';
import ProjectTypeahead from './ProjectTypeahead';
import Avatar from './Avatar';
import { ArrowLeft, Trash2, StickyNote, Mail, ChevronDown, ChevronUp, X } from 'lucide-react';

export default function NoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';
  const [note, setNote] = useState(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [emailMetaOpen, setEmailMetaOpen] = useState(false);
  const saveTimerRef = useRef(null);

  const loadNote = useCallback(async () => {
    if (isNew) {
      setNote({ id: null, source_type: 'manual', linked_people: [], linked_projects: [] });
      return;
    }
    const data = await api.getNote(id);
    setNote(data);
    setTitle(data.title || '');
    setBody(data.body || '');
    if (data.source_type === 'email') setEmailMetaOpen(true);
  }, [id, isNew]);

  useEffect(() => { loadNote(); }, [loadNote]);

  // Auto-save title with debounce
  const saveTitleRef = useRef(null);
  const handleTitleChange = (e) => {
    const val = e.target.value;
    setTitle(val);
    if (isNew || !note?.id) return;
    if (saveTitleRef.current) clearTimeout(saveTitleRef.current);
    saveTitleRef.current = setTimeout(() => {
      api.updateNote(note.id, { title: val }).catch(() => {});
    }, 500);
  };

  // Auto-save body with debounce
  const handleBodyChange = (e) => {
    const val = e.target.value;
    setBody(val);
    if (isNew || !note?.id) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      api.updateNote(note.id, { body: val }).catch(() => {});
    }, 500);
  };

  // Create note on first meaningful edit for new notes
  const createIfNew = useCallback(async () => {
    if (!isNew || note?.id) return null;
    const result = await api.createNote({ title: title || null, body: body || ' ' });
    setNote(result);
    // Replace /notes/new with /notes/:id in history
    navigate(`/notes/${result.id}`, { replace: true });
    return result;
  }, [isNew, note?.id, title, body, navigate]);

  const handleTitleBlur = async () => {
    if (isNew && title.trim()) {
      await createIfNew();
    }
  };

  const handleBodyBlur = async () => {
    if (isNew && body.trim()) {
      await createIfNew();
    }
  };

  const addPerson = async (person) => {
    if (!person) return;
    let noteId = note?.id;
    if (isNew && !noteId) {
      const created = await createIfNew();
      if (created) noteId = created.id;
    }
    if (!noteId) return;
    const updated = await api.linkNotePerson(noteId, person.id);
    setNote(updated);
  };

  const removePerson = async (personId) => {
    if (!note?.id) return;
    const updated = await api.unlinkNotePerson(note.id, personId);
    setNote(updated);
  };

  const addProject = async (project) => {
    if (!project) return;
    let noteId = note?.id;
    if (isNew && !noteId) {
      const created = await createIfNew();
      if (created) noteId = created.id;
    }
    if (!noteId) return;
    const updated = await api.linkNoteProject(noteId, project.id);
    setNote(updated);
  };

  const removeProject = async (projectId) => {
    if (!note?.id) return;
    const updated = await api.unlinkNoteProject(note.id, projectId);
    setNote(updated);
  };

  const handleDelete = async () => {
    if (!note?.id) return;
    // Cancel any pending auto-save timers so they don't fire on a deleted note
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (saveTitleRef.current) clearTimeout(saveTitleRef.current);
    try {
      await api.deleteNote(note.id);
    } catch {}
    navigate('/notes');
  };

  const showLoading = useDelayedLoading(!note && !isNew);
  if (!note) return showLoading ? <div className="p-8 text-zinc-600">Loading note...</div> : null;

  const isEmail = note.source_type === 'email';

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 page-transition">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate('/notes')} className="text-zinc-600 hover:text-zinc-300 transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {isEmail
            ? <Mail size={16} className="text-amber-400/70 flex-shrink-0" />
            : <StickyNote size={16} className="text-blue-400/70 flex-shrink-0" />
          }
          <input value={title} onChange={handleTitleChange} onBlur={handleTitleBlur}
            placeholder={isEmail ? "Email subject" : "Note title (optional)"}
            className="flex-1 bg-transparent text-lg font-semibold text-zinc-100 outline-none placeholder-zinc-700" />
        </div>
        {note.id && (
          <button onClick={() => setConfirmDelete(true)}
            className="text-zinc-700 hover:text-rose-400 transition-colors" title="Delete note">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Email metadata (collapsible) */}
      {isEmail && (
        <>
          <button onClick={() => setEmailMetaOpen(!emailMetaOpen)}
            className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-300 mb-2 transition-colors">
            {emailMetaOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {emailMetaOpen ? 'Hide email details' : 'Show email details'}
          </button>
          {emailMetaOpen && (
            <div className="mb-4 p-3 glass rounded-lg space-y-1 text-sm">
              {note.email_from && (
                <div><span className="text-xs text-zinc-600 w-12 inline-block">From</span> <span className="text-zinc-300">{note.email_from}</span></div>
              )}
              {note.email_to && (
                <div><span className="text-xs text-zinc-600 w-12 inline-block">To</span> <span className="text-zinc-300">{note.email_to}</span></div>
              )}
              {note.email_cc && (
                <div><span className="text-xs text-zinc-600 w-12 inline-block">CC</span> <span className="text-zinc-300">{note.email_cc}</span></div>
              )}
              {note.email_bcc && (
                <div><span className="text-xs text-zinc-600 w-12 inline-block">BCC</span> <span className="text-zinc-300">{note.email_bcc}</span></div>
              )}
              {note.email_date && (
                <div><span className="text-xs text-zinc-600 w-12 inline-block">Date</span> <span className="text-zinc-300">{new Date(note.email_date).toLocaleString()}</span></div>
              )}
            </div>
          )}
        </>
      )}

      {/* People + Projects */}
      <div className="flex gap-4 mb-4">
        <div className="flex-1 relative z-20">
          <span className="text-xs text-zinc-600 font-medium uppercase tracking-wide">People</span>
          <div className="mt-1.5">
            <div className="w-56 mb-2">
              <PersonTypeahead
                onChange={addPerson}
                exclude={(note.linked_people || []).map(p => p.id)}
                placeholder="Tag a person..."
                clearOnSelect
              />
            </div>
            {(note.linked_people || []).length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {(note.linked_people || []).map(p => (
                  <div key={p.id} className="flex items-center gap-1.5 badge bg-indigo-500/10 text-indigo-400 border border-indigo-500/15">
                    <Avatar src={p.avatar} name={p.display_name} size="xs" />
                    <span>{p.display_name}</span>
                    <button onClick={() => removePerson(p.id)} className="text-indigo-600 hover:text-indigo-300 ml-0.5"><X size={10} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 relative z-10">
          <span className="text-xs text-zinc-600 font-medium uppercase tracking-wide">Projects</span>
          <div className="mt-1.5">
            <ProjectTypeahead
              onSelect={addProject}
              exclude={(note.linked_projects || []).map(p => p.id)}
              placeholder="Tag a project..."
              clearOnSelect
            />
            {(note.linked_projects || []).length > 0 && (
              <div className="flex items-center gap-2 flex-wrap mt-2">
                {(note.linked_projects || []).map(p => (
                  <div key={p.id} className="flex items-center gap-1.5 badge bg-cyan-500/10 text-cyan-400 border border-cyan-500/15">
                    <span>{p.short_code || p.name}</span>
                    <button onClick={() => removeProject(p.id)} className="text-cyan-600 hover:text-cyan-300 ml-0.5"><X size={10} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <textarea
        value={body}
        onChange={handleBodyChange}
        onBlur={handleBodyBlur}
        placeholder="Start writing..."
        className="w-full bg-transparent text-sm text-zinc-200 outline-none resize-none placeholder-zinc-700 leading-relaxed"
        style={{ minHeight: 'calc(100vh - 400px)' }}
        autoFocus={isNew}
      />

      {/* Date info */}
      {note.created_at && (
        <div className="text-xs text-zinc-700 mt-4">
          Created {new Date(note.created_at).toLocaleString()}
          {note.updated_at && note.updated_at !== note.created_at && (
            <> &middot; Updated {new Date(note.updated_at).toLocaleString()}</>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass rounded-xl max-w-sm w-full p-6 border-white/10 shadow-2xl shadow-black/40">
            <h3 className="text-lg font-semibold text-zinc-100 mb-2">Delete this note?</h3>
            <p className="text-sm text-zinc-400 mb-5">This will permanently remove this note and all its tags.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-zinc-500 px-3 py-1.5">Cancel</button>
              <button onClick={handleDelete}
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
