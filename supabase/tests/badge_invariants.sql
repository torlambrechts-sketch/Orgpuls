-- badge_invariants.sql — the Kommentarer badge (0036), proved against the live schema.
--
--   * anon may not call it (1)
--   * it holds no privilege of its own: SECURITY INVOKER (2)
--   * for a daglig leder it is exactly the "venter" rows conversations() returns (3)
--   * a verneombud, who reads no comments, and a signed-in non-member get 0 (4, 5)
--   * an avdelingsleder gets their department's count and never more than the daglig leder (6)
--   * nothing written here survives (7)
--
-- Reads the design fixture's organisation. Every row must read pass = true.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/badge_invariants.sql

create unlogged table if not exists public._bdgi(seq int, name text, expected text, actual text, pass bool);
truncate public._bdgi;

do $$
declare
  v_org  uuid := '00000000-0000-4000-8000-000000000001';
  v_vo   uuid := '00000000-0000-4000-8000-0000000b0001';
  v_al   uuid := '00000000-0000-4000-8000-0000000b0002';
  v_out  uuid := '00000000-0000-4000-8000-0000000b0003';
  v_dl   uuid;
  v_grp  uuid;
  v_rows jsonb := '[]';
  v_n    int;
  v_want int;
  v_dl_n int;
  v_cnt  int;
begin
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'anon may not execute it', 'expected', 'false',
    'actual', has_function_privilege('anon', 'public.unanswered_threads()', 'execute')::text,
    'pass', not has_function_privilege('anon', 'public.unanswered_threads()', 'execute'));

  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'it is SECURITY INVOKER', 'expected', 'false',
    'actual', (select p.prosecdef::text from pg_proc p where p.oid = 'public.unanswered_threads()'::regprocedure),
    'pass', not (select p.prosecdef from pg_proc p where p.oid = 'public.unanswered_threads()'::regprocedure));

  select m.user_id into v_dl from app.memberships m
  where m.org_id = v_org and m.active and m.role = 'daglig_leder' order by m.id limit 1;
  select g.id into v_grp from app.groups g where g.org_id = v_org and g.name = 'Prosjekt';

  begin
    insert into auth.users (id, email) values
      (v_vo, 'vo@badge-test.example'), (v_al, 'al@badge-test.example'), (v_out, 'out@badge-test.example');
    insert into app.profiles (id, full_name) values (v_vo, 'VO'), (v_al, 'AL'), (v_out, 'OUT');
    insert into app.memberships (org_id, user_id, role) values (v_org, v_vo, 'verneombud');
    insert into app.memberships (org_id, user_id, role, group_id) values (v_org, v_al, 'avdelingsleder', v_grp);

    perform set_config('request.jwt.claims', json_build_object('sub', v_dl, 'role', 'authenticated')::text, true);
    v_dl_n := public.unanswered_threads();
    select count(*) into v_want
    from jsonb_array_elements(public.conversations(null)->'threads') t where t->>'state' = 'venter';
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a daglig leder sees the venter rows of conversations()',
      'expected', v_want::text || ' (and more than 0)', 'actual', v_dl_n::text, 'pass', v_dl_n = v_want and v_dl_n > 0);

    perform set_config('request.jwt.claims', json_build_object('sub', v_vo, 'role', 'authenticated')::text, true);
    v_n := public.unanswered_threads();
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a verneombud reads no comments, so no badge',
      'expected', '0', 'actual', v_n::text, 'pass', v_n = 0);

    perform set_config('request.jwt.claims', json_build_object('sub', v_out, 'role', 'authenticated')::text, true);
    v_n := public.unanswered_threads();
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a signed-in non-member gets 0',
      'expected', '0', 'actual', v_n::text, 'pass', v_n = 0);

    perform set_config('request.jwt.claims', json_build_object('sub', v_al, 'role', 'authenticated')::text, true);
    v_n := public.unanswered_threads();
    select count(*) into v_want
    from jsonb_array_elements(public.conversations(null)->'threads') t where t->>'state' = 'venter';
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'an avdelingsleder counts their department, within the whole',
      'expected', v_want::text || ' and <= ' || v_dl_n, 'actual', v_n::text, 'pass', v_n = v_want and v_n <= v_dl_n);

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  select count(*) into v_cnt from auth.users where id in (v_vo, v_al, v_out);
  v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'every probe row was rolled back',
    'expected', '0', 'actual', v_cnt::text, 'pass', v_cnt = 0);

  insert into public._bdgi
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean
  from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._bdgi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._bdgi;
  if v_failed is not null then
    raise exception 'badge invariants failed: %', v_failed;
  end if;
  if v_count <> 7 then
    raise exception 'badge invariants: expected 7 rows, got %', v_count;
  end if;
end $$;

drop table public._bdgi;
