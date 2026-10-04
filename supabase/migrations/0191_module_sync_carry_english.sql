-- 0191 — A module's English does not cost its other translations (D-214)
--
-- module_sync (0122) carries the survey translations of every statement and factor name that did not
-- change to the next version. It compared the whole stored text, and the stored text holds the file's
-- English beside the Norwegian (0072: items `{nb, en}`, options `[{nb, en}]`, a factor's `i18n.en`). A
-- file that gains `translations.en` — barnehage og skole, kunnskap og kontor and handel did (D-214) — would
-- therefore have read as every statement reworded: «Make live» would publish the next version with none
-- of its approved Polish, Lithuanian, Ukrainian, Swedish, Danish or English survey texts, taking each
-- of those languages out of every round with the module (D-133) until they were approved again.
--
-- The wording is the Norwegian; the carry now compares that (every key not starting with `en`). An
-- English registry row is carried only where it agrees with the English the new version stores, or
-- where that version stores none for the text (a wording variant, a help line), so the registry can
-- never contradict the file. Nothing else in module_sync changes: «validated» still falls back to
-- provisional on any change to what respondents read, the English included.

-- the Norwegian of a stored text: every key but the English ones (`en`, `en.barnehage` …)
create function app.module_nb(j jsonb) returns jsonb
  language sql immutable set search_path = ''
as $$
  select case when j is null or jsonb_typeof(j) <> 'object' then j
              else coalesce((select jsonb_object_agg(k, v) from jsonb_each(j) as x(k, v) where k !~ '^en($|\.)'), '{}'::jsonb) end
$$;

-- the Norwegian of a stored option list, in order
create function app.module_nb_options(j jsonb) returns jsonb
  language sql immutable set search_path = ''
as $$
  select case when j is null or jsonb_typeof(j) <> 'array' then j
              else coalesce((select jsonb_agg(app.module_nb(o) order by n) from jsonb_array_elements(j) with ordinality as x(o, n)), '[]'::jsonb) end
$$;
revoke all on function app.module_nb(jsonb) from public, anon, authenticated;
revoke all on function app.module_nb_options(jsonb) from public, anon, authenticated;

create or replace function app.module_sync(p jsonb, p_body text) returns jsonb
  language plpgsql set search_path = ''
as $fn$
declare
  v_key     text := p->>'module_id';
  v_last    app.question_modules;
  v_same    app.question_modules;
  v_ver     text;
  v_new     uuid;
  v_parts   int[];
  v_changed boolean;
  v_valid   text;
  v_moved   int := 0;
  v_copied  int := 0;
  v_n       int;
begin
  if coalesce(p_body, '') !~ '^[0-9a-f]{64}$' or coalesce(v_key, '') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'module_sync: a module id and a body hash are needed' using errcode = 'check_violation';
  end if;

  -- the same body is already a version: nothing to do
  select * into v_same from app.question_modules m where m.key = v_key and m.body_hash = p_body
  order by string_to_array(m.version, '.')::int[] desc limit 1;
  if found then
    return jsonb_build_object('result', 'unchanged', 'version', v_same.version, 'status', v_same.status);
  end if;

  select * into v_last from app.question_modules m where m.key = v_key
  order by string_to_array(m.version, '.')::int[] desc limit 1;

  -- a module the database has never seen: its first version, as a draft
  if not found then
    v_ver := coalesce(nullif(p->>'version', ''), '1.0.0');
    perform app.module_seed(p || jsonb_build_object('version', v_ver), p_body);
    update app.question_modules set body_hash = p_body where key = v_key and version = v_ver;
    return jsonb_build_object('result', 'new', 'version', v_ver, 'status', 'draft');
  end if;

  -- a draft nobody has been asked yet is simply replaced
  if v_last.status = 'draft' then
    perform app.module_seed(p || jsonb_build_object('version', v_last.version, 'validation_status', v_last.validation_status), p_body);
    update app.question_modules set body_hash = p_body where key = v_key and version = v_last.version;
    return jsonb_build_object('result', 'draft', 'version', v_last.version, 'status', 'draft');
  end if;

  -- otherwise the next version
  v_parts := string_to_array(v_last.version, '.')::int[];
  v_ver := v_parts[1] || '.' || v_parts[2] || '.' || (v_parts[3] + 1);
  perform app.module_seed(p || jsonb_build_object('version', v_ver, 'validation_status', v_last.validation_status), p_body);
  select m.id into v_new from app.question_modules m where m.key = v_key and m.version = v_ver;

  -- what a respondent reads: the statements, their options and their order
  v_changed := (select coalesce(jsonb_agg(jsonb_build_array(i.code, i.kind, i.text, i.options) order by i.code), '[]')
                from app.module_items i where i.module_id = v_new)
               is distinct from
               (select coalesce(jsonb_agg(jsonb_build_array(i.code, i.kind, i.text, i.options) order by i.code), '[]')
                from app.module_items i where i.module_id = v_last.id);
  v_valid := case when v_changed and v_last.validation_status = 'validated' then 'provisional' else v_last.validation_status end;
  update app.question_modules set body_hash = p_body, validation_status = v_valid where id = v_new;

  -- the survey translations of every statement and factor name whose Norwegian did not change (0191): an
  -- English translation added to the file is not a change of wording, so it does not cost the other
  -- languages their approved texts. An English row is carried only where it is the file's English, or
  -- the file has none for that text.
  insert into app.item_translations (item_id, locale, text, source, status, approved_by, approved_at, notes, trapd, source_hash, approved_auto)
  select regexp_replace(t.item_id, '^(module|mfactor):' || pr.old_id::text, '\1:' || pr.new_id::text),
         t.locale, t.text, t.source, t.status, t.approved_by, t.approved_at, t.notes, t.trapd, t.source_hash, t.approved_auto
  from (
    select o.id as old_id, n.id as new_id, 'module' as kind, n.text as new_text, n.options as new_options, null::jsonb as new_i18n
    from app.module_items o join app.module_items n on n.code = o.code and n.module_id = v_new
    where o.module_id = v_last.id and o.kind = n.kind
      and app.module_nb(o.text) = app.module_nb(n.text)
      and app.module_nb_options(o.options) is not distinct from app.module_nb_options(n.options)
    union all
    select o.id, n.id, 'mfactor', null, null, n.i18n
    from app.module_factors o join app.module_factors n on n.key = o.key and n.module_id = v_new
    where o.module_id = v_last.id and o.name = n.name and app.module_nb(o.i18n) = app.module_nb(n.i18n)
  ) pr
  join app.item_translations t on split_part(t.item_id, ':', 1) = pr.kind and split_part(t.item_id, ':', 2) = pr.old_id::text
  where t.status <> 'retired'
    and (t.locale <> 'en' or t.text is not distinct from coalesce(
          case
            when pr.kind = 'mfactor' and split_part(t.item_id, ':', 3) = '' then pr.new_i18n->'en'->>'name'
            when pr.kind = 'module' and split_part(t.item_id, ':', 3) = '' then pr.new_text->>'en'
            when pr.kind = 'module' and split_part(t.item_id, ':', 3) ~ '^o[0-9]+$'
              then pr.new_options->(substr(split_part(t.item_id, ':', 3), 2)::int - 1)->>'en'
          end, t.text))
  on conflict do nothing;
  get diagnostics v_copied = row_count;

  if v_last.status = 'published' then
    perform app.module_set_status(v_key, v_ver, 'published');
    -- planned rounds nobody has answered ask the new version: the statements they asked, by code,
    -- and any statement the new version adds
    update app.round_modules rm
    set module_id = v_new,
        item_ids = coalesce((
          select array_agg(n.id order by n.sort) from app.module_items n
          where n.module_id = v_new and n.kind = 'likert5'
            and (n.code in (select o.code from app.module_items o where o.id = any (rm.item_ids))
                 or n.code not in (select o.code from app.module_items o where o.module_id = v_last.id))), '{}')
    from app.rounds r
    where r.id = rm.round_id and rm.module_id = v_last.id and r.status = 'planlagt' and not app.round_answered(r.id);
    get diagnostics v_moved = row_count;
    perform app.module_set_status(v_key, v_last.version, 'retired');
  end if;

  return jsonb_build_object('result', case when v_last.status = 'published' then 'published' else 'draft' end,
                            'version', v_ver, 'previous', v_last.version,
                            'status', case when v_last.status = 'published' then 'published' else 'draft' end,
                            'changed_statements', v_changed, 'validation', v_valid,
                            'rounds_moved', v_moved, 'translations_carried', v_copied);
end $fn$;
revoke all on function app.module_sync(jsonb, text) from public, anon, authenticated;
