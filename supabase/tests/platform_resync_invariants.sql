-- platform_resync_invariants.sql — orgs.resync tells the platform again what it should know (0207, X-106),
-- proved against the live schema.
--
--   1 the operation refuses anybody but a verified platform command, and no client role may execute it
--   2 through platform_command with a signed orgs:read token, it queues for the organisation exactly
--     org.created, its billing, its active members (an inactive one is left out) and today's usage, and
--     returns how many
--   3 each queued event carries only its kind's registered fields
--   4 a demo organisation is nobody's customer: a resync of all queues nothing for it
--   5 nothing written here survives
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/platform_resync_invariants.sql

create unlogged table if not exists public._prs(seq int, name text, expected text, actual text, pass bool);
truncate public._prs;

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
  v_org   uuid := gen_random_uuid();
  v_demo  uuid := gen_random_uuid();
  v_dl    uuid := gen_random_uuid();
  v_av    uuid := gen_random_uuid();
  v_now   bigint := extract(epoch from now())::bigint;
  v_rows  jsonb := '[]'::jsonb;
  v_json  jsonb;
  v_txt   text;
  v_n     int;
begin
  -- 1 ---------------------------------------------------------------- closed
  perform set_config('app.platform_actor', '', true);
  begin
    perform app.op_platform_resync(null);
    v_txt := 'ran';
  exception when insufficient_privilege then
    v_txt := 'refused';
  end;
  v_txt := v_txt || ',' || (has_function_privilege('anon', 'app.op_platform_resync(uuid)', 'execute')
                            or has_function_privilege('authenticated', 'app.op_platform_resync(uuid)', 'execute')
                            or has_function_privilege('service_role', 'app.op_platform_resync(uuid)', 'execute'))::text
           || ',' || coalesce((select scope from app.platform_command_map where command = 'orgs.resync'), 'unmapped');
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'refused without a platform command; no client role executes it; mapped as orgs:read',
    'expected', 'refused,false,orgs:read', 'actual', v_txt, 'pass', v_txt = 'refused,false,orgs:read');

  begin
    insert into app.organizations (id, name, org_number, employee_count, mail_enabled, timezone)
    values (v_org, 'Resync AS', '999000207', 14, true, 'Europe/Oslo'),
           (v_demo, 'Resync Demo AS', null, 10, false, 'Europe/Oslo');
    insert into app.demo_orgs (org_id, kind) values (v_demo, 'sandbox');
    insert into auth.users (id, email) values (v_dl, 'dl@resync-test.example'), (v_av, 'av@resync-test.example');
    insert into app.profiles (id, full_name) values (v_dl, 'DL Resync'), (v_av, 'AV Resync') on conflict (id) do nothing;
    insert into app.memberships (org_id, user_id, role, active) values (v_org, v_dl, 'daglig_leder', true),
                                                                       (v_org, v_av, 'avdelingsleder', false);
    -- what the triggers queued is cleared, so only the resync's events are counted
    delete from app.platform_events where org_id in (v_org, v_demo);

    -- 2 -------------------------------------------------------------- through the API
    v_json := public.platform_command(
      pg_temp.tok(jsonb_build_object('aud', 'orgpuls', 'sub', 'test@platform', 'scope', 'orgs:read',
                                     'jti', 't-resync-' || v_org, 'iat', v_now, 'exp', v_now + 120)),
      'orgs.resync', jsonb_build_object('p_org', v_org));
    select string_agg(e.kind, ' ' order by e.kind) into v_txt from app.platform_events e where e.org_id = v_org;
    v_n := (select count(*) from app.platform_events e where e.org_id = v_org);
    v_txt := coalesce(v_json ->> 'ok', 'null') || ',' || coalesce(v_json ->> 'result', 'null') || '=' || v_n || ',' || coalesce(v_txt, 'none')
             || ',' || coalesce((select e.payload ->> 'email' from app.platform_events e where e.org_id = v_org and e.kind = 'member.joined'), 'none');
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'orgs.resync queues org.created, billing, active members and usage, and counts them',
      'expected', 'true,' || v_n || '=' || v_n || ',billing.changed member.joined org.created usage.daily,dl@resync-test.example',
      'actual', v_txt,
      'pass', v_txt = 'true,' || v_n || '=' || v_n || ',billing.changed member.joined org.created usage.daily,dl@resync-test.example');

    -- 3 -------------------------------------------------------------- only registered fields
    select count(*) into v_n from app.platform_events e join app.platform_event_kinds k on k.kind = e.kind
    where e.org_id = v_org and exists (select 1 from jsonb_object_keys(e.payload) f where f <> all (k.fields));
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'every queued event carries only its kind''s fields',
      'expected', '0', 'actual', v_n::text, 'pass', v_n = 0);

    -- 4 -------------------------------------------------------------- a demo is nobody's customer
    perform set_config('app.platform_actor', 'test@platform', true);
    perform app.op_platform_resync(null);
    perform set_config('app.platform_actor', '', true);
    select count(*) into v_n from app.platform_events e where e.org_id = v_demo;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a resync of all queues nothing for a demo organisation',
      'expected', '0', 'actual', v_n::text, 'pass', v_n = 0);

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 5 ---------------------------------------------------------------- nothing survives
  select count(*) into v_n from (
    select 1 from app.organizations where id in (v_org, v_demo)
    union all select 1 from auth.users where email like '%resync-test.example'
    union all select 1 from app.platform_commands where jti like 't-resync-%') x;
  v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_n::text, 'pass', v_n = 0);

  insert into public._prs
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._prs order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._prs;
  if v_failed is not null then raise exception 'platform resync invariants failed: %', v_failed; end if;
  if v_count <> 5 then raise exception 'platform resync invariants: expected 5 rows, got %', v_count; end if;
end $$;

drop table public._prs;
