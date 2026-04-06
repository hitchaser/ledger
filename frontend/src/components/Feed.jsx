import { useState, useEffect } from 'react';
import { api } from '../api/client';
import DraggableItemList from './DraggableItemList';
import { CalendarDays } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const TYPE_OPTIONS = ['all', 'todo', 'followup', 'reminder', 'discussion', 'goal', 'note'];

export default function Feed({ refreshKey, onRefresh, itemUpdate, showDigestBanner, onDismissDigest }) {
  const [items, setItems] = useState([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showArchive, setShowArchive] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const params = {};
    if (typeFilter !== 'all') params.type = typeFilter;
    if (search) params.search = search;
    if (showArchive) params.include_done = 'true';
    else params.status = 'open';
    api.listCaptures(params).then(setItems).catch(console.error);
  }, [refreshKey, typeFilter, search, showArchive]);

  // Merge WebSocket item updates into local state
  useEffect(() => {
    if (!itemUpdate) return;
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === itemUpdate.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = itemUpdate;
        return updated;
      }
      return prev;
    });
  }, [itemUpdate]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 page-transition">
      {showDigestBanner && (
        <div className="mb-4 p-3 glass rounded-lg flex items-center justify-between border-blue-500/20">
          <div className="flex items-center gap-2 text-blue-400 text-sm">
            <CalendarDays size={16} />
            <span>Your daily digest is ready</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate('/digest')} className="text-xs text-blue-400 hover:text-blue-300 font-medium">View</button>
            <button onClick={onDismissDigest} className="text-xs text-zinc-600 hover:text-zinc-400">Dismiss</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="glass-input rounded px-2 py-1 text-xs text-zinc-400 outline-none">
          {TYPE_OPTIONS.map(o => <option key={o} value={o}>{o === 'all' ? 'All Types' : o}</option>)}
        </select>
        <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
          className="glass-input rounded px-2 py-1 text-xs text-zinc-400 flex-1 outline-none" />
        <label className="flex items-center gap-1 text-xs text-zinc-600 ml-auto cursor-pointer">
          <input type="checkbox" checked={showArchive} onChange={e => setShowArchive(e.target.checked)} className="rounded" />
          Show archive
        </label>
      </div>

      <DraggableItemList items={items} setItems={setItems} onUpdate={onRefresh} />
    </div>
  );
}
