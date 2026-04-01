import { NavLink } from 'react-router-dom';
import { LayoutList, Users, FolderKanban, CalendarDays, Clock, ArrowUpDown, Settings, PanelLeftClose, PanelLeft, LogOut, Menu, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const links = [
  { to: '/', icon: LayoutList, label: 'Feed' },
  { to: '/people', icon: Users, label: 'People' },
  { to: '/projects', icon: FolderKanban, label: 'Projects' },
  { to: '/digest', icon: CalendarDays, label: 'Digest' },
  { to: '/timeline', icon: Clock, label: 'Timeline' },
  { to: '/import-export', icon: ArrowUpDown, label: 'Import/Export' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar({ collapsed, onToggle, onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const navContent = (onClick) => (
    <>
      <nav className="flex flex-col gap-0.5 px-2 flex-1">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onClick}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all ${
                isActive
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] border border-transparent'
              }`
            }
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="px-2 pb-3">
        <button
          onClick={() => { onLogout(); onClick?.(); }}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all w-full"
        >
          <LogOut size={18} />
          <span>Sign Out</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-3 left-3 z-50 p-2 rounded-lg glass text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-56 flex flex-col glass backdrop-blur-xl" style={{ borderRadius: 0 }}>
            <div className="flex items-center justify-between p-3">
              <span className="text-sm font-semibold text-zinc-300">Ledger</span>
              <button onClick={() => setMobileOpen(false)} className="text-zinc-500 hover:text-zinc-300">
                <X size={20} />
              </button>
            </div>
            {navContent(() => setMobileOpen(false))}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className={`hidden md:flex flex-col border-r border-white/[0.06] bg-black/40 backdrop-blur-xl transition-all ${collapsed ? 'w-14' : 'w-48'}`}>
        <button onClick={onToggle} className="p-3 text-zinc-500 hover:text-zinc-300 self-end">
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <nav className="flex flex-col gap-0.5 px-2 flex-1">
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
        <div className="px-2 pb-3">
          <button
            onClick={onLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all w-full"
          >
            <LogOut size={18} />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
