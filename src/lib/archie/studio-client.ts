// =========================================================
// ARCHIE CODING STUDIO — CLIENT API
//
// Thin, typed client over the archie-studio edge function
// (build / feedback / approve / rollback) and the RLS-scoped
// studio tables (project list, files, versions, reviews).
// =========================================================

import { supabase } from "@/lib/supabase";
import type { StudioValidationReport } from "@studio-shared/studio/validate";

export interface StudioFile {
  path: string;
  content: string;
}

export interface StudioProject {
  id: string;
  name: string;
  brief: string;
  summary: string | null;
  status: "DRAFT" | "READY_FOR_DEPLOYMENT" | "ARCHIVED";
  approved_date: string | null;
  created_date: string;
  updated_date: string;
}

export interface StudioVersion {
  id: string;
  kind: "DRAFT_BUILD" | "FEEDBACK_ITERATION" | "ROLLBACK" | "PRODUCTION_BUILD";
  label: string;
  reason: string;
  engine_note: string | null;
  created_date: string;
}

export interface StudioEngineInfo {
  path: string;
  adapter?: string;
  note: string;
}

export interface StudioActionResponse {
  projectId: string;
  versionId?: string;
  name?: string;
  summary?: string;
  files?: StudioFile[];
  qa?: StudioValidationReport;
  engine?: StudioEngineInfo;
  status?: string;
  message: string;
}

/** Invoke a studio action (server does REAL inference + validation). */
export async function studioAction(
  action: "create" | "feedback" | "approve" | "rollback" | "archive",
  payload: {
    brief?: string;
    projectId?: string;
    comment?: string;
    versionId?: string;
  },
): Promise<StudioActionResponse> {
  const { data, error } = await supabase.functions.invoke("archie-studio", {
    body: { action, ...payload },
  });
  if (error) {
    // Edge function returned a JSON error envelope. Surface the
    // server's honest message when present; the generic fallback
    // applies only to unparseable/empty envelopes.
    let message = "Studio request failed. Please try again.";
    try {
      const parsed =
        typeof error === "object" ? error : JSON.parse(String(error));
      const honest =
        typeof parsed?.message === "string"
          ? parsed.message
          : typeof parsed?.error === "string"
            ? parsed.error
            : undefined;
      if (honest && honest.trim()) message = honest;
    } catch {
      // Non-JSON error envelope — keep the generic fallback.
    }
    throw new Error(message);
  }
  if (!data || (data as { error?: string }).error) {
    throw new Error(
      (data as { error?: string })?.error ?? "Studio request failed.",
    );
  }
  return data as StudioActionResponse;
}

/** Owner-scoped project list (RLS enforced server-side). */
export async function listStudioProjects(): Promise<StudioProject[]> {
  const { data, error } = await supabase
    .from("frelux_studio_projects")
    .select("*")
    .neq("status", "ARCHIVED")
    .order("updated_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as StudioProject[];
}

/** The active draft files of a project — the REAL code. */
export async function getStudioFiles(projectId: string): Promise<StudioFile[]> {
  const { data, error } = await supabase
    .from("frelux_studio_files")
    .select("path, content")
    .eq("project_id", projectId)
    .order("path");
  if (error) throw new Error(error.message);
  return (data ?? []) as StudioFile[];
}

/** Immutable version history for review and rollback. */
export async function getStudioVersions(
  projectId: string,
): Promise<StudioVersion[]> {
  const { data, error } = await supabase
    .from("frelux_studio_versions")
    .select("id, kind, label, reason, engine_note, created_date")
    .eq("project_id", projectId)
    .order("created_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as StudioVersion[];
}
