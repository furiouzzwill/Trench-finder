import { storageKind } from '@/lib/store';
import { loadLastError, loadLatest } from '@/lib/state';

export const dynamic = 'force-dynamic';

/** What the app can see right now. Used by the "Run scan" button to know when a scan finished, and for troubleshooting. */
export async function GET() {
  const [latest, lastError] = await Promise.all([loadLatest(), loadLastError()]);
  return Response.json({
    storage: storageKind(),
    latestScan: latest ? { time: latest.time, looked: latest.looked, passed: latest.passed, shown: latest.shortlist.length, sources: latest.sources } : null,
    lastError,
  });
}
