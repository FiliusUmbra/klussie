// The configuration contract for the Supabase client.
//
// These exist because the module was changed to remove an import-time side effect, and
// the risk in that change is not that it fails — it is that it succeeds too well and
// quietly takes the runtime check with it. A client that can be imported without
// configuration must still refuse to be *used* without it, and a misconfigured deployment
// must still fail at startup rather than at whatever moment the first query happens to run.
//
// So all three properties are pinned: importing is safe, asserting still throws, and
// touching the client still throws. The first is what unblocks CI; the other two are what
// stop that becoming a silent loss of safety.
//
// This module is mocked out in every other test in the suite. It is deliberately NOT
// mocked here — the module under test is the real one.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const MESSAGE = /Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY/;

// Each case re-imports, because the client is a module-level singleton: once one test has
// constructed it, a later test stubbing the environment would be talking to a cached
// instance and proving nothing.
async function importFresh() {
  vi.resetModules();
  return import("../supabaseClient.js");
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("supabaseClient configuration", () => {
  describe("without configuration", () => {
    beforeEach(() => {
      // Empty rather than deleted: this is what a fresh checkout looks like in CI, where
      // no .env.local exists and the variables resolve to nothing.
      vi.stubEnv("VITE_SUPABASE_URL", "");
      vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    });

    it("can be imported", async () => {
      // The whole point. `src/home/useHomeContext.js` exports three pure functions and
      // also imports the data layer; before this change, testing those three needed a
      // real project URL, and CI — which has none, and must not be given one — failed on
      // the import rather than on anything the test asserted.
      await expect(importFresh()).resolves.toBeTruthy();
    });

    it("still throws when configuration is asserted", async () => {
      // Called by src/main.jsx before the first render, so this is the startup check.
      const { assertSupabaseConfig } = await importFresh();
      expect(() => assertSupabaseConfig()).toThrow(MESSAGE);
    });

    it("still throws when the client is actually used", async () => {
      // The second half of the safety, and the one that is easy to lose: deferring
      // construction must not mean an unconfigured client quietly comes into existence.
      // Reaching for any property is enough to trigger it.
      const { supabase } = await importFresh();
      expect(() => supabase.from).toThrow(MESSAGE);
    });

    it("reports the missing variables rather than a malformed URL", async () => {
      // Without the assertion inside the lazy constructor, supabase-js would be handed an
      // empty string and would raise its own error about the URL — technically true and
      // useless to whoever forgot to copy .env.local.example.
      const { supabase } = await importFresh();
      expect(() => supabase.auth).toThrow(MESSAGE);
    });

    it("throws when only one of the two is missing", async () => {
      // A half-configured environment is a misconfigured one. This is the case a check on
      // "is anything set" would let through.
      vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
      const { assertSupabaseConfig } = await importFresh();
      expect(() => assertSupabaseConfig()).toThrow(MESSAGE);
    });
  });

  describe("with configuration", () => {
    beforeEach(() => {
      // A syntactically valid project URL that is never contacted: creating a client opens
      // no connection, so this stays a unit test.
      vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
      vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    });

    it("returns the configuration it validated", async () => {
      const { assertSupabaseConfig } = await importFresh();
      expect(assertSupabaseConfig()).toEqual({
        url: "https://example.supabase.co",
        anonKey: "test-anon-key",
      });
    });

    it("exposes a real client through the proxy", async () => {
      const { supabase } = await importFresh();
      expect(typeof supabase.from).toBe("function");
      expect(typeof supabase.channel).toBe("function");
      expect(supabase.auth).toBeTruthy();
    });

    it("builds a working query, with methods bound to the real client", async () => {
      // The failure this guards against is specific to the proxy: if a method were
      // returned unbound, `this` inside supabase-js would be the proxy rather than the
      // client, and anything the library reads off `this` privately would break. A query
      // builder is the shortest path that actually exercises that.
      const { supabase } = await importFresh();
      const query = supabase.from("profiles").select("id");
      expect(query).toBeTruthy();
      expect(typeof query.eq).toBe("function");
    });

    it("creates the client once and reuses it", async () => {
      // It was a module-level singleton before this change and remains one; making it
      // lazy must not turn every property access into a new client.
      const { supabase } = await importFresh();
      expect(supabase.auth).toBe(supabase.auth);
    });
  });
});
