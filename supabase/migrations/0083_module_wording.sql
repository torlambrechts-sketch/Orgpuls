-- 0083_module_wording.sql — a module's statements in the organisation's words (D-131, X-066).
--
-- Tor, 2026-09-27: "Bygg skole og barnehage". The barnehage og skole module says «barna» in a
-- kindergarten, «elevene» in a school, and «barna eller elevene» where an organisation has both
-- (docs: bransje-barnehage-og-skole.md § 5.1). The three are one statement: one code, scored
-- alike, so results compare across them. The module file carries all three filled in; this
-- keeps them and lets each organisation's rounds ask the one that fits.
--
--   * module_items.text, the locale map ({"nb": …, "en": …}), gains "nb.barnehage" and
--     "nb.skole" for a worded module. "nb" stays the «begge» wording, so every reader that
--     reads "nb" still reads a correct statement.
--   * question_modules.wording: {default, auto_from_nace} from the file, or null for a module
--     without wordings. Immutable once published, as the rest of the module (module_frozen).
--   * org_modules.wording: the organisation's choice, or null for «as suggested»: the file's
--     NACE rule applied to the organisation's registered industry (85.1 a kindergarten, 85.2
--     and 85.3 a school), else the module's default. app.org_wording decides.
--   * round_modules.wording: the wording a round asks, filled from the organisation's when the
--     module is put on the round (any path: Spørsmålssett, a new grunnlinje, a puls, Måleoppsett)
--     and fixed with the rest of the row once the round opens (round_module_ok). Null for a
--     module without wordings, whatever is passed.
--   * public.set_org_module_wording is the one write path for the choice; it is applied to the
--     organisation's planned rounds and to nothing that has opened.
--   * respond_form, module_results and get_count_item_totals read the round's wording, for a
--     factor's name as for its statements (a name that names the children has its variants in
--     module_factors.i18n under the same keys).
--   * A round's wording follows the organisation's until the round opens: a new choice, and a
--     change of the registered industry that the suggestion comes from, are applied to the
--     planned rounds (app.reapply_org_wordings). A client cannot write the column itself: only
--     the fill trigger and the write path set it.
--
-- Nothing here touches an answer table or a response: a wording is the organisation's, and a
-- round's is the same for every respondent in it.

alter table app.question_modules add column wording jsonb
  check (wording is null or (jsonb_typeof(wording->'auto_from_nace') = 'object'
                             and wording->>'default' in ('barnehage', 'skole', 'begge')));
alter table app.org_modules add column wording text check (wording in ('barnehage', 'skole', 'begge'));
alter table app.round_modules add column wording text check (wording in ('barnehage', 'skole', 'begge'));

comment on column app.round_modules.wording is
  'The wording this round asks a worded module in (0083): barnehage, skole or begge; null for a module without wordings.';

-- ---------------------------------------------------------------- the organisation's wording
/**
 * The wording an organisation's rounds ask a module in: its own choice, else the module's NACE
 * rule on the registered industry (the longest prefix that matches), else the module's default.
 * Null for a module without wordings.
 */
create function app.org_wording(p_org uuid, p_module uuid) returns text
  language sql stable security definer set search_path = ''
as $fn$
  select case when m.wording is null then null else coalesce(
    (select om.wording from app.org_modules om where om.org_id = p_org and om.module_key = m.key),
    (select r.value #>> '{}' from jsonb_each(m.wording->'auto_from_nace') as r(key, value)
     join app.organizations o on o.id = p_org
     where o.registry_nace_code like r.key || '%'
     order by length(r.key) desc limit 1),
    m.wording->>'default') end
  from app.question_modules m where m.id = p_module
$fn$;
revoke all on function app.org_wording(uuid, uuid) from public, anon, authenticated;

/** For the app: the wording each worded module would be asked in, and whether it was chosen or suggested. */
create function public.org_module_wordings(p_org uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if p_org is null or not app.is_org_member(p_org) then
    return jsonb_build_object('error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true, 'wordings', coalesce((
    select jsonb_object_agg(k.key, jsonb_build_object(
             'wording', app.org_wording(p_org, k.id),
             'chosen', exists (select 1 from app.org_modules om where om.org_id = p_org and om.module_key = k.key and om.wording is not null),
             -- where it came from, so the screen says so truthfully: the organisation, its industry code, or the module
             'source', case
               when exists (select 1 from app.org_modules om where om.org_id = p_org and om.module_key = k.key and om.wording is not null) then 'chosen'
               when exists (select 1 from jsonb_object_keys(k.wording->'auto_from_nace') as r(key)
                            join app.organizations o on o.id = p_org
                            where o.registry_nace_code like r.key || '%') then 'nace'
               else 'default' end))
    from (select distinct on (m.key) m.key, m.id, m.wording from app.question_modules m
          where m.wording is not null and app.module_usable(m.id, p_org)
          order by m.key, string_to_array(m.version, '.')::int[] desc) k), '{}'::jsonb));
end $fn$;
revoke all on function public.org_module_wordings(uuid) from public, anon;
grant execute on function public.org_module_wordings(uuid) to authenticated;

-- a round's module takes the organisation's wording as it is put on the round
create function app.round_module_fill_wording() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not exists (select 1 from app.question_modules m where m.id = new.module_id and m.wording is not null) then
    new.wording := null;
  elsif new.wording is null then
    new.wording := app.org_wording(new.org_id, new.module_id);
  end if;
  return new;
end $fn$;
revoke all on function app.round_module_fill_wording() from public, anon, authenticated;

-- named to run before round_module_ok, which then judges the row as it will be stored
create trigger round_module_fill_wording before insert or update on app.round_modules
  for each row execute function app.round_module_fill_wording();

-- a client writes a round's modules (Måleoppsett) but never its wording: that is the
-- organisation's choice, through set_org_module_wording, and the fill trigger's
revoke insert, update on app.round_modules from authenticated;
grant insert (org_id, round_id, module_id, item_ids, include_count_items, include_segments) on app.round_modules to authenticated;
grant update (org_id, round_id, module_id, item_ids, include_count_items, include_segments) on app.round_modules to authenticated;

-- ---------------------------------------------------------------- the planned rounds follow
/**
 * Re-derive the wording of an organisation's planned rounds (one module key, or every worded
 * one): after a new choice, and after the registered industry the suggestion comes from
 * changes. An open or closed round keeps the wording it was asked in, and a round still on a
 * version the organisation may no longer use is left as it is (round_module_ok would refuse it).
 */
create function app.reapply_org_wordings(p_org uuid, p_key text) returns int
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_n int;
begin
  update app.round_modules rm
  set wording = app.org_wording(p_org, rm.module_id)
  from app.rounds r, app.question_modules m
  where r.id = rm.round_id and m.id = rm.module_id
    and rm.org_id = p_org and r.status = 'planlagt'
    and m.wording is not null and (p_key is null or m.key = p_key)
    and app.module_usable(rm.module_id, p_org)
    and rm.wording is distinct from app.org_wording(p_org, rm.module_id);
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;
revoke all on function app.reapply_org_wordings(uuid, text) from public, anon, authenticated;

create function app.organization_nace_wordings() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  perform app.reapply_org_wordings(new.id, null);
  return null;
end $fn$;
revoke all on function app.organization_nace_wordings() from public, anon, authenticated;

create trigger organization_nace_wordings after update of registry_nace_code on app.organizations
  for each row when (old.registry_nace_code is distinct from new.registry_nace_code)
  execute function app.organization_nace_wordings();

-- ---------------------------------------------------------------- the one write path
create function public.set_org_module_wording(p_org uuid, p_key text, p_wording text) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_n int;
begin
  if p_org is null or not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('error', 'not_allowed');
  end if;
  -- null goes back to the suggestion
  if p_wording is not null and p_wording not in ('barnehage', 'skole', 'begge') then
    return jsonb_build_object('error', 'invalid');
  end if;
  if not exists (select 1 from app.question_modules m
                 where m.key = p_key and m.wording is not null and app.module_usable(m.id, p_org)) then
    return jsonb_build_object('error', 'not_available');
  end if;

  insert into app.org_modules (org_id, module_key, enabled, wording, updated_at, updated_by)
  values (p_org, p_key, false, p_wording, now(), auth.uid())
  on conflict (org_id, module_key) do update
    set wording = excluded.wording, updated_at = excluded.updated_at, updated_by = excluded.updated_by;

  -- the planned rounds follow; an open or closed round keeps the wording it was asked in
  v_n := app.reapply_org_wordings(p_org, p_key);

  return jsonb_build_object('ok', true, 'wording', app.org_wording(p_org,
    (select m.id from app.question_modules m where m.key = p_key and app.module_usable(m.id, p_org)
     order by string_to_array(m.version, '.')::int[] desc limit 1)), 'planned_rounds', v_n);
end $fn$;
revoke all on function public.set_org_module_wording(uuid, text, text) from public, anon;
grant execute on function public.set_org_module_wording(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------- immutability, seeding, readers
-- as 0072, with the wording among what a published module may not change
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
      new.scale, new.scoring, new.anonymity, new.relation_to_core, new.content_hash, new.published_at, new.created_at, new.i18n,
      new.wording)
     is distinct from
     (old.key, old.version, old.name, old.description, old.industry_key, old.estimated_minutes,
      old.scale, old.scoring, old.anonymity, old.relation_to_core, old.content_hash, old.published_at, old.created_at, old.i18n,
      old.wording)
     or (old.status = 'retired' and new.status is distinct from old.status)
     or (old.status = 'published' and new.status = 'draft') then
    raise exception 'published module is immutable; create a new version' using errcode = 'restrict_violation';
  end if;
  return new;
end $fn$;

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
                                    scale, scoring, anonymity, relation_to_core, content_hash, i18n, wording)
  values (p->>'module_id', p->>'version', p->>'name', p->>'description', p->>'module_id',
          (p->>'estimated_minutes')::int, p->'scale', p->'scoring', p->'anonymity',
          coalesce(p->'relation_to_core', '{}'), p_hash,
          case when tr is null then '{}'::jsonb else jsonb_build_object('en', jsonb_strip_nulls(jsonb_build_object(
            'name', tr->'name', 'description', tr->'description', 'scale_labels', tr->'scale_labels',
            'covered_by_core_factors', tr->'covered_by_core_factors'))) end,
          case when p ? 'wording' then jsonb_build_object('default', p->'wording'->'default',
                                                          'auto_from_nace', p->'wording'->'auto_from_nace') end)
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
            (case when v_tf is null then '{}'::jsonb else jsonb_build_object('en', jsonb_build_object(
              'name', v_tf->'name', 'summary', v_tf->'summary', 'rationale', v_tf->'rationale', 'legal_basis', v_tf->'legal_basis')) end)
            -- a worded module's factor name, where it names the children (0083)
            || case when f ? 'name_variants' then jsonb_build_object(
                 'nb.barnehage', jsonb_build_object('name', f->'name_variants'->>'barnehage'),
                 'nb.skole', jsonb_build_object('name', f->'name_variants'->>'skole')) else '{}'::jsonb end)
    returning id into v_fid;

    ii := 0;
    for it in select value from jsonb_array_elements(f->'items') loop
      ii := ii + 1;
      insert into app.module_items (module_id, factor_id, code, kind, text, reverse, pulse_eligible, report_scope, sort)
      values (v_id, v_fid, it->>'id', 'likert5',
              jsonb_strip_nulls(jsonb_build_object('nb', it->>'text', 'en', v_tf->'items'->>(it->>'id'),
                                                   'nb.barnehage', it->'text_variants'->>'barnehage',
                                                   'nb.skole', it->'text_variants'->>'skole')),
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
         jsonb_strip_nulls(jsonb_build_object('nb', c->>'text', 'en', tr->'count_items'->(c->>'id')->>'text',
                                              'nb.barnehage', c->'text_variants'->>'barnehage',
                                              'nb.skole', c->'text_variants'->>'skole')),
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
             select coalesce(jsonb_agg(jsonb_build_object('item', i.id, 'factor', coalesce(f.i18n->('nb.' || rm.wording)->>'name', f.name),
                                                  'text', coalesce(i.text->>('nb.' || rm.wording), i.text->>'nb'),
                                                  'factor_en', f.i18n->'en'->>'name', 'text_en', i.text->>'en')
                                       order by extensions.digest(p_token || i.id::text, 'sha256')), '[]'::jsonb)
             from app.module_items i join app.module_factors f on f.id = i.factor_id
             where i.id = any (rm.item_ids)),
           'count', case when rm.include_count_items then (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'item', i.id, 'text', coalesce(i.text->>('nb.' || rm.wording), i.text->>'nb'),
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
             'code', it.code, 'text', coalesce(it.text->>('nb.' || rm.wording), it.text->>'nb'),
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
    select rm.module_id, it.id, it.factor_id, it.code, coalesce(it.text->>('nb.' || rm.wording), it.text->>'nb') as text,
           it.text->>'en' as text_en, it.sort
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
                      'key', f.key,
                      'name', coalesce(f.i18n->('nb.' || (select rm.wording from app.round_modules rm
                                                          where rm.round_id = p_round and rm.module_id = m.id))->>'name', f.name),
                      'summary', f.summary, 'rationale', f.rationale, 'en', f.i18n->'en',
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
                      'group_name', gr.name, 'n', case when app.participation_shown(p_round, gr.group_id) then gr.n end, 'status', gr.status,
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
