// Unit tests for archie-crypto (crypto intelligence console).
// E2E-verified live 2026-09-15: market (live BTC data), portfolio_risk
// math (75% BTC → EXTREME_CONCENTRATION), honest validation.
import { describe, it, expect } from "vitest";
import "./index.ts";
import {
  getHandler,
  givenOwnerIsAdmin,
  givenRows,
  req,
  OWNER_AUTH,
  json,
} from "../_shared/testing/harness.ts";

const handler = getHandler();

describe("archie-crypto — validation honesty", () => {
  it("rejects unauthenticated callers with 401", async () => {
    const res = await handler(req("POST", "", { action: "market" }));
    expect(res.status).toBe(401);
  });

  it("rejects an unknown action with the honest action list", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      req("POST", "", { action: "mine_btc" }, OWNER_AUTH),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(
      /market, record_analysis, portfolio_risk/,
    );
  });

  it("requires holdings[] for portfolio_risk", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      req("POST", "", { action: "portfolio_risk" }, OWNER_AUTH),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/holdings\[\] required/);
  });

  it("requires registered assets for market — never invents prices", async () => {
    givenOwnerIsAdmin();
    // no frelux_archie_crypto_assets fixture → honest 400
    const res = await handler(
      req("POST", "", { action: "market", symbols: ["BTC"] }, OWNER_AUTH),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/No registered active assets/);
  });
});

describe("archie-crypto — portfolio_risk math", () => {
  it("computes concentration correctly and never claims custody", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      req(
        "POST",
        "",
        {
          action: "portfolio_risk",
          holdings: [
            { symbol: "BTC", value: 30000 },
            { symbol: "ETH", value: 9000 },
            { symbol: "SOL", value: 1000 },
          ],
        },
        OWNER_AUTH,
      ),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.classification).toBe("RISK_ASSESSMENT");
    expect(body.report.total_value).toBe(40000);
    expect(body.report.concentration).toBe("EXTREME_CONCENTRATION");
    expect(body.note).toMatch(/never hold|does not hold|research data/i);
  });

  it("marks a well-diversified portfolio correctly", async () => {
    givenOwnerIsAdmin();
    const res = await handler(
      req(
        "POST",
        "",
        {
          action: "portfolio_risk",
          holdings: Array.from({ length: 10 }, (_, i) => ({
            symbol: `A${i}`,
            value: 1000,
          })),
        },
        OWNER_AUTH,
      ),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.report.total_value).toBe(10000);
    expect(["WELL_DIVERSIFIED", "MODERATE"]).toContain(
      body.report.concentration,
    );
  });
});
