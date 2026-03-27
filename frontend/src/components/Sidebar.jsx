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
    <aside className={`flex flex-col bg-zinc-900 border-r border-zinc-800 transition-all ${collapsed ? 'w-14' : 'w-48'}`}>
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
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
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
