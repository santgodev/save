// Resolve the calling user from the Authorization header using the
// project's anon key + the user's JWT. Returns the Supabase user or
// throws. We keep this in a shared helper so every function uses the
// same pattern.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export type AuthedRequest = {
  user: { id: string; email?: string };
  // A client scoped to the user (RLS applies). Use this for app-table reads.
  userClient: SupabaseClient;
  // A service-role client (bypasses RLS). Only use for system writes that
  // the user is not allowed to perform directly (e.g. assistant chat turns).
  serviceClient: SupabaseClient;
};

export async function authenticate(req: Request): Promise<AuthedRequest> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceKey) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY env vars");
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw new Error("Missing Authorization header");
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) {
    throw new Error("Invalid auth token");
  }

  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    user: { id: data.user.id, email: data.user.email ?? undefined },
    userClient,
    serviceClient,
  };
}
