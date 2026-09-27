-- tests/invariants/invariants.sql — the engagement non-negotiables I1–I7 (engagement-phases.md
-- § 2.7), checked on the Lumio QA tenant (scripts/qa/seed.mjs) and on the schema itself.
-- I3 (nothing a respondent page sends carries a token, an IP or a user agent) is a browser
-- check: qa/e2e/invariants.spec.ts. `npm run test:invariants` runs both.
--
-- I4 is as decided 2026-09-27 (DECISION_LOG, D-123): no per-person participation, and none
-- per group under the threshold — nor for a group whose count would give one away.
--
-- The tables of respondent-generated content are named in one list below. A phase that adds
-- one (votes, suggestions) adds it here in the same commit; any table with a foreign key to
-- app.responses is included whether or not it is listed.
--
--   psql "$QA_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/invariants/invariants.sql

create unlogged table if not exists public._inv(seq int, id text, name text, expected text, actual text, pass bool);
truncate public._inv;

do $$
declare
  v_org     uuid := 'a1000000-0000-4000-8000-000000000001';
  v_kari    uuid;
  v_per     uuid;
  v_closed  uuid;
  v_open    uuid;
  v_rows    jsonb := '[]';
  v_json    jsonb;
  v_txt     text;
  v_n       int;
  claims    constant text := '{"sub":"%s","role":"authenticated","aal":"aal1"}';
  -- respondent-generated content: answers, comments, counts, and what later phases add
  v_content text[] := array['responses', 'answers', 'extra_answers', 'response_comments', 'module_answers',
                            'module_segment_answers', 'org_count_answers', 'priority_votes', 'factor_suggestions'];
  v_tables  text[];
begin
  select id into v_kari from auth.users where email = 'kari@lumio.example';
  select id into v_per from auth.users where email = 'per@lumio.example';
  select r.id into v_closed from app.rounds r join app.measurements m on m.id = r.measurement_id
  where r.org_id = v_org and r.status = 'lukket' and m.kind = 'grunnlinje' order by r.opens_at desc limit 1;
  select r.id into v_open from app.rounds r where r.org_id = v_org and r.status = 'apen' limit 1;
  if v_kari is null or v_closed is null or v_open is null then
    raise exception 'invariants: the Lumio QA tenant is missing — run npm run qa:seed';
  end if;

  select array_agg(distinct t) into v_tables from (
    select unnest(v_content) as t
    union
    select cl.relname::text from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid join pg_namespace n on n.oid = cl.relnamespace
    where n.nspname = 'app' and c.contype = 'f' and c.confrelid = 'app.responses'::regclass
  ) x where exists (select 1 from information_schema.tables it where it.table_schema = 'app' and it.table_name = x.t);

  perform set_config('request.jwt.claims', format(claims, v_kari), true);
  set local role authenticated;

  -- I1 ----------------------------------------------------------------- no values under k
  v_json := jsonb_build_object(
    'by_group', public.results_by_group(v_closed), 'items', public.results_items(v_closed),
    'modules', public.module_results(v_closed));
  select string_agg(src || ':' || (g->>'group_name') || '=' || coalesce(g->>'status', '?'), ' ' order by src, g->>'group_name')
    into v_txt
  from (select 'by_group' src, g from jsonb_array_elements(v_json->'by_group'->'groups') g
        union all select 'items', g from jsonb_array_elements(v_json->'items'->'groups') g) x
  where g->>'group_name' = 'Økonomi' and (coalesce(jsonb_typeof(g->'factors'), 'null') <> 'null'
                                         or coalesce(jsonb_typeof(g->'items'), 'null') <> 'null');
  v_rows := v_rows || jsonb_build_object('seq', 1, 'id', 'I1', 'name', 'no result reader returns a value for Økonomi (n = 3)',
    'expected', 'none', 'actual', coalesce(v_txt, 'none'), 'pass', v_txt is null);

  select string_agg(g->>'group_name' || '=' || (g->>'status'), ',' order by g->>'group_name' collate "C") into v_txt
  from jsonb_array_elements(v_json->'by_group'->'groups') g;
  v_rows := v_rows || jsonb_build_object('seq', 2, 'id', 'I1', 'name', 'differencing: Salg is held back with Økonomi',
    'expected', 'Drift=ok,Salg=protected,Økonomi=insufficient_data', 'actual', v_txt,
    'pass', v_txt = 'Drift=ok,Salg=protected,Økonomi=insufficient_data');

  -- I4 ----------------------------------------------------------------- participation
  v_json := public.participation(v_open);
  select string_agg(g->>'group_name' || '=' || coalesce(g->>'answered', 'null'), ',' order by g->>'group_name' collate "C")
    into v_txt from jsonb_array_elements(v_json->'groups') g where g->>'group_name' in ('Salg', 'Økonomi');
  v_rows := v_rows || jsonb_build_object('seq', 3, 'id', 'I4', 'name', 'no live participation count for Økonomi, nor for Salg that shields it',
    'expected', 'Salg=null,Økonomi=null', 'actual', v_txt, 'pass', v_txt = 'Salg=null,Økonomi=null');

  select string_agg(g->>'group_name' || '=' || coalesce(g->>'n', 'null'), ',' order by g->>'group_name' collate "C")
    into v_txt from jsonb_array_elements(public.results_by_group(v_closed)->'groups') g where g->>'group_name' in ('Salg', 'Økonomi');
  v_rows := v_rows || jsonb_build_object('seq', 4, 'id', 'I4', 'name', 'no answer count for Økonomi or Salg after close',
    'expected', 'Salg=null,Økonomi=null', 'actual', v_txt, 'pass', v_txt = 'Salg=null,Økonomi=null');

  -- no function a client may call hands back a per-person answered mark
  reset role;
  select string_agg(p.proname, ',' order by p.proname) into v_txt
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('authenticated', p.oid, 'execute')
    and pg_get_functiondef(p.oid) ~* '''responded_at''|responded_at\s+as\s|''responded''';
  v_rows := v_rows || jsonb_build_object('seq', 5, 'id', 'I4', 'name', 'no client-callable function returns who answered',
    'expected', 'none', 'actual', coalesce(v_txt, 'none'), 'pass', v_txt is null);

  -- I2 ----------------------------------------------------------------- no linkage columns
  select string_agg(c.table_name || '.' || c.column_name, ',' order by c.table_name, c.column_name) into v_txt
  from information_schema.columns c
  where c.table_schema = 'app' and c.table_name = any (v_tables)
    and c.column_name ~* '(token|invitation|employee|respondent|user_id|email|phone|person|member)';
  v_rows := v_rows || jsonb_build_object('seq', 6, 'id', 'I2', 'name', 'content tables carry no column that could name a respondent',
    'expected', 'none', 'actual', coalesce(v_txt, 'none'), 'pass', v_txt is null);

  select string_agg(cl.relname || '→' || fcl.relname, ',' order by cl.relname) into v_txt
  from pg_constraint c
  join pg_class cl on cl.oid = c.conrelid join pg_namespace n on n.oid = cl.relnamespace
  join pg_class fcl on fcl.oid = c.confrelid join pg_namespace fn on fn.oid = fcl.relnamespace
  where c.contype = 'f' and n.nspname = 'app' and cl.relname = any (v_tables)
    and (fcl.relname in ('invitations', 'employees', 'memberships', 'profiles', 'participant_tokens') or fn.nspname = 'auth');
  v_rows := v_rows || jsonb_build_object('seq', 7, 'id', 'I2', 'name', 'content tables have no foreign key to a person, an invitation or a token',
    'expected', 'none', 'actual', coalesce(v_txt, 'none'), 'pass', v_txt is null);

  -- I5 ----------------------------------------------------------------- tokens are hashes
  select string_agg(c.table_schema || '.' || c.table_name || '.' || c.column_name || ':' || c.data_type, ',') into v_txt
  from information_schema.columns c
  where c.table_schema in ('app', 'public') and c.column_name ~* 'token'
    and not (c.column_name ~* '_hash$' and c.data_type = 'bytea');
  v_rows := v_rows || jsonb_build_object('seq', 8, 'id', 'I5', 'name', 'every token column is a SHA-256 hash, never the token',
    'expected', 'none', 'actual', coalesce(v_txt, 'none'), 'pass', v_txt is null);

  select count(*) into v_n from app.invitations i join app.rounds r on r.id = i.round_id
  where r.org_id = v_org and length(i.token_hash) <> 32;
  v_rows := v_rows || jsonb_build_object('seq', 9, 'id', 'I5', 'name', 'Lumio''s invitations hold 32-byte digests only',
    'expected', '0', 'actual', v_n::text, 'pass', v_n = 0);

  -- I6 ----------------------------------------------------------------- no language with answers
  select string_agg(c.table_name || '.' || c.column_name, ',') into v_txt
  from information_schema.columns c
  where c.table_schema = 'app' and c.table_name = any (v_tables) and c.column_name ~* '(lang|locale)';
  v_rows := v_rows || jsonb_build_object('seq', 10, 'id', 'I6', 'name', 'answer and content rows store no locale or language',
    'expected', 'none', 'actual', coalesce(v_txt, 'none'), 'pass', v_txt is null);

  -- I7 ----------------------------------------------------------------- reminders are the system's
  select string_agg(p.proname, ',' order by p.proname) into v_txt
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('authenticated', p.oid, 'execute')
    and pg_get_functiondef(p.oid) ~* 'insert\s+into\s+app\.outbox'
    and pg_get_functiondef(p.oid) ~* 'responded_at\s+is\s+null';
  v_rows := v_rows || jsonb_build_object('seq', 11, 'id', 'I7', 'name', 'no client-callable function queues a message to those who have not answered',
    'expected', 'none', 'actual', coalesce(v_txt, 'none'), 'pass', v_txt is null);

  select string_agg(grantee || ':' || privilege_type, ',') into v_txt
  from information_schema.role_table_grants
  where table_schema = 'app' and table_name = 'invitations' and grantee in ('anon', 'authenticated') and privilege_type = 'SELECT';
  v_rows := v_rows || jsonb_build_object('seq', 12, 'id', 'I7', 'name', 'no client may read the invitations, and so the answered marks',
    'expected', 'none', 'actual', coalesce(v_txt, 'none'), 'pass', v_txt is null);

  insert into public._inv
  select (x->>'seq')::int, x->>'id', x->>'name', x->>'expected', x->>'actual', (x->>'pass')::boolean from jsonb_array_elements(v_rows) x;
end $$;

select seq, id, name, expected, actual, pass from public._inv order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(id || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._inv;
  if v_failed is not null then raise exception 'engagement invariants failed: %', v_failed; end if;
  if v_count <> 12 then raise exception 'engagement invariants: expected 12 rows, got %', v_count; end if;
end $$;

drop table public._inv;
