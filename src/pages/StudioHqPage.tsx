import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

type HqIdentity = { uid: string; email: string };
type HqClient = {
  id: string;
  name: string;
  business_name: string | null;
  status: string;
  email: string | null;
  phone: string | null;
  archived_at: string | null;
};

export const StudioHqPage: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [identity, setIdentity] = useState<HqIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [clients, setClients] = useState<HqClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientBusiness, setClientBusiness] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientError, setClientError] = useState('');
  const [savingClient, setSavingClient] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (currentUser) => {
    setUser(currentUser);
    setIdentity(null);
    setClients([]);
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

  const loadClients = async () => {
    if (!user) return;
    setClientsLoading(true);
    setClientError('');
    try {
      const token = await user.getIdToken();
      const query = showArchived ? '?includeArchived=true' : '';
      const response = await fetch('/api/hq/clients' + query, {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to load clients.');
      setClients(payload.clients || []);
    } catch (err) {
      setClientError(err instanceof Error ? err.message : 'Unable to load CRM clients.');
    } finally {
      setClientsLoading(false);
    }
  };

  useEffect(() => {
    if (identity && user) void loadClients();
  }, [identity, user, showArchived]);

  const handleCreateClient = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    setSavingClient(true);
    setClientError('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/hq/clients', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: clientName, business_name: clientBusiness, email: clientEmail }),
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to create client.');
      setClientName('');
      setClientBusiness('');
      setClientEmail('');
      await loadClients();
    } catch (err) {
      setClientError(err instanceof Error ? err.message : 'Unable to create client.');
    } finally {
      setSavingClient(false);
    }
  };

  const setClientArchived = async (client: HqClient, restore: boolean) => {
    if (!user) return;
    setClientError('');
    try {
      const token = await user.getIdToken();
      const action = restore ? 'restore' : 'archive';
      const response = await fetch(`/api/hq/clients/${encodeURIComponent(client.id)}/${action}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to update client.');
      await loadClients();
    } catch (err) {
      setClientError(err instanceof Error ? err.message : 'Unable to update client.');
    }
  };

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
    setClients([]);
    try {
      await signOut(auth);
    } catch {
      setError('Unable to sign out. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ minHeight: '100vh', padding: '32px 18px', background: 'var(--background, #f7f8fa)' }}>
      <div style={{ width: '100%', maxWidth: 1080, margin: '0 auto' }}>
        <section aria-labelledby="hq-title" style={{ padding: 28, border: '1px solid var(--line)', borderRadius: 18, background: 'var(--surface, white)', marginBottom: 24 }}>
          <p style={{ color: 'var(--accent)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', fontSize: 12 }}>Private workspace</p>
          <h1 id="hq-title" style={{ marginTop: 8 }}>Jawed Web Studio HQ</h1>
          <p style={{ color: 'var(--muted)' }}>Business operations workspace for Jawed Web Studio.</p>
          {loading || busy ? <p role="status">Verifying your session…</p> : null}
          {error ? <p role="alert" style={{ color: '#b42318' }}>{error}</p> : null}
          {identity ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <p role="status">Owner access verified for <strong>{identity.email}</strong>.</p>
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

        {identity ? (
          <section aria-labelledby="crm-title" style={{ padding: 28, border: '1px solid var(--line)', borderRadius: 18, background: 'var(--surface, white)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h2 id="crm-title">CRM — Clients</h2>
                <p style={{ color: 'var(--muted)' }}>Add, review, archive and restore client records.</p>
              </div>
              <button type="button" onClick={() => setShowArchived(value => !value)}>
                {showArchived ? 'Show active clients' : 'Show archived clients'}
              </button>
            </div>

            <form onSubmit={handleCreateClient} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, margin: '20px 0', padding: 18, background: 'var(--surface-muted, #f7f8fa)', borderRadius: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Client name *</span>
                <input value={clientName} onChange={event => setClientName(event.target.value)} required maxLength={120} placeholder="Client or contact name" />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Business name</span>
                <input value={clientBusiness} onChange={event => setClientBusiness(event.target.value)} maxLength={160} placeholder="Business name" />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Email</span>
                <input type="email" value={clientEmail} onChange={event => setClientEmail(event.target.value)} maxLength={254} placeholder="client@example.com" />
              </label>
              <div style={{ display: 'flex', alignItems: 'end' }}>
                <button type="submit" disabled={savingClient || !clientName.trim()}>{savingClient ? 'Saving…' : 'Add client'}</button>
              </div>
            </form>

            {clientError ? <p role="alert" style={{ color: '#b42318' }}>{clientError}</p> : null}
            {clientsLoading ? <p role="status">Loading clients…</p> : null}
            {!clientsLoading && clients.length === 0 ? <p>No {showArchived ? 'archived' : 'active'} clients yet.</p> : null}
            <div style={{ display: 'grid', gap: 10 }}>
              {clients.map(client => (
                <article key={client.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', padding: 16, border: '1px solid var(--line)', borderRadius: 12 }}>
                  <div>
                    <strong>{client.name}</strong>
                    {client.business_name ? <span> · {client.business_name}</span> : null}
                    <p style={{ color: 'var(--muted)', margin: '4px 0 0' }}>{client.email || 'No email'} · {client.status}</p>
                  </div>
                  {client.archived_at
                    ? <button type="button" onClick={() => void setClientArchived(client, true)}>Restore</button>
                    : <button type="button" onClick={() => void setClientArchived(client, false)}>Archive</button>}
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
};
