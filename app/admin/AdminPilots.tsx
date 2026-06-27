'use client';

import { useEffect, useState, useTransition } from 'react';
import { UserPlus, Power, Cloud, CloudOff } from 'lucide-react';

type Pilot = {
  id: string;
  full_name: string | null;
  email: string | null;
  is_active: boolean;
  google_enabled: boolean;
  created_at: string;
  last_sign_in_at: string | null;
};

export function AdminPilots() {
  const [pilots, setPilots] = useState<Pilot[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [mode, setMode] = useState<'password' | 'invite'>('password');
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  async function load() {
    const r = await fetch('/api/admin/pilots');
    const data = await r.json();
    if (!r.ok) { setMsg({ kind: 'err', text: data.error ?? 'Error' }); return; }
    setPilots(data.pilots);
  }
  useEffect(() => { load(); }, []);

  function create(formData: FormData) {
    const email = (formData.get('email') as string ?? '').trim();
    const full_name = (formData.get('full_name') as string ?? '').trim();
    const office_email = (formData.get('office_email') as string ?? '').trim();
    if (!email || !full_name) return;
    setMsg(null);
    setCreated(null);
    startTransition(async () => {
      const r = await fetch('/api/admin/pilots', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, full_name, office_email, mode }),
      });
      const data = await r.json();
      if (!r.ok) { setMsg({ kind: 'err', text: data.error ?? 'Error' }); return; }
      if (data.mode === 'password' && data.password) {
        setCreated({ email: data.email, password: data.password });
        setMsg({ kind: 'ok', text: `Account für ${email} erstellt.` });
      } else {
        setMsg({ kind: 'ok', text: `Einladung an ${email} gesendet.` });
      }
      load();
    });
  }

  function toggleActive(p: Pilot) {
    if (!confirm(`${p.is_active ? 'Deactivate' : 'Reactivate'} pilot ${p.full_name ?? p.email}?`)) return;
    startTransition(async () => {
      const r = await fetch('/api/admin/pilots', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: p.id, is_active: !p.is_active }),
      });
      const data = await r.json();
      if (!r.ok) { setMsg({ kind: 'err', text: data.error ?? 'Error' }); return; }
      load();
    });
  }

  function toggleGoogle(p: Pilot) {
    startTransition(async () => {
      const r = await fetch('/api/admin/pilots', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: p.id, google_enabled: !p.google_enabled }),
      });
      const data = await r.json();
      if (!r.ok) { setMsg({ kind: 'err', text: data.error ?? 'Error' }); return; }
      load();
    });
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setMode('password')}
            className={mode === 'password' ? 'btn-primary' : 'btn-ghost border border-border'}
          >
            Direkt mit Passwort
          </button>
          <button
            type="button"
            onClick={() => setMode('invite')}
            className={mode === 'invite' ? 'btn-primary' : 'btn-ghost border border-border'}
          >
            Einladung per E-Mail
          </button>
        </div>

        <form action={create} className="grid grid-cols-1 md:grid-cols-2 gap-2 items-end">
          <label className="block">
            <span className="text-sm font-medium">Full name</span>
            <input name="full_name" required className="mt-1 w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Login email</span>
            <input name="email" type="email" required className="mt-1 w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white" />
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm font-medium">Office email <span className="text-text-muted font-normal">(optional, für Rechnungsversand)</span></span>
            <input name="office_email" type="email" className="mt-1 w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white" />
          </label>
          <button type="submit" disabled={pending} className="btn-primary md:col-span-2">
            <UserPlus className="w-4 h-4 mr-2" />
            {mode === 'password' ? 'Account erstellen' : 'Einladung senden'}
          </button>
        </form>

        <p className="text-xs text-text-muted">
          {mode === 'password'
            ? 'Erstellt den Account sofort. Das generierte Passwort wird einmalig angezeigt — gib es weiter, der Nutzer loggt sich direkt ein (keine Registrierung nötig).'
            : 'Schickt eine Einladungs-Mail; der Empfänger setzt sein eigenes Passwort über /register.'}
        </p>
      </div>

      {created && (
        <div className="card p-4 border-l-4 border-l-success space-y-1">
          <div className="font-display font-semibold text-sm">Zugangsdaten (einmalig anzeigt)</div>
          <div className="text-sm">E-Mail: <span className="font-mono">{created.email}</span></div>
          <div className="text-sm">Passwort: <span className="font-mono select-all">{created.password}</span></div>
          <p className="text-xs text-text-muted">Notiere/kopiere das Passwort jetzt — es wird nicht erneut angezeigt. Der Nutzer kann es nach dem Login ändern.</p>
        </div>
      )}

      {msg && <p className={msg.kind === 'ok' ? 'text-success text-sm' : 'text-danger text-sm'}>{msg.text}</p>}

      <div className="card p-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted text-xs uppercase">
              <th className="py-1">Name</th>
              <th>Email</th>
              <th>Google</th>
              <th>Status</th>
              <th>Last active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pilots === null ? (
              <tr><td colSpan={6} className="py-4 text-center text-text-muted">Loading…</td></tr>
            ) : pilots.length === 0 ? (
              <tr><td colSpan={6} className="py-4 text-center text-text-muted">No pilots yet.</td></tr>
            ) : pilots.map(p => (
              <tr key={p.id} className="border-t border-border">
                <td className="py-2">{p.full_name ?? '—'}</td>
                <td className="font-mono text-xs">{p.email ?? '—'}</td>
                <td>
                  <button
                    onClick={() => toggleGoogle(p)}
                    disabled={pending}
                    title={p.google_enabled ? 'Google aktiviert — klicken zum Deaktivieren' : 'Google deaktiviert — klicken zum Aktivieren'}
                    className={`inline-flex items-center gap-1 text-xs ${p.google_enabled ? 'text-success' : 'text-text-muted'}`}
                  >
                    {p.google_enabled ? <Cloud className="w-3.5 h-3.5" /> : <CloudOff className="w-3.5 h-3.5" />}
                    {p.google_enabled ? 'an' : 'aus'}
                  </button>
                </td>
                <td>
                  <span className={p.is_active ? 'text-success' : 'text-danger'}>
                    {p.is_active ? 'active' : 'deactivated'}
                  </span>
                </td>
                <td className="text-xs text-text-muted">
                  {p.last_sign_in_at ? new Date(p.last_sign_in_at).toLocaleString('en-GB') : 'never'}
                </td>
                <td className="text-right">
                  <button onClick={() => toggleActive(p)} className="btn-ghost border border-border inline-flex text-xs">
                    <Power className="w-3 h-3 mr-1" />
                    {p.is_active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
