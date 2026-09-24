-- release_invariants.sql — what `app.cell_release` counts (0042, counted in one pass by 0045).
--
-- The release rule itself (k per cell, complementary suppression, the factor row) is proved
-- by suppression_invariants.sql and hardening_invariants.sql. This proves the counts the rule
-- runs on, for every closed round of every organisation in the database:
--
--   * no client role may call it, and it runs as definer with an empty search_path (1, 2)
--   * every statement cell's n is the number of respondents who answered that statement in
--     that group, counted directly (3)
--   * there is a cell for every statement and group that has answers, and no other (4)
--   * there is one factor row per factor and released group, and n is its smallest statement (5)
--   * a round that has not closed releases nothing (6)
--
-- Every row must read pass = true.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/release_invariants.sql

create unlogged table if not exists public._rli(seq int, name text, expected text, actual text, pass bool);
truncate public._rli;

do $$
declare
  v_rows jsonb := '[]';
  v_bad  int;
  v_cnt  int;
begin
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'anon and authenticated may not execute cell_release', 'expected', 'false',
    'actual', (has_function_privilege('anon', 'app.cell_release(uuid)', 'execute')
               or has_function_privilege('authenticated', 'app.cell_release(uuid)', 'execute'))::text,
    'pass', not (has_function_privilege('anon', 'app.cell_release(uuid)', 'execute')
               or has_function_privilege('authenticated', 'app.cell_release(uuid)', 'execute')));
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'cell_release is SECURITY DEFINER with an empty search_path',
    'expected', 'true {search_path=""}',
    'actual', (select p.prosecdef::text || ' ' || p.proconfig::text from pg_proc p where p.oid = 'app.cell_release(uuid)'::regprocedure),
    'pass', (select p.prosecdef and p.proconfig = array['search_path=""'] from pg_proc p where p.oid = 'app.cell_release(uuid)'::regprocedure));

  create temp table _cells on commit drop as
  select r.id as round_id, c.* from app.rounds r cross join lateral app.cell_release(r.id) c where r.status = 'lukket';
  create temp table _direct on commit drop as
  select resp.round_id, a.factor_key, a.ordinal, resp.group_id, count(distinct a.response_id)::int as n
  from app.answers a join app.responses resp on resp.id = a.response_id
  join app.rounds r on r.id = resp.round_id and r.status = 'lukket'
  group by resp.round_id, a.factor_key, a.ordinal, resp.group_id;

  select count(*) into v_cnt from _cells where ordinal >= 1;
  select count(*) into v_bad from _cells c join _direct d
    on d.round_id = c.round_id and d.factor_key = c.factor_key and d.ordinal = c.ordinal
   and d.group_id is not distinct from c.group_id
  where c.ordinal >= 1 and c.n <> d.n;
  v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'every statement cell counts its respondents',
    'expected', '> 0 cells, 0 differ', 'actual', v_cnt || ' cells, ' || v_bad || ' differ', 'pass', v_cnt > 0 and v_bad = 0);

  select count(*) into v_bad from (
    select round_id, factor_key, ordinal, group_id from _cells where ordinal >= 1
    except all
    select round_id, factor_key, ordinal, group_id from _direct
  ) x;
  select v_bad + count(*) into v_bad from (
    select round_id, factor_key, ordinal, group_id from _direct
    except all
    select round_id, factor_key, ordinal, group_id from _cells where ordinal >= 1
  ) x;
  v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'one cell per statement and group with answers, and no other',
    'expected', '0 missing or extra', 'actual', v_bad || ' missing or extra', 'pass', v_bad = 0);

  select count(*) into v_bad from (
    select f.round_id, f.factor_key, f.group_id, count(*) as rows_, min(f.n) as n,
           (select min(coalesce(d.n, 0)) from app.statements st
              left join _direct d on d.round_id = f.round_id and d.factor_key = st.factor_key
                                 and d.ordinal = st.ordinal and d.group_id is not distinct from f.group_id
            where st.factor_key = f.factor_key) as smallest
    from _cells f where f.ordinal = 0
    group by f.round_id, f.factor_key, f.group_id
  ) x where x.rows_ <> 1 or x.n <> x.smallest;
  select count(*) into v_cnt from _cells where ordinal = 0;
  v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'one factor row per factor and group, at its smallest statement',
    'expected', '> 0 rows, 0 wrong', 'actual', v_cnt || ' rows, ' || v_bad || ' wrong', 'pass', v_cnt > 0 and v_bad = 0);

  select count(*) into v_cnt from app.rounds r cross join lateral app.cell_release(r.id) c where r.status <> 'lukket';
  v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a round that has not closed releases nothing',
    'expected', '0', 'actual', v_cnt::text, 'pass', v_cnt = 0);

  insert into public._rli
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean
  from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._rli order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*)
    into v_failed, v_count from public._rli;
  if v_failed is not null then
    raise exception 'release invariants failed: %', v_failed;
  end if;
  if v_count <> 6 then
    raise exception 'release invariants: expected 6 rows, got %', v_count;
  end if;
end $$;

drop table public._rli;
