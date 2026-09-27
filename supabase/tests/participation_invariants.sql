-- participation_invariants.sql — no participation count for a group under k (0073, D-123).
--
--   * participation, while a round is open: a group with fewer than k people asked shows its
--     headcount and no count, and the smallest shown group is held back with it when together
--     they are still under k (1, 2)
--   * the organisation's own total is unchanged (3)
--   * the result readers carry no `n` for those groups either, and do for the others (4)
--   * the rule's helpers are not callable by a client (5)
--   * nothing written here survives (6)
--
-- It runs on the demo organisation (scripts/seed/demo-org.mjs), whose Økonomi og HR has four
-- people: under k in every round, so the rule always has something to hide.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/participation_invariants.sql

create unlogged table if not exists public._pi(seq int, name text, expected text, actual text, pass bool);
truncate public._pi;

do $$
declare
  v_org    uuid := 'de000000-0000-4000-8000-000000000001';
  v_user   uuid := '00000000-0000-4000-8000-00000000b401';
  v_open   uuid;
  v_closed uuid;
  v_json   jsonb;
  v_rows   jsonb := '[]';
  v_txt    text;
  v_small  text;
  v_answered int;
  claims   constant text := '{"sub":"%s","role":"authenticated","aal":"aal1"}';
begin
  select r.id into v_open from app.rounds r where r.org_id = v_org and r.status = 'apen' order by r.opens_at desc limit 1;
  select r.id into v_closed from app.rounds r join app.measurements m on m.id = r.measurement_id
  where r.org_id = v_org and r.status = 'lukket' and m.kind = 'grunnlinje' order by r.opens_at desc limit 1;
  if v_open is null or v_closed is null then
    raise exception 'participation invariants: the demo organisation needs an open and a closed round';
  end if;
  -- the smallest group at or over k, the one given up to protect Økonomi og HR
  select g.name into v_small from app.groups g join app.employees e on e.group_id = g.id
  join app.invitations i on i.employee_id = e.id and i.round_id = v_open
  where g.org_id = v_org group by g.id, g.name having count(*) >= 5 order by count(*), g.id::text limit 1;

  select count(*) into v_answered from app.invitations i where i.round_id = v_open and i.responded_at is not null;

  begin
    insert into auth.users (id, email) values (v_user, 'vo@pi-test.example');
    insert into app.profiles (id, full_name) values (v_user, 'Verne Ombud') on conflict (id) do nothing;
    insert into app.memberships (org_id, user_id, role, active) values (v_org, v_user, 'verneombud', true);

    perform set_config('request.jwt.claims', format(claims, v_user), true);
    set local role authenticated;

    -- 1 -------------------------------------------------------------- under k: no count
    v_json := public.participation(v_open);
    select concat_ws(',', g->>'headcount', coalesce(g->>'answered', 'null'), coalesce(g->>'pct', 'null'), g->>'thin') into v_txt
    from jsonb_array_elements(v_json->'groups') g where g->>'group_name' = 'Økonomi og HR';
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'a group under k shows its headcount and no count while the round is open',
      'expected', '4,null,null,true', 'actual', v_txt, 'pass', v_txt = '4,null,null,true');

    -- 2 -------------------------------------------------------------- and the next-smallest with it
    select concat_ws(',', coalesce(g->>'answered', 'null'), g->>'thin') into v_txt
    from jsonb_array_elements(v_json->'groups') g where g->>'group_name' = v_small;
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'the smallest shown group is held back so the small one cannot be worked out',
      'expected', 'null,false', 'actual', v_txt, 'pass', v_txt = 'null,false');

    -- 3 -------------------------------------------------------------- the whole organisation
    select ((v_json->>'answered')::int = v_answered)::text
         || ',' || (select count(*) from jsonb_array_elements(v_json->'groups') g where g->>'answered' is not null)::text
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'the organisation total is the real one; the other four groups keep their counts',
      'expected', 'true,4', 'actual', v_txt, 'pass', v_txt = 'true,4');

    -- 4 -------------------------------------------------------------- results carry no n either
    v_json := public.results_by_group(v_closed);
    select string_agg(g->>'group_name' || '=' || coalesce(g->>'n', 'null'), ',' order by g->>'group_name') into v_txt
    from jsonb_array_elements(v_json->'groups') g where g->>'group_name' in ('Økonomi og HR', 'Drift og vedlikehold');
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'results_by_group: no n for a group under k; n for a large group',
      'expected', 'Drift og vedlikehold=<n>,Økonomi og HR=null', 'actual', v_txt,
      'pass', v_txt ~ '^Drift og vedlikehold=[0-9]+,Økonomi og HR=null$');

    -- 5 -------------------------------------------------------------- the helpers are the server's
    begin
      perform app.participation_visibility(v_open);
      v_txt := 'callable';
    exception when insufficient_privilege then v_txt := 'refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a client cannot call the visibility helper',
      'expected', 'refused', 'actual', v_txt, 'pass', v_txt = 'refused');

    reset role;
    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'every probe change was rolled back', 'expected', 'true',
    'actual', (not exists (select 1 from auth.users where email like '%@pi-test.example'))::text,
    'pass', not exists (select 1 from auth.users where email like '%@pi-test.example'));

  insert into public._pi
  select (x->>'seq')::int, x->>'name', x->>'expected', x->>'actual', (x->>'pass')::boolean from jsonb_array_elements(v_rows) x;
end $$;

select seq, name, expected, actual, pass from public._pi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._pi;
  if v_failed is not null then raise exception 'participation invariants failed: %', v_failed; end if;
  if v_count <> 6 then raise exception 'participation invariants: expected 6 rows, got %', v_count; end if;
end $$;

drop table public._pi;
