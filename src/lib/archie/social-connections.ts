// =========================================================
// FRELUX ARCHIE EXTENSION, OWNER SOCIAL CONNECTIONS
//
// Owner-only Social Intelligence & Brand Center connection
// governance. The Owner connects and manages ONLY their own
// authorized brand/social accounts. Each platform uses its
// OFFICIAL authentication/authorization mechanism (OAuth or
// the platform's official Sign-In; Google Sign-In where
// supported).
//
// FRELUX never stores platform passwords, only the OAuth
// authorization tokens the platform issues, held server-side
// in an encrypted token vault (see the archie-social-connect
// edge function and frelux_social_tokens, service-role
// only, encrypted at rest, rotatable, revocable).
//
// ARCHIE may access ONLY accounts the Owner explicitly
// connected and authorized. Never subscriber social accounts,
// never employee/private accounts, never unrelated
// third-party accounts, never private communications beyond
// granted permissions.
// =========================================================

export type SocialPlatform =
  | "google"
  | "youtube"
  | "facebook"
  | "instagram"
  | "whatsapp"
  | "tiktok"
  | "x"
  | "linkedin";

export interface SocialPlatformDescriptor {
  platform: SocialPlatform | string;
  label: string;
  /** Official mechanism only, never password capture. */
  auth_mechanism: "oauth2" | "official_sign_in";
  /** Official OAuth authorize endpoint (empty for platforms
   *  whose official flow is app/sign-in based). */
  oauth_authorize_url: string;
  /** Edge secret names the OWNER must configure for the
   *  official integration app credentials. */
  requires_owner_app_credentials: readonly string[];
  note: string;
}

const BASE_PLATFORMS: SocialPlatformDescriptor[] = [
  {
    platform: "google",
    label: "Google (Sign-In)",
    auth_mechanism: "oauth2",
    oauth_authorize_url: "https://accounts.google.com/o/oauth2/v2/auth",
    requires_owner_app_credentials: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    note: "Owner may authenticate through Google where Google Sign-In is supported.",
  },
  {
    platform: "youtube",
    label: "YouTube",
    auth_mechanism: "oauth2",
    oauth_authorize_url: "https://accounts.google.com/o/oauth2/v2/auth",
    requires_owner_app_credentials: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    note: "YouTube Data API via Google OAuth.",
  },
  {
    platform: "facebook",
    label: "Facebook",
    auth_mechanism: "oauth2",
    oauth_authorize_url: "https://www.facebook.com/v19.0/dialog/oauth",
    requires_owner_app_credentials: ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"],
    note: "Official Facebook Login for Business.",
  },
  {
    platform: "instagram",
    label: "Instagram",
    auth_mechanism: "oauth2",
    oauth_authorize_url: "https://www.facebook.com/v19.0/dialog/oauth",
    requires_owner_app_credentials: ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"],
    note: "Instagram Graph API (Business/Creator accounts) via official OAuth.",
  },
  {
    platform: "whatsapp",
    label: "WhatsApp",
    auth_mechanism: "official_sign_in",
    oauth_authorize_url: "",
    requires_owner_app_credentials: ["WHATSAPP_BUSINESS_TOKEN"],
    note: "WhatsApp Business Platform, official Business API login. No password capture.",
  },
  {
    platform: "tiktok",
    label: "TikTok",
    auth_mechanism: "oauth2",
    oauth_authorize_url: "https://www.tiktok.com/v2/auth/authorize/",
    requires_owner_app_credentials: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    note: "Official TikTok Login Kit / Business API.",
  },
  {
    platform: "x",
    label: "X (Twitter)",
    auth_mechanism: "oauth2",
    oauth_authorize_url: "https://twitter.com/i/oauth2/authorize",
    requires_owner_app_credentials: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
    note: "Official X OAuth 2.0 (PKCE).",
  },
  {
    platform: "linkedin",
    label: "LinkedIn",
    auth_mechanism: "oauth2",
    oauth_authorize_url: "https://www.linkedin.com/oauth/v2/authorization",
    requires_owner_app_credentials: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    note: "Official LinkedIn OAuth 2.0.",
  },
];

/** Extensible registry, additional legitimate social
 *  platforms as FRELUX expands. */
const registered: SocialPlatformDescriptor[] = [...BASE_PLATFORMS];

export function registerSocialPlatform(
  descriptor: SocialPlatformDescriptor,
): { ok: boolean; error?: string } {
  if (!descriptor.platform.toString().trim()) {
    return { ok: false, error: "A platform requires a name" };
  }
  if (descriptor.auth_mechanism === "oauth2" && !descriptor.oauth_authorize_url.trim()) {
    return { ok: false, error: "An OAuth platform requires its official authorize endpoint" };
  }
  if (
    registered.some(
      (p) => p.platform.toString().toLowerCase() === descriptor.platform.toString().toLowerCase(),
    )
  ) {
    return { ok: false, error: `Platform "${descriptor.platform}" is already registered` };
  }
  registered.push(descriptor);
  return { ok: true };
}

export function listSocialPlatforms(): readonly SocialPlatformDescriptor[] {
  return registered;
}

/** Passwords are never a connection mechanism. Period. */
export function isPasswordConnectionAllowed(): false {
  return false;
}

// ---------------------------------------------------------
// Connection lifecycle
// ---------------------------------------------------------
export type ConnectionStatus =
  | "DISCONNECTED"
  | "CONNECT_PENDING"
  | "CONNECTED"
  | "SYNCED";

export type ConnectionAction =
  | "CONNECT"
  | "VIEW PERMISSIONS"
  | "SYNC"
  | "DISCONNECT"
  | "REVOKE ACCESS";

export const CONNECTION_ACTIONS: readonly ConnectionAction[] = [
  "CONNECT",
  "VIEW PERMISSIONS",
  "SYNC",
  "DISCONNECT",
  "REVOKE ACCESS",
];

/** Legal lifecycle transitions. */
export function transitionConnection(
  status: ConnectionStatus,
  action: ConnectionAction,
): { ok: boolean; error?: string; next?: ConnectionStatus } {
  switch (action) {
    case "CONNECT":
      if (status === "DISCONNECTED") return { ok: true, next: "CONNECT_PENDING" };
      return { ok: false, error: "Already connected, disconnect first" };
    case "VIEW PERMISSIONS":
      if (status === "CONNECTED" || status === "SYNCED") return { ok: true, next: status };
      return { ok: false, error: "Connect the account before viewing permissions" };
    case "SYNC":
      if (status === "CONNECTED" || status === "SYNCED") return { ok: true, next: "SYNCED" };
      return { ok: false, error: "Connect the account before syncing" };
    case "DISCONNECT":
    case "REVOKE ACCESS":
      if (status === "CONNECTED" || status === "SYNCED" || status === "CONNECT_PENDING") {
        // REVOKE ACCESS also destroys the server-side token vault entry.
        return { ok: true, next: "DISCONNECTED" };
      }
      return { ok: false, error: "Account is not connected" };
  }
}

export interface ConnectedSocialAccount {
  platform: string;
  account_handle: string;
  status: ConnectionStatus;
  /** Only the Owner's own brand accounts, enforced at
   *  creation and in mayArchieAccessAccount(). */
  connection_kind: "OWNER_BRAND_ACCOUNT";
  scopes: readonly string[];
  owner_explicitly_authorized: boolean;
}

/** THE access rule: ARCHIE may access ONLY accounts the
 *  Owner explicitly connected and authorized. Everything
 *  else, subscriber accounts, employee/private accounts,
 *  third-party accounts, unconnected accounts, is refused. */
export function mayArchieAccessAccount(
  account: ConnectedSocialAccount,
): { ok: boolean; error?: string } {
  if (account.connection_kind !== "OWNER_BRAND_ACCOUNT") {
    return {
      ok: false,
      error: "ARCHIE may access only Owner-connected brand accounts",
    };
  }
  if (!account.owner_explicitly_authorized) {
    return {
      ok: false,
      error: "The Owner has not explicitly authorized this account",
    };
  }
  if (account.status !== "CONNECTED" && account.status !== "SYNCED") {
    return { ok: false, error: "This account is not connected" };
  }
  return { ok: true };
}

/** Token governance, tokens live ONLY in the server-side
 *  encrypted vault. The client (and ARCHIE's client context)
 *  never sees or stores them. */
export const TOKEN_GOVERNANCE = {
  storage: "server-side encrypted vault (service-role only, pgcrypto at rest)",
  password_storage: "NEVER, FRELUX stores no social-media or Google passwords",
  rotation: "supported, re-authorization rotates the vault entry",
  revocation: "supported, REVOKE ACCESS destroys the vault entry",
} as const;
