import { User, FolderKanban } from 'lucide-react';

export default function MentionDropdown({ results, selectedIndex, onSelect, position = 'below' }) {
  if (!results || results.length === 0) return null;

  const posClass = position === 'above'
    ? 'bottom-full mb-1'
    : 'top-full mt-1';

  return (
    <div className={`absolute ${posClass} left-0 right-0 glass rounded-lg border border-white/10 shadow-xl shadow-black/40 overflow-hidden z-50`}>
      {results.map((item, i) => (
        <button
          key={`${item.type}-${item.id}`}
          onMouseDown={(e) => { e.preventDefault(); onSelect(item); }}
          className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
            i === selectedIndex ? 'bg-blue-500/15 text-zinc-200' : 'text-zinc-400 hover:bg-white/[0.04]'
          }`}
        >
          {item.type === 'person'
            ? <User size={14} className="text-indigo-400 flex-shrink-0" />
            : <FolderKanban size={14} className="text-cyan-400 flex-shrink-0" />
          }
          <span className="font-medium">{item.name}</span>
          {item.detail && <span className="text-xs text-zinc-600">{item.detail}</span>}
          <span className="text-xs text-zinc-700 ml-auto">{item.type}</span>
        </button>
      ))}
    </div>
  );
}
