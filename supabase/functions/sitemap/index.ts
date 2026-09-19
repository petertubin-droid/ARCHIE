import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serveWithCors } from "../_shared/serve.ts";

const corsHeaders = {
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SITE_URL = "https://freluxtools.netlify.app";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

serveWithCors(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    // Static public routes — only real routes that exist in App.tsx
    // No private, auth, admin, dashboard, or nonexistent URLs
    const staticUrls = [
      { loc: "/", priority: "1.0", changefreq: "weekly" },
      { loc: "/paint-calculator", priority: "0.9", changefreq: "monthly" },
      { loc: "/cost-estimator", priority: "0.9", changefreq: "monthly" },
      { loc: "/screeding-calculator", priority: "0.9", changefreq: "monthly" },
      {
        loc: "/screeding-cost-estimator",
        priority: "0.8",
        changefreq: "monthly",
      },
      {
        loc: "/pop-ceiling-calculator",
        priority: "0.8",
        changefreq: "monthly",
      },
      {
        loc: "/pop-ceiling-cost-estimator",
        priority: "0.8",
        changefreq: "monthly",
      },
      { loc: "/tile-calculator", priority: "0.8", changefreq: "monthly" },
      { loc: "/tile-cost-estimator", priority: "0.8", changefreq: "monthly" },
      { loc: "/finish-estimator", priority: "0.7", changefreq: "monthly" },
      { loc: "/colors", priority: "0.8", changefreq: "weekly" },
      { loc: "/colors/compare", priority: "0.7", changefreq: "monthly" },
      { loc: "/ai-color-assistant", priority: "0.7", changefreq: "monthly" },
      { loc: "/learn", priority: "0.8", changefreq: "weekly" },
      { loc: "/templates", priority: "0.8", changefreq: "weekly" },
      { loc: "/contact", priority: "0.5", changefreq: "monthly" },
      { loc: "/about", priority: "0.5", changefreq: "monthly" },
      { loc: "/privacy-policy", priority: "0.3", changefreq: "yearly" },
      { loc: "/terms", priority: "0.3", changefreq: "yearly" },
      { loc: "/cookie-policy", priority: "0.3", changefreq: "yearly" },
      { loc: "/disclaimer", priority: "0.3", changefreq: "yearly" },
      { loc: "/ai-disclaimer", priority: "0.3", changefreq: "yearly" },
      { loc: "/marketplace", priority: "0.8", changefreq: "daily" },
      { loc: "/pro-connect", priority: "0.8", changefreq: "daily" },
      {
        loc: "/build-to-roof-estimator",
        priority: "0.9",
        changefreq: "monthly",
      },
      { loc: "/image-estimator", priority: "0.8", changefreq: "monthly" },
      { loc: "/structural-calculator", priority: "0.8", changefreq: "monthly" },
      { loc: "/foundation-calculator", priority: "0.8", changefreq: "monthly" },
      { loc: "/project-timeline", priority: "0.7", changefreq: "monthly" },
      { loc: "/construction-sequence", priority: "0.7", changefreq: "monthly" },
    ];

    const urls: string[] = [];

    // Add static URLs
    for (const u of staticUrls) {
      urls.push(`  <url>
    <loc>${SITE_URL}${escapeXml(u.loc)}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`);
    }

    // Fetch dynamic public content in parallel
    const [
      colorsRes,
      palettesRes,
      articlesRes,
      categoriesRes,
      templatesRes,
      proCategoriesRes,
      proLocationsRes,
      proProfilesRes,
      marketplaceListingsRes,
    ] = await Promise.all([
      fetch(
        `${supabaseUrl}/rest/v1/paint_colors?select=slug,updated_at&is_active=eq.true&order=slug.asc`,
        { headers },
      ),
      fetch(
        `${supabaseUrl}/rest/v1/color_combinations?select=slug,updated_at&is_published=eq.true&order=slug.asc`,
        { headers },
      ),
      fetch(
        `${supabaseUrl}/rest/v1/learn_articles?select=slug,updated_at,published_at&status=eq.published&order=published_at.desc`,
        { headers },
      ),
      fetch(
        `${supabaseUrl}/rest/v1/learn_categories?select=slug,is_active&is_active=eq.true&order=sort_order.asc`,
        { headers },
      ),
      fetch(
        `${supabaseUrl}/rest/v1/calculator_templates?select=slug,updated_at&visibility=eq.public&is_published=eq.true&order=slug.asc`,
        { headers },
      ),
      fetch(
        `${supabaseUrl}/rest/v1/pro_categories?select=slug,name,seo_indexable&is_active=eq.true&seo_indexable=eq.true&order=sort_order.asc`,
        { headers },
      ),
      fetch(
        `${supabaseUrl}/rest/v1/pro_locations?select=slug,state,city,seo_indexable&is_active=eq.true&seo_indexable=eq.true&order=state.asc,city.asc`,
        { headers },
      ),
      fetch(
        `${supabaseUrl}/rest/v1/pro_profiles?select=slug,updated_at,seo_indexable&is_listed=eq.true&seo_indexable=eq.true&verification_status=neq.suspended&order=updated_at.desc`,
        { headers },
      ),
      fetch(
        `${supabaseUrl}/rest/v1/marketplace_listings?select=id,title,updated_at,seo_indexable,location_state,location_city&is_active=eq.true&admin_removed=eq.false&seo_indexable=eq.true&status=in.(open,awarded,in_progress)&order=updated_at.desc&limit=200`,
        { headers },
      ),
    ]);

    // Add active paint colors — /colors/paint/{slug}
    const colors = (await colorsRes.json()) as {
      slug: string;
      updated_at: string;
    }[];
    for (const c of colors) {
      const slug = escapeXml(c.slug);
      const lastmod = new Date(c.updated_at).toISOString().split("T")[0];
      urls.push(`  <url>
    <loc>${SITE_URL}/colors/paint/${slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`);
    }

    // Add published color palettes — /colors/{slug}
    const palettes = (await palettesRes.json()) as {
      slug: string;
      updated_at: string;
    }[];
    for (const p of palettes) {
      const slug = escapeXml(p.slug);
      const lastmod = new Date(p.updated_at).toISOString().split("T")[0];
      urls.push(`  <url>
    <loc>${SITE_URL}/colors/${slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`);
    }

    // Add active learn categories — /learn/category/{slug}
    const categories = (await categoriesRes.json()) as { slug: string }[];
    for (const cat of categories) {
      const slug = escapeXml(cat.slug);
      urls.push(`  <url>
    <loc>${SITE_URL}/learn/category/${slug}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);
    }

    // Add published learn articles — /learn/{slug}
    const articles = (await articlesRes.json()) as {
      slug: string;
      updated_at: string;
      published_at: string;
    }[];
    for (const a of articles) {
      const slug = escapeXml(a.slug);
      const lastmod = escapeXml((a.published_at ?? a.updated_at).split("T")[0]);
      urls.push(`  <url>
    <loc>${SITE_URL}/learn/${slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`);
    }

    // Add published public templates — /templates/{slug}
    const templates = (await templatesRes.json()) as {
      slug: string;
      updated_at: string;
    }[];
    for (const t of templates) {
      const slug = escapeXml(t.slug);
      if (!slug) continue; // skip templates without slugs
      const lastmod = new Date(t.updated_at).toISOString().split("T")[0];
      urls.push(`  <url>
    <loc>${SITE_URL}/templates/${slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`);
    }

    // Add marketplace category pages — /marketplace/category/{slug}
    const proCategories = (await proCategoriesRes.json()) as {
      slug: string;
      name: string;
      seo_indexable: boolean;
    }[];
    for (const cat of proCategories) {
      if (!cat.slug || !cat.seo_indexable) continue;
      const slug = escapeXml(cat.slug);
      urls.push(`  <url>
    <loc>${SITE_URL}/marketplace/category/${slug}</loc>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`);
    }

    // Add marketplace location pages — /marketplace/sellers/{slug}
    const proLocations = (await proLocationsRes.json()) as {
      slug: string;
      state: string;
      city: string;
      seo_indexable: boolean;
    }[];
    for (const loc of proLocations) {
      if (!loc.slug || !loc.seo_indexable) continue;
      const slug = escapeXml(loc.slug);
      urls.push(`  <url>
    <loc>${SITE_URL}/marketplace/sellers/${slug}</loc>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`);
    }

    // Add pro profile pages — /pro-connect/{slug}
    const proProfiles = (await proProfilesRes.json()) as {
      slug: string;
      updated_at: string;
      seo_indexable: boolean;
    }[];
    for (const pro of proProfiles) {
      if (!pro.slug || !pro.seo_indexable) continue;
      const slug = escapeXml(pro.slug);
      const lastmod = new Date(pro.updated_at).toISOString().split("T")[0];
      urls.push(`  <url>
    <loc>${SITE_URL}/pro-connect/${slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`);
    }

    // Add marketplace listing pages — /marketplace/{id}
    const marketplaceListings = (await marketplaceListingsRes.json()) as {
      id: string;
      title: string;
      updated_at: string;
      seo_indexable: boolean;
      location_state: string;
      location_city: string;
    }[];
    for (const listing of marketplaceListings) {
      if (!listing.seo_indexable) continue;
      const id = escapeXml(listing.id);
      const lastmod = new Date(listing.updated_at).toISOString().split("T")[0];
      urls.push(`  <url>
    <loc>${SITE_URL}/marketplace/${id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.6</priority>
  </url>`);
    }

    // Add category + location combo pages — /marketplace/{categorySlug}/{locationSlug}
    for (const cat of proCategories) {
      if (!cat.slug || !cat.seo_indexable) continue;
      for (const loc of proLocations) {
        if (!loc.slug || !loc.seo_indexable) continue;
        const catSlug = escapeXml(cat.slug);
        const locSlug = escapeXml(loc.slug);
        urls.push(`  <url>
    <loc>${SITE_URL}/marketplace/${catSlug}/${locSlug}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>`);
      }
    }

    // Add pro category + location pages — /pro/{categorySlug}/{locationSlug}
    for (const cat of proCategories) {
      if (!cat.slug || !cat.seo_indexable) continue;
      for (const loc of proLocations) {
        if (!loc.slug || !loc.seo_indexable) continue;
        const catSlug = escapeXml(cat.slug);
        const locSlug = escapeXml(loc.slug);
        urls.push(`  <url>
    <loc>${SITE_URL}/pro/${catSlug}/${locSlug}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>`);
      }
    }

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

    return new Response(sitemap, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Failed to generate sitemap" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
