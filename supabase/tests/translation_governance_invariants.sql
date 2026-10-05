-- translation_governance_invariants.sql — translation governance (0084, D-132).
--
--   * the log and the pins: RLS on, no policy, no grant; the platform's translation operations
--     (app.op_*, 0206) and the pinning functions for no client role (1)
--   * every translation that was approved before 0084 still is, and is in the log (2)
--   * the workflow: forward (skipping allowed), back to draft before approval, from approved only
--     to retired (3)
--   * a new wording of an approved row is a new version in draft; the approved one stays in the
--     log, which cannot be changed (4, 5)
--   * a professional translation is approved only once pretested, through a verified platform
--     command (app.platform_actor); without one — a signed-in daglig leder — neither step runs (6)
--   * a round opened pins its approved wording, a worded module under its variant key (7)
--   * the respondent gets the variant under the item's own key (8)
--   * a new wording, even approved, does not reach a round in the field (9)
--   * a pin cannot be changed, and goes with its round (10)
--   * nothing written here survives (11)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/translation_governance_invariants.sql

create unlogged table if not exists public._tgi(seq int, name text, expected text, actual text, pass bool);
truncate public._tgi;

do $$
declare
  v_org   uuid := '00000000-0000-4000-8000-000000000001';
  v_dl    uuid;
  v_mod   uuid;
  v_item  uuid;
  v_meas  uuid;
  v_round uuid;
  v_other uuid;
  v_emp   uuid;
  v_n     int;
  v_rows  jsonb := '[]';
  v_txt   text;
  v_json  jsonb;
  v_token constant text := 'tgi-probe-token-0000000000000001';
  claims  constant text := '{"sub":"%s","role":"authenticated","aal":"%s"}';
  item    constant text := '{"id":"%s","text":"%s","text_variants":{"barnehage":"%s","skole":"%s"},"reverse":false,"pulse_eligible":true}';
begin
  select m.user_id into v_dl from app.memberships m where m.org_id = v_org and m.role = 'daglig_leder' and m.active limit 1;

  -- 1 -------------------------------------------------------------- the grant surface
  select string_agg(
           (select relrowsecurity from pg_class where oid = ('app.' || t)::regclass)::text || '/'
           || (select count(*) from pg_policies where schemaname = 'app' and tablename = t)::text || '/'
           || has_table_privilege('authenticated', 'app.' || t, 'select')::text || '/'
           || has_table_privilege('anon', 'app.' || t, 'select')::text, ',' order by t)
    into v_txt
  from unnest(array['item_translation_log', 'round_translations']) t;
  v_txt := v_txt || ',' || has_function_privilege('authenticated', 'app.op_translation_update(text, text, text, text, jsonb)', 'execute')::text
    || '/' || has_function_privilege('anon', 'app.op_translation_update(text, text, text, text, jsonb)', 'execute')::text
    || '/' || has_function_privilege('authenticated', 'app.op_translation_history(text, text)', 'execute')::text
    || '/' || has_function_privilege('authenticated', 'app.op_translations_approve(text, text, text)', 'execute')::text
    || '/' || has_function_privilege('authenticated', 'app.pin_round_translations(uuid)', 'execute')::text
    || '/' || has_function_privilege('authenticated', 'app.round_texts(uuid, text)', 'execute')::text;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'log and pins: RLS on, no policy, no grant; the platform''s operations and pinning for no client role',
    'expected', 'true/0/false/false,true/0/false/false,false/false/false/false/false/false', 'actual', v_txt,
    'pass', v_txt = 'true/0/false/false,true/0/false/false,false/false/false/false/false/false');

  -- 2 -------------------------------------------------------------- what was approved stays approved
  v_txt := (select count(*) from app.item_translations t where t.approved_at is not null and t.status <> 'approved')::text || ','
        || (select count(*) from app.item_translations t
            where not exists (select 1 from app.item_translation_log l where l.item_id = t.item_id and l.locale = t.locale))::text;
  v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'every earlier approval is status approved, and every row is in the log',
    'expected', '0,0', 'actual', v_txt, 'pass', v_txt = '0,0');

  begin
    -- 3 ------------------------------------------------------------ the workflow
    delete from app.item_translations where locale = 'lt' and item_id like 'core:ytring:%';
    insert into app.item_translations (item_id, locale, text, source) values ('core:ytring:1', 'lt', 'bandymas', 'professional');
    v_txt := (select status from app.item_translations where item_id = 'core:ytring:1' and locale = 'lt');
    foreach v_json in array array['"in_review"', '"pretested"', '"in_review"', '"draft"', '"approved"', '"in_review"', '"retired"', '"approved"', '"draft"']::jsonb[] loop
      begin
        update app.item_translations set status = v_json #>> '{}' where item_id = 'core:ytring:1' and locale = 'lt';
        v_txt := v_txt || ',' || (select status || coalesce('@' || (approved_at is not null)::text, '') from app.item_translations
                                  where item_id = 'core:ytring:1' and locale = 'lt');
      exception when check_violation then v_txt := v_txt || ',x';
      end;
    end loop;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'forward (skipping), back to draft before approval, approved only to retired, retired to draft',
      'expected', 'draft,in_review@false,pretested@false,x,draft@false,approved@true,x,retired@false,x,draft@false', 'actual', v_txt,
      'pass', v_txt = 'draft,in_review@false,pretested@false,x,draft@false,approved@true,x,retired@false,x,draft@false');

    -- 4 ------------------------------------------------------------ a new wording is a new version
    update app.item_translations set status = 'approved' where item_id = 'core:ytring:1' and locale = 'lt';
    update app.item_translations set text = 'kitas' where item_id = 'core:ytring:1' and locale = 'lt';
    select concat_ws(',', t.version, t.status, (t.approved_at is null)::text,
                     (select string_agg(l.version || ':' || l.status || ':' || l.text, ' ' order by l.id)
                      from app.item_translation_log l where l.item_id = t.item_id and l.locale = t.locale and l.status in ('approved', 'draft')))
      into v_txt
    from app.item_translations t where t.item_id = 'core:ytring:1' and t.locale = 'lt';
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'rewording an approved row: version 2, draft, unapproved; the approved version 1 is in the log',
      'expected', '2,draft,true,1:draft:bandymas 1:draft:bandymas 1:approved:bandymas 1:draft:bandymas 1:approved:bandymas 2:draft:kitas',
      'actual', v_txt,
      'pass', v_txt = '2,draft,true,1:draft:bandymas 1:draft:bandymas 1:approved:bandymas 1:draft:bandymas 1:approved:bandymas 2:draft:kitas');

    -- 5 ------------------------------------------------------------ the log cannot be changed
    v_txt := '';
    begin
      update app.item_translation_log set text = 'x' where item_id = 'core:ytring:1' and locale = 'lt';
      v_txt := 'updated';
    exception when insufficient_privilege then v_txt := 'refused';
    end;
    begin
      delete from app.item_translation_log where item_id = 'core:ytring:1' and locale = 'lt';
      v_txt := v_txt || ',deleted';
    exception when insufficient_privilege then v_txt := v_txt || ',refused';
    end;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'the log refuses an update and a delete',
      'expected', 'refused,refused', 'actual', v_txt, 'pass', v_txt = 'refused,refused');

    -- 6 ------------------------------------------------------------ who approves what
    -- a daglig leder, signed in, outside a platform command
    perform set_config('app.platform_actor', '', true);
    perform set_config('request.jwt.claims', format(claims, v_dl, 'aal2'), true);
    v_txt := (app.op_translation_update('lt', 'core:ytring:1', 'pretested', null, null)->>'error') || ','
          || (app.op_translations_approve('lt', null, app.translation_digest('lt'))->>'error');
    perform set_config('request.jwt.claims', '', true);
    -- the platform: a professional draft is not approvable until it is pretested
    perform set_config('app.platform_actor', 'test@platform', true);
    perform app.op_translations_approve('lt', null, app.op_translations('lt')->>'digest');
    v_txt := v_txt || ',' || (select status from app.item_translations where item_id = 'core:ytring:1' and locale = 'lt');
    v_txt := v_txt || ',' || (app.op_translation_update('lt', 'core:ytring:1', 'pretested', 'Adjudisert mot kilde.',
                                                        '{"pretest":"kognitivt intervju 2026-09"}')->>'status');
    v_txt := v_txt || ',' || coalesce(app.op_translation_update('lt', 'core:ytring:1', 'approved', null, null)->>'error', 'ok');
    v_txt := v_txt || ',' || coalesce(app.op_translation_update('lt', 'core:ytring:1', 'nonsense', null, null)->>'error', 'ok');
    v_txt := v_txt || ',' || coalesce(app.op_translation_update('lt', 'core:ytring:1', null, null, '{"other":"x"}')->>'error', 'ok');
    perform app.op_translations_approve('lt', null, app.op_translations('lt')->>'digest');
    v_txt := v_txt || ',' || (select status from app.item_translations where item_id = 'core:ytring:1' and locale = 'lt');
    v_txt := v_txt || ',' || coalesce(app.op_translation_update('lt', 'core:ytring:1', 'in_review', null, null)->>'error', 'ok');
    v_txt := v_txt || ',' || jsonb_array_length(app.op_translation_history('lt', 'core:ytring:1')->'entries')::text;
    perform set_config('app.platform_actor', '', true);
    -- approved by the platform, so by no person
    v_txt := v_txt || ',' || (select t.status || '/' || (t.approved_by is null and t.approved_at is not null)::text || '/' || t.notes || '/' || (t.trapd->>'pretest')
                              from app.item_translations t where t.item_id = 'core:ytring:1' and t.locale = 'lt');
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a professional row is approved only once pretested, by a platform command; a daglig leder can do nothing',
      'expected', 'not_allowed,not_allowed,draft,pretested,invalid,invalid,invalid,approved,transition,11,approved/true/Adjudisert mot kilde./kognitivt intervju 2026-09',
      'actual', v_txt,
      'pass', v_txt = 'not_allowed,not_allowed,draft,pretested,invalid,invalid,invalid,approved,transition,11,approved/true/Adjudisert mot kilde./kognitivt intervju 2026-09');

    -- a kindergarten asking a worded module, and English for every item it asks
    perform app.module_seed(jsonb_build_object(
      'module_id', 'probe-tgi', 'version', '0.0.1', 'name', 'Probe', 'description', 'Probe', 'estimated_minutes', 1,
      'scale', '{}'::jsonb, 'scoring', '{}'::jsonb, 'anonymity', '{"min_responses": 5, "can_lower": false}'::jsonb,
      'sources', '[]'::jsonb,
      'wording', '{"modes":["barnehage","skole","begge"],"default":"begge","tokens":{},"auto_from_nace":{"85.1":"barnehage"}}'::jsonb,
      'factors', jsonb_build_array(jsonb_build_object('id', 'f', 'name', 'F', 'summary', 'S', 'rationale', 'R',
        'rationale_sources', '[]'::jsonb, 'legal_basis', '[]'::jsonb,
        'items', jsonb_build_array(
          format(item, 'PT-FF-1', 'barna eller elevene 1', 'barna 1', 'elevene 1')::jsonb,
          '{"id":"PT-FF-2","text":"alle 2","reverse":false,"pulse_eligible":true}'::jsonb,
          '{"id":"PT-FF-3","text":"alle 3","reverse":false,"pulse_eligible":true}'::jsonb),
        'action_suggestions', '[]'::jsonb)),
      'count_items', '[]'::jsonb, 'segments', '[]'::jsonb), repeat('d', 64));
    perform app.module_set_status('probe-tgi', '0.0.1', 'published');
    select m.id into v_mod from app.question_modules m where m.key = 'probe-tgi';
    select i.id into v_item from app.module_items i where i.module_id = v_mod and i.code = 'PT-FF-1';
    update app.organizations set registry_nace_code = '85.100' where id = v_org;
    insert into app.measurements (org_id, kind, year) values (v_org, 'oppfolging', 2094) returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'planlagt', now() - interval '1 day', now() + interval '5 days') returning id into v_round;
    insert into app.round_factors (org_id, round_id, factor_key) values (v_org, v_round, 'ytring');
    perform app.add_round_module(v_org, v_round, v_mod);
    insert into app.item_translations (item_id, locale, text, source, approved_at)
    select k, 'en', 'tgi ' || k, 'machine', now() from app.round_item_keys(v_round) k
    on conflict (item_id, locale) do update set text = excluded.text, approved_at = excluded.approved_at;
    -- the other language's rows, whatever this database holds, are not this test's
    delete from app.item_translations where locale = 'pl' and item_id in (select app.round_item_keys(v_round));

    -- 7 ------------------------------------------------------------ opening pins
    update app.rounds set status = 'apen' where id = v_round;
    select concat_ws(',',
      (select count(*) from app.round_translations p where p.round_id = v_round and p.locale = 'en'),
      (select count(*) from app.round_item_keys(v_round)),
      (select count(*) from app.round_translations p where p.round_id = v_round and p.item_id = 'module:' || v_item || ':v:barnehage'),
      (select count(*) from app.round_translations p where p.round_id = v_round and p.item_id = 'module:' || v_item),
      (select count(*) from app.round_translations p where p.round_id = v_round and p.locale = 'pl'))
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'opening pins every approved item, the factor''s name too (0086); the worded statement under its barnehage key',
      'expected', '7,7,1,0,0', 'actual', v_txt, 'pass', v_txt = '7,7,1,0,0');

    -- 8 ------------------------------------------------------------ the respondent's texts
    insert into app.employees (org_id, full_name, email, language, active)
    values (v_org, 'Tgi Probe', 'tgi-probe@orgpuls.com', 'en', true) returning id into v_emp;
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
    values (v_org, v_round, v_emp, extensions.digest(v_token, 'sha256'), now() + interval '5 days');
    set local role anon;
    v_json := public.respond_locales(v_token);
    reset role;
    v_txt := concat_ws(',', v_json#>>'{locales,en,missing}', v_json#>>array['texts', 'en', 'module:' || v_item],
                       (select count(*) from jsonb_object_keys(v_json#>'{texts,en}') k where k like '%:v:%'));
    v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'English complete; the barnehage wording arrives under the item''s own key',
      'expected', format('0,tgi module:%s:v:barnehage,0', v_item), 'actual', v_txt,
      'pass', v_txt = format('0,tgi module:%s:v:barnehage,0', v_item));

    -- 9 ------------------------------------------------------------ the field keeps its wording
    update app.item_translations set text = 'tgi reworded' where item_id = 'core:ytring:1' and locale = 'en';
    set local role anon;
    v_txt := (public.respond_locales(v_token)#>>'{locales,en,missing}') || ',' || (public.respond_locales(v_token)#>>'{texts,en,core:ytring:1}');
    reset role;
    update app.item_translations set status = 'approved' where item_id = 'core:ytring:1' and locale = 'en';
    set local role anon;
    v_txt := v_txt || ',' || (public.respond_locales(v_token)#>>'{texts,en,core:ytring:1}');
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'a new wording, drafted or approved, does not reach the open round',
      'expected', '0,tgi core:ytring:1,tgi core:ytring:1', 'actual', v_txt, 'pass', v_txt = '0,tgi core:ytring:1,tgi core:ytring:1');

    -- 10 ----------------------------------------------------------- a pin is fixed, and goes with its round
    v_txt := '';
    begin
      update app.round_translations set text = 'x' where round_id = v_round;
      v_txt := 'updated';
    exception when insufficient_privilege then v_txt := 'refused';
    end;
    begin
      delete from app.round_translations where round_id = v_round;
      v_txt := v_txt || ',deleted';
    exception when insufficient_privilege then v_txt := v_txt || ',refused';
    end;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'planlagt', now() - interval '1 day', now() + interval '5 days') returning id into v_other;
    insert into app.round_factors (org_id, round_id, factor_key) values (v_org, v_other, 'ytring');
    update app.rounds set status = 'apen' where id = v_other;
    v_txt := v_txt || ',' || (select p.text from app.round_translations p where p.round_id = v_other and p.item_id = 'core:ytring:1' and p.locale = 'en');
    delete from app.round_factors where round_id = v_other;
    delete from app.rounds where id = v_other;
    get diagnostics v_n = row_count;
    v_txt := v_txt || ',' || v_n || ',' || (select count(*) from app.round_translations p where p.round_id = v_other);
    v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'a pin refuses an update and a delete; the next round takes the new wording; a deleted round takes its pins',
      'expected', 'refused,refused,tgi reworded,1,0', 'actual', v_txt, 'pass', v_txt = 'refused,refused,tgi reworded,1,0');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  v_txt := (not exists (select 1 from app.item_translations where text in ('bandymas', 'kitas', 'tgi reworded') or text like 'tgi %')
            and not exists (select 1 from app.question_modules where key = 'probe-tgi'))::text;
  v_rows := v_rows || jsonb_build_object('seq', 11, 'name', 'every probe change was rolled back', 'expected', 'true', 'actual', v_txt, 'pass', v_txt = 'true');

  insert into public._tgi
  select (x->>'seq')::int, x->>'name', x->>'expected', x->>'actual', (x->>'pass')::boolean from jsonb_array_elements(v_rows) x;
end $$;

select seq, name, expected, actual, pass from public._tgi order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._tgi;
  if v_failed is not null then raise exception 'translation governance invariants failed: %', v_failed; end if;
  if v_count <> 11 then raise exception 'translation governance invariants: expected 11 rows, got %', v_count; end if;
end $$;

drop table public._tgi;
