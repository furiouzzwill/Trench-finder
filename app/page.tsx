import { loadScanConfig } from '@/lib/scan/config';
import { usd } from '@/lib/scan/checks';
import type { Evaluation } from '@/lib/scan/types';
import { loadHoldings, loadLastError, loadLatest, type Holding } from '@/lib/state';
import { MIN_HOURS_BETWEEN_SCANS } from '@/lib/auth';
import { HoldButton, RunButton } from './components/Buttons';

export const dynamic = 'force-dynamic';

const isMint = (s: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
const pct = (v: number | null, d = 1) => (v === null ? '?' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`);

function Links({ mint }: { mint: string }) {
  if (!isMint(mint)) return null;
  const links: [string, string][] = [
    ['Chart', `https://dexscreener.com/solana/${mint}`],
    ['RugCheck', `https://rugcheck.xyz/tokens/${mint}`],
    ['Bubble map', `https://app.bubblemaps.io/sol/token/${mint}`],
    ['GMGN', `https://gmgn.ai/sol/token/${mint}`],
  ];
  return (
    <div className="links">
      {links.map(([label, href]) => (
        <a key={label} href={href} target="_blank" rel="noopener noreferrer">
          {label}
        </a>
      ))}
    </div>
  );
}

function Avatar({ e }: { e: Evaluation }) {
  return e.icon && /^https:\/\//.test(e.icon) ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="avatar" src={e.icon} alt="" loading="lazy" />
  ) : (
    <div className="avatar">{e.symbol.slice(0, 2)}</div>
  );
}

function Stats({ e }: { e: Evaluation }) {
  const s = e.stats;
  const trend =
    s.holderChangeSinceLast !== null && s.daysSinceLast !== null
      ? `${pct(s.holderChangeSinceLast, 0)} in ${Math.max(1, Math.round(s.daysSinceLast))}d`
      : `${pct(s.holderChange24h)} today`;
  return (
    <div className="stats">
      <div><label>Market cap</label>{usd(s.mcap)}</div>
      <div><label>Age</label>{s.ageDays === null ? '?' : `${Math.round(s.ageDays)}d`}</div>
      <div><label>Holders</label>{s.holders?.toLocaleString() ?? '?'}<small>{trend}</small></div>
      <div><label>Liquidity</label>{usd(s.liquidity)}</div>
      <div><label>Top holders</label>{s.topHoldersPct === null ? '?' : `${s.topHoldersPct.toFixed(0)}%`}</div>
      <div><label>Organic</label>{s.organicScore === null ? '?' : `${s.organicScore.toFixed(0)}/100`}</div>
    </div>
  );
}

function CoinCard({ e, i, held }: { e: Evaluation; i: number; held: boolean }) {
  return (
    <article className="coin">
      <div className="top">
        <span className="rank">{i + 1}</span>
        <Avatar e={e} />
        <div className="title"><b>${e.symbol}</b><span>{e.name}</span></div>
        <span className="score" title="0-100, higher = healthier on paper">{e.score}</span>
      </div>
      <Stats e={e} />
      {e.positives.length > 0 && <ul className="pos">{e.positives.map((p) => <li key={p}>{p}</li>)}</ul>}
      {e.watchOuts.length > 0 && <ul className="warn">{e.watchOuts.map((p) => <li key={p}>{p}</li>)}</ul>}
      <Links mint={e.mint} />
      <div className="row"><HoldButton mint={e.mint} held={held} /></div>
      <div className="mint">{e.mint}</div>
    </article>
  );
}

function HeldCard({ h, e, takeOut }: { h: Holding; e: Evaluation | undefined; takeOut: number }) {
  const price = e?.stats.usdPrice ?? null;
  const mult = h.entryUsd && price ? price / h.entryUsd : null;
  const fails = (e?.fails ?? []).filter((f) => !/not early anymore|already big/.test(f));
  return (
    <article className="coin">
      <div className="top">
        {e ? <Avatar e={e} /> : <div className="avatar">{h.symbol.slice(0, 2)}</div>}
        <div className="title"><b>${h.symbol}</b><span>{h.name || 'held since ' + new Date(h.addedAt).toLocaleDateString()}</span></div>
        {mult !== null && <span className="score">{mult.toFixed(2)}x</span>}
      </div>
      {!e ? (
        <ul className="bad"><li>No data in the last scan. It may have died; check the chart.</li></ul>
      ) : fails.length ? (
        <ul className="bad">{fails.slice(0, 3).map((f) => <li key={f}>{f}</li>)}</ul>
      ) : (
        <span className="pill ok" style={{ alignSelf: 'flex-start' }}>Still passing the checks</span>
      )}
      {mult !== null && mult >= takeOut && (
        <p className="note" style={{ color: 'var(--amber)' }}>Up {mult.toFixed(1)}x. Your plan: take your original money out.</p>
      )}
      {e && <Stats e={e} />}
      <Links mint={h.mint} />
      <div className="row"><HoldButton mint={h.mint} held /></div>
    </article>
  );
}

export default async function Page() {
  const cfg = loadScanConfig();
  const [latest, holdings, lastError] = await Promise.all([loadLatest(), loadHoldings(), loadLastError()]);
  const failedSince = lastError && (!latest || lastError.time > latest.time) ? lastError : null;
  const held = Object.values(holdings);
  const heldIds = new Set(held.map((h) => h.mint));
  const evalOf = new Map<string, Evaluation>();
  for (const e of [...(latest?.shortlist ?? []), ...(latest?.holdings ?? [])]) evalOf.set(e.mint, e);
  const hoursOld = latest ? (Date.now() - latest.time) / 3_600_000 : Infinity;
  const budget = cfg.yearlyBudgetUsd > 0 ? `$${cfg.yearlyBudgetUsd.toLocaleString()} for the year` : 'one fixed amount for the year';
  const down = latest ? Object.entries(latest.sources).filter(([, ok]) => !ok).map(([k]) => k) : [];

  return (
    <main>
      <header>
        <h1>Shortlist</h1>
        <p>
          {latest
            ? `Updated ${new Date(latest.time).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: process.env.TZ_DISPLAY || 'America/New_York' })} · scans once a day`
            : 'No scan yet'}
        </p>
      </header>

      <div className="plan">
        <b>Your plan:</b> {budget}, split across 3–5 coins, buy once, don&apos;t add on dips. If one does {cfg.takeOutMultiple}x, take your original money out.
        <span className="count">
          {held.length === 0 ? 'You haven’t marked any coins yet.' : `You hold ${held.length} of 3–5.`}
          {held.length >= 5 ? ' That’s the max the plan allows.' : ''}
        </span>
      </div>

      {failedSince && <p className="alert">The last scan failed: {failedSince.message}</p>}
      {down.length > 0 && <p className="alert">Couldn&apos;t reach {down.join(', ')} last scan. Results may be incomplete.</p>}

      {!latest && (
        <div className="box">
          <p>The scan runs automatically every morning. To get your first list now:</p>
          <RunButton label="Run first scan" />
        </div>
      )}
      {latest && hoursOld >= MIN_HOURS_BETWEEN_SCANS + 6 && (
        <div className="box">
          <p>The last scan is more than a day old (the daily run may have failed).</p>
          <RunButton label="Run today's scan" />
        </div>
      )}

      {held.length > 0 && (
        <section>
          <h2>Your coins</h2>
          <div className="grid">
            {held.map((h) => <HeldCard key={h.mint} h={h} e={evalOf.get(h.mint)} takeOut={cfg.takeOutMultiple} />)}
          </div>
        </section>
      )}

      {latest && (
        <section>
          <h2>Today&apos;s shortlist</h2>
          <div className="nums">
            <div><b>{latest.looked}</b>looked at</div>
            <div><b>{latest.passed}</b>passed every check</div>
            <div><b>{latest.shortlist.length}</b>shown</div>
          </div>
          {latest.shortlist.length ? (
            <div className="grid">
              {latest.shortlist.map((e, i) => <CoinCard key={e.mint} e={e} i={i} held={heldIds.has(e.mint)} />)}
            </div>
          ) : (
            <p className="empty">Nothing passed today. That happens; it means sit on your hands.</p>
          )}
          <p className="note">This list filters out junk. It doesn&apos;t predict winners, and most of these will still fade.</p>
        </section>
      )}

      <section>
        <h2>Before you buy, check yourself</h2>
        <div className="box">
          <ul>
            <li><b>Bubble map:</b> are the big holders secretly linked (same funding wallet, transfers between them)?</li>
            <li><b>Contract address</b> matches the one on the coin&apos;s real X account. Copycats are everywhere.</li>
            <li><b>X account:</b> real people posting and replying, or bought followers?</li>
            <li><b>Dev wallet</b> on GMGN: have they launched and dumped other coins?</li>
          </ul>
        </div>
      </section>

      {latest && latest.dropped.length > 0 && (
        <section>
          <h2>Dropped since yesterday</h2>
          <div className="box">
            <ul>{latest.dropped.map((d) => <li key={d.mint}><b>${d.symbol}</b>: {d.reason}</li>)}</ul>
          </div>
        </section>
      )}

      {latest && latest.topFailReasons.length > 0 && (
        <section>
          <h2>Why most coins got cut</h2>
          <div className="box">
            <ul>{latest.topFailReasons.map((r) => <li key={r.reason}>{r.reason}: <b>{r.count}</b></li>)}</ul>
          </div>
        </section>
      )}

      <footer>Read-only. Never buys or sells anything. Not financial advice.</footer>
    </main>
  );
}
