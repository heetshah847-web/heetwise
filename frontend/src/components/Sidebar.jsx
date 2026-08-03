import { useCallback, useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Home, Users, Coins, BarChart3, Inbox, Scale, LogOut } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { cn } from '../lib/cn.js';

const LINKS = [
  { to: '/', label: 'Dashboard', icon: Home, end: true },
  { to: '/groups', label: 'Groups', icon: Users },
  { to: '/summary', label: 'Summary', icon: Scale },
  { to: '/requests', label: 'Requests', icon: Inbox },
  { to: '/currencies', label: 'Currencies', icon: Coins },
  { to: '/dashboard/stats', label: 'Your stats', icon: BarChart3 },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Count of people the current user owes money to — shown as a red badge on
  // the Summary nav item so outstanding debts are visible at a glance.
  const [oweCount, setOweCount] = useState(0);

  const loadOweCount = useCallback(async () => {
    try {
      const d = await api.getBalancesSummary();
      const count = (d.balances || []).filter(
        (b) => b.netAmountCents < 0
      ).length;
      setOweCount(count);
    } catch {
      /* silent — the badge is non-critical UI */
    }
  }, []);

  // Refresh on mount and whenever the route changes (e.g. after settling up on
  // the Summary page) so the badge stays in sync.
  useEffect(() => {
    if (user) loadOweCount();
  }, [user, location.pathname, loadOweCount]);

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
        {LINKS.map(({ to, label, icon: Icon, end }) => {
          const showBadge = to === '/summary' && oweCount > 0;
          return (
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
              <span className="flex-1">{label}</span>
              {showBadge && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">
                  {oweCount > 99 ? '99+' : oweCount}
                </span>
              )}
            </NavLink>
          );
        })}
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
