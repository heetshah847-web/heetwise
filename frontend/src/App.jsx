import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Groups from './pages/Groups.jsx';
import GroupDetail from './pages/GroupDetail.jsx';
import GroupStats from './pages/GroupStats.jsx';
import MemberStats from './pages/MemberStats.jsx';
import MyStats from './pages/MyStats.jsx';
import Currencies from './pages/Currencies.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import PageTransition from './components/PageTransition.jsx';
import Fab from './components/Fab.jsx';
import Sidebar from './components/Sidebar.jsx';
import { useAuth } from './context/AuthContext.jsx';

// Wraps a page in route-change animation + (for app pages) the auth guard.
const page = (element, { guard = true } = {}) => {
  const inner = guard ? <ProtectedRoute>{element}</ProtectedRoute> : element;
  return <PageTransition>{inner}</PageTransition>;
};

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={page(<Login />, { guard: false })} />
        <Route path="/register" element={page(<Register />, { guard: false })} />
        <Route path="/" element={page(<Dashboard />)} />
        <Route path="/groups" element={page(<Groups />)} />
        <Route path="/groups/:groupId" element={page(<GroupDetail />)} />
        <Route path="/groups/:groupId/stats" element={page(<GroupStats />)} />
        <Route
          path="/groups/:groupId/members/:memberId/stats"
          element={page(<MemberStats />)}
        />
        <Route path="/dashboard/stats" element={page(<MyStats />)} />
        <Route path="/currencies" element={page(<Currencies />)} />
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  const { user } = useAuth();
  return (
    <>
      {/* Sidebar + content offset only when signed in (no routing change). */}
      {user && <Sidebar />}
      <div className={user ? 'md:pl-60' : ''}>
        <AnimatedRoutes />
      </div>
      {/* Always-visible quick-add, only when signed in. */}
      {user && <Fab />}
    </>
  );
}
