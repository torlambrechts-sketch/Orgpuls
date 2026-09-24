-- 0037_results_workspace.sql — what design 3's Resultater reads, in one round trip.
--
-- Resultater shows one round in depth and every closed round beside it:
-- - the Varmekart with a drill-down to the three statements of a factor, for the whole
--   organisation or one group;
-- - the Prioritet matrix;
-- - the trend bars;
-- - Sammenlign and Utvikling across years and pulses.
--
-- Two readers are new, and each applies k the way the ones it sits beside do:
--
-- `results_items(p_round)` — the statements. Per statement, the index over the caller's
-- scope (as `results_summary`), and per group only for the groups `app.group_release`
-- releases (as `results_by_group`, 0034). A statement index is a finer cut than a factor
-- index, but not a smaller population: it averages the same respondents, one answer each.
-- So it clears k exactly when the factor does, and the complementary rule that protects the
-- factor figures protects these.
--
-- `results_importance(p_round)` — Prioritet's "betydning" (decision D4). The design draws a
-- literal (`imp: .84`). Here it is measured: per factor, the Pearson correlation between a
-- respondent's mean answer on that factor and their answer to "anbefale oss som
-- arbeidsplass". How strongly a factor moves with whether people would recommend the
-- workplace is the standard key-driver reading of an engagement survey. Two rules:
-- - **Whole organisation only**, daglig leder and verneombud, like "Anbefaler oss" (0035).
--   A correlation per group would be a statistic over eight people, and it would say more
--   about those eight than about the factor.
-- - **At least 20 answers to the question.** Below that a correlation is mostly noise: with
--   n = 20, |r| under 0.44 is not distinguishable from 0 at the 5 % level. The matrix
--   shows the design's empty treatment instead.
--   It returns r per factor and nothing else: no pairs, no counts per option.
--
-- `results_workspace(p_round)` composes them. It is SECURITY INVOKER and only calls the
-- gated readers, so it holds no privilege of its own and adds no rule. Everything in it is
-- something its caller could already ask for, one call at a time. It returns:
--   history          every round of the caller's organisation that has closed, with
--                    `results_summary` and `results_by_group` for each;
--   items            `results_items` for the round in view;
--   recommendation   0035;
--   importance       as above.

-- ------------------------------------------------------------------------ results_items
create function public.results_items(p_round uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_org uuid; v_k int; v_whole boolean; v_n int;
  v_visible uuid[]; v_scope uuid[]; v_org_items jsonb; v_groups jsonb;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round;
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
    select jsonb_agg(jsonb_build_object('key', s.factor_key, 'ordinal', s.ordinal, 'index', s.idx)
                     order by s.sort_order, s.ordinal)
      into v_org_items
    from (
      select a.factor_key, a.ordinal, f.sort_order, round(avg(app.to_index(a.value))) as idx
      from app.answers a join app.factors f on f.key = a.factor_key
      where a.response_id = any(v_scope)
      group by a.factor_key, a.ordinal, f.sort_order
    ) s;
  end if;

  select jsonb_agg(row_to_json(g)::jsonb order by g.group_name) into v_groups
  from (
    select coalesce(grp.name, 'Uten gruppe') as group_name, rel.n, rel.status,
      case when rel.status = 'ok' then (
        select jsonb_agg(jsonb_build_object('key', s.factor_key, 'ordinal', s.ordinal, 'index', s.idx)
                         order by s.sort_order, s.ordinal)
        from (
          select a.factor_key, a.ordinal, f.sort_order, round(avg(app.to_index(a.value))) as idx
          from app.answers a
          join app.responses r2 on r2.id = a.response_id
          join app.factors f on f.key = a.factor_key
          where r2.round_id = p_round and r2.group_id is not distinct from rel.group_id
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
end $fn$;

revoke all on function public.results_items(uuid) from public, anon;
grant execute on function public.results_items(uuid) to authenticated;

-- ------------------------------------------------------------------- results_importance
create function public.results_importance(p_round uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare v_org uuid; v_n int; v_out jsonb;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round;
  if v_org is null or not exists (
    select 1 from app.memberships m
    where m.user_id = auth.uid() and m.active and m.org_id = v_org
      and m.role in ('daglig_leder', 'verneombud')
  ) then
    return jsonb_build_object('error', 'not_available');
  end if;

  select count(*) into v_n
  from app.extra_answers ea join app.responses r on r.id = ea.response_id
  where r.round_id = p_round and ea.extra_key = 'anbefaling';

  if v_n < 20 then
    return jsonb_build_object('status', 'insufficient_data', 'minimum', 20);
  end if;

  select jsonb_agg(jsonb_build_object('key', c.factor_key, 'r', c.r) order by c.sort_order) into v_out
  from (
    select p.factor_key, f.sort_order, round(corr(p.mean, p.rec)::numeric, 2) as r
    from (
      select a.response_id, a.factor_key, avg(a.value)::float8 as mean, ea.option_ordinal::float8 as rec
      from app.answers a
      join app.responses r on r.id = a.response_id
      join app.extra_answers ea on ea.response_id = a.response_id and ea.extra_key = 'anbefaling'
      where r.round_id = p_round
      group by a.response_id, a.factor_key, ea.option_ordinal
    ) p
    join app.factors f on f.key = p.factor_key
    group by p.factor_key, f.sort_order
  ) c;

  return jsonb_build_object('status', 'ok', 'minimum', 20, 'factors', coalesce(v_out, '[]'::jsonb));
end $fn$;

revoke all on function public.results_importance(uuid) from public, anon;
grant execute on function public.results_importance(uuid) to authenticated;

-- -------------------------------------------------------------------- results_workspace
create function public.results_workspace(p_round uuid) returns jsonb
  language sql stable security invoker set search_path = ''
as $fn$
  select jsonb_build_object(
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'round_id', r.id,
               'summary', public.results_summary(r.id),
               'groups', public.results_by_group(r.id))
             order by r.closes_at)
      from app.rounds r
      where r.status = 'lukket'
        and r.org_id = (select r0.org_id from app.rounds r0 where r0.id = p_round)
    ), '[]'::jsonb),
    'items', public.results_items(p_round),
    'recommendation', public.results_recommendation(p_round),
    'importance', public.results_importance(p_round))
$fn$;

revoke all on function public.results_workspace(uuid) from public, anon;
grant execute on function public.results_workspace(uuid) to authenticated;
