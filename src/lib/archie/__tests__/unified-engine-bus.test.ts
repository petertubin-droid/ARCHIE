import { describe, expect, it, vi } from "vitest";
import { archieEngineBus, type EventType } from "../unified-engine-bus";

describe("ARCHIE Unified Engine Bus", () => {
  it("initializes all 15 core and specialized engines in online state", () => {
    const engines = archieEngineBus.getAllEngines();
    expect(engines.length).toBe(15);
    const ids = engines.map((e) => e.id);
    expect(ids).toContain("cognitive");
    expect(ids).toContain("trading");
    expect(ids).toContain("markets");
    expect(ids).toContain("security");
    expect(ids).toContain("offensive");
    expect(ids).toContain("execution");
    expect(ids).toContain("code_intel");
    expect(ids).toContain("voice_ears");
    expect(ids).toContain("voice_mouth");
    expect(ids).toContain("learning");
    expect(ids).toContain("evolution");
    expect(ids).toContain("terminology");
    expect(ids).toContain("wallet_recovery");
    expect(ids).toContain("exchange_access");
    expect(ids).toContain("infrastructure_ops");

    const health = archieEngineBus.getFederationHealth();
    expect(health.totalEngines).toBe(15);
    expect(health.onlineEngines).toBe(15);
    expect(health.overallHealth).toBe(100);
  });

  it("publishes events and delivers them to registered subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = archieEngineBus.subscribe("MARKET_TICK", listener);

    archieEngineBus.publish("MARKET_TICK", "markets", {
      symbol: "BTC/USD",
      price: 81850.5,
      bid: 81849.0,
      ask: 81852.0,
      change24h: 1.45,
      volume: "35.2B",
      source: "binance",
    });

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0];
    expect(event.type).toBe("MARKET_TICK");
    expect(event.sourceEngine).toBe("markets");
    expect(event.payload.symbol).toBe("BTC/USD");

    unsubscribe();
    archieEngineBus.publish("MARKET_TICK", "markets", {
      symbol: "ETH/USD",
      price: 2400.0,
      bid: 2399.5,
      ask: 2400.5,
      change24h: 0.8,
      volume: "12B",
      source: "binance",
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("dispatches cross-engine coordinated workflows across multiple engines", () => {
    const result = archieEngineBus.dispatchCrossEngineTask({
      description: "Coordinated risk audit and live trade execution",
      requiredEngines: ["cognitive", "trading", "security"],
      input: { symbol: "SOL/USD", action: "BUY", lotSize: 0.5 },
    });

    expect(result.status).toBe("dispatched");
    expect(result.coordinatedEngines).toEqual(["cognitive", "trading", "security"]);
    expect(result.taskId).toMatch(/^task_/);

    const history = archieEngineBus.getHistory();
    const dispatched = history.find((h) => h.type === "CROSS_ENGINE_TASK");
    expect(dispatched).toBeDefined();
    expect(dispatched?.sourceEngine).toBe("execution");
  });
});
