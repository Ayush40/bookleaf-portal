import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const DEMOS = [
  { label: 'Author: Ananya (no payout yet)', email: 'ananya.reddy@email.com', password: 'Author@123' },
  { label: 'Author: Kavita (book in production)', email: 'kavita.deshmukh@email.com', password: 'Author@123' },
  { label: 'Admin: Riya (Ops)', email: 'admin@bookleaf.com', password: 'Admin@123' },
];

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/books'} replace />;

  async function submit(e, creds = form) {
    e?.preventDefault();
    setError(''); setBusy(true);
    try {
      const u = await login(creds.email, creds.password);
      nav(u.role === 'admin' ? '/admin' : '/books', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="login-art">
        <div className="logo" style={{ padding: 0 }}><span className="mark">📖</span><div>BookLeaf</div></div>
        <h1>Your questions, answered faster.</h1>
        <p>Track your books and royalties, and get help from the BookLeaf team in one place.</p>
        <ul><li>See every book, royalty and payout at a glance</li><li>Raise a query and watch the reply arrive live</li><li>Clear timelines on every response</li></ul>
      </section>
      <section className="login-form">
        <form className="login-box" onSubmit={submit} noValidate>
          <h1>Welcome back</h1>
          <p className="muted" style={{ margin: '4px 0 22px' }}>Sign in to your BookLeaf account</p>
          {error && <div className="alert error">{error}</div>}
          <label className="field">Email<input type="email" autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@email.com" required /></label>
          <label className="field">Password<input type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" required /></label>
          <button className="btn primary" style={{ width: '100%' }} disabled={busy || !form.email || !form.password}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <div className="demo">
            <b>Demo accounts</b> <span className="muted">(click to sign in)</span>
            {DEMOS.map((d) => <div className="row" key={d.email}><button type="button" className="btn sm" disabled={busy} onClick={() => submit(null, d)}>{d.label}</button></div>)}
            <p className="muted small" style={{ margin: '10px 0 0' }}>All authors use <code>Author@123</code>, admins use <code>Admin@123</code>.</p>
          </div>
        </form>
      </section>
    </div>
  );
}
