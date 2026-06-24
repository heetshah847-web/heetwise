import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
    <div style={{ maxWidth: 640, margin: '48px auto', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h1>Your groups</h1>
        <div>
          <span style={{ marginRight: 12, color: '#666' }}>{user?.email}</span>
          <button onClick={handleLogout}>Log out</button>
        </div>
      </div>

      <form onSubmit={handleCreate} style={{ margin: '16px 0' }}>
        <input
          placeholder="New group name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={{ padding: 8, width: 240 }}
        />
        <button type="submit" style={{ padding: '8px 16px', marginLeft: 8 }}>
          Create
        </button>
      </form>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : groups.length === 0 ? (
        <p>No groups yet. Create one above.</p>
      ) : (
        <ul>
          {groups.map((g) => (
            <li key={g.id} style={{ marginBottom: 8 }}>
              <Link to={`/groups/${g.id}`}>{g.name}</Link>{' '}
              <span style={{ color: '#888' }}>
                ({g.members.length} member{g.members.length === 1 ? '' : 's'})
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
