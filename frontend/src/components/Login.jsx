import { useState, useRef, useEffect } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // TOTP step
  const [totpStep, setTotpStep] = useState(false);
  const [pendingToken, setPendingToken] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const totpRef = useRef(null);

  useEffect(() => {
    if (totpStep && totpRef.current) totpRef.current.focus();
  }, [totpStep]);

  const submitLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setError(data.detail || 'Too many attempts. Please wait and try again.');
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError('Invalid username or password');
        setLoading(false);
        return;
      }
      if (data.requires_totp) {
        setPendingToken(data.pending_token);
        setTotpStep(true);
        setLoading(false);
        return;
      }
      onLogin?.();
    } catch {
      setError('Connection failed');
    }
    setLoading(false);
  };

  const submitTotp = async (code) => {
    const c = code || totpCode;
    if (c.length < 6) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/verify-totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: c, pending_token: pendingToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Invalid code');
        setTotpCode('');
        setLoading(false);
        return;
      }
      onLogin?.();
    } catch {
      setError('Connection failed');
    }
    setLoading(false);
  };

  const handleTotpChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 8);
    setTotpCode(val);
    // Auto-submit on 6 digits (TOTP code)
    if (val.length === 6) submitTotp(val);
  };

  const goBack = () => {
    setTotpStep(false);
    setPendingToken('');
    setTotpCode('');
    setError('');
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="glass rounded-2xl p-8 shadow-2xl shadow-black/40" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex justify-center mb-5">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center border ${
              totpStep
                ? 'bg-emerald-500/10 border-emerald-500/20'
                : 'bg-blue-500/10 border-blue-500/20'
            }`}>
              {totpStep
                ? <ShieldCheck size={24} className="text-emerald-400" />
                : <Lock size={24} className="text-blue-400" />
              }
            </div>
          </div>
          <h1 className="text-2xl font-bold text-zinc-100 text-center mb-1">Ledger</h1>
          <p className="text-xs text-zinc-600 text-center mb-6">
            {totpStep ? 'Enter your verification code' : 'Sign in to continue'}
          </p>

          {error && (
            <div className="mb-4 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm text-center">
              {error}
            </div>
          )}

          {!totpStep ? (
            <form onSubmit={submitLogin}>
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
            </form>
          ) : (
            <div>
              <div className="space-y-3">
                <input
                  ref={totpRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={totpCode}
                  onChange={handleTotpChange}
                  onKeyDown={e => { if (e.key === 'Enter') submitTotp(); }}
                  placeholder="6-digit code or backup code"
                  className="w-full glass-input rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none text-center tracking-[0.3em] font-mono"
                />
              </div>
              <button
                onClick={() => submitTotp()}
                disabled={loading || totpCode.length < 6}
                className="w-full mt-5 bg-emerald-600/80 hover:bg-emerald-500 text-white rounded-lg py-2.5 text-sm font-medium border border-emerald-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                {loading ? 'Verifying...' : 'Verify'}
              </button>
              <button
                onClick={goBack}
                className="w-full mt-2 text-xs text-zinc-600 hover:text-zinc-400 transition-colors py-1"
              >
                Back to login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
