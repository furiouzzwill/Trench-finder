import { after } from 'next/server';
import { hasPasscode, MIN_HOURS_BETWEEN_SCANS } from '@/lib/auth';
import { runScanLogged } from '@/lib/runScan';
import { loadLatest } from '@/lib/state';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * "Run scan" button in the app. Only works if the last scan is 20+ hours old: the plan is daily, not constant.
 * Answers right away and scans in the background, so a phone dropping a 90-second request can't lose it.
 * The page polls /api/status to see when it's done.
 */
export async function POST(req: Request) {
  if (!hasPasscode(req)) return Response.json({ error: 'Wrong passcode' }, { status: 401 });
  const latest = await loadLatest();
  if (latest) {
    const hours = (Date.now() - latest.time) / 3_600_000;
    if (hours < MIN_HOURS_BETWEEN_SCANS) {
      return Response.json({ error: `Last scan was ${Math.floor(hours)}h ago. The next one runs automatically tomorrow morning.` }, { status: 429 });
    }
  }
  const startedAt = Date.now();
  after(async () => {
    await runScanLogged().catch(() => {
      // already saved for the page by runScanLogged
    });
  });
  return Response.json({ ok: true, startedAt });
}
