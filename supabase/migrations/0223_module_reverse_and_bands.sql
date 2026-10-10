-- 0223 — A module's reversed statements are scored reversed, and its bands are its own (UK-D2, X-112, D-266).
--
-- 1 · Reverse scoring. A module file marks a statement `reverse` when agreeing with it is the worse
--     answer («I have unachievable deadlines»). 0067 stores the flag and nothing has read it: every module
--     so far words its statements positively, and module_results scored the raw value. HSE's Indicator
--     Tool (UK-D) has twelve such statements, and scoring them raw would turn a bad workplace into a
--     good one. app.answer_index(value, reverse) is the index of an answer, 6 − value where the
--     statement is reversed, and module_results reads it for every item, factor and group index.
--     No published module marks a statement reversed, so no figure changes for any of them.
--
-- 2 · Bands per module. A module file carries its risk bands (scoring.risk_bands), and every module so
--     far states the core's: low from 65, medium from 50. module_results printed app.risk_band, the
--     core's, whatever the file said. app.module_band(scoring, index) reads the module's own minimums,
--     falling back to the core's where the file names none. HSE's tool states its own guidance
--     (X-112: a mean of 4 or more is good, 2 or less needs improvement: index 75 and 26 as minimums),
--     and the 11 factors keep theirs. For every module published today the two give the same band.
--
-- module_results is recreated from its live definition (0089, with 0150's app.k_round): the k a round
-- froze, the cells it releases and everything it returns are unchanged.

create function app.answer_index(p_value int, p_reverse boolean) returns numeric
  language sql immutable parallel safe set search_path = ''
as $fn$ select app.to_index(case when p_reverse then 6 - p_value else p_value end) $fn$;
comment on function app.answer_index(int, boolean) is
  'The 0–100 index of a 1–5 answer, scored reversed where the statement is (0223): what module_results averages.';

create function app.module_band(p_scoring jsonb, p_index numeric) returns text
  language sql immutable parallel safe set search_path = ''
as $fn$
  select case
    when p_index is null then null
    when p_index >= coalesce((select (b->>'min')::numeric from jsonb_array_elements(coalesce(p_scoring->'risk_bands', '[]')) b
                              where b->>'band' = 'lav' and b ? 'min' limit 1), 65) then 'lav'
    when p_index >= coalesce((select (b->>'min')::numeric from jsonb_array_elements(coalesce(p_scoring->'risk_bands', '[]')) b
                              where b->>'band' = 'middels' and b ? 'min' limit 1), 50) then 'middels'
    else 'hoy'
  end
$fn$;
comment on function app.module_band(jsonb, numeric) is
  'A module index''s band by the module''s own scoring.risk_bands (0223), the core''s 65/50 where it names none: lav, middels or hoy, as app.risk_band.';

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
  v_k := app.k_round(p_round);
  select exists (select 1 from app.memberships m
                 where m.user_id = auth.uid() and m.active and m.org_id = v_org
                   and m.role in ('daglig_leder', 'verneombud')) into v_whole;
  select coalesce(array_agg(vg.group_id), '{}') into v_visible from app.visible_groups(v_org) vg;

  with cells as materialized (select * from app.module_cell_release(p_round)),
  asked as (
    select rm.module_id, it.id, it.code, coalesce(it.text->>('nb.' || rm.wording), it.text->>'nb') as text,
           it.text->>'en' as text_en, it.sort, it.core_indicator, it.reverse
    from app.round_modules rm join app.module_items it on it.id = any (rm.item_ids)
    where rm.round_id = p_round
  ),
  -- the factors this round reports (0089)
  fset as (
    select f.id as factor_id, (rm.variant_key = 'utvidet' and f.variant_key = 'forenklet') as comparable
    from app.round_modules rm join app.module_factors f on f.module_id = rm.module_id
    where rm.round_id = p_round
      and exists (select 1 from app.module_factor_items mi join asked a on a.id = mi.item_id where mi.factor_id = f.id)
      and case
            when f.variant_key is null then true
            when rm.variant_key is not null then
              (f.variant_key = rm.variant_key or (rm.variant_key = 'utvidet' and f.variant_key = 'forenklet'))
              and not exists (select 1 from app.module_factor_items mi
                              where mi.factor_id = f.id and not exists (select 1 from asked a where a.id = mi.item_id))
            else f.variant_key = 'forenklet'
                 or exists (select 1 from app.module_factor_items mi join asked a on a.id = mi.item_id
                            where mi.factor_id = f.id and not a.core_indicator)
          end
  ),
  members as (
    select fs.factor_id, a.id as item_id
    from fset fs join app.module_factor_items mi on mi.factor_id = fs.factor_id join asked a on a.id = mi.item_id
  ),
  -- the house: an item, and a factor, only where every asked statement has k answers
  item_n as (
    select a.id, count(distinct ma.response_id)::int as n, round(avg(app.answer_index(ma.value, a.reverse))) as idx
    from asked a
    left join app.module_answers ma on ma.item_id = a.id
     and ma.response_id in (select r.id from app.responses r where r.round_id = p_round)
    group by a.id
  ),
  factor_org as (
    select mm.factor_id, min(i.n) as n,
           case when min(i.n) >= v_k then (
             select round(avg(app.answer_index(ma.value, it.reverse)))
             from app.module_answers ma join app.responses r on r.id = ma.response_id join app.module_items it on it.id = ma.item_id
             where r.round_id = p_round and ma.item_id in (select m2.item_id from members m2 where m2.factor_id = mm.factor_id))
           end as idx
    from members mm join item_n i on i.id = mm.item_id
    group by mm.factor_id
  ),
  groups as (
    select rel.group_id, rel.n, rel.status, coalesce(g.name, 'Uten gruppe') as name
    from app.group_release(p_round) rel left join app.groups g on g.id = rel.group_id
    where v_whole or rel.group_id = any (v_visible)
  )
  select jsonb_agg(jsonb_build_object(
           'key', m.key, 'version', m.version, 'name', m.name, 'name_en', m.i18n->'en'->>'name',
           'validation_status', m.validation_status,
           'variant', (select jsonb_build_object('key', v.key, 'code', v.code, 'version', v.version, 'name', v.name)
                       from app.round_modules rm join app.module_variants v on v.module_id = rm.module_id and v.key = rm.variant_key
                       where rm.round_id = p_round and rm.module_id = m.id),
           'factors', (
             select jsonb_agg(jsonb_build_object(
                      'key', f.key, 'code', f.code, 'variant', f.variant_key, 'comparable', fs.comparable,
                      'name', coalesce(f.i18n->('nb.' || (select rm.wording from app.round_modules rm
                                                          where rm.round_id = p_round and rm.module_id = m.id))->>'name', f.name),
                      'summary', f.summary, 'rationale', f.rationale, 'en', f.i18n->'en',
                      'rationale_sources', to_jsonb(f.rationale_sources), 'legal_basis', to_jsonb(f.legal_basis),
                      'index', case when v_whole then fo.idx end,
                      'band', case when v_whole and fo.idx is not null then app.module_band(m.scoring, fo.idx) end,
                      'items', (
                        select jsonb_agg(jsonb_build_object('code', a.code, 'text', a.text, 'text_en', a.text_en,
                                 'index', case when v_whole and i.n >= v_k then i.idx end) order by a.sort)
                        from members mm join asked a on a.id = mm.item_id join item_n i on i.id = a.id
                        where mm.factor_id = f.id))
                    order by f.sort)
             from app.module_factors f join fset fs on fs.factor_id = f.id join factor_org fo on fo.factor_id = f.id
             where f.module_id = m.id),
           'groups', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'group_name', gr.name, 'n', case when app.participation_shown(p_round, gr.group_id) then gr.n end, 'status', gr.status,
                      'factors', case when gr.status = 'ok' then (
                        select jsonb_agg(jsonb_build_object('key', f.key, 'index', gi.idx, 'band', app.module_band(m.scoring, gi.idx)) order by f.sort)
                        from app.module_factors f
                        join fset fs on fs.factor_id = f.id
                        join lateral (
                          select round(avg(app.answer_index(ma.value, it.reverse))) as idx
                          from app.module_answers ma join app.responses r on r.id = ma.response_id join app.module_items it on it.id = ma.item_id
                          where r.round_id = p_round and r.group_id is not distinct from gr.group_id
                            and ma.item_id in (select mm.item_id from members mm where mm.factor_id = f.id)
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
end $function$
;
