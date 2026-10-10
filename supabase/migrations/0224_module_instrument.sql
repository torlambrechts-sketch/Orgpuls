-- 0224 — A module can carry a published instrument as it is published (UK-D1, X-111, X-112, D-267).
--
-- HSE's Management Standards Indicator Tool (UK-D) is a questionnaire HSE asks to be kept as it is:
-- «the question wording and scoring system the same and the items in the same order». The module
-- format so far assumed an instrument of its own making: the core's agreement scale for every
-- statement, three to five statements a factor, a shuffled order, «Ikke relevant for meg» on every
-- statement, and nothing before the first statement. Each of those becomes something a module may
-- state, and a module that states none of them is stored and asked exactly as before.
--
-- 1 · A statement's own answers. A likert statement may carry its five answer labels (options, as a
--     count question's are), from a scale the module file names: HSE's items 1–23 are answered
--     Never…Always and 24–35 Strongly disagree…Strongly agree. Stored per statement, they are
--     translated per statement in the registry under the keys count questions already use
--     (module:<id>:o<n>), so a survey language is offered only where they are approved (D-133).
-- 2 · Up to nine statements a factor: codes end in 1–9 (HSE's demands scale has eight).
-- 3 · A preface: a text shown before a statement, translated under module:<id>:p. HSE's
--     instruction stands before item 1.
-- 4 · «Not relevant to me» per statement (offers_not_relevant, true by default). HSE's tool has five
--     answers and nothing beside them; submit_response refuses `na` for a statement that offers none.
-- 5 · A fixed order (question_modules.fixed_order): statements are stored in the instrument's
--     order (sort) and respond_form asks them in it, where every other module's are shuffled per
--     token as before.
-- 6 · An attribution (question_modules.attribution, nb and en), for the leader's screens and the
--     report: OGL v3 asks for one, and HSE's own wording is used for it.
--
-- The frozen rule for a published module (0067) now also holds fixed_order and attribution; a
-- published statement's new columns are frozen with the row, as every column of it is.

-- ---------------------------------------------------------------- columns and their rules
alter table app.module_items
  add column preface jsonb,
  add column offers_not_relevant boolean not null default true;
comment on column app.module_items.preface is
  'A text shown before the statement (0224), {nb, en}; translated in the registry under module:<id>:p. HSE''s instruction stands before its item 1.';
comment on column app.module_items.offers_not_relevant is
  'Whether «Ikke relevant for meg» is offered beside the statement''s five answers (0224). False for an instrument that has none (HSE).';

alter table app.module_items add constraint module_items_preface check (
  preface is null or (kind = 'likert5' and jsonb_typeof(preface) = 'object' and length(btrim(preface->>'nb')) > 0));
alter table app.module_items add constraint module_items_not_relevant_likert check (offers_not_relevant or kind = 'likert5');

-- a likert statement may carry its own five answers, and a factor up to nine statements
alter table app.module_items drop constraint module_items_likert_shape;
alter table app.module_items add constraint module_items_likert_shape check (
  kind <> 'likert5' or (code ~ '^[A-Z]{2}-[A-Z]{2}-[1-9]$' and report_scope = 'group'
                        and (options is null or (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 5))));

alter table app.question_modules
  add column fixed_order boolean not null default false,
  add column attribution jsonb;
comment on column app.question_modules.fixed_order is
  'Whether the statements are asked in the instrument''s order (sort) rather than shuffled per respondent (0224).';
comment on column app.question_modules.attribution is
  'The source the module must credit, {nb, en} (0224): OGL v3 attribution for HSE''s Indicator Tool. Shown on the leader''s screens and in the report.';
alter table app.question_modules add constraint question_modules_attribution check (
  attribution is null or (jsonb_typeof(attribution) = 'object' and length(btrim(attribution->>'nb')) > 0));

-- the registry takes a statement's preface (module:<id>:p)
alter table app.item_translations drop constraint item_translations_item_id_check;
alter table app.item_translations add constraint item_translations_item_id_check
  check (item_id ~ '^(core:[a-z_]+:[0-9]+|extra:[a-z_]+(:o[0-9]+)?|module:[0-9a-f-]{36}(:v:(barnehage|skole)|:o[0-9]+|:p)?|mfactor:[0-9a-f-]{36}(:v:(barnehage|skole))?|(ui|mail):[a-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)*)$');

-- ---------------------------------------------------------------- the functions, changed in place
-- Each function's latest definition is changed in the named place only; a definition that does not
-- hold the expected text stops the migration rather than guess (as 0150).
do $$
declare
  r     record;
  v_def text;
begin
  for r in select * from (values
    -- a published module's new columns are frozen with the rest (0067)
    ('app.module_frozen()',
     '      new.wording)',
     '      new.wording, new.fixed_order, new.attribution)'),
    ('app.module_frozen()',
     '      old.wording)',
     '      old.wording, old.fixed_order, old.attribution)'),

    -- the seed reads the instrument: its order, its attribution
    ('app.module_seed(jsonb,text)',
     $o$                                    validation_status)
  values ($o$,
     $n$                                    validation_status, fixed_order, attribution)
  values ($n$),
    ('app.module_seed(jsonb,text)',
     $o$          p->>'validation_status')
  returning id into v_id;$o$,
     $n$          p->>'validation_status',
          -- 0224: an instrument asked in its published order, and the source it credits
          coalesce(p->'instrument' ? 'order', false),
          case when p ? 'attribution' then jsonb_strip_nulls(jsonb_build_object('nb', p->>'attribution', 'en', tr->>'attribution')) end)
  returning id into v_id;$n$),
    -- and a statement's own answers, its preface, «not relevant» and its place in that order
    ('app.module_seed(jsonb,text)',
     $o$                                    help, core_indicator, construct, source, improvement_note)
      values (v_id, v_fid, it->>'id', 'likert5',$o$,
     $n$                                    help, core_indicator, construct, source, improvement_note,
                                    options, preface, offers_not_relevant)
      values (v_id, v_fid, it->>'id', 'likert5',$n$),
    ('app.module_seed(jsonb,text)',
     $o$              (it->>'reverse')::boolean, (it->>'pulse_eligible')::boolean, 'group', fi * 10 + ii,
              case when it ? 'help' then jsonb_build_object('nb', it->>'help') end,
              coalesce((it->>'core_indicator')::boolean, false), it->>'construct', it->>'source', it->>'improvement_note');$o$,
     $n$              (it->>'reverse')::boolean, (it->>'pulse_eligible')::boolean, 'group',
              -- 0224: the instrument's order where the file gives one, else factor by factor
              coalesce(10 * (select z.o::int from jsonb_array_elements_text(p->'instrument'->'order') with ordinality as z(c, o)
                             where z.c = it->>'id'), fi * 10 + ii),
              case when it ? 'help' then jsonb_build_object('nb', it->>'help') end,
              coalesce((it->>'core_indicator')::boolean, false), it->>'construct', it->>'source', it->>'improvement_note',
              -- 0224: the five answers of the scale the statement names; none for the core's
              case when it ? 'scale' then (
                select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('nb', l, 'en', tr->'scales'->(it->>'scale')->'labels'->>(n::int - 1))) order by n)
                from jsonb_array_elements_text(p->'scales'->(it->>'scale')->'labels') with ordinality as y(l, n)) end,
              case when it ? 'preface' then jsonb_strip_nulls(jsonb_build_object('nb', it->>'preface', 'en', v_tf->'prefaces'->>(it->>'id'))) end,
              coalesce((p->'instrument'->>'not_relevant')::boolean, true));$n$),

    -- a round's registry keys: a statement's own answers and its preface
    ('app.round_item_keys(uuid)',
     $o$   and ((i.kind = 'count' and rm.include_count_items) or (i.kind = 'segment' and rm.include_segments))
  cross join lateral jsonb_array_elements(i.options) with ordinality as y(o, n)
  where rm.round_id = p_round$o$,
     $n$   and ((i.kind = 'count' and rm.include_count_items) or (i.kind = 'segment' and rm.include_segments)
        -- 0224: a statement's own answers
        or (i.kind = 'likert5' and i.id = any (rm.item_ids)))
  cross join lateral jsonb_array_elements(i.options) with ordinality as y(o, n)
  where rm.round_id = p_round
  union all
  -- 0224: the text before a statement
  select 'module:' || i.id || ':p'
  from app.round_modules rm join app.module_items i on i.module_id = rm.module_id and i.id = any (rm.item_ids)
  where rm.round_id = p_round and i.preface is not null$n$),
    -- and every published module's, for the translation package
    ('app.all_item_keys()',
     $o$  where m.status = 'published' and i.kind in ('count', 'segment')$o$,
     $n$  where m.status = 'published' and i.options is not null
  union all
  -- 0224: the text before a statement
  select 'module:' || i.id || ':p' from app.module_items i join app.question_modules m on m.id = i.module_id
  where m.status = 'published' and i.preface is not null$n$),

    -- the respondent: a statement's answers, preface and «not relevant», in the instrument's order
    ('public.respond_form(text)',
     $o$'help', i.help->>'nb', 'help_en', i.help->>'en')
                                       order by extensions.digest(p_token || i.id::text, 'sha256')), '[]'::jsonb)$o$,
     $n$'help', i.help->>'nb', 'help_en', i.help->>'en',
                                                  -- 0224: its own answers, the text before it, and whether
                                                  -- «not relevant» is offered beside them
                                                  'options', (select jsonb_agg(o->>'nb' order by n) from jsonb_array_elements(i.options) with ordinality as y(o, n)),
                                                  'options_en', (select jsonb_agg(o->>'en' order by n) from jsonb_array_elements(i.options) with ordinality as y(o, n)),
                                                  'preface', i.preface->>'nb', 'preface_en', i.preface->>'en',
                                                  'na', i.offers_not_relevant)
                                       -- 0224: an instrument in its own order; every other module shuffled per token
                                       order by case when m.fixed_order then i.sort end,
                                                extensions.digest(p_token || i.id::text, 'sha256')), '[]'::jsonb)$n$),
    ('public.respond_form(text)',
     $o$           'name', m.name,
           -- 0089$o$,
     $n$           'name', m.name,
           -- 0224: asked in the instrument's order, paged as it is
           'fixed_order', m.fixed_order,
           -- 0089$n$),

    -- and its answer: no «not relevant» where the statement offers none
    ('public.submit_response(text,jsonb,jsonb,jsonb,jsonb,boolean)',
     $o$     or not (   (coalesce(x->>'value', '') ~ '^[1-5]$' and not x ? 'na')
             or (x->'na' = 'true'::jsonb and nullif(x->>'value', '') is null));
  if v_bad > 0 then
    return jsonb_build_object('ok', false, 'error', 'question_not_in_round');
  end if;
  select count(*) into v_bad
  from jsonb_array_elements(coalesce(v_mod->'count', '[]'::jsonb)) x$o$,
     $n$     or not (   (coalesce(x->>'value', '') ~ '^[1-5]$' and not x ? 'na')
             or (x->'na' = 'true'::jsonb and nullif(x->>'value', '') is null))
     -- 0224: a statement that offers no «not relevant» takes none
     or (x ? 'na' and exists (select 1 from app.module_items i where i.id::text = (x->>'item') and not i.offers_not_relevant));
  if v_bad > 0 then
    return jsonb_build_object('ok', false, 'error', 'question_not_in_round');
  end if;
  select count(*) into v_bad
  from jsonb_array_elements(coalesce(v_mod->'count', '[]'::jsonb)) x$n$)
  ) as t(fn, old_text, new_text) loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.old_text in v_def) = 0 then
      raise exception '0224: % does not hold «%»; read its definition and write this by hand', r.fn, r.old_text;
    end if;
    if position(r.old_text in substr(v_def, position(r.old_text in v_def) + 1)) > 0 then
      raise exception '0224: % holds «%» more than once', r.fn, r.old_text;
    end if;
    execute replace(v_def, r.old_text, r.new_text);
  end loop;
end $$;
