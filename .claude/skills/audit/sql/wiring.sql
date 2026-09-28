-- /audit — stored but never read. A column no function reads and no view shows is a candidate
-- for a setting that does nothing, or data written for no one (P0-1, P0-3, P0-4 were all this).
-- The script scripts/audit/wiring.mjs joins this with the application code; this file alone gives
-- the database's half. psql "$DB" -X -A -F ' | ' -f .claude/skills/audit/sql/wiring.sql

with fn as (
  select lower(string_agg(p.prosrc, E'\n')) as src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('app', 'public')
), vw as (
  select lower(string_agg(pg_get_viewdef(c.oid), E'\n')) as src
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('v', 'm') and n.nspname in ('app', 'public')
)
select 'W1 column in no function or view' as check, c.table_name || '.' || c.column_name as object, c.data_type as detail
from information_schema.columns c, fn, vw
where c.table_schema = 'app'
  and c.column_name not in ('id', 'org_id', 'created_at', 'updated_at')
  and fn.src !~ ('\m' || c.column_name || '\M')
  and coalesce(vw.src, '') !~ ('\m' || c.column_name || '\M')
order by 2;
