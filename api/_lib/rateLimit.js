// Postgres-backed rate limiting — no external service (Redis, etc.) required. Counts
// this user's recent rows in ai_usage_log; RLS on that table already scopes each user
// to their own rows, so this works with the same per-request authenticated client
// verifyAuth() returns, no service role key needed here either.
const WINDOW_MINUTES = 10;
const MAX_CALLS_PER_WINDOW = 20;

class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.status = 429;
  }
}

// Call after verifyAuth() succeeds. Throws RateLimitError if the user is over the
// limit; otherwise logs this call and returns.
export async function checkAndLogUsage(supabase, userId, endpoint) {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

  const { count, error: countError } = await supabase
    .from("ai_usage_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("endpoint", endpoint)
    .gte("created_at", windowStart);

  if (countError) throw countError;
  if ((count ?? 0) >= MAX_CALLS_PER_WINDOW) {
    throw new RateLimitError(`Too many requests. Please wait a few minutes and try again.`);
  }

  const { error: insertError } = await supabase.from("ai_usage_log").insert({ user_id: userId, endpoint });
  if (insertError) throw insertError;
}

export { RateLimitError };
