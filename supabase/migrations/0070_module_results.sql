-- 0070_module_results.sql — reading a round's industry module (D-114).
--
--   app.release_cells         the release decision of app.cell_release (0042, 0045) for one
--                             cell's groups: k per group, and complementary suppression so a
--                             withheld group cannot be recovered by subtraction. Written once
--                             and used for module statements; module_results_invariants
--                             proves it decides every core cell exactly as cell_release does.
--   app.module_cell_release   per asked module statement and group, and per module factor
--                             (released only where every asked statement of it is)
--   public.module_results     a closed round's module factors: for the house (daglig leder,
--                             verneombud) where every asked statement has k answers, and per
--                             group where that group's factor cell is released. A department
--                             leader sees their visible groups only, as results_by_group.
--   public.get_count_item_totals
--                             a closed round's count questions, for the whole organisation
--                             only: ja, nei, vet ikke and the total, and NOTHING for a question
--                             fewer than k answered. It takes no group or segment, and the
--                             rows it reads have none (0067).
--   app.segment_cell_ok       the rule a segment filter will obey when it ships behind
--                             `module_segments`: a group ∩ segment cell only where both it and
--                             the rest of the group have k, so the complement cannot be derived.
--
-- Results are for closed rounds only, as every reader since 0042: two reads of an open round
-- a minute apart difference one person's answers.

create function app.release_cells(p_k int, p_rel_g uuid[], p_rel_s text[], p_g uuid[], p_n int[])
  returns table (group_id uuid, n int, status text)
  language plpgsql immutable set search_path = ''
as $fn$
declare
  v_cand   uuid[] := '{}';
  v_cand_n int[] := '{}';
  v_prot   uuid[] := '{}';
  v_total  int := 0;
  v_rest   int;
  v_pos    int;
  i        int;
begin
  if p_g is null then
    return;
  end if;
  -- candidates: released for the round, and answered here by k (p_g is smallest first)
  for i in 1..cardinality(p_g) loop
    v_total := v_total + p_n[i];
    v_pos := array_position(p_rel_g, p_g[i]);
    if p_n[i] >= p_k and p_rel_s[v_pos] = 'ok' then
      v_cand := v_cand || p_g[i];
      v_cand_n := v_cand_n || p_n[i];
    end if;
  end loop;

  -- the withheld answers must be none or at least k, or a subtraction recovers them
  v_rest := v_total - coalesce((select sum(x) from unnest(v_cand_n) x), 0);
  i := 1;
  while v_rest > 0 and v_rest < p_k and i <= cardinality(v_cand) loop
    v_prot := v_prot || v_cand[i];
    v_rest := v_rest + v_cand_n[i];
    i := i + 1;
  end loop;

  for i in 1..cardinality(p_g) loop
    v_pos := array_position(p_rel_g, p_g[i]);
    group_id := p_g[i];
    n := p_n[i];
    status := case
      when p_rel_s[v_pos] <> 'ok' then p_rel_s[v_pos]
      when p_n[i] < p_k then 'insufficient_data'
      when p_g[i] is null and array_position(v_prot, null) is not null then 'protected'
      when p_g[i] = any(v_prot) then 'protected'
      else 'ok'
    end;
    return next;
  end loop;
end $fn$;

create function app.module_cell_release(p_round uuid)
  returns table (item_id uuid, factor_id uuid, group_id uuid, n int, status text)
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_org   uuid;
  v_k     int;
  v_rel_g uuid[];
  v_rel_s text[];
  c       record;
  v_cells jsonb := '[]';
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round and r.status = 'lukket';
  if v_org is null then
    return;
  end if;
  v_k := app.k_threshold(v_org);

  select array_agg(gr.group_id), array_agg(gr.status) into v_rel_g, v_rel_s
  from app.group_release(p_round) gr;
  if v_rel_g is null then
    return;
  end if;

  -- the people who answered each asked statement, per group, smallest first, as 0045 counts
  for c in
    select it.id, it.factor_id,
           array_agg(x.group_id order by x.n, x.group_id::text) filter (where x.n is not null) as g,
           array_agg(x.n        order by x.n, x.group_id::text) filter (where x.n is not null) as n
    from app.round_modules rm
    join app.module_items it on it.id = any (rm.item_ids)
    left join (
      select ma.item_id, resp.group_id, count(distinct ma.response_id)::int as n
      from app.module_answers ma join app.responses resp on resp.id = ma.response_id
      where resp.round_id = p_round
      group by ma.item_id, resp.group_id
    ) x on x.item_id = it.id
    where rm.round_id = p_round
    group by it.id, it.factor_id
  loop
    v_cells := v_cells || coalesce((
      select jsonb_agg(jsonb_build_object('item_id', c.id, 'factor_id', c.factor_id,
                                          'group_id', rc.group_id, 'n', rc.n, 'status', rc.status))
      from app.release_cells(v_k, v_rel_g, v_rel_s, c.g, c.n) rc), '[]'::jsonb);
  end loop;

  return query
  with s as (
    select * from jsonb_to_recordset(v_cells)
      as x(item_id uuid, factor_id uuid, group_id uuid, n int, status text)
  ), asked as (
    select it.id, it.factor_id from app.round_modules rm join app.module_items it on it.id = any (rm.item_ids)
    where rm.round_id = p_round
  )
  select s.item_id, s.factor_id, s.group_id, s.n, s.status from s
  union all
  -- a factor, per group: released only where every asked statement of it is
  select null::uuid, a.factor_id, gg.gid, min(coalesce(s.n, 0))::int,
         case
           when min(gg.rs) <> 'ok' then min(gg.rs)
           when bool_or(s.status is null or s.status = 'insufficient_data') then 'insufficient_data'
           when bool_and(s.status = 'ok') then 'ok'
           else 'protected'
         end
  from unnest(v_rel_g, v_rel_s) as gg(gid, rs)
  cross join asked a
  left join s on s.item_id = a.id and s.group_id is not distinct from gg.gid
  group by a.factor_id, gg.gid;
end $fn$;

create function public.module_results(p_round uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
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
    select rm.module_id, it.id, it.factor_id, it.code, it.text->>'nb' as text, it.sort
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
           'key', m.key, 'version', m.version, 'name', m.name,
           'factors', (
             select jsonb_agg(jsonb_build_object(
                      'key', f.key, 'name', f.name, 'summary', f.summary, 'rationale', f.rationale,
                      'rationale_sources', to_jsonb(f.rationale_sources), 'legal_basis', to_jsonb(f.legal_basis),
                      'index', case when v_whole then fo.idx end,
                      'band', case when v_whole and fo.idx is not null then app.risk_band(fo.idx) end,
                      'items', (
                        select jsonb_agg(jsonb_build_object('code', a.code, 'text', a.text,
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
end $fn$;

create function public.get_count_item_totals(p_round_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
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
end $fn$;

/**
 * A segment within a group is shown only when both the segment's part of the group and the
 * rest of the group have k answers: with only the first, "group" minus "group ∩ segment"
 * gives away the rest. For the flag `module_segments`; nothing reads segments yet.
 */
create function app.segment_cell_ok(p_k int, p_n_both int, p_n_group int) returns boolean
  language sql immutable set search_path = ''
as $fn$ select p_n_both >= greatest(p_k, 5) and (p_n_group - p_n_both) >= greatest(p_k, 5) $fn$;

revoke all on function app.release_cells(int, uuid[], text[], uuid[], int[]) from public, anon, authenticated;
revoke all on function app.module_cell_release(uuid) from public, anon, authenticated;
revoke all on function app.segment_cell_ok(int, int, int) from public, anon, authenticated;
revoke all on function public.module_results(uuid) from public, anon;
grant execute on function public.module_results(uuid) to authenticated;
revoke all on function public.get_count_item_totals(uuid) from public, anon;
grant execute on function public.get_count_item_totals(uuid) to authenticated;
