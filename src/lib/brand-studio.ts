// =========================================================
// FRELUX Brand Studio, Core Library
//
// Branding resolution, access control, and database queries.
// Integrates with existing subscription, rewarded-ad, and
// admin configuration systems.
// =========================================================

import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { getSupabase } from "@/lib/supabase-lazy";
import { useAuth } from "@/lib/auth";
import { isSubscriptionActive } from "@/lib/subscription";

import type {
  DbBrandProfile,
  DbUserPaidStatus,
  DbPdfBrandingTemplate,
  DbPdfExportUnlock,
  DbAiLogoGeneration,
  PdfWatermarkConfig,
  PdfTemplateConfig,
  PdfDefaultBrandingConfig,
} from "@/types/database";

// ───────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────

export type BrandingSource =
  "user_premium" | "rewarded_ad" | "frelux_default" | "safe_fallback";

export interface ResolvedBranding {
  source: BrandingSource;
  brandName: string;
  tagline: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  whatsapp: string | null;
  website: string | null;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  watermark: PdfWatermarkConfig;
  templateConfig: PdfTemplateConfig | null;
  logoPlacement:
    | "top-left"
    | "top-right"
    | "top-center"
    | "bottom-left"
    | "bottom-right"
    | "bottom-center";
  templateId: string | null;
  profileId: string | null;
  /** If from rewarded-ad unlock, this is the unlock record id to consume */
  unlockId: string | null;
}

export interface BrandStudioAccess {
  /** Brand Studio feature is enabled by admin */
  featureEnabled: boolean;
  /** User has active premium subscription meeting the tier */
  hasPremium: boolean;
  /** User has an active rewarded-ad unlock for PDF branding */
  hasRewardedUnlock: boolean;
  /** Unlock record if active */
  activeUnlock: DbPdfExportUnlock | null;
  /** AI logo generation daily limit */
  aiLogoDailyLimit: number;
  /** Can use custom branding (premium or rewarded) */
  canUseCustomBranding: boolean;
  /** Can save multiple brand profiles */
  canSaveMultipleProfiles: boolean;
  /** Can access AI logo studio */
  canUseAiLogo: boolean;
}

const DEFAULT_WATERMARK: PdfWatermarkConfig = {
  enabled: true,
  opacity: 0.08,
  scale: 0.6,
  position: "center",
  diagonal: false,
};

const DEFAULT_TEMPLATE_CONFIG: PdfTemplateConfig = {
  headerLayout: "logo-right",
  footerLayout: "default",
  contactPlacement: "header",
  accentBar: true,
  accentBarColor: "#7C3AED",
};

export const SAFE_FALLBACK_BRANDING: ResolvedBranding = {
  source: "safe_fallback",
  brandName: "FRELUX PROJECT CALC",
  tagline: "Smart Construction Estimation",
  email: null,
  phone: null,
  address: null,
  whatsapp: null,
  website: null,
  logoUrl: null,
  primaryColor: "#7C3AED",
  secondaryColor: "#0B1120",
  accentColor: "#F97316",
  watermark: DEFAULT_WATERMARK,
  templateConfig: DEFAULT_TEMPLATE_CONFIG,
  logoPlacement: "top-right",
  templateId: null,
  profileId: null,
  unlockId: null,
};

// ───────────────────────────────────────────────────────
// Config fetching
// ───────────────────────────────────────────────────────

let configCache: PdfDefaultBrandingConfig | null = null;
let configCacheExpiry = 0;
const CONFIG_CACHE_TTL = 30_000; // 30 seconds

export async function fetchPdfBrandingConfig(): Promise<PdfDefaultBrandingConfig | null> {
  if (configCache && Date.now() < configCacheExpiry) return configCache;
  if (!isSupabaseConfigured) return null;

  try {
    const { data, error } = await supabase
      .from("site_settings")
      .select(
        "pdf_default_logo_url, pdf_default_brand_name, pdf_default_tagline, pdf_default_contact_email, pdf_default_contact_phone, pdf_default_address, pdf_default_primary_color, pdf_default_secondary_color, pdf_template_id, pdf_watermark_enabled, pdf_watermark_opacity, pdf_watermark_scale, pdf_watermark_position, pdf_watermark_diagonal, brand_studio_enabled, ai_logo_daily_limit",
      )
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    configCache = data as PdfDefaultBrandingConfig;
    configCacheExpiry = Date.now() + CONFIG_CACHE_TTL;
    return configCache;
  } catch {
    return null;
  }
}

export function invalidateBrandingConfigCache(): void {
  configCache = null;
  configCacheExpiry = 0;
}

// ───────────────────────────────────────────────────────
// Access control
// ───────────────────────────────────────────────────────

export function useBrandStudioAccess(): BrandStudioAccess {
  const { user, isAdmin, isPaid, paidStatus } = useAuth();
  const _isPaid = isPaid;
  const _isAdmin = isAdmin;
  void user;
  void paidStatus;
  void _isPaid;
  void _isAdmin;
  // Access is determined dynamically, this hook returns a snapshot
  return {
    featureEnabled: false,
    hasPremium: false,
    hasRewardedUnlock: false,
    activeUnlock: null,
    aiLogoDailyLimit: 3,
    canUseCustomBranding: false,
    canSaveMultipleProfiles: false,
    canUseAiLogo: false,
  };
}

/**
 * Resolve brand studio access for a user.
 * Checks: admin config → premium subscription → rewarded-ad unlock.
 */
export async function resolveBrandStudioAccess(
  userId: string | null,
  isAdmin: boolean,
  isPaid: boolean,
  paidStatus: DbUserPaidStatus | null,
): Promise<BrandStudioAccess> {
  const config = await fetchPdfBrandingConfig();

  if (!config?.brand_studio_enabled) {
    return {
      featureEnabled: false,
      hasPremium: false,
      hasRewardedUnlock: false,
      activeUnlock: null,
      aiLogoDailyLimit: config?.ai_logo_daily_limit ?? 3,
      canUseCustomBranding: false,
      canSaveMultipleProfiles: false,
      canUseAiLogo: false,
    };
  }

  const hasPremium = isAdmin || (isPaid && isSubscriptionActive(paidStatus));

  // Check rewarded-ad unlock
  let activeUnlock: DbPdfExportUnlock | null = null;
  if (!hasPremium && userId) {
    const { data } = await supabase
      .from("pdf_export_unlocks")
      .select("*")
      .eq("user_id", userId)
      .eq("tool_key", "brand_studio_pdf")
      .eq("is_consumed", false)
      .gt("expires_at", new Date().toISOString())
      .order("unlocked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    activeUnlock = (data as DbPdfExportUnlock) ?? null;
  }

  const hasRewardedUnlock = activeUnlock !== null;
  const canUseCustomBranding = hasPremium || hasRewardedUnlock;
  const canSaveMultipleProfiles = hasPremium;
  const canUseAiLogo = hasPremium || hasRewardedUnlock;

  return {
    featureEnabled: true,
    hasPremium,
    hasRewardedUnlock,
    activeUnlock,
    aiLogoDailyLimit: config.ai_logo_daily_limit ?? 3,
    canUseCustomBranding,
    canSaveMultipleProfiles,
    canUseAiLogo,
  };
}

// ───────────────────────────────────────────────────────
// Branding resolution, the priority system
// ───────────────────────────────────────────────────────

/**
 * Resolve branding for a PDF export.
 * Priority: 1) User premium branding 2) Rewarded-ad unlock 3) FRELUX default 4) Safe fallback
 */
export async function resolveBranding(
  profileId: string | null,
  access: BrandStudioAccess,
): Promise<ResolvedBranding> {
  // 1. User-selected premium branding
  if (access.hasPremium && profileId) {
    const profile = await fetchBrandProfile(profileId);
    if (profile) {
      return profileToBranding(profile, "user_premium", null);
    }
  }

  // 2. Rewarded-ad temporary unlock
  if (access.hasRewardedUnlock && access.activeUnlock) {
    if (access.activeUnlock.brand_profile_id) {
      const profile = await fetchBrandProfile(
        access.activeUnlock.brand_profile_id,
      );
      if (profile) {
        return profileToBranding(
          profile,
          "rewarded_ad",
          access.activeUnlock.id,
        );
      }
    }
    // Unlock without specific profile, use a basic branded template
    return unlockedDefaultBranding(access.activeUnlock);
  }

  // 3. FRELUX admin default
  const config = await fetchPdfBrandingConfig();
  if (config) {
    return configToBranding(config);
  }

  // 4. Safe fallback
  return SAFE_FALLBACK_BRANDING;
}

function profileToBranding(
  profile: DbBrandProfile,
  source: BrandingSource,
  unlockId: string | null,
): ResolvedBranding {
  return {
    source,
    brandName: profile.name,
    tagline: profile.tagline,
    email: profile.email,
    phone: profile.phone,
    address: profile.address,
    whatsapp: profile.whatsapp,
    website: profile.website,
    logoUrl: profile.logo_url,
    primaryColor: profile.primary_color,
    secondaryColor: profile.secondary_color,
    accentColor: profile.accent_color,
    watermark: profile.watermark_config ?? DEFAULT_WATERMARK,
    templateConfig: null, // resolved separately via template_id
    logoPlacement: profile.logo_placement,
    templateId: profile.template_id,
    profileId: profile.id,
    unlockId,
  };
}

function unlockedDefaultBranding(unlock: DbPdfExportUnlock): ResolvedBranding {
  return {
    ...SAFE_FALLBACK_BRANDING,
    source: "rewarded_ad",
    unlockId: unlock.id,
  };
}

function configToBranding(config: PdfDefaultBrandingConfig): ResolvedBranding {
  return {
    source: "frelux_default",
    brandName: config.pdf_default_brand_name || "FRELUX PROJECT CALC",
    tagline: config.pdf_default_tagline || null,
    email: config.pdf_default_contact_email || null,
    phone: config.pdf_default_contact_phone || null,
    address: config.pdf_default_address || null,
    whatsapp: null,
    website: null,
    logoUrl: config.pdf_default_logo_url || null,
    primaryColor: config.pdf_default_primary_color || "#7C3AED",
    secondaryColor: config.pdf_default_secondary_color || "#0B1120",
    accentColor: "#F97316",
    watermark: {
      enabled: config.pdf_watermark_enabled ?? true,
      opacity: config.pdf_watermark_opacity ?? 0.08,
      scale: config.pdf_watermark_scale ?? 0.6,
      position:
        (config.pdf_watermark_position as PdfWatermarkConfig["position"]) ??
        "center",
      diagonal: config.pdf_watermark_diagonal ?? false,
    },
    templateConfig: null,
    logoPlacement: "top-right",
    templateId: config.pdf_template_id || null,
    profileId: null,
    unlockId: null,
  };
}

// ───────────────────────────────────────────────────────
// Brand profile CRUD
// ───────────────────────────────────────────────────────

export async function fetchBrandProfiles(
  userId: string,
): Promise<DbBrandProfile[]> {
  const { data, error } = await supabase
    .from("brand_profiles")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) return [];
  return (data ?? []) as DbBrandProfile[];
}

export async function fetchBrandProfile(
  id: string,
): Promise<DbBrandProfile | null> {
  const { data, error } = await supabase
    .from("brand_profiles")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) return null;
  return (data as DbBrandProfile) ?? null;
}

export async function createBrandProfile(
  userId: string,
  data: {
    name: string;
    tagline?: string;
    description?: string;
    phone?: string;
    whatsapp?: string;
    email?: string;
    address?: string;
    website?: string;
    primary_color?: string;
    secondary_color?: string;
    accent_color?: string;
    logo_url?: string | null;
    template_id?: string | null;
    watermark_config?: PdfWatermarkConfig | null;
    logo_placement?: string;
    is_default?: boolean;
  },
): Promise<{ profile: DbBrandProfile | null; error: string | null }> {
  // If setting as default, clear other defaults first
  if (data.is_default) {
    await supabase
      .from("brand_profiles")
      .update({ is_default: false })
      .eq("user_id", userId)
      .eq("is_default", true);
  }

  const { data: created, error } = await supabase
    .from("brand_profiles")
    .insert({
      user_id: userId,
      name: data.name,
      tagline: data.tagline ?? null,
      description: data.description ?? null,
      phone: data.phone ?? null,
      whatsapp: data.whatsapp ?? null,
      email: data.email ?? null,
      address: data.address ?? null,
      website: data.website ?? null,
      primary_color: data.primary_color ?? "#7C3AED",
      secondary_color: data.secondary_color ?? "#0B1120",
      accent_color: data.accent_color ?? "#F97316",
      logo_url: data.logo_url ?? null,
      template_id: data.template_id ?? null,
      watermark_config: data.watermark_config ?? null,
      logo_placement: data.logo_placement ?? "top-right",
      is_default: data.is_default ?? false,
      is_active: true,
    })
    .select("*")
    .maybeSingle();

  if (error) return { profile: null, error: error.message };
  return { profile: created as DbBrandProfile, error: null };
}

export async function updateBrandProfile(
  id: string,
  userId: string,
  data: Partial<{
    name: string;
    tagline: string;
    description: string;
    phone: string;
    whatsapp: string;
    email: string;
    address: string;
    website: string;
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    logo_url: string | null;
    template_id: string | null;
    watermark_config: PdfWatermarkConfig | null;
    logo_placement: string;
    is_default: boolean;
  }>,
): Promise<{ error: string | null }> {
  // If setting as default, clear other defaults
  if (data.is_default) {
    await supabase
      .from("brand_profiles")
      .update({ is_default: false })
      .eq("user_id", userId)
      .eq("is_default", true)
      .neq("id", id);
  }

  const { error } = await supabase
    .from("brand_profiles")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);

  return { error: error ? error.message : null };
}

export async function deleteBrandProfile(
  id: string,
  userId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("brand_profiles")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  return { error: error ? error.message : null };
}

// ───────────────────────────────────────────────────────
// PDF Templates
// ───────────────────────────────────────────────────────

export async function fetchPdfTemplates(
  includeInactive = false,
): Promise<DbPdfBrandingTemplate[]> {
  let query = supabase.from("pdf_branding_templates").select("*");
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query.order("sort_order").order("created_at");
  if (error) return [];
  return (data ?? []) as DbPdfBrandingTemplate[];
}

export async function fetchDefaultTemplate(): Promise<DbPdfBrandingTemplate | null> {
  const { data } = await supabase
    .from("pdf_branding_templates")
    .select("*")
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle();
  return (data as DbPdfBrandingTemplate) ?? null;
}

export async function fetchTemplate(
  id: string,
): Promise<DbPdfBrandingTemplate | null> {
  const { data } = await supabase
    .from("pdf_branding_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as DbPdfBrandingTemplate) ?? null;
}

// Admin CRUD for templates
export async function createPdfTemplate(data: {
  name: string;
  description?: string;
  template_config: PdfTemplateConfig;
  watermark_config?: PdfWatermarkConfig | null;
  is_premium?: boolean;
  is_active?: boolean;
  is_default?: boolean;
  rewarded_unlock_enabled?: boolean;
  sort_order?: number;
}): Promise<{ template: DbPdfBrandingTemplate | null; error: string | null }> {
  if (data.is_default) {
    await supabase
      .from("pdf_branding_templates")
      .update({ is_default: false })
      .eq("is_default", true);
  }

  const { data: created, error } = await supabase
    .from("pdf_branding_templates")
    .insert({
      name: data.name,
      description: data.description ?? null,
      template_config: data.template_config,
      watermark_config: data.watermark_config ?? null,
      is_premium: data.is_premium ?? false,
      is_system: false,
      is_active: data.is_active ?? true,
      is_default: data.is_default ?? false,
      rewarded_unlock_enabled: data.rewarded_unlock_enabled ?? false,
      sort_order: data.sort_order ?? 0,
    })
    .select("*")
    .maybeSingle();

  if (error) return { template: null, error: error.message };
  return { template: created as DbPdfBrandingTemplate, error: null };
}

export async function updatePdfTemplate(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    template_config: PdfTemplateConfig;
    watermark_config: PdfWatermarkConfig | null;
    is_premium: boolean;
    is_active: boolean;
    is_default: boolean;
    rewarded_unlock_enabled: boolean;
    sort_order: number;
  }>,
): Promise<{ error: string | null }> {
  if (data.is_default) {
    await supabase
      .from("pdf_branding_templates")
      .update({ is_default: false })
      .eq("is_default", true)
      .neq("id", id);
  }

  const { error } = await supabase
    .from("pdf_branding_templates")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id);
  return { error: error ? error.message : null };
}

export async function deletePdfTemplate(
  id: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("pdf_branding_templates")
    .delete()
    .eq("id", id)
    .eq("is_system", false);
  return { error: error ? error.message : null };
}

// ───────────────────────────────────────────────────────
// Rewarded-ad unlock consumption
// ───────────────────────────────────────────────────────

export async function consumePdfExportUnlock(
  unlockId: string,
): Promise<{ error: string | null }> {
  const sb = await getSupabase();
  const { error } = await sb
    .from("pdf_export_unlocks")
    .update({ is_consumed: true, consumed_at: new Date().toISOString() })
    .eq("id", unlockId)
    .eq("is_consumed", false);
  return { error: error ? error.message : null };
}

export async function checkActivePdfUnlock(
  userId: string | null,
  clientHash?: string,
): Promise<DbPdfExportUnlock | null> {
  if (!userId && !clientHash) return null;
  let query = supabase
    .from("pdf_export_unlocks")
    .select("*")
    .eq("tool_key", "brand_studio_pdf")
    .eq("is_consumed", false)
    .gt("expires_at", new Date().toISOString())
    .order("unlocked_at", { ascending: false })
    .limit(1);

  if (userId) {
    query = query.eq("user_id", userId);
  } else if (clientHash) {
    query = query.eq("client_hash", clientHash);
  }

  const { data } = await query.maybeSingle();
  return (data as DbPdfExportUnlock) ?? null;
}

// ───────────────────────────────────────────────────────
// AI Logo generation records
// ───────────────────────────────────────────────────────

export async function fetchAiLogos(
  userId: string,
): Promise<DbAiLogoGeneration[]> {
  const { data, error } = await supabase
    .from("ai_logo_generations")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return [];
  return (data ?? []) as DbAiLogoGeneration[];
}

export async function saveAiLogoRecord(data: {
  user_id: string;
  brand_profile_id?: string | null;
  prompt: string;
  industry?: string;
  style?: string;
  color_prefs?: string;
  image_url: string;
}): Promise<{ id: string | null; error: string | null }> {
  const { data: created, error } = await supabase
    .from("ai_logo_generations")
    .insert({
      user_id: data.user_id,
      brand_profile_id: data.brand_profile_id ?? null,
      prompt: data.prompt,
      industry: data.industry ?? null,
      style: data.style ?? null,
      color_prefs: data.color_prefs ?? null,
      image_url: data.image_url,
      is_selected: false,
    })
    .select("id")
    .maybeSingle();

  if (error) return { id: null, error: error.message };
  return { id: created?.id ?? null, error: null };
}

export async function selectAiLogo(
  id: string,
  userId: string,
): Promise<{ error: string | null }> {
  // Deselect all others for this user
  await supabase
    .from("ai_logo_generations")
    .update({ is_selected: false })
    .eq("user_id", userId);
  // Select the chosen one
  const { error } = await supabase
    .from("ai_logo_generations")
    .update({ is_selected: true })
    .eq("id", id)
    .eq("user_id", userId);
  return { error: error ? error.message : null };
}

export async function deleteAiLogo(
  id: string,
  userId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("ai_logo_generations")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  return { error: error ? error.message : null };
}

// ───────────────────────────────────────────────────────
// Logo upload to Supabase storage
// ───────────────────────────────────────────────────────

export async function uploadBrandLogo(
  file: File | Blob,
  userId: string,
  contentType = "image/png",
): Promise<{ url: string | null; error: string | null }> {
  const ext = contentType === "image/jpeg" ? "jpg" : "png";
  const path = `${userId}/logo_${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("brand-assets")
    .upload(path, file, { contentType });

  if (uploadError) {
    return { url: null, error: uploadError.message };
  }

  const { data } = supabase.storage.from("brand-assets").getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}
