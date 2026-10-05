-- locale_pilot_invariants.sql — a survey language tried by named organisations first (0085, D-132).
--
--   * the table: RLS on, no policy, no grant; the operation executable by neither anon nor authenticated (1)
--   * only the platform adds or removes a pilot, with a reason: a daglig leder can reach neither the operation
--     nor the table, and without a platform actor the operation refuses (2, 0206)
--   * a pilot shows in its organisation's rounds' language state, and in no other organisation's;
--     removing it takes it away (3)
--   * through the platform API, each add and removal does what it says and is recorded in
--     app.platform_commands (4, 0205/0206: the record of an operation since the admin log went)
--   * nothing written here survives (5)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/locale_pilot_invariants.sql

create unlogged table if not exists public._lpi(seq int, name text, expected text, actual text, pass bool);
truncate public._lpi;

-- a command token as the platform would sign it (HS256 under the Vault secret)
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
  v_org   uuid := '00000000-0000-4000-8000-000000000001';
  v_other uuid;
  v_dl    uuid;
  v_now   bigint := extract(epoch from now())::bigint;
  v_claims jsonb;
  v_meas  uuid;
  v_round uuid;
  v_oround uuid;
  v_rows  jsonb := '[]';
  v_txt   text;
  claims  constant text := '{"sub":"%s","role":"authenticated","aal":"aal2"}';
begin
  select m.user_id into v_dl from app.memberships m where m.org_id = v_org and m.role = 'daglig_leder' and m.active limit 1;

  -- 1 -------------------------------------------------------------- the grant surface
  select c.relrowsecurity::text || '/' || (select count(*) from pg_policies where schemaname = 'app' and tablename = 'locale_pilots')::text
         || '/' || has_table_privilege('authenticated', 'app.locale_pilots', 'select')::text
         || '/' || has_table_privilege('authenticated', 'app.locale_pilots', 'insert')::text
         || '/' || has_table_privilege('anon', 'app.locale_pilots', 'select')::text
         || '/' || has_function_privilege('anon', 'app.op_locale_pilot(text, uuid, boolean, text)', 'execute')::text
         || '/' || has_function_privilege('authenticated', 'app.op_locale_pilot(text, uuid, boolean, text)', 'execute')::text
    into v_txt
  from pg_class c where c.oid = 'app.locale_pilots'::regclass;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'RLS on, no policy, no grant; the operation not for anon or authenticated',
    'expected', 'true/0/false/false/false/false/false', 'actual', v_txt, 'pass', v_txt = 'true/0/false/false/false/false/false');

  begin
    select o.id into v_other from app.organizations o where o.id <> v_org order by o.created_at limit 1;
    insert into app.measurements (org_id, kind, year) values (v_org, 'oppfolging', 2093) returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'planlagt', '2093-09-01', '2093-09-12') returning id into v_round;
    select r.id into v_oround from app.rounds r where r.org_id = v_other limit 1;

    -- 2 ------------------------------------------------------------ who
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    set local role authenticated;
    begin
      perform app.op_locale_pilot('pl', v_org, true, 'Pilotkunde');
      v_txt := 'ran';
    exception when insufficient_privilege then v_txt := 'denied';
    end;
    begin
      insert into app.locale_pilots (locale, org_id) values ('pl', v_org);
      v_txt := v_txt || ',inserted';
    exception when insufficient_privilege then v_txt := v_txt || ',refused';
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    -- nobody: no platform actor
    perform set_config('app.platform_actor', '', true);
    v_txt := v_txt || ',' || (app.op_locale_pilot('pl', v_org, true, 'Pilotkunde')->>'error')
          || ',' || (app.op_locale_pilots()->>'error');
    -- the platform, as platform_command sets it after verifying a token
    perform set_config('app.platform_actor', 'test@platform', true);
    v_txt := v_txt || ',' || (app.op_locale_pilot('pl', v_org, true, 'x')->>'error')
          || ',' || (app.op_locale_pilot('de', v_org, true, 'Pilotkunde')->>'error')
          || ',' || (app.op_locale_pilot('pl', gen_random_uuid(), true, 'Pilotkunde')->>'error')
          || ',' || (app.op_locale_pilot('pl', v_org, true, 'Pilotkunde, trinn 2')->>'ok');
    -- a statement of its own: the list is stable, and sees what the statements before it wrote
    v_txt := v_txt || ',' || (select count(*) from jsonb_array_elements(app.op_locale_pilots()->'pilots') p
                              where p->>'org_id' = v_org::text and p->>'locale' = 'pl');
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'a daglig leder reaches neither the operation nor the table; without a platform actor it refuses; the platform with a reason may',
      'expected', 'denied,refused,not_allowed,not_allowed,reason_required,invalid,not_found,true,1', 'actual', v_txt,
      'pass', v_txt = 'denied,refused,not_allowed,not_allowed,reason_required,invalid,not_found,true,1');

    -- 3 ------------------------------------------------------------ what it does
    v_txt := concat_ws(',', app.round_locale_state(v_round)#>>'{pl,pilot}', app.round_locale_state(v_round)#>>'{lt,pilot}',
                       coalesce(app.round_locale_state(v_oround)#>>'{pl,pilot}', 'no-round'));
    perform app.op_locale_pilot('pl', v_org, false, 'Pilot avsluttet');
    v_txt := v_txt || ',' || (app.round_locale_state(v_round)#>>'{pl,pilot}');
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'the pilot is in its organisation''s rounds only, until removed',
      'expected', 'true,false,false,false', 'actual', v_txt, 'pass', v_txt = 'true,false,false,false');

    -- 4 ------------------------------------------------------------ through the API, recorded
    perform set_config('app.platform_actor', '', true);
    v_claims := jsonb_build_object('aud', 'orgpuls', 'sub', 'tor@platform', 'scope', 'modules:write', 'iat', v_now, 'exp', v_now + 120);
    v_txt := (public.platform_command(pg_temp.tok(v_claims || '{"jti":"lpi-add-001"}'), 'locales.pilot',
                jsonb_build_object('p_locale', 'pl', 'p_org', v_org, 'p_on', true, 'p_reason', 'Pilotkunde, trinn 3')) #>> '{result,ok}');
    -- the state in a statement of its own, which sees what the command wrote
    v_txt := v_txt || ',' || (app.round_locale_state(v_round)#>>'{pl,pilot}');
    v_txt := v_txt || ',' || (public.platform_command(pg_temp.tok(v_claims || '{"jti":"lpi-remove-001"}'), 'locales.pilot',
                jsonb_build_object('p_locale', 'pl', 'p_org', v_org, 'p_on', false, 'p_reason', 'Pilot avsluttet')) #>> '{result,ok}');
    v_txt := v_txt || ',' || (app.round_locale_state(v_round)#>>'{pl,pilot}');
    select v_txt || ' ' || string_agg(c.command || ':' || c.actor || ':' || array_to_string(c.arg_names, '+') || ':' || c.ok, ' ' order by c.id)
      into v_txt
    from app.platform_commands c where c.jti in ('lpi-add-001', 'lpi-remove-001');
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'through the platform API each add and removal takes effect and is recorded',
      'expected', 'true,true,true,false locales.pilot:tor@platform:p_locale+p_on+p_org+p_reason:true locales.pilot:tor@platform:p_locale+p_on+p_org+p_reason:true',
      'actual', v_txt,
      'pass', v_txt = 'true,true,true,false locales.pilot:tor@platform:p_locale+p_on+p_org+p_reason:true locales.pilot:tor@platform:p_locale+p_on+p_org+p_reason:true');

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  v_txt := (not exists (select 1 from app.locale_pilots where org_id = v_org)
            and not exists (select 1 from app.platform_commands where jti like 'lpi-%'))::text;
  v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'every probe change was rolled back', 'expected', 'true', 'actual', v_txt, 'pass', v_txt = 'true');

  insert into public._lpi
  select (x->>'seq')::int, x->>'name', x->>'expected', x->>'actual', (x->>'pass')::boolean from jsonb_array_elements(v_rows) x;
end $$;

select seq, name, expected, actual, pass from public._lpi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._lpi;
  if v_failed is not null then raise exception 'locale pilot invariants failed: %', v_failed; end if;
  if v_count <> 5 then raise exception 'locale pilot invariants: expected 5 rows, got %', v_count; end if;
end $$;

drop table public._lpi;
