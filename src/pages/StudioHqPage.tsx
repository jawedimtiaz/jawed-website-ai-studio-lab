import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

type HqOwner = { uid: string; email: string; displayName?: string };
type HqStatus = 'loading' | 'signed-out' | 'checking' | 'authorized' | 'blocked';

function explainFailure(status: number, code?: string): string {
  if (status === 503 || code === 'DATABASE_UNAVAILABLE') {
    return 'Studio HQ is not enabled yet. The private database connection must be configured and verified before owner access can be granted.';
  }
  if (code === 'OWNER_NOT_ENROLLED') {
    return 'Your Google account is authenticated, but its Firebase UID has not been explicitly enrolled as the Studio HQ owner.';
  }
  if (code === 'UNAUTHORIZED_EMAIL') {
    return 'This Google account is not on the Studio HQ owner allowlist.';
  }
  if (code === 'OWNER_DISABLED') {
    return 'Studio HQ owner access is currently disabled for this account.';
  }
  if (code === 'EMAIL_MISMATCH') {
    return 'The authenticated email does not match the enrolled Studio HQ owner record.';
  }
  return 'Studio HQ could not verify this session. Sign out and try again.';
}

export const StudioHqPage: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [owner, setOwner] = useState<HqOwner | null>(null);
  const [status, setStatus] = useState<HqStatus>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => onAuthStateChanged(auth, (currentUser) => {
    setUser(currentUser);
    setOwner(null);
    setError('');
    setStatus(currentUser ? 'checking' : 'signed-out');
  }), []);

  useEffect(() => {
    if (!user) return;
    let active = true;

    const verifySession = async () => {
      setStatus('checking');
      setError('');
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/hq/session', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}` },
          cache: 'no-store',
          credentials: 'same-origin'
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.success !== true || payload?.authenticated !== true || !payload?.owner) {
          const code = payload?.error?.code || payload?.error;
          throw new Error(explainFailure(response.status, code));
        }
        if (active) {
          setOwner({
            uid: String(payload.owner.uid),
            email: String(payload.owner.email),
            displayName: typeof payload.owner.displayName === 'string' ? payload.owner.displayName : ''
          });
          setStatus('authorized');
        }
      } catch (cause) {
        if (active) {
          setOwner(null);
          setError(cause instanceof Error ? cause.message : 'Authentication failed.');
          setStatus('blocked');
        }
      }
    };

    void verifySession();
    return () => { active = false; };
  }, [user]);

  const handleSignIn = async () => {
    setBusy(true);
    setError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Google sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    setOwner(null);
    setError('');
    try {
      await signOut(auth);
      setStatus('signed-out');
    } catch {
      setError('Unable to sign out. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '32px 18px', background: 'var(--background, #f7f8fa)' }}>
      <section aria-labelledby="hq-title" style={{ width: '100%', maxWidth: 540, padding: 32, border: '1px solid var(--line, #e5e7eb)', borderRadius: 18, background: 'var(--surface, #fff)', boxShadow: '0 12px 36px rgba(16,24,40,.06)' }}>
        <p style={{ color: 'var(--accent, #163b7a)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', fontSize: 12 }}>Private workspace</p>
        <h1 id="hq-title" style={{ marginTop: 8 }}>Jawed Web Studio HQ</h1>
        <p style={{ color: 'var(--muted, #667085)' }}>Owner-only workspace for customer projects, delivery, quality and operations.</p>

        {status === 'loading' || status === 'checking' || busy ? <p role="status" aria-live="polite">Verifying your session…</p> : null}
        {error ? <p role="alert" style={{ color: '#b42318' }}>{error}</p> : null}

        {status === 'authorized' && owner ? (
          <div>
            <p role="status">Owner access verified for <strong>{owner.email}</strong>.</p>
            <p>The secure session is verified. Business modules will become available after the preview data workflows pass QA.</p>
            <button type="button" onClick={handleSignOut} disabled={busy}>Sign out</button>
          </div>
        ) : status === 'signed-out' ? (
          <button type="button" onClick={handleSignIn} disabled={busy}>Continue with Google</button>
        ) : status === 'blocked' ? (
          <div>
            <p>Signed in as {user?.email || 'Google account'}, but owner authorization has not been confirmed.</p>
            <button type="button" onClick={handleSignOut} disabled={busy}>Sign out</button>
          </div>
        ) : null}
      </section>
    </main>
  );
};
