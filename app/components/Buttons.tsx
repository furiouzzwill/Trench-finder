'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const KEY = 'shortlist-passcode';

function getPasscode(): string | null {
  let code: string | null = null;
  try {
    code = localStorage.getItem(KEY);
  } catch {
    // private mode etc.
  }
  if (!code) {
    code = window.prompt('Passcode (the APP_PASSCODE you set in Vercel):');
    if (code) {
      try {
        localStorage.setItem(KEY, code);
      } catch {
        // fine, we'll just ask again next time
      }
    }
  }
  return code;
}

function forgetPasscode() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

async function call(path: string, body?: unknown): Promise<{ ok: boolean; error?: string }> {
  const code = getPasscode();
  if (!code) return { ok: false };
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-passcode': code },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401) forgetPasscode();
  return res.ok ? { ok: true } : { ok: false, error: data.error ?? `Error ${res.status}` };
}

export function HoldButton({ mint, held }: { mint: string; held: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={`btn ${held ? 'held' : ''}`}
      disabled={busy}
      onClick={async () => {
        if (held && !window.confirm('Remove this from your coins?')) return;
        setBusy(true);
        const r = await call('/api/holdings', { mint, action: held ? 'remove' : 'add' });
        setBusy(false);
        if (!r.ok && r.error) window.alert(r.error);
        router.refresh();
      }}
    >
      {busy ? '…' : held ? '✓ You hold this' : 'I bought this'}
    </button>
  );
}

export function RunButton({ label }: { label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  return (
    <div>
      <button
        className="btn primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg('Scanning… this takes about a minute and a half. Keep this open.');
          const r = await call('/api/run');
          setBusy(false);
          setMsg(r.ok ? '' : r.error ?? '');
          router.refresh();
        }}
      >
        {busy ? 'Scanning…' : label}
      </button>
      {msg && <p className="note">{msg}</p>}
    </div>
  );
}
