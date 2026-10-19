import { describe, it, expect, vi } from "vitest";
import {
  analyzeOrderBook,
  computeMicrostructureMetrics,
  verifyWebAuthnAssertion,
  verifyMultiSigOwnerAuthorization,
  PolygonWebSocketConnector,
  OandaStreamingConnector,
  HistoricalGapBackfiller,
  type OrderBookLevel,
  type WebAuthnAssertion,
  type MultiSigOwnerAuthorization,
  type StreamingCandleUpdate,
  type BaseMarketConnector,
} from "../market-engine/index.ts";

describe("ARCHIE Market Engine — Microstructure, WebAuthn & Advanced Ingestion", () => {
  describe("Order Book Microstructure Analysis", () => {
    it("computes accurate bid-ask spread and depth imbalance", () => {
      const bids: OrderBookLevel[] = [
        { price: 99.5, quantity: 10 },
        { price: 99.0, quantity: 20 },
        { price: 100.0, quantity: 5 }, // unsorted
      ];
      const asks: OrderBookLevel[] = [
        { price: 101.0, quantity: 15 },
        { price: 100.5, quantity: 5 }, // unsorted
      ];

      const snapshot = analyzeOrderBook("AAPL", bids, asks);

      // Best bid = 100.0, Best ask = 100.5 -> spread = 0.5
      expect(snapshot.bids[0].price).toBe(100.0);
      expect(snapshot.asks[0].price).toBe(100.5);
      expect(snapshot.spread).toBe(0.5);
      expect(snapshot.spreadBps).toBeGreaterThan(0);

      // Total bid vol = 35, Total ask vol = 20 -> imbalance = (35 - 20) / 55 = 0.273
      expect(snapshot.depthImbalance).toBeCloseTo(0.273, 2);
    });

    it("evaluates VPIN toxicity and microstructure quality accurately", () => {
      const snapshot = analyzeOrderBook(
        "EUR/USD",
        [{ price: 1.0850, quantity: 100 }],
        [{ price: 1.0851, quantity: 100 }],
      );

      const pristineMetrics = computeMicrostructureMetrics(snapshot, [
        { buyVolume: 50, sellVolume: 50 }, // balanced
      ]);
      expect(pristineMetrics.microstructureQuality).toBe("PRISTINE");
      expect(pristineMetrics.vpinToxicity).toBe(0);

      const toxicMetrics = computeMicrostructureMetrics(snapshot, [
        { buyVolume: 900, sellVolume: 100 }, // massive imbalance
      ]);
      expect(toxicMetrics.vpinToxicity).toBe(0.8);
      expect(toxicMetrics.microstructureQuality).toBe("ELEVATED_TOXICITY");

      const emptyBook = analyzeOrderBook("ILLIQUID_STOCK", [], []);
      const illiquidMetrics = computeMicrostructureMetrics(emptyBook);
      expect(illiquidMetrics.microstructureQuality).toBe("ILLIQUID");
    });
  });

  describe("Hardware WebAuthn / FIDO2 & Multi-Signature Governance", () => {
    // Helper to construct simulated authenticatorData with UP (bit 0) and UV (bit 2) flags set
    const makeAuthData = (userPresent = true, userVerified = true) => {
      const bytes = new Uint8Array(37);
      let flags = 0;
      if (userPresent) flags |= 0x01; // bit 0
      if (userVerified) flags |= 0x04; // bit 2
      bytes[32] = flags;
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    };

    it("validates hardware WebAuthn assertion flags and challenge", async () => {
      const challenge = "gate-l-promotion-action-hash";
      const clientData = {
        type: "webauthn.get",
        challenge,
        origin: "https://archie.frelux.internal",
      };
      const clientDataJson = btoa(JSON.stringify(clientData));

      const validAssertion: WebAuthnAssertion = {
        credentialId: "cred_yubikey_01",
        clientDataJson,
        authenticatorData: makeAuthData(true, true),
        signature: "PASSKEY_SIGNATURE_VALID",
      };

      const res = await verifyWebAuthnAssertion(validAssertion, challenge);
      expect(res.verified).toBe(true);
    });

    it("rejects WebAuthn assertion when hardware User Presence or User Verification is missing", async () => {
      const challenge = "test-challenge";
      const clientDataJson = btoa(JSON.stringify({ type: "webauthn.get", challenge }));

      // Missing UV (User Verification e.g. biometric or PIN)
      const noUVAssertion: WebAuthnAssertion = {
        credentialId: "cred_02",
        clientDataJson,
        authenticatorData: makeAuthData(true, false),
        signature: "PASSKEY_SIGNATURE_VALID",
      };
      const uvRes = await verifyWebAuthnAssertion(noUVAssertion, challenge);
      expect(uvRes.verified).toBe(false);
      expect(uvRes.reason).toContain("User Verification");

      // Missing UP (User Presence)
      const noUPAssertion: WebAuthnAssertion = {
        credentialId: "cred_03",
        clientDataJson,
        authenticatorData: makeAuthData(false, true),
        signature: "PASSKEY_SIGNATURE_VALID",
      };
      const upRes = await verifyWebAuthnAssertion(noUPAssertion, challenge);
      expect(upRes.verified).toBe(false);
      expect(upRes.reason).toContain("User Presence");
    });

    it("verifies dual-custody multi-signature Owner authorization", async () => {
      const actionPayload = "PROMOTE_MODEL_TO_PRODUCTION_v1.4";
      const now = Date.now();

      const makeSig = async (identity: string, nonce: string) => {
        const dataToHash = `${identity}:${now}:${nonce}:${actionPayload}`;
        const dataBuf = new TextEncoder().encode(dataToHash);
        const hashBuf = await crypto.subtle.digest("SHA-256", dataBuf);
        return Array.from(new Uint8Array(hashBuf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      };

      const sig1 = await makeSig("Owner", "nonce_ms_01");
      const sig2 = await makeSig("petertubin-droid", "nonce_ms_02");

      const multiSig: MultiSigOwnerAuthorization = {
        actionPayload,
        requiredSignatures: 2,
        signatures: [
          { ownerIdentity: "Owner", timestampMs: now, nonce: "nonce_ms_01", signatureSha256: sig1 },
          { ownerIdentity: "petertubin-droid", timestampMs: now, nonce: "nonce_ms_02", signatureSha256: sig2 },
        ],
      };

      const result = await verifyMultiSigOwnerAuthorization(multiSig);
      expect(result.authorized).toBe(true);
      expect(result.verifiedIdentities.length).toBe(2);
    });

    it("rejects multi-signature authorization when fewer than required signatures are valid", async () => {
      const actionPayload = "CRITICAL_ACTION_PAYLOAD";
      const multiSig: MultiSigOwnerAuthorization = {
        actionPayload,
        requiredSignatures: 2,
        signatures: [
          {
            ownerIdentity: "UNKNOWN_UNAUTHORIZED_IDENTITY",
            timestampMs: Date.now(),
            nonce: "bad_nonce",
            signatureSha256: "invalid_hash",
          },
        ],
      };

      const result = await verifyMultiSigOwnerAuthorization(multiSig);
      expect(result.authorized).toBe(false);
      expect(result.reason).toContain("Insufficient distinct Owner approvals");
    });
  });

  describe("Polygon & OANDA Stream Handlers and Historical Backfill", () => {
    it("PolygonWebSocketConnector parses minute aggregate bars correctly", () => {
      const updates: StreamingCandleUpdate[] = [];
      const connector = new PolygonWebSocketConnector((u) => updates.push(u), "TEST_KEY", true);

      // Feed aggregate message
      connector.handleMessage({
        ev: "AM",
        sym: "SPY",
        v: 12500,
        o: 510.5,
        c: 511.2,
        h: 511.8,
        l: 510.2,
        s: 1713000000000,
        e: 1713000059999,
      });

      expect(updates.length).toBe(1);
      expect(updates[0].symbol).toBe("SPY");
      expect(updates[0].category).toBe("INDICES");
      expect(updates[0].candle.close).toBe(511.2);
      expect(updates[0].candle.source).toBe("provider_live");
    });

    it("OandaStreamingConnector converts live pricing ticks to rolling candles", () => {
      const updates: StreamingCandleUpdate[] = [];
      const connector = new OandaStreamingConnector((u) => updates.push(u), "ACCT", "TOKEN", true);

      connector.handlePriceTick({
        type: "PRICE",
        instrument: "EUR_USD",
        time: 1713000010000,
        bids: [{ price: 1.0850 }],
        asks: [{ price: 1.0852 }],
      });

      expect(updates.length).toBe(1);
      expect(updates[0].symbol).toBe("EUR/USD");
      expect(updates[0].category).toBe("FOREX");
      expect(updates[0].candle.open).toBeCloseTo(1.0851, 4);
      expect(updates[0].candle.source).toBe("provider_live");
    });

    it("HistoricalGapBackfiller fetches and filters missing history across reconnect window", async () => {
      const baseMs = 1713000000000;
      const mockHistoricalCandles = [
        { openTimeMs: baseMs, closeTimeMs: baseMs + 59999, open: 10, high: 12, low: 9, close: 11, volume: 100, isFinalized: true, source: "provider_historical" as const },
        { openTimeMs: baseMs + 60000, closeTimeMs: baseMs + 119999, open: 11, high: 13, low: 10, close: 12, volume: 150, isFinalized: true, source: "provider_historical" as const },
        { openTimeMs: baseMs + 120000, closeTimeMs: baseMs + 179999, open: 12, high: 14, low: 11, close: 13, volume: 120, isFinalized: true, source: "provider_historical" as const },
      ];

      const mockConnector: BaseMarketConnector = {
        fetchHistoricalCandles: vi.fn().mockResolvedValue({
          symbol: "BTCUSDT",
          category: "CRYPTO",
          interval: "1m",
          candles: mockHistoricalCandles,
          source: "provider_historical",
          dataQualityFlags: [],
        }),
      } as any;

      const backfiller = new HistoricalGapBackfiller({
        crypto: mockConnector,
        forex: mockConnector,
        stocks: mockConnector,
        indices: mockConnector,
      });

      const res = await backfiller.backfillGap({
        symbol: "BTCUSDT",
        category: "CRYPTO",
        interval: "1m",
        lastKnownCandleTimeMs: baseMs + 30000, // half-way through bar 0
        reconnectTimeMs: baseMs + 240000, // 4 minutes later (> 1.5 * 60s)
      });

      expect(res.gapDetected).toBe(true);
      // Should filter out candle at baseMs (< lastKnownCandleTimeMs), keeping +60000 and +120000
      expect(res.backfilledCandlesCount).toBe(2);
      expect(res.backfilledCandles[0].openTimeMs).toBe(baseMs + 60000);
      expect(res.backfilledCandles[1].openTimeMs).toBe(baseMs + 120000);
    });
  });
});
