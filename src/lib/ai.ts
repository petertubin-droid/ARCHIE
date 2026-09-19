// Client for the Smart Color Assistant edge function.
// The browser talks to the Supabase Edge Function; the Google AI API key
// never touches the frontend.

import { supabase } from '@/lib/supabase';
import { isValidHexColor, normalizeHex } from '@/lib/colors';
import { getClientId } from '@/lib/ai-access';
import { captureAiError } from '@/lib/errorMonitor';
import type { AiColor, AiRecommendation } from '@/types/ai';

export interface AiConsultResult {
  recommendation: AiRecommendation;
}

export class AiConsultError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = 'AiConsultError';
  }
}

interface ConsultParams {
  mode: 'text' | 'image';
  description?: string;
  imageDataUrl?: string;
}

export async function requestColorConsultationWithCredits(params: ConsultParams): Promise<{ result?: AiRecommendation; gateError?: string; insufficientCredits?: boolean; adUnlockAvailable?: boolean; currentBalance?: number; requiredCredits?: number }> {
  const { checkAndSpendCredits } = await import('@/lib/ai-credit-gate');
  const gate = await checkAndSpendCredits('ai_color_consult');
  if (!gate.allowed) {
    return { gateError: gate.error ?? 'Credit required', insufficientCredits: true, adUnlockAvailable: gate.adUnlockAvailable, currentBalance: gate.newBalance ?? 0, requiredCredits: gate.feature?.credit_cost ?? 0 };
  }
  try {
    const recommendation = await requestColorConsultation(params);
    return { result: recommendation };
  } catch (e) {
    return { gateError: (e as Error).message };
  }
}

export async function requestColorConsultation(params: ConsultParams): Promise<AiRecommendation> {
  try {
  const clientId = getClientId();
  const { data } = await supabase.functions.invoke<AiConsultResult | { error: string; code?: string }>('ai-color-consult', {
    body: {
      mode: params.mode,
      description: params.description,
      imageDataUrl: params.imageDataUrl,
      clientId,
    },
  });

  if (!data) {
    throw new AiConsultError('No response from the AI service.', 'EMPTY_RESPONSE', 502);
  }

  if ('error' in data && data.error) {
    const code = data.code ?? 'PROVIDER_ERROR';
    const message =
      code === 'RATE_LIMITED'
        ? 'You have reached the request limit. Please try again in a little while.'
        : code === 'USAGE_LIMIT_REACHED'
        ? 'You have used all your free AI recommendations for today. Please come back tomorrow.'
        : code === 'NO_API_KEY'
        ? 'The AI service is not configured yet. Please check back later.'
        : code === 'AI_DISABLED'
        ? 'AI features are currently disabled.'
        : 'The AI service could not process your request. Please try again.';
    throw new AiConsultError(message, code, code === 'RATE_LIMITED' || code === 'USAGE_LIMIT_REACHED' ? 429 : 502);
  }

  if (!('recommendation' in data) || !data.recommendation) {
    throw new AiConsultError('The AI response was incomplete.', 'INVALID_RESPONSE', 502);
  }

  return sanitizeRecommendation(data.recommendation);
  } catch (error) {
    captureAiError(error, { feature: 'Color Consultation', provider: 'google-ai' });
    throw error;
  }
}

// Ensure all colors have valid hex codes before they reach the UI.
// Invalid colors get a neutral fallback so the app never crashes.
function sanitizeRecommendation(rec: AiRecommendation): AiRecommendation {
  const sanitizedColors: AiColor[] = (rec.colors ?? []).map((c, i) => {
    const role = (['main', 'secondary', 'accent'] as const)[i] ?? c.role ?? 'accent';
    const hex = isValidHexColor(c.hex) ? normalizeHex(c.hex) : '#CCCCCC';
    return {
      name: typeof c.name === 'string' && c.name.trim() ? c.name.trim() : `${role} color`,
      hex,
      role,
    };
  });

  // Guarantee exactly 3 colors
  const fallbackColors: AiColor[] = [
    { name: 'Main color', hex: '#E5E5E5', role: 'main' },
    { name: 'Secondary color', hex: '#C4C4C4', role: 'secondary' },
    { name: 'Accent color', hex: '#9CA3AF', role: 'accent' },
  ];
  while (sanitizedColors.length < 3) {
    sanitizedColors.push(fallbackColors[sanitizedColors.length]);
  }

  return {
    paletteSummary: typeof rec.paletteSummary === 'string' ? rec.paletteSummary : '',
    colors: sanitizedColors.slice(0, 3),
    finishSuggestion: typeof rec.finishSuggestion === 'string' ? rec.finishSuggestion : '',
    whyItWorks: typeof rec.whyItWorks === 'string' ? rec.whyItWorks : '',
    additionalSuggestions: typeof rec.additionalSuggestions === 'string' ? rec.additionalSuggestions : '',
  };
}
