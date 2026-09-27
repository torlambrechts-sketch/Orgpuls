-- locale_pilot_invariants.sql — a survey language tried by named organisations first (0085, D-132).
--
--   * the table: RLS on, no policy, no grant (1)
--   * only a super-admin adds or removes a pilot, with a reason; a daglig leder cannot (2)
--   * a pilot shows in its organisation's rounds' language state, and in no other organisation's;
--     removing it takes it away (3)
--   * every change is audited (4)
--   * nothing written here survives (5)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/locale_pilot_invariants.sql

create unlogged table if not exists public._lpi(seq int, name text, expected text, actual text, pass bool);
truncate public._lpi;

do $$
declare
  v_org   uuid := '00000000-0000-4000-8000-000000000001';
  v_other uuid;
  v_dl    uuid;
  v_sa    uuid := '00000000-0000-4000-8000-00000000c851';
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
         || '/' || has_function_privilege('anon', 'public.admin_locale_pilot(text, uuid, boolean, text)', 'execute')::text
    into v_txt
  from pg_class c where c.oid = 'app.locale_pilots'::regclass;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'RLS on, no policy, no grant; the write path not for anon',
    'expected', 'true/0/false/false/false/false', 'actual', v_txt, 'pass', v_txt = 'true/0/false/false/false/false');

  begin
    insert into auth.users (id, email) values (v_sa, 'sa@lpi-test.example');
    insert into app.platform_admins (user_id, role) values (v_sa, 'super_admin');
    select o.id into v_other from app.organizations o where o.id <> v_org order by o.created_at limit 1;
    insert into app.measurements (org_id, kind, year) values (v_org, 'oppfolging', 2093) returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'planlagt', '2093-09-01', '2093-09-12') returning id into v_round;
    select r.id into v_oround from app.rounds r where r.org_id = v_other limit 1;

    -- 2 ------------------------------------------------------------ who
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    set local role authenticated;
    v_txt := public.admin_locale_pilot('pl', v_org, true, 'Pilotkunde')->>'error';
    begin
      insert into app.locale_pilots (locale, org_id) values ('pl', v_org);
      v_txt := v_txt || ',inserted';
    exception when insufficient_privilege then v_txt := v_txt || ',refused';
    end;
    reset role;
    perform set_config('request.jwt.claims', format(claims, v_sa), true);
    set local role authenticated;
    v_txt := v_txt || ',' || (public.admin_locale_pilot('pl', v_org, true, 'x')->>'error')
          || ',' || (public.admin_locale_pilot('de', v_org, true, 'Pilotkunde')->>'error')
          || ',' || (public.admin_locale_pilot('pl', gen_random_uuid(), true, 'Pilotkunde')->>'error')
          || ',' || (public.admin_locale_pilot('pl', v_org, true, 'Pilotkunde, trinn 2')->>'ok');
    -- a statement of its own: the list is stable, and sees what the statements before it wrote
    v_txt := v_txt || ',' || (select count(*) from jsonb_array_elements(public.admin_locale_pilots()->'pilots') p
                              where p->>'org_id' = v_org::text and p->>'locale' = 'pl');
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'a daglig leder may not, through the function or the table; a super-admin with a reason may',
      'expected', 'not_allowed,refused,reason_required,invalid,not_found,true,1', 'actual', v_txt,
      'pass', v_txt = 'not_allowed,refused,reason_required,invalid,not_found,true,1');

    -- 3 ------------------------------------------------------------ what it does
    v_txt := concat_ws(',', app.round_locale_state(v_round)#>>'{pl,pilot}', app.round_locale_state(v_round)#>>'{lt,pilot}',
                       coalesce(app.round_locale_state(v_oround)#>>'{pl,pilot}', 'no-round'));
    set local role authenticated;
    perform public.admin_locale_pilot('pl', v_org, false, 'Pilot avsluttet');
    reset role;
    v_txt := v_txt || ',' || (app.round_locale_state(v_round)#>>'{pl,pilot}');
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'the pilot is in its organisation''s rounds only, until removed',
      'expected', 'true,false,false,false', 'actual', v_txt, 'pass', v_txt = 'true,false,false,false');

    -- 4 ------------------------------------------------------------ audited
    select string_agg(a.action || ':' || a.target_id || ':' || coalesce(a.reason, ''), ' ' order by a.id) into v_txt
    from app.admin_audit a where a.admin_id = v_sa and a.action like 'locale.%';
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'each add and removal is audited with its reason',
      'expected', 'locale.pilot_add:pl:Pilotkunde, trinn 2 locale.pilot_remove:pl:Pilot avsluttet', 'actual', v_txt,
      'pass', v_txt = 'locale.pilot_add:pl:Pilotkunde, trinn 2 locale.pilot_remove:pl:Pilot avsluttet');

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  v_txt := (not exists (select 1 from app.locale_pilots where org_id = v_org)
            and not exists (select 1 from app.platform_admins where user_id = v_sa))::text;
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
