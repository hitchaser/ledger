import { useState } from 'react';
import { Check, X, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../api/client';
import { Link } from 'react-router-dom';

const TYPE_COLORS = {
  followup: 'bg-sky-500/15 text-sky-400 border border-sky-500/20',
  todo: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
  reminder: 'bg-rose-500/15 text-rose-400 border border-rose-500/20',
  discussion: 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20',
  goal: 'bg-violet-500/15 text-violet-400 border border-violet-500/20',
  note: 'bg-slate-500/15 text-slate-400 border border-slate-500/20',
  profile_update: 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20',
};

const URGENCY_COLORS = {
  today: 'bg-rose-500/15 text-rose-300 border border-rose-500/20',
  this_week: 'bg-sky-500/15 text-sky-300 border border-sky-500/20',
  this_month: 'bg-blue-500/10 text-blue-300 border border-blue-500/15',
  someday: 'bg-zinc-500/10 text-zinc-500 border border-zinc-500/15',
};

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

export default function ItemCard({ item, onUpdate, compact = false }) {
  const [expanded, setExpanded] = useState(false);
  const type = item.effective_type;
  const urgency = item.effective_urgency;
  const isProcessing = !item.ai_processed_at && !item.manual_type;
  const displayText = (!expanded && item.raw_text.length > 120) ? item.raw_text.slice(0, 120) + '...' : item.raw_text;

  const markDone = async () => {
    await api.updateCapture(item.id, { status: 'done' });
    onUpdate?.();
  };

  const dismiss = async () => {
    await api.updateCapture(item.id, { status: 'dismissed' });
    onUpdate?.();
  };

  return (
    <div className={`group glass glass-hover rounded-lg ${compact ? 'px-3 py-2' : 'px-4 py-3'} transition-all`}>
      <div className="flex items-start gap-3">
        <button onClick={markDone} className="mt-0.5 flex-shrink-0 w-5 h-5 rounded border border-white/10 hover:border-blue-400/50 hover:bg-blue-500/10 flex items-center justify-center transition-all">
          <Check size={12} className="text-zinc-700 group-hover:text-blue-400" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-300 leading-relaxed">
            {displayText}
            {item.raw_text.length > 120 && (
              <button onClick={() => setExpanded(!expanded)} className="ml-1 text-zinc-600 hover:text-zinc-400">
                {expanded ? <ChevronUp size={14} className="inline" /> : <ChevronDown size={14} className="inline" />}
              </button>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {isProcessing && <span className="badge bg-white/5 text-zinc-500 border border-white/10"><Loader2 size={10} className="inline animate-spin mr-1" />classifying</span>}
            {type && <span className={`badge ${TYPE_COLORS[type] || TYPE_COLORS.note}`}>{type.replace('_', ' ')}</span>}
            {urgency && <span className={`badge ${URGENCY_COLORS[urgency] || URGENCY_COLORS.someday}`}>{urgency.replace('_', ' ')}</span>}
            {item.linked_people?.map(p => (
              <Link key={p.id} to={`/people/${p.id}`} className="badge bg-indigo-500/10 text-indigo-400 border border-indigo-500/15 hover:bg-indigo-500/20 cursor-pointer transition-colors">
                {p.display_name}
              </Link>
            ))}
            {item.linked_projects?.map(p => (
              <Link key={p.id} to={`/projects/${p.id}`} className="badge bg-cyan-500/10 text-cyan-400 border border-cyan-500/15 hover:bg-cyan-500/20 cursor-pointer transition-colors">
                {p.short_code || p.name}
              </Link>
            ))}
            <span className="text-xs text-zinc-700 ml-auto">{timeAgo(item.created_at)}</span>
          </div>
        </div>
        <button onClick={dismiss} className="opacity-0 group-hover:opacity-100 mt-0.5 p-1 text-zinc-700 hover:text-zinc-400 transition-all" title="Dismiss">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
