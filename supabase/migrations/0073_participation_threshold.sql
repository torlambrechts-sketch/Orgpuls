-- 0073_participation_threshold.sql — no participation count for a group under k (D-123).
--
-- Tor's decision, 2026-09-27 (engagement P0.3, I4): participation may be shown per group, but
-- never for a group with fewer than k people asked, neither while the round is open nor
-- after it closes, and never for a group whose count would give such a group away. Until
-- now `participation` returned "1 av 3" for a group of three while the round ran, and the
-- result readers printed "3 svar" beside a group of three whose results they withheld:
-- in a small group that is close to saying who answered.
--
-- The rule is one function, app.participation_shown(round, group), which every reader asks:
--   * a group is hidden when fewer than k people were asked in the round: invited, or where more
--     answered than were invited (a round shared as a link), those who answered;
--   * if the hidden groups together have fewer than k people, the smallest shown groups are
--     hidden too, in order, until they do — otherwise the organisation's total minus the
--     shown groups would print the hidden one's count (the same reasoning as group_release);
-- Organisation totals are unchanged: participation for the whole organisation is allowed.
-- Headcounts stay: how many people a group has is the register, not who answered.

-- how many people a group had in a round: those invited, or, where more answered than were
-- invited (a round shared as a link), those who answered
create or replace function app.round_group_sizes(p_round uuid)
returns table (group_id uuid, n int)
language sql stable security definer set search_path = ''
as $fn$
  select x.group_id, max(x.n)::int from (
    select e.group_id, count(*) as n
    from app.invitations inv join app.employees e on e.id = inv.employee_id
    where inv.round_id = p_round group by e.group_id
    union all
    select resp.group_id, count(*) from app.responses resp where resp.round_id = p_round group by resp.group_id
  ) x group by x.group_id
$fn$;
revoke all on function app.round_group_sizes(uuid) from public, anon, authenticated;

create or replace function app.participation_visibility(p_round uuid)
returns table (group_id uuid, headcount int, shown boolean)
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_org    uuid;
  v_k      int;
  v_hidden int;
  v_cand   uuid[];
  v_cand_n int[];
  v_extra  uuid[] := '{}';
  i        int := 1;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round;
  if v_org is null then
    return;
  end if;
  v_k := app.k_threshold(v_org);

  select coalesce(sum(c.n), 0) into v_hidden from app.round_group_sizes(p_round) c where c.n < v_k;

  -- given up in the order group_release uses: by size, then by id, never by name
  select array_agg(c.group_id order by c.n, c.group_id::text), array_agg(c.n order by c.n, c.group_id::text)
    into v_cand, v_cand_n
  from app.round_group_sizes(p_round) c where c.n >= v_k;

  while v_hidden > 0 and v_hidden < v_k and i <= coalesce(cardinality(v_cand), 0) loop
    v_extra := v_extra || v_cand[i];
    v_hidden := v_hidden + v_cand_n[i];
    i := i + 1;
  end loop;

  return query
  select c.group_id, c.n,
         case when c.n < v_k then false
              when c.group_id is null then array_position(v_extra, null) is null
              else not (c.group_id = any (v_extra)) end
  from app.round_group_sizes(p_round) c;
end $fn$;

create or replace function app.participation_shown(p_round uuid, p_group uuid)
returns boolean
language sql stable security definer set search_path = ''
as $fn$
  select coalesce((select v.shown from app.participation_visibility(p_round) v
                   where v.group_id is not distinct from p_group), false)
$fn$;

revoke all on function app.participation_visibility(uuid) from public, anon, authenticated;
revoke all on function app.participation_shown(uuid, uuid) from public, anon, authenticated;

create or replace function app.participation_all_shown(p_round uuid, p_groups uuid[])
returns boolean
language sql stable security definer set search_path = ''
as $fn$
  select coalesce(bool_and(app.participation_shown(p_round, g)), true) from unnest(p_groups) g
$fn$;
revoke all on function app.participation_all_shown(uuid, uuid[]) from public, anon, authenticated;


CREATE OR REPLACE FUNCTION public.participation(p_round uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid; v_k int; v_rows jsonb; v_total int; v_answered int;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round;
  -- same indistinguishable branch as the result readers: a caller who may not see this
  -- round must not learn whether it exists
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'not_available');
  end if;

  v_k := app.k_threshold(v_org);

  select jsonb_agg(row_to_json(x)::jsonb - 'answered_all' order by x.sort_order), sum(x.headcount), sum(x.answered_all)
  into v_rows, v_total, v_answered
  from (
    select grp.name                                   as group_name,
           grp.sort_order                             as sort_order,
           count(e.id)::int                           as headcount,
           -- 0073: under k by headcount, or given up to protect one that is, no count at all
           case when app.participation_shown(p_round, grp.id) and count(e.id) >= v_k
                then count(i.responded_at)::int end as answered,
           case when app.participation_shown(p_round, grp.id) and count(e.id) >= v_k
                then round(100.0 * count(i.responded_at) / nullif(count(e.id), 0))::int end as pct,
           count(i.responded_at)::int                 as answered_all,
           (count(e.id) < v_k)                        as thin
    from app.groups grp
    join app.employees e on e.group_id = grp.id and e.active
    join app.invitations i on i.employee_id = e.id and i.round_id = p_round
    where grp.org_id = v_org
    group by grp.id, grp.name, grp.sort_order
  ) x;

  return jsonb_build_object(
    'threshold', v_k,
    'headcount', coalesce(v_total, 0),
    'answered',  coalesce(v_answered, 0),
    'pct', case when coalesce(v_total, 0) = 0 then 0
                else round(100.0 * v_answered / v_total)::int end,
    'groups', coalesce(v_rows, '[]'::jsonb)
  );
end $function$;

CREATE OR REPLACE FUNCTION public.results_by_group(p_round uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid; v_k int; v_out jsonb; v_whole boolean;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round and r.status = 'lukket';
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'not_available');
  end if;
  v_k := app.k_threshold(v_org);

  select exists (
    select 1 from app.memberships m
    where m.user_id = auth.uid() and m.active and m.org_id = v_org
      and m.role in ('daglig_leder', 'verneombud')
  ) into v_whole;

  with cells as materialized (select * from app.cell_release(p_round))
  select jsonb_agg(row_to_json(g)::jsonb order by g.group_name) into v_out
  from (
    select coalesce(grp.name, 'Uten gruppe') as group_name,
      -- 0073: a group's count only where its participation may be shown
      case when app.participation_shown(p_round, rel.group_id) then rel.n end as n,
      rel.status as status,
      case when rel.status = 'ok' then (
        select jsonb_agg(jsonb_build_object('key', pf.key, 'index', pf.idx,
                                            'band', app.risk_band(pf.idx))
                         order by pf.sort_order)
        from (
          select f2.key, f2.sort_order, round(avg(app.to_index(a2.value))) as idx
          from app.answers a2
          join app.responses r2 on r2.id = a2.response_id
          join app.factors f2 on f2.key = a2.factor_key
          where r2.round_id = p_round and r2.group_id is not distinct from rel.group_id
            -- 0042: a group's factor only where its cell is released
            and exists (select 1 from cells c
                        where c.factor_key = f2.key and c.ordinal = 0 and c.status = 'ok'
                          and c.group_id is not distinct from rel.group_id)
          group by f2.key, f2.sort_order
        ) pf
      ) else null end as factors
    from app.group_release(p_round) rel
    left join app.groups grp on grp.id = rel.group_id
    where v_whole
       or rel.group_id in (select vg.group_id from app.visible_groups(v_org) vg)
  ) g;

  return jsonb_build_object('threshold', v_k, 'groups', coalesce(v_out, '[]'::jsonb),
                            'scope', case when v_whole then 'org' else 'groups' end);
end $function$;

CREATE OR REPLACE FUNCTION public.results_items(p_round uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid; v_k int; v_whole boolean; v_n int;
  v_visible uuid[]; v_scope uuid[]; v_org_items jsonb; v_groups jsonb;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round and r.status = 'lukket';
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'not_available');
  end if;
  v_k := app.k_threshold(v_org);

  select exists (
    select 1 from app.memberships m
    where m.user_id = auth.uid() and m.active and m.org_id = v_org
      and m.role in ('daglig_leder', 'verneombud')
  ) into v_whole;

  select coalesce(array_agg(vg.group_id), '{}') into v_visible from app.visible_groups(v_org) vg;

  -- the caller's own scope, as results_summary draws it: the house, or the released part
  -- of their department
  if v_whole then
    select coalesce(array_agg(r.id), '{}') into v_scope from app.responses r where r.round_id = p_round;
  else
    select coalesce(array_agg(r.id), '{}') into v_scope
    from app.responses r
    where r.round_id = p_round
      and r.group_id in (select rel.group_id from app.group_release(p_round) rel
                         where rel.status = 'ok' and rel.group_id = any(v_visible));
  end if;
  v_n := cardinality(v_scope);

  if v_n >= v_k then
    with cells as materialized (select * from app.cell_release(p_round))
    select jsonb_agg(jsonb_build_object('key', s.factor_key, 'ordinal', s.ordinal, 'index', s.idx)
                     order by s.sort_order, s.ordinal)
      into v_org_items
    from (
      select a.factor_key, a.ordinal, f.sort_order, round(avg(app.to_index(a.value))) as idx
      from app.answers a join app.factors f on f.key = a.factor_key
      join app.responses r4 on r4.id = a.response_id
      where a.response_id = any(v_scope)
        -- 0042: in a department's scope, only the groups released for this statement
        and (v_whole or exists (select 1 from cells c
                                where c.factor_key = a.factor_key and c.ordinal = a.ordinal
                                  and c.status = 'ok' and c.group_id is not distinct from r4.group_id))
      group by a.factor_key, a.ordinal, f.sort_order
      -- 0042: k people who answered this statement, not k who responded
      having count(distinct a.response_id) >= v_k
    ) s;
  end if;

  with cells as materialized (select * from app.cell_release(p_round))
  select jsonb_agg(row_to_json(g)::jsonb order by g.group_name) into v_groups
  from (
    select coalesce(grp.name, 'Uten gruppe') as group_name,
      case when app.participation_shown(p_round, rel.group_id) then rel.n end as n, rel.status,
      case when rel.status = 'ok' then (
        select jsonb_agg(jsonb_build_object('key', s.factor_key, 'ordinal', s.ordinal, 'index', s.idx)
                         order by s.sort_order, s.ordinal)
        from (
          select a.factor_key, a.ordinal, f.sort_order, round(avg(app.to_index(a.value))) as idx
          from app.answers a
          join app.responses r2 on r2.id = a.response_id
          join app.factors f on f.key = a.factor_key
          where r2.round_id = p_round and r2.group_id is not distinct from rel.group_id
            -- 0042: a group's statement only where its cell is released
            and exists (select 1 from cells c
                        where c.factor_key = a.factor_key and c.ordinal = a.ordinal and c.status = 'ok'
                          and c.group_id is not distinct from rel.group_id)
          group by a.factor_key, a.ordinal, f.sort_order
        ) s
      ) else null end as items
    from app.group_release(p_round) rel
    left join app.groups grp on grp.id = rel.group_id
    where v_whole or rel.group_id = any(v_visible)
  ) g;

  return jsonb_build_object(
    'threshold', v_k,
    'scope', case when v_whole then 'org' else 'group' end,
    'status', case when v_n >= v_k then 'ok' else 'insufficient_data' end,
    'items', coalesce(v_org_items, '[]'::jsonb),
    'groups', coalesce(v_groups, '[]'::jsonb));
end $function$;

CREATE OR REPLACE FUNCTION public.module_results(p_round uuid)
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

CREATE OR REPLACE FUNCTION public.results_summary(p_round uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid; v_k int; v_n int; v_factors jsonb; v_overall numeric;
  v_whole boolean; v_scope text; v_label text;
  v_visible uuid[]; v_released uuid[];
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round and r.status = 'lukket';
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'not_available');
  end if;
  v_k := app.k_threshold(v_org);

  select exists (
    select 1 from app.memberships m
    where m.user_id = auth.uid() and m.active and m.org_id = v_org
      and m.role in ('daglig_leder', 'verneombud')
  ) into v_whole;

  v_scope := case when v_whole then 'org' else 'group' end;

  if not v_whole then
    select coalesce(array_agg(vg.group_id), '{}') into v_visible
    from app.visible_groups(v_org) vg;

    select gr.name into v_label
    from app.groups gr
    where gr.id = any(v_visible)
    limit 1;

    select count(*) into v_n from app.responses resp
    where resp.round_id = p_round and resp.group_id = any(v_visible);

    if v_n < v_k then
      -- 0073: a department's own count only where its participation may be shown
      return jsonb_build_object('status', 'insufficient_data',
                                'n', case when app.participation_all_shown(p_round, v_visible) then v_n end,
                                'threshold', v_k, 'scope', v_scope, 'scope_label', v_label);
    end if;

    select coalesce(array_agg(rel.group_id), '{}') into v_released
    from app.group_release(p_round) rel
    where rel.status = 'ok' and rel.group_id = any(v_visible);

    if cardinality(v_released) = 0 then
      return jsonb_build_object('status', 'protected',
                                'n', case when app.participation_all_shown(p_round, v_visible) then v_n end,
                                'threshold', v_k,
                                'scope', v_scope, 'scope_label', v_label);
    end if;

    select count(*) into v_n from app.responses resp
    where resp.round_id = p_round and resp.group_id = any(v_released);
  else
    select count(*) into v_n from app.responses resp where resp.round_id = p_round;

    if v_n < v_k then
      return jsonb_build_object('status', 'insufficient_data', 'n', v_n, 'threshold', v_k,
                                'scope', v_scope, 'scope_label', v_label);
    end if;
  end if;

  with cells as materialized (select * from app.cell_release(p_round))
  select jsonb_agg(x order by (x->>'sort_order')::int) into v_factors
  from (
    select jsonb_build_object('key', f.key, 'law_ref', f.law_ref, 'sort_order', f.sort_order,
             'index', round(avg(app.to_index(ans.value))),
             'band', app.risk_band(round(avg(app.to_index(ans.value))))) as x
    from app.answers ans
    join app.responses resp on resp.id = ans.response_id
    join app.factors f on f.key = ans.factor_key
    where resp.round_id = p_round
      -- 0042: in a department's scope, only the groups released for this factor
      and (v_whole or exists (
            select 1 from cells c
            where c.factor_key = f.key and c.ordinal = 0 and c.status = 'ok'
              and c.group_id = any(v_released) and c.group_id is not distinct from resp.group_id))
    group by f.key, f.law_ref, f.sort_order
    -- 0042: for the house, a factor only where every statement of it has k answers; a
    -- statement can be skipped, so k respondents is not k answers
    having not v_whole or (
      select min(x.m) from (
        select count(distinct a2.response_id) as m
        from app.statements st
        left join app.answers a2
          on a2.factor_key = st.factor_key and a2.ordinal = st.ordinal
         and a2.response_id in (select r3.id from app.responses r3 where r3.round_id = p_round)
        where st.factor_key = f.key
        group by st.ordinal) x) >= v_k
  ) s;

  select round(avg((e->>'index')::numeric)) into v_overall
  from jsonb_array_elements(coalesce(v_factors, '[]'::jsonb)) e;

  return jsonb_build_object('status','ok',
    'n', case when v_whole or app.participation_all_shown(p_round, v_released) then v_n end,'threshold',v_k,
    'index',v_overall,'band',app.risk_band(v_overall),
    'scope', v_scope, 'scope_label', v_label,
    'factors',coalesce(v_factors,'[]'::jsonb));
end $function$;
