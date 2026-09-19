// Database row types, mirror the Supabase schema. Keep these in sync with migrations.

export interface DbProfile {
  id: string;
  email: string;
  role: "admin" | "user";
  account_type: "client" | "pro_worker";
  full_name: string;
  phone: string;
  avatar_url: string;
  marketplace_id: string;
  onboarding_completed: boolean;
  onboarding_goals: string[];
  onboarding_state: string | null;
  created_at: string;
  updated_at: string;
}

/** A single word highlight rule for the hero headline. */
export interface HeroWordHighlight {
  /** 0-based word index in the headline */
  wordIndex: number;
  /** The word text (for verification / display) */
  word: string;
  /** CSS color to apply (hex or named) */
  color: string;
}

/** Configuration for hero headline word coloring. Stored in site_branding.hero_highlight_config (JSONB). */
export interface HeroHighlightConfig {
  highlights: HeroWordHighlight[];
}

export interface DbSiteBranding {
  id: string;
  website_name: string;
  website_tagline: string;
  browser_title: string;
  light_logo_url: string | null;
  dark_logo_url: string | null;
  favicon_url: string | null;
  pwa_icon_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  /** JSON: which words in the hero headline get a custom color. */
  hero_highlight_config: HeroHighlightConfig | null;
  hero_image_url: string | null;
  /** Alt text for the hero image, displayed as caption overlay. */
  hero_image_alt: string | null;
  /** Label shown on the floating swatch card. */
  hero_image_label: string | null;
  /** Swatch colors for the floating palette card. */
  hero_swatch_colors: string[] | null;
  /** Name shown below the swatch colors. */
  hero_swatch_name: string | null;
  /** Label for the floating estimate chip. */
  hero_chip_label: string | null;
  /** Main value for the floating estimate chip. */
  hero_chip_value: string | null;
  /** Subtext for the floating estimate chip. */
  hero_chip_subtext: string | null;
  /** Label for the floating badge. */
  hero_badge_label: string | null;
  /** Value for the floating badge. */
  hero_badge_value: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type AiAccessMode =
  "free" | "rewarded" | "paid" | "free_rewarded" | "disabled";

// Typography configuration stored in site_settings.typography_config (JSONB)
export interface TypographyConfig {
  body: string;
  headings: string;
  navigation: string;
  buttons: string;
  calculatorTitles: string;
  calculatorResults: string;
  admin: string;
}

export interface DbSiteSettings {
  id: string;
  site_name: string;
  short_name: string;
  tagline: string;
  description: string;
  logo_url: string | null;
  contact_email: string;
  whatsapp_number: string;
  default_currency: string;
  default_currency_symbol: string;
  default_unit: "meters" | "feet";
  maintenance_mode: boolean;
  seo_title: string | null;
  seo_description: string | null;
  // AI access control
  ai_enabled: boolean;
  ai_access_mode: AiAccessMode;
  ai_daily_free_uses: number;
  ai_rewarded_enabled: boolean;
  ai_paid_enabled: boolean;
  ai_paid_price: number;
  ai_paid_currency: string;
  ai_reset_period: string;
  ai_admin_override: boolean;
  // Payment provider status (Issue #4 fix)
  payment_provider_configured: boolean;
  // Ads
  ads_enabled: boolean;
  adsense_publisher_id: string | null;
  ad_slots: Record<string, string>;
  // Analytics (Issue #5 fix: read from DB for admin-configurable analytics)
  ga_measurement_id: string | null;
  meta_pixel_id: string | null;
  // Typography
  typography_config: TypographyConfig;
  // Homepage hero content (CMS-managed, Phase 35)
  hero_headline: string | null;
  hero_subheadline: string | null;
  hero_cta_primary_label: string | null;
  hero_cta_primary_href: string | null;
  hero_cta_secondary_label: string | null;
  hero_cta_secondary_href: string | null;
  // Premium Image Estimation (Phase 31)
  estimation_enabled: boolean;
  estimation_access_mode: string;
  estimation_daily_free_uses: number;
  estimation_rewarded_enabled: boolean;
  estimation_paid_enabled: boolean;
  estimation_paid_price: number;
  estimation_paid_currency: string;
  estimation_reset_period: string;
  estimation_admin_override: boolean;
  premium_subscriptions_enabled: boolean;
  // Manual paint price entry (Cost Estimator), admin-configurable bucket
  // sizes so users enter a price per bucket (e.g. 20L, 4L) instead of per liter.
  manual_paint_bucket_sizes: number[];
  updated_at: string;
}

export interface DbPaintType {
  id: string;
  name: string;
  description: string | null;
  coverage_rate: number;
  coverage_unit: string;
  container_sizes: number[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DbPaintProduct {
  id: string;
  name: string;
  brand: string | null;
  paint_type_id: string | null;
  container_size: number;
  price: number;
  currency: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DbMaterialPrice {
  id: string;
  name: string;
  category:
    | "primer"
    | "filler"
    | "putty"
    | "sandpaper"
    | "brushes"
    | "rollers"
    | "other";
  unit: string;
  price: number;
  currency: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DbLaborRate {
  id: string;
  name: string;
  rate_per_sqm: number;
  currency: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DbColorCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: "room" | "style" | "surface" | "collection" | "seasonal";
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DbColorCombination {
  id: string;
  title: string;
  slug: string;
  description: string;
  main_color_name: string;
  main_color_code: string;
  secondary_color_name: string;
  secondary_color_code: string;
  accent_color_name: string;
  accent_color_code: string;
  trim_color_name: string | null;
  trim_color_code: string | null;
  ceiling_color_name: string | null;
  ceiling_color_code: string | null;
  door_color_name: string | null;
  door_color_code: string | null;
  recommended_rooms: string[];
  style: string;
  image_url: string;
  category_ids: string[];
  is_published: boolean;
  sort_order: number;
  is_interior: boolean;
  is_featured: boolean;
  is_trending: boolean;
  popularity_score: number;
  property_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbLegalPage {
  id: string;
  title: string;
  slug: string;
  content: string;
  is_published: boolean;
  updated_at: string;
  created_at: string;
}

export interface DbAnalyticsEvent {
  id: string;
  event: string;
  params: Record<string, unknown> | null;
  page_path: string | null;
  created_at: string;
}

export interface DbAiUsageDaily {
  id: string;
  client_hash: string | null;
  user_id: string | null;
  usage_date: string;
  uses_consumed: number;
  last_used_at: string | null;
  created_at: string;
}

export interface DbUserPaidStatus {
  user_id: string;
  is_paid: boolean;
  plan: string | null;
  paid_until: string | null;
  payment_provider: string | null;
  provider_customer_id: string | null;
  updated_at: string;
}

export interface DbScreedingMaterial {
  id: string;
  name: string;
  description: string | null;
  coverage_rate: number;
  coverage_unit: string;
  package_size: number;
  package_unit: string;
  unit_price: number;
  recommended_thickness_mm: number | null;
  labour_rate_per_sqm: number;
  currency: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DbColorFamily {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DbPaintColor {
  id: string;
  name: string;
  slug: string;
  hex_code: string;
  rgb_r: number;
  rgb_g: number;
  rgb_b: number;
  hsl_h: number;
  hsl_s: number;
  hsl_l: number;
  color_family_id: string | null;
  category_id: string | null;
  recommended_usage: string[];
  finish_compatibility: string[];
  is_interior: boolean;
  is_exterior: boolean;
  popularity_score: number;
  is_featured: boolean;
  is_trending: boolean;
  display_order: number;
  is_active: boolean;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbUserFavorite {
  id: string;
  user_id: string;
  item_type: "color" | "palette";
  color_id: string | null;
  palette_id: string | null;
  created_at: string;
}

export interface DbUserProject {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  project_type:
    | "screeding"
    | "paint_calc"
    | "cost_estimate"
    | "ai_recommendation"
    | "custom"
    | "pop_ceiling"
    | "pop_estimate"
    | "tile"
    | "tile_estimate";
  project_data: Record<string, unknown>;
  /** Canonical FRELUX location record (location-intelligence); null = not set. */
  location: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface DbUserCollection {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbUserCollectionItem {
  id: string;
  collection_id: string;
  color_id: string;
  created_at: string;
}

export interface DbRecentlyViewedColor {
  id: string;
  user_id: string;
  color_id: string;
  viewed_at: string;
  is_pinned: boolean;
}

export type ColorRelationshipType =
  | "similar"
  | "complementary"
  | "analogous"
  | "triadic"
  | "lighter"
  | "darker"
  | "matching_trim"
  | "matching_ceiling"
  | "coordinated_accent";

export interface DbColorRelationshipOverride {
  id: string;
  color_id: string;
  relationship_type: ColorRelationshipType;
  override_color_ids: string[];
  updated_at: string;
}

export type ShareableResourceType =
  "project" | "paint_estimate" | "cost_estimate" | "palette";

export interface DbShareableLink {
  id: string;
  resource_type: ShareableResourceType;
  resource_id: string;
  user_id: string;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

export interface DbMediaFolder {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  created_at: string;
}

export interface DbMediaItem {
  id: string;
  folder_id: string | null;
  file_name: string;
  storage_path: string;
  public_url: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  uploaded_by: string | null;
  created_at: string;
}

// =========================================================
// AI Developer Studio types
// =========================================================

export type StudioToolType =
  | "chat"
  | "page_builder"
  | "crud_generator"
  | "db_designer"
  | "api_builder"
  | "dashboard_builder"
  | "form_builder"
  | "workflow_builder"
  | "feature_generator"
  | "component_generator"
  | "code_generator"
  | "bug_detection"
  | "refactoring"
  | "test_generator"
  | "docs_generator"
  | "deploy_assistant"
  | "plugin_manager"
  | "project_explorer"
  | "file_manager"
  | "version_history"
  | "prompt_library"
  | "integration_center"
  | "role_management"
  | "feature_management"
  | "system_monitoring";

export type SessionStatus = "active" | "archived" | "completed";
export type ArtifactStatus =
  "draft" | "review" | "approved" | "deployed" | "rejected";
export type PluginStatus =
  "available" | "installed" | "enabled" | "disabled" | "error";
export type IntegrationStatus =
  "connected" | "disconnected" | "error" | "pending";

export interface DbStudioSession {
  id: string;
  user_id: string;
  tool_type: StudioToolType;
  title: string;
  status: SessionStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DbStudioArtifact {
  id: string;
  session_id: string | null;
  user_id: string;
  artifact_type: string;
  title: string;
  description: string | null;
  content: string;
  language: string;
  status: ArtifactStatus;
  version_number: number;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DbStudioVersion {
  id: string;
  artifact_id: string;
  version_number: number;
  content: string;
  change_summary: string | null;
  created_by: string;
  created_at: string;
}

export interface DbStudioPrompt {
  id: string;
  title: string;
  category: string;
  description: string | null;
  system_prompt: string;
  user_prompt_template: string;
  example_output: string | null;
  tool_type: StudioToolType | null;
  is_builtin: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DbStudioPlugin {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  version: string;
  author: string | null;
  status: PluginStatus;
  config: Record<string, unknown>;
  dependencies: string[];
  is_official: boolean;
  installed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbStudioIntegration {
  id: string;
  name: string;
  service_type: string;
  status: IntegrationStatus;
  config: Record<string, unknown>;
  health_status: string;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbStudioFeature {
  id: string;
  feature_key: string;
  label: string;
  description: string | null;
  is_enabled: boolean;
  rollout_percentage: number;
  targeting_rules: Record<string, unknown>;
  category: string;
  created_at: string;
  updated_at: string;
}

export interface DbStudioMetric {
  id: string;
  metric_name: string;
  metric_value: number;
  unit: string | null;
  category: string;
  labels: Record<string, unknown>;
  recorded_at: string;
}

export interface DbStudioRole {
  id: string;
  role_name: string;
  description: string | null;
  permissions: string[];
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbStudioChat {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// =========================================================
// Learn Section types
// =========================================================

export type LearnArticleStatus = "draft" | "published" | "archived";

export interface DbLearnCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string;
  sort_order: number;
  is_active: boolean;
  parent_slug: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbLearnArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  category_slug: string;
  cover_image_url: string | null;
  author: string | null;
  read_time_minutes: number | null;
  status: LearnArticleStatus;
  is_featured: boolean;
  meta_title: string | null;
  meta_description: string | null;
  meta_keywords: string | null;
  published_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// =========================================================
// POP Ceiling & Tile Module types
// =========================================================

export type PopWorkflowType = "nigeria" | "international";
export type PopMaterialCategory =
  | "primary"
  | "finishing"
  | "decorative"
  | "framework"
  | "ceiling_boards"
  | "fasteners"
  | "labour";
export type TileMaterialCategory =
  | "tile"
  | "adhesive"
  | "grout"
  | "spacer"
  | "cement"
  | "sand"
  | "labour"
  | "other";

export interface DbPopMaterial {
  id: string;
  workflow: PopWorkflowType;
  category: PopMaterialCategory;
  name: string;
  description: string | null;
  unit: string;
  coverage_rate: number;
  coverage_unit: string;
  package_size: number;
  package_unit: string;
  unit_price: number;
  labour_rate_per_sqm: number;
  is_optional: boolean;
  currency: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DbPopWorkflow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  workflow_type: PopWorkflowType;
  included_categories: string[];
  default_waste_percentage: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DbTileSize {
  id: string;
  name: string;
  width_mm: number;
  height_mm: number;
  tiles_per_box: number;
  is_standard: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DbTileMaterial {
  id: string;
  category: TileMaterialCategory;
  name: string;
  description: string | null;
  unit: string;
  coverage_rate: number;
  coverage_unit: string;
  package_size: number;
  package_unit: string;
  unit_price: number;
  labour_rate_per_sqm: number;
  currency: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DbLearnArticleFaq {
  id: string;
  article_id: string;
  question: string;
  answer: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbLearnArticleVersion {
  id: string;
  article_id: string;
  version_number: number;
  title: string;
  content: string;
  excerpt: string | null;
  change_summary: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DbAiLearnChat {
  id: string;
  session_id: string;
  user_id: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// =========================================================
// Screeding Mix Configuration & Rewarded Access
// =========================================================

export interface DbScreedingMixConfig {
  id: string;
  paint_coverage_rate_m2_per_l: number;
  paint_bucket_size_l: number;
  paint_price_per_bucket: number;
  cement_consumption_ratio_kg_per_l: number;
  cement_bag_size_kg: number;
  cement_price_per_bag: number;
  default_mix_ratio: string;
  labour_rate_per_sqm: number;
  waste_percentage: number;
  tax_vat_percentage: number;
  currency: string;
  currency_symbol: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbRewardedToolConfig {
  id: string;
  tool_key: string;
  tool_label: string;
  description: string | null;
  is_enabled: boolean;
  ad_provider: string;
  ad_unit_id: string | null;
  unlock_duration_hours: number;
  primary_provider_id: string | null;
  fallback_provider_id: string | null;
  daily_usage_limit: number;
  cooldown_minutes: number;
  reward_rules: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DbRewardedUnlockLog {
  id: string;
  tool_key: string;
  user_id: string | null;
  client_hash: string | null;
  unlock_date: string;
  unlocked_at: string;
  expires_at: string;
  ad_provider: string | null;
  ad_revenue_estimated: number;
  created_at: string;
}

export interface DbRewardedAdEvent {
  id: string;
  tool_key: string;
  event_type: "impression" | "click" | "reward" | "close" | "error";
  user_id: string | null;
  client_hash: string | null;
  ad_provider: string | null;
  revenue_estimated: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DbAdvancedEstimate {
  id: string;
  user_id: string | null;
  client_hash: string | null;
  tool_key: string;
  title: string;
  project_type: string | null;
  estimate_data: Record<string, unknown>;
  total_cost: number | null;
  currency: string;
  is_saved: boolean;
  created_at: string;
  updated_at: string;
}

// =========================================================
// Ad Management System Types
// =========================================================

export type AdProviderType =
  "display" | "rewarded" | "interstitial" | "native" | "mixed";

export interface DbAdProvider {
  id: string;
  name: string;
  slug: string;
  provider_type: AdProviderType;
  is_active: boolean;
  priority: number;
  credentials: Record<string, string>;
  settings: Record<string, unknown>;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export type AdPlacementType =
  "banner" | "native" | "rewarded" | "interstitial" | "in_article";
export type AdPageTarget =
  | "home"
  | "calculator"
  | "learn"
  | "color_detail"
  | "gallery"
  | "ai"
  | "marketplace"
  | "sidebar"
  | "global";

export interface AdDisplayRules {
  mobile: boolean;
  desktop: boolean;
  refresh_seconds: number;
  min_height: number;
}

export interface DbAdPlacement {
  id: string;
  placement_key: string;
  placement_name: string;
  placement_type: AdPlacementType;
  page_target: AdPageTarget;
  is_active: boolean;
  provider_ids: string[];
  ad_unit_ids: Record<string, string>;
  display_rules: AdDisplayRules;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type AdEventType =
  | "impression"
  | "click"
  | "reward"
  | "close"
  | "error"
  | "complete"
  | "dismiss"
  | "request"
  | "fill";

export interface DbAdAnalyticsEvent {
  id: string;
  event_type: AdEventType;
  provider_id: string | null;
  placement_key: string | null;
  tool_key: string | null;
  user_id: string | null;
  client_hash: string | null;
  revenue_estimated: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DbRewardedFeatureConfig {
  id: string;
  feature_key: string;
  feature_name: string;
  description: string | null;
  is_enabled: boolean;
  primary_provider_id: string | null;
  fallback_provider_id: string | null;
  unlock_duration_minutes: number;
  daily_usage_limit: number;
  cooldown_minutes: number;
  reward_rules: {
    reward_type?: string;
    reward_amount?: number;
    success_message?: string;
    failure_message?: string;
  };
  // Issue #9 fix: configurable revenue estimate per unlock
  revenue_per_unlock: number;
  created_at: string;
  updated_at: string;
}

export interface AdProviderSchema {
  slug: string;
  name: string;
  provider_type: AdProviderType;
  credential_fields: {
    key: string;
    label: string;
    type: "text" | "password";
    required: boolean;
    placeholder?: string;
  }[];
  setting_fields: {
    key: string;
    label: string;
    type: "text" | "number" | "boolean";
    default?: string | number | boolean;
    required?: boolean;
    placeholder?: string;
  }[];
  icon: string;
}

export interface AdProviderSummary {
  id: string;
  name: string;
  slug: string;
  provider_type: AdProviderType;
  is_active: boolean;
  priority: number;
  is_system: boolean;
}

// =========================================================
// Labour Settings System Types
// =========================================================

export type LabourPricingMethod =
  "fixed" | "per_sqm" | "per_room" | "daily" | "custom";
export type LabourEstimatorKey =
  "global" | "paint" | "screeding" | "pop_ceiling" | "tile";

export interface DbLabourSettings {
  id: string;
  estimator_key: LabourEstimatorKey;
  is_enabled: boolean;
  default_pricing_method: LabourPricingMethod;
  suggested_rates: {
    fixed: number;
    per_sqm: number;
    per_room: number;
    daily: number;
  };
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DbLabourCategory {
  id: string;
  estimator_key: LabourEstimatorKey;
  category_name: string;
  description: string | null;
  suggested_rate: number;
  rate_unit: LabourPricingMethod;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// =========================================================
// Calculator Templates
// =========================================================

export type TemplateType = "paint" | "screeding" | "pop_ceiling" | "tile";

export interface DbStudioTemplate {
  id: string;
  user_id: string | null;
  template_type: TemplateType;
  name: string;
  description: string | null;
  calculator_data: Record<string, unknown>;
  is_builtin: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// =========================================================
// Phase 5: Professional Contractor Experience
// =========================================================

export type ProjectType =
  "painting" | "screeding" | "pop_ceiling" | "tiling" | "multi_trade";
export type BuildingType =
  "residential" | "commercial" | "industrial" | "institutional" | "renovation";
export type SurfaceLocation = "interior" | "exterior" | "both";
export type ConstructionType = "new_construction" | "renovation" | "touch_up";
export type FinishQuality = "economy" | "standard" | "premium" | "luxury";
export type BudgetLevel = "economy" | "standard" | "premium" | "luxury";
export type MaterialQuality = "economy" | "standard" | "premium" | "luxury";
export type ProjectStatus =
  "draft" | "in_progress" | "on_hold" | "completed" | "archived";
export type RoomType =
  | "living_room"
  | "bedroom"
  | "kitchen"
  | "bathroom"
  | "balcony"
  | "hallway"
  | "staircase"
  | "office"
  | "dining"
  | "custom";
export type SurfaceCondition =
  "excellent" | "good" | "fair" | "poor" | "damaged";
export type SurfaceType =
  | "fresh_plaster"
  | "old_paint"
  | "peeling_paint"
  | "moisture"
  | "cracks"
  | "mould"
  | "concrete"
  | "wood"
  | "metal";
export type WallSmoothness =
  "smooth" | "slightly_rough" | "rough" | "very_rough";
export type Porosity = "low" | "medium" | "high" | "very_high";
export type RoomCalcType = "paint" | "screeding" | "pop_ceiling" | "tiling";
export type ShoppingCategory =
  | "paint"
  | "primer"
  | "white_cement"
  | "screeding_paint"
  | "pop_cement"
  | "soap"
  | "fibre"
  | "boards"
  | "tiles"
  | "tile_adhesive"
  | "grout"
  | "masking_tape"
  | "brushes"
  | "rollers"
  | "sandpaper"
  | "extension_pole"
  | "ladders"
  | "scaffolding"
  | "ppe"
  | "accessories"
  | "labour"
  | "transport"
  | "misc";
export type LabourRole =
  | "painter"
  | "pop_installer"
  | "wall_screeder"
  | "tile_installer"
  | "labourer"
  | "foreman"
  | "electrician"
  | "plumber"
  | "carpenter"
  | "supervisor";
export type QuotationStatus =
  "draft" | "sent" | "accepted" | "rejected" | "expired" | "revised";
export type TimelinePhase =
  | "preparation"
  | "screeding"
  | "pop_installation"
  | "primer"
  | "painting"
  | "tiling"
  | "drying"
  | "inspection"
  | "completion"
  | "touch_up"
  | "cleanup";
export type MaterialCatalogCategory =
  | "paint"
  | "primer"
  | "white_cement"
  | "screeding_paint"
  | "pop_cement"
  | "soap"
  | "fibre"
  | "boards"
  | "tiles"
  | "tile_adhesive"
  | "grout"
  | "masking_tape"
  | "brushes"
  | "rollers"
  | "sandpaper"
  | "extension_pole"
  | "ladders"
  | "scaffolding"
  | "ppe"
  | "accessories";
export type DurabilityRating = "low" | "medium" | "high" | "premium";

export interface DbContractorProject {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  project_type: ProjectType;
  building_type: BuildingType;
  surface_location: SurfaceLocation;
  construction_type: ConstructionType;
  finish_quality: FinishQuality;
  budget_level: BudgetLevel;
  material_quality: MaterialQuality;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  client_address: string | null;
  status: ProjectStatus;
  progress_percentage: number;
  notes: string | null;
  tags: string[];
  total_material_cost: number;
  total_labour_cost: number;
  total_transport_cost: number;
  total_misc_cost: number;
  total_markup: number;
  total_profit: number;
  total_project_cost: number;
  estimated_duration_days: number | null;
  currency: string;
  currency_symbol: string;
  /** Canonical FRELUX location record (location-intelligence); null = not set. */
  location: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface DbProjectRoom {
  id: string;
  project_id: string;
  name: string;
  room_type: RoomType;
  sort_order: number;
  length_m: number | null;
  width_m: number | null;
  height_m: number | null;
  unit: "meters" | "feet";
  surface_condition: SurfaceCondition;
  surface_type: SurfaceType;
  wall_smoothness: WallSmoothness;
  porosity: Porosity;
  waste_factor_percentage: number;
  calculation_type: RoomCalcType;
  calculation_input: Record<string, unknown>;
  calculation_result: Record<string, unknown>;
  material_cost: number;
  labour_cost: number;
  room_total_cost: number;
  surface_prep: SurfacePrepStep[];
  created_at: string;
  updated_at: string;
}

export interface SurfacePrepStep {
  action: string;
  reason: string;
  product?: string;
  priority: "required" | "recommended" | "optional";
}

export interface DbProjectShoppingItem {
  id: string;
  project_id: string;
  category: ShoppingCategory;
  name: string;
  quantity: number;
  unit: string;
  estimated_price: number;
  total_price: number;
  notes: string | null;
  is_purchased: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DbProjectLabourPlan {
  id: string;
  project_id: string;
  role: LabourRole;
  worker_count: number;
  days_required: number;
  daily_wage: number;
  total_cost: number;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DbProjectQuotation {
  id: string;
  project_id: string;
  quotation_number: string;
  version: number;
  material_cost: number;
  labour_cost: number;
  transport_cost: number;
  misc_cost: number;
  markup_percentage: number;
  markup_amount: number;
  profit_percentage: number;
  profit_amount: number;
  tax_percentage: number;
  tax_amount: number;
  grand_total: number;
  terms_conditions: string | null;
  timeline_days: number | null;
  validity_days: number;
  payment_terms: string | null;
  company_name: string | null;
  company_logo_url: string | null;
  company_address: string | null;
  company_phone: string | null;
  company_email: string | null;
  status: QuotationStatus;
  signed_by: string | null;
  signed_at: string | null;
  signature_data: string | null;
  currency: string;
  currency_symbol: string;
  created_at: string;
  updated_at: string;
}

export interface DbProjectTimeline {
  id: string;
  project_id: string;
  phase: TimelinePhase;
  name: string;
  description: string | null;
  days_required: number;
  start_day: number;
  end_day: number;
  is_completed: boolean;
  completed_at: string | null;
  sort_order: number;
  depends_on: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbProjectAttachment {
  id: string;
  project_id: string;
  file_name: string;
  storage_path: string;
  public_url: string;
  mime_type: string;
  file_size: number;
  description: string | null;
  uploaded_by: string;
  created_at: string;
}

export interface DbProjectVersion {
  id: string;
  project_id: string;
  version_number: number;
  snapshot: Record<string, unknown>;
  change_summary: string | null;
  created_by: string;
  created_at: string;
}

export interface DbMaterialCatalog {
  id: string;
  category: MaterialCatalogCategory;
  name: string;
  brand: string | null;
  description: string | null;
  coverage_rate: number | null;
  coverage_unit: string | null;
  package_size: number | null;
  package_unit: string | null;
  economy_price: number;
  standard_price: number;
  premium_price: number;
  luxury_price: number;
  regional_prices: Record<string, number>;
  recommended_usage: string[];
  durability_rating: DurabilityRating | null;
  lifespan_years: number | null;
  finish_type: string | null;
  maintenance_frequency: string | null;
  quality_tier: FinishQuality;
  is_available: boolean;
  region: string | null;
  currency: string;
  is_active: boolean;
  sort_order: number;
}

// =========================================================
// Finish Types (Painting, Tyrolene, Grafitex)
// =========================================================

export interface DbFinishType {
  id: string;
  name: string;
  slug: string; // 'painting', 'tyrolene', 'grafitex'
  description: string | null;
  coverage_rate: number; // m² per unit per coat
  coverage_unit: string; // 'L' for painting, 'kg' for tyrolene/grafitex
  default_coats: number; // recommended number of coats
  package_size: number; // size of one package
  package_unit: string; // 'L' or 'kg'
  unit_price: number; // price per package
  labour_rate_per_sqm: number;
  is_base: boolean; // true for base coat materials
  is_finishing: boolean; // true for finishing/top coat materials
  is_active: boolean;
  sort_order: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface DbTimelineTemplate {
  id: string;
  name: string;
  project_type: ProjectType;
  description: string | null;
  phases: TimelineTemplatePhase[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TimelineTemplatePhase {
  phase: TimelinePhase;
  name: string;
  days: number;
  depends_on: string | null;
}

export interface DbQuotationSettings {
  id: string;
  company_name: string | null;
  company_logo_url: string | null;
  company_address: string | null;
  company_phone: string | null;
  company_email: string | null;
  default_terms_conditions: string;
  default_payment_terms: string;
  default_validity_days: number;
  default_markup_percentage: number;
  default_profit_percentage: number;
  default_tax_percentage: number;
  currency: string;
  currency_symbol: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbWeatherCache {
  id: string;
  location: string;
  forecast_data: Record<string, unknown>;
  cached_at: string;
  expires_at: string;
}

// =========================================================
// Calculator Templates
// =========================================================
export type CalculatorType =
  "paint" | "tile" | "pop" | "screeding" | "build_to_roof";
export type TemplateVisibility = "private" | "public" | "unlisted";

export interface DbCalculatorTemplate {
  id: string;
  user_id: string | null;
  calculator_type: CalculatorType;
  name: string;
  description: string | null;
  input_data: Record<string, unknown>;
  schema_version: number;
  visibility: TemplateVisibility;
  is_favorite: boolean;
  is_featured: boolean;
  is_published: boolean;
  display_order: number;
  slug: string | null;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateCreateInput {
  calculator_type: CalculatorType;
  name: string;
  description?: string;
  input_data: Record<string, unknown>;
  visibility?: TemplateVisibility;
}

export interface TemplateUpdateInput {
  name?: string;
  description?: string;
  input_data?: Record<string, unknown>;
  is_favorite?: boolean;
  visibility?: TemplateVisibility;
}

// =========================================================
// Client Management (Mini CRM)
// =========================================================
export interface DbClient {
  id: string;
  user_id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  status: "active" | "inactive" | "blacklisted";
  created_at: string;
  updated_at: string;
}

export interface DbClientCommunication {
  id: string;
  client_id: string;
  user_id: string;
  type: "call" | "email" | "whatsapp" | "meeting" | "note";
  subject: string | null;
  body: string | null;
  created_at: string;
}

// =========================================================
// Project Folders
// =========================================================
export interface DbProjectFolder {
  id: string;
  user_id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// =========================================================
// Integration Settings
// =========================================================
export interface DbIntegrationSetting {
  id: string;
  integration_key: string;
  display_name: string;
  category:
    | "payment"
    | "analytics"
    | "communication"
    | "maps"
    | "storage"
    | "advertising";
  is_enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// =========================================================
// Estimate History
// =========================================================
export interface DbEstimateHistory {
  id: string;
  user_id: string | null;
  calculator_type: CalculatorType;
  project_name: string | null;
  total_cost: number | null;
  material_cost: number | null;
  labour_cost: number | null;
  currency: string;
  input_data: Record<string, unknown>;
  result_data: Record<string, unknown>;
  created_at: string;
}

// Push notification subscriptions
export interface DbPushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh_key: string | null;
  auth_key: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Phase 56: Project Intelligence Types
// ============================================================

// Project calculations, structured calc results linked to projects
export interface DbProjectCalculation {
  id: string;
  project_id: string;
  user_id: string;
  calculator_type:
    | "paint"
    | "screeding"
    | "pop_ceiling"
    | "tile"
    | "finish"
    | "tyrolene"
    | "cost"
    | "build_to_roof"
    | "structural"
    | "foundation";
  calculator_slug: string;
  calc_title: string;
  calc_data: object;
  result_summary: Record<string, unknown>;
  materials: Array<{
    name: string;
    category: string;
    quantity: number;
    unit: string;
    estimated_price?: number;
  }>;
  created_at: string;
  updated_at: string;
}

// Gallery entries, Before & After showcase
export interface DbGalleryEntry {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  project_category:
    | "painting"
    | "screeding"
    | "pop_ceiling"
    | "tiling"
    | "finishing"
    | "construction";
  paint_type_used: string | null;
  paint_quality_used: string | null;
  colour_used: string | null;
  location: string | null;
  completion_date: string | null;
  is_public: boolean;
  status: "pending" | "approved" | "rejected" | "featured" | "hidden";
  is_featured: boolean;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

// Gallery images
export interface DbGalleryImage {
  id: string;
  gallery_entry_id: string;
  image_type: "before" | "after";
  image_url: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
}

// Client estimates, with approval workflow
export interface DbClientEstimate {
  id: string;
  project_id: string;
  user_id: string;
  estimate_number: string;
  title: string;
  description: string | null;
  materials_cost: number;
  labour_cost: number;
  transport_cost: number;
  misc_cost: number;
  markup_percentage: number;
  markup_amount: number;
  grand_total: number;
  currency: string;
  materials_summary: Array<{
    name: string;
    category: string;
    quantity: number;
    unit: string;
    unit_price: number;
    total: number;
  }>;
  validity_days: number;
  notes: string | null;
  terms_conditions: string | null;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  status:
    "draft" | "sent" | "viewed" | "approved" | "changes_requested" | "expired";
  share_token: string | null;
  shared_at: string | null;
  viewed_at: string | null;
  approved_at: string | null;
  changes_requested_at: string | null;
  client_feedback: string | null;
  price_snapshot: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// Paint comparisons
export interface DbPaintComparison {
  id: string;
  paint_type: string;
  display_name: string;
  description: string | null;
  finish: string | null;
  recommended_use: string | null;
  durability: string | null;
  washability: string | null;
  appearance: string | null;
  product_characteristics: string | null;
  suitable_areas: string | null;
  price_range: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Project progress stages
export interface DbProjectProgressStage {
  id: string;
  project_id: string;
  stage_key: string;
  stage_name: string;
  description: string | null;
  sort_order: number;
  is_completed: boolean;
  completed_at: string | null;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
}

// Surface assessments
export interface DbSurfaceAssessment {
  id: string;
  project_id: string | null;
  user_id: string;
  surface_condition:
    | "new_wall"
    | "previously_painted"
    | "smooth"
    | "rough"
    | "dirty"
    | "damp"
    | "cracked";
  surface_type: string | null;
  room_name: string | null;
  notes: string | null;
  recommendations: Array<{
    recommendation: string;
    priority: "high" | "medium" | "low";
  }>;
  created_at: string;
  updated_at: string;
}

// Project stage templates
export interface DbProjectStageTemplate {
  id: string;
  stage_key: string;
  stage_name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Material price history
export interface DbMaterialPriceHistory {
  id: string;
  material_id: string | null;
  material_name: string;
  category: string;
  old_price: number | null;
  new_price: number;
  unit: string | null;
  price_source: string | null;
  changed_by: string | null;
  change_reason: string | null;
  created_at: string;
}

/** Cached deterministic predictive analysis per project (§22).
 *  Owner-only under RLS; invalidated by input hash whenever any
 *  source row changes. */
export interface DbProjectPredictiveAnalysis {
  id: string;
  project_id: string;
  user_id: string;
  /** Digest of every analysis input, cache key (§22). */
  input_hash: string;
  /** The full deterministic analysis bundle. */
  result: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// =========================================================
// FRELUX Brand Studio, Phase 60 Types
// =========================================================

/** Watermark configuration for PDF templates and brand profiles. */
export interface PdfWatermarkConfig {
  enabled: boolean;
  /** 0.0–1.0 opacity for the background watermark */
  opacity: number;
  /** Scale factor relative to page width (0.1–1.0) */
  scale: number;
  position:
    "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
  diagonal: boolean;
}

/** Template layout configuration stored in pdf_branding_templates.template_config. */
export interface PdfTemplateConfig {
  headerLayout: "logo-right" | "logo-left" | "logo-center" | "text-only";
  footerLayout: "default" | "minimal" | "detailed";
  contactPlacement: "header" | "footer" | "both";
  accentBar: boolean;
  accentBarColor?: string;
}

export interface DbPdfBrandingTemplate {
  id: string;
  name: string;
  description: string | null;
  template_config: PdfTemplateConfig;
  watermark_config: PdfWatermarkConfig | null;
  is_premium: boolean;
  is_system: boolean;
  is_active: boolean;
  is_default: boolean;
  rewarded_unlock_enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type LogoPlacement =
  | "top-left"
  | "top-right"
  | "top-center"
  | "bottom-left"
  | "bottom-right"
  | "bottom-center";

export interface DbBrandProfile {
  id: string;
  user_id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  logo_url: string | null;
  template_id: string | null;
  watermark_config: PdfWatermarkConfig | null;
  logo_placement: LogoPlacement;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbAiLogoGeneration {
  id: string;
  user_id: string;
  brand_profile_id: string | null;
  prompt: string;
  industry: string | null;
  style: string | null;
  color_prefs: string | null;
  image_url: string;
  is_selected: boolean;
  created_at: string;
}

export type PdfExportUnlockType =
  "single_export" | "session" | "template_access";

export interface DbPdfExportUnlock {
  id: string;
  user_id: string | null;
  client_hash: string | null;
  tool_key: string;
  unlock_type: PdfExportUnlockType;
  template_id: string | null;
  brand_profile_id: string | null;
  unlocked_at: string;
  expires_at: string;
  is_consumed: boolean;
  consumed_at: string | null;
  ad_provider: string | null;
  created_at: string;
}

/** Extended site_settings fields for PDF branding. */
export interface PdfDefaultBrandingConfig {
  pdf_default_logo_url: string | null;
  pdf_default_brand_name: string;
  pdf_default_tagline: string;
  pdf_default_contact_email: string | null;
  pdf_default_contact_phone: string | null;
  pdf_default_address: string | null;
  pdf_default_primary_color: string;
  pdf_default_secondary_color: string;
  pdf_template_id: string | null;
  pdf_watermark_enabled: boolean;
  pdf_watermark_opacity: number;
  pdf_watermark_scale: number;
  pdf_watermark_position: string;
  pdf_watermark_diagonal: boolean;
  brand_studio_enabled: boolean;
  ai_logo_daily_limit: number;
}

// =========================================================
// Screeding Material System Configuration
// =========================================================

export interface DbScreedingSystemConfig {
  id: string;
  system_type: "putty" | "white_cement_paint";
  display_name: string;
  description: string | null;
  coverage_area_m2: number;
  coverage_unit: string;
  default_coats: number;
  waste_percentage: number;
  currency: string;
  currency_symbol: string;
  putty_name: string | null;
  putty_quantity: number | null;
  putty_unit: string | null;
  putty_price_per_unit: number | null;
  paint_name: string | null;
  paint_quantity: number | null;
  paint_unit: string | null;
  paint_price_per_unit: number | null;
  cement_name: string | null;
  cement_quantity: number | null;
  cement_unit: string | null;
  cement_price_per_unit: number | null;
  // Generic third material slot, represents Bond today, any material
  // later, without another migration. Dormant unless extra_enabled=true.
  extra_enabled?: boolean | null;
  extra_name?: string | null;
  extra_quantity?: number | null;
  extra_unit?: string | null;
  extra_price_per_unit?: number | null;
  rounding_rule: "ceil" | "none";
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DbLearnArticleInsert {
  id: string;
  article_id: string;
  insert_type:
    | "summary"
    | "key_takeaways"
    | "what_to_watch"
    | "pro_tip"
    | "stat_highlight"
    | "quote";
  title: string;
  body: string;
  position_type: "top" | "after_heading" | "bottom";
  position_heading_id: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
