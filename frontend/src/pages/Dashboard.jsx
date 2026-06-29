import { Link, useNavigate } from 'react-router-dom';
import { Users, Coins, BarChart3, ArrowRight, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const TILES = [
  { to: '/groups', label: 'Your groups', desc: 'Create and manage shared expense groups', icon: Users },
  { to: '/currencies', label: 'Currencies & rates', desc: 'Live exchange rates and converter', icon: Coins },
  { to: '/dashboard/stats', label: 'Your statistics', desc: 'Spending insights across all groups', icon: BarChart3 },
];

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="mx-auto max-w-3xl p-6 md:p-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">
            Signed in as <span className="text-fg">{user?.email}</span>
            {user?.name ? ` (${user.name})` : ''}.
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted transition-colors hover:text-danger"
        >
          <LogOut size={16} /> Log out
        </button>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {TILES.map(({ to, label, desc, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="group rounded-xl border border-border bg-surface p-5 transition-colors hover:border-brand-500/60"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
                <Icon size={20} />
              </div>
              <ArrowRight
                size={18}
                className="text-muted transition-transform group-hover:translate-x-1 group-hover:text-brand-400"
              />
            </div>
            <div className="mt-4 font-semibold">{label}</div>
            <div className="mt-1 text-sm text-muted">{desc}</div>
          </Link>
        ))}
      </div>

      <p className="mt-6 text-xs text-muted">User ID: {user?.id}</p>
    </div>
  );
}
