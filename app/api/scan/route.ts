import { isCron, MIN_HOURS_BETWEEN_SCANS } from '@/lib/auth';
import { runScan } from '@/lib/runScan';
import { loadLatest } from '@/lib/state';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** Called once a day by Vercel Cron (see vercel.json). */
export async function GET(req: Request) {
  if (!isCron(req)) return new Response('Unauthorized', { status: 401 });
  const force = new URL(req.url).searchParams.get('force') === '1';
  const latest = await loadLatest();
  if (!force && latest && Date.now() - latest.time < MIN_HOURS_BETWEEN_SCANS * 3_600_000) {
    return Response.json({ skipped: true, reason: 'already scanned in the last 20 hours' });
  }
  try {
    const r = await runScan();
    return Response.json({ ok: true, shortlist: r.shortlist.length, looked: r.looked, alerts: r.alerts, ms: r.durationMs });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
