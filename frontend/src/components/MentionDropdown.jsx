import { User, FolderKanban, Clock, Tag } from 'lucide-react';

const ICONS = {
  person: <User size={14} className="text-indigo-400 flex-shrink-0" />,
  project: <FolderKanban size={14} className="text-cyan-400 flex-shrink-0" />,
  urgency: <Clock size={14} className="text-amber-400 flex-shrink-0" />,
  type: <Tag size={14} className="text-blue-400 flex-shrink-0" />,
};

export default function MentionDropdown({ results, selectedIndex, onSelect, position = 'below' }) {
  if (!results || results.length === 0) return null;

  const posClass = position === 'above'
    ? 'bottom-full mb-1'
    : 'top-full mt-1';

  return (
    <div className={`absolute ${posClass} left-0 right-0 rounded-lg border border-white/10 shadow-xl shadow-black/50 overflow-hidden z-[100] bg-zinc-900/95 backdrop-blur-xl`}>
      {results.map((item, i) => (
        <button
          key={`${item.type}-${item.id}`}
          onMouseDown={(e) => { e.preventDefault(); onSelect(item); }}
          className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
            i === selectedIndex ? 'bg-blue-500/15 text-zinc-200' : 'text-zinc-400 hover:bg-white/[0.04]'
          }`}
        >
          {ICONS[item.type] || ICONS.type}
          <span className="font-medium">{item.prefix === '#' ? `#${item.name}` : item.name}</span>
          {item.fullName && item.fullName !== item.name && <span className="text-xs text-zinc-500">({item.fullName})</span>}
          {item.detail && <span className="text-xs text-zinc-600">{item.detail}</span>}
          <span className="text-xs text-zinc-700 ml-auto">{item.type}</span>
        </button>
      ))}
    </div>
  );
}
