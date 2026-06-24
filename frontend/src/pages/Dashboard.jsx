import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div style={{ maxWidth: 480, margin: '64px auto', fontFamily: 'sans-serif' }}>
      <h1>Dashboard</h1>
      <p>
        Signed in as <strong>{user?.email}</strong>
        {user?.name ? ` (${user.name})` : ''}.
      </p>
      <p style={{ color: '#666' }}>User ID: {user?.id}</p>
      <button onClick={handleLogout} style={{ padding: '8px 16px' }}>
        Log out
      </button>
    </div>
  );
}
