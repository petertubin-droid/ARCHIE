/**
 * Offerwall URL generation for web-based rewarded ad providers.
 * Each provider has a different URL pattern for embedding their offerwall.
 *
 * The flow:
 * 1. Generate a unique session ID (we use the client hash + timestamp)
 * 2. Build the offerwall URL with the session ID as the user identifier
 * 3. Embed the URL in an iframe within the rewarded ad modal
 * 4. The provider sends a server-to-server postback when the user completes offers
 * 5. Our backend validates the postback and grants the unlock
 * 6. The client polls for unlock status or receives a real-time update
 */

import type { DbAdProvider } from '@/types/database';

export interface OfferwallConfig {
  url: string;
  providerSlug: string;
  providerName: string;
  width: string;
  height: string;
}

/**
 * Generate an offerwall URL for a rewarded ad provider.
 * Returns null if the provider doesn't support offerwall embedding.
 *
 * SECURITY NOTE: Some providers (CPX Research, RevU) include an API key or
 * secure hash in the offerwall URL. This is by design, these values are
 * app-level identifiers, not server secrets. The actual security boundary
 * is the server-to-server postback verification, which uses a separate
 * secret key stored only in the edge function environment.
 */
export function generateOfferwallUrl(
  provider: DbAdProvider,
  clientHash: string,
  _toolKey: string,
): OfferwallConfig | null {
  const creds = provider.credentials ?? {};
  const slug = provider.slug;

  // For web rewarded ad providers, we generate an offerwall URL
  // that can be embedded in an iframe

  switch (slug) {
    case 'adgate_media': {
      // AdGate Media offerwall URL
      // https://www.adgatemedia.com/offerwall/v1/?af=GATEWAY_ID&user=USER_ID
      if (!creds.gateway_id) return null;
      const params = new URLSearchParams({
        af: creds.gateway_id,
        user: clientHash,
      });
      return {
        url: `https://www.adgatemedia.com/offerwall/v1/?${params.toString()}`,
        providerSlug: slug,
        providerName: provider.name,
        width: '100%',
        height: '600px',
      };
    }

    case 'offertoro': {
      // OfferToro offerwall URL
      // https://www.offertoro.com/offerwall_v1?pub=PUB_ID&app_id=APP_ID&user_id=USER_ID
      if (!creds.app_id || !creds.pub_id) return null;
      const params = new URLSearchParams({
        pub: creds.pub_id,
        app_id: creds.app_id,
        user_id: clientHash,
      });
      return {
        url: `https://www.offertoro.com/offerwall_v1?${params.toString()}`,
        providerSlug: slug,
        providerName: provider.name,
        width: '100%',
        height: '600px',
      };
    }

    case 'adgem': {
      // AdGem offerwall URL
      // https://wall.adgaterewards.com/api/v1/wall?placement=PLACEMENT_ID&user=USER_ID
      if (!creds.placement_id) return null;
      const params = new URLSearchParams({
        placement: creds.placement_id,
        user: clientHash,
      });
      return {
        url: `https://wall.adgaterewards.com/api/v1/wall?${params.toString()}`,
        providerSlug: slug,
        providerName: provider.name,
        width: '100%',
        height: '600px',
      };
    }

    case 'cpx_research': {
      // CPX Research survey wall URL
      // https://www.cpx-research.com/api/wall?app_id=APP_ID&ext_user_id=USER_ID&secure_hash=HASH
      if (!creds.app_id || !creds.secure_hash) return null;
      const params = new URLSearchParams({
        app_id: creds.app_id,
        ext_user_id: clientHash,
        secure_hash: creds.secure_hash,
      });
      return {
        url: `https://www.cpx-research.com/api/wall?${params.toString()}`,
        providerSlug: slug,
        providerName: provider.name,
        width: '100%',
        height: '600px',
      };
    }

    case 'ayet_studios': {
      // Ayet Studios offerwall URL
      // https://wall.adgem.com/api/v1/wall?app_id=APP_ID&user=USER_ID
      if (!creds.app_id) return null;
      const params = new URLSearchParams({
        appid: creds.app_id,
        user: clientHash,
      });
      return {
        url: `https://ayetstudios.com/offerwall?${params.toString()}`,
        providerSlug: slug,
        providerName: provider.name,
        width: '100%',
        height: '600px',
      };
    }

    case 'revu': {
      // RevU offerwall URL
      // https://revu.tv/offerwall?api_key=KEY&placement_id=ID&user_id=USER_ID
      if (!creds.api_key || !creds.placement_id) return null;
      const params = new URLSearchParams({
        api_key: creds.api_key,
        placement_id: creds.placement_id,
        user_id: clientHash,
      });
      return {
        url: `https://revu.tv/offerwall?${params.toString()}`,
        providerSlug: slug,
        providerName: provider.name,
        width: '100%',
        height: '600px',
      };
    }

    case 'wannads': {
      if (!creds.api_key || !creds.sub_id) return null;
      const params = new URLSearchParams({
        key: creds.api_key,
        subid: creds.sub_id,
        userid: clientHash,
      });
      return {
        url: `https://www.wannads.com/wall?${params.toString()}`,
        providerSlug: slug,
        providerName: provider.name,
        width: '100%',
        height: '600px',
      };
    }

    case 'my_lead': {
      if (!creds.app_id) return null;
      const params = new URLSearchParams({
        app: creds.app_id,
        uid: clientHash,
      });
      return {
        url: `https://www.mylead.com/offerwall?${params.toString()}`,
        providerSlug: slug,
        providerName: provider.name,
        width: '100%',
        height: '600px',
      };
    }

    case 'adwork_media': {
      if (!creds.campaign_id) return null;
      const params = new URLSearchParams({
        camp: creds.campaign_id,
        uid: clientHash,
      });
      return {
        url: `https://www.adworkmedia.com/offerwall?${params.toString()}`,
        providerSlug: slug,
        providerName: provider.name,
        width: '100%',
        height: '600px',
      };
    }

    case 'revenuehits': {
      if (!creds.client_id || !creds.placement_id) return null;
      const params = new URLSearchParams({
        client: creds.client_id,
        placement: creds.placement_id,
        user: clientHash,
      });
      return {
        url: `https://www.revenuehits.com/offerwall?${params.toString()}`,
        providerSlug: slug,
        providerName: provider.name,
        width: '100%',
        height: '600px',
      };
    }

    case 'notik': {
      if (!creds.api_key || !creds.app_id) return null;
      const params = new URLSearchParams({
        app: creds.app_id,
        key: creds.api_key,
        user: clientHash,
      });
      return {
        url: `https://notik.com/offerwall?${params.toString()}`,
        providerSlug: slug,
        providerName: provider.name,
        width: '100%',
        height: '600px',
      };
    }

    case 'bitcot': {
      if (!creds.app_id) return null;
      const params = new URLSearchParams({
        app: creds.app_id,
        user: clientHash,
      });
      return {
        url: `https://rewards.bitcot.com/offerwall?${params.toString()}`,
        providerSlug: slug,
        providerName: provider.name,
        width: '100%',
        height: '600px',
      };
    }

    default:
      // For Google AdMob and other mobile SDK providers, we can't embed an offerwall on web.
      // Fall back to the existing edge function approach (dev mode / SDK integration).
      return null;
  }
}

/**
 * Check if a provider supports web-based offerwall embedding.
 */
export function supportsOfferwall(provider: DbAdProvider): boolean {
  return [
    'adgate_media',
    'offertoro',
    'adgem',
    'cpx_research',
    'ayet_studios',
    'revu',
    'wannads',
    'my_lead',
    'adwork_media',
    'revenuehits',
    'notik',
    'bitcot',
  ].includes(provider.slug);
}
