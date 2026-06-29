import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users, Plus, ArrowRight } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Groups() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await api.listGroups();
      setGroups(data.groups);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await api.createGroup(name);
      setName('');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="mx-auto max-w-3xl p-6 md:p-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Your groups</h1>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted sm:inline">{user?.email}</span>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted transition-colors hover:text-danger"
          >
            Log out
          </button>
        </div>
      </div>

      <form onSubmit={handleCreate} className="mt-6 flex gap-2">
        <input
          placeholder="New group name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="flex-1"
        />
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600"
        >
          <Plus size={16} /> Create
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      <div className="mt-6 space-y-2">
        {loading ? (
          <p className="text-muted">Loading…</p>
        ) : groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted">
            No groups yet. Create one above.
          </div>
        ) : (
          groups.map((g) => (
            <Link
              key={g.id}
              to={`/groups/${g.id}`}
              className="group flex items-center gap-4 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-brand-500/60"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
                <Users size={20} />
              </div>
              <div className="flex-1">
                <div className="font-medium">{g.name}</div>
                <div className="text-sm text-muted">
                  {g.members.length} member{g.members.length === 1 ? '' : 's'}
                </div>
              </div>
              <ArrowRight
                size={18}
                className="text-muted transition-transform group-hover:translate-x-1 group-hover:text-brand-400"
              />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
