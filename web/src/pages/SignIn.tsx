import { useState } from 'react';
import { useAuth } from '@/data/auth';

export function SignIn() {
  const { signIn, signUp, resendConfirmation } = useAuth();
  const [mode, setMode] = useState<'in' | 'up' | 'check-inbox'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'in') await signIn(email, password);
      else if (await signUp(email, password, name || email.split('@')[0])) {
        setPassword('');
        setResent(false);
        setMode('check-inbox');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setError(null);
    try {
      await resendConfirmation(email);
      setResent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'check-inbox') {
    return (
      <div className="app">
        <div className="sheet sheet-narrow">
          <div className="wnav">
            <span className="wnav-brand">Regi</span>
          </div>

          <div style={{ padding: '32px 20px', background: 'var(--color-bg)', minHeight: '60vh' }}>
            <h3 style={{ margin: '0 0 4px' }}>Check your inbox</h3>
            <p style={{ fontSize: 13, opacity: 0.75, maxWidth: 420 }}>
              Your account has been created. We sent a confirmation link to <strong>{email}</strong> — follow it
              to finish signing up, and you will land back here signed in.
            </p>

            {error ? (
              <div className="error" style={{ maxWidth: 420, margin: '12px 0' }}>
                {error}
              </div>
            ) : null}

            <div style={{ maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
              <p style={{ fontSize: 13, opacity: 0.75, margin: 0 }}>
                {resent
                  ? 'Sent again. It can take a minute or two to arrive.'
                  : 'Nothing there? Check your spam folder, or send the link again.'}
              </p>
              <button type="button" className="btn btn-secondary btn-block" onClick={() => void resend()} disabled={busy || resent}>
                {busy ? 'Working…' : 'Resend confirmation email'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ alignSelf: 'flex-start', paddingLeft: 0 }}
                onClick={() => {
                  setError(null);
                  setMode('in');
                }}
              >
                Back to sign in
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="sheet sheet-narrow">
        <div className="wnav">
          <span className="wnav-brand">Regi</span>
        </div>

        <div style={{ padding: '32px 20px', background: 'var(--color-bg)', minHeight: '60vh' }}>
          <h3 style={{ margin: '0 0 4px' }}>{mode === 'in' ? 'Sign in' : 'Create an account'}</h3>
          <p style={{ fontSize: 13, opacity: 0.75, maxWidth: 420 }}>
            Modules, entries and connections all hang off this login — it is also how someone adds you as a
            connection.
          </p>

          {error ? (
            <div className="error" style={{ maxWidth: 420, margin: '12px 0' }}>
              {error}
            </div>
          ) : null}

          <div style={{ maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
            {mode === 'up' ? (
              <div className="field">
                <label htmlFor="name">Display name</label>
                <input className="input" id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                className="input"
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                className="input"
                id="password"
                type="password"
                autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit();
                }}
              />
            </div>

            <button type="button" className="btn btn-primary btn-block" onClick={() => void submit()} disabled={busy}>
              {busy ? 'Working…' : mode === 'in' ? 'Sign in' : 'Create account'}
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              style={{ alignSelf: 'flex-start', paddingLeft: 0 }}
              onClick={() => setMode(mode === 'in' ? 'up' : 'in')}
            >
              {mode === 'in' ? 'Create an account instead' : 'I already have an account'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
