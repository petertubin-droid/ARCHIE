-- Force Row Level Security on all remaining tables that have RLS enabled
-- but were missing FORCE. Without FORCE, the table owner role can bypass
-- RLS policies entirely — this closes that gap so RLS is enforced for
-- every role except those with the BYPASSRLS attribute (e.g. Supabase's
-- service_role, which continues to work exactly as before for edge
-- functions using base44.asServiceRole / the service role key).
--
-- Verified against live database state (pg_class.relforcerowsecurity):
-- 180 total tables, 122 already forced, 58 enabled-but-not-forced (fixed
-- here), 0 with RLS disabled entirely.
--
-- This is a defense-in-depth hardening migration: it does not change any
-- policy logic, grants, or application behavior. It only ensures RLS
-- policies apply even to the table owner.

ALTER TABLE public."activity_streaks" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."ad_postback_handlers" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."ai_feature_costs" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."ai_feature_usage" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."credit_transactions" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."credit_wallets" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."em_ai_verification_states" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."em_engine_settings" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."em_material_profiles" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."em_roof_materials" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."em_roof_sections" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."em_rule_metadata" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."em_waste_configs" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."error_alert_config" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."error_fix_history" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."estimation_results" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."estimation_usage_daily" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."market_calculator_config" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."market_material_rules" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."market_pricing" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."market_products" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."market_profiles" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."marketplace_bids" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."marketplace_disputes" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."marketplace_favorites" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."marketplace_listings" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."marketplace_milestones" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."marketplace_orders" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."marketplace_payments" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."marketplace_pricing_units" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."marketplace_product_categories" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."marketplace_product_inquiries" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."marketplace_products" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."marketplace_reports" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."marketplace_reviews" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."marketplace_search_logs" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."marketplace_seller_profiles" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."mi_anomaly_flags" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."mi_approved_prices" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."mi_crawl_logs" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."mi_price_observations" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."mi_product_aliases" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."mi_provider_usage" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."mi_providers" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."mi_sources" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."price_scan_history" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."reward_catalogue" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."reward_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."reward_redemptions" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."reward_settings" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."rewarded_ad_credit_config" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."rewarded_ad_credit_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."roof_view_config" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."seo_page_settings" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."system_health_checks" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."user_market_preferences" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."user_mission_progress" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."weekly_missions" FORCE ROW LEVEL SECURITY;
