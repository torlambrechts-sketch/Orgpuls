-- platform_api_invariants.sql — the API the platform steers Orgpuls with (0205, X-104), proved on a probe
-- organisation of its own, rolled back.
--
--   1 the six tables are closed: RLS, no policy, no grant to any client role or service_role
--   2 no event may carry anything about a respondent: the registry's fields, against a block list
--   3 platform_emit refuses a field its kind does not list
--   4 an organisation, its billing and its users emit as they change, and a deletion says so once
--   5 the usage tick sends counts only, in the registered fields
--   6 delivery waits for an enabled installation; then claim hands over events and secret, done marks them
--   7 a command needs a valid, short, audience-bound token with the scope; anything else is refused
--   8 a command runs by parameter name, is audited by argument names, and its id cannot be replayed
--   9 a write command does what it says and writes nothing to the old admin log
--  10 who may call what; the audit cannot be rewritten
--  11 nothing written here survives
--  12 deleting an organisation drops its queued events and leaves one empty notice
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/platform_api_invariants.sql

create unlogged table if not exists public._pai(seq int, name text, expected text, actual text, pass bool);
truncate public._pai;

-- a token as the platform would sign it (HS256 under the Vault secret), for the probes below
create or replace function pg_temp.tok(p_claims jsonb) returns text
  language plpgsql as $$
declare
  h text := rtrim(translate(encode(convert_to('{"alg":"HS256","typ":"JWT"}', 'UTF8'), 'base64'), E'+/\n', '-_'), '=');
  p text := rtrim(translate(encode(convert_to(p_claims::text, 'UTF8'), 'base64'), E'+/\n', '-_'), '=');
begin
  return h || '.' || p || '.' ||
    rtrim(translate(encode(extensions.hmac(h || '.' || p, app.platform_secret('token'), 'sha256'), 'base64'), E'+/\n', '-_'), '=');
end $$;

do $$
declare
  v_org   uuid := '00000000-0000-4000-8000-00000000f205';
  v_dl    uuid := '00000000-0000-4000-8000-00000000f20d';
  v_now   bigint := extract(epoch from now())::bigint;
  v_json  jsonb;
  v_txt   text;
  v_n     int;
  v_ok    boolean;
  v_rows  jsonb := '[]';
  v_audit int;
  ok_claims jsonb;
begin
  -- 1 ---------------------------------------------------------------- closed
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'app' and c.relrowsecurity and c.relname in
    ('platform_events', 'platform_event_kinds', 'platform_commands', 'platform_command_map', 'platform_installation');
  v_txt := v_n::text;
  select count(*) into v_n from pg_policies where schemaname = 'app' and tablename like 'platform\_%'
    and tablename in ('platform_events', 'platform_event_kinds', 'platform_commands', 'platform_command_map', 'platform_installation');
  v_txt := v_txt || ',' || v_n;
  select count(*) into v_n from information_schema.role_table_grants
  where table_schema = 'app' and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
    and table_name in ('platform_events', 'platform_event_kinds', 'platform_commands', 'platform_command_map', 'platform_installation');
  v_txt := v_txt || ',' || v_n;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'RLS on all five, no policy, no grant',
    'expected', '5,0,0', 'actual', v_txt, 'pass', v_txt = '5,0,0');

  -- 2 ---------------------------------------------------------------- nothing about a respondent
  select coalesce(string_agg(k.kind || ':' || f, ','), 'none') into v_txt
  from app.platform_event_kinds k cross join unnest(k.fields) f
  where f ~ '(answer|comment|respon|thread|conversation|group|department|invitation|token|opening|value|score|free_text|phone)';
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'no event field names an answer, a comment, a respondent or a group',
    'expected', 'none', 'actual', v_txt, 'pass', v_txt = 'none');

  -- 3 ---------------------------------------------------------------- the registry decides
  begin
    perform app.platform_emit('org.created', null, '{"name":"X","comment":"leak"}'::jsonb);
    v_txt := 'written';
  exception when invalid_parameter_value then
    v_txt := 'refused';
  end;
  begin
    perform app.platform_emit('answers.exported', null, '{}'::jsonb);
    v_txt := v_txt || ',written';
  exception when invalid_parameter_value then
    v_txt := v_txt || ',refused';
  end;
  v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'an unlisted field, and an unregistered kind, are refused',
    'expected', 'refused,refused', 'actual', v_txt, 'pass', v_txt = 'refused,refused');

  begin
    -- 4 -------------------------------------------------------------- what emits
    insert into app.organizations (id, name, org_number, employee_count, mail_enabled, timezone)
    values (v_org, 'Plattform AS', '999000205', 12, true, 'Europe/Oslo');
    insert into auth.users (id, email) values (v_dl, 'dl@plattform-test.example');
    insert into app.profiles (id, full_name) values (v_dl, 'DL') on conflict (id) do nothing;
    insert into app.memberships (org_id, user_id, role, active) values (v_org, v_dl, 'daglig_leder', true);
    update app.billing set plan = 'small', invoice_email = 'f@plattform.example', confirmed_at = now() where org_id = v_org;
    select string_agg(e.kind, ',' order by e.id) into v_txt from app.platform_events e where e.org_id = v_org;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'sign-up, billing and a user emit',
      'expected', 'contains org.created, member.joined, billing.changed', 'actual', v_txt,
      'pass', v_txt like '%org.created%' and v_txt like '%member.joined%' and v_txt like '%billing.changed%');

    -- 5 -------------------------------------------------------------- usage
    perform app.platform_usage_tick();
    select string_agg(k, ',' order by k) into v_txt
    from app.platform_events e cross join jsonb_object_keys(e.payload) k where e.org_id = v_org and e.kind = 'usage.daily';
    select bool_and(k = any ((select fields from app.platform_event_kinds where kind = 'usage.daily')::text[]))
      into v_ok from app.platform_events e cross join jsonb_object_keys(e.payload) k where e.org_id = v_org and e.kind = 'usage.daily';
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'usage sends registered counts only',
      'expected', 'true', 'actual', coalesce(v_ok, false)::text || ' (' || coalesce(v_txt, '') || ')', 'pass', coalesce(v_ok, false));

    -- 6 -------------------------------------------------------------- delivery
    v_json := public.platform_events_claim(50);
    v_txt := coalesce(v_json ->> 'url', 'null') || ',' || jsonb_array_length(v_json -> 'events');
    update app.platform_installation set webhook_url = 'https://platform.example/hooks/orgpuls', enabled = true;
    v_json := public.platform_events_claim(500);
    select count(*) into v_n from jsonb_array_elements(v_json -> 'events') x where (x ->> 'org_id')::uuid = v_org;
    v_txt := v_txt || ',' || (v_json ->> 'url' is not null)::text || ',' || (v_json ->> 'secret' = app.platform_secret('webhook'))::text
          || ',' || (v_n > 0)::text;
    perform public.platform_events_done(array(select (x ->> 'id')::bigint from jsonb_array_elements(v_json -> 'events') x), true);
    select count(*) into v_n from app.platform_events e where e.org_id = v_org and e.delivered_at is null;
    v_txt := v_txt || ',' || v_n;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'nothing goes until an installation is on; then events and secret; done marks them',
      'expected', 'null,0,true,true,true,0', 'actual', v_txt, 'pass', v_txt = 'null,0,true,true,true,0');

    -- 7 -------------------------------------------------------------- the token
    ok_claims := jsonb_build_object('iss', 'platform', 'aud', 'orgpuls', 'sub', 'tor@platform', 'scope', 'orgs:read billing:write',
                                    'iat', v_now, 'exp', v_now + 120);
    v_txt := public.platform_command('nonsense', 'orgs.get', jsonb_build_object('p_org', v_org)) ->> 'error';
    v_txt := v_txt || ',' || (public.platform_command(pg_temp.tok(ok_claims || '{"jti":"t-expired-1","iat":1,"exp":2}'), 'orgs.get', jsonb_build_object('p_org', v_org)) ->> 'error');
    v_txt := v_txt || ',' || (public.platform_command(pg_temp.tok(ok_claims || jsonb_build_object('jti', 't-long-1', 'exp', v_now + 3600)), 'orgs.get', jsonb_build_object('p_org', v_org)) ->> 'error');
    v_txt := v_txt || ',' || (public.platform_command(pg_temp.tok(ok_claims || '{"jti":"t-aud-1","aud":"other"}'), 'orgs.get', jsonb_build_object('p_org', v_org)) ->> 'error');
    v_txt := v_txt || ',' || (public.platform_command(pg_temp.tok(ok_claims || '{"jti":"t-scope-1"}'), 'translations.list', '{"p_locale":"pl"}') ->> 'error');
    v_txt := v_txt || ',' || (public.platform_command(pg_temp.tok(ok_claims || '{"jti":"t-unknown-1"}'), 'answers.export', '{}') ->> 'error');
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'a forged, expired, long, foreign, unscoped or unknown call is refused',
      'expected', 'unauthorized,unauthorized,unauthorized,unauthorized,scope,unknown_command', 'actual', v_txt,
      'pass', v_txt = 'unauthorized,unauthorized,unauthorized,unauthorized,scope,unknown_command');

    -- 8 -------------------------------------------------------------- by name, audited, once
    v_json := public.platform_command(pg_temp.tok(ok_claims || '{"jti":"t-get-001"}'), 'orgs.get', jsonb_build_object('p_org', v_org));
    v_txt := (v_json ->> 'ok') || ',' || (v_json -> 'result' ->> 'name');
    v_txt := v_txt || ',' || (public.platform_command(pg_temp.tok(ok_claims || '{"jti":"t-get-001"}'), 'orgs.get', jsonb_build_object('p_org', v_org)) ->> 'error');
    select v_txt || ',' || c.actor || ',' || array_to_string(c.arg_names, '+') || ',' || c.ok into v_txt
    from app.platform_commands c where c.jti = 't-get-001';
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'runs by parameter name, audited by argument names, refused the second time',
      'expected', 'true,Plattform AS,replay,tor@platform,p_org,true', 'actual', v_txt,
      'pass', v_txt = 'true,Plattform AS,replay,tor@platform,p_org,true');

    -- 9 -------------------------------------------------------------- a write
    select count(*) into v_audit from app.admin_audit;
    update app.billing set confirmed_at = null, trial_ends_at = now() + interval '2 days' where org_id = v_org;
    v_json := public.platform_command(pg_temp.tok(ok_claims || '{"jti":"t-extend-1"}'), 'billing.extend_trial',
                                      jsonb_build_object('p_org', v_org, 'p_days', 10, 'p_reason', 'Probe'));
    select (v_json ->> 'ok') || ',' || (b.trial_ends_at > now() + interval '10 days')::text || ','
        || ((select count(*) from app.admin_audit) = v_audit)::text into v_txt
    from app.billing b where b.org_id = v_org;
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'extend_trial through the API extends it, and writes no admin audit row',
      'expected', 'true,true,true', 'actual', v_txt || ' ' || coalesce(v_json ->> 'error', ''), 'pass', v_txt = 'true,true,true');

    -- the audit is fixed
    begin
      update app.platform_commands set actor = 'someone else' where jti = 't-get-001';
      v_ok := false;
    exception when restrict_violation then
      v_ok := true;
    end;
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'the audit cannot be rewritten; anon may call platform_command and nothing else',
      'expected', 'true', 'actual', (v_ok
        and has_function_privilege('anon', 'public.platform_command(text,text,jsonb)', 'execute')
        and not has_function_privilege('anon', 'public.platform_events_claim(integer)', 'execute')
        and not has_function_privilege('authenticated', 'public.platform_events_done(bigint[],boolean,text)', 'execute')
        and not has_function_privilege('authenticated', 'app.platform_emit(text,uuid,jsonb)', 'execute')
        and not has_function_privilege('authenticated', 'app.platform_jwt_claims(text)', 'execute')
        and not has_function_privilege('authenticated', 'app.platform_secret(text)', 'execute')
        and not has_function_privilege('authenticated', 'app.op_org_get(uuid)', 'execute'))::text,
      'pass', v_ok
        and has_function_privilege('anon', 'public.platform_command(text,text,jsonb)', 'execute')
        and not has_function_privilege('anon', 'public.platform_events_claim(integer)', 'execute')
        and not has_function_privilege('authenticated', 'public.platform_events_done(bigint[],boolean,text)', 'execute')
        and not has_function_privilege('authenticated', 'app.platform_emit(text,uuid,jsonb)', 'execute')
        and not has_function_privilege('authenticated', 'app.platform_jwt_claims(text)', 'execute')
        and not has_function_privilege('authenticated', 'app.platform_secret(text)', 'execute')
        and not has_function_privilege('authenticated', 'app.op_org_get(uuid)', 'execute'));

    -- 12 ------------------------------------------------------------- a deletion
    delete from app.organizations where id = v_org;
    select coalesce(string_agg(e.kind || ':' || e.payload::text, ','), 'none') into v_txt from app.platform_events e where e.org_id = v_org;
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'deleting the organisation drops what was queued about it and says so once, with nothing in it',
      'expected', 'org.deleted:{}', 'actual', v_txt, 'pass', v_txt = 'org.deleted:{}');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 11 --------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from app.organizations where id = v_org;
  select v_txt || ',' || count(*) into v_txt from app.platform_commands where jti like 't-%';
  v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'every probe row was rolled back', 'expected', '0,0', 'actual', v_txt, 'pass', v_txt = '0,0');

  insert into public._pai
  select (r ->> 'seq')::int, r ->> 'name', r ->> 'expected', r ->> 'actual', (r ->> 'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._pai order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._pai;
  if v_failed is not null then raise exception 'platform api invariants failed: %', v_failed; end if;
  if v_count <> 12 then raise exception 'platform api invariants: expected 12 rows, got %', v_count; end if;
end $$;
