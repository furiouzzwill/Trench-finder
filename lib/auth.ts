import { timingSafeEqual } from 'node:crypto';

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. */
export function isCron(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret) && same(req.headers.get('authorization') ?? '', `Bearer ${secret}`);
}

/** Buttons in the app send the passcode you set in APP_PASSCODE. */
export function hasPasscode(req: Request) {
  const code = process.env.APP_PASSCODE?.trim();
  return Boolean(code) && same(req.headers.get('x-passcode') ?? '', code!);
}

export const MIN_HOURS_BETWEEN_SCANS = 20;
