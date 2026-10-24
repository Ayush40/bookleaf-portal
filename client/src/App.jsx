import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { Spinner } from './ui.jsx';
import Layout from './Layout.jsx';
import Login from './pages/Login.jsx';
import Books from './pages/author/Books.jsx';
import NewTicket from './pages/author/NewTicket.jsx';
import Tickets from './pages/author/Tickets.jsx';
import Queue from './pages/admin/Queue.jsx';
import TicketDetail from './pages/admin/TicketDetail.jsx';

/** Route guard: sends logged-out users to /login and users with the wrong role to their own home. */
function Guard({ role, children }) {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner label="Loading…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/books'} replace />;
  return children;
}

function Home() {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'admin' ? '/admin' : '/books'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Guard role="author"><Layout /></Guard>}>
        <Route path="/books" element={<Books />} />
        <Route path="/submit" element={<NewTicket />} />
        <Route path="/tickets" element={<Tickets />} />
        <Route path="/tickets/:id" element={<Tickets />} />
      </Route>
      <Route element={<Guard role="admin"><Layout /></Guard>}>
        <Route path="/admin" element={<Queue />} />
        <Route path="/admin/tickets/:id" element={<TicketDetail />} />
      </Route>
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
