import { useState, useRef, useCallback } from 'react';
import ItemCard from './ItemCard';
import { api } from '../api/client';

export default function DraggableItemList({ items, setItems, onUpdate, compact = false }) {
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const dragNode = useRef(null);

  const handleDragStart = useCallback((e, idx) => {
    setDragIdx(idx);
    dragNode.current = e.target;
    e.dataTransfer.effectAllowed = 'move';
    // Make ghost semi-transparent
    setTimeout(() => {
      if (dragNode.current) dragNode.current.style.opacity = '0.4';
    }, 0);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragNode.current) dragNode.current.style.opacity = '1';
    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
      const reordered = [...items];
      const [moved] = reordered.splice(dragIdx, 1);
      reordered.splice(overIdx, 0, moved);
      setItems(reordered);
      // Sync to API
      api.reorderCaptures(reordered.map(i => i.id)).catch(console.error);
    }
    setDragIdx(null);
    setOverIdx(null);
    dragNode.current = null;
  }, [dragIdx, overIdx, items, setItems]);

  const handleDragOver = useCallback((e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverIdx(idx);
  }, []);

  if (items.length === 0) {
    return <div className="text-center text-zinc-700 py-8 text-sm">No items</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item, idx) => (
        <div
          key={item.id}
          draggable
          onDragStart={e => handleDragStart(e, idx)}
          onDragEnd={handleDragEnd}
          onDragOver={e => handleDragOver(e, idx)}
          className={`transition-all ${overIdx === idx && dragIdx !== null && dragIdx !== idx ? 'border-t-2 border-blue-500/50' : ''}`}
        >
          <ItemCard item={item} onUpdate={onUpdate} compact={compact} />
        </div>
      ))}
    </div>
  );
}
