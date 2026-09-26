-- 0072_module_translations.sql — the module in English (open decision 4, D-119).
--
-- A module file may carry `translations.en` (lib/modules/schema.ts checks it is complete). It is
-- part of the file, so the content hash covers it: a published version's English is as fixed
-- as its Norwegian. The registry keeps it beside the Norwegian:
--
--   module_items.text / options   locale maps already ({"nb": …}); they gain "en"
--   question_modules.i18n         {"en": {name, description, scale_labels, covered_by_core_factors}}
--   module_factors.i18n           {"en": {name, summary, rationale, legal_basis}}
--   module_action_suggestions.i18n {"en": {title, description}}
--
-- The readers return the English beside the Norwegian under `_en` keys rather than choosing:
-- the app knows the reader's language (next-intl), the database does not, and additive keys
-- leave every existing caller as it was. The immutability trigger now covers i18n too.

alter table app.question_modules          add column i18n jsonb not null default '{}';
alter table app.module_factors            add column i18n jsonb not null default '{}';
alter table app.module_action_suggestions add column i18n jsonb not null default '{}';

create or replace function app.module_frozen() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'published module is immutable; create a new version' using errcode = 'restrict_violation';
    end if;
    return old;
  end if;
  if old.status = 'draft' then
    return new;
  end if;
  if (new.key, new.version, new.name, new.description, new.industry_key, new.estimated_minutes,
      new.scale, new.scoring, new.anonymity, new.relation_to_core, new.content_hash, new.published_at, new.created_at, new.i18n)
     is distinct from
     (old.key, old.version, old.name, old.description, old.industry_key, old.estimated_minutes,
      old.scale, old.scoring, old.anonymity, old.relation_to_core, old.content_hash, old.published_at, old.created_at, old.i18n)
     or (old.status = 'retired' and new.status is distinct from old.status)
     or (old.status = 'published' and new.status = 'draft') then
    raise exception 'published module is immutable; create a new version' using errcode = 'restrict_violation';
  end if;
  return new;
end $fn$;

-- ---------------------------------------------------------------- seeding, with English
create or replace function app.module_seed(p jsonb, p_hash text) returns text
  language plpgsql set search_path = ''
as $fn$
declare
  v_id     uuid;
  v_status app.module_status;
  v_hash   text;
  v_prefix text;
  tr       jsonb := p->'translations'->'en';
  v_tf     jsonb;
  f        jsonb;
  it       jsonb;
  a        jsonb;
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
                                    scale, scoring, anonymity, relation_to_core, content_hash, i18n)
  values (p->>'module_id', p->>'version', p->>'name', p->>'description', p->>'module_id',
          (p->>'estimated_minutes')::int, p->'scale', p->'scoring', p->'anonymity',
          coalesce(p->'relation_to_core', '{}'), p_hash,
          case when tr is null then '{}'::jsonb else jsonb_build_object('en', jsonb_strip_nulls(jsonb_build_object(
            'name', tr->'name', 'description', tr->'description', 'scale_labels', tr->'scale_labels',
            'covered_by_core_factors', tr->'covered_by_core_factors'))) end)
  returning id into v_id;

  insert into app.module_sources (module_id, key, title, url, sort)
  select v_id, s->>'key', s->>'title', s->>'url', o::int
  from jsonb_array_elements(p->'sources') with ordinality as x(s, o);

  for f in select value from jsonb_array_elements(p->'factors') loop
    fi := fi + 1;
    v_tf := tr->'factors'->(f->>'id');
    insert into app.module_factors (module_id, key, name, summary, rationale, rationale_sources, legal_basis, sort, i18n)
    values (v_id, f->>'id', f->>'name', f->>'summary', f->>'rationale',
            array(select jsonb_array_elements_text(f->'rationale_sources')),
            array(select jsonb_array_elements_text(f->'legal_basis')), fi,
            case when v_tf is null then '{}'::jsonb else jsonb_build_object('en', jsonb_build_object(
              'name', v_tf->'name', 'summary', v_tf->'summary', 'rationale', v_tf->'rationale', 'legal_basis', v_tf->'legal_basis')) end)
    returning id into v_fid;

    ii := 0;
    for it in select value from jsonb_array_elements(f->'items') loop
      ii := ii + 1;
      insert into app.module_items (module_id, factor_id, code, kind, text, reverse, pulse_eligible, report_scope, sort)
      values (v_id, v_fid, it->>'id', 'likert5',
              jsonb_strip_nulls(jsonb_build_object('nb', it->>'text', 'en', v_tf->'items'->>(it->>'id'))),
              (it->>'reverse')::boolean, (it->>'pulse_eligible')::boolean, 'group', fi * 10 + ii);
    end loop;

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

  v_prefix := left(p->'factors'->0->'items'->0->>'id', 2);

  insert into app.module_items (module_id, code, kind, text, options, report_scope, sort)
  select v_id, c->>'id', 'count',
         jsonb_strip_nulls(jsonb_build_object('nb', c->>'text', 'en', tr->'count_items'->(c->>'id')->>'text')),
         (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('nb', o, 'en', tr->'count_items'->(c->>'id')->'options'->>(n::int - 1))) order by n)
          from jsonb_array_elements_text(c->'options') with ordinality as y(o, n)),
         'organisation_only', 1000 + o::int
  from jsonb_array_elements(p->'count_items') with ordinality as x(c, o);

  insert into app.module_items (module_id, code, kind, text, options, report_scope, sort)
  select v_id, v_prefix || '-S-' || (s->>'id'), 'segment',
         jsonb_strip_nulls(jsonb_build_object('nb', s->>'text', 'en', tr->'segments'->(s->>'id')->>'text')),
         (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('nb', o, 'en', tr->'segments'->(s->>'id')->'options'->>(n::int - 1))) order by n)
          from jsonb_array_elements_text(s->'options') with ordinality as y(o, n)),
         'segment_filter', 2000 + o::int
  from jsonb_array_elements(p->'segments') with ordinality as x(s, o);

  return 'seeded';
end $fn$;

-- ---------------------------------------------------------------- the readers, with English beside
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
           'minutes', m.estimated_minutes,
           'statements', (
             select coalesce(jsonb_agg(jsonb_build_object('item', i.id, 'factor', f.name, 'text', i.text->>'nb',
                                                  'factor_en', f.i18n->'en'->>'name', 'text_en', i.text->>'en')
                                       order by extensions.digest(p_token || i.id::text, 'sha256')), '[]'::jsonb)
             from app.module_items i join app.module_factors f on f.id = i.factor_id
             where i.id = any (rm.item_ids)),
           'count', case when rm.include_count_items then (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'item', i.id, 'text', i.text->>'nb',
                      'options', (select jsonb_agg(o->>'nb' order by n) from jsonb_array_elements(i.options) with ordinality as y(o, n)),
                      'text_en', i.text->>'en',
                      'options_en', (select jsonb_agg(o->>'en' order by n) from jsonb_array_elements(i.options) with ordinality as y(o, n)))
                    order by i.sort), '[]'::jsonb)
             from app.module_items i where i.module_id = m.id and i.kind = 'count') else '[]'::jsonb end,
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
             'code', it.code, 'text', it.text->>'nb',
             'options', (select jsonb_agg(o->>'nb' order by n) from jsonb_array_elements(it.options) with ordinality as y(o, n)),
             'text_en', it.text->>'en',
             'options_en', (select jsonb_agg(o->>'en' order by n) from jsonb_array_elements(it.options) with ordinality as y(o, n)),
             'n_total', case when t.n_total >= v_k then t.n_total end,
             'n_ja', case when t.n_total >= v_k then t.n_ja end,
             'n_nei', case when t.n_total >= v_k then t.n_nei end,
             'n_vet_ikke', case when t.n_total >= v_k then t.n_vet_ikke end,
             'suppressed', t.n_total < v_k)
           order by it.sort)
    from app.round_modules rm
    join app.module_items it on it.module_id = rm.module_id and it.kind = 'count'
    join lateral (
      select count(*)::int as n_total,
             count(*) filter (where c.answer = 'ja')::int as n_ja,
             count(*) filter (where c.answer = 'nei')::int as n_nei,
             count(*) filter (where c.answer = 'vet_ikke')::int as n_vet_ikke
      from app.org_count_answers c where c.round_id = p_round_id and c.item_id = it.id
    ) t on true
    where rm.round_id = p_round_id and rm.include_count_items), '[]'::jsonb));
end $function$;

create or replace function public.module_results(p_round uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org     uuid;
  v_k       int;
  v_whole   boolean;
  v_visible uuid[];
  v_out     jsonb;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round and r.status = 'lukket';
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'not_available');
  end if;
  v_k := app.k_threshold(v_org);
  select exists (select 1 from app.memberships m
                 where m.user_id = auth.uid() and m.active and m.org_id = v_org
                   and m.role in ('daglig_leder', 'verneombud')) into v_whole;
  select coalesce(array_agg(vg.group_id), '{}') into v_visible from app.visible_groups(v_org) vg;

  with cells as materialized (select * from app.module_cell_release(p_round)),
  asked as (
    select rm.module_id, it.id, it.factor_id, it.code, it.text->>'nb' as text, it.text->>'en' as text_en, it.sort
    from app.round_modules rm join app.module_items it on it.id = any (rm.item_ids)
    where rm.round_id = p_round
  ),
  -- the house: an item, and a factor, only where every asked statement has k answers
  item_n as (
    select a.id, count(distinct ma.response_id)::int as n, round(avg(app.to_index(ma.value))) as idx
    from asked a
    left join app.module_answers ma on ma.item_id = a.id
     and ma.response_id in (select r.id from app.responses r where r.round_id = p_round)
    group by a.id
  ),
  factor_org as (
    select a.factor_id, min(i.n) as n,
           case when min(i.n) >= v_k then (
             select round(avg(app.to_index(ma.value)))
             from app.module_answers ma join app.responses r on r.id = ma.response_id
             where r.round_id = p_round and ma.item_id in (select a2.id from asked a2 where a2.factor_id = a.factor_id))
           end as idx
    from asked a join item_n i on i.id = a.id
    group by a.factor_id
  ),
  groups as (
    select rel.group_id, rel.n, rel.status, coalesce(g.name, 'Uten gruppe') as name
    from app.group_release(p_round) rel left join app.groups g on g.id = rel.group_id
    where v_whole or rel.group_id = any (v_visible)
  )
  select jsonb_agg(jsonb_build_object(
           'key', m.key, 'version', m.version, 'name', m.name, 'name_en', m.i18n->'en'->>'name',
           'factors', (
             select jsonb_agg(jsonb_build_object(
                      'key', f.key, 'name', f.name, 'summary', f.summary, 'rationale', f.rationale, 'en', f.i18n->'en',
                      'rationale_sources', to_jsonb(f.rationale_sources), 'legal_basis', to_jsonb(f.legal_basis),
                      'index', case when v_whole then fo.idx end,
                      'band', case when v_whole and fo.idx is not null then app.risk_band(fo.idx) end,
                      'items', (
                        select jsonb_agg(jsonb_build_object('code', a.code, 'text', a.text, 'text_en', a.text_en,
                                 'index', case when v_whole and i.n >= v_k then i.idx end) order by a.sort)
                        from asked a join item_n i on i.id = a.id where a.factor_id = f.id))
                    order by f.sort)
             from app.module_factors f join factor_org fo on fo.factor_id = f.id
             where f.module_id = m.id),
           'groups', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'group_name', gr.name, 'n', gr.n, 'status', gr.status,
                      'factors', case when gr.status = 'ok' then (
                        select jsonb_agg(jsonb_build_object('key', f.key, 'index', gi.idx, 'band', app.risk_band(gi.idx)) order by f.sort)
                        from app.module_factors f
                        join lateral (
                          select round(avg(app.to_index(ma.value))) as idx
                          from app.module_answers ma join app.responses r on r.id = ma.response_id
                          where r.round_id = p_round and r.group_id is not distinct from gr.group_id
                            and ma.item_id in (select a.id from asked a where a.factor_id = f.id)
                        ) gi on true
                        where f.module_id = m.id
                          and exists (select 1 from cells c where c.item_id is null and c.factor_id = f.id
                                        and c.group_id is not distinct from gr.group_id and c.status = 'ok')) end)
                    order by gr.name), '[]'::jsonb)
             from groups gr))
         order by m.key)
  into v_out
  from app.question_modules m
  where m.id in (select rm.module_id from app.round_modules rm where rm.round_id = p_round);

  return jsonb_build_object('threshold', v_k, 'scope', case when v_whole then 'org' else 'groups' end,
                            'modules', coalesce(v_out, '[]'::jsonb));
end $function$;
