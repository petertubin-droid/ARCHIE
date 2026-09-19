// =========================================================
// ARCHIE DOMAIN REASONING WORKSPACE (PWA)
//
// © 2026 FRENZY. All rights reserved.
//
// REAL activation of ARCHIE's dormant domain-intelligence
// modules. Every panel below calls the actual exported
// functions — no logic is duplicated here:
//   * global-orchestrator  — request routing decisions
//   * cross-domain-reasoning — domain-graph relevance
//   * computation-engine   — batched, cached, prioritized runs
//   * proactive-reasoning  — evidence-cited reasoning frames
//   * intelligence-client  — domain-gap persistence (DB)
//   * weather-intelligence — deterministic work advisories
//   * market-intelligence  — configured vs observed prices
//   * global-markets       — validated market aggregates
//   * social-intelligence  — consented account insight reports
//   * advertising-intelligence — observed-basis recommendations
//   * planning-intelligence — goal-based proposals + disclaimers
//   * global-context       — location authority + regional profile
//
// Anti-fabrication is enforced BY THE MODULES — forms feed
// owner-observed facts, outputs are the modules' own.
// =========================================================

import { useMemo, useState } from "react";
import {
  route,
  ARCHIE_IDENTITY,
  type GlobalRequest,
} from "@/lib/archie/global-orchestrator";
import { AuthorizationRegistry } from "@/lib/archie/capability-authority";
import { selectRelevantDomains } from "@/lib/archie/cross-domain-reasoning";
import { ComputationEngine } from "@/lib/archie/computation-engine";
import {
  buildReasoningFrame,
  ALL_LENSES,
  type ReasoningFrame,
} from "@/lib/archie/proactive-reasoning";
import { persistDomainGaps } from "@/lib/archie/intelligence-client";
import {
  assessWorkPlan,
  type WeatherFacts,
} from "@/lib/archie/weather-intelligence";
import type { WeatherSensitiveWork } from "@/lib/archie/phase9-types";
import {
  buildPriceIntelligence,
  compareObservedToConfigured,
} from "@/lib/archie/market-intelligence";
import {
  buildInsightReport,
  SOCIAL_INTELLIGENCE_CAPABILITIES,
  type SocialInsight,
} from "@/lib/archie/social-intelligence";
import type { ConnectedSocialAccount } from "@/lib/archie/social-connections";
import {
  prepareAdRecommendation,
  AD_RECOMMENDATION_KINDS,
  authorizeCampaignAction,
  type AdRecommendation,
} from "@/lib/archie/advertising-intelligence";
import {
  buildPlanningProposal,
  assertHealthBoundary,
} from "@/lib/archie/planning-intelligence";
import type {
  PlanningProposal,
  MarketObservation,
} from "@/lib/archie/phase9-types";
import { buildGlobalContext } from "@/lib/archie/global-context";
import { ArchieSectionTitle } from "@/components/archie/premium";

const TABS = [
  ["route", "Route a request"],
  ["frame", "Reasoning frame"],
  ["weather", "Weather plan"],
  ["prices", "Prices"],
  ["audience", "Audience"],
  ["plan", "Plan proposal"],
] as const;

type Tab = (typeof TABS)[number][0];

/** Shared computation engine instance: prioritized, cached
 *  batch execution — the real §7 layer, not decorative. */
const engine = new ComputationEngine<string, unknown>({
  concurrency: 4,
  cacheMaxEntries: 50,
  cacheTtlMs: 60_000,
});

function ResultCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg archie-panel p-3">
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-slate-500">
        {title}
      </p>
      <div className="text-xs text-slate-300">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground";

// ---------------------------------------------------------
// Tab 1 — Route a request through the global orchestrator
// ---------------------------------------------------------
function RoutePanel() {
  const [action, setAction] = useState("");
  const [domains, setDomains] = useState("");
  const [decision, setDecision] = useState<string | null>(null);
  const [relevant, setRelevant] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const domainList = domains
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);
      // Batched through the computation engine: the routing
      // decision runs at higher priority than the domain
      // graph walk, results are cached per key.
      const results = await engine.run([
        {
          key: `route:${action}:${domains}`,
          input: action,
          cacheable: true,
          priority: 2,
          compute: () =>
            route(
              {
                world: "GLOBAL_KNOWLEDGE",
                domains: domainList,
                action,
              } as GlobalRequest,
              new AuthorizationRegistry(),
            ) as unknown,
        },
        {
          key: `domains:${domains}`,
          input: domains,
          cacheable: true,
          priority: 1,
          compute: () =>
            (domainList.length > 0
              ? selectRelevantDomains({ anchor_domains: domainList })
              : null) as unknown,
        },
      ]);
      const [routeRes, domainRes] = results;
      if (!routeRes.ok) setError(routeRes.error ?? "routing failed");
      else setDecision(JSON.stringify(routeRes.output, null, 2));
      if (!domainRes.ok) setError(domainRes.error ?? "domain walk failed");
      else {
        const sel = domainRes.output as { selected?: string[] } | null;
        setRelevant(sel ? (sel.selected ?? []) : []);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-500">
        The real global orchestrator classifies a request into its world and
        route, and the cross-domain graph walks related domains. Nothing is
        granted: owner-only authorities show as pending authorization, never as
        allowed.
      </p>
      <Field label="Request / action">
        <input
          className={inputCls}
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="e.g. study roofing material markets in Lagos"
          aria-label="Request action"
        />
      </Field>
      <Field label="Known domains (comma-separated, optional)">
        <input
          className={inputCls}
          value={domains}
          onChange={(e) => setDomains(e.target.value)}
          placeholder="e.g. roofing, costing"
          aria-label="Known domains"
        />
      </Field>
      <button
        type="button"
        disabled={busy || !action.trim()}
        onClick={run}
        className="rounded-md bg-amber-400/15 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-400/25 disabled:opacity-50"
      >
        {busy ? "Routing…" : "Route request"}
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      {decision && (
        <ResultCard title="Orchestrator decision">{decision}</ResultCard>
      )}
      {relevant && relevant.length > 0 && (
        <ResultCard title="Relevant domains (graph walk)">
          {relevant.join(" · ")}
        </ResultCard>
      )}
    </div>
  );
}

// ---------------------------------------------------------
// Tab 2 — Evidence-cited reasoning frame
// ---------------------------------------------------------
interface LensDraft {
  statement: string;
  evidence: string;
  confidence: string;
}

function FramePanel() {
  const [subject, setSubject] = useState("");
  const [drafts, setDrafts] = useState<Record<string, LensDraft>>({});
  const [frame, setFrame] = useState<ReasoningFrame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  function setDraft(lens: string, patch: Partial<LensDraft>) {
    setDrafts((prev) => {
      const defaults: LensDraft = {
        statement: "",
        evidence: "",
        confidence: "0.8",
      };
      const merged: LensDraft = {
        ...defaults,
        ...(prev[lens] ?? {}),
        ...patch,
      };
      return { ...prev, [lens]: merged };
    });
  }

  function build() {
    setSaved(null);
    setError(null);
    const answers = Object.entries(drafts)
      .filter(([, d]) => d.statement.trim() || d.evidence.trim())
      .map(([lens, d]) => ({
        lens: lens as never,
        statement: d.statement,
        evidence: d.evidence
          .split(";")
          .map((e) => e.trim())
          .filter(Boolean),
        confidence: Number(d.confidence) || 0,
      }));
    const result = buildReasoningFrame(subject, answers);
    if (result.ok) setFrame(result.frame);
    else setError(result.error);
  }

  async function recordGaps() {
    if (!frame) return;
    const gaps = frame.unansweredLenses.map((lens) => ({
      domain: subject,
      gap_type: "COVERAGE" as const,
      summary: `Unanswered reasoning lens "${lens}" for subject "${subject}".`,
    }));
    if (gaps.length === 0) {
      setSaved("No unanswered lenses — nothing to record.");
      return;
    }
    const res = await persistDomainGaps(gaps);
    setSaved(
      res.ok
        ? `Recorded ${res.inserted} domain gap(s) to the knowledge system.`
        : `Could not record gaps: ${res.error}`,
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-500">
        Anti-fabrication enforced by the module itself: every statement must
        cite evidence, every unanswered lens is listed — never silently dropped.
        Unanswered lenses can be recorded as real domain gaps.
      </p>
      <Field label="Subject">
        <input
          className={inputCls}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. expanding FRELUX to Ibadan"
          aria-label="Reasoning subject"
        />
      </Field>
      {ALL_LENSES.map((lens) => (
        <div key={lens} className="rounded-lg archie-panel p-2.5">
          <p className="mb-1 text-[11px] font-medium text-slate-300">{lens}</p>
          <input
            className={inputCls}
            value={drafts[lens]?.statement ?? ""}
            onChange={(e) => setDraft(lens, { statement: e.target.value })}
            placeholder="Statement (optional)"
            aria-label={`${lens} statement`}
          />
          <input
            className={`${inputCls} mt-1.5`}
            value={drafts[lens]?.evidence ?? ""}
            onChange={(e) => setDraft(lens, { evidence: e.target.value })}
            placeholder="Evidence, semicolon-separated (required for a statement)"
            aria-label={`${lens} evidence`}
          />
          <input
            className={`${inputCls} mt-1.5`}
            value={drafts[lens]?.confidence ?? ""}
            onChange={(e) => setDraft(lens, { confidence: e.target.value })}
            placeholder="Confidence 0..1 (default 0.8)"
            aria-label={`${lens} confidence`}
          />
        </div>
      ))}
      <button
        type="button"
        disabled={!subject.trim()}
        onClick={build}
        className="rounded-md bg-amber-400/15 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-400/25 disabled:opacity-50"
      >
        Build frame
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      {frame && (
        <>
          <ResultCard
            title={`Frame — ${frame.answers.length} answered, ${frame.unansweredLenses.length} open`}
          >
            {frame.answers.map((a) => (
              <p key={a.lens} className="mb-1">
                <span className="font-semibold text-slate-200">{a.lens}:</span>{" "}
                {a.statement}{" "}
                <span className="text-slate-500">
                  (evidence: {a.evidence.join("; ")} · confidence {a.confidence}
                  )
                </span>
              </p>
            ))}
            {frame.unansweredLenses.length > 0 && (
              <p className="mt-1 text-amber-300">
                Unanswered lenses: {frame.unansweredLenses.join(", ")}
              </p>
            )}
          </ResultCard>
          <button
            type="button"
            onClick={recordGaps}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
          >
            Record unanswered lenses as domain gaps
          </button>
          {saved && (
            <p role="status" className="text-xs text-emerald-300">
              {saved}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------
// Tab 3 — Weather-sensitive work planning
// ---------------------------------------------------------
const WORKS: WeatherSensitiveWork[] = [
  "EXTERIOR_PAINTING",
  "CONCRETE_POURING",
  "ROOFING",
  "EXCAVATION",
  "SCREEDING",
];

function WeatherPanel() {
  const [facts, setFacts] = useState({
    precipitation_mm: "0",
    wind_speed_ms: "2",
    humidity_percent: "70",
    temp_c: "30",
  });
  const [works, setWorks] = useState<string[]>(["EXTERIOR_PAINTING"]);
  const [result, setResult] = useState<ReturnType<
    typeof assessWorkPlan
  > | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    try {
      const weather: WeatherFacts = {
        precipitation_mm: Number(facts.precipitation_mm) || 0,
        wind_speed_ms: Number(facts.wind_speed_ms) || 0,
        humidity_percent: Number(facts.humidity_percent) || 0,
        temp_c: Number(facts.temp_c) || 0,
      };
      setResult(assessWorkPlan(works as WeatherSensitiveWork[], weather));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-500">
        Deterministic thresholds, deliberately conservative: same weather facts
        always produce the same advisory. Enter what you actually observe.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Precipitation (mm)">
          <input
            className={inputCls}
            value={facts.precipitation_mm}
            onChange={(e) =>
              setFacts({ ...facts, precipitation_mm: e.target.value })
            }
            aria-label="Precipitation mm"
          />
        </Field>
        <Field label="Wind speed (m/s)">
          <input
            className={inputCls}
            value={facts.wind_speed_ms}
            onChange={(e) =>
              setFacts({ ...facts, wind_speed_ms: e.target.value })
            }
            aria-label="Wind speed"
          />
        </Field>
        <Field label="Humidity (%)">
          <input
            className={inputCls}
            value={facts.humidity_percent}
            onChange={(e) =>
              setFacts({ ...facts, humidity_percent: e.target.value })
            }
            aria-label="Humidity"
          />
        </Field>
        <Field label="Temperature (°C)">
          <input
            className={inputCls}
            value={facts.temp_c}
            onChange={(e) => setFacts({ ...facts, temp_c: e.target.value })}
            aria-label="Temperature"
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {WORKS.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() =>
              setWorks(
                works.includes(w)
                  ? works.filter((x) => x !== w)
                  : [...works, w],
              )
            }
            className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${
              works.includes(w)
                ? "bg-amber-400/20 text-amber-200"
                : "bg-white/[0.05] text-slate-400"
            }`}
          >
            {w}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={works.length === 0}
        onClick={run}
        className="rounded-md bg-amber-400/15 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-400/25 disabled:opacity-50"
      >
        Assess plan
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      {result && (
        <ResultCard title="Advisories">
          {result.advisories.map((a) => (
            <p key={a.work} className="mb-0.5">
              <span
                className={
                  a.rating === "UNSUITABLE"
                    ? "text-red-300"
                    : a.rating === "CAUTION"
                      ? "text-amber-300"
                      : "text-emerald-300"
                }
              >
                {a.rating}
              </span>{" "}
              — {a.work}
              {a.relevant ? "" : " (weather not a factor)"}
              {a.reason ? `: ${a.reason}` : ""}
            </p>
          ))}
          {result.timing_advice && (
            <p className="mt-1 font-medium text-slate-200">
              {result.timing_advice}
            </p>
          )}
        </ResultCard>
      )}
    </div>
  );
}

// ---------------------------------------------------------
// Tab 4 — Configured vs observed prices + market aggregates
// ---------------------------------------------------------
function PricesPanel() {
  const [item, setItem] = useState("");
  const [configuredValue, setConfiguredValue] = useState("");
  const [unit, setUnit] = useState("per 50kg bag");
  const [region, setRegion] = useState("Lagos");
  const [observed, setObserved] = useState(
    "cement|9500|OBSERVED_MARKET_PRICE|0.7|market visit",
  );
  const [priceView, setPriceView] = useState<string | null>(null);
  const [comparison, setComparison] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function parseObservations(): MarketObservation[] {
    return observed
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [it, val, kind, conf, src] = line.split("|").map((s) => s.trim());
        return {
          item: it || item,
          value: Number(val) || 0,
          currency: "NGN",
          unit,
          price_kind: kind || "OBSERVED_MARKET_PRICE",
          region,
          source_ref: src,
          confidence: Number(conf) || 0.5,
          observed_at: new Date().toISOString(),
        } as MarketObservation;
      });
  }

  function run() {
    setError(null);
    try {
      const obs = parseObservations();
      const view = buildPriceIntelligence({
        item,
        configured: {
          value: Number(configuredValue) || 0,
          currency: "NGN",
          unit,
        },
        observations: obs,
        region,
      });
      setPriceView(
        `CONFIGURED (authoritative): ₦${view.configured.value.toLocaleString()} ${view.configured.unit} — ${view.configured.source}.` +
          (view.observed.length
            ? `\nOBSERVED (${view.observed.length}): ` +
              view.observed
                .map(
                  (o) =>
                    `₦${o.value.toLocaleString()} (${o.price_kind}, confidence ${o.confidence}, ${o.source})`,
                )
                .join("; ")
            : "\nNo observations for this region."),
      );
      const cmp = compareObservedToConfigured({
        configured_value: Number(configuredValue) || 0,
        observations: obs,
      });
      setComparison(
        cmp
          ? `Commentary: market shows ${cmp.direction} ${cmp.percent}% vs configured (observations above minimum confidence — configured value is never mutated).`
          : "Commentary: observations too sparse/weak to say anything — honest silence.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-500">
        Configured prices stay authoritative for calculators; observations are
        labeled and separated — no value ever crosses from one kind to another.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Item">
          <input
            className={inputCls}
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder="e.g. cement"
            aria-label="Item"
          />
        </Field>
        <Field label="Configured value (₦)">
          <input
            className={inputCls}
            value={configuredValue}
            onChange={(e) => setConfiguredValue(e.target.value)}
            placeholder="e.g. 9200"
            aria-label="Configured value"
          />
        </Field>
        <Field label="Unit">
          <input
            className={inputCls}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            aria-label="Unit"
          />
        </Field>
        <Field label="Region">
          <input
            className={inputCls}
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            aria-label="Region"
          />
        </Field>
      </div>
      <Field label="Observations — one per line: item|value|kind|confidence|source">
        <textarea
          className={`${inputCls} font-mono`}
          rows={4}
          value={observed}
          onChange={(e) => setObserved(e.target.value)}
          aria-label="Price observations"
        />
      </Field>
      <button
        type="button"
        disabled={!item.trim() || !configuredValue.trim()}
        onClick={run}
        className="rounded-md bg-amber-400/15 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-400/25 disabled:opacity-50"
      >
        Build price intelligence
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      {priceView && (
        <ResultCard title="Separated price view">{priceView}</ResultCard>
      )}
      {comparison && <ResultCard title="Comparison">{comparison}</ResultCard>}
    </div>
  );
}

// ---------------------------------------------------------
// Tab 5 — Audience: social insights + advertising + location
// ---------------------------------------------------------
function AudiencePanel() {
  const [platform, setPlatform] = useState("instagram");
  const [handle, setHandle] = useState("");
  const [authorized, setAuthorized] = useState(true);
  const [insights, setInsights] = useState(
    "OBSERVED_PLATFORM_DATA|posts now reach more construction professionals|engagement analytics",
  );
  const [report, setReport] = useState<string | null>(null);
  const [socialError, setSocialError] = useState<string | null>(null);

  const [adKind, setAdKind] = useState("geographic_market");
  const [adRec, setAdRec] = useState("");
  const [adBasis, setAdBasis] = useState("");
  const [adPermitted, setAdPermitted] = useState(true);
  const [adResult, setAdResult] = useState<AdRecommendation | null>(null);
  const [adError, setAdError] = useState<string | null>(null);

  const [countryCode, setCountryCode] = useState("NG");
  const [contextResult, setContextResult] = useState<string | null>(null);

  function runSocial() {
    setSocialError(null);
    setReport(null);
    const account: ConnectedSocialAccount = {
      platform,
      account_handle: handle,
      status: "CONNECTED",
      connection_kind: "OWNER_BRAND_ACCOUNT",
      scopes: ["READ_INSIGHTS"],
      owner_explicitly_authorized: authorized,
    };
    const parsed: SocialInsight[] = insights
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [kind, statement, basis] = line.split("|").map((s) => s.trim());
        return {
          kind: (kind || "OBSERVED_PLATFORM_DATA") as SocialInsight["kind"],
          statement,
          basis,
        } as SocialInsight;
      });
    const result = buildInsightReport({ account, insights: parsed });
    if (result.ok) {
      setReport(
        result
          .report!.map((i) => `${i.kind}: ${i.statement} (basis: ${i.basis})`)
          .join("\n"),
      );
    } else {
      setSocialError(result.error ?? "report refused");
    }
  }

  function runAd() {
    setAdError(null);
    setAdResult(null);
    const result = prepareAdRecommendation({
      kind: adKind as AdRecommendation["kind"],
      recommendation: adRec,
      observed_basis: adBasis,
      legally_and_technically_permitted: adPermitted,
    });
    if (result.ok) setAdResult(result.rec!);
    else setAdError(result.error ?? "recommendation refused");
  }

  function runContext() {
    setContextResult(null);
    try {
      const ctx = buildGlobalContext({
        consent: {
          location_granted: false,
          private_device_data_granted: false,
        },
        user_selected_location: {
          latitude: null,
          longitude: null,
          accuracy_m: null,
          formatted_address: null,
          country: countryCode === "NG" ? "Nigeria" : null,
          country_code: countryCode || null,
          region: null,
          city: null,
          postcode: null,
          place_id: null,
          source: "manual",
          captured_at: new Date().toISOString(),
          verification: "user_confirmed",
        },
      });
      setContextResult(
        `Authority source: ${ctx.resolution.source}; effective location ${ctx.profile.city ?? ""} ${ctx.profile.country ?? ""} → currency ${ctx.profile.currency}, units ${ctx.profile.units}, suggested languages ${ctx.profile.suggested_languages.join(", ")}. Device location requires explicit consent — none was used.`,
      );
    } catch (err) {
      setContextResult(
        err instanceof Error ? err.message : "Location context refused.",
      );
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-500">
        Owner-brand accounts only, observed basis mandatory, ARCHIE never
        spends. Location context never touches device location without consent.
      </p>

      <div className="rounded-lg archie-panel p-2.5">
        <p className="mb-1.5 text-[11px] font-medium text-slate-300">
          Social insight report — {SOCIAL_INTELLIGENCE_CAPABILITIES.length}{" "}
          capabilities
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Platform">
            <input
              className={inputCls}
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              aria-label="Platform"
            />
          </Field>
          <Field label="Account handle">
            <input
              className={inputCls}
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              aria-label="Account handle"
            />
          </Field>
        </div>
        <label className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400">
          <input
            type="checkbox"
            checked={authorized}
            onChange={(e) => setAuthorized(e.target.checked)}
          />
          Owner explicitly authorized this account
        </label>
        <textarea
          className={`${inputCls} mt-1.5 font-mono`}
          rows={3}
          value={insights}
          onChange={(e) => setInsights(e.target.value)}
          aria-label="Social insights"
        />
        <p className="mt-1 text-[10px] text-slate-500">
          One per line: OBSERVED_PLATFORM_DATA|statement|basis
        </p>
        <button
          type="button"
          onClick={runSocial}
          className="mt-1.5 rounded-md bg-amber-400/15 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-400/25"
        >
          Build insight report
        </button>
        {socialError && (
          <p role="alert" className="mt-1 text-xs text-red-400">
            {socialError}
          </p>
        )}
        {report && <ResultCard title="Insight report">{report}</ResultCard>}
      </div>

      <div className="rounded-lg archie-panel p-2.5">
        <p className="mb-1.5 text-[11px] font-medium text-slate-300">
          Advertising recommendation
        </p>
        <Field label="Kind">
          <select
            className={inputCls}
            value={adKind}
            onChange={(e) => setAdKind(e.target.value)}
            aria-label="Recommendation kind"
          >
            {AD_RECOMMENDATION_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>
        <input
          className={`${inputCls} mt-1.5`}
          value={adRec}
          onChange={(e) => setAdRec(e.target.value)}
          placeholder="Recommendation (observed-basis required)"
          aria-label="Recommendation"
        />
        <textarea
          className={`${inputCls} mt-1.5`}
          rows={2}
          value={adBasis}
          onChange={(e) => setAdBasis(e.target.value)}
          placeholder="Observed basis — ARCHIE never fabricates audience information"
          aria-label="Observed basis"
        />
        <label className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400">
          <input
            type="checkbox"
            checked={adPermitted}
            onChange={(e) => setAdPermitted(e.target.checked)}
          />
          Legally and technically permitted
        </label>
        <button
          type="button"
          onClick={runAd}
          className="mt-1.5 rounded-md bg-amber-400/15 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-400/25"
        >
          Prepare recommendation
        </button>
        {adError && (
          <p role="alert" className="mt-1 text-xs text-red-400">
            {adError}
          </p>
        )}
        {adResult && (
          <ResultCard title="Prepared (never executed)">
            {adResult.kind}: {adResult.recommendation} — basis:{" "}
            {adResult.observed_basis}
            <p className="mt-1 text-amber-300">
              Spend authority check — ARCHIE:{" "}
              {authorizeCampaignAction("ARCHIE").ok
                ? "allowed"
                : (authorizeCampaignAction("ARCHIE").error ?? "refused")}
              . Only the Owner authorizes spend or material campaign changes.
            </p>
          </ResultCard>
        )}
      </div>

      <div className="rounded-lg archie-panel p-2.5">
        <p className="mb-1.5 text-[11px] font-medium text-slate-300">
          Location authority & regional profile
        </p>
        <div className="flex items-end gap-2">
          <Field label="Country code (user-selected)">
            <input
              className={inputCls}
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
              aria-label="Country code"
            />
          </Field>
          <button
            type="button"
            onClick={runContext}
            className="rounded-md bg-amber-400/15 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-400/25"
          >
            Resolve
          </button>
        </div>
        {contextResult && (
          <ResultCard title="Global context">{contextResult}</ResultCard>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// Tab 6 — Planning proposal
// ---------------------------------------------------------
const PLAN_TYPES: PlanningProposal["plan_type"][] = [
  "PROJECT_PLAN",
  "STUDY_PLAN",
  "LEARNING_PLAN",
  "DAILY_ROUTINE",
  "TASK_PLAN",
  "CONTENT_PLAN",
  "TRAVEL_PLAN",
  "HOUSEHOLD_PLAN",
  "SHOPPING_PLAN",
  "FITNESS_PLAN",
];

function PlanPanel() {
  const [planType, setPlanType] =
    useState<PlanningProposal["plan_type"]>("PROJECT_PLAN");
  const [title, setTitle] = useState("");
  const [goals, setGoals] = useState("");
  const [proposal, setProposal] = useState<PlanningProposal | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    try {
      const p = buildPlanningProposal({
        plan_type: planType,
        title,
        goals: goals
          .split("\n")
          .map((g) => g.trim())
          .filter(Boolean),
      });
      assertHealthBoundary(p); // throws if health-adjacent without disclaimer path
      setProposal(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-500">
        Goals come from you — ARCHIE does not invent them. High-consequence
        areas always carry their disclaimers.
      </p>
      <Field label="Plan type">
        <select
          className={inputCls}
          value={planType}
          onChange={(e) =>
            setPlanType(e.target.value as PlanningProposal["plan_type"])
          }
          aria-label="Plan type"
        >
          {PLAN_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Title">
        <input
          className={inputCls}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Plan title"
        />
      </Field>
      <Field label="Goals — one per line">
        <textarea
          className={inputCls}
          rows={3}
          value={goals}
          onChange={(e) => setGoals(e.target.value)}
          aria-label="Goals"
        />
      </Field>
      <button
        type="button"
        disabled={!title.trim() || !goals.trim()}
        onClick={run}
        className="rounded-md bg-amber-400/15 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-400/25 disabled:opacity-50"
      >
        Build proposal
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      {proposal && (
        <ResultCard title="Proposal (never an irreversible action)">
          <p className="mb-1 font-semibold text-slate-200">
            {proposal.title} ({proposal.plan_type})
          </p>
          <ol className="mb-1 list-decimal pl-4">
            {proposal.steps.map((s) => (
              <li key={s.order}>{s.description}</li>
            ))}
          </ol>
          <p className="text-slate-500">
            Assumptions: {proposal.assumptions.join(" · ")}
          </p>
          {proposal.disclaimers.length > 0 && (
            <p className="mt-1 text-amber-300">
              Disclaimers: {proposal.disclaimers.join(" · ")}
            </p>
          )}
        </ResultCard>
      )}
    </div>
  );
}

// ---------------------------------------------------------
// Workspace shell
// ---------------------------------------------------------
export default function DomainReasoning() {
  const [tab, setTab] = useState<Tab>("route");
  const identity = useMemo(() => ARCHIE_IDENTITY.is, []);

  return (
    <div>
      <ArchieSectionTitle>Domain reasoning</ArchieSectionTitle>
      <p className="mb-3 text-[11px] text-slate-500">
        ARCHIE's reasoning modules, live: {identity}. Every output on these tabs
        is produced by the real module functions from your observed inputs —
        refusals and honesty rules included.
      </p>
      <div
        className="mb-3 flex flex-wrap gap-1.5"
        role="tablist"
        aria-label="Domain reasoning tools"
      >
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-full px-3 py-1 text-[11px] font-medium ${
              tab === key
                ? "bg-amber-400/20 text-amber-200"
                : "bg-white/[0.05] text-slate-400 hover:bg-white/10"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "route" && <RoutePanel />}
      {tab === "frame" && <FramePanel />}
      {tab === "weather" && <WeatherPanel />}
      {tab === "prices" && <PricesPanel />}
      {tab === "audience" && <AudiencePanel />}
      {tab === "plan" && <PlanPanel />}
    </div>
  );
}
