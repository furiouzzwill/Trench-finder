import { timingSafeEqual } from 'node:crypto';

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Without CRON_SECRET set, we accept
 * Vercel's cron user agent instead; the 20-hour limit keeps anyone else from spamming scans.
 */
export function isCron(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return (req.headers.get('user-agent') ?? '').startsWith('vercel-cron/');
  return same(req.headers.get('authorization') ?? '', `Bearer ${secret}`);
}

/** Buttons in the app send the passcode you set in APP_PASSCODE. No APP_PASSCODE = no passcode needed. */
export function hasPasscode(req: Request) {
  const code = process.env.APP_PASSCODE?.trim();
  if (!code) return true;
  return same(req.headers.get('x-passcode') ?? '', code);
}

export const MIN_HOURS_BETWEEN_SCANS = 20;
