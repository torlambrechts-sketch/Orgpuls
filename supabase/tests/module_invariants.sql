-- module_invariants.sql — industry question modules: the registry and its answers (0067, D-111).
--
--   * no client role can read or write an answer table; count answers carry no link (1, 2)
--   * a draft is invisible to clients; a published version is readable by anon (3)
--   * a published module's content cannot change, nor the module be deleted (4, 5)
--   * status moves draft → published → retired only (6)
--   * re-seeding a published version with other content is refused; the same is a no-op (7)
--   * a module that says fewer than five is refused (8)
--   * a round's modules: another organisation cannot read them; a client cannot change them once
--     the round is open (9, 10)
--   * module answers are append-only, and go with their round (11)
--   * publishing from the admin: super-admin only, with a reason, audited (12)
--   * nothing written here survives (13)
--   * a pilot (0068): the draft is visible to its organisation's members only, and only its
--     rounds may ask it; adding one is a super-admin's, audited (14, 15)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/module_invariants.sql
--
-- It seeds a probe module of its own inside the rolled-back block, so it holds before and after
-- any real module is published.

create unlogged table if not exists public._mod(seq int, name text, expected text, actual text, pass bool);
truncate public._mod;

do $$
declare
  v_org      uuid := '00000000-0000-4000-8000-000000000001';
  v_other    uuid := 'de000000-0000-4000-8000-000000000001';
  v_out      uuid := '00000000-0000-4000-8000-00000d0de001';
  v_sa       uuid := '00000000-0000-4000-8000-00000d0de002';
  v_mod      uuid;
  v_hash     text;
  v_item     uuid;
  v_items    uuid[];
  v_planned  uuid;
  v_open     uuid;
  v_resp     uuid;
  v_rows     jsonb := '[]';
  v_txt      text;
  v_n        int;
  v_audit    int;
  claims     constant text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
begin

  -- 1 ------------------------------------------------------------------ the answer tables are closed
  select count(*) into v_n from information_schema.role_table_grants
  where table_schema = 'app' and table_name in ('module_answers', 'module_segment_answers', 'org_count_answers')
    and grantee in ('anon', 'authenticated', 'public');
  select v_n || '|' || count(*) into v_txt from pg_policies
  where schemaname = 'app' and tablename in ('module_answers', 'module_segment_answers', 'org_count_answers');
  select v_txt || '|' || bool_and(c.relrowsecurity) into v_txt from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'app' and c.relname in ('module_answers', 'module_segment_answers', 'org_count_answers');
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'no grant, no policy, RLS on for every module answer table',
    'expected', '0|0|true', 'actual', v_txt, 'pass', v_txt = '0|0|true');

  -- 2 ------------------------------------------------------------------ a count answer has no link
  select string_agg(column_name, ',' order by column_name) into v_txt
  from information_schema.columns where table_schema = 'app' and table_name = 'org_count_answers';
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'org_count_answers: no response, group, segment or time finer than a day',
    'expected', 'answer,answered_on,id,item_id,round_id', 'actual', v_txt, 'pass', v_txt = 'answer,answered_on,id,item_id,round_id');

  begin
    -- a probe module of its own, so the suite holds whatever has been published for real
    v_hash := repeat('b', 64);
    perform app.module_seed(jsonb_build_object(
      'module_id', 'probe-modul', 'version', '0.0.1', 'name', 'Probe', 'description', 'Probe', 'estimated_minutes', 1,
      'scale', '{}'::jsonb, 'scoring', '{}'::jsonb, 'anonymity', '{"min_responses": 5, "can_lower": false}'::jsonb,
      'sources', '[{"key": "kilde", "title": "Kilde", "url": "https://example.no"}]'::jsonb,
      'factors', jsonb_build_array(jsonb_build_object(
        'id', 'probe_faktor', 'name', 'Probe', 'summary', 'S', 'rationale', 'R', 'rationale_sources', '["kilde"]'::jsonb,
        'legal_basis', '["aml § 4-3"]'::jsonb,
        'items', '[{"id":"PR-PF-1","text":"En","reverse":false,"pulse_eligible":true},
                   {"id":"PR-PF-2","text":"To","reverse":false,"pulse_eligible":true},
                   {"id":"PR-PF-3","text":"Tre","reverse":false,"pulse_eligible":true}]'::jsonb,
        'action_suggestions', '[{"type":"rutine","title":"T","description":"D","remeasure_item":"PR-PF-2"}]'::jsonb)),
      'count_items', '[{"id":"PR-T-1","text":"Telles","options":["Ja","Nei","Vet ikke"]}]'::jsonb,
      'segments', '[{"id":"sted","text":"Hvor?","options":["Her","Der"]}]'::jsonb), v_hash);
    select m.id into v_mod from app.question_modules m where m.key = 'probe-modul';

    insert into auth.users (id, email) values (v_out, 'out@mod-test.example'), (v_sa, 'sa@mod-test.example');
    insert into app.profiles (id, full_name) values (v_out, 'Ute Fra') on conflict (id) do nothing;
    insert into app.memberships (org_id, user_id, role, active) values (v_other, v_out, 'daglig_leder', true);
    insert into app.platform_admins (user_id, role) values (v_sa, 'super_admin');

    -- 14 --------------------------------------------------------------- a pilot sees the draft
    perform set_config('request.jwt.claims', format(claims, v_out, 'aal2'), true);
    v_txt := coalesce(public.admin_module_pilot('probe-modul', '0.0.1', v_other, true, 'Pilot')->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_sa, 'aal2'), true);
    v_txt := v_txt || ',' || coalesce(public.admin_module_pilot('probe-modul', '0.0.1', v_other, true, 'Pilot for test')->>'error', 'ok');
    v_txt := v_txt || ',' || (select count(*) from app.admin_audit where action = 'module.pilot_add' and org_id = v_other);
    perform set_config('request.jwt.claims', format(claims, v_out, 'aal1'), true);
    set local role authenticated;
    select v_txt || ',' || count(*) || ',' || (select count(*) from app.module_items where module_id = v_mod)
      into v_txt from app.question_modules where id = v_mod;
    reset role;
    v_txt := v_txt || ',' || cardinality(public.pilot_module_ids(v_other)) || ',' || cardinality(public.pilot_module_ids(v_org));
    perform set_config('request.jwt.claims', '', true);
    set local role anon;
    select v_txt || ',' || count(*) into v_txt from app.question_modules where id = v_mod;
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 14, 'name', 'a super-admin adds a pilot, audited; its members see the draft, anon does not',
      'expected', 'not_allowed,ok,1,1,5,1,0,0', 'actual', v_txt, 'pass', v_txt = 'not_allowed,ok,1,1,5,1,0,0');

    -- 15 --------------------------------------------------------------- only a pilot's round asks a draft
    select array_agg(i.id order by i.sort) into v_items from app.module_items i where i.module_id = v_mod and i.kind = 'likert5';
    begin
      insert into app.round_modules (org_id, round_id, module_id, item_ids)
      select v_org, r.id, v_mod, v_items from app.rounds r where r.org_id = v_org and r.status = 'planlagt' limit 1;
      v_txt := 'accepted';
    exception when check_violation then v_txt := 'refused';
    end;
    begin
      insert into app.round_modules (org_id, round_id, module_id, item_ids)
      select v_other, r.id, v_mod, v_items from app.rounds r where r.org_id = v_other and r.status = 'planlagt' limit 1;
      v_txt := v_txt || ',accepted';
    exception when check_violation then v_txt := v_txt || ',refused';
    end;
    delete from app.round_modules where org_id = v_other;
    v_rows := v_rows || jsonb_build_object('seq', 15, 'name', 'a non-pilot round cannot ask a draft; a pilot''s can',
      'expected', 'refused,accepted', 'actual', v_txt, 'pass', v_txt = 'refused,accepted');

    -- 3 ---------------------------------------------------------------- drafts are private
    set local role anon;
    select count(*) into v_n from app.question_modules where id = v_mod;
    reset role;
    v_txt := v_n::text;
    perform app.module_set_status('probe-modul', '0.0.1', 'published');
    set local role anon;
    select v_txt || '|' || count(*) || '|' || (select count(*) from app.module_items where module_id = v_mod)
      into v_txt from app.question_modules where id = v_mod;
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'anon sees no draft, and every row of a published module',
      'expected', '0|1|5', 'actual', v_txt, 'pass', v_txt = '0|1|5');

    -- 4 ---------------------------------------------------------------- published content is frozen
    v_txt := '';
    begin
      update app.module_items set text = '{"nb":"Endret"}' where module_id = v_mod and code = 'PR-PF-1';
      v_txt := 'updated';
    exception when restrict_violation then v_txt := 'refused';
    end;
    begin
      insert into app.module_sources (module_id, key, title, url, sort) values (v_mod, 'ny', 'Ny', 'https://example.no', 99);
      v_txt := v_txt || ',inserted';
    exception when restrict_violation then v_txt := v_txt || ',refused';
    end;
    begin
      delete from app.module_action_suggestions where module_id = v_mod and sort = 1;
      v_txt := v_txt || ',deleted';
    exception when restrict_violation then v_txt := v_txt || ',refused';
    end;
    begin
      update app.question_modules set name = 'Bygg' where id = v_mod;
      v_txt := v_txt || ',renamed';
    exception when restrict_violation then v_txt := v_txt || ',refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a published item, source, suggestion and module row cannot change',
      'expected', 'refused,refused,refused,refused', 'actual', v_txt, 'pass', v_txt = 'refused,refused,refused,refused');

    -- 5 ---------------------------------------------------------------- nor be deleted
    begin
      delete from app.question_modules where id = v_mod;
      v_txt := 'deleted';
    exception when restrict_violation then v_txt := 'refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a published module cannot be deleted',
      'expected', 'refused', 'actual', v_txt, 'pass', v_txt = 'refused');

    -- 6 ---------------------------------------------------------------- forward only
    begin
      perform app.module_set_status('probe-modul', '0.0.1', 'draft');
      v_txt := 'moved';
    exception when others then v_txt := 'refused';
    end;
    begin
      update app.question_modules set status = 'draft' where id = v_mod;
      v_txt := v_txt || ',moved';
    exception when restrict_violation then v_txt := v_txt || ',refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a published module never goes back to draft',
      'expected', 'refused,refused', 'actual', v_txt, 'pass', v_txt = 'refused,refused');

    -- 7 ---------------------------------------------------------------- seeding respects publishing
    v_txt := app.module_seed(jsonb_build_object('module_id', 'probe-modul', 'version', '0.0.1'), v_hash);
    begin
      perform app.module_seed(jsonb_build_object('module_id', 'probe-modul', 'version', '0.0.1'), repeat('0', 64));
      v_txt := v_txt || ',rewritten';
    exception when others then v_txt := v_txt || ',refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'same content re-seeds as a no-op; changed content is refused',
      'expected', 'unchanged,refused', 'actual', v_txt, 'pass', v_txt = 'unchanged,refused');

    -- 8 ---------------------------------------------------------------- the floor is five
    begin
      insert into app.question_modules (key, version, name, description, estimated_minutes, scale, scoring, anonymity, content_hash)
      values ('lav-terskel', '1.0.0', 'Lav', 'Lav', 3, '{}', '{}', '{"min_responses": 4, "can_lower": false}', repeat('a', 64));
      v_txt := 'accepted';
    exception when check_violation then v_txt := 'refused';
    end;
    begin
      insert into app.question_modules (key, version, name, description, estimated_minutes, scale, scoring, anonymity, content_hash)
      values ('senkbar', '1.0.0', 'Senkbar', 'Senkbar', 3, '{}', '{}', '{"min_responses": 5, "can_lower": true}', repeat('a', 64));
      v_txt := v_txt || ',accepted';
    exception when check_violation then v_txt := v_txt || ',refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'a module with fewer than five, or a lowerable minimum, is refused',
      'expected', 'refused,refused', 'actual', v_txt, 'pass', v_txt = 'refused,refused');

    -- 9 ---------------------------------------------------------------- tenancy
    select r.id into v_planned from app.rounds r where r.org_id = v_org and r.status = 'planlagt' order by r.opens_at limit 1;
    select r.id into v_open from app.rounds r where r.org_id = v_org and r.status = 'apen' limit 1;
    select array_agg(i.id order by i.sort) into v_items from app.module_items i where i.module_id = v_mod and i.kind = 'likert5';
    insert into app.round_modules (org_id, round_id, module_id, item_ids) values (v_org, v_planned, v_mod, v_items);
    perform set_config('request.jwt.claims', format(claims, v_out, 'aal1'), true);
    set local role authenticated;
    select count(*) into v_n from app.round_modules where round_id = v_planned;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'another organisation''s leader cannot read a round''s modules',
      'expected', '0', 'actual', v_n::text, 'pass', v_n = 0);

    -- 10 --------------------------------------------------------------- fixed once open (for a client)
    perform set_config('request.jwt.claims', format(claims,
      (select m.user_id from app.memberships m where m.org_id = v_org and m.role = 'daglig_leder' and m.active limit 1), 'aal1'), true);
    set local role authenticated;
    begin
      insert into app.round_modules (org_id, round_id, module_id, item_ids) values (v_org, v_open, v_mod, v_items);
      v_txt := 'added';
    exception when restrict_violation then v_txt := 'refused';
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    begin
      insert into app.round_modules (org_id, round_id, module_id, item_ids)
      select v_org, r.id, v_mod, array[(select i.id from app.module_items i where i.module_id = v_mod and i.kind = 'count' limit 1)]
      from app.rounds r where r.org_id = v_org and r.status = 'planlagt' and r.id <> v_planned limit 1;
      v_txt := v_txt || ',count-as-statement';
    exception when check_violation then v_txt := v_txt || ',refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'no module added to an open round; only statements are asked as statements',
      'expected', 'refused,refused', 'actual', v_txt, 'pass', v_txt = 'refused,refused');

    -- 11 --------------------------------------------------------------- append-only
    insert into app.responses (org_id, round_id, group_id, submitted_hour)
    values (v_org, v_open, null, date_trunc('hour', now())) returning id into v_resp;
    v_item := v_items[1];
    insert into app.module_answers (response_id, item_id, value) values (v_resp, v_item, 4);
    insert into app.org_count_answers (round_id, item_id, answer)
    select v_open, i.id, 'nei' from app.module_items i where i.module_id = v_mod and i.code = 'PR-T-1';
    v_txt := '';
    begin
      update app.module_answers set value = 1 where response_id = v_resp;
      v_txt := 'changed';
    exception when restrict_violation then v_txt := 'refused';
    end;
    begin
      delete from app.org_count_answers where round_id = v_open;
      v_txt := v_txt || ',deleted';
    exception when restrict_violation then v_txt := v_txt || ',refused';
    end;
    delete from app.rounds where id = v_open;
    select v_txt || ',' || (select count(*) from app.module_answers where response_id = v_resp)
                 || ',' || (select count(*) from app.org_count_answers where round_id = v_open) into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'module answers cannot change or go, except with their round',
      'expected', 'refused,refused,0,0', 'actual', v_txt, 'pass', v_txt = 'refused,refused,0,0');

    -- 12 --------------------------------------------------------------- the admin's path
    perform set_config('request.jwt.claims', format(claims, v_out, 'aal2'), true);
    v_txt := coalesce(public.admin_module_set_status('probe-modul', '0.0.1', 'retired', 'Ny versjon ute')->>'error', 'ok');
    perform set_config('request.jwt.claims', format(claims, v_sa, 'aal2'), true);
    v_txt := v_txt || ',' || coalesce(public.admin_module_set_status('probe-modul', '0.0.1', 'retired', '')->>'error', 'ok');
    select count(*) into v_audit from app.admin_audit where action = 'module.retire';
    v_txt := v_txt || ',' || coalesce(public.admin_module_set_status('probe-modul', '0.0.1', 'retired', 'Ny versjon ute')->>'error', 'ok');
    v_txt := v_txt || ',' || ((select count(*) from app.admin_audit where action = 'module.retire') - v_audit)
                   || ',' || (select status from app.question_modules where id = v_mod);
    perform set_config('request.jwt.claims', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 12, 'name', 'only a super-admin retires, with a reason, and it is audited',
      'expected', 'not_allowed,reason_required,ok,1,retired', 'actual', v_txt,
      'pass', v_txt = 'not_allowed,reason_required,ok,1,retired');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  v_rows := v_rows || jsonb_build_object('seq', 13, 'name', 'every probe change was rolled back', 'expected', 'true',
    'actual', (not exists (select 1 from auth.users where email like '%@mod-test.example')
               and not exists (select 1 from app.question_modules where key = 'probe-modul'))::text,
    'pass', not exists (select 1 from auth.users where email like '%@mod-test.example')
               and not exists (select 1 from app.question_modules where key = 'probe-modul'));

  insert into public._mod
  select (x->>'seq')::int, x->>'name', x->>'expected', x->>'actual', (x->>'pass')::boolean from jsonb_array_elements(v_rows) x;
end $$;

select seq, name, expected, actual, pass from public._mod order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._mod;
  if v_failed is not null then raise exception 'module invariants failed: %', v_failed; end if;
  if v_count <> 15 then raise exception 'module invariants: expected 15 rows, got %', v_count; end if;
end $$;

drop table public._mod;
