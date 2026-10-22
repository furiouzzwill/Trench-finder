import type { Evaluation, Snapshot } from './scan/types';
import { readJson, writeJson } from './store';

export interface ScanResult {
  version: 1;
  time: number;
  looked: number;
  passed: number;
  shortlist: Evaluation[];
  /** Coins you marked as bought, evaluated every scan even if they'd fail the shortlist. */
  holdings: Evaluation[];
  dropped: { symbol: string; mint: string; reason: string }[];
  topFailReasons: { reason: string; count: number }[];
  sources: { jupiter: boolean; rugcheck: boolean; dexscreener: boolean };
  alerts: string[];
  durationMs: number;
}

export interface Holding {
  mint: string;
  symbol: string;
  name: string;
  addedAt: number;
  /** Price when you marked it, used for the "take your money out" alert. */
  entryUsd: number | null;
  takeOutAlerted?: boolean;
  lastFailAlert?: string;
}

/** Rolling history of a few numbers per coin, for multi-day trends. */
export type SnapshotStore = Record<string, Snapshot[]>;

const LATEST = 'state/latest.json';
const HOLDINGS = 'state/holdings.json';
const SNAPSHOTS = 'state/snapshots.json';

export const loadLatest = () => readJson<ScanResult>(LATEST);
export const loadHoldings = async () => (await readJson<Record<string, Holding>>(HOLDINGS)) ?? {};
export const loadSnapshots = async () => (await readJson<SnapshotStore>(SNAPSHOTS)) ?? {};

export async function saveScan(result: ScanResult) {
  const day = new Date(result.time).toISOString().slice(0, 10);
  await writeJson(`scans/${day}.json`, result);
  await writeJson(LATEST, result);
}

export const saveHoldings = (h: Record<string, Holding>) => writeJson(HOLDINGS, h);
export const saveSnapshots = (s: SnapshotStore) => writeJson(SNAPSHOTS, s);

/** The snapshot closest to `days` ago (but at least a day old). */
export function snapshotNear(store: SnapshotStore, mint: string, now: number, days: number): Snapshot | undefined {
  const list = (store[mint] ?? []).filter((s) => now - s.time >= 20 * 3_600_000);
  if (!list.length) return undefined;
  const target = now - days * 86_400_000;
  return list.reduce((best, s) => (Math.abs(s.time - target) < Math.abs(best.time - target) ? s : best));
}
