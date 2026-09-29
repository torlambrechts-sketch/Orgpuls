-- module_sync_invariants.sql — modules the pragmatic way (0122, X-096), proved against the live schema.
--
--   * a module the database has not seen becomes a draft 1.0.0; the same body again is a no-op (1)
--   * a changed draft is replaced in place, never a second draft (2)
--   * a changed live module becomes the next version, published; the old one is retired, not changed (3)
--   * a planned round moves to it, statements matched by code and a new one added; an opened round
--     keeps the version it opened with (4)
--   * survey translations carry over for statements whose wording did not change, and only those (5)
--   * «validated» falls back to provisional when what respondents read changed (6)
--   * only a super-admin may sync; the engine and the legal review are closed to clients (7)
--   * a legal document is stored with its text, and only under the hash of that text (8)
--   * nothing written here survives (9)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/module_sync_invariants.sql

create unlogged table if not exists public._msy(seq int, name text, expected text, actual text, pass bool);
truncate public._msy;

create or replace function pg_temp.probe_module(p_item2 text, p_extra boolean) returns jsonb language sql as $$
  select jsonb_build_object(
    'module_id', 'probe-sync', 'name', 'Probe', 'description', 'Probe', 'estimated_minutes', 1,
    'scale', '{}'::jsonb, 'scoring', '{}'::jsonb, 'anonymity', '{"min_responses": 5, "can_lower": false}'::jsonb,
    'sources', '[]'::jsonb, 'count_items', '[]'::jsonb, 'segments', '[]'::jsonb,
    'factors', jsonb_build_array(jsonb_build_object('id', 'f', 'name', 'F', 'summary', 'S', 'rationale', 'R',
      'rationale_sources', '[]'::jsonb, 'legal_basis', '[]'::jsonb, 'action_suggestions', '[]'::jsonb,
      'items', jsonb_build_array(
                 jsonb_build_object('id', 'PS-FF-1', 'text', 'en', 'reverse', false, 'pulse_eligible', true),
                 jsonb_build_object('id', 'PS-FF-2', 'text', p_item2, 'reverse', false, 'pulse_eligible', true),
                 jsonb_build_object('id', 'PS-FF-3', 'text', 'tre', 'reverse', false, 'pulse_eligible', true))
               || case when p_extra then jsonb_build_array(jsonb_build_object('id', 'PS-FF-4', 'text', 'fire', 'reverse', false, 'pulse_eligible', true))
                       else '[]'::jsonb end)))
$$;

do $$
declare
  v_org    uuid := '00000000-0000-4000-8000-000000000001';
  v_super  uuid := '00000000-0000-4000-8000-0000000a7601';
  v_mkt    uuid := '00000000-0000-4000-8000-0000000a7602';
  v_meas   uuid;
  v_plan   uuid;
  v_open   uuid;
  v_old    uuid;
  v_new    uuid;
  v_i1     uuid;
  v_i2     uuid;
  v_r      jsonb;
  v_txt    text;
  v_rows   jsonb := '[]';
  h        text;
begin
  begin
    -- 1 -------------------------------------------------------------- first sync, then the same body
    v_r := app.module_sync(pg_temp.probe_module('to', false), repeat('1', 64));
    v_txt := concat_ws(',', v_r->>'result', v_r->>'version', v_r->>'status',
                       app.module_sync(pg_temp.probe_module('to', false), repeat('1', 64))->>'result');
    v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'a new module is a draft 1.0.0; the same body again is a no-op',
      'expected', 'new,1.0.0,draft,unchanged', 'actual', v_txt, 'pass', v_txt = 'new,1.0.0,draft,unchanged');

    -- 2 -------------------------------------------------------------- a changed draft is replaced
    v_r := app.module_sync(pg_temp.probe_module('to!', false), repeat('2', 64));
    v_txt := concat_ws(',', v_r->>'result', v_r->>'version',
                       (select count(*) from app.question_modules where key = 'probe-sync'),
                       (select i.text->>'nb' from app.module_items i join app.question_modules m on m.id = i.module_id
                        where m.key = 'probe-sync' and i.code = 'PS-FF-2'));
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'a changed draft is replaced in place',
      'expected', 'draft,1.0.0,1,to!', 'actual', v_txt, 'pass', v_txt = 'draft,1.0.0,1,to!');

    -- live: validated, published, one planned round asking statements 1 and 2, one opened round
    select id into v_old from app.question_modules where key = 'probe-sync';
    update app.question_modules set validation_status = 'validated' where id = v_old;
    perform app.module_set_status('probe-sync', '1.0.0', 'published');
    select id into v_i1 from app.module_items where module_id = v_old and code = 'PS-FF-1';
    select id into v_i2 from app.module_items where module_id = v_old and code = 'PS-FF-2';
    insert into app.measurements (org_id, kind, year) values (v_org, 'grunnlinje', 2097) returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'planlagt', '2097-09-01', '2097-09-12') returning id into v_plan;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'planlagt', '2097-03-01', '2097-03-12') returning id into v_open;
    delete from app.round_modules where round_id in (v_plan, v_open);
    insert into app.round_modules (org_id, round_id, module_id, item_ids) values
      (v_org, v_plan, v_old, array[v_i1, v_i2]), (v_org, v_open, v_old, array[v_i1, v_i2]);
    update app.rounds set status = 'apen' where id = v_open;
    insert into app.item_translations (item_id, locale, text, source) values
      ('module:' || v_i1, 'pl', 'jeden', 'machine'), ('module:' || v_i2, 'pl', 'dwa', 'machine');

    -- the next version: statement 2 reworded, statement 4 added
    v_r := app.module_sync(pg_temp.probe_module('to, nå endret', true), repeat('3', 64));
    select id into v_new from app.question_modules where key = 'probe-sync' and version = '1.0.1';

    -- 3 -------------------------------------------------------------- the next version, published
    v_txt := concat_ws(',', v_r->>'result', v_r->>'version',
                       (select status from app.question_modules where id = v_new),
                       (select status from app.question_modules where id = v_old),
                       (select i.text->>'nb' from app.module_items i where i.module_id = v_old and i.code = 'PS-FF-2'));
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a changed live module is published as 1.0.1; 1.0.0 is retired and unchanged',
      'expected', 'published,1.0.1,published,retired,to!', 'actual', v_txt, 'pass', v_txt = 'published,1.0.1,published,retired,to!');

    -- 4 -------------------------------------------------------------- rounds
    v_txt := (select string_agg(i.code, ' ' order by i.code) from app.round_modules rm, unnest(rm.item_ids) x
              join app.module_items i on i.id = x where rm.round_id = v_plan and rm.module_id = v_new)
          || '|' || (select count(*) from app.round_modules where round_id = v_open and module_id = v_old)::text
          || '|' || (v_r->>'rounds_moved');
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'the planned round moves (1, 2 by code, 4 added; 3 stays out); the opened round keeps 1.0.0',
      'expected', 'PS-FF-1 PS-FF-2 PS-FF-4|1|1', 'actual', v_txt, 'pass', v_txt = 'PS-FF-1 PS-FF-2 PS-FF-4|1|1');

    -- 5 -------------------------------------------------------------- translations
    v_txt := coalesce((select string_agg(t.text, ',' order by t.text) from app.item_translations t
                       join app.module_items i on 'module:' || i.id = t.item_id where i.module_id = v_new and t.locale = 'pl'), 'none');
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'the unchanged statement keeps its translation; the reworded one does not',
      'expected', 'jeden', 'actual', v_txt, 'pass', v_txt = 'jeden');

    -- 6 -------------------------------------------------------------- validation
    v_txt := concat_ws(',', (select validation_status from app.question_modules where id = v_new),
                            (select validation_status from app.question_modules where id = v_old));
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a reworded statement makes «validated» provisional; the old version keeps its status',
      'expected', 'provisional,validated', 'actual', v_txt, 'pass', v_txt = 'provisional,validated');

    -- 7 -------------------------------------------------------------- who
    insert into auth.users (id, email) values (v_super, 'super@msy-test.example'), (v_mkt, 'mkt@msy-test.example');
    insert into app.platform_admins (user_id, role) values (v_super, 'super_admin'), (v_mkt, 'marketing');
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","aal":"aal2"}', v_mkt), true);
    v_txt := coalesce(public.admin_module_sync(pg_temp.probe_module('x', false), repeat('4', 64))->>'error', 'ok')
          || ',' || coalesce(public.admin_legal_review('doc:probe', repeat('a', 64), 'x')->>'error', 'ok')
          || ',' || has_function_privilege('anon', 'public.admin_module_sync(jsonb,text)', 'execute')::text
          || ',' || has_function_privilege('authenticated', 'app.module_sync(jsonb,text)', 'execute')::text
          || ',' || has_table_privilege('authenticated', 'app.legal_reviews', 'select')::text
          || ',' || (select count(*) from pg_policies where schemaname = 'app' and tablename = 'legal_reviews')::text;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'marketing may not sync or review; anon and clients reach neither the engine nor the table',
      'expected', 'not_allowed,not_allowed,false,false,false,0', 'actual', v_txt, 'pass', v_txt = 'not_allowed,not_allowed,false,false,false,0');

    -- 8 -------------------------------------------------------------- legal review by document
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","aal":"aal2"}', v_super), true);
    h := encode(sha256(convert_to(E'# msg:no:probe\npath\ntekst', 'UTF8')), 'hex');
    v_txt := coalesce(public.admin_legal_review('msg:no:probe', repeat('b', 64), E'# msg:no:probe\npath\ntekst')->>'error', 'ok');
    v_txt := v_txt || ',' || coalesce(public.admin_legal_review('msg:no:probe', h, E'# msg:no:probe\npath\ntekst')->>'error', 'ok');
    -- a statement of its own: the review above is visible to the next statement, not its own
    v_txt := v_txt || ',' || (select x->>'text' = E'# msg:no:probe\npath\ntekst' from jsonb_array_elements(public.admin_legal_reviews()->'rows') x where x->>'key' = 'msg:no:probe')::text;
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'a review is refused under another hash, kept with its text under its own',
      'expected', 'invalid,ok,true', 'actual', v_txt, 'pass', v_txt = 'invalid,ok,true');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 9 ---------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from app.question_modules where key = 'probe-sync'
    union all select key from app.legal_reviews where key = 'msg:no:probe'
    union all select id::text from auth.users where email like '%@msy-test.example') x;
  v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._msy
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._msy order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._msy;
  if v_failed is not null then raise exception 'module sync invariants failed: %', v_failed; end if;
  if v_count <> 9 then raise exception 'module sync invariants: expected 9 rows, got %', v_count; end if;
end $$;
