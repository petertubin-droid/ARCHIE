/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname_new = path.dirname(fileURLToPath(import.meta.url));

// Two test projects under one config, so a bare `npx vitest run`
// (CI + `npm test`) covers both:
//
//   1. app            — React components/pages under happy-dom
//   2. edge-functions  — Supabase Edge Functions under node.
//      The functions target the Deno edge runtime:
//        * `npm:`/`esm.sh` imports → aliased to local packages
//        * `Deno.env.get` / `Deno.serve` → shimmed by
//          _shared/testing/setup.ts BEFORE each module imports
//      The harness captures the handler each function registers
//      through serveWithCors(), so tests call the REAL handler
//      with REAL Request objects — only the Supabase client
//      (and thus the network) is mocked.

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname_new, "./src"),
      "@studio-shared": path.resolve(
        __dirname_new,
        "./supabase/functions/_shared",
      ),
    },
  },
  test: {
    globals: true,
    // Heavy page modules (full calculator pages) can take over the
    // default 5s just to import under happy-dom in CI sandboxes.
    testTimeout: 20_000,
    projects: [
      {
        extends: true,
        test: {
          name: "app",
          environment: "happy-dom",
          // Never fetch/execute external ad-network scripts during
          // tests — the ad slot components inject them into <head>
          // and happy-dom would otherwise download the real tags
          // over the network.
          environmentOptions: {
            happyDOM: {
              settings: {
                disableJavaScriptFileLoading: true,
                disableCSSFileLoading: true,
              },
            },
          },
          setupFiles: ["./src/test/setup.ts"],
          include: ["src/**/*.{test,spec}.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "edge-functions",
          environment: "node",
          // Fresh module state per test — every function registers
          // its handler at import time and the Deno shim must
          // re-capture.
          isolate: true,
          include: ["supabase/functions/**/*.test.ts"],
          setupFiles: ["./supabase/functions/_shared/testing/setup.ts"],
        },
        resolve: {
          alias: [
            {
              // `npm:<pkg>[@<version>]` → `<pkg>` (from node_modules)
              find: /^npm:(.+?)(?:@[\d][\w.]*)?$/,
              replacement: "$1",
            },
            {
              // `https://esm.sh/<pkg>[@<version>]` → `<pkg>`
              find: /^https:\/\/esm\.sh\/(.+?)(?:@[\d][\w.]*)?$/,
              replacement: "$1",
            },
          ],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/lib/**", "src/components/**", "src/pages/**"],
      exclude: ["src/test/**", "**/*.d.ts"],
    },
  },
});
