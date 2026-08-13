// The Supabase client, created on first use rather than on import.
//
// WHY LAZY, WHEN EAGER WAS SIMPLER.
//
// This module used to validate configuration and construct the client at import time.
// That made importing *any* data-access module — and anything that transitively imports
// one — depend on runtime configuration, including code with no interest in Supabase at
// all. `src/home/useHomeContext.js` exports three pure functions (a greeting band, a
// greeting line, trust-signal eligibility) and also imports `../lib/pros` for the parts
// that do fetch; a test of the pure three could not run without a real project URL.
//
// The cost was already being paid, one file at a time: every existing test that touches
// this layer carries a `vi.mock("../supabaseClient")` whose only job is to stop an import
// from throwing. That is a workaround per file, and the next pure-logic test hits the same
// wall — which is exactly what happened in CI, where no `.env.local` exists.
//
// Deferring construction removes the import-time side effect. Nothing about the running
// application changes: the client is still a module-level singleton, still created once,
// and still created within milliseconds of startup, because the first thing the app does
// is subscribe to auth.
//
// VALIDATION IS NOT WEAKENED — IT HAPPENS IN TWO PLACES INSTEAD OF ONE.
//
//   · `assertSupabaseConfig()` is called by `src/main.jsx` before the app renders, so a
//     misconfigured deployment still fails immediately, loudly, with this same message.
//   · `getClient()` calls it again before constructing, so the first real use of an
//     unconfigured client raises this message rather than a supabase-js error about a
//     malformed URL.
//
// The only thing that changed is that *importing* the module no longer throws.
import { createClient } from "@supabase/supabase-js";

const MISSING_CONFIG =
  "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.local.example to .env.local and fill in your Supabase project's values.";

/**
 * Throws unless both environment variables are present. Called at application startup
 * (`src/main.jsx`) so a misconfigured build fails before it renders anything, and again
 * before the client is constructed so no code path can reach an unconfigured client.
 */
export function assertSupabaseConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) throw new Error(MISSING_CONFIG);

  return { url, anonKey };
}

let client = null;

function getClient() {
  if (client === null) {
    const { url, anonKey } = assertSupabaseConfig();
    client = createClient(url, anonKey);
  }
  return client;
}

// A proxy rather than a `getSupabase()` function, so that all 97 existing call sites keep
// working unchanged. Converting them would be a mechanical rewrite of the entire data
// layer to fix a configuration-loading bug, which is a far larger diff — and a far larger
// chance of changing behaviour — than the defect warrants.
//
// Methods are bound to the real client, so `this` inside supabase-js is always the client
// and never this proxy. Without that, any use of a private field inside the library would
// fail on an object that merely forwards property reads.
export const supabase = new Proxy(
  {},
  {
    get(_target, property) {
      const target = getClient();
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(_target, property, value) {
      return Reflect.set(getClient(), property, value);
    },
    has(_target, property) {
      return Reflect.has(getClient(), property);
    },
  }
);
