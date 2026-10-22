import type { DexInfo, JupToken, RugSummary } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Spaces out calls to stay under each service's free rate limit, and retries on 429. */
class Paced {
  private next = 0;
  constructor(private gapMs: number) {}

  async get<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const wait = this.next - Date.now();
      if (wait > 0) await sleep(wait);
      this.next = Date.now() + this.gapMs;
      try {
        const res = await fetch(url, { headers: { accept: 'application/json', ...headers }, signal: AbortSignal.timeout(15_000) });
        if (res.status === 429) {
          await sleep(3000 * (attempt + 1));
          continue;
        }
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return (await res.json()) as T;
      } catch (e) {
        if (attempt === 2) throw e;
        await sleep(1500);
      }
    }
    return null;
  }
}

// ---------------- Jupiter Tokens API v2 ----------------
// api.jup.ag needs a free key (JUPITER_API_KEY). Without one we use the keyless lite-api host.
// Keyless: 0.5 requests/second. With a free key: 1/second.

export class Jupiter {
  private http: Paced;
  private headers: Record<string, string> = {};
  private hosts: string[];

  constructor(apiKey: string) {
    this.http = new Paced(apiKey ? 1100 : 2100);
    if (apiKey) this.headers['x-api-key'] = apiKey;
    this.hosts = apiKey ? ['https://api.jup.ag', 'https://lite-api.jup.ag'] : ['https://lite-api.jup.ag', 'https://api.jup.ag'];
  }

  /** Tries each host in turn and sticks with the first one that answers. */
  private async fetch<T>(pathAndQuery: string): Promise<T | null> {
    let lastError: unknown;
    for (const host of [...this.hosts]) {
      try {
        const res = await this.http.get<T>(`${host}${pathAndQuery}`, this.headers);
        this.hosts = [host, ...this.hosts.filter((h) => h !== host)];
        return res;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError;
  }

  async category(category: 'toporganicscore' | 'toptraded' | 'toptrending', interval: '5m' | '1h' | '6h' | '24h'): Promise<JupToken[]> {
    const res = await this.fetch<JupToken[]>(`/tokens/v2/${category}/${interval}?limit=100`);
    return Array.isArray(res) ? res : [];
  }

  /** Look up specific mints (up to 100 per call). */
  async byMints(mints: string[]): Promise<JupToken[]> {
    const out: JupToken[] = [];
    for (let i = 0; i < mints.length; i += 100) {
      const q = mints.slice(i, i + 100).join(',');
      const res = await this.fetch<JupToken[]>(`/tokens/v2/search?query=${q}`);
      if (Array.isArray(res)) out.push(...res);
    }
    return out;
  }
}

// ---------------- RugCheck ----------------
// Public summary endpoint, no key. They ask for a few seconds between bursts.

export class RugCheck {
  private http = new Paced(1500);

  async summary(mint: string): Promise<RugSummary | null> {
    try {
      return await this.http.get<RugSummary>(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`);
    } catch {
      return null;
    }
  }
}

// ---------------- DexScreener ----------------
// Pairs: 300/min. Orders (paid profile / community takeover): 60/min.

interface DexPair {
  chainId: string;
  url?: string;
  pairCreatedAt?: number;
  baseToken?: { address: string };
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  info?: { websites?: { url: string }[]; socials?: { platform?: string; type?: string; handle?: string; url?: string }[] };
  boosts?: { active?: number };
}

export class DexScreener {
  private pairs = new Paced(250);
  private orders = new Paced(1100);

  /** Best (most liquid) Solana pair per token. */
  async info(mints: string[]): Promise<Map<string, DexInfo>> {
    const out = new Map<string, DexInfo>();
    for (let i = 0; i < mints.length; i += 30) {
      const chunk = mints.slice(i, i + 30);
      try {
        const res = await this.pairs.get<{ pairs?: DexPair[] }>(`https://api.dexscreener.com/latest/dex/tokens/${chunk.join(',')}`);
        const best = new Map<string, DexPair>();
        for (const p of res?.pairs ?? []) {
          const mint = p.baseToken?.address;
          if (p.chainId !== 'solana' || !mint || !chunk.includes(mint)) continue;
          const cur = best.get(mint);
          if (!cur || (p.liquidity?.usd ?? 0) > (cur.liquidity?.usd ?? 0)) best.set(mint, p);
        }
        for (const [mint, p] of best) {
          const socials = [
            ...(p.info?.websites ?? []).map(() => 'website'),
            ...(p.info?.socials ?? []).map((s) => s.platform ?? s.type ?? 'social'),
          ];
          out.set(mint, {
            pairCreatedAt: p.pairCreatedAt,
            volume24h: p.volume?.h24,
            boostsActive: p.boosts?.active ?? 0,
            socials: [...new Set(socials)],
            url: p.url,
          });
        }
      } catch {
        // DexScreener is extra info; the scan works without it.
      }
    }
    return out;
  }

  /** True if an approved community-takeover order exists for the token. */
  async communityTakeover(mint: string): Promise<boolean | undefined> {
    try {
      const res = await this.orders.get<{ type: string; status: string }[] | { orders?: { type: string; status: string }[] }>(
        `https://api.dexscreener.com/orders/v1/solana/${mint}`,
      );
      const list = Array.isArray(res) ? res : res?.orders ?? [];
      return list.some((o) => o.type === 'communityTakeover' && o.status === 'approved');
    } catch {
      return undefined;
    }
  }
}
