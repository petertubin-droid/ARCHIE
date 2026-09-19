import type { AdProviderSchema } from "@/types/database";

/**
 * Provider Registry, defines the configuration schema for each built-in ad provider.
 * New providers can be added by admin users from the panel; those will use a generic
 * schema. Built-in providers have custom credential fields shown in the admin UI.
 */
export const BUILTIN_PROVIDERS: AdProviderSchema[] = [
  {
    slug: "google_adsense",
    name: "Google AdSense",
    provider_type: "display",
    icon: "adsense",
    credential_fields: [
      {
        key: "publisher_id",
        label: "Publisher ID (ca-pub-XXXX)",
        type: "text",
        required: true,
        placeholder: "ca-pub-1234567890123456",
      },
      {
        key: "client_id",
        label: "Client ID (optional)",
        type: "text",
        required: false,
        placeholder: "ca-pub-1234567890123456",
      },
    ],
    setting_fields: [
      { key: "auto_ads", label: "Auto Ads", type: "boolean", default: false },
      { key: "lazy_load", label: "Lazy Load", type: "boolean", default: true },
      {
        key: "anchor_ads",
        label: "Anchor Ads (sticky top/bottom)",
        type: "boolean",
        default: false,
      },
      {
        key: "vignette_ads",
        label: "Vignette Ads (full-screen between pages)",
        type: "boolean",
        default: false,
      },
      {
        key: "interstitial_ads",
        label: "Interstitial Ads (mobile web)",
        type: "boolean",
        default: false,
      },
      {
        key: "rewarded_ads",
        label: "Rewarded Ads (H5 Games adBreak)",
        type: "boolean",
        default: false,
      },
    ],
  },
  {
    slug: "google_ad_manager",
    name: "Google Ad Manager",
    provider_type: "display",
    icon: "gam",
    credential_fields: [
      {
        key: "network_code",
        label: "Network Code",
        type: "text",
        required: true,
        placeholder: "12345678",
      },
      {
        key: "ad_unit_code",
        label: "Ad Unit Code",
        type: "text",
        required: false,
        placeholder: "/12345678/home_banner",
      },
    ],
    setting_fields: [
      {
        key: "single_request",
        label: "Single Request Architecture",
        type: "boolean",
        default: false,
      },
    ],
  },
  {
    slug: "google_admob",
    name: "Google AdMob",
    provider_type: "rewarded",
    icon: "admob",
    credential_fields: [
      {
        key: "app_id",
        label: "App ID",
        type: "text",
        required: true,
        placeholder: "ca-app-pub-XXXX~XXXX",
      },
      {
        key: "ad_unit_id",
        label: "Rewarded Ad Unit ID",
        type: "text",
        required: true,
        placeholder: "ca-app-pub-XXXX/XXXX",
      },
    ],
    setting_fields: [
      { key: "test_mode", label: "Test Mode", type: "boolean", default: false },
    ],
  },
  {
    slug: "unity_ads",
    name: "Unity Ads",
    provider_type: "rewarded",
    icon: "unity",
    credential_fields: [
      {
        key: "game_id",
        label: "Game ID",
        type: "text",
        required: true,
        placeholder: "1234567",
      },
      {
        key: "placement_id",
        label: "Placement ID",
        type: "text",
        required: true,
        placeholder: "rewardedVideo",
      },
    ],
    setting_fields: [
      { key: "test_mode", label: "Test Mode", type: "boolean", default: false },
    ],
  },
  {
    slug: "applovin",
    name: "AppLovin",
    provider_type: "rewarded",
    icon: "applovin",
    credential_fields: [
      {
        key: "sdk_key",
        label: "SDK Key",
        type: "password",
        required: true,
        placeholder: "XXXX-XXXX-XXXX",
      },
      {
        key: "zone_id",
        label: "Zone ID",
        type: "text",
        required: true,
        placeholder: "rewarded_zone",
      },
    ],
    setting_fields: [
      { key: "test_mode", label: "Test Mode", type: "boolean", default: false },
    ],
  },
  {
    slug: "ironsource",
    name: "ironSource",
    provider_type: "rewarded",
    icon: "ironsource",
    credential_fields: [
      {
        key: "app_key",
        label: "App Key",
        type: "text",
        required: true,
        placeholder: "a1b2c3d4",
      },
      {
        key: "instance_id",
        label: "Instance ID",
        type: "text",
        required: true,
        placeholder: "rewarded_instance",
      },
    ],
    setting_fields: [
      { key: "test_mode", label: "Test Mode", type: "boolean", default: false },
    ],
  },
  {
    slug: "chartboost",
    name: "Chartboost",
    provider_type: "rewarded",
    icon: "chartboost",
    credential_fields: [
      {
        key: "app_id",
        label: "App ID",
        type: "text",
        required: true,
        placeholder: "1234567890",
      },
      {
        key: "app_signature",
        label: "App Signature",
        type: "password",
        required: true,
        placeholder: "XXXX-XXXX-XXXX",
      },
    ],
    setting_fields: [
      { key: "test_mode", label: "Test Mode", type: "boolean", default: false },
    ],
  },
  {
    slug: "liftoff_monetize",
    name: "Liftoff Monetize",
    provider_type: "rewarded",
    icon: "liftoff",
    credential_fields: [
      {
        key: "app_id",
        label: "App ID",
        type: "text",
        required: true,
        placeholder: "12345",
      },
      {
        key: "placement_id",
        label: "Placement ID",
        type: "text",
        required: true,
        placeholder: "rewarded_placement",
      },
    ],
    setting_fields: [
      { key: "test_mode", label: "Test Mode", type: "boolean", default: false },
    ],
  },
  // ─────────────────────────────────────────────────────────
  // Web display ad providers (work in browsers, not mobile-only)
  // ─────────────────────────────────────────────────────────
  {
    slug: "media_net",
    name: "Media.net",
    provider_type: "display",
    icon: "medianet",
    credential_fields: [
      {
        key: "cid",
        label: "Customer ID (CID)",
        type: "text",
        required: true,
        placeholder: "8CXXXXXXX",
      },
      {
        key: "crids",
        label: "CRIDs (comma-separated)",
        type: "text",
        required: false,
        placeholder: "1234567,2345678",
      },
    ],
    setting_fields: [
      { key: "async", label: "Async Loading", type: "boolean", default: true },
    ],
  },
  {
    slug: "adsterra",
    name: "Adsterra",
    provider_type: "display",
    icon: "adsterra",
    credential_fields: [
      {
        key: "key",
        label: "Ad Zone Key",
        type: "text",
        required: true,
        placeholder: "e.g. abc123def456",
      },
      {
        key: "placement_id",
        label: "Placement ID",
        type: "text",
        required: false,
        placeholder: "banner_1",
      },
      {
        key: "serve_domain",
        label: "Serve Domain",
        type: "text",
        required: false,
        placeholder: "www.highperformanceformat.com",
      },
      {
        key: "native_banner_key",
        label: "Native Banner Zone Key (or full script URL)",
        type: "text",
        required: false,
        placeholder: "32-char key, or the native.js URL from your snippet",
      },
      {
        key: "interstitial_key",
        label: "Interstitial Zone Key (or full script URL)",
        type: "text",
        required: false,
        placeholder: "32-char key, or the invoke.js URL from your snippet",
      },
      {
        key: "popunder_key",
        label: "Popunder Zone Key (or full script URL)",
        type: "text",
        required: false,
        placeholder: "32-char key, or the script URL from your snippet",
      },
      {
        key: "social_bar_key",
        label: "Social Bar Zone Key (or full script URL)",
        type: "text",
        required: false,
        placeholder: "32-char key, or the script URL from your snippet",
      },
    ],
    setting_fields: [
      { key: "format", label: "Ad Format", type: "text", default: "banner" },
    ],
  },
  {
    slug: "buysellads",
    name: "BuySellAds",
    provider_type: "display",
    icon: "buysellads",
    credential_fields: [
      {
        key: "site_key",
        label: "Site Key",
        type: "text",
        required: true,
        placeholder: "frelux",
      },
      {
        key: "zone_keys",
        label: "Zone Keys (comma-separated)",
        type: "text",
        required: false,
        placeholder: "zone1,zone2",
      },
    ],
    setting_fields: [
      {
        key: "passback",
        label: "Enable Passback",
        type: "boolean",
        default: true,
      },
    ],
  },
  {
    slug: "taboola",
    name: "Taboola",
    provider_type: "native",
    icon: "taboola",
    credential_fields: [
      {
        key: "publisher_id",
        label: "Publisher ID",
        type: "text",
        required: true,
        placeholder: "frelux-publisher",
      },
      {
        key: "placement",
        label: "Placement Name",
        type: "text",
        required: true,
        placeholder: "Below Article Thumbnails",
      },
    ],
    setting_fields: [
      { key: "mode", label: "Mode", type: "text", default: "thumbnails-r" },
    ],
  },
  {
    slug: "outbrain",
    name: "Outbrain",
    provider_type: "native",
    icon: "outbrain",
    credential_fields: [
      {
        key: "widget_id",
        label: "Widget ID",
        type: "text",
        required: true,
        placeholder: "AR_1",
      },
      {
        key: "publisher_key",
        label: "Publisher Key",
        type: "text",
        required: true,
        placeholder: "FRELUX",
      },
    ],
    setting_fields: [],
  },
  {
    slug: "propellerads",
    name: "PropellerAds",
    provider_type: "display",
    icon: "propeller",
    credential_fields: [
      {
        key: "zone_id",
        label: "Zone ID",
        type: "text",
        required: true,
        placeholder: "1234567",
      },
      {
        key: "format",
        label: "Ad Format",
        type: "text",
        required: false,
        placeholder: "push, banner, native",
      },
    ],
    setting_fields: [],
  },
  // ─────────────────────────────────────────────────────────
  // Web rewarded ad providers (offerwall / rewarded API based)
  // ─────────────────────────────────────────────────────────
  {
    slug: "adgate_media",
    name: "AdGate Media",
    provider_type: "rewarded",
    icon: "adgate",
    credential_fields: [
      {
        key: "gateway_id",
        label: "Gateway ID",
        type: "text",
        required: true,
        placeholder: "1234",
      },
      {
        key: "api_key",
        label: "API Key",
        type: "password",
        required: true,
        placeholder: "your-adgate-api-key",
      },
    ],
    setting_fields: [
      {
        key: "postback_url",
        label: "Postback URL",
        type: "text",
        required: false,
        placeholder: "https://freluxtools.netlify.app/api/adgate-postback",
      },
    ],
  },
  {
    slug: "offertoro",
    name: "OfferToro",
    provider_type: "rewarded",
    icon: "offertoro",
    credential_fields: [
      {
        key: "app_id",
        label: "App ID",
        type: "text",
        required: true,
        placeholder: "12345",
      },
      {
        key: "pub_id",
        label: "Publisher ID",
        type: "text",
        required: true,
        placeholder: "pub_XXXX",
      },
      {
        key: "secret",
        label: "Secret Key",
        type: "password",
        required: true,
        placeholder: "your-secret-key",
      },
    ],
    setting_fields: [
      {
        key: "postback_url",
        label: "Postback URL",
        type: "text",
        required: false,
        placeholder: "https://freluxtools.netlify.app/api/offertoro-postback",
      },
    ],
  },
  {
    slug: "adgem",
    name: "AdGem",
    provider_type: "rewarded",
    icon: "adgem",
    credential_fields: [
      {
        key: "placement_id",
        label: "Placement ID",
        type: "text",
        required: true,
        placeholder: "12345",
      },
      {
        key: "api_key",
        label: "API Key",
        type: "password",
        required: true,
        placeholder: "your-adgem-api-key",
      },
    ],
    setting_fields: [
      {
        key: "postback_url",
        label: "Postback URL",
        type: "text",
        required: false,
        placeholder: "https://freluxtools.netlify.app/api/adgem-postback",
      },
    ],
  },
  {
    slug: "cpx_research",
    name: "CPX Research",
    provider_type: "rewarded",
    icon: "cpx",
    credential_fields: [
      {
        key: "app_id",
        label: "App ID",
        type: "text",
        required: true,
        placeholder: "12345",
      },
      {
        key: "secure_hash",
        label: "Secure Hash",
        type: "password",
        required: true,
        placeholder: "your-secure-hash",
      },
    ],
    setting_fields: [
      {
        key: "survey_mode",
        label: "Survey Mode",
        type: "text",
        default: "full",
      },
    ],
  },
  {
    slug: "ayet_studios",
    name: "Ayet Studios",
    provider_type: "rewarded",
    icon: "ayet",
    credential_fields: [
      {
        key: "app_id",
        label: "App ID",
        type: "text",
        required: true,
        placeholder: "12345",
      },
      {
        key: "api_key",
        label: "API Key",
        type: "password",
        required: true,
        placeholder: "your-ayet-api-key",
      },
    ],
    setting_fields: [
      {
        key: "postback_url",
        label: "Postback URL",
        type: "text",
        required: false,
        placeholder: "https://freluxtools.netlify.app/api/ayet-postback",
      },
    ],
  },
  {
    slug: "revu",
    name: "RevU",
    provider_type: "rewarded",
    icon: "revu",
    credential_fields: [
      {
        key: "api_key",
        label: "API Key",
        type: "password",
        required: true,
        placeholder: "your-revu-api-key",
      },
      {
        key: "placement_id",
        label: "Placement ID",
        type: "text",
        required: true,
        placeholder: "12345",
      },
    ],
    setting_fields: [
      {
        key: "postback_url",
        label: "Postback URL",
        type: "text",
        required: false,
        placeholder: "https://freluxtools.netlify.app/api/revu-postback",
      },
    ],
  },
  // ─────────────────────────────────────────────────────────
  // Additional web display ad providers
  // ─────────────────────────────────────────────────────────
  {
    slug: "ezoic",
    name: "Ezoic",
    provider_type: "display",
    icon: "ezoic",
    credential_fields: [
      {
        key: "site_id",
        label: "Site ID",
        type: "text",
        required: true,
        placeholder: "1234567",
      },
      {
        key: "ad_test",
        label: "Ad Tester ID (optional)",
        type: "text",
        required: false,
        placeholder: "tester-1",
      },
    ],
    setting_fields: [
      { key: "lazy_load", label: "Lazy Load", type: "boolean", default: true },
      {
        key: "mediation",
        label: "Header Bidding",
        type: "boolean",
        default: true,
      },
    ],
  },
  {
    slug: "snigel",
    name: "Snigel",
    provider_type: "display",
    icon: "snigel",
    credential_fields: [
      {
        key: "site_id",
        label: "Site ID",
        type: "text",
        required: true,
        placeholder: "frelux",
      },
      {
        key: "adserver",
        label: "Ad Server",
        type: "text",
        required: false,
        placeholder: "gam",
      },
    ],
    setting_fields: [
      { key: "lazy_load", label: "Lazy Load", type: "boolean", default: true },
    ],
  },
  {
    slug: "monumetric",
    name: "Monumetric",
    provider_type: "display",
    icon: "monumetric",
    credential_fields: [
      {
        key: "client_id",
        label: "Client ID",
        type: "text",
        required: true,
        placeholder: "S-XXXX-XXXX",
      },
      {
        key: "zone_id",
        label: "Zone ID",
        type: "text",
        required: false,
        placeholder: "1234567",
      },
    ],
    setting_fields: [],
  },
  {
    slug: "carbon_ads",
    name: "Carbon Ads",
    provider_type: "native",
    icon: "carbon",
    credential_fields: [
      {
        key: "serve",
        label: "Serve ID",
        type: "text",
        required: true,
        placeholder: "CKYI42QM",
      },
      {
        key: "placement",
        label: "Placement",
        type: "text",
        required: true,
        placeholder: "freluxcom",
      },
    ],
    setting_fields: [],
  },
  {
    slug: "ethical_ads",
    name: "EthicalAds",
    provider_type: "native",
    icon: "ethical",
    credential_fields: [
      {
        key: "publisher_id",
        label: "Publisher ID",
        type: "text",
        required: true,
        placeholder: "frelux",
      },
      {
        key: "placement",
        label: "Placement",
        type: "text",
        required: false,
        placeholder: "sidebar",
      },
    ],
    setting_fields: [
      { key: "format", label: "Format", type: "text", default: "image-text" },
    ],
  },
  {
    slug: "amazon_publisher",
    name: "Amazon Publisher (APS)",
    provider_type: "display",
    icon: "amazon",
    credential_fields: [
      {
        key: "publisher_id",
        label: "Publisher ID",
        type: "text",
        required: true,
        placeholder: "frelux-1234",
      },
      {
        key: "slot_id",
        label: "Slot ID",
        type: "text",
        required: true,
        placeholder: "12345",
      },
    ],
    setting_fields: [],
  },
  {
    slug: "yllix",
    name: "YlliX",
    provider_type: "display",
    icon: "yllix",
    credential_fields: [
      {
        key: "publisher_id",
        label: "Publisher ID",
        type: "text",
        required: true,
        placeholder: "1234567890123456",
      },
      {
        key: "zone_id",
        label: "Zone ID",
        type: "text",
        required: true,
        placeholder: "1234567",
      },
    ],
    setting_fields: [
      { key: "format", label: "Ad Format", type: "text", default: "banner" },
    ],
  },
  {
    slug: "revcontent",
    name: "RevContent",
    provider_type: "native",
    icon: "revcontent",
    credential_fields: [
      {
        key: "widget_id",
        label: "Widget ID",
        type: "text",
        required: true,
        placeholder: "12345",
      },
      {
        key: "sub_id",
        label: "Sub ID (optional)",
        type: "text",
        required: false,
        placeholder: "sub-1",
      },
    ],
    setting_fields: [],
  },
  // ─────────────────────────────────────────────────────────
  // Additional web rewarded ad providers
  // ─────────────────────────────────────────────────────────
  {
    slug: "wannads",
    name: "Wannads",
    provider_type: "rewarded",
    icon: "wannads",
    credential_fields: [
      {
        key: "api_key",
        label: "API Key",
        type: "password",
        required: true,
        placeholder: "your-wannads-api-key",
      },
      {
        key: "sub_id",
        label: "Sub ID",
        type: "text",
        required: true,
        placeholder: "12345",
      },
    ],
    setting_fields: [
      {
        key: "postback_url",
        label: "Postback URL",
        type: "text",
        required: false,
        placeholder: "https://freluxtools.netlify.app/api/wannads-postback",
      },
    ],
  },
  {
    slug: "my_lead",
    name: "MyLead",
    provider_type: "rewarded",
    icon: "mylead",
    credential_fields: [
      {
        key: "app_id",
        label: "App ID",
        type: "text",
        required: true,
        placeholder: "12345",
      },
      {
        key: "api_key",
        label: "API Key",
        type: "password",
        required: true,
        placeholder: "your-mylead-api-key",
      },
    ],
    setting_fields: [
      {
        key: "postback_url",
        label: "Postback URL",
        type: "text",
        required: false,
        placeholder: "https://freluxtools.netlify.app/api/mylead-postback",
      },
    ],
  },
  {
    slug: "adwork_media",
    name: "AdWork Media",
    provider_type: "rewarded",
    icon: "adwork",
    credential_fields: [
      {
        key: "campaign_id",
        label: "Campaign ID",
        type: "text",
        required: true,
        placeholder: "12345",
      },
      {
        key: "api_key",
        label: "API Key",
        type: "password",
        required: true,
        placeholder: "your-adwork-api-key",
      },
    ],
    setting_fields: [
      {
        key: "postback_url",
        label: "Postback URL",
        type: "text",
        required: false,
        placeholder: "https://freluxtools.netlify.app/api/adwork-postback",
      },
    ],
  },
  {
    slug: "revenuehits",
    name: "RevenueHits",
    provider_type: "rewarded",
    icon: "revenuehits",
    credential_fields: [
      {
        key: "client_id",
        label: "Client ID",
        type: "text",
        required: true,
        placeholder: "cl-XXXX",
      },
      {
        key: "placement_id",
        label: "Placement ID",
        type: "text",
        required: true,
        placeholder: "12345",
      },
    ],
    setting_fields: [
      {
        key: "postback_url",
        label: "Postback URL",
        type: "text",
        required: false,
        placeholder: "https://freluxtools.netlify.app/api/revenuehits-postback",
      },
    ],
  },
  {
    slug: "notik",
    name: "Notik",
    provider_type: "rewarded",
    icon: "notik",
    credential_fields: [
      {
        key: "api_key",
        label: "API Key",
        type: "password",
        required: true,
        placeholder: "your-notik-api-key",
      },
      {
        key: "app_id",
        label: "App ID",
        type: "text",
        required: true,
        placeholder: "12345",
      },
    ],
    setting_fields: [
      {
        key: "postback_url",
        label: "Postback URL",
        type: "text",
        required: false,
        placeholder: "https://freluxtools.netlify.app/api/notik-postback",
      },
    ],
  },
  {
    slug: "bitcot",
    name: "Bitcot Rewards",
    provider_type: "rewarded",
    icon: "bitcot",
    credential_fields: [
      {
        key: "app_id",
        label: "App ID",
        type: "text",
        required: true,
        placeholder: "12345",
      },
      {
        key: "secret",
        label: "Secret Key",
        type: "password",
        required: true,
        placeholder: "your-bitcot-secret",
      },
    ],
    setting_fields: [
      {
        key: "postback_url",
        label: "Postback URL",
        type: "text",
        required: false,
        placeholder: "https://freluxtools.netlify.app/api/bitcot-postback",
      },
    ],
  },
  // ─────────────────────────────────────────────────────────
  // Monetag, display/push/native ad network
  // ─────────────────────────────────────────────────────────
  {
    slug: "monetag",
    name: "Monetag",
    // "mixed", serves display formats via the website tag AND rewarded
    // ads through the rewarded unlock flow (src/lib/monetag-rewarded.ts)
    provider_type: "mixed",
    icon: "monetag",
    credential_fields: [
      {
        key: "zone_id",
        label: "Zone ID",
        type: "text",
        required: true,
        placeholder: "1234567",
      },
      {
        key: "rewarded_zone_id",
        label: "Rewarded Zone ID (for the rewarded unlock flow)",
        type: "text",
        required: false,
        placeholder: "1234567",
      },
      {
        key: "native_banner_zone_id",
        label: "Native Banner Zone ID (in-page display ads)",
        type: "text",
        required: false,
        placeholder: "1234567",
      },
      {
        key: "sdk_url",
        label: "SDK Script URL (for Rewarded/SDK zones)",
        type: "text",
        required: false,
        placeholder:
          "https://<your-cdn-domain>/sdk.js (from Monetag dashboard → Get SDK)",
      },
      {
        key: "interstitial_zone_id",
        label: "Interstitial Zone ID (auto full-screen)",
        type: "text",
        required: false,
        placeholder: "1234567",
      },
      {
        key: "popunder_zone_id",
        label: "Popunder Zone ID",
        type: "text",
        required: false,
        placeholder: "1234567",
      },
      {
        key: "vignette_zone_id",
        label: "Vignette Banner Zone ID",
        type: "text",
        required: false,
        placeholder: "1234567",
      },
      {
        key: "format",
        label: "Ad Format",
        type: "text",
        required: false,
        placeholder: "banner, push, native, interstitial",
      },
    ],
    setting_fields: [
      {
        key: "sub_id",
        label: "Sub ID (optional)",
        type: "text",
        required: false,
        placeholder: "frelux",
      },
    ],
  },
  // ─────────────────────────────────────────────────────────
  // Offerwall.ad, rewarded offerwall (iframe-based)
  // ─────────────────────────────────────────────────────────
  {
    slug: "offerwall_ad",
    name: "Offerwall.ad",
    provider_type: "rewarded",
    icon: "offerwall",
    credential_fields: [
      {
        key: "wall_url",
        label: "Wall URL",
        type: "text",
        required: true,
        placeholder: "https://offerwall.ad/wall/XXXX",
      },
      {
        key: "wall_id",
        label: "Wall ID (optional)",
        type: "text",
        required: false,
        placeholder: "12",
      },
    ],
    setting_fields: [
      {
        key: "postback_url",
        label: "Postback URL",
        type: "text",
        required: false,
        placeholder: "https://freluxtools.netlify.app/api/offerwall-postback",
      },
      {
        key: "reward_conversion",
        label: "Reward Conversion Rate (credits per $1)",
        type: "text",
        default: "100",
      },
    ],
  },
];

/**
 * Generic schema for admin-added custom providers.
 */
export const CUSTOM_PROVIDER_SCHEMA: AdProviderSchema = {
  slug: "",
  name: "",
  provider_type: "mixed",
  icon: "custom",
  credential_fields: [
    {
      key: "api_key",
      label: "API Key / Publisher ID",
      type: "text",
      required: true,
      placeholder: "Your provider API key",
    },
    {
      key: "ad_unit_id",
      label: "Ad Unit ID",
      type: "text",
      required: false,
      placeholder: "Ad unit identifier",
    },
  ],
  setting_fields: [
    { key: "test_mode", label: "Test Mode", type: "boolean", default: false },
  ],
};

export function getProviderSchema(slug: string): AdProviderSchema | null {
  return BUILTIN_PROVIDERS.find((p) => p.slug === slug) ?? null;
}

export const AD_PLACEMENT_TYPES = [
  "banner",
  "native",
  "rewarded",
  "interstitial",
  "in_article",
] as const;
export const AD_PAGE_TARGETS = [
  "home",
  "calculator",
  "learn",
  "color_detail",
  "gallery",
  "ai",
  "sidebar",
  "global",
] as const;

export const PLACEMENT_TYPE_LABELS: Record<string, string> = {
  banner: "Banner Ad",
  native: "Native Ad",
  rewarded: "Rewarded Ad",
  interstitial: "Interstitial Ad",
  in_article: "In Article Ad",
};

export const PAGE_TARGET_LABELS: Record<string, string> = {
  home: "Homepage",
  calculator: "Calculator / Estimator",
  learn: "Learn Section",
  color_detail: "Color Detail Page",
  gallery: "Color Gallery",
  ai: "AI Features",
  marketplace: "Marketplace",
  sidebar: "Sidebar (all pages)",
  global: "Global (all pages)",
};

export const REWARDED_FEATURES = [
  {
    key: "advanced_calculator",
    name: "Advanced Calculators",
    icon: "Calculator",
  },
  { key: "ai_color_assistant", name: "Smart Color Assistant", icon: "Palette" },
  {
    key: "ai_learning_assistant",
    name: "AI Learning Assistant",
    icon: "BookOpen",
  },
  { key: "premium_reports", name: "Premium Reports", icon: "FileText" },
  { key: "image_estimation", name: "AI Photo Estimator", icon: "Camera" },
];

/**
 * Page map spec, the visual wireframe used by the Admin "Page Map"
 * display. Each entry describes one page template: its content sections
 * and the ad slot keys that sit between them (in on-page order).
 * "native" keys render as native banner ads; everything else as banners
 * or in-article units.
 */
export type PageMapSection = {
  /** Section label shown in the wireframe (e.g. "Hero") */
  label: string;
  /** Ad slot key rendered between this section and the next (optional) */
  slot?: string;
  /** True if the slot renders a native banner format */
  native?: boolean;
};

export const PAGE_MAP: Record<string, { title: string; sections: PageMapSection[] }> = {
  home: {
    title: "Homepage",
    sections: [
      { label: "Hero" },
      { label: "Ad · home_top (banner)", slot: "home_top" },
      { label: "How FRELUX Works" },
      { label: "Ad · home_native (native)", slot: "home_native", native: true },
      { label: "Commercial readiness" },
      { label: "Ad · home_mid (banner)", slot: "home_mid" },
      { label: "All calculators grid" },
      { label: "Ad · home_native_2 (native)", slot: "home_native_2", native: true },
      { label: "Pro Connect section" },
      { label: "Ad · home_mid_2 (banner)", slot: "home_mid_2" },
      { label: "Marketplace CTA" },
      { label: "Ad · home_native_3 (native)", slot: "home_native_3", native: true },
      { label: "Sidebar (desktop)", slot: "home_sidebar" },
      { label: "Footer" },
      { label: "Ad · home_footer (banner)", slot: "home_footer" },
    ],
  },
  learn_article: {
    title: "Learn · Article page",
    sections: [
      { label: "Article header + intro" },
      { label: "Ad · learn_article_top (in-article)", slot: "learn_article_top" },
      { label: "First content block" },
      { label: "Ad · learn_article_native (native)", slot: "learn_article_native", native: true },
      { label: "Mid content" },
      { label: "Ad · learn_in_article (in-article)", slot: "learn_in_article" },
      { label: "Second content block" },
      { label: "Ad · learn_article_native_2 (native)", slot: "learn_article_native_2", native: true },
      { label: "Later content" },
      { label: "Ad · learn_article_mid_2 (in-article)", slot: "learn_article_mid_2" },
      { label: "Article end" },
      { label: "Ad · learn_article_native_3 (native)", slot: "learn_article_native_3", native: true },
      { label: "Related articles" },
      { label: "Ad · learn_article_bottom (banner)", slot: "learn_article_bottom" },
    ],
  },
  calculator: {
    title: "Calculator / Estimator page",
    sections: [
      { label: "Calculator form + results" },
      { label: "Ad · calculator_mid (banner)", slot: "calculator_mid" },
      { label: "Results detail / materials" },
      { label: "Ad · calculator_native (native)", slot: "calculator_native", native: true },
      { label: "Related calculators" },
      { label: "Ad · calculator_bottom (banner)", slot: "calculator_bottom" },
    ],
  },
  calculator_hub: {
    title: "Calculator hub page",
    sections: [
      { label: "Hub header + calculator cards" },
      { label: "Ad · calculator_hub_mid (banner)", slot: "calculator_hub_mid" },
      { label: "Guides / templates" },
      { label: "Ad · calculator_hub_native (native)", slot: "calculator_hub_native", native: true },
      { label: "Hub bottom" },
      { label: "Ad · calculator_hub_bottom (banner)", slot: "calculator_hub_bottom" },
    ],
  },
  learn_index: {
    title: "Learn · index + category pages",
    sections: [
      { label: "Article / category grid" },
      { label: "Ad · learn_category_mid (banner)", slot: "learn_category_mid" },
      { label: "Ad · learn_native / learn_category_native (native)", slot: "learn_native", native: true },
      { label: "Sidebar (Learn index, desktop)", slot: "learn_sidebar" },
      { label: "Page bottom" },
      { label: "Ad · learn_bottom (banner)", slot: "learn_bottom" },
    ],
  },
  color_gallery: {
    title: "Colors · gallery + detail pages",
    sections: [
      { label: "Color content" },
      { label: "Ad · gallery_mid / color_detail_mid (banner)", slot: "gallery_mid" },
      { label: "Ad · gallery_native / color_detail_native (native)", slot: "gallery_native", native: true },
      { label: "Page bottom" },
      { label: "Ad · colors_gallery_bottom / color_detail_footer (banner)", slot: "colors_gallery_bottom" },
    ],
  },
  ai_tools: {
    title: "AI feature pages",
    sections: [
      { label: "AI tool UI" },
      { label: "Ad · ai_feature (banner)", slot: "ai_feature" },
      { label: "Ad · ai_assistant_native (native)", slot: "ai_assistant_native", native: true },
      { label: "Image estimator native (image_estimator_native)", slot: "image_estimator_native", native: true },
      { label: "Feature bottom" },
      { label: "Ad · ai_assistant_footer / image_estimator_bottom (banner)", slot: "ai_assistant_footer" },
    ],
  },
  marketplace: {
    title: "Marketplace pages",
    sections: [
      { label: "Marketplace content" },
      { label: "Ad · marketplace_sidebar (banner)", slot: "marketplace_sidebar" },
      { label: "Ad · marketplace_native (native)", slot: "marketplace_native", native: true },
      { label: "Page bottom" },
      { label: "Ad · marketplace_bottom (banner)", slot: "marketplace_bottom" },
    ],
  },
};
