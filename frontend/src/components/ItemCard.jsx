import { useState } from 'react';
import { Check, X, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../api/client';
import { Link } from 'react-router-dom';

const TYPE_COLORS = {
  followup: 'bg-blue-500/20 text-blue-400',
  todo: 'bg-emerald-500/20 text-emerald-400',
  reminder: 'bg-orange-500/20 text-orange-400',
  discussion: 'bg-cyan-500/20 text-cyan-400',
  goal: 'bg-purple-500/20 text-purple-400',
  note: 'bg-zinc-500/20 text-zinc-400',
  profile_update: 'bg-pink-500/20 text-pink-400',
};

const URGENCY_COLORS = {
  today: 'bg-red-500/20 text-red-400',
  this_week: 'bg-amber-500/20 text-amber-400',
  this_month: 'bg-blue-500/20 text-blue-300',
  someday: 'bg-zinc-600/20 text-zinc-400',
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
    <div className={`group bg-zinc-900 border border-zinc-800 rounded-lg ${compact ? 'px-3 py-2' : 'px-4 py-3'} hover:border-zinc-700 transition-colors`}>
      <div className="flex items-start gap-3">
        <button onClick={markDone} className="mt-0.5 flex-shrink-0 w-5 h-5 rounded border border-zinc-600 hover:border-emerald-500 hover:bg-emerald-500/10 flex items-center justify-center transition-colors">
          <Check size={12} className="text-zinc-600 group-hover:text-emerald-500" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-200 leading-relaxed">
            {displayText}
            {item.raw_text.length > 120 && (
              <button onClick={() => setExpanded(!expanded)} className="ml-1 text-zinc-500 hover:text-zinc-300">
                {expanded ? <ChevronUp size={14} className="inline" /> : <ChevronDown size={14} className="inline" />}
              </button>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {isProcessing && <span className="badge bg-zinc-700 text-zinc-400"><Loader2 size={10} className="inline animate-spin mr-1" />classifying</span>}
            {type && <span className={`badge ${TYPE_COLORS[type] || TYPE_COLORS.note}`}>{type.replace('_', ' ')}</span>}
            {urgency && <span className={`badge ${URGENCY_COLORS[urgency] || URGENCY_COLORS.someday}`}>{urgency.replace('_', ' ')}</span>}
            {item.linked_people?.map(p => (
              <Link key={p.id} to={`/people/${p.id}`} className="badge bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 cursor-pointer">
                {p.display_name}
              </Link>
            ))}
            {item.linked_projects?.map(p => (
              <Link key={p.id} to={`/projects/${p.id}`} className="badge bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 cursor-pointer">
                {p.short_code || p.name}
              </Link>
            ))}
            <span className="text-xs text-zinc-600 ml-auto">{timeAgo(item.created_at)}</span>
          </div>
        </div>
        <button onClick={dismiss} className="opacity-0 group-hover:opacity-100 mt-0.5 p-1 text-zinc-600 hover:text-zinc-400 transition-all" title="Dismiss">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
