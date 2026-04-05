import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Clock, CheckCircle, Users, FileText, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';

const EVENT_ICONS = {
  item_created: { icon: FileText, color: 'text-blue-400' },
  item_resolved: { icon: CheckCircle, color: 'text-emerald-400' },
  meeting: { icon: Users, color: 'text-violet-400' },
  meeting_summary: { icon: MessageSquare, color: 'text-cyan-400' },
  profile_update: { icon: FileText, color: 'text-pink-400' },
};

function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function groupByDate(events) {
  const groups = {};
  for (const e of events) {
    const date = new Date(e.timestamp).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    if (!groups[date]) groups[date] = [];
    groups[date].push(e);
  }
  return Object.entries(groups);
}

function ClampedText({ text, eventKey }) {
  const [expanded, setExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const textRef = useRef(null);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    // Force layout read after clamp styles are applied
    requestAnimationFrame(() => {
      if (el) setIsClamped(el.scrollHeight > el.clientHeight + 1);
    });
  }, [text]);

  return (
    <>
      <p ref={textRef} className={`text-sm text-zinc-300 ${!expanded ? 'line-clamp-2' : ''}`}>{text}</p>
      {isClamped && (
        <button onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-0.5 text-xs text-zinc-600 hover:text-zinc-400 mt-0.5 transition-colors">
          {expanded ? <><ChevronUp size={12} /> Less</> : <><ChevronDown size={12} /> More</>}
        </button>
      )}
    </>
  );
}

export default function Timeline() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [days, setDays] = useState(7);

  useEffect(() => { api.getTimeline(days).then(setData).catch(console.error); }, [days]);

  if (!data) return <div className="p-8 text-zinc-600">Loading timeline...</div>;

  const grouped = groupByDate(data.events);

  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-200 flex items-center gap-2">
          <Clock size={20} className="text-blue-400" /> Timeline
        </h2>
        <div className="flex gap-1">
          {[7, 14, 30].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`text-xs px-2 py-1 rounded transition-all ${days === d
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'glass text-zinc-500 hover:text-zinc-300'
              }`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="glass rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-zinc-200">{data.stats.items_created}</div>
          <div className="text-xs text-zinc-500">Items Created</div>
        </div>
        <div className="glass rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-zinc-200">{data.stats.items_resolved}</div>
          <div className="text-xs text-zinc-500">Resolved</div>
        </div>
        <div className="glass rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-zinc-200">{data.stats.meetings_held}</div>
          <div className="text-xs text-zinc-500">Meetings</div>
        </div>
      </div>

      {/* Event list */}
      {grouped.map(([date, events]) => (
        <div key={date} className="mb-4">
          <h3 className="text-xs text-zinc-500 font-medium uppercase tracking-wide mb-2">{date}</h3>
          <div className="flex flex-col gap-1">
            {events.map((e, i) => {
              const cfg = EVENT_ICONS[e.type] || EVENT_ICONS.item_created;
              const Icon = cfg.icon;
              const isMeeting = e.type === 'meeting';
              return (
                <div key={i}
                  className={`flex items-start gap-3 glass rounded-lg px-3 py-2 ${isMeeting ? 'cursor-pointer hover:bg-white/[0.04]' : ''}`}
                  onClick={isMeeting && e.meeting_id ? () => navigate(`/meetings/${e.meeting_id}`) : undefined}>
                  <Icon size={14} className={`mt-0.5 flex-shrink-0 ${cfg.color}`} />
                  <div className="flex-1 min-w-0">
                    <ClampedText text={e.text} eventKey={`${date}-${i}`} />
                    {e.people?.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {e.people.map(p => <span key={p.id} title={p.name || p.display_name} className="badge bg-indigo-500/10 text-indigo-400 border border-indigo-500/15">{p.display_name}</span>)}
                      </div>
                    )}
                    {e.projects?.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {e.projects.map(p => <span key={p.id} className="badge bg-cyan-500/10 text-cyan-400 border border-cyan-500/15">{p.short_code || p.name}</span>)}
                      </div>
                    )}
                    {isMeeting && (
                      <div className="flex items-center gap-2 mt-1">
                        {e.attendees?.length > 0 && (
                          <span className="text-xs text-indigo-400/60">{e.attendees.join(', ')}</span>
                        )}
                        {e.project_name && (
                          <span className="text-xs text-cyan-400/60">{e.project_name}</span>
                        )}
                        <span className="text-xs text-zinc-600">{e.items_resolved} resolved, {e.items_added} added</span>
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-zinc-700 flex-shrink-0">{formatDate(e.timestamp)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {data.events.length === 0 && (
        <div className="text-center text-zinc-700 py-12 text-sm">No activity in the last {days} days</div>
      )}
    </div>
  );
}
