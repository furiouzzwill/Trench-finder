import { hasPasscode } from '@/lib/auth';
import { loadHoldings, loadLatest, saveHoldings } from '@/lib/state';

export const dynamic = 'force-dynamic';

const isMint = (s: unknown): s is string => typeof s === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);

/** Mark or unmark a coin as one you bought. Body: { mint, action: "add" | "remove" } */
export async function POST(req: Request) {
  if (!hasPasscode(req)) return Response.json({ error: 'Wrong passcode' }, { status: 401 });
  let body: { mint?: unknown; action?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Bad request' }, { status: 400 });
  }
  if (!isMint(body.mint) || (body.action !== 'add' && body.action !== 'remove')) {
    return Response.json({ error: 'Bad request' }, { status: 400 });
  }
  const holdings = await loadHoldings();
  if (body.action === 'remove') {
    delete holdings[body.mint];
  } else {
    const latest = await loadLatest();
    const e = [...(latest?.shortlist ?? []), ...(latest?.holdings ?? [])].find((x) => x.mint === body.mint);
    holdings[body.mint] = {
      mint: body.mint,
      symbol: e?.symbol ?? body.mint.slice(0, 6),
      name: e?.name ?? '',
      addedAt: Date.now(),
      entryUsd: e?.stats.usdPrice ?? null,
    };
  }
  await saveHoldings(holdings);
  return Response.json({ ok: true, count: Object.keys(holdings).length });
}
