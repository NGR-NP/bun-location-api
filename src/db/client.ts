import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../env";

export function getSupabase(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}
