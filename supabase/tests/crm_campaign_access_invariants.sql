-- crm_campaign_access_invariants.sql — the campaign area's readers say what the permission set allows, and the
-- campaigns reader says what the product's lifecycle mails did (0200, D-215), proved against the live schema.
--
--   * every campaign-area reader carries `may` with the campaigns area's five actions; the senders reader also
--     `may_settings`; the campaigns reader `lifecycle` (1)
--   * marketing, under the Regular set, may do all of it (2)
--   * the analyst, under Read only, may read the reports only, and the database refuses what `may` leaves out (3)
--   * a custom set with edit alone: `may` and the database agree, a new list refused and an existing one edited (4)
--   * the lifecycle block follows the switch and counts sent mails per step in the last 30 days only (5)
--   * nothing written here survives (6)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/crm_campaign_access_invariants.sql

create unlogged table if not exists public._ccai(seq int, name text, expected text, actual text, pass bool);
truncate public._ccai;

do $$
declare
  v_su    uuid := '00000000-0000-4000-8000-0000000cc101';
  v_m1    uuid := '00000000-0000-4000-8000-0000000cc102';
  v_ana   uuid := '00000000-0000-4000-8000-0000000cc103';
  v_user  uuid := '00000000-0000-4000-8000-0000000cc104';
  claims  text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
  v_rows  jsonb := '[]';
  v_txt   text;
  v_ok    boolean;
  v_list  uuid;
  v_set   uuid;
  v_org   uuid;
  v_was   boolean;
  v_json  jsonb;
  may_of  text := '%s:%s:%s:%s:%s';
begin
  begin
    insert into auth.users (id, email) values (v_su, 'super@cci-test.example'), (v_m1, 'm1@cci-test.example'),
      (v_ana, 'ana@cci-test.example'), (v_user, 'user@cci-test.example');
    insert into app.platform_admins (user_id, role) values (v_su, 'super_admin'), (v_m1, 'marketing'), (v_ana, 'analyst');

    -- 1 -------------------------------------------------------------- the keys
    perform set_config('request.jwt.claims', format(claims, v_su, 'aal2'), true);
    v_ok := (select bool_and((r -> 'may') ?& array['create', 'edit', 'delete', 'send', 'reports'] and jsonb_typeof(r -> 'may') = 'object')
             from unnest(array[public.admin_crm_campaigns(), public.admin_crm_lists(), public.admin_crm_segments(), public.admin_crm_templates(),
                               public.admin_crm_senders()]) r)
      and jsonb_typeof(public.admin_crm_senders() -> 'may_settings') = 'boolean'
      and jsonb_typeof(public.admin_crm_campaigns() -> 'lifecycle' -> 'enabled') = 'boolean'
      and jsonb_typeof(public.admin_crm_campaigns() -> 'lifecycle' -> 'sent_30d') = 'object';
    v_list := (public.admin_crm_list_save(null, jsonb_build_object('key', 'cci-list', 'name_no', 'CCI', 'name_en', 'CCI'))->>'id')::uuid;
    v_ok := v_ok and (public.admin_crm_campaign((public.admin_crm_campaign_save(null, jsonb_build_object('name', 'CCI kampanje', 'kind', 'newsletter'))->>'id')::uuid) -> 'may') ? 'send';
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'every campaign-area reader carries may with the five actions; senders may_settings; campaigns the lifecycle block',
      'expected', 'true', 'actual', coalesce(v_ok::text, 'null'), 'pass', coalesce(v_ok, false));

    -- 2 -------------------------------------------------------------- Regular
    perform set_config('request.jwt.claims', format(claims, v_m1, 'aal2'), true);
    v_json := public.admin_crm_campaigns() -> 'may';
    v_txt := format(may_of, v_json->>'create', v_json->>'edit', v_json->>'delete', v_json->>'send', v_json->>'reports')
      || '|' || (public.admin_crm_senders() ->> 'may_settings');
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'marketing, under Regular, may do all of it',
      'expected', 'true:true:true:true:true|true', 'actual', v_txt, 'pass', v_txt = 'true:true:true:true:true|true');

    -- 3 -------------------------------------------------------------- Read only
    perform set_config('request.jwt.claims', format(claims, v_ana, 'aal2'), true);
    v_json := public.admin_crm_lists() -> 'may';
    v_txt := format(may_of, v_json->>'create', v_json->>'edit', v_json->>'delete', v_json->>'send', v_json->>'reports')
      || '|' || (public.admin_crm_senders() ->> 'may_settings')
      || '|' || coalesce(public.admin_crm_list_save(null, jsonb_build_object('key', 'cci-two', 'name_no', 'To', 'name_en', 'Two'))->>'error', 'ok')
      || ',' || coalesce(public.admin_crm_segment_save(null, 'CCI segment', '{}'::jsonb)->>'error', 'ok')
      || ',' || coalesce(public.admin_crm_sender_save(null, jsonb_build_object('name', 'CCI', 'email', 'cci@orgpuls.test'))->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'the analyst, under Read only, may read the reports only; the database refuses what may leaves out',
      'expected', 'false:false:false:false:true|false|not_allowed,not_allowed,not_allowed', 'actual', v_txt,
      'pass', v_txt = 'false:false:false:false:true|false|not_allowed,not_allowed,not_allowed');

    -- 4 -------------------------------------------------------------- a custom set with edit alone
    perform set_config('request.jwt.claims', format(claims, v_su, 'aal2'), true);
    v_set := (public.admin_crm_set_save(null, 'Campaign editor', array['campaigns.edit'], null)->>'id')::uuid;
    perform public.admin_crm_staff_access(v_m1, v_set, null, null);
    perform set_config('request.jwt.claims', format(claims, v_m1, 'aal2'), true);
    v_json := public.admin_crm_segments() -> 'may';
    v_txt := (v_json->>'create') || ':' || (v_json->>'edit')
      || '|' || coalesce(public.admin_crm_list_save(null, jsonb_build_object('key', 'cci-three', 'name_no', 'Tre', 'name_en', 'Three'))->>'error', 'ok')
      || ',' || coalesce(public.admin_crm_list_save(v_list, jsonb_build_object('name_no', 'CCI ny', 'name_en', 'CCI new'))->>'error', 'ok');
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a set with edit alone: may and the database agree, a new list refused, an existing one edited',
      'expected', 'false:true|not_allowed,ok', 'actual', v_txt, 'pass', v_txt = 'false:true|not_allowed,ok');

    -- 5 -------------------------------------------------------------- the lifecycle mails
    perform set_config('request.jwt.claims', format(claims, v_su, 'aal2'), true);
    select o.id into v_org from app.organizations o order by o.created_at limit 1;
    select s.enabled into v_was from app.lifecycle_settings s;
    v_json := public.admin_crm_campaigns() -> 'lifecycle' -> 'sent_30d';
    insert into app.lifecycle_mail (org_id, user_id, step, status, sent_at) values
      (v_org, v_user, 'welcome', 'sent', now() - interval '2 days'),
      (v_org, v_user, 'trial_ending', 'sent', now() - interval '40 days'),
      (v_org, v_user, 'read_only_soon', 'pending', null);
    v_txt := ((public.admin_crm_campaigns() -> 'lifecycle' -> 'sent_30d' ->> 'welcome')::int - coalesce((v_json ->> 'welcome')::int, 0))
      || ':' || ((coalesce((public.admin_crm_campaigns() -> 'lifecycle' -> 'sent_30d' ->> 'trial_ending')::int, 0)) - coalesce((v_json ->> 'trial_ending')::int, 0))
      || ':' || ((coalesce((public.admin_crm_campaigns() -> 'lifecycle' -> 'sent_30d' ->> 'read_only_soon')::int, 0)) - coalesce((v_json ->> 'read_only_soon')::int, 0))
      || '|' || ((public.admin_crm_campaigns() -> 'lifecycle' ->> 'enabled') = v_was::text)::text;
    update app.lifecycle_settings set enabled = not v_was;
    v_txt := v_txt || ',' || ((public.admin_crm_campaigns() -> 'lifecycle' ->> 'enabled') = (not v_was)::text)::text;
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'the lifecycle block follows the switch and counts sent mails per step in the last 30 days only',
      'expected', '1:0:0|true,true', 'actual', v_txt, 'pass', v_txt = '1:0:0|true,true');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 6 ---------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select email from auth.users where email like '%@cci-test.example'
    union all select key from app.crm_lists where key like 'cci-%'
    union all select name from app.crm_permission_sets where name = 'Campaign editor'
    union all select name from app.crm_campaigns where name = 'CCI kampanje') x;
  v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._ccai
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._ccai order by seq;

do $$
declare
  v_failed text;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) into v_failed from public._ccai where not pass;
  if v_failed is not null then
    raise exception 'crm campaign access invariants failed: %', v_failed;
  end if;
end $$;
