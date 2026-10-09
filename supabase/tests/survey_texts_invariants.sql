-- survey_texts_invariants.sql — the instrument's approved texts for the leader's views (0216, D-253).
--
--   * public.survey_texts is callable by anon and authenticated and runs as its owner with an
--     empty search_path (1)
--   * it returns a language's approved statements, questions outside the index and their options,
--     and factor and question labels, each with the bokmål source hash (2)
--   * never a draft, a page string, a mail text, a module item or factor name, nor another
--     language's row (3)
--   * a language with none gives an empty object (4)
--   * nothing written here survives (5)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/survey_texts_invariants.sql

create unlogged table if not exists public._stx(seq int, name text, expected text, actual text, pass bool);
truncate public._stx;

do $$
declare
  v_rows jsonb := '[]';
  v_txt  text;
  v_json jsonb;
  h      constant text := repeat('cd', 32);
begin
  -- 1 -------------------------------------------------------------- the grant surface
  v_txt := concat_ws('/',
    has_function_privilege('anon', 'public.survey_texts(text)', 'execute'),
    has_function_privilege('authenticated', 'public.survey_texts(text)', 'execute'),
    (select p.prosecdef from pg_proc p where p.oid = 'public.survey_texts(text)'::regprocedure),
    (select p.proconfig::text from pg_proc p where p.oid = 'public.survey_texts(text)'::regprocedure));
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'callable by anon and authenticated, as its owner, with an empty search_path',
    'expected', 't/t/t/{"search_path=\"\""}', 'actual', v_txt, 'pass', v_txt = 't/t/t/{"search_path=\"\""}');

  begin
    insert into app.item_translations (item_id, locale, text, source, approved_at, source_hash) values
      ('core:ytring:1',          'da', 'stx core',        'official', now(), h),
      ('extra:anbefaling',       'da', 'stx extra',       'official', now(), h),
      ('extra:anbefaling:o1',    'da', 'stx option',      'official', now(), h),
      ('ui:factor.ytring',       'da', 'stx factor',      'official', now(), h),
      ('ui:extra.anbefaling',    'da', 'stx label',       'official', now(), h),
      ('ui:respond.intro',       'da', 'stx page',        'official', now(), h),
      ('mail:invitasjon.subject','da', 'stx mail',        'official', now(), h),
      ('core:ytring:1',          'lt', 'stx other',       'official', now(), h)
    on conflict (item_id, locale) do update
      set text = excluded.text, source = excluded.source, approved_at = excluded.approved_at, source_hash = excluded.source_hash;
    insert into app.item_translations (item_id, locale, text, source, source_hash) values ('core:ytring:2', 'da', 'stx draft', 'professional', h)
    on conflict (item_id, locale) do update set text = excluded.text, source = excluded.source, approved_at = null, source_hash = excluded.source_hash;
    -- a module's statement and factor name, approved: the leader's views read those from the module
    insert into app.item_translations (item_id, locale, text, source, approved_at, source_hash)
    select 'module:' || i.id, 'da', 'stx module', 'official', now(), h from app.module_items i limit 1
    on conflict (item_id, locale) do update set text = excluded.text, source = excluded.source, approved_at = excluded.approved_at;

    set local role anon;
    v_json := public.survey_texts('da');
    reset role;

    -- 2 ------------------------------------------------------------ what it returns
    v_txt := concat_ws(',', v_json #>> '{core:ytring:1,t}', v_json #>> '{extra:anbefaling,t}', v_json #>> '{extra:anbefaling:o1,t}',
                            v_json #>> '{ui:factor.ytring,t}', v_json #>> '{ui:extra.anbefaling,t}', (v_json #>> '{core:ytring:1,h}') = h);
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'approved statements, questions, options and labels, each with its source hash',
      'expected', 'stx core,stx extra,stx option,stx factor,stx label,t', 'actual', v_txt,
      'pass', v_txt = 'stx core,stx extra,stx option,stx factor,stx label,t');

    -- 3 ------------------------------------------------------------ what it never returns
    v_txt := concat_ws(',', v_json ? 'core:ytring:2', v_json ? 'ui:respond.intro', v_json ? 'mail:invitasjon.subject',
                            exists (select 1 from jsonb_object_keys(v_json) k where k like 'module:%' or k like 'mfactor:%'),
                            exists (select 1 from jsonb_each(v_json) e where e.value ->> 't' = 'stx other'));
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'no draft, page string, mail text, module text or other language',
      'expected', 'f,f,f,f,f', 'actual', v_txt, 'pass', v_txt = 'f,f,f,f,f');

    -- 4 ------------------------------------------------------------ a language with none
    set local role anon;
    v_txt := public.survey_texts('xx')::text;
    reset role;
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'a language with no approved texts gives an empty object',
      'expected', '{}', 'actual', v_txt, 'pass', v_txt = '{}');

    raise exception 'rollback-probe';
  exception when others then
    if sqlerrm <> 'rollback-probe' then raise; end if;
  end;

  -- 5 -------------------------------------------------------------- rolled back
  v_txt := (not exists (select 1 from app.item_translations where text like 'stx %'))::text;
  v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'every probe change was rolled back', 'expected', 'true', 'actual', v_txt, 'pass', v_txt = 'true');

  insert into public._stx
  select (x->>'seq')::int, x->>'name', x->>'expected', x->>'actual', (x->>'pass')::boolean from jsonb_array_elements(v_rows) x;
end $$;

select seq, name, expected, actual, pass from public._stx order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._stx;
  if v_failed is not null then raise exception 'survey texts invariants failed: %', v_failed; end if;
  if v_count <> 5 then raise exception 'survey texts invariants: expected 5 rows, got %', v_count; end if;
end $$;

drop table public._stx;
