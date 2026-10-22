/** Sends a message to Discord and/or the ntfy phone app. Both optional; failures never break a scan. */
export async function notify(title: string, body: string, appUrl?: string): Promise<string[]> {
  const sent: string[] = [];
  const discord = process.env.DISCORD_WEBHOOK_URL?.trim();
  const topic = process.env.NTFY_TOPIC?.trim();

  if (discord) {
    try {
      const res = await fetch(discord, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `**${title}**\n${body}${appUrl ? `\n${appUrl}` : ''}`.slice(0, 1900) }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) sent.push('discord');
    } catch {
      // ignore
    }
  }

  if (topic) {
    try {
      const headers: Record<string, string> = { Title: asciiHeader(title), Tags: 'mag' };
      if (appUrl) headers.Click = appUrl;
      const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
        method: 'POST',
        headers,
        body: body.slice(0, 3000),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) sent.push('ntfy');
    } catch {
      // ignore
    }
  }
  return sent;
}

/** HTTP headers must be plain ASCII. */
const asciiHeader = (s: string) => s.replace(/[^\x20-\x7E]/g, '').trim() || 'Shortlist';

export function appUrl(): string | undefined {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit;
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return prod ? `https://${prod}` : undefined;
}
