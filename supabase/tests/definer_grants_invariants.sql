-- definer_grants_invariants.sql — which SECURITY DEFINER functions in app a client may call (0191),
-- proved against the live schema.
--
--   * the two CRM helpers 0191 closed are not executable by anon or authenticated (1, 2)
--   * every SECURITY DEFINER function in app that anon or authenticated may execute is on the list
--     below: org-scoped helpers that RLS policies call, and trigger functions (a trigger function
--     cannot be called through PostgREST). A new definer that returns data and forgets its revoke
--     fails here instead of shipping open, as crm_follow_audience did (3)
--   * nothing is written
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/definer_grants_invariants.sql

create unlogged table if not exists public._dgr(seq int, name text, expected text, actual text, pass bool);
truncate public._dgr;

do $$
declare
  v_rows jsonb := '[]';
  v_txt  text;
  -- reviewed 2026-10-03: RLS helpers (is_org_member, has_role, k_threshold, module_visible) take an id
  -- and answer for the caller only. Granted to authenticated on purpose: visible_groups (0022, the
  -- caller's own groups), round_answered and module_usable (0071, a yes or no). The rest return trigger
  -- and are listed so that the list reads as the whole set; check 3 skips triggers anyway
  v_allowed text[] := array[
    'app.is_org_member(uuid)', 'app.has_role(uuid,app.org_role[])', 'app.k_threshold(uuid)',
    'app.module_visible(uuid)', 'app.visible_groups(uuid)', 'app.round_answered(uuid)',
    'app.module_usable(uuid,uuid)',
    'app.check_extra_options()', 'app.check_extra_answer()', 'app.measures_same_org()',
    'app.measures_closing_rule()', 'app.measure_groups_same_org()', 'app.risk_assessments_same_org()',
    'app.risk_factor_in_round()', 'app.round_groups_same_org()', 'app.year_wheels_touch()',
    'app.membership_group_consistent()', 'app.measure_effect_round_ok()', 'app.information_round_ok()',
    'app.address_problems_clear()', 'app.item_translation_zauto()', 'app.message_override_guard()',
    'app.employee_teams_identity_changed()', 'app.entra_tenant_teams_reset()', 'app.slack_install_removed()',
    'app.slack_enabled_needs_install()', 'app.employee_slack_email_changed()'];
begin
  -- 1, 2 ------------------------------------------------------------- the two closed by 0191
  select (has_function_privilege('anon', 'app.crm_follow_audience(app.crm_campaigns)', 'execute')
       or has_function_privilege('authenticated', 'app.crm_follow_audience(app.crm_campaigns)', 'execute'))::text into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'crm_follow_audience is closed to clients', 'expected', 'false', 'actual', v_txt, 'pass', v_txt = 'false');
  select (has_function_privilege('anon', 'app.crm_chain_depth(uuid)', 'execute')
       or has_function_privilege('authenticated', 'app.crm_chain_depth(uuid)', 'execute'))::text into v_txt;
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'crm_chain_depth is closed to clients', 'expected', 'false', 'actual', v_txt, 'pass', v_txt = 'false');

  -- 3 ---------------------------------------------------------------- nothing else is open
  select coalesce(string_agg(f, ', ' order by f), '') into v_txt from (
    select p.oid::regprocedure::text as f
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.prosecdef
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
      and p.prorettype <> 'trigger'::regtype
  ) x where f <> all (v_allowed);
  v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'no unlisted app definer (other than a trigger) is callable by a client', 'expected', '', 'actual', v_txt, 'pass', v_txt = '');

  insert into public._dgr
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._dgr order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._dgr;
  if v_failed is not null then raise exception 'definer grants invariants failed: %', v_failed; end if;
  if v_count <> 3 then raise exception 'definer grants invariants: expected 3 rows, got %', v_count; end if;
end $$;
