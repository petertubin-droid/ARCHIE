// Vitest setup for edge-function tests.
//
// Intercepts every supabase-js import variant the functions use
// (`npm:…@2`, `npm:…@2.45.4`, `https://esm.sh/…`) and replaces
// createClient with the harness fake. The raw specifier is matched
// BEFORE alias resolution so version suffixes never reach the graph.
//
// vi.mock calls are hoisted above every import — they must be
// written out explicitly (no loops).

import { vi } from "vitest";

vi.mock("npm:@supabase/supabase-js@2", () => ({
  createClient: () => {
    const { makeMockClient } = globalThis.__archieTestHarness!;
    return makeMockClient();
  },
}));

vi.mock("npm:@supabase/supabase-js@2.45.4", () => ({
  createClient: () => {
    const { makeMockClient } = globalThis.__archieTestHarness!;
    return makeMockClient();
  },
}));

vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({
  createClient: () => {
    const { makeMockClient } = globalThis.__archieTestHarness!;
    return makeMockClient();
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => {
    const { makeMockClient } = globalThis.__archieTestHarness!;
    return makeMockClient();
  },
}));

// Type-only edge-runtime ambient import used by some functions.
vi.mock("jsr:@supabase/functions-js/edge-runtime.d.ts", () => ({}));

// The mock factories above run before this module's imports settle,
// so they reach the harness through a global set here — importing
// harness.ts directly inside each factory would be hoisted too and
// break vi.mock's boundary.
import * as harness from "./harness.ts";
(globalThis as any).__archieTestHarness = harness;

// Install the Deno shim BEFORE any function module is imported by a
// test file. The serve shim captures the handler; env vars get
// test values (functions only read them at import time).
import { installDeno, interceptSupabaseRest } from "./harness.ts";
interceptSupabaseRest();

installDeno({
  SUPABASE_URL: "https://test-project.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
});
