import type { ScanConfig } from './scan/config';
import type { Evaluation } from './scan/types';
import type { Holding, ScanResult } from './state';

export interface Alert {
  title: string;
  body: string;
}

/**
 * Decides what's worth pinging your phone about. Quiet days produce nothing.
 * Mutates `holdings` to remember which alerts were already sent.
 */
export function computeAlerts(
  prev: ScanResult | null,
  shortlist: Evaluation[],
  heldEvals: Map<string, Evaluation | null>,
  holdings: Record<string, Holding>,
  cfg: ScanConfig,
): Alert[] {
  const alerts: Alert[] = [];

  if (!prev) {
    alerts.push({
      title: 'Your first shortlist is ready',
      body: shortlist.length ? `${shortlist.length} coins passed every check. Open the app to look.` : 'Nothing passed today. That happens.',
    });
  } else {
    const before = new Set(prev.shortlist.map((e) => e.mint));
    const fresh = shortlist.filter((e) => !before.has(e.mint));
    if (fresh.length) {
      alerts.push({
        title: `New on your shortlist: ${fresh.slice(0, 3).map((e) => '$' + e.symbol).join(', ')}${fresh.length > 3 ? ` +${fresh.length - 3}` : ''}`,
        body: fresh
          .slice(0, 5)
          .map((e) => `$${e.symbol} · score ${e.score}${e.positives[0] ? ` · ${e.positives[0]}` : ''}`)
          .join('\n'),
      });
    }
  }

  for (const h of Object.values(holdings)) {
    const e = heldEvals.get(h.mint);
    if (e === undefined) continue;
    if (e === null) {
      if (h.lastFailAlert !== 'no data') {
        alerts.push({ title: `$${h.symbol}: no data today`, body: 'It dropped off every source. It may have died. Check the chart.' });
        h.lastFailAlert = 'no data';
      }
      continue;
    }
    // Ignore "too old" / "already big": those are about finding new coins, not about coins you already hold.
    const real = e.fails.filter((f) => !/not early anymore|already big/.test(f));
    if (real.length) {
      if (h.lastFailAlert !== real[0]) {
        alerts.push({ title: `$${h.symbol} (you hold it) is failing checks`, body: real.slice(0, 3).join('\n') });
        h.lastFailAlert = real[0];
      }
    } else {
      h.lastFailAlert = undefined;
    }
    const price = e.stats.usdPrice;
    if (h.entryUsd && price && !h.takeOutAlerted) {
      const mult = price / h.entryUsd;
      if (mult >= cfg.takeOutMultiple) {
        alerts.push({
          title: `$${h.symbol} is up ${mult.toFixed(1)}x since you bought`,
          body: 'Your plan: take your original money out now and let the rest ride for free.',
        });
        h.takeOutAlerted = true;
      }
    }
  }
  return alerts;
}
