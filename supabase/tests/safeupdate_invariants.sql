-- The API's connections load pg-safeupdate: an UPDATE or DELETE without a WHERE clause is refused.
-- The suites run as the database owner, where it is not loaded, so a function that updates a
-- one-row table without a WHERE passes every suite here and fails in production, the only place it
-- is called through the API (0145: the Brønnøysund poll's end and the dry-run switch, D-184).
--
-- 1 no function in `app` or `public` updates or deletes from an `app` table without a WHERE clause;
--   a statement is read from the function's source up to its semicolon, comments removed
-- 2 the scan finds such a statement when there is one (a probe function, rolled back)

create unlogged table if not exists public._safeupd(seq int, name text, expected text, actual text, pass bool);
truncate public._safeupd;

create or replace function pg_temp.safeupdate_offenders() returns jsonb
  language sql stable
as $fn$
  select coalesce(jsonb_agg(distinct n.nspname || '.' || p.proname order by n.nspname || '.' || p.proname), '[]')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  cross join lateral regexp_matches(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'),
                                    '(\m(?:update\s+app\.[a-z_0-9]+|delete\s+from\s+app\.[a-z_0-9]+)\M[^;]*;)', 'gi') m
  where n.nspname in ('app', 'public') and p.prolang = (select oid from pg_language where lanname = 'plpgsql')
    and m[1] !~* '\mwhere\M'
$fn$;

do $$
declare
  v_txt  text;
  v_rows jsonb := '[]';
begin
  -- 1 --------------------------------------------------------------- every function names its rows
  v_txt := pg_temp.safeupdate_offenders()::text;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'no function in app or public updates or deletes an app table without a WHERE clause (pg-safeupdate refuses it through the API)',
    'expected', '[]', 'actual', v_txt, 'pass', v_txt = '[]');

  -- 2 --------------------------------------------------------------- the scan sees one
  begin
    execute $p$create function app._safeupd_probe() returns void language plpgsql as 'begin update app.brreg_settings set dry_run = dry_run; end'$p$;
    v_txt := (pg_temp.safeupdate_offenders() ? 'app._safeupd_probe')::text;
    raise exception 'rollback';
  exception when others then if sqlerrm <> 'rollback' then raise; end if;
  end;
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'the scan names a function that updates a one-row table without a WHERE clause',
    'expected', 'true', 'actual', v_txt, 'pass', v_txt = 'true');

  insert into public._safeupd
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._safeupd order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._safeupd;
  if v_failed is not null then raise exception 'safeupdate invariants failed: %', v_failed; end if;
  if v_count <> 2 then raise exception 'safeupdate invariants: expected 2 rows, got %', v_count; end if;
end $$;
