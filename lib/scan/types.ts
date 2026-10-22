/** Subset of Jupiter Tokens API v2 `MintInformation` (developers.jup.ag openapi-spec/tokens/v2). */
export interface JupStats {
  priceChange?: number | null;
  holderChange?: number | null;
  liquidityChange?: number | null;
  volumeChange?: number | null;
  buyVolume?: number | null;
  sellVolume?: number | null;
  buyOrganicVolume?: number | null;
  sellOrganicVolume?: number | null;
  numBuys?: number | null;
  numSells?: number | null;
  numTraders?: number | null;
  numOrganicBuyers?: number | null;
  numNetBuyers?: number | null;
}

export interface JupToken {
  id: string;
  name: string;
  symbol: string;
  icon?: string | null;
  createdAt?: string;
  twitter?: string | null;
  telegram?: string | null;
  website?: string | null;
  discord?: string | null;
  dev?: string | null;
  launchpad?: string | null;
  graduatedAt?: string | null;
  holderCount?: number | null;
  fdv?: number | null;
  mcap?: number | null;
  usdPrice?: number | null;
  liquidity?: number | null;
  stats1h?: JupStats | null;
  stats6h?: JupStats | null;
  stats24h?: JupStats | null;
  firstPool?: { id: string; createdAt: string } | null;
  audit?: {
    isSus?: boolean | null;
    mintAuthorityDisabled?: boolean | null;
    freezeAuthorityDisabled?: boolean | null;
    topHoldersPercentage?: number | null;
    devBalancePercentage?: number | null;
    devMints?: number | null;
  } | null;
  organicScore?: number;
  organicScoreLabel?: 'high' | 'medium' | 'low';
  isVerified?: boolean | null;
  tags?: string[] | null;
}

/** RugCheck /v1/tokens/{mint}/report/summary */
export interface RugSummary {
  score_normalised?: number;
  lpLockedPct?: number;
  risks?: { name: string; level: string; description?: string; value?: string; score?: number }[];
}

/** Bits we use from DexScreener. */
export interface DexInfo {
  pairCreatedAt?: number;
  volume24h?: number;
  boostsActive?: number;
  socials: string[];
  communityTakeover?: boolean;
  url?: string;
}

/** One saved data point per coin per scan, used for week-over-week trends. */
export interface Snapshot {
  date: string;
  time: number;
  holderCount: number | null;
  mcap: number | null;
  liquidity: number | null;
  usdPrice: number | null;
}

export interface Evaluation {
  mint: string;
  name: string;
  symbol: string;
  icon?: string | null;
  pass: boolean;
  score: number;
  /** Hard fails: any one of these keeps the coin off the list. */
  fails: string[];
  /** Fine to list, but you should look at these. */
  watchOuts: string[];
  /** Why it scored well. */
  positives: string[];
  stats: {
    mcap: number | null;
    liquidity: number | null;
    ageDays: number | null;
    holders: number | null;
    holderChange24h: number | null;
    holderChangeSinceLast: number | null;
    daysSinceLast: number | null;
    topHoldersPct: number | null;
    devPct: number | null;
    organicScore: number | null;
    rugRisk: number | null;
    priceChange24h: number | null;
    volume24h: number | null;
    usdPrice: number | null;
  };
}
