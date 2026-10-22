import type { ScanConfig } from './config';
import type { DexInfo, Evaluation, JupToken, RugSummary, Snapshot } from './types';

const DAY = 86_400_000;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const n = (v: number | null | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const usd = (v: number | null) =>
  v === null ? '?' : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v.toFixed(0)}`;

export function ageDays(t: JupToken, dex: DexInfo | undefined, now: number): number | null {
  const iso = t.firstPool?.createdAt ?? t.createdAt;
  const ms = iso ? Date.parse(iso) : dex?.pairCreatedAt ?? NaN;
  return Number.isFinite(ms) ? (now - ms) / DAY : null;
}

/**
 * The checks traders run before buying (holder spread, dev bag, mint/freeze authority, liquidity vs. market cap,
 * fake volume, holders leaving, RugCheck flags), turned into hard fails, watch-outs and a 0-100 score.
 */
export function evaluate(
  t: JupToken,
  cfg: ScanConfig,
  ctx: { now: number; rug?: RugSummary | null; dex?: DexInfo; previous?: Snapshot },
): Evaluation {
  const { now, rug, dex, previous } = ctx;
  const fails: string[] = [];
  const watchOuts: string[] = [];
  const positives: string[] = [];

  const mcap = n(t.mcap);
  const liq = n(t.liquidity);
  const age = ageDays(t, dex, now);
  const holders = n(t.holderCount);
  const s24 = t.stats24h ?? {};
  const hc24 = n(s24.holderChange);
  const top = n(t.audit?.topHoldersPercentage);
  const dev = n(t.audit?.devBalancePercentage);
  const organic = n(t.organicScore);
  const rugRisk = n(rug?.score_normalised);
  const buyVol = n(s24.buyVolume) ?? 0;
  const sellVol = n(s24.sellVolume) ?? 0;
  const vol = buyVol + sellVol;
  const traders = n(s24.numTraders);

  let sinceLast: number | null = null;
  let daysSinceLast: number | null = null;
  if (previous?.holderCount && holders !== null) {
    sinceLast = ((holders - previous.holderCount) / previous.holderCount) * 100;
    daysSinceLast = (now - previous.time) / DAY;
  }

  // ---------- hard fails ----------
  if (t.tags?.some((x) => x === 'lst' || x === 'stocks')) fails.push('not a meme coin');
  if (t.audit?.isSus) fails.push('Jupiter flagged it as suspicious');
  if (t.audit?.mintAuthorityDisabled === false) fails.push('the dev can still mint more coins');
  if (t.audit?.freezeAuthorityDisabled === false) fails.push('the dev can freeze your coins');
  if (age === null) fails.push('unknown age');
  else if (age < cfg.minAgeDays) fails.push(`only ${age.toFixed(1)} days old`);
  else if (age > cfg.maxAgeDays) fails.push(`${Math.round(age)} days old, not early anymore`);
  if (mcap === null) fails.push('no market cap data');
  else if (mcap < cfg.minMcapUsd) fails.push(`market cap ${usd(mcap)} is too small`);
  else if (mcap > cfg.maxMcapUsd) fails.push(`market cap ${usd(mcap)} is already big`);
  if (liq === null || liq < cfg.minLiquidityUsd) fails.push(`liquidity ${usd(liq)} is too thin to sell into`);
  if (mcap && liq !== null && (liq / mcap) * 100 < cfg.minLiqToMcapPct) {
    fails.push(`liquidity is only ${((liq / mcap) * 100).toFixed(1)}% of market cap`);
  }
  if (holders === null || holders < cfg.minHolders) fails.push(`only ${holders ?? '?'} holders`);
  if (top !== null && top > cfg.maxTopHoldersPct) fails.push(`top holders own ${top.toFixed(0)}%`);
  if (dev !== null && dev > cfg.maxDevPct) fails.push(`the dev still holds ${dev.toFixed(1)}%`);
  if (organic !== null && organic < cfg.minOrganicScore) fails.push(`organic score ${organic.toFixed(0)}/100 (mostly bot trading)`);
  if (rugRisk !== null && rugRisk > cfg.maxRugRisk) fails.push(`RugCheck risk ${rugRisk.toFixed(0)}/100`);
  for (const r of rug?.risks ?? []) if (r.level === 'danger') fails.push(`RugCheck: ${r.name}`);
  if (mcap !== null && mcap < 5_000_000 && traders && vol / traders > cfg.maxVolumePerTraderUsd) {
    fails.push(`$${Math.round(vol / traders).toLocaleString()} traded per wallet today (looks like fake volume)`);
  }
  const spanDays = daysSinceLast === null ? 0 : Math.max(1, Math.round(daysSinceLast));
  const span = daysSinceLast === null ? '' : ` in ${spanDays} day${spanDays === 1 ? '' : 's'}`;
  if (sinceLast !== null && sinceLast < -cfg.maxHolderDropPct) fails.push(`lost ${Math.abs(sinceLast).toFixed(0)}% of holders${span}`);

  // ---------- watch-outs ----------
  if (hc24 !== null && hc24 < -2) watchOuts.push(`holders down ${Math.abs(hc24).toFixed(1)}% today`);
  if (rug === null || rug === undefined) watchOuts.push('RugCheck had no data; check it yourself');
  for (const r of rug?.risks ?? []) if (r.level === 'warn') watchOuts.push(`RugCheck: ${r.name}`);
  if ((dex?.boostsActive ?? 0) > 0) watchOuts.push('paying for DexScreener boosts right now (paid hype)');
  if (top !== null && top > 20 && top <= cfg.maxTopHoldersPct) watchOuts.push(`top holders own ${top.toFixed(0)}%, check the bubble map`);
  if (vol > 0 && sellVol / vol > 0.58) watchOuts.push('more selling than buying today');
  const pc = n(s24.priceChange);
  if (pc !== null && pc > 150) watchOuts.push(`up ${pc.toFixed(0)}% today; buying a spike is how people get dumped on`);

  // ---------- score ----------
  let score = 0;
  score += clamp01((organic ?? 0) / 100) * 30;
  const growth24 = clamp01(((hc24 ?? 0) + 2) / 7);
  if (sinceLast !== null) {
    score += growth24 * 15 + clamp01(sinceLast / 30) * 10;
  } else {
    score += growth24 * 25;
  }
  score += clamp01((35 - (top ?? 35)) / 25) * 15;
  if (mcap && liq) score += clamp01(((liq / mcap) * 100 - 5) / 15) * 10;
  if (vol > 0) score += clamp01((buyVol / vol - 0.45) / 0.15) * 10;
  const socials = new Set([...(dex?.socials ?? []), ...(t.twitter ? ['twitter'] : []), ...(t.website ? ['website'] : []), ...(t.telegram ? ['telegram'] : [])]);
  score += Math.min(socials.size, 2) * 2.5;
  score += rugRisk === null ? 2.5 : clamp01((60 - rugRisk) / 60) * 5;

  // ---------- positives ----------
  if (organic !== null && organic >= 70) positives.push(`organic score ${organic.toFixed(0)} (real people trading, not bots)`);
  if (hc24 !== null && hc24 >= 2) positives.push(`holders +${hc24.toFixed(1)}% today`);
  if (sinceLast !== null && sinceLast >= 10) positives.push(`holders +${sinceLast.toFixed(0)}%${span}`);
  if (top !== null && top <= 15) positives.push(`well spread out (top holders ${top.toFixed(0)}%)`);
  if (mcap && liq && (liq / mcap) * 100 >= 12) positives.push(`deep liquidity (${((liq / mcap) * 100).toFixed(0)}% of market cap)`);
  if (dex?.communityTakeover) positives.push('community took it over (CTO)');
  if (age !== null && age >= 30) positives.push(`survived ${Math.round(age)} days`);

  return {
    mint: t.id,
    name: t.name,
    symbol: t.symbol,
    icon: t.icon,
    pass: fails.length === 0,
    score: Math.round(score),
    fails,
    watchOuts,
    positives,
    stats: {
      mcap,
      liquidity: liq,
      ageDays: age,
      holders,
      holderChange24h: hc24,
      holderChangeSinceLast: sinceLast,
      daysSinceLast,
      topHoldersPct: top,
      devPct: dev,
      organicScore: organic,
      rugRisk,
      priceChange24h: pc,
      volume24h: vol || dex?.volume24h || null,
      usdPrice: n(t.usdPrice),
    },
  };
}

/** Groups fail messages into plain categories for the "why most coins got cut" summary. */
export function failCategory(fail: string, cfg: ScanConfig): string {
  const rules: [RegExp, string][] = [
    [/not early anymore/, `older than ${cfg.maxAgeDays} days`],
    [/days old/, `younger than ${cfg.minAgeDays} days (still in rug territory)`],
    [/too small/, 'market cap too small'],
    [/already big/, 'market cap already big'],
    [/liquidity/i, 'not enough liquidity to sell into'],
    [/holders own/, 'too much supply in a few wallets'],
    [/dev still holds/, 'dev still holds too much'],
    [/organic score/, 'mostly bot trading'],
    [/fake volume/, 'fake volume'],
    [/RugCheck/, 'RugCheck red flags'],
    [/mint more|freeze/, 'dev can mint more or freeze coins'],
    [/holders$/, `fewer than ${cfg.minHolders.toLocaleString()} holders`],
    [/lost .* holders/, 'holders leaving'],
    [/suspicious/, 'flagged suspicious by Jupiter'],
  ];
  return rules.find(([re]) => re.test(fail))?.[1] ?? fail;
}
