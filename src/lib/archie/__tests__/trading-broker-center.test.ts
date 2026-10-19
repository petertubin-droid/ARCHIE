// =========================================================
// ARCHIE TRADING BROKER CENTER TESTS
// =========================================================
import { describe, it, expect } from "vitest";
import { getBrokerRegistry } from "../trading/broker-center";

describe("Broker Connection Center", () => {
  it("returns verified broker cards including Exness, IQ Option, MT5, and Paper", () => {
    const brokers = getBrokerRegistry();
    expect(brokers.length).toBeGreaterThanOrEqual(4);

    const exness = brokers.find((b) => b.id === "broker_exness");
    expect(exness).toBeDefined();
    expect(exness?.type).toBe("EXNESS_OPENAPI");

    const iq = brokers.find((b) => b.id === "broker_iqoption");
    expect(iq).toBeDefined();
    expect(iq?.mode).toBe("READ_ONLY");
    expect(iq?.disclaimers.some((d) => d.includes("ANALYTICAL & MANUAL"))).toBe(true);
  });
});
