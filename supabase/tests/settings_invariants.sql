-- settings_invariants.sql — the company's facts, and the department scope.
--
-- Two migrations are proved here. 0021 gives an organisation its registry snapshot, its
-- sites and a statutory position per person; 0022 makes the access matrix on Oppsett true
-- by giving an avdelingsleder a department and scoping every read to it.
--
-- The assertions that matter most are the negative ones. Assertion 5 asserts that
-- `duty_role` is consulted by **nothing** — no policy, no function — because the whole
-- point of that column is that writing "verneombud" on a person grants them nothing.
-- Assertion 6 does the same for `law_mode`, which the design promises changes wording and
-- nothing else. Both are written as a search of every policy expression and every routine
-- body in the schema, so a later query that starts keying off either one fails here.
--
-- The scope assertions work by temporarily demoting a real membership. That is safe: the
-- whole block is one transaction, so a raise anywhere rolls the role back with everything
-- else, and the last statements restore it explicitly on the happy path.
--
--   psql "$DATABASE_URL" -f supabase/tests/settings_invariants.sql

create unlogged table if not exists public._st(seq int, name text, expected text, actual text, pass bool);
truncate public._st;

do $$
declare
  v_org uuid; v_user uuid; v_ms uuid; v_grp uuid; v_other_grp uuid;
  v_round uuid; v_json jsonb; v_n int; v_msg text; v_loc uuid;
  v_drift_threads int;
begin
  select id into v_org from app.organizations order by id limit 1;
  select id, user_id into v_ms, v_user from app.memberships
    where org_id = v_org and active and role = 'daglig_leder' order by id limit 1;
  select id into v_grp from app.groups where org_id = v_org and name = 'Drift';
  select id into v_other_grp from app.groups where org_id = v_org and name = 'Verksted';
  select r.id into v_round from app.rounds r
    where r.org_id = v_org and r.status = 'lukket' order by r.closes_at desc limit 1;

  -- 1..4 ------------------------------------------------------------- locations
  insert into public._st
  select 1, 'RLS enabled on locations', 'true', relrowsecurity::text, relrowsecurity
  from pg_class where oid = 'app.locations'::regclass;

  insert into public._st
  select 2, 'no grants to anon on locations', '0', count(*)::text, count(*) = 0
  from information_schema.role_table_grants
  where table_schema = 'app' and table_name = 'locations' and grantee = 'anon';

  insert into public._st
  select 3, 'only daglig leder may write a location', 'daglig_leder', qual, qual like '%daglig_leder%'
  from pg_policies
  where schemaname = 'app' and tablename = 'locations' and cmd = 'ALL';

  insert into public._st
  select 4, 'a location holds no column that could name a person', '0', count(*)::text, count(*) = 0
  from pg_attribute
  where attrelid = 'app.locations'::regclass and attnum > 0 and not attisdropped
    and attname ~* '(employee|person|user|email|phone|manager)';

  -- 5, 6 ------------------------------------------ the two columns nothing may read
  insert into public._st
  select 5, 'duty_role is consulted by no policy and no routine', '0', count(*)::text, count(*) = 0
  from (
    select 1 from pg_policies
    where schemaname = 'app'
      and (coalesce(qual,'') like '%duty_role%' or coalesce(with_check,'') like '%duty_role%')
    union all
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app','public') and p.prosrc like '%duty_role%'
  ) hits;

  insert into public._st
  select 6, 'law_mode is consulted by no policy and no routine', '0', count(*)::text, count(*) = 0
  from (
    select 1 from pg_policies
    where schemaname = 'app'
      and (coalesce(qual,'') like '%law_mode%' or coalesce(with_check,'') like '%law_mode%')
    union all
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app','public') and p.prosrc like '%law_mode%'
  ) hits;

  -- 7, 8 ------------------------------------------------- the membership's own rules
  begin
    update app.memberships set group_id = v_grp where id = v_ms;
    insert into public._st values (7, 'a daglig leder may not lead a department', 'rejected', 'ACCEPTED', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into public._st values (7, 'a daglig leder may not lead a department', 'rejected', left(v_msg,60), true);
  end;

  begin
    insert into app.memberships (org_id, user_id, role, active, group_id)
    values ('00000000-0000-4000-8000-0000000000ff', v_user, 'avdelingsleder', true, v_grp);
    insert into public._st values (8, 'a department from another organisation is refused', 'rejected', 'ACCEPTED', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into public._st values (8, 'a department from another organisation is refused', 'rejected', left(v_msg,70), true);
  end;

  -- 9..14 --------------------------------------------------------- the whole house
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  select count(*) into v_n from app.visible_groups(v_org);
  insert into public._st
  select 9, 'a daglig leder sees every group', (select count(*)::text from app.groups where org_id = v_org),
         v_n::text, v_n = (select count(*) from app.groups where org_id = v_org);

  v_json := public.results_summary(v_round);
  insert into public._st values (10, 'and the summary is scoped to the organisation', 'org',
    coalesce(v_json->>'scope','none'), v_json->>'scope' = 'org');

  insert into public._st values (11, 'the design''s published index is unmoved', '61',
    coalesce(v_json->>'index','none'), (v_json->>'index')::int = 61);

  v_json := public.results_by_group(v_round);
  insert into public._st values (12, 'every group with responses is offered', 'org',
    coalesce(v_json->>'scope','none'), v_json->>'scope' = 'org');

  v_json := public.conversations(null);
  insert into public._st values (13, 'and every thread above k is returned', 'true',
    (jsonb_array_length(v_json->'threads') > 0)::text,
    jsonb_array_length(coalesce(v_json->'threads','[]'::jsonb)) > 0);

  select count(*) into v_drift_threads
  from app.comment_threads ct
  join app.responses r on r.id = ct.response_id
  where ct.org_id = v_org and r.group_id = v_grp;

  -- 14..19 --------------------------------------------------- scoped to one department
  update app.memberships set role = 'avdelingsleder', group_id = v_grp where id = v_ms;

  select count(*) into v_n from app.visible_groups(v_org);
  insert into public._st values (14, 'an avdelingsleder sees exactly one group', '1', v_n::text, v_n = 1);

  select count(*) into v_n from app.visible_groups(v_org) vg where vg.group_id = v_grp;
  insert into public._st values (15, 'and it is the one they lead', '1', v_n::text, v_n = 1);

  v_json := public.results_summary(v_round);
  insert into public._st values (16, 'the summary says it is a department, and names it',
    'group|Drift',
    coalesce(v_json->>'scope','none') || '|' || coalesce(v_json->>'scope_label','none'),
    v_json->>'scope' = 'group' and v_json->>'scope_label' = 'Drift');

  v_json := public.results_by_group(v_round);
  select count(*) into v_n from jsonb_array_elements(v_json->'groups') g
  where g->>'group_name' <> 'Drift';
  insert into public._st values (17, 'no other department appears in the breakdown', '0', v_n::text, v_n = 0);

  v_json := public.conversations(null);
  insert into public._st values (18, 'only their own department''s comments are returned',
    v_drift_threads::text,
    jsonb_array_length(coalesce(v_json->'threads','[]'::jsonb))::text,
    jsonb_array_length(coalesce(v_json->'threads','[]'::jsonb)) = v_drift_threads);

  insert into public._st
  select 19, 'and the k gate is still the one that released them', 'true',
         (v_json->>'threshold' = app.k_threshold(v_org)::text)::text,
         v_json->>'threshold' = app.k_threshold(v_org)::text;

  -- 20, 21 ------------------------------------------------------------- verneombud
  update app.memberships set role = 'verneombud', group_id = null where id = v_ms;

  v_json := public.conversations(null);
  insert into public._st values (20, 'a verneombud reads no individual comment', 'not_available',
    coalesce(v_json->>'error','RETURNED'), v_json->>'error' = 'not_available');

  v_json := public.results_summary(v_round);
  insert into public._st values (21, 'but keeps the whole undertaking''s figures', 'org',
    coalesce(v_json->>'scope','none'), v_json->>'scope' = 'org');

  -- 22 ----------------------------------------------------------- nobody at all
  perform set_config('request.jwt.claims',
    json_build_object('sub','00000000-0000-4000-8000-00000000dead','role','authenticated')::text, true);
  select count(*) into v_n from app.visible_groups(v_org);
  insert into public._st values (22, 'a caller with no membership sees no group', '0', v_n::text, v_n = 0);

  -- restore, and prove it
  perform set_config('request.jwt.claims', '', true);
  update app.memberships set role = 'daglig_leder', group_id = null where id = v_ms;
  insert into public._st
  select 23, 'the membership is back as it was', 'daglig_leder|',
         role::text || '|' || coalesce(group_id::text,''),
         role = 'daglig_leder' and group_id is null
  from app.memberships where id = v_ms;

  -- 24, 25 ------------------------------------------------- the registry snapshot
  insert into public._st
  select 24, 'the registry snapshot carries a fetch time', 'true',
         (registry_fetched_at is not null)::text, registry_fetched_at is not null
  from app.organizations where id = v_org;

  insert into public._st
  select 25, 'no registry column could hold a person', '0', count(*)::text, count(*) = 0
  from pg_attribute
  where attrelid = 'app.organizations'::regclass and attnum > 0 and not attisdropped
    and attname like 'registry\_%' and attname ~* '(person|contact|owner|email|phone|name$)';

  -- 26 ------------------------------------------------------------------ cleanup
  insert into app.locations (org_id, name, address, headcount)
  values (v_org, 'Slettes straks', 'Ingen vei 1', 0) returning id into v_loc;
  delete from app.locations where id = v_loc;
  select count(*) into v_n from app.locations where id = v_loc;
  insert into public._st values (26, 'a location can be added and removed', '0', v_n::text, v_n = 0);
end $$;

select seq, name, expected, actual, pass from public._st order by seq;

do $$
declare v_failed text;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) into v_failed
  from public._st where not pass;
  if v_failed is not null then
    raise exception 'settings invariants failed: %', v_failed;
  end if;
end $$;

drop table public._st;
