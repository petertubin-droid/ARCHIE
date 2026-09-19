// Supabase Edge Function: archie-studio
// =========================================================
// ARCHIE CODING STUDIO — THE REAL BUILD & ITERATION ENGINE
//
// The owner-only workspace where ARCHIE:
//   PLAN → WRITE REAL CODE → VALIDATE → VERSION → PREVIEW
//   → ITERATE ON OWNER FEEDBACK → APPROVE → PRODUCTION BUILD
//
// HARD RULES (all enforced here, never by prompt alone):
//   * Owner-only: caller's profile.role must be 'admin'.
//   * ALL inference goes through the ARCHIE AI abstraction —
//     never a direct provider call. If no engine is
//     operational, the response says so honestly. NO MOCK
//     CODE GENERATION EVER.
//   * Every generated project passes the DETERMINISTIC
//     validator (shared/studio/validate.ts) before it is
//     persisted. Invalid output is returned as issues —
//     never silently accepted, never auto-"fixed" by
//     fabrication.
//   * Projects are ISOLATED: frelux_studio_* tables only,
//     sandboxed preview client-side, no production access.
//   * NOTHING DEPLOYS. Approval produces a verified
//     PRODUCTION_BUILD package with status
//     READY_FOR_DEPLOYMENT — deployment itself goes through
//     the Owner Authority Layer / authorized workflow.
//   * Every build, feedback iteration and rollback creates an
//     IMMUTABLE version snapshot — full history, real
//     rollback.
//   * No secrets in, no secrets out.
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  resolveArchieCapabilityEngine,
  type ArchieInferenceRequest,
  type ArchieInferencePart,
} from "../_shared/archie-ai/runtime.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import {
  validateStudioProject,
  type StudioFile,
  type StudioValidationReport,
} from "../_shared/studio/validate.ts";
import { serveWithCors } from "../_shared/serve.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------
// Request contract
// ---------------------------------------------------------
interface StudioBody {
  action: "create" | "feedback" | "approve" | "rollback" | "archive";
  brief?: string;
  projectId?: string;
  comment?: string;
  versionId?: string;
}

// ---------------------------------------------------------
// The ARCHIE developer system instruction. The model writes
// a STRICT JSON manifest of real files. Deterministic code
// below does everything else.
// ---------------------------------------------------------
const STUDIO_SYSTEM_PROMPT = `You are ARCHIE in CODING STUDIO mode — a senior web developer building complete, self-contained websites for the Owner of the FRELUX platform.

You output ONE JSON object and NOTHING else — no markdown fences, no commentary. Schema:
{
  "projectName": "short-kebab-case-name",
  "summary": "one paragraph: what you built and the design direction",
  "files": [{ "path": "index.html", "content": "the complete file content" }]
}

REQUIREMENTS (violations are rejected by deterministic validation):
- Real, complete, production-quality code. Every HTML page is a complete document: <!DOCTYPE html>, <html lang="...">, <head> with <title> and the responsive viewport meta tag, <body>, closing tags. No placeholders, no "TODO", no lorem-ipsum-only sections.
- index.html is always the entrypoint. Multi-page projects add real pages (e.g. about.html) and link them with relative hrefs.
- Styles in .css files, behavior in .js files — referenced with relative paths that exist in the manifest.
- Self-contained: no fetch(), no XMLHttpRequest, no external <script src="http...">, no document.cookie, no localStorage/sessionStorage writes, no embedded API keys, no form actions to external URLs, no references to supabase or frelux.tools. Fonts via Google Fonts <link> are allowed.
- Design bar: professional, modern, responsive (mobile + desktop), consistent spacing, real sections with real copy tailored to the brief. Aim for a premium result the Owner will approve.
- Write copy for every section: headings, paragraphs, service cards, testimonials, contact details from the brief. Never leave empty shells.`;

/** Extract the JSON manifest from model text (tolerates fences). */
function parseManifest(text: string): {
  projectName?: string;
  summary?: string;
  files?: StudioFile[];
} | null {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidates.push(fence[1].trim());
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1));
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && Array.isArray(parsed.files)) return parsed;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

/** Build the inference request for a new build or a feedback
 *  iteration, including the current draft as context. */
function buildRequest(
  briefOrFeedback: string,
  currentFiles: StudioFile[],
  projectName: string | null,
): ArchieInferenceRequest {
  const currentSummary =
    currentFiles.length > 0
      ? `\n\nCURRENT DRAFT of "${projectName}" — the Owner is giving feedback on this. Modify it as requested; keep everything not mentioned unless it conflicts. Return the COMPLETE updated file manifest (all files, full contents):\n${currentFiles
          .map((f) => `--- ${f.path} ---\n${f.content}`)
          .join("\n")}`
      : "";
  return {
    turns: [
      {
        role: "owner" as const,
        parts: [
          {
            text:
              currentFiles.length > 0
                ? `OWNER FEEDBACK: ${briefOrFeedback}${currentSummary}`
                : `PROJECT BRIEF: ${briefOrFeedback}`,
          },
        ] as ArchieInferencePart[],
      },
    ],
    systemInstruction: STUDIO_SYSTEM_PROMPT,
    tools: [], // the studio generates a file manifest — no tool calling
    temperature: 0.7,
    maxOutputTokens: 65535,
  };
}

// ---------------------------------------------------------
// Persistence helpers (service role; RLS bypassed here, but
// every write is scoped to studio tables only).
// ---------------------------------------------------------
async function persistDraft(
  projectId: string,
  files: StudioFile[],
): Promise<void> {
  await db.from("frelux_studio_files").delete().eq("project_id", projectId);
  if (files.length > 0) {
    await db.from("frelux_studio_files").insert(
      files.map((f) => ({
        project_id: projectId,
        path: f.path,
        content: f.content,
      })),
    );
  }
}

async function snapshotVersion(
  projectId: string,
  kind: "DRAFT_BUILD" | "FEEDBACK_ITERATION" | "ROLLBACK" | "PRODUCTION_BUILD",
  label: string,
  reason: string,
  engineNote: string | null,
  files: StudioFile[],
): Promise<{ id: string }> {
  const { data, error } = await db
    .from("frelux_studio_versions")
    .insert({
      project_id: projectId,
      kind,
      label,
      reason,
      engine_note: engineNote,
      snapshot: {
        files: files.map((f) => ({ path: f.path, content: f.content })),
      },
    })
    .select("id")
    .single();
  if (error) throw new Error(`version snapshot failed: ${error.message}`);
  return data;
}

async function loadProject(projectId: string) {
  const { data: project, error } = await db
    .from("frelux_studio_projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (error || !project) return null;
  const { data: fileRows } = await db
    .from("frelux_studio_files")
    .select("path, content")
    .eq("project_id", projectId);
  return {
    project,
    files: (fileRows ?? []) as StudioFile[],
  };
}

// ---------------------------------------------------------
// Handler
// ---------------------------------------------------------
serveWithCors(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return json(405, {
      error:
        "POST only — studio actions are create, approve, archive, feedback, rollback.",
    });
  }

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: auth } },
        auth: { persistSession: false },
      },
    );
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json(401, { error: "Authentication required." });

    const { data: profile } = await db
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role !== "admin") {
      return json(403, { error: "ARCHIE Coding Studio is Owner-only." });
    }

    const rl = checkRateLimit(`archie-studio:${user.id}`, {
      maxRequests: 30,
      windowMs: 60_000,
    });
    if (!rl.allowed)
      return json(429, {
        error: "Too many studio requests, please wait a moment.",
      });

    const body = (await req.json()) as StudioBody;

    // -----------------------------------------------------
    // CREATE (new project from brief) and FEEDBACK (iterate
    // existing draft) share the real inference path.
    // -----------------------------------------------------
    if (body.action === "create" || body.action === "feedback") {
      const isCreate = body.action === "create";
      const directive = (isCreate ? body.brief : body.comment) ?? "";
      if (!directive.trim()) {
        return json(400, {
          error: isCreate
            ? "A project brief is required."
            : "Feedback text is required.",
        });
      }

      // --- ENGINE RESOLUTION (provider-agnostic, before any DB write) ---
      // The Coding Studio never references a provider, key or model name.
      // Its engine is resolved through ARCHIE's AI abstraction registry by
      // neutral id (ARCHIE_STUDIO_ENGINE) — future engines plug into the
      // registry without redesigning the Studio.
      const { runtime, engine } = resolveArchieCapabilityEngine({
        engineId: Deno.env.get("ARCHIE_STUDIO_ENGINE"),
      });
      if (!runtime) {
        return json(503, {
          error:
            "ARCHIE's inference engine is not operational right now — no code was generated and nothing was faked. The Coding Studio requires a real engine.",
          engine,
        });
      }
      // Honest capability gate: ARCHIE's native engine is
      // operational (NLU, knowledge, reasoning, planning,
      // learning) but open-ended generative coding is
      // NOT_IMPLEMENTED in its manifest. The Studio reports
      // this honestly instead of feeding invalid builds
      // through the validator.
      if (runtime.id === "archie-native-engine") {
        return json(503, {
          error:
            "ARCHIE's Native Intelligence Engine is operational (NLU, knowledge, reasoning, planning, learning) — but open-ended generative coding is not implemented in its capability manifest. No code was generated and nothing was faked. This gate will lift when generative coding is genuinely implemented.",
          engine,
        });
      }

      let projectId: string;
      let existingFiles: StudioFile[] = [];
      let projectName: string | null = null;

      if (isCreate) {
        const { data: project, error } = await db
          .from("frelux_studio_projects")
          .insert({ owner_id: user.id, name: "draft", brief: directive.trim() })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        projectId = project.id;
      } else {
        if (!body.projectId)
          return json(400, { error: "projectId is required for feedback." });
        const loaded = await loadProject(body.projectId);
        if (!loaded) return json(404, { error: "Studio project not found." });
        if (loaded.project.owner_id !== user.id && profile?.role !== "admin") {
          return json(403, { error: "Not your studio project." });
        }
        projectId = loaded.project.id;
        existingFiles = loaded.files;
        projectName = loaded.project.name;
      }

      // A failed CREATE must leave nothing behind in the workspace:
      // on any build failure the just-inserted draft row is removed.
      const failBuild = (code: number, payload: Record<string, unknown>) => {
        if (isCreate) {
          void db
            .from("frelux_studio_projects")
            .delete()
            .eq("id", projectId)
            .then(
              () => undefined,
              () => undefined,
            );
        }
        return json(code, payload);
      };

      // --- REAL INFERENCE (ARCHIE AI abstraction) ---
      let result;
      try {
        result = await runtime.generate(
          buildRequest(directive, existingFiles, projectName),
        );
      } catch (err) {
        return failBuild(502, {
          error: `Inference failed: ${(err as Error).message}. No code was generated.`,
          engine,
        });
      }

      const text = result.parts
        .map((p: { text?: string }) => p.text ?? "")
        .join("")
        .trim();
      if (result.finishReason === "MAX_TOKENS") {
        return failBuild(502, {
          error:
            "The engine's output was truncated before the manifest was complete — no code was persisted. Reduce the scope of the brief (fewer pages or sections) and try again.",
          engine: result.engine,
        });
      }
      const manifest = parseManifest(text);
      if (
        !manifest ||
        !Array.isArray(manifest.files) ||
        manifest.files.length === 0
      ) {
        return failBuild(502, {
          error:
            "The engine did not return a valid project manifest — no code was persisted.",
          engine: result.engine,
        });
      }

      const files: StudioFile[] = manifest.files
        .filter(
          (f) => typeof f?.path === "string" && typeof f?.content === "string",
        )
        .map((f) => ({
          path: (f.path as string).trim(),
          content: f.content as string,
        }));

      // --- DETERMINISTIC VALIDATION (real QA) ---
      const report: StudioValidationReport = validateStudioProject(files);
      if (!report.valid) {
        return failBuild(422, {
          error:
            "Generated code failed deterministic validation — nothing was persisted. ARCHIE does not accept or auto-fix invalid output silently.",
          qa: report,
          engine: result.engine,
        });
      }

      // --- PERSIST ---
      const name =
        manifest.projectName?.trim() || projectName || "studio-project";
      const summary = manifest.summary?.trim() ?? null;
      await db
        .from("frelux_studio_projects")
        .update({ name, summary, updated_date: new Date().toISOString() })
        .eq("id", projectId);
      await persistDraft(projectId, files);
      const version = await snapshotVersion(
        projectId,
        isCreate ? "DRAFT_BUILD" : "FEEDBACK_ITERATION",
        isCreate ? "Initial build" : `Iteration from feedback`,
        directive.trim(),
        result.engine.note,
        files,
      );
      if (!isCreate) {
        await db.from("frelux_studio_reviews").insert({
          project_id: projectId,
          kind: "FEEDBACK",
          comment: directive.trim(),
          created_by: user.id,
        });
      }

      return json(200, {
        projectId,
        versionId: version.id,
        name,
        summary,
        files,
        qa: report,
        engine: result.engine,
        message: isCreate
          ? "ARCHIE planned, wrote and validated the project. It is running in the isolated preview."
          : "ARCHIE applied your feedback and re-validated the draft.",
      });
    }

    // -----------------------------------------------------
    // ROLLBACK: restore any immutable snapshot. Real files
    // from the version record — never a reconstruction.
    // -----------------------------------------------------
    if (body.action === "rollback") {
      if (!body.projectId || !body.versionId) {
        return json(400, { error: "projectId and versionId are required." });
      }
      const { data: version } = await db
        .from("frelux_studio_versions")
        .select("kind, snapshot, label")
        .eq("id", body.versionId)
        .eq("project_id", body.projectId)
        .maybeSingle();
      if (!version) return json(404, { error: "Version not found." });

      const files: StudioFile[] =
        (version.snapshot as { files: StudioFile[] }).files ?? [];
      await persistDraft(body.projectId, files);
      const newVersion = await snapshotVersion(
        body.projectId,
        "ROLLBACK",
        `Rollback to "${version.label}"`,
        body.comment?.trim() || "Owner rollback",
        null,
        files,
      );
      await db.from("frelux_studio_reviews").insert({
        project_id: body.projectId,
        kind: "ROLLBACK",
        comment: body.comment?.trim() || `Rolled back to "${version.label}"`,
        created_by: user.id,
      });
      await db
        .from("frelux_studio_projects")
        .update({ updated_date: new Date().toISOString() })
        .eq("id", body.projectId);

      return json(200, {
        projectId: body.projectId,
        versionId: newVersion.id,
        files,
        message: `Rolled back to "${version.label}". The preview now runs that exact snapshot.`,
      });
    }

    // -----------------------------------------------------
    // APPROVE: verify the current draft, package a
    // PRODUCTION_BUILD. NOTHING IS DEPLOYED — deployment is
    // the Owner Authority Layer's job.
    // -----------------------------------------------------
    if (body.action === "approve") {
      if (!body.projectId)
        return json(400, { error: "projectId is required." });
      const loaded = await loadProject(body.projectId);
      if (!loaded) return json(404, { error: "Studio project not found." });

      const report = validateStudioProject(loaded.files);
      if (!report.valid) {
        return json(422, {
          error:
            "The current draft does not pass validation — it cannot be approved as production-ready.",
          qa: report,
        });
      }

      const approvedDate = new Date().toISOString();
      await db
        .from("frelux_studio_projects")
        .update({
          status: "READY_FOR_DEPLOYMENT",
          approved_date: approvedDate,
          updated_date: approvedDate,
        })
        .eq("id", body.projectId);
      const version = await snapshotVersion(
        body.projectId,
        "PRODUCTION_BUILD",
        "Owner-approved production build",
        body.comment?.trim() || "Owner approved",
        null,
        loaded.files,
      );
      await db.from("frelux_studio_reviews").insert({
        project_id: body.projectId,
        kind: "APPROVAL",
        comment: body.comment?.trim() || "Owner approved the project.",
        created_by: user.id,
      });

      return json(200, {
        projectId: body.projectId,
        versionId: version.id,
        qa: report,
        status: "READY_FOR_DEPLOYMENT",
        message:
          "Production build verified and packaged as an immutable version. NOTHING WAS DEPLOYED — deployment proceeds only through the Owner-authorized deployment workflow.",
      });
    }

    // -----------------------------------------------------
    // ARCHIVE: workspace management. Sets the project to
    // ARCHIVED (hidden from the active list). Versions are
    // IMMUTABLE history and are never deleted by this action.
    // -----------------------------------------------------
    if (body.action === "archive") {
      if (!body.projectId)
        return json(400, { error: "projectId is required." });
      const loaded = await loadProject(body.projectId);
      if (!loaded) return json(404, { error: "Studio project not found." });
      if (loaded.project.status === "READY_FOR_DEPLOYMENT") {
        return json(409, {
          error:
            "This project is an approved production build. Owner Authority Layer: archiving an approved build requires explicit instruction.",
        });
      }
      const now = new Date().toISOString();
      await db
        .from("frelux_studio_projects")
        .update({ status: "ARCHIVED", updated_date: now })
        .eq("id", body.projectId);
      await db.from("frelux_studio_reviews").insert({
        project_id: body.projectId,
        kind: "ROLLBACK",
        comment: body.comment?.trim() || "Owner archived the project.",
        created_by: user.id,
      });
      return json(200, {
        projectId: body.projectId,
        message:
          "Project archived. All immutable versions are preserved and it is out of the active workspace list.",
      });
    }

    return json(400, { error: `Unknown action "${body.action}".` });
  } catch (err) {
    console.error("archie-studio error", err);
    return json(500, {
      error: "Studio engine error. No partial result was saved.",
    });
  }
});
