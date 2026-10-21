import { supabase } from "@/lib/supabase";
import type { PersonalizationConfig } from "@/components/archie/PersonalizationModal";

const TABLE = "frelux_archie_user_preferences";
const CACHE_PREFIX = "archie_personalization_v1:";

function readCache(userId: string): PersonalizationConfig | null {
  try {
    const value = localStorage.getItem(`${CACHE_PREFIX}${userId}`);
    return value ? JSON.parse(value) as PersonalizationConfig : null;
  } catch {
    return null;
  }
}

function writeCache(userId: string, config: PersonalizationConfig) {
  try { localStorage.setItem(`${CACHE_PREFIX}${userId}`, JSON.stringify(config)); } catch { /* storage may be disabled */ }
}

/** Cloud-first per-account settings. Cache is only an offline read fallback. */
export async function loadPersonalization(userId: string): Promise<PersonalizationConfig | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    const cached = readCache(userId);
    if (cached) return cached;
    throw new Error(error.message);
  }
  if (!data?.settings) return readCache(userId);
  const config = data.settings as PersonalizationConfig;
  writeCache(userId, config);
  return config;
}

export async function savePersonalization(userId: string, config: PersonalizationConfig): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .upsert({ user_id: userId, settings: config, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  writeCache(userId, config);
}
