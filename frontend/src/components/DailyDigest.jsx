import { useState, useEffect } from 'react';
import { api } from '../api/client';
import ItemCard from './ItemCard';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarDays, Users, HelpCircle } from 'lucide-react';

export default function DailyDigest() {
  const [digest, setDigest] = useState(null);

  useEffect(() => { api.getDigest().then(setDigest).catch(console.error); }, []);

  if (!digest) return <div className="p-8 text-zinc-500">Loading digest...</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-4">
      <h2 className="text-lg font-semibold text-zinc-200 mb-4 flex items-center gap-2">
        <CalendarDays size={20} /> Daily Digest
      </h2>

      {digest.overdue_items.length > 0 && (
        <section className="mb-6">
          <h3 className="text-sm font-medium text-red-400 mb-2 flex items-center gap-1.5">
            <AlertTriangle size={14} /> Overdue ({digest.overdue_items.length})
          </h3>
          <div className="flex flex-col gap-2">
            {digest.overdue_items.map(i => <ItemCard key={i.id} item={i} compact />)}
          </div>
        </section>
      )}

      {digest.today_items.length > 0 && (
        <section className="mb-6">
          <h3 className="text-sm font-medium text-amber-400 mb-2">Today ({digest.today_items.length})</h3>
          <div className="flex flex-col gap-2">
            {digest.today_items.map(i => <ItemCard key={i.id} item={i} compact />)}
          </div>
        </section>
      )}

      <section className="mb-6">
        <h3 className="text-sm font-medium text-blue-400 mb-2">This Week ({digest.this_week_count})</h3>
        {digest.this_week_items.length > 0 ? (
          <div className="flex flex-col gap-2">
            {digest.this_week_items.map(i => <ItemCard key={i.id} item={i} compact />)}
          </div>
        ) : (
          <p className="text-sm text-zinc-600">Nothing scheduled this week</p>
        )}
      </section>

      {digest.stale_people.length > 0 && (
        <section className="mb-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-2 flex items-center gap-1.5">
            <Users size={14} /> Haven't connected in 14+ days
          </h3>
          <div className="flex flex-wrap gap-2">
            {digest.stale_people.map(p => (
              <Link key={p.id} to={`/people/${p.id}`} className="badge bg-zinc-800 text-zinc-400 hover:text-zinc-200">{p.display_name}</Link>
            ))}
          </div>
        </section>
      )}

      {digest.orphaned_items.length > 0 && (
        <section className="mb-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-2 flex items-center gap-1.5">
            <HelpCircle size={14} /> Unlinked Items
          </h3>
          <div className="flex flex-col gap-2">
            {digest.orphaned_items.map(i => <ItemCard key={i.id} item={i} compact />)}
          </div>
        </section>
      )}

      {digest.overdue_items.length === 0 && digest.today_items.length === 0 && digest.this_week_count === 0 && (
        <div className="text-center text-zinc-600 py-12 text-sm">All clear! Nothing pressing today.</div>
      )}
    </div>
  );
}
