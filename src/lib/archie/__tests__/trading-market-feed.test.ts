
import { describe, it, expect } from 'vitest';
import { checkFeedHealth, updateCandleWithTick, parseNormalizedCandle } from '../trading/market-feed';
import type { MarketInstrument, CandleData } from '../trading/types';

const mockInstrument: MarketInstrument = {
  symbol: 'EUR/USD',
  name: 'Euro',
  category: 'FOREX',
  bid: 1.08,
  ask: 1.0801,
  spread: 1.0,
  change24h: 0.1,
  high24h: 1.09,
  low24h: 1.07,
  volume24h: '0B',
  digits: 5,
  contractSize: 100000,
  pipSize: 0.0001,
  baseCurrency: 'EUR',
  quoteCurrency: 'USD',
};

describe('Market Feed & Stale Data Monitor', () => {
  it('detects fresh feeds within tolerance', () => {
    const now = 1000000;
    const health = checkFeedHealth(mockInstrument, now - 5000, now);
    expect(health.isFresh).toBe(true);
    expect(health.warning).toBeUndefined();
  });

  it('flags stale feeds exceeding threshold', () => {
    const now = 1000000;
    const health = checkFeedHealth(mockInstrument, now - 20000, now);
    expect(health.isFresh).toBe(false);
    expect(health.warning).toContain('stale');
  });

  it('updates ongoing candle with live tick correctly', () => {
    const candle: CandleData = {
      time: 1000,
      open: 1.08,
      high: 1.082,
      low: 1.079,
      close: 1.081,
      volume: 10,
    };
    const updated = updateCandleWithTick(candle, {
      symbol: 'EUR/USD',
      bid: 1.083,
      ask: 1.0831,
      last: 1.083,
      volume24h: 500,
      timestampMs: 1010,
    });
    expect(updated.high).toBe(1.083);
    expect(updated.close).toBe(1.083);
    expect(updated.volume).toBe(11);
  });
});
