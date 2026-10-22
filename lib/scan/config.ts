export interface ScanConfig {
  jupApiKey: string;
  minAgeDays: number;
  maxAgeDays: number;
  minMcapUsd: number;
  maxMcapUsd: number;
  minLiquidityUsd: number;
  minLiqToMcapPct: number;
  minHolders: number;
  maxTopHoldersPct: number;
  maxDevPct: number;
  minOrganicScore: number;
  maxRugRisk: number;
  maxVolumePerTraderUsd: number;
  maxHolderDropPct: number;
  shortlistSize: number;
  /** Holder trend is measured against a snapshot about this many days old. */
  trendDays: number;
  yearlyBudgetUsd: number;
  takeOutMultiple: number;
}

const env = (k: string) => process.env[k]?.trim() ?? '';
function num(k: string, d: number) {
  const v = env(k);
  if (v === '') return d;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${k} must be a number (got "${v}")`);
  return n;
}

export function loadScanConfig(overrides: Partial<ScanConfig> = {}): ScanConfig {
  return {
    jupApiKey: env('JUPITER_API_KEY'),
    minAgeDays: num('SCAN_MIN_AGE_DAYS', 7),
    maxAgeDays: num('SCAN_MAX_AGE_DAYS', 180),
    minMcapUsd: num('SCAN_MIN_MCAP_USD', 250_000),
    maxMcapUsd: num('SCAN_MAX_MCAP_USD', 25_000_000),
    minLiquidityUsd: num('SCAN_MIN_LIQUIDITY_USD', 40_000),
    minLiqToMcapPct: num('SCAN_MIN_LIQ_TO_MCAP_PCT', 5),
    minHolders: num('SCAN_MIN_HOLDERS', 1_000),
    maxTopHoldersPct: num('SCAN_MAX_TOP_HOLDERS_PCT', 30),
    maxDevPct: num('SCAN_MAX_DEV_PCT', 10),
    minOrganicScore: num('SCAN_MIN_ORGANIC_SCORE', 20),
    maxRugRisk: num('SCAN_MAX_RUG_RISK', 60),
    maxVolumePerTraderUsd: num('SCAN_MAX_VOLUME_PER_TRADER_USD', 15_000),
    maxHolderDropPct: num('SCAN_MAX_HOLDER_DROP_PCT', 25),
    shortlistSize: num('SCAN_SHORTLIST_SIZE', 15),
    trendDays: num('SCAN_TREND_DAYS', 7),
    yearlyBudgetUsd: num('MOONSHOT_BUDGET_USD', 0),
    takeOutMultiple: num('TAKE_OUT_MULTIPLE', 3),
    ...overrides,
  };
}
