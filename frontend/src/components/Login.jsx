import { useState } from 'react';
import { Lock } from 'lucide-react';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        setError('Invalid username or password');
        setLoading(false);
        return;
      }
      onLogin?.();
    } catch {
      setError('Connection failed');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm">
        <div className="glass rounded-2xl p-8 shadow-2xl shadow-black/40" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex justify-center mb-5">
            <div className="w-14 h-14 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Lock size={24} className="text-blue-400" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-zinc-100 text-center mb-1">Ledger</h1>
          <p className="text-xs text-zinc-600 text-center mb-6">Sign in to continue</p>

          {error && (
            <div className="mb-4 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm text-center">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Username"
              autoFocus
              autoComplete="username"
              className="w-full glass-input rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none"
            />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              className="w-full glass-input rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full mt-5 bg-blue-600/80 hover:bg-blue-500 text-white rounded-lg py-2.5 text-sm font-medium border border-blue-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>
      </form>
    </div>
  );
}
