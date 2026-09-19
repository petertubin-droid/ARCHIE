import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { serveWithCors } from "../_shared/serve.ts";

const corsHeaders = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

serveWithCors(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Server not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Verify the caller is authenticated
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Check if user is admin
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") {
    return new Response(JSON.stringify({ error: "Admin access required" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Call the seed function
  const { data, error } = await admin.rpc("seed_reward_catalogue");

  if (error) {
    // Fallback: try direct insert if RPC doesn't exist yet
    const { data: inserted, error: insertError } = await admin
      .from("reward_catalogue")
      .upsert(
        [
          {
            reward_key: "ai_estimate_token",
            name: "AI Estimate Token",
            description:
              "Unlock one additional eligible AI estimate beyond your daily limit.",
            credit_cost: 100,
            reward_type: "ai_token",
            sort_order: 1,
            is_enabled: true,
          },
          {
            reward_key: "premium_pdf_export",
            name: "Premium PDF Export",
            description:
              "Unlock one premium estimate PDF export with branded formatting.",
            credit_cost: 200,
            reward_type: "pdf_export",
            sort_order: 2,
            is_enabled: true,
          },
          {
            reward_key: "advanced_calc_unlock",
            name: "Advanced Calculator Unlock",
            description:
              "Unlock one eligible advanced calculator usage for 24 hours.",
            credit_cost: 300,
            reward_type: "calc_unlock",
            sort_order: 3,
            is_enabled: true,
          },
          {
            reward_key: "premium_week",
            name: "FRELUX Premium Week",
            description:
              "Unlock eligible premium features for 7 days, including advanced calculators and PDF exports.",
            credit_cost: 500,
            reward_type: "premium_week",
            sort_order: 4,
            is_enabled: true,
          },
        ],
        { onConflict: "reward_key" },
      );

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "4 rewards seeded successfully (fallback insert)",
        rewards: inserted ?? [],
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: "4 rewards seeded successfully",
      rewards: data ?? [],
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
