-- 0090_count_answer_keys.sql — handel's count questions (D-138, X-074).
--
-- Tor, 2026-09-27: "bygg resten også, start på handel". The handoff's module (bransje-handel.md)
-- is asked one way, 8 factors of 3, like bygg and helse. Two things about its count questions
-- are new, and both are data on the question, not code:
--
--   * HA-T-2's third answer is «Jobber aldri alene», not «Vet ikke», and it «teller ikke med i
--     andelen» (§ 5). Count answers were positional (ja, nei, vet_ikke, then 0089's
--     ikke_aktuelt), so the option would have been stored as «vet ikke» and counted. A count
--     question may now name the answer each option is stored as (module_items.answer_keys);
--     HA-T-2's are ja, nei, ikke_aktuelt, which 0089 already keeps out of the share.
--   * HA-T-2 belongs with «Alene på vakt»: where the organisation switches that factor off
--     (module_factor_toggles), the question is not asked either (§ 6.5). A count question may
--     name the factor it is asked with (module_items.asked_with); it is asked only where one of
--     that factor's statements is.
--
-- Every other module's count questions have neither, and read exactly as before. The module
-- file's content hash is unchanged for them: the fields are optional and absent.

alter table app.module_items
  add column answer_keys text[],
  add column asked_with uuid references app.module_factors (id) on delete cascade,
  add constraint module_items_answer_keys check (
    answer_keys is null
    or (kind = 'count' and cardinality(answer_keys) = jsonb_array_length(options)
        and answer_keys in (array['ja', 'nei', 'vet_ikke'], array['ja', 'nei', 'ikke_aktuelt'],
                            array['ja', 'nei', 'vet_ikke', 'ikke_aktuelt']))),
  add constraint module_items_asked_with_count check (asked_with is null or kind = 'count');

create index module_items_asked_with on app.module_items (asked_with) where asked_with is not null;

-- the factor a count question is asked with is one of its own module's
create function app.module_item_asked_with_ok() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if new.asked_with is not null and not exists (
       select 1 from app.module_factors f where f.id = new.asked_with and f.module_id = new.module_id) then
    raise exception 'a count question is asked with a factor of its own module' using errcode = 'check_violation';
  end if;
  return new;
end $fn$;
create trigger module_items_asked_with_ok before insert or update of asked_with, module_id on app.module_items
  for each row execute function app.module_item_asked_with_ok();
revoke all on function app.module_item_asked_with_ok() from public, anon, authenticated;

-- the answer each option of a count question is stored as: its own, or by position
create function app.count_answer_keys(i app.module_items) returns text[]
  language sql immutable set search_path = ''
as $fn$
  select coalesce(i.answer_keys,
                  (array['ja', 'nei', 'vet_ikke', 'ikke_aktuelt'])[1:jsonb_array_length(i.options)])
$fn$;
revoke all on function app.count_answer_keys(app.module_items) from public, anon, authenticated;

-- a count question is asked in a round where the round asks its variant and, if it names a
-- factor, one of that factor's statements
create function app.count_item_asked(i app.module_items, rm app.round_modules) returns boolean
  language sql stable set search_path = ''
as $fn$
  select (i.variant_keys is null or rm.variant_key is null or rm.variant_key = any (i.variant_keys))
     and (i.asked_with is null or exists (
            select 1 from app.module_factor_items mi
            where mi.factor_id = i.asked_with and mi.item_id = any (rm.item_ids)))
$fn$;
revoke all on function app.count_item_asked(app.module_items, app.round_modules) from public, anon, authenticated;

-- ---------------------------------------------------------------- the seed
create or replace function app.module_seed(p jsonb, p_hash text) returns text
  language plpgsql set search_path = ''
as $fn$
declare
  v_id     uuid;
  v_status app.module_status;
  v_hash   text;
  v_prefix text;
  tr       jsonb := p->'translations'->'en';
  v_var    boolean := p ? 'variants';
  v_tf     jsonb;
  f        jsonb;
  it       jsonb;
  a        jsonb;
  v        jsonb;
  v_code   text;
  v_fid    uuid;
  fi       int := 0;
  ii       int;
  ai       int;
begin
  select m.id, m.status, m.content_hash into v_id, v_status, v_hash
  from app.question_modules m where m.key = p->>'module_id' and m.version = p->>'version';

  if found and v_status <> 'draft' then
    if v_hash <> p_hash then
      raise exception '%@% is % with different content; publish a new version', p->>'module_id', p->>'version', v_status;
    end if;
    return 'unchanged';
  end if;
  if found and v_hash = p_hash then
    return 'unchanged';
  end if;
  if found then
    delete from app.question_modules where id = v_id;
  end if;

  insert into app.question_modules (key, version, name, description, industry_key, estimated_minutes,
                                    scale, scoring, anonymity, relation_to_core, content_hash, i18n, wording,
                                    validation_status)
  values (p->>'module_id', p->>'version', p->>'name', p->>'description', p->>'module_id',
          (p->>'estimated_minutes')::int, p->'scale', p->'scoring', p->'anonymity',
          coalesce(p->'relation_to_core', '{}'), p_hash,
          case when tr is null then '{}'::jsonb else jsonb_build_object('en', jsonb_strip_nulls(jsonb_build_object(
            'name', tr->'name', 'description', tr->'description', 'scale_labels', tr->'scale_labels',
            'covered_by_core_factors', tr->'covered_by_core_factors'))) end,
          case when p ? 'wording' then jsonb_build_object('default', p->'wording'->'default',
                                                          'auto_from_nace', p->'wording'->'auto_from_nace') end,
          p->>'validation_status')
  returning id into v_id;

  insert into app.module_sources (module_id, key, title, url, sort)
  select v_id, s->>'key', s->>'title', s->>'url', o::int
  from jsonb_array_elements(p->'sources') with ordinality as x(s, o);

  for f in select value from jsonb_array_elements(p->'factors') loop
    fi := fi + 1;
    v_tf := tr->'factors'->(f->>'id');
    insert into app.module_factors (module_id, key, name, summary, rationale, rationale_sources, legal_basis, sort, i18n,
                                    variant_key, code, optional, extended_only, evidence_strength)
    values (v_id, f->>'id', f->>'name', f->>'summary', f->>'rationale',
            array(select jsonb_array_elements_text(f->'rationale_sources')),
            array(select jsonb_array_elements_text(f->'legal_basis')), fi,
            (case when v_tf is null then '{}'::jsonb else jsonb_build_object('en', jsonb_build_object(
              'name', v_tf->'name', 'summary', v_tf->'summary', 'rationale', v_tf->'rationale', 'legal_basis', v_tf->'legal_basis')) end)
            -- a worded module's factor name, where it names the children (0083)
            || case when f ? 'name_variants' then jsonb_build_object(
                 'nb.barnehage', jsonb_build_object('name', f->'name_variants'->>'barnehage'),
                 'nb.skole', jsonb_build_object('name', f->'name_variants'->>'skole')) else '{}'::jsonb end,
            -- a module in variants: `factors` is the extended set
            case when v_var then 'utvidet' end, f->>'code',
            coalesce((f->>'optional')::boolean, false), coalesce((f->>'extended_only')::boolean, false),
            f->>'evidence_strength')
    returning id into v_fid;

    ii := 0;
    for it in select value from jsonb_array_elements(f->'items') loop
      ii := ii + 1;
      insert into app.module_items (module_id, factor_id, code, kind, text, reverse, pulse_eligible, report_scope, sort,
                                    help, core_indicator, construct, source, improvement_note)
      values (v_id, v_fid, it->>'id', 'likert5',
              jsonb_strip_nulls(jsonb_build_object('nb', it->>'text', 'en', v_tf->'items'->>(it->>'id'),
                                                   'nb.barnehage', it->'text_variants'->>'barnehage',
                                                   'nb.skole', it->'text_variants'->>'skole')),
              (it->>'reverse')::boolean, (it->>'pulse_eligible')::boolean, 'group', fi * 10 + ii,
              case when it ? 'help' then jsonb_build_object('nb', it->>'help') end,
              coalesce((it->>'core_indicator')::boolean, false), it->>'construct', it->>'source', it->>'improvement_note');
    end loop;

    insert into app.module_factor_items (module_id, factor_id, item_id, sort)
    select v_id, v_fid, i.id, i.sort from app.module_items i where i.factor_id = v_fid;

    ai := 0;
    for a in select value from jsonb_array_elements(f->'action_suggestions') loop
      ai := ai + 1;
      insert into app.module_action_suggestions (module_id, factor_id, type, title, description, remeasure_item_id, sort, i18n)
      select v_id, v_fid, a->>'type', a->>'title', a->>'description', i.id, ai,
             case when v_tf->'action_suggestions'->(ai - 1) is null then '{}'::jsonb
                  else jsonb_build_object('en', v_tf->'action_suggestions'->(ai - 1)) end
      from app.module_items i where i.module_id = v_id and i.code = a->>'remeasure_item';
      if not found then
        raise exception 'unknown re-measure item %', a->>'remeasure_item';
      end if;
    end loop;
  end loop;

  if v_var then
    -- the simplified factors: their own rows, scored from core statements of the extended ones
    for f in select value from jsonb_array_elements(p->'variants'->0->'factors') loop
      fi := fi + 1;
      insert into app.module_factors (module_id, key, name, summary, rationale, rationale_sources, legal_basis, sort,
                                      variant_key, code, built_from)
      values (v_id, f->>'id', f->>'name', f->>'summary', '', '{}', '{}', 100 + fi, 'forenklet', f->>'code',
              array(select jsonb_array_elements_text(f->'built_from')))
      returning id into v_fid;

      ii := 0;
      for v_code in select jsonb_array_elements_text(f->'items') loop
        ii := ii + 1;
        insert into app.module_factor_items (module_id, factor_id, item_id, sort)
        select v_id, v_fid, i.id, ii from app.module_items i
        where i.module_id = v_id and i.code = v_code and i.kind = 'likert5' and i.core_indicator;
        if not found then
          raise exception 'simplified factor % names % which is not a core statement', f->>'id', v_code;
        end if;
      end loop;

      ai := 0;
      for a in select value from jsonb_array_elements(f->'action_suggestions') loop
        ai := ai + 1;
        insert into app.module_action_suggestions (module_id, factor_id, type, title, description, remeasure_item_id, sort)
        select v_id, v_fid, a->>'type', a->>'title', a->>'description', i.id, ai
        from app.module_items i where i.module_id = v_id and i.code = a->>'remeasure_item';
        if not found then
          raise exception 'unknown re-measure item %', a->>'remeasure_item';
        end if;
      end loop;
    end loop;

    for v in select value from jsonb_array_elements(p->'variants') loop
      insert into app.module_variants (module_id, key, code, version, name, estimated_minutes, factor_toggles,
                                       min_factors, recommended, default_off, locked_items, count_items, segments, sort)
      values (v_id, v->>'key', v->>'code', v->>'version', v->>'name', (v->>'estimated_minutes')::int,
              coalesce((v->>'factor_toggles')::boolean, false), (v->>'min_factors')::int,
              case when v ? 'recommended_factors' then array(select jsonb_array_elements_text(v->'recommended_factors')::int) end,
              coalesce(array(select jsonb_array_elements_text(v->'default_off')), '{}'),
              coalesce(array(select jsonb_array_elements_text(v->'locked_items')), '{}'),
              coalesce(array(select jsonb_array_elements_text(v->'count_items')), '{}'),
              coalesce(array(select jsonb_array_elements_text(v->'segments')), '{}'),
              case v->>'key' when 'forenklet' then 1 else 2 end);
    end loop;
  end if;

  v_prefix := left(p->'factors'->0->'items'->0->>'id', 2);

  insert into app.module_items (module_id, code, kind, text, options, report_scope, sort, variant_keys,
                                answer_keys, asked_with)
  select v_id, c->>'id', 'count',
         jsonb_strip_nulls(jsonb_build_object('nb', c->>'text', 'en', tr->'count_items'->(c->>'id')->>'text',
                                              'nb.barnehage', c->'text_variants'->>'barnehage',
                                              'nb.skole', c->'text_variants'->>'skole')),
         (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('nb', o, 'en', tr->'count_items'->(c->>'id')->'options'->>(n::int - 1))) order by n)
          from jsonb_array_elements_text(c->'options') with ordinality as y(o, n)),
         'organisation_only', 1000 + o::int,
         case when c ? 'variants' then array(select jsonb_array_elements_text(c->'variants')) end,
         -- 0090: the answer each option is stored as, and the factor it is asked with
         case when c ? 'answer_keys' then array(select jsonb_array_elements_text(c->'answer_keys')) end,
         (select mf.id from app.module_factors mf where mf.module_id = v_id and mf.key = c->>'asked_with')
  from jsonb_array_elements(p->'count_items') with ordinality as x(c, o);

  if exists (select 1 from jsonb_array_elements(p->'count_items') c
             where c ? 'asked_with' and not exists (
               select 1 from app.module_factors mf where mf.module_id = v_id and mf.key = c->>'asked_with')) then
    raise exception 'a count question is asked with an unknown factor';
  end if;

  insert into app.module_items (module_id, code, kind, text, options, report_scope, sort)
  select v_id, v_prefix || '-S-' || (s->>'id'), 'segment',
         jsonb_strip_nulls(jsonb_build_object('nb', s->>'text', 'en', tr->'segments'->(s->>'id')->>'text')),
         (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('nb', o, 'en', tr->'segments'->(s->>'id')->'options'->>(n::int - 1))) order by n)
          from jsonb_array_elements_text(s->'options') with ordinality as y(o, n)),
         'segment_filter', 2000 + o::int
  from jsonb_array_elements(p->'segments') with ordinality as x(s, o);

  return 'seeded';
end $fn$;

-- ---------------------------------------------------------------- the respondent
create or replace function public.respond_form(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_inv    app.invitations%rowtype;
  v_org    app.organizations%rowtype;
  v_round  app.rounds%rowtype;
  v_qs     jsonb;
  v_extra  jsonb;
  v_module jsonb;
begin
  if p_token is null or length(p_token) < 16 then
    return jsonb_build_object('error', 'invalid_token');
  end if;

  select * into v_inv from app.invitations i
  where i.token_hash = extensions.digest(p_token, 'sha256');

  if not found then
    return jsonb_build_object('error', 'invalid_token');
  end if;
  if v_inv.responded_at is not null then
    return jsonb_build_object('error', 'already_responded');
  end if;
  if v_inv.expires_at <= now() then
    return jsonb_build_object('error', 'expired');
  end if;

  select * into v_round from app.rounds r where r.id = v_inv.round_id;
  if v_round.status <> 'apen' then
    return jsonb_build_object('error', 'round_closed');
  end if;

  select * into v_org from app.organizations o where o.id = v_inv.org_id;

  -- shuffled per token, stable on reload
  select jsonb_agg(jsonb_build_object('factor', q.factor_key, 'ordinal', q.ordinal)
                   order by q.seed)
  into v_qs
  from (
    select rf.factor_key, s.ordinal,
           extensions.digest(p_token || rf.factor_key || s.ordinal::text, 'sha256') as seed
    from app.round_factors rf
    join app.statements s on s.factor_key = rf.factor_key
    where rf.round_id = v_round.id
  ) q;

  select jsonb_agg(jsonb_build_object(
           'key', x.extra_key, 'kind', q.kind,
           'options', (select count(*) from app.extra_options o where o.extra_key = x.extra_key))
         order by q.sort_order)
  into v_extra
  from app.round_extra_questions x
  join app.extra_questions q on q.key = x.extra_key
  where x.round_id = v_round.id;

  -- one module per round in practice; an array so a second would need no new shape
  select jsonb_agg(jsonb_build_object(
           'name', m.name,
           -- 0089: a module in variants takes about eight seconds a statement, as asked
           'minutes', case when rm.variant_key is null then m.estimated_minutes
                           else greatest(1, round(cardinality(rm.item_ids) * 8 / 60.0))::int end,
           'statements', (
             select coalesce(jsonb_agg(jsonb_build_object('item', i.id, 'factor', coalesce(f.i18n->('nb.' || rm.wording)->>'name', f.name),
                                                  'text', coalesce(i.text->>('nb.' || rm.wording), i.text->>'nb'),
                                                  'factor_en', f.i18n->'en'->>'name', 'text_en', i.text->>'en',
                                                  'help', i.help->>'nb', 'help_en', i.help->>'en')
                                       order by extensions.digest(p_token || i.id::text, 'sha256')), '[]'::jsonb)
             from app.module_items i
             -- 0089: the factor the respondent reads it under: the simplified one in the simplified
             -- set, its own in the extended set; in a puls, simplified for a core statement
             join lateral (
               select ff.name, ff.i18n from app.module_factor_items mi join app.module_factors ff on ff.id = mi.factor_id
               where mi.item_id = i.id
                 and (ff.variant_key is null
                      or ff.variant_key = coalesce(rm.variant_key, case when i.core_indicator then 'forenklet' else 'utvidet' end))
               order by ff.sort limit 1
             ) f on true
             where i.id = any (rm.item_ids)),
           'count', case when rm.include_count_items then (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'item', i.id, 'text', coalesce(i.text->>('nb.' || rm.wording), i.text->>'nb'),
                      'options', (select jsonb_agg(o->>'nb' order by n) from jsonb_array_elements(i.options) with ordinality as y(o, n)),
                      'text_en', i.text->>'en',
                      'options_en', (select jsonb_agg(o->>'en' order by n) from jsonb_array_elements(i.options) with ordinality as y(o, n)),
                      -- 0090: the answer each option is sent as
                      'answers', to_jsonb(app.count_answer_keys(i)))
                    order by i.sort), '[]'::jsonb)
             from app.module_items i where i.module_id = m.id and i.kind = 'count'
               -- 0089: the count questions of the round's variant; 0090: and of its factors
               and app.count_item_asked(i, rm)) else '[]'::jsonb end,
           'segments', case when rm.include_segments then (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'item', i.id, 'text', i.text->>'nb',
                      'options', (select jsonb_agg(o->>'nb' order by n) from jsonb_array_elements(i.options) with ordinality as y(o, n)),
                      'text_en', i.text->>'en',
                      'options_en', (select jsonb_agg(o->>'en' order by n) from jsonb_array_elements(i.options) with ordinality as y(o, n)))
                    order by i.sort), '[]'::jsonb)
             from app.module_items i where i.module_id = m.id and i.kind = 'segment') else '[]'::jsonb end)
         order by m.key)
  into v_module
  from app.round_modules rm join app.question_modules m on m.id = rm.module_id
  where rm.round_id = v_round.id;

  return jsonb_build_object(
    'org', v_org.name,
    'threshold', app.k_threshold(v_inv.org_id),
    'questions', coalesce(v_qs, '[]'::jsonb),
    'extra', coalesce(v_extra, '[]'::jsonb),
    'modules', coalesce(v_module, '[]'::jsonb)
  );
end $function$;

create or replace function public.get_count_item_totals(p_round_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_k   int;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round_id and r.status = 'lukket';
  -- organisation-level results: the house's readers only, as results_summary's whole scope
  if v_org is null or not exists (
       select 1 from app.memberships m
       where m.user_id = auth.uid() and m.active and m.org_id = v_org
         and m.role in ('daglig_leder', 'verneombud')) then
    return jsonb_build_object('error', 'not_available');
  end if;
  v_k := app.k_threshold(v_org);

  return jsonb_build_object('threshold', v_k, 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
             'code', it.code, 'text', coalesce(it.text->>('nb.' || rm.wording), it.text->>'nb'),
             'options', (select jsonb_agg(o->>'nb' order by n) from jsonb_array_elements(it.options) with ordinality as y(o, n)),
             'text_en', it.text->>'en',
             'options_en', (select jsonb_agg(o->>'en' order by n) from jsonb_array_elements(it.options) with ordinality as y(o, n)),
             'answers', to_jsonb(app.count_answer_keys(it)),
             'n_total', case when t.n_total >= v_k then t.n_total end,
             'n_ja', case when t.n_total >= v_k then t.n_ja end,
             'n_nei', case when t.n_total >= v_k then t.n_nei end,
             'n_vet_ikke', case when t.n_total >= v_k then t.n_vet_ikke end,
             'suppressed', t.n_total < v_k)
           order by it.sort)
    from app.round_modules rm
    join app.module_items it on it.module_id = rm.module_id and it.kind = 'count'
    join lateral (
      -- 0089: an answer that says the question does not apply («Jobber ikke fast hjemmefra»,
      -- 0090: «Jobber aldri alene») is kept out of the share
      select count(*) filter (where c.answer <> 'ikke_aktuelt')::int as n_total,
             count(*) filter (where c.answer = 'ja')::int as n_ja,
             count(*) filter (where c.answer = 'nei')::int as n_nei,
             count(*) filter (where c.answer = 'vet_ikke')::int as n_vet_ikke
      from app.org_count_answers c where c.round_id = p_round_id and c.item_id = it.id
    ) t on true
    where rm.round_id = p_round_id and rm.include_count_items
      and app.count_item_asked(it, rm)), '[]'::jsonb));
end $function$;

create or replace function public.submit_response(p_token text, p_answers jsonb, p_extra jsonb, p_module jsonb default '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_inv     app.invitations%rowtype;
  v_group   uuid;
  v_resp    uuid;
  v_written int;
  v_bad     int;
  v_hour    timestamptz := date_trunc('hour', now());
  v_keys    jsonb := '[]'::jsonb;
  v_key     text;
  v_a       jsonb;
  v_mod     jsonb := coalesce(p_module, '{}'::jsonb);
begin
  if p_token is null or length(p_token) < 16 then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  -- looked up BY hash: the plaintext token is never stored and never compared
  select * into v_inv
  from app.invitations i
  where i.token_hash = extensions.digest(p_token, 'sha256');

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;
  if v_inv.responded_at is not null then
    -- replay: refused, and refused without revealing anything about the first answer
    return jsonb_build_object('ok', false, 'error', 'already_responded');
  end if;
  if v_inv.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  perform 1 from app.rounds r where r.id = v_inv.round_id and r.status = 'apen';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'round_closed');
  end if;

  select count(*) into v_bad
  from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
  where not exists (
    select 1 from app.round_factors rf
    where rf.round_id = v_inv.round_id and rf.factor_key = (a->>'factor')
  );
  if v_bad > 0 then
    return jsonb_build_object('ok', false, 'error', 'factor_not_in_round');
  end if;
  -- 0087: «ikke relevant» stands in place of a value, never beside one
  select count(*) into v_bad
  from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
  where a ? 'na' and (a->'na' <> 'true'::jsonb or nullif(a->>'value', '') is not null);
  if v_bad > 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_answer');
  end if;

  select count(*) into v_bad
  from jsonb_array_elements(coalesce(p_extra, '[]'::jsonb)) x
  where not exists (
    select 1 from app.round_extra_questions rx
    where rx.round_id = v_inv.round_id and rx.extra_key = (x->>'key')
  );
  if v_bad > 0 then
    return jsonb_build_object('ok', false, 'error', 'question_not_in_round');
  end if;

  -- 0069: every module answer must be one the round asks, in the shape its kind takes;
  -- 0087: a statement's answer is a value 1–5 or `na: true`
  if jsonb_typeof(v_mod) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'question_not_in_round');
  end if;
  select count(*) into v_bad
  from jsonb_array_elements(coalesce(v_mod->'answers', '[]'::jsonb)) x
  where not exists (select 1 from app.round_modules rm
                    where rm.round_id = v_inv.round_id and (x->>'item') = any (rm.item_ids::text[]))
     or not (   (coalesce(x->>'value', '') ~ '^[1-5]$' and not x ? 'na')
             or (x->'na' = 'true'::jsonb and nullif(x->>'value', '') is null));
  if v_bad > 0 then
    return jsonb_build_object('ok', false, 'error', 'question_not_in_round');
  end if;
  select count(*) into v_bad
  from jsonb_array_elements(coalesce(v_mod->'count', '[]'::jsonb)) x
  where not exists (select 1 from app.round_modules rm join app.module_items i on i.module_id = rm.module_id
                    where rm.round_id = v_inv.round_id and rm.include_count_items
                      and i.kind = 'count' and i.id::text = (x->>'item')
                      -- 0089: a question of the round's variant; 0090: and of its factors, answered
                      -- with one of the answers its options are stored as
                      and app.count_item_asked(i, rm)
                      and coalesce(x->>'answer', '') = any (app.count_answer_keys(i)));
  if v_bad > 0 then
    return jsonb_build_object('ok', false, 'error', 'question_not_in_round');
  end if;
  select count(*) into v_bad
  from jsonb_array_elements(coalesce(v_mod->'segments', '[]'::jsonb)) x
  where not exists (select 1 from app.round_modules rm join app.module_items i on i.module_id = rm.module_id
                    where rm.round_id = v_inv.round_id and rm.include_segments
                      and i.kind = 'segment' and i.id::text = (x->>'item')
                      and coalesce(x->>'option', '') ~ '^[1-9]$'
                      and (x->>'option')::int <= jsonb_array_length(i.options));
  if v_bad > 0 then
    return jsonb_build_object('ok', false, 'error', 'question_not_in_round');
  end if;

  -- the group is the one thing carried across, because per-group results are the
  -- product. k-anonymity is what makes that safe, and it is applied on read.
  select e.group_id into v_group from app.employees e where e.id = v_inv.employee_id;

  update app.invitations set responded_at = now() where id = v_inv.id;

  insert into app.responses (org_id, round_id, group_id, submitted_hour)
  values (v_inv.org_id, v_inv.round_id, v_group, v_hour)
  returning id into v_resp;

  insert into app.answers (response_id, factor_key, ordinal, value)
  select v_resp, (a->>'factor')::text, (a->>'ordinal')::int, (a->>'value')::int
  from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
  where nullif(a->>'value', '') is not null;
  get diagnostics v_written = row_count;

  -- 0087: «ikke relevant», on its own table, where no index reads it
  insert into app.not_relevant_answers (response_id, factor_key, ordinal)
  select distinct v_resp, (a->>'factor')::text, (a->>'ordinal')::int
  from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
  where a->'na' = 'true'::jsonb;

  /*
   * A comment is kept whether or not the question it hangs on was scored, and each one
   * opens a thread whose key goes back to the respondent and nowhere else (0018, 0042).
   * The key is 32 random bytes, returned once and stored only as a digest.
   */
  for v_a in select x from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) x loop
    if nullif(btrim(coalesce(v_a->>'comment', '')), '') is not null then
      insert into app.response_comments (response_id, factor_key, ordinal, body)
      values (v_resp, (v_a->>'factor')::text, (v_a->>'ordinal')::int, btrim(v_a->>'comment'));

      v_key := encode(extensions.gen_random_bytes(32), 'hex');
      insert into app.comment_threads (org_id, response_id, factor_key, ordinal, key_hash, opened_hour)
      values (v_inv.org_id, v_resp, (v_a->>'factor')::text, (v_a->>'ordinal')::int,
              extensions.digest(v_key, 'sha256'), v_hour);
      v_keys := v_keys || to_jsonb(v_key);
    end if;
  end loop;

  -- a skipped question sends nothing, so an absent key is a skip and an empty string
  -- is not an answer either
  insert into app.extra_answers (response_id, extra_key, option_ordinal, free_text)
  select v_resp, (x->>'key')::text,
         nullif(x->>'option', '')::int,
         nullif(btrim(coalesce(x->>'text', '')), '')
  from jsonb_array_elements(coalesce(p_extra, '[]'::jsonb)) x
  where nullif(x->>'option', '') is not null
     or nullif(btrim(coalesce(x->>'text', '')), '') is not null;

  -- 0069: the module's statements and background questions, on the same unlinked row
  insert into app.module_answers (response_id, item_id, value)
  select distinct on ((x->>'item')::uuid) v_resp, (x->>'item')::uuid, (x->>'value')::int
  from jsonb_array_elements(coalesce(v_mod->'answers', '[]'::jsonb)) x
  where nullif(x->>'value', '') is not null;
  get diagnostics v_bad = row_count;
  v_written := v_written + v_bad;

  insert into app.module_not_relevant_answers (response_id, item_id)
  select distinct v_resp, (x->>'item')::uuid
  from jsonb_array_elements(coalesce(v_mod->'answers', '[]'::jsonb)) x
  where x->'na' = 'true'::jsonb;

  insert into app.module_segment_answers (response_id, item_id, option_ordinal)
  select distinct on ((x->>'item')::uuid) v_resp, (x->>'item')::uuid, (x->>'option')::int
  from jsonb_array_elements(coalesce(v_mod->'segments', '[]'::jsonb)) x;

  -- 0069: count questions, with nothing that leads back to this response or its group
  insert into app.org_count_answers (round_id, item_id, answer)
  select distinct on ((x->>'item')::uuid) v_inv.round_id, (x->>'item')::uuid, x->>'answer'
  from jsonb_array_elements(coalesce(v_mod->'count', '[]'::jsonb)) x;

  -- v_resp is deliberately NOT returned: the caller must not be able to correlate
  -- their submission with a row.
  return jsonb_build_object('ok', true, 'answers', v_written, 'threads', v_keys);
end $function$;

revoke all on function public.submit_response(text, jsonb, jsonb, jsonb) from public;
grant execute on function public.submit_response(text, jsonb, jsonb, jsonb) to anon, authenticated;
