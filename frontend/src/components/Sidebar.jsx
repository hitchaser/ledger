import { NavLink } from 'react-router-dom';
import { LayoutList, Users, FolderKanban, CalendarDays, PanelLeftClose, PanelLeft } from 'lucide-react';

const links = [
  { to: '/', icon: LayoutList, label: 'Feed' },
  { to: '/people', icon: Users, label: 'People' },
  { to: '/projects', icon: FolderKanban, label: 'Projects' },
  { to: '/digest', icon: CalendarDays, label: 'Digest' },
];

export default function Sidebar({ collapsed, onToggle }) {
  return (
    <aside className={`flex flex-col border-r border-white/[0.06] bg-black/40 backdrop-blur-xl transition-all ${collapsed ? 'w-14' : 'w-48'}`}>
      <button onClick={onToggle} className="p-3 text-zinc-500 hover:text-zinc-300 self-end">
        {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
      </button>
      <nav className="flex flex-col gap-0.5 px-2">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all ${
                isActive
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] border border-transparent'
              }`
            }
          >
            <Icon size={18} />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
