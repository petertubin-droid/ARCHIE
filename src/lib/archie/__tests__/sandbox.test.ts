import { describe, expect, it } from "vitest";
import {
  MAX_CALL_DEPTH,
  MAX_STEPS,
  runJavaScript,
} from "@studio-shared/archie-ai/native-engine/sandbox.ts";
import {
  computeStatistics,
  ToolOrchestrator,
  registerBuiltInTools,
} from "@studio-shared/archie-ai/native-engine/tools.ts";

describe("sandboxed JavaScript interpreter (gap-2 code execution)", () => {
  it("computes a recursive fibonacci with loops and arrays", () => {
    const res = runJavaScript(`
      function fib(n) { if (n < 2) return n; return fib(n - 1) + fib(n - 2); }
      var out = [];
      for (var i = 1; i <= 10; i++) out.push(fib(i));
      print(out.join(","));
      out.length;
    `);
    expect(res.ok).toBe(true);
    expect(res.error).toBeNull();
    expect(res.output).toEqual(["1,1,2,3,5,8,13,21,34,55"]);
    expect(res.value).toBe("10");
  });

  it("runs braceless single-statement bodies (real JS form)", () => {
    const res = runJavaScript(`
      var total = 0;
      for (var i = 1; i <= 5; i++) total += i;
      if (total === 15) print("fifteen");
      total;
    `);
    expect(res.ok).toBe(true);
    expect(res.output).toEqual(["fifteen"]);
    expect(res.value).toBe("15");
  });

  it("mutations by outer variables survive across loop iterations (no shadow fork)", () => {
    const res = runJavaScript(`
      var s = "racecar";
      var r = "";
      var i = s.length - 1;
      while (i >= 0) { r += s.charAt(i); i--; }
      print(r);
      r === s;
    `);
    expect(res.ok).toBe(true);
    expect(res.output).toEqual(["racecar"]);
    expect(res.value).toBe("true");
  });

  it("supports objects, JSON round-trip and array map/filter/reduce", () => {
    const res = runJavaScript(`
      var config = { name: "archie", tiers: [1, 2, 3], nested: { ok: true } };
      print(JSON.stringify(config));
      var doubled = config.tiers.map(function (x) { return x * 10; });
      var evens = doubled.filter(function (x) { return x % 20 === 0; });
      evens.reduce(function (a, b) { return a + b; }, 0);
    `);
    expect(res.ok).toBe(true);
    expect(res.output).toEqual([
      `{"name":"archie","tiers":[1,2,3],"nested":{"ok":true}}`,
    ]);
    expect(res.value).toBe("20");
  });

  it("|| and && return operand values (JS semantics, not booleans)", () => {
    const res = runJavaScript(`var a = 0 || 42; var b = "x" && "y"; print(a + "," + b); a;`);
    expect(res.ok).toBe(true);
    expect(res.output).toEqual(["42,y"]);
    expect(res.value).toBe("42");
  });

  it("deterministic: same program, same output, every run", () => {
    const prog = `var acc = 0; for (var i = 0; i < 100; i++) acc += i * 2; print(acc); acc;`;
    const runs = [runJavaScript(prog), runJavaScript(prog), runJavaScript(prog)];
    expect(new Set(runs.map((r) => JSON.stringify(r))).size).toBe(1);
  });

  it("stops an infinite loop at the step cap, honestly", () => {
    const res = runJavaScript("while (true) { var x = 1; }");
    expect(res.ok).toBe(false);
    expect(res.steps).toBeGreaterThan(MAX_STEPS);
    expect(res.error).toContain("step cap");
  });

  it("stops deep recursion at the call-depth cap", () => {
    const res = runJavaScript("function f(n) { return f(n + 1); } f(0);");
    expect(res.ok).toBe(false);
    expect(res.error).toContain(`call depth cap reached (${MAX_CALL_DEPTH})`);
  });

  it("excludes Date, Math.random, fetch and unknown identifiers — honest errors, no fallback guesses", () => {
    for (const code of [
      "var d = Date.now();",
      "var r = Math.random();",
      "fetch('https://evil.example');",
      "var x = y + 1;",
      "eval('1 + 1');",
      "import('fs');",
    ]) {
      const res = runJavaScript(code);
      expect(res.ok, code).toBe(false);
      expect(res.error, code).toBeTruthy();
    }
  });

  it("caps print output lines", () => {
    const res = runJavaScript(
      `for (var i = 0; i < 100000; i++) { print(i); }`,
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain("output cap reached");
    expect(res.output.length).toBeLessThanOrEqual(501);
  });

  it("refuses unsupported syntax with a source position", () => {
    const res = runJavaScript("var x = 3 ~ 4;");
    expect(res.ok).toBe(false);
    expect(res.error).toContain("unsupported character");
  });

  it("strings are immutable and whitelisted members only", () => {
    const assign = runJavaScript(`var s = "abc"; s[0] = "z";`);
    expect(assign.ok).toBe(false);
    expect(assign.error).toContain("immutable");
    const member = runJavaScript(`var s = "abc"; s.explode();`);
    expect(member.ok).toBe(false);
    expect(member.error).toContain("not in the sandbox whitelist");
  });
});

describe("statistics tool", () => {
  it("computes mean, median, variance and standard deviation exactly", () => {
    const vals = [2, 4, 4, 4, 5, 5, 7, 9];
    expect((computeStatistics(vals, "mean") as { result: number }).result).toBe(5);
    expect((computeStatistics(vals, "median") as { result: number }).result).toBe(4.5);
    expect((computeStatistics(vals, "mode") as { result: number[] }).result).toEqual([4]);
    expect((computeStatistics(vals, "sum") as { result: number }).result).toBe(40);
    expect((computeStatistics(vals, "variance") as { result: number }).result).toBe(4);
    expect((computeStatistics(vals, "standard deviation") as { result: number }).result).toBe(2);
    expect((computeStatistics(vals, "range") as { result: number }).result).toBe(7);
  });

  it("is registered with contract validation", () => {
    const orch = new ToolOrchestrator();
    registerBuiltInTools(orch);
    expect(orch.has("statistics")).toBe(true);
    expect(orch.has("run_javascript")).toBe(true);
    expect(orch.has("read_page")).toBe(true);
    expect(orch.has("arithmetic")).toBe(true);
    expect(orch.has("convert_units")).toBe(true);
    expect(orch.has("percent_of")).toBe(true);
  });

  it("runs a program through the orchestrator and reports honestly on errors", async () => {
    const orch = new ToolOrchestrator();
    registerBuiltInTools(orch);
    const ok = await orch.invoke("run_javascript", {
      code: "var x = 6 * 7; print(x); x;",
    });
    expect(ok.ok).toBe(true);
    expect((ok.output as { output: string[] }).output).toEqual(["42"]);

    // The TOOL runs fine; the PROGRAM fails inside it — the
    // sandbox result carries the honest program error.
    const bad = await orch.invoke("run_javascript", { code: "var" });
    expect(bad.ok).toBe(true);
    expect((bad.output as { ok: boolean; error: string | null }).ok).toBe(false);
    expect((bad.output as { error: string | null }).error).toContain("line 1");
  });

  it("read_page without a fetcher wired fails honestly", async () => {
    const orch = new ToolOrchestrator();
    registerBuiltInTools(orch); // no pageFetcher wired
    const res = await orch.invoke("read_page", { url: "https://example.com" });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("page fetcher not wired");
  });
});

describe("engine conversational tool paths (gap-2 deep loop)", () => {
  it("runs a semicolon-bearing program WHOLE — never clause-split", async () => {
    const { ArchieNativeEngine } = await import("@studio-shared/archie-ai/native-engine/engine.ts");
    const { runReasoningLoop } = await import("@studio-shared/archie-ai/native-engine/reasoning-loop.ts");
    const engine = new ArchieNativeEngine();
    const { result, report } = await runReasoningLoop(
      engine,
      "run this javascript: var x = 6 * 7; print(x); x;",
    );
    expect(result.responseText).toContain("42");
    expect(result.responseText).toContain("sandbox");
    expect(result.toolResults?.map((t) => t.tool)).toContain("run_javascript");
    expect(report.steps).toHaveLength(1);
    expect(report.steps[0].summary).toContain("program kept whole");
  });

  it("answers statistics questions with computed math, not research", async () => {
    const { ArchieNativeEngine } = await import("@studio-shared/archie-ai/native-engine/engine.ts");
    const engine = new ArchieNativeEngine();
    const res = await engine.converse("what is the mean of 12, 7, 3 and 41");
    expect(res.responseText).toContain("15.75");
    expect(res.responseText).toContain("computed deterministically");
    expect(res.toolResults?.map((t) => t.tool)).toContain("statistics");
  });

  it("reports an unreadable page honestly (no invented content)", async () => {
    const { ArchieNativeEngine } = await import("@studio-shared/archie-ai/native-engine/engine.ts");
    const engine = new ArchieNativeEngine();
    const res = await engine.converse("open https://invalid.invalid");
    expect(res.toolResults?.map((t) => t.tool)).toContain("read_page");
    expect(res.responseText).toMatch(/could not read that page|robots|unreachable|refused|failed/i);
    expect(res.responseText).not.toMatch(/Beginning of the content/);
  });
});
