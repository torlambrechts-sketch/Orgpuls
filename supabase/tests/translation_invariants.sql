-- translation_invariants.sql — the translation registry (0079, 0080, D-127; engagement P1).
--
--   * both tables: RLS on, no write policy, no insert grant (1)
--   * a qa-fixture translation is approved only on the QA stack; a changed text loses its
--     approval (2)
--   * respond_locales: a bad token learns nothing; a good one gets each language's state, the
--     employee's own language, and the wording only for a language complete for its survey (3, 4)
--   * only the platform's people approve (5)
--   * the dispatcher is told the employee's language and the survey's state for a personal
--     message, and nothing for a notice to a role (6)
--   * nothing written here survives (7)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/translation_invariants.sql

create unlogged table if not exists public._tri(seq int, name text, expected text, actual text, pass bool);
truncate public._tri;

do $$
declare
  v_org   uuid := '00000000-0000-4000-8000-000000000001';
  v_dl    uuid;
  v_meas  uuid;
  v_round uuid;
  v_emp   uuid;
  v_inv   uuid;
  v_ob    uuid;
  v_n     int;
  v_rows  jsonb := '[]';
  v_txt   text;
  v_json  jsonb;
  v_token constant text := 'tri-probe-token-0000000000000001';
  v_hash  constant text := repeat('ab', 32);
  claims  constant text := '{"sub":"%s","role":"authenticated","aal":"aal1"}';
begin
  select m.user_id into v_dl from app.memberships m where m.org_id = v_org and m.role = 'daglig_leder' and m.active limit 1;

  -- 1 -------------------------------------------------------------- the grant surface
  select string_agg(
           (select relrowsecurity from pg_class where oid = ('app.' || t)::regclass)::text || '/'
           || (select count(*) from pg_policies where schemaname = 'app' and tablename = t and cmd <> 'SELECT')::text || '/'
           || has_table_privilege('authenticated', 'app.' || t, 'insert')::text || '/'
           || has_table_privilege('anon', 'app.' || t, 'select')::text, ',' order by t)
    into v_txt
  from unnest(array['item_translations', 'ui_translation_approvals']) t;
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'RLS on, no write policy, no insert grant, nothing for anon',
    'expected', 'true/0/false/false,true/0/false/false', 'actual', v_txt, 'pass', v_txt = 'true/0/false/false,true/0/false/false');

  begin
    -- 2 ------------------------------------------------------------ approvals
    perform set_config('app.environment', '', true);
    begin
      insert into app.item_translations (item_id, locale, text, source, approved_at)
      values ('core:ytring:1', 'lt', 'bandymas', 'qa-fixture', now());
      v_txt := 'approved';
    exception when check_violation then v_txt := 'refused';
    end;
    perform set_config('app.environment', 'qa', true);
    insert into app.item_translations (item_id, locale, text, source, approved_at)
    values ('core:ytring:1', 'lt', 'bandymas', 'qa-fixture', now());
    v_txt := v_txt || ',' || (select (approved_at is not null)::text from app.item_translations where item_id = 'core:ytring:1' and locale = 'lt');
    update app.item_translations set text = 'kitas' where item_id = 'core:ytring:1' and locale = 'lt';
    v_txt := v_txt || ',' || (select (approved_at is null)::text from app.item_translations where item_id = 'core:ytring:1' and locale = 'lt');
    perform set_config('app.environment', '', true);
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'a qa-fixture approval: refused off the QA stack, allowed on it; a new text drops the approval',
      'expected', 'refused,true,true', 'actual', v_txt, 'pass', v_txt = 'refused,true,true');

    -- a survey of one factor, open, with one invitation to an English speaker
    insert into app.measurements (org_id, kind, year) values (v_org, 'oppfolging', 2095) returning id into v_meas;
    insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
    values (v_org, v_meas, 'apen', now() - interval '1 day', now() + interval '5 days') returning id into v_round;
    insert into app.round_factors (org_id, round_id, factor_key) values (v_org, v_round, 'ytring');
    insert into app.employees (org_id, full_name, email, language, active)
    values (v_org, 'Tri Probe', 'tri-probe@orgpuls.com', 'en', true) returning id into v_emp;
    insert into app.invitations (org_id, round_id, employee_id, token_hash, expires_at)
    values (v_org, v_round, v_emp, extensions.digest(v_token, 'sha256'), now() + interval '5 days') returning id into v_inv;
    insert into app.item_translations (item_id, locale, text, source, approved_at)
    select 'core:ytring:' || s.ordinal, 'en', 'probe ' || s.ordinal, 'machine', now()
    from app.statements s where s.factor_key = 'ytring'
    on conflict (item_id, locale) do update set text = excluded.text, approved_at = excluded.approved_at;
    -- whatever this database already holds for Polish (the QA tenant's fixtures) is set aside
    delete from app.item_translations where locale = 'pl' and item_id like 'core:ytring:%';
    insert into app.item_translations (item_id, locale, text, source)
    values ('core:ytring:1', 'pl', 'sonda', 'professional')
    on conflict (item_id, locale) do update set text = excluded.text, approved_at = null;
    insert into app.ui_translation_approvals (locale, messages_hash) values ('en', v_hash);

    -- 3, 4 --------------------------------------------------------- the respondent's view
    set local role anon;
    v_txt := (public.respond_locales('too-short')->>'error') || ',' || (public.respond_locales('tri-probe-token-9999999999999999')->>'error');
    v_json := public.respond_locales(v_token);
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'a bad or unknown token learns nothing',
      'expected', 'invalid_token,invalid_token', 'actual', v_txt, 'pass', v_txt = 'invalid_token,invalid_token');
    v_txt := concat_ws(',', v_json->>'employee_lang', v_json#>>'{locales,en,missing}', v_json#>>'{locales,pl,missing}',
                       (v_json#>'{locales,en,ui}') ? v_hash,
                       (select string_agg(k, ' ' order by k) from jsonb_object_keys(v_json->'texts') k),
                       jsonb_typeof(v_json#>'{texts,en,core:ytring:1}'));
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'the employee''s language; English complete with its UI hash, Polish not; wording only for English',
      'expected', 'en,0,3,t,en,string', 'actual', v_txt, 'pass', v_txt = 'en,0,3,t,en,string');

    -- 5 ------------------------------------------------------------ who approves
    perform set_config('request.jwt.claims', format(claims, v_dl), true);
    set local role authenticated;
    v_txt := (public.approve_item_translations('pl', array['core:ytring:1'])->>'error') || ','
             || (public.approve_ui_translation('pl', v_hash)->>'error');
    begin
      update app.item_translations set approved_at = now() where locale = 'pl';
      get diagnostics v_n = row_count;
      v_txt := v_txt || ',' || v_n::text;
    exception when insufficient_privilege then v_txt := v_txt || ',refused';
    end;
    reset role;
    v_txt := v_txt || ',' || (select (approved_at is null)::text from app.item_translations where item_id = 'core:ytring:1' and locale = 'pl');
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'a daglig leder may not approve, through the functions or the table',
      'expected', 'not_allowed,not_allowed,refused,true', 'actual', v_txt, 'pass', v_txt = 'not_allowed,not_allowed,refused,true');

    -- 6 ------------------------------------------------------------ the dispatcher
    update app.organizations set mail_enabled = (id = v_org);
    update app.outbox set sent_at = coalesce(sent_at, now()) where org_id = v_org;
    insert into app.outbox (org_id, round_id, kind, employee_id, invitation_id, due_at)
    values (v_org, v_round, 'lenke', v_emp, v_inv, now()) returning id into v_ob;
    update app.outbox set channel = 'email' where id = v_ob;
    v_json := public.dispatch_claim(100);
    select concat_ws(',', j#>>'{recipients,0,lang}', j#>>'{locales,en,missing}', (j#>'{locales,en,ui}') ? v_hash)
      into v_txt from jsonb_array_elements(v_json) j where j->>'id' = v_ob::text;
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'a personal message carries the employee''s language and the survey''s language state',
      'expected', 'en,0,t', 'actual', coalesce(v_txt, 'none'), 'pass', v_txt = 'en,0,t');

    perform set_config('request.jwt.claims', '', true);
    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  v_txt := (not exists (select 1 from app.item_translations where text in ('bandymas', 'kitas', 'sonda') or text like 'probe %')
            and not exists (select 1 from app.employees where email = 'tri-probe@orgpuls.com')
            and not exists (select 1 from app.ui_translation_approvals where messages_hash = v_hash))::text;
  v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'every probe change was rolled back', 'expected', 'true', 'actual', v_txt, 'pass', v_txt = 'true');

  insert into public._tri
  select (x->>'seq')::int, x->>'name', x->>'expected', x->>'actual', (x->>'pass')::boolean from jsonb_array_elements(v_rows) x;
end $$;

select seq, name, expected, actual, pass from public._tri order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._tri;
  if v_failed is not null then raise exception 'translation invariants failed: %', v_failed; end if;
  if v_count <> 7 then raise exception 'translation invariants: expected 7 rows, got %', v_count; end if;
end $$;

drop table public._tri;
