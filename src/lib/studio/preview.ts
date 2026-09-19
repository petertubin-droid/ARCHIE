// =========================================================
// ARCHIE CODING STUDIO — LIVE PREVIEW COMPOSER (CLIENT)
//
// Deterministic, pure TypeScript. Composes the ACTUAL project
// files into a single executable document for the sandboxed
// preview iframe:
//   * stylesheets and scripts referenced in the manifest are
//     INLINED from the real file contents
//   * internal page links are routed through the preview
//     harness (postMessage to the studio UI)
//   * the document in the iframe IS the running code — no
//     screenshots, no mock rendering, ever.
// =========================================================

import type { StudioFile } from "@studio-shared/studio/validate";

export interface ComposedPreview {
  /** The full HTML document that runs in the sandboxed iframe. */
  html: string;
  /** Unresolved local references (should be empty after validation). */
  warnings: string[];
}

/** Inline every <link rel="stylesheet" href="local.css"> and
 *  <script src="local.js"> with the REAL file contents. */
function inlineAssets(
  html: string,
  files: Map<string, string>,
  warnings: string[],
): string {
  html = html.replace(
    /<link[^>]+href=["']([^"']+\.css)["'][^>]*>/gi,
    (match, href: string) => {
      const content = files.get(href);
      if (content === undefined) {
        warnings.push(`stylesheet "${href}" not found in manifest`);
        return match;
      }
      return `<style data-archie-src="${href}">\n${content}\n</style>`;
    },
  );
  html = html.replace(
    /<script[^>]+src=["']([^"']+\.js)["'][^>]*><\/script>/gi,
    (match, src: string) => {
      const content = files.get(src);
      if (content === undefined) {
        warnings.push(`script "${src}" not found in manifest`);
        return match;
      }
      return `<script data-archie-src="${src}">\n${content}\n</script>`;
    },
  );
  return html;
}

/** Rewrite internal page links (e.g. href="about.html") into
 *  preview-routed navigations. External/http links are left
 *  untouched — the sandbox blocks top-level navigation. */
function routeInternalLinks(
  html: string,
  pages: Set<string>,
  warnings: string[],
): string {
  return html.replace(
    /<a\s([^>]*?)href=["']([^"']+)["']([^>]*)>/gi,
    (match, pre: string, href: string, post: string) => {
      if (/^(https?:|mailto:|tel:|#|data:)/i.test(href)) return match;
      const clean = href.split("#")[0].split("?")[0];
      if (!clean || !pages.has(clean)) {
        warnings.push(`link "${href}" is not a project page`);
        return match;
      }
      return `<a ${pre}data-archie-nav="${clean}" href="#" ${post.replace(/target=["'][^"']*["']/i, "")}>`;
    },
  );
}

/** The tiny preview-harness router (NOT project code — clearly
 *  labeled). Clicking an internal link posts a message to the
 *  studio UI, which composes that page's preview next. */
const HARNESS_ROUTER = `
<script data-archie-harness="router">
(function () {
  "use strict";
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[data-archie-nav]") : null;
    if (!a) return;
    e.preventDefault();
    parent.postMessage({ type: "archie-studio-nav", page: a.getAttribute("data-archie-nav") }, "*");
  }, true);
})();
</script>`;

/**
 * Compose a page of the project into an executable preview
 * document. Deterministic: same files → same document.
 */
export function composePreview(
  files: StudioFile[],
  pagePath: string,
): ComposedPreview {
  const map = new Map(files.map((f) => [f.path, f.content]));
  const pages = new Set(
    files.filter((f) => f.path.endsWith(".html")).map((f) => f.path),
  );
  const warnings: string[] = [];

  const target = pagePath.endsWith(".html") ? pagePath : "index.html";
  let html = map.get(target);
  if (html === undefined) {
    return {
      html: `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Preview</title></head><body style="font-family:sans-serif;padding:2rem;color:#b91c1c">Preview page "${target}" was not found in this project.</body></html>`,
      warnings: [`page "${target}" not found in manifest`],
    };
  }

  html = inlineAssets(html, map, warnings);
  html = routeInternalLinks(html, pages, warnings);

  // Inject the harness router right before </body>.
  html = html.includes("</body>")
    ? html.replace("</body>", `${HARNESS_ROUTER}\n</body>`)
    : html + HARNESS_ROUTER;

  return { html, warnings };
}
