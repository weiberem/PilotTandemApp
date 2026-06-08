'use client';

import { useEffect, useState, useTransition } from 'react';
import { UserPlus, Power } from 'lucide-react';

type Pilot = {
  id: string;
  full_name: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  last_sign_in_at: string | null;
};

export function AdminPilots() {
  const [pilots, setPilots] = useState<Pilot[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function load() {
    const r = await fetch('/api/admin/pilots');
    const data = await r.json();
    if (!r.ok) { setMsg({ kind: 'err', text: data.error ?? 'Error' }); return; }
    setPilots(data.pilots);
  }
  useEffect(() => { load(); }, []);

  function invite(formData: FormData) {
    const email = (formData.get('email') as string ?? '').trim();
    const full_name = (formData.get('full_name') as string ?? '').trim();
    if (!email || !full_name) return;
    setMsg(null);
    startTransition(async () => {
      const r = await fetch('/api/admin/pilots', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, full_name }),
      });
      const data = await r.json();
      if (!r.ok) { setMsg({ kind: 'err', text: data.error ?? 'Error' }); return; }
      setMsg({ kind: 'ok', text: `Invitation sent to ${email}.` });
      load();
    });
  }

  function toggle(p: Pilot) {
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

  return (
    <div className="space-y-4">
      <form
        action={invite}
        className="card p-4 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-end"
      >
        <label className="block">
          <span className="text-sm font-medium">Full name</span>
          <input name="full_name" required className="mt-1 w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input name="email" type="email" required className="mt-1 w-full min-h-tap rounded-lg border border-border px-3 py-2 bg-white" />
        </label>
        <button type="submit" disabled={pending} className="btn-primary">
          <UserPlus className="w-4 h-4 mr-2" /> Invite
        </button>
      </form>

      {msg && <p className={msg.kind === 'ok' ? 'text-success text-sm' : 'text-danger text-sm'}>{msg.text}</p>}

      <div className="card p-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted text-xs uppercase">
              <th className="py-1">Name</th>
              <th>Email</th>
              <th>Status</th>
              <th>Last active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pilots === null ? (
              <tr><td colSpan={5} className="py-4 text-center text-text-muted">Loading…</td></tr>
            ) : pilots.length === 0 ? (
              <tr><td colSpan={5} className="py-4 text-center text-text-muted">No pilots yet.</td></tr>
            ) : pilots.map(p => (
              <tr key={p.id} className="border-t border-border">
                <td className="py-2">{p.full_name ?? '—'}</td>
                <td className="font-mono text-xs">{p.email ?? '—'}</td>
                <td>
                  <span className={p.is_active ? 'text-success' : 'text-danger'}>
                    {p.is_active ? 'active' : 'deactivated'}
                  </span>
                </td>
                <td className="text-xs text-text-muted">
                  {p.last_sign_in_at ? new Date(p.last_sign_in_at).toLocaleString('en-GB') : 'never'}
                </td>
                <td className="text-right">
                  <button onClick={() => toggle(p)} className="btn-ghost border border-border inline-flex text-xs">
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
