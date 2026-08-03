import { NavLink, useNavigate } from 'react-router-dom';
import { Home, Users, Coins, BarChart3, Inbox, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { cn } from '../lib/cn.js';

const LINKS = [
  { to: '/', label: 'Dashboard', icon: Home, end: true },
  { to: '/groups', label: 'Groups', icon: Users },
  { to: '/requests', label: 'Requests', icon: Inbox },
  { to: '/currencies', label: 'Currencies', icon: Coins },
  { to: '/dashboard/stats', label: 'Your stats', icon: BarChart3 },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const initial = (user?.name || user?.email || '?').charAt(0).toUpperCase();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface md:flex">
      <div className="px-5 py-5 text-xl font-bold tracking-tight text-fg">
        Heet<span className="text-brand-400">wise</span>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {LINKS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-500/15 text-brand-400'
                  : 'text-muted hover:bg-white/5 hover:text-fg'
              )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500/20 font-semibold text-brand-400">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-fg">
              {user?.name || 'Account'}
            </div>
            <div className="truncate text-xs text-muted">{user?.email}</div>
          </div>
          <button
            onClick={handleLogout}
            title="Log out"
            className="rounded-md p-2 text-muted transition-colors hover:bg-white/5 hover:text-danger"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </aside>
  );
}
