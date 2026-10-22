import fs from 'node:fs/promises';
import path from 'node:path';
import { loadScanConfig } from './scan/config';
import { evaluate, failCategory } from './scan/checks';
import { DexScreener, Jupiter, RugCheck } from './scan/sources';
import type { DexInfo, Evaluation, JupToken, RugSummary } from './scan/types';
import { computeAlerts } from './alerts';
import { appUrl, notify } from './notify';
import {
  loadHoldings,
  loadLatest,
  loadSnapshots,
  saveHoldings,
  saveScan,
  saveSnapshots,
  snapshotNear,
  type ScanResult,
} from './state';

interface Fixture {
  tokens: JupToken[];
  rug?: Record<string, RugSummary>;
  dex?: Record<string, DexInfo>;
}

/**
 * One full scan: pull candidates, run every check, rank, compare with last time,
 * ping your phone if something changed, save. Read-only toward the market: never trades.
 */
export async function runScan(): Promise<ScanResult> {
  const started = Date.now();
  const now = started;
  const cfg = loadScanConfig();
  const fixturePath = process.env.SCAN_FIXTURE?.trim();
  const fx: Fixture | null = fixturePath ? JSON.parse(await fs.readFile(path.resolve(fixturePath), 'utf8')) : null;

  const [prev, holdings, snaps] = await Promise.all([loadLatest(), loadHoldings(), loadSnapshots()]);
  const sources = { jupiter: true, rugcheck: true, dexscreener: true };
  const heldMints = Object.keys(holdings);

  // ---- candidates ----
  const byId = new Map<string, JupToken>();
  let lastError = '';
  if (fx) {
    for (const t of fx.tokens) byId.set(t.id, t);
  } else {
    const jup = new Jupiter(cfg.jupApiKey);
    const lists = [
      ['toporganicscore', '24h'],
      ['toptrending', '24h'],
      ['toptraded', '24h'],
      ['toporganicscore', '6h'],
      ['toptrending', '6h'],
    ] as const;
    let failed = 0;
    for (const [c, i] of lists) {
      try {
        for (const t of await jup.category(c, i)) byId.set(t.id, t);
      } catch (e) {
        failed++;
        lastError = (e as Error).message;
      }
    }
    if (failed === lists.length) sources.jupiter = false;
    const extra = [...new Set([...heldMints, ...(prev?.shortlist ?? []).map((e) => e.mint)])].filter((m) => !byId.has(m));
    if (extra.length) {
      try {
        for (const t of await jup.byMints(extra)) byId.set(t.id, t);
      } catch {
        // held coins just show "no data" this time
      }
    }
  }
  const tokens = [...byId.values()];
  if (!tokens.length) {
    const why = lastError ? ` (${lastError})` : '';
    throw new Error(`No data came back from Jupiter${why}. Their API may be down, or it may need a free JUPITER_API_KEY from portal.jup.ag.`);
  }

  const prevSnap = (mint: string) => snapshotNear(snaps, mint, now, cfg.trendDays);

  // ---- round 1: Jupiter data only ----
  const first = tokens.map((t) => ({ t, e: evaluate(t, cfg, { now, previous: prevSnap(t.id) }) }));
  const survivors = first.filter((x) => x.e.pass).sort((a, b) => b.e.score - a.e.score).slice(0, 30);
  const deepIds = [...new Set([...survivors.map((x) => x.t.id), ...heldMints.filter((m) => byId.has(m))])];

  // ---- round 2: RugCheck + DexScreener on survivors and your coins ----
  const rug = new Map<string, RugSummary | null>();
  let dex = new Map<string, DexInfo>();
  if (fx) {
    for (const id of deepIds) {
      rug.set(id, fx.rug?.[id] ?? null);
      if (fx.dex?.[id]) dex.set(id, fx.dex[id]);
    }
  } else {
    const rc = new RugCheck();
    let misses = 0;
    for (const id of deepIds) {
      const r = await rc.summary(id);
      if (!r) misses++;
      rug.set(id, r);
    }
    if (deepIds.length && misses === deepIds.length) sources.rugcheck = false;
    const ds = new DexScreener();
    dex = await ds.info(deepIds);
    if (deepIds.length && dex.size === 0) sources.dexscreener = false;
  }

  const full = (t: JupToken) => evaluate(t, cfg, { now, rug: rug.get(t.id), dex: dex.get(t.id), previous: prevSnap(t.id) });
  const finals = survivors.map(({ t }) => full(t));
  let shortlist = finals.filter((e) => e.pass).sort((a, b) => b.score - a.score).slice(0, cfg.shortlistSize);

  if (!fx && sources.dexscreener && shortlist.length) {
    const ds = new DexScreener();
    for (const e of shortlist) {
      if (await ds.communityTakeover(e.mint)) dex.set(e.mint, { socials: [], ...dex.get(e.mint), communityTakeover: true });
    }
    shortlist = shortlist.map((e) => full(byId.get(e.mint)!));
  }

  const heldEvals = new Map<string, Evaluation | null>();
  for (const m of heldMints) heldEvals.set(m, byId.has(m) ? full(byId.get(m)!) : null);

  // ---- what changed ----
  const shortIds = new Set(shortlist.map((e) => e.mint));
  const evalById = new Map<string, Evaluation>([...first.map((x) => [x.t.id, x.e] as const), ...finals.map((e) => [e.mint, e] as const)]);
  const dropped = (prev?.shortlist ?? [])
    .filter((e) => !shortIds.has(e.mint))
    .map((old) => {
      const e = evalById.get(old.mint);
      return { symbol: old.symbol, mint: old.mint, reason: !e ? 'no data today (may have died)' : e.fails[0] ?? 'ranked lower today' };
    });

  const counts = new Map<string, number>();
  for (const { e } of first) {
    if (!e.fails.length) continue;
    const k = failCategory(e.fails[0], cfg);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const topFailReasons = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([reason, count]) => ({ reason, count }));

  // ---- alerts ----
  const alerts = computeAlerts(prev, shortlist, heldEvals, holdings, cfg);
  const sentLog: string[] = [];
  const url = appUrl();
  for (const a of alerts) {
    const via = await notify(a.title, a.body, url);
    sentLog.push(`${a.title}${via.length ? ` (sent: ${via.join(', ')})` : ' (no alert channel set up)'}`);
  }

  // ---- save ----
  const today = new Date(now).toISOString().slice(0, 10);
  for (const t of tokens) {
    const list = (snaps[t.id] ?? []).filter((s) => s.date !== today);
    list.push({ date: today, time: now, holderCount: t.holderCount ?? null, mcap: t.mcap ?? null, liquidity: t.liquidity ?? null, usdPrice: t.usdPrice ?? null });
    snaps[t.id] = list.slice(-14);
  }
  // Forget coins we haven't seen in two weeks, unless you hold them.
  for (const [mint, list] of Object.entries(snaps)) {
    const last = list.at(-1);
    if (!holdings[mint] && (!last || now - last.time > 14 * 86_400_000)) delete snaps[mint];
  }

  const result: ScanResult = {
    version: 1,
    time: now,
    looked: tokens.length,
    passed: finals.filter((e) => e.pass).length,
    shortlist,
    holdings: [...heldEvals.values()].filter((e): e is Evaluation => e !== null),
    dropped,
    topFailReasons,
    sources,
    alerts: sentLog,
    durationMs: Date.now() - started,
  };
  // You might have tapped "I bought this" while the scan was running; keep that, carry over the alert flags.
  const latestHoldings = await loadHoldings();
  for (const [mint, h] of Object.entries(latestHoldings)) {
    if (holdings[mint]) {
      h.takeOutAlerted = holdings[mint].takeOutAlerted;
      h.lastFailAlert = holdings[mint].lastFailAlert;
    }
  }
  await Promise.all([saveScan(result), saveSnapshots(snaps), saveHoldings(latestHoldings)]);
  return result;
}
