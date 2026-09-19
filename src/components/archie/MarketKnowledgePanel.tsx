// =========================================================
// FRELUX ARCHIE EVOLUTION — MARKET RESEARCH & VALIDATED
// KNOWLEDGE REGISTRY
//
// Two honest Stage-2 surfaces in the Owner's evolution
// console:
//   * Global market observations — validated before they
//     enter the research pool, aggregated per sector/region.
//   * The validated-knowledge registry — VERIFIED is only
//     reachable through human verification, confidence decays
//     with age and stale facts resurface for re-validation.
// =========================================================

import { useState } from "react";
import {
  type GlobalMarketObservation,
  MARKET_RESEARCH_AGENDA,
  MARKET_SECTORS,
  aggregateObservations,
  validateMarketObservation,
} from "@/lib/archie/global-markets";
import {
  type ValidatedKnowledge,
  type ValidationState,
  decayedConfidence,
  isFact,
  labelStatement,
  needsRevalidation,
  rankForRetrieval,
  registerKnowledge,
} from "@/lib/archie/knowledge-validation";
import {
  AdminCard,
  AdminButton,
  StateMessage,
} from "@/components/admin/AdminUi";

export default function MarketKnowledgePanel() {
  // ---- market observations ----
  const [observations, setObservations] = useState<GlobalMarketObservation[]>(
    [],
  );
  const [sector, setSector] = useState(MARKET_SECTORS[0]);
  const [region, setRegion] = useState("NG-Lagos");
  const [statement, setStatement] = useState("");
  const [source, setSource] = useState("");
  const [obsError, setObsError] = useState<string | null>(null);

  // ---- knowledge registry ----
  const [knowledge, setKnowledge] = useState<ValidatedKnowledge[]>([]);
  const [kKey, setKKey] = useState("");
  const [kStatement, setKStatement] = useState("");
  const [kState, setKState] = useState<ValidationState>("OWNER_PROVIDED");
  const [kSource, setKSource] = useState("OWNER");
  const [kConfidence, setKConfidence] = useState("0.8");
  const [kEvidence, setKEvidence] = useState("");
  const [kBasis, setKBasis] = useState("");
  const [kError, setKError] = useState<string | null>(null);

  function addObservation() {
    setObsError(null);
    const obs: GlobalMarketObservation = {
      id: crypto.randomUUID(),
      sector,
      kind: "PRICE_OBSERVATION",
      region,
      observed_at: new Date().toISOString(),
      source: source.trim(),
      statement: statement.trim(),
      confidence: 0.6,
      validation_state: "UNVERIFIED",
    };
    const res = validateMarketObservation(obs);
    if (!res.ok) {
      setObsError(res.error);
      return;
    }
    setObservations((prev) => [...prev, obs]);
    setStatement("");
    setSource("");
  }

  function addKnowledge() {
    setKError(null);
    const res = registerKnowledge({
      key: kKey.trim() || "untitled",
      domain: "construction",
      statement: kStatement.trim(),
      validation_state: kState,
      source: kSource,
      learned_at: new Date().toISOString(),
      confidence: Number(kConfidence) || 0,
      jurisdiction: "NG",
      humanVerified: true,
      verification_evidence: kEvidence.trim() || undefined,
      inference_basis: kBasis.trim() || undefined,
    });
    if (!res.ok) {
      setKError(res.error);
      return;
    }
    setKnowledge((prev) => [...prev, res.knowledge]);
    setKKey("");
    setKStatement("");
    setKEvidence("");
    setKBasis("");
  }

  const aggregates = aggregateObservations(observations);
  const ranked = rankForRetrieval(knowledge);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ---------------- market research ---------------- */}
      <AdminCard>
        <h3 className="mb-4 font-heading text-lg font-semibold">
          Global market research — observation pool
        </h3>
        <p className="mb-4 text-xs text-muted-foreground">
          Raw observations enter UNVERIFIED with named sources; VERIFIED is
          reachable only through human verification. Aggregates are INFERRED,
          never facts.
        </p>

        {obsError && (
          <StateMessage type="error" title="Refused" message={obsError} />
        )}

        <div className="space-y-2">
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            aria-label="Market sector"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            {MARKET_SECTORS.map((sec) => (
              <option key={sec} value={sec}>
                {sec}
              </option>
            ))}
          </select>
          <input
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            aria-label="Observation region"
            placeholder="Region (e.g. NG-Lagos)"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
          <textarea
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            aria-label="Observation statement"
            placeholder="Observation statement"
            className="h-16 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            aria-label="Observation source"
            placeholder="Named source"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
          <AdminButton onClick={addObservation}>
            Add observation (validated)
          </AdminButton>
        </div>

        {observations.length > 0 && (
          <>
            <h4 className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Aggregates ({aggregates.length})
            </h4>
            <ul className="space-y-1 text-xs">
              {aggregates.map((a) => (
                <li key={`${a.sector}-${a.region}`} className="flex gap-2">
                  <span className="font-medium">{a.sector}</span>
                  <span className="text-muted-foreground">{a.region}</span>
                  <span className="text-muted-foreground">
                    {a.observation_count} obs · {a.validation_state} ·{" "}
                    {(a.confidence * 100).toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <h4 className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Research agenda
        </h4>
        <ul className="space-y-1 text-xs text-muted-foreground">
          {MARKET_RESEARCH_AGENDA.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      </AdminCard>

      {/* ---------------- validated knowledge ---------------- */}
      <AdminCard>
        <h3 className="mb-4 font-heading text-lg font-semibold">
          Validated knowledge registry
        </h3>
        <p className="mb-4 text-xs text-muted-foreground">
          ARCHIE cannot verify its own knowledge: VERIFIED requires the human
          verification evidence you provide. Confidence decays with age — stale
          facts resurface for re-validation.
        </p>

        {kError && (
          <StateMessage type="error" title="Refused" message={kError} />
        )}

        <div className="space-y-2">
          <input
            value={kKey}
            onChange={(e) => setKKey(e.target.value)}
            aria-label="Knowledge key"
            placeholder="Knowledge key"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
          <textarea
            value={kStatement}
            onChange={(e) => setKStatement(e.target.value)}
            aria-label="Knowledge statement"
            placeholder="Statement"
            className="h-14 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
          <div className="grid grid-cols-3 gap-2">
            <select
              value={kState}
              onChange={(e) => setKState(e.target.value as ValidationState)}
              aria-label="Validation state"
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="OWNER_PROVIDED">OWNER_PROVIDED</option>
              <option value="INFERRED">INFERRED</option>
              <option value="VERIFIED">VERIFIED</option>
            </select>
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={kConfidence}
              onChange={(e) => setKConfidence(e.target.value)}
              aria-label="Confidence"
              placeholder="0..1"
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
            <input
              value={kSource}
              onChange={(e) => setKSource(e.target.value)}
              aria-label="Knowledge source"
              placeholder="Source"
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          </div>
          {kState === "VERIFIED" && (
            <input
              value={kEvidence}
              onChange={(e) => setKEvidence(e.target.value)}
              aria-label="Verification evidence"
              placeholder="Human verification evidence (required for VERIFIED)"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          )}
          {kState === "INFERRED" && (
            <input
              value={kBasis}
              onChange={(e) => setKBasis(e.target.value)}
              aria-label="Inference basis"
              placeholder="Inference basis (required for INFERRED)"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          )}
          <AdminButton onClick={addKnowledge}>
            Register knowledge (validated)
          </AdminButton>
        </div>

        {ranked.length > 0 && (
          <ul className="mt-4 space-y-2 text-xs">
            {ranked.map((k) => {
              const decayed = decayedConfidence(k);
              const stale = needsRevalidation(k);
              return (
                <li
                  key={`${k.key}-${k.version}`}
                  className="rounded-lg border border-border p-2"
                  data-testid={`knowledge-${stale ? "stale" : "fresh"}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{k.key}</span>
                    <span
                      className={
                        isFact(k.validation_state)
                          ? "text-emerald-400"
                          : "text-muted-foreground"
                      }
                    >
                      {k.validation_state} v{k.version}
                    </span>
                    {stale && (
                      <span className="text-amber-400">
                        needs re-validation
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-muted-foreground">{k.statement}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    decayed confidence {(decayed * 100).toFixed(0)}% ·{" "}
                    {labelStatement(k)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </AdminCard>
    </div>
  );
}
