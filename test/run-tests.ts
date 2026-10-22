import assert from 'node:assert/strict';
import { loadScanConfig } from '../lib/scan/config';
import { evaluate, failCategory } from '../lib/scan/checks';
import { computeAlerts } from '../lib/alerts';
import { snapshotNear, type Holding, type ScanResult } from '../lib/state';
import type { Evaluation, JupToken } from '../lib/scan/types';

const cfg = loadScanConfig();
const NOW = Date.parse('2026-10-22T13:00:00Z');
const DAY = 86_400_000;
const daysAgo = (d: number) => new Date(NOW - d * DAY).toISOString();

let passed = 0;
const test = (name: string, fn: () => void) => {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.log(`  ✗ ${name}\n    ${(e as Error).message}`);
    process.exitCode = 1;
  }
};

const tok = (over: Partial<JupToken> = {}): JupToken => ({
  id: 'GoodMint1111111111111111111111111111111111',
  name: 'Good Coin',
  symbol: 'GOOD',
  holderCount: 8000,
  mcap: 2_000_000,
  usdPrice: 0.002,
  liquidity: 300_000,
  firstPool: { id: 'pool', createdAt: daysAgo(40) },
  audit: { mintAuthorityDisabled: true, freezeAuthorityDisabled: true, topHoldersPercentage: 14, devBalancePercentage: 1 },
  organicScore: 82,
  stats24h: { holderChange: 3.5, buyVolume: 300_000, sellVolume: 200_000, numTraders: 1500, priceChange: 12 },
  ...over,
});
const ev = (over: Partial<JupToken> = {}) => evaluate(tok(over), cfg, { now: NOW, rug: { score_normalised: 10, risks: [] } });

console.log('\nChecks');

test('healthy coin passes; risky ones fail', () => {
  assert.equal(ev().pass, true);
  assert.equal(ev({ audit: { ...tok().audit, mintAuthorityDisabled: false } }).pass, false);
  assert.equal(ev({ firstPool: { id: 'p', createdAt: daysAgo(2) } }).pass, false);
  assert.equal(ev({ audit: { ...tok().audit, topHoldersPercentage: 50 } }).pass, false);
  assert.equal(ev({ stats24h: { buyVolume: 3e6, sellVolume: 3e6, numTraders: 100 } }).pass, false);
});

test('holder trend uses a snapshot about a week old', () => {
  const store = {
    [tok().id]: [
      { date: 'a', time: NOW - 9 * DAY, holderCount: 1000, mcap: null, liquidity: null, usdPrice: null },
      { date: 'b', time: NOW - 7 * DAY, holderCount: 6000, mcap: null, liquidity: null, usdPrice: null },
      { date: 'c', time: NOW - 1 * DAY, holderCount: 7900, mcap: null, liquidity: null, usdPrice: null },
      { date: 'd', time: NOW - 2 * 3_600_000, holderCount: 7999, mcap: null, liquidity: null, usdPrice: null },
    ],
  };
  const s = snapshotNear(store, tok().id, NOW, 7)!;
  assert.equal(s.date, 'b');
  const e = evaluate(tok(), cfg, { now: NOW, previous: s });
  assert.ok(e.positives.some((p) => p === 'holders +33% in 7 days'), e.positives.join(' | '));
  assert.equal(snapshotNear(store, 'unknown', NOW, 7), undefined);
});

test('fail reasons group into plain categories', () => {
  assert.equal(failCategory('only 2.0 days old', cfg), 'younger than 7 days (still in rug territory)');
});

console.log('\nAlerts');

const result = (shortlist: Evaluation[]): ScanResult => ({
  version: 1, time: NOW - DAY, looked: 1, passed: 1, shortlist, holdings: [], dropped: [], topFailReasons: [],
  sources: { jupiter: true, rugcheck: true, dexscreener: true }, alerts: [], durationMs: 1,
});
const holding = (over: Partial<Holding> = {}): Holding => ({ mint: tok().id, symbol: 'GOOD', name: 'Good', addedAt: NOW - 10 * DAY, entryUsd: 0.002, ...over });

test('first scan announces itself', () => {
  const a = computeAlerts(null, [ev()], new Map(), {}, cfg);
  assert.equal(a.length, 1);
  assert.match(a[0].title, /first shortlist/);
});

test('quiet day = no alerts', () => {
  assert.equal(computeAlerts(result([ev()]), [ev()], new Map(), {}, cfg).length, 0);
});

test('new coin on the list = one alert naming it', () => {
  const other = ev({ id: 'OtherMint111111111111111111111111111111111', symbol: 'NEW' });
  const a = computeAlerts(result([ev()]), [ev(), other], new Map(), {}, cfg);
  assert.equal(a.length, 1);
  assert.match(a[0].title, /\$NEW/);
});

test('a coin you hold starts failing → alert once, not every day', () => {
  const h = { [tok().id]: holding() };
  const failing = ev({ audit: { ...tok().audit, topHoldersPercentage: 55 } });
  const m = new Map([[tok().id, failing]]);
  const first = computeAlerts(result([]), [], m, h, cfg);
  assert.equal(first.length, 1);
  assert.match(first[0].title, /you hold it/);
  assert.equal(computeAlerts(result([]), [], m, h, cfg).length, 0, 'should not repeat');
});

test('"too old"/"already big" is not a problem for a coin you already hold', () => {
  const big = ev({ mcap: 80_000_000, liquidity: 9_000_000 });
  assert.equal(computeAlerts(result([]), [], new Map([[tok().id, big]]), { [tok().id]: holding() }, cfg).length, 0);
});

test('3x since you bought → take-your-money-out alert, once', () => {
  const h = { [tok().id]: holding({ entryUsd: 0.0006 }) };
  const m = new Map([[tok().id, ev()]]);
  const a = computeAlerts(result([]), [], m, h, cfg);
  assert.equal(a.length, 1);
  assert.match(a[0].title, /3\.3x/);
  assert.equal(computeAlerts(result([]), [], m, h, cfg).length, 0);
});

test('held coin vanished from every source → alert once', () => {
  const h = { [tok().id]: holding() };
  const m = new Map<string, Evaluation | null>([[tok().id, null]]);
  assert.equal(computeAlerts(result([]), [], m, h, cfg).length, 1);
  assert.equal(computeAlerts(result([]), [], m, h, cfg).length, 0);
});

console.log(process.exitCode ? '\nSome tests failed.' : `\nAll ${passed} tests passed.`);
