-- 0191 — two CRM helpers no client may call (D-207)
--
-- app.crm_follow_audience(app.crm_campaigns) (0111, 0137) is SECURITY DEFINER and returns
-- (contact_id, email): the contacts a campaign's first mail reached. app.crm_chain_depth(uuid) (0111)
-- walks a campaign chain. Neither migration revoked EXECUTE, so both kept PostgreSQL's default grant to
-- PUBLIC, and the app schema is exposed to PostgREST (supabase/config.toml). An anonymous
-- POST /rest/v1/rpc/crm_follow_audience with a campaign id in the row's follows_id returned that
-- campaign's recipients (proved on a local stack, 2026-10-03; docs/crm-enrichment/06-QUESTIONS.md Q1).
--
-- Every caller is itself SECURITY DEFINER and owned by postgres (crm_mail_claim, crm_follow_done,
-- crm_step_tasks, admin_crm_campaign_pipeline, admin_crm_campaign_resend, admin_crm_sequence,
-- admin_crm_step_save, admin_crm_journeys), so it runs as the owner and keeps working. The dispatcher
-- reaches them only through crm_mail_claim. supabase/tests/definer_grants_invariants.sql fails if a
-- new SECURITY DEFINER function in app is callable by anon or authenticated without being on its list.

revoke all on function app.crm_follow_audience(app.crm_campaigns) from public, anon, authenticated;
revoke all on function app.crm_chain_depth(uuid) from public, anon, authenticated;
