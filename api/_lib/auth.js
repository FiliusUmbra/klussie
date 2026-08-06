// Shared Supabase auth verification for serverless functions. Files under api/_lib/
// are helpers, not routes — Vercel ignores anything prefixed with an underscore when
// building the routing table, but they're importable like any other module.
//
// Deliberately does NOT use the Supabase service role key. The returned client is
// authenticated as the calling user (via their own access token), so every query it
// makes is still subject to that user's RLS policies — least-privilege by construction,
// not by convention. See docs/product/PRODUCT_CONSTITUTION.md, rule 5.
import { createClient } from "@supabase/supabase-js";

class AuthError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Throws AuthError (with .status set) on any failure — callers should catch it and
// respond with that status. Returns { user, supabase } on success.
export async function verifyAuth(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  const token = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) {
    throw new AuthError("Missing Authorization header. Sign in and try again.", 401);
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new AuthError("Server is not configured.", 500);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    throw new AuthError("Invalid or expired session. Please sign in again.", 401);
  }

  return { user: data.user, supabase };
}

export { AuthError };
