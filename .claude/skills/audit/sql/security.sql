-- /audit — the database's security posture, from the catalog. Every row returned is a finding.
-- psql "$DB" -X -A -F ' | ' -f .claude/skills/audit/sql/security.sql

-- S1 a table in app or public without row level security
select 'S1 no RLS' as check, n.nspname || '.' || c.relname as object, '' as detail
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p') and n.nspname in ('app', 'public') and not c.relrowsecurity and c.relname not like '\_%'
union all
-- S2 an answer table with any policy, or any grant to a client role (invariant 1, 2)
select 'S2 answer table readable', 'app.' || t, coalesce((select string_agg(policyname, ',') from pg_policies p where p.schemaname = 'app' and p.tablename = t), '')
       || case when has_table_privilege('authenticated', 'app.' || t, 'select') or has_table_privilege('anon', 'app.' || t, 'select') then ' +grant' else '' end
from unnest(array['responses', 'answers', 'extra_answers', 'response_comments', 'org_question_answers']) t
where to_regclass('app.' || t) is not null
  and (exists (select 1 from pg_policies p where p.schemaname = 'app' and p.tablename = t)
       or has_table_privilege('authenticated', 'app.' || t, 'select') or has_table_privilege('anon', 'app.' || t, 'select'))
union all
-- S3 a SECURITY DEFINER function without a fixed search_path
select 'S3 definer without search_path', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ''
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.prosecdef and n.nspname in ('app', 'public')
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
union all
-- S4 a function anon may execute: each must be a deliberate public entry point (review the list)
select 'S4 anon executes', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', case when p.prosecdef then 'definer' else 'invoker' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
  and p.proname not like 'pg\_%' and p.prokind = 'f'
union all
-- S5 a table a client role may write directly (writes belong in functions here)
select 'S5 client writes table', n.nspname || '.' || c.relname,
       concat_ws(',', case when has_table_privilege(r, c.oid, 'insert') then 'insert' end,
                      case when has_table_privilege(r, c.oid, 'update') then 'update' end,
                      case when has_table_privilege(r, c.oid, 'delete') then 'delete' end) || ' as ' || r
from pg_class c join pg_namespace n on n.oid = c.relnamespace cross join unnest(array['anon', 'authenticated']) r
where c.relkind = 'r' and n.nspname = 'app'
  and (has_table_privilege(r, c.oid, 'insert') or has_table_privilege(r, c.oid, 'update') or has_table_privilege(r, c.oid, 'delete'))
union all
-- S6 the k floor is still a function returning 3, the default one returning 5 (invariant 1, D-198)
select 'S6 k floor', 'app.k_floor()', coalesce((select app.k_floor()::text), 'missing')
where coalesce((select app.k_floor()), -1) <> 3
union all
select 'S6 k default', 'app.k_min()', coalesce((select app.k_min()::text), 'missing')
where coalesce((select app.k_min()), -1) <> 5
union all
-- S7 app.responses carries a column that could link a person (invariant 2)
select 'S7 responses linkage column', 'app.responses.' || a.attname, format_type(a.atttypid, a.atttypmod)
from pg_attribute a
where a.attrelid = 'app.responses'::regclass and a.attnum > 0 and not a.attisdropped
  and a.attname ~ '(employee|invitation|token|user|email|phone|name|ip|agent|session)'
order by 1, 2;
