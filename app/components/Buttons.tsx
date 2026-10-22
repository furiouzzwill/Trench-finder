'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const KEY = 'shortlist-passcode';

function savedPasscode(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // private mode etc.
  }
}

function askPasscode(): string | null {
  const code = window.prompt('Passcode (the APP_PASSCODE you set in Vercel):');
  if (code) {
    try {
      localStorage.setItem(KEY, code);
    } catch {
      // fine, we'll just ask again next time
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

async function call(path: string, body?: unknown): Promise<{ ok: boolean; error?: string; startedAt?: number }> {
  const send = (code: string | null) =>
    fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(code ? { 'x-passcode': code } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  // Try first without asking: if no APP_PASSCODE is set in Vercel, none is needed.
  try {
    let res = await send(savedPasscode());
    if (res.status === 401) {
      forgetPasscode();
      const code = askPasscode();
      if (!code) return { ok: false };
      res = await send(code);
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string; startedAt?: number };
    if (res.status === 401) forgetPasscode();
    return res.ok ? { ok: true, startedAt: data.startedAt } : { ok: false, error: data.error ?? `Error ${res.status}` };
  } catch {
    return { ok: false, error: 'Couldn’t reach the app. Check your connection and try again.' };
  }
}

interface Status {
  latestScan: { time: number } | null;
  lastError: { time: number; message: string } | null;
}

/** Checks every few seconds until the background scan saves a result or an error (gives up after 5 minutes). */
async function waitForScan(startedAt: number): Promise<{ ok: boolean; error?: string }> {
  const until = Date.now() + 5 * 60_000;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const s = (await (await fetch('/api/status', { cache: 'no-store' })).json()) as Status;
      if (s.latestScan && s.latestScan.time >= startedAt) return { ok: true };
      if (s.lastError && s.lastError.time >= startedAt) return { ok: false, error: `Scan failed: ${s.lastError.message}` };
    } catch {
      // phone lost connection for a moment; keep checking
    }
  }
  return { ok: false, error: 'The scan is taking longer than expected. Pull down to refresh in a few minutes.' };
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
          let r = await call('/api/run');
          if (r.ok && r.startedAt) r = await waitForScan(r.startedAt);
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
