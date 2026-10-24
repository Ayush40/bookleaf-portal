import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { api } from './api.js';
import { usePoll } from './hooks.js';

export default function Layout() {
  const { user, logout } = useAuth();
  const isAdmin = user.role === 'admin';
  // Sidebar badge: unresolved critical tickets (admin), refreshed in the background.
  const stats = usePoll(() => (isAdmin ? api.get('/admin/stats') : Promise.resolve(null)), [isAdmin], 15000);
  const critical = stats.data?.tickets.criticalOpen;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo"><span className="mark">📖</span><div>BookLeaf<small>{isAdmin ? 'Operations' : 'Author Portal'}</small></div></div>
        <nav className="nav">
          {isAdmin ? (
            <NavLink to="/admin" end>🎫 Ticket queue {critical > 0 && <span className="count">{critical}</span>}</NavLink>
          ) : (
            <>
              <NavLink to="/books">📚 My Books</NavLink>
              <NavLink to="/submit">✉️ Submit a Query</NavLink>
              <NavLink to="/tickets">💬 My Tickets</NavLink>
            </>
          )}
        </nav>
        <div className="user"><b>{user.name}</b><span>{user.email}</span><button className="btn ghost sm" onClick={logout}>Sign out</button></div>
      </aside>
      <main className="main"><Outlet /></main>
    </div>
  );
}
