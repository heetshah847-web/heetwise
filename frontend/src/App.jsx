import { Routes, Route } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Groups from './pages/Groups.jsx';
import GroupDetail from './pages/GroupDetail.jsx';
import GroupStats from './pages/GroupStats.jsx';
import MemberStats from './pages/MemberStats.jsx';
import MyStats from './pages/MyStats.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/groups"
        element={
          <ProtectedRoute>
            <Groups />
          </ProtectedRoute>
        }
      />
      <Route
        path="/groups/:groupId"
        element={
          <ProtectedRoute>
            <GroupDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/groups/:groupId/stats"
        element={
          <ProtectedRoute>
            <GroupStats />
          </ProtectedRoute>
        }
      />
      <Route
        path="/groups/:groupId/members/:memberId/stats"
        element={
          <ProtectedRoute>
            <MemberStats />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/stats"
        element={
          <ProtectedRoute>
            <MyStats />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
