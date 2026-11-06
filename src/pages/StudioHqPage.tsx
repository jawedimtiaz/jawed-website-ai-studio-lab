import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

type HqIdentity = { uid: string; email: string };

export const StudioHqPage: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [identity, setIdentity] = useState<HqIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => onAuthStateChanged(auth, (currentUser) => {
    setUser(currentUser);
    setIdentity(null);
    setError('');
    setLoading(false);
  }), []);

  const authenticate = async (currentUser: User) => {
    const token = await currentUser.getIdToken();
    const response = await fetch('/api/hq/session', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      credentials: 'same-origin'
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok || !payload.identity) {
      throw new Error(payload.error === 'HQ_OWNER_ACCESS_DENIED'
        ? 'This Google account is not authorized to access Studio HQ.'
        : 'Studio HQ could not verify this session. Please sign in again.');
    }
    setIdentity(payload.identity);
  };

  useEffect(() => {
    if (!user) return;
    let active = true;
    setBusy(true);
    authenticate(user)
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Authentication failed.');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => { active = false; };
  }, [user]);

  const handleSignIn = async () => {
    setBusy(true);
    setError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    setIdentity(null);
    try {
      await signOut(auth);
    } catch {
      setError('Unable to sign out. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ minHeight: '75vh', display: 'grid', placeItems: 'center', padding: '32px 18px' }}>
      <section aria-labelledby="hq-title" style={{ width: '100%', maxWidth: 520, padding: 32, border: '1px solid var(--line)', borderRadius: 18, background: 'var(--surface, white)' }}>
        <p style={{ color: 'var(--accent)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', fontSize: 12 }}>Private workspace</p>
        <h1 id="hq-title" style={{ marginTop: 8 }}>Jawed Web Studio HQ</h1>
        <p style={{ color: 'var(--muted)' }}>Sign in with one of the two authorized owner Google accounts.</p>
        {loading || busy ? <p role="status">Verifying your session…</p> : null}
        {error ? <p role="alert" style={{ color: '#b42318' }}>{error}</p> : null}
        {identity ? (
          <div>
            <p role="status">Owner access verified for <strong>{identity.email}</strong>.</p>
            <p>The private workspace foundation is ready. Business modules will appear here as they are implemented.</p>
            <button type="button" onClick={handleSignOut}>Sign out</button>
          </div>
        ) : user ? (
          <div>
            <p>Signed in as {user.email || 'Google account'}, but owner authorization has not been confirmed.</p>
            <button type="button" onClick={handleSignOut} disabled={busy}>Sign out</button>
          </div>
        ) : (
          <button type="button" onClick={handleSignIn} disabled={busy}>Continue with Google</button>
        )}
      </section>
    </main>
  );
};
