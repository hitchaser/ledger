import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import Avatar from './Avatar';
import { Plus, Play, Radio, Search } from 'lucide-react';
import { useDelayedLoading } from '../hooks/useDelayedLoading';
import IcsDropZone from './IcsDropZone';

export default function MeetingsList() {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.listMeetings({ limit: 200 }).then(data => {
      setMeetings(data.meetings || []);
      setTotal(data.total || 0);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return meetings;
    const q = search.toLowerCase();
    return meetings.filter(m => {
      const title = (m.title || '').toLowerCase();
      const attendees = (m.attendees || []).map(a => a.display_name.toLowerCase()).join(' ');
      const project = m.project ? (m.project.name + ' ' + (m.project.short_code || '')).toLowerCase() : '';
      const notes = (m.notes || '').toLowerCase();
      return title.includes(q) || attendees.includes(q) || project.includes(q) || notes.includes(q);
    });
  }, [meetings, search]);

  const newMeeting = async () => {
    try {
      const session = await api.startMeeting({});
      navigate(`/meetings/${session.id}`);
    } catch (e) {
      if (e.status === 409 || (e.message && e.message.includes('409'))) {
        // Auto-end the dangling active meeting — Bryan is never in two at once.
        await api.forceEndActiveMeeting();
        const session = await api.startMeeting({});
        navigate(`/meetings/${session.id}`);
      } else {
        throw e;
      }
    }
  };

  const showLoading = useDelayedLoading(loading);
  if (loading) return showLoading ? <div className="p-8 text-zinc-600">Loading...</div> : null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 page-transition">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-100">Meetings</h2>
        <button onClick={newMeeting}
          className="flex items-center gap-1.5 bg-blue-600/80 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded border border-blue-500/20 transition-all">
          <Play size={12} /> Start Meeting
        </button>
      </div>

      <div className="mb-3">
        <IcsDropZone
          onParsed={(result) => {
            navigate(`/meetings/${result.meeting.id}`, { state: { unmatched: result.unmatched } });
          }}
        />
      </div>

      {meetings.length > 5 && (
        <div className="flex items-center gap-2 mb-3 glass rounded-lg px-3 py-2">
          <Search size={14} className="text-zinc-600 flex-shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Filter by title, attendee, or project..."
            className="flex-1 bg-transparent text-sm text-zinc-200 outline-none placeholder-zinc-600" />
        </div>
      )}

      {meetings.length === 0 ? (
        <div className="text-center text-zinc-700 py-16 text-sm">
          No meetings yet. Start one to begin tracking.
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-zinc-700 py-12 text-sm">
          No meetings match "{search}"
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {filtered.map(m => {
            const isActive = !m.ended_at;
            const date = new Date(m.started_at);
            const title = m.title || 'Untitled Meeting';
            return (
              <button key={m.id} onClick={() => navigate(`/meetings/${m.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 glass rounded-lg hover:bg-white/[0.04] transition-all text-left">
                {isActive && (
                  <Radio size={14} className="text-emerald-400 animate-pulse flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium truncate ${isActive ? 'text-emerald-300' : 'text-zinc-200'}`}>
                      {title}
                    </span>
                    {m.project && (
                      <span className="text-xs text-cyan-400/70 flex-shrink-0">{m.project.short_code || m.project.name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-zinc-600">
                      {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {!isActive && m.items_resolved + m.items_added > 0 && (
                      <span className="text-xs text-zinc-700">
                        {m.items_resolved} resolved &middot; {m.items_added} added
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center -space-x-1.5 flex-shrink-0">
                  {(m.attendees || []).slice(0, 4).map(a => (
                    <Avatar key={a.id} src={a.avatar} name={a.display_name} size="xs" />
                  ))}
                  {(m.attendees || []).length > 4 && (
                    <span className="text-xs text-zinc-600 ml-1">+{m.attendees.length - 4}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
