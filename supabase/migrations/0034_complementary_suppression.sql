-- 0034_complementary_suppression.sql — a hidden group cannot be recovered by subtraction.
--
-- Until now each group was judged on its own count: at least k responses and its figures
-- are shown, fewer and they are withheld while still counting toward the whole
-- organisation. Taken one cell at a time, that is k-anonymity. Taken together it is not,
-- because the published figures add up:
--
--     n_all · I_all  −  Σ n_g · I_g   (over the visible groups)   =   n_rest · I_rest
--
-- `results_summary` publishes I_all and n_all, `results_by_group` publishes every visible
-- I_g and the n of every group, hidden ones included. So the average of the hidden
-- remainder is one line of arithmetic away. In the fixture that remainder is
-- Administrasjon, 3 respondents. Rounding every index to a whole number blurs the result
-- by about ±3 points. For a group of ONE, the blur is about ±9 points, and one step on the
-- answer scale is 8.3 points, so the arithmetic lands close to one person's answers. That
-- is the thing CLAUDE.md says must be structurally impossible, so it is fixed here, in
-- the database, and not in any screen.
--
-- **The rule (complementary suppression).** For each round, the respondents in withheld
-- groups form the remainder. If the remainder is between 1 and k−1, it could be derived.
-- So the smallest visible group is withheld as well, and then the next, until the
-- remainder is either 0 or at least k. Withheld groups then pool into one figure of k or
-- more people, which is exactly what k promises.
--
-- **The order must not depend on the scores.** Which group is protected is decided from
-- counts and names only: fewest respondents first, then name, then id. If the choice
-- looked at the figures, the choice itself would say something about them. Counts are
-- already public through `participation`, so the decision reveals nothing new.
--
-- **Decided across the whole organisation, then filtered by scope.** An avdelingsleder
-- sees only their own department. But if the decision were made over the caller's view,
-- the avdelingsleder of a protected group would see figures the daglig leder is shown as
-- withheld, and the two together would reopen the gap. So `app.group_release` looks at
-- every group in the round, and `results_by_group` filters by visibility afterwards.
--
-- The new status is `protected`, distinct from `insufficient_data`. A screen must not
-- say "fewer than five answers" about a group of eight; the group has enough answers, it
-- is withheld for someone else's sake, and the screen says so.
--
-- **Comment counts get the same treatment.** `comment_themes` counted comments from every
-- response in scope, while `conversations` withholds the comments of groups under k. The
-- theme counts minus the visible threads were therefore the withheld group's comments,
-- tone included: "someone in Administrasjon answered 1–2 on Ytringsklima and wrote
-- about it". The themes now count only comments from groups that clear k, the same set
-- `conversations` releases, so the two cannot be subtracted.

-- --------------------------------------------------------------------- group_release
create function app.group_release(p_round uuid)
  returns table (group_id uuid, n int, status text)
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_org   uuid;
  v_k     int;
  v_rest  int;
  v_cand  uuid[];
  v_cand_n int[];
  v_prot  uuid[] := '{}';
  i       int := 1;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round;
  if v_org is null then
    return;
  end if;
  v_k := app.k_threshold(v_org);

  -- the remainder: every respondent in a group under k
  select coalesce(sum(c.n), 0) into v_rest
  from (
    select count(*)::int as n from app.responses resp
    where resp.round_id = p_round group by resp.group_id
  ) c
  where c.n < v_k;

  -- the visible groups, in the order they would be given up: counts and names only
  select array_agg(c.group_id order by c.n, c.name, c.group_id::text),
         array_agg(c.n        order by c.n, c.name, c.group_id::text)
    into v_cand, v_cand_n
  from (
    select resp.group_id, count(*)::int as n,
           coalesce(max(g.name), 'Uten gruppe') as name
    from app.responses resp
    left join app.groups g on g.id = resp.group_id
    where resp.round_id = p_round
    group by resp.group_id
    having count(*) >= v_k
  ) c;

  while v_rest > 0 and v_rest < v_k and i <= coalesce(cardinality(v_cand), 0) loop
    v_prot := v_prot || v_cand[i];
    v_rest := v_rest + v_cand_n[i];
    i := i + 1;
  end loop;

  return query
  select c.group_id, c.n,
         case
           when c.n < v_k then 'insufficient_data'
           when c.group_id is null and array_position(v_prot, null) is not null then 'protected'
           when c.group_id = any(v_prot) then 'protected'
           else 'ok'
         end
  from (
    select resp.group_id, count(*)::int as n
    from app.responses resp
    where resp.round_id = p_round
    group by resp.group_id
  ) c;
end $fn$;

-- internal: it answers for any round id without a membership check, so only the
-- SECURITY DEFINER readers that already checked membership may call it
revoke all on function app.group_release(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------ results_by_group
--
-- As 0022, with the status taken from `app.group_release` instead of `n >= k`.
create or replace function public.results_by_group(p_round uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare v_org uuid; v_k int; v_out jsonb; v_whole boolean;
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

  select jsonb_agg(row_to_json(g)::jsonb order by g.group_name) into v_out
  from (
    select coalesce(grp.name, 'Uten gruppe') as group_name, rel.n as n,
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
end $fn$;

revoke all on function public.results_by_group(uuid) from public, anon;
grant execute on function public.results_by_group(uuid) to authenticated;

-- ------------------------------------------------------------------- comment_themes
--
-- As 0030, except that the counted comments are those of groups that clear k, which is
-- the set `conversations` releases. `n` and `wrote` are unchanged: `n` is the
-- denominator `results_summary` prints, and `wrote` counts people, which no published
-- list can be subtracted from.
create or replace function public.comment_themes(p_round uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_org   uuid;
  v_k     int;
  v_whole boolean;
  v_n     int;
  v_wrote int;
  v_themes jsonb;
  v_scope uuid[];
  v_released uuid[];
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round;
  if v_org is null or not exists (
    select 1 from app.memberships m
    where m.user_id = auth.uid() and m.active and m.org_id = v_org
      and m.role in ('daglig_leder', 'avdelingsleder')
  ) then
    return jsonb_build_object('error', 'not_available');
  end if;

  v_k := app.k_threshold(v_org);

  select exists (
    select 1 from app.memberships m
    where m.user_id = auth.uid() and m.active and m.org_id = v_org
      and m.role = 'daglig_leder'
  ) into v_whole;

  -- the responses this caller may count
  select coalesce(array_agg(resp.id), '{}') into v_scope
  from app.responses resp
  where resp.round_id = p_round
    and (v_whole or resp.group_id in (select vg.group_id from app.visible_groups(v_org) vg));

  v_n := cardinality(v_scope);
  if v_n < v_k then
    return jsonb_build_object('status', 'insufficient_data', 'n', v_n, 'threshold', v_k);
  end if;

  -- of those, the responses whose group clears k: the comments `conversations` shows
  select coalesce(array_agg(resp.id), '{}') into v_released
  from app.responses resp
  where resp.id = any(v_scope)
    and (
      select count(*) from app.responses r2
      where r2.round_id = resp.round_id and r2.group_id is not distinct from resp.group_id
    ) >= v_k;

  select count(distinct rc.response_id) into v_wrote
  from app.response_comments rc
  where rc.response_id = any(v_scope);

  select coalesce(jsonb_agg(t order by t.comments desc, t.sort_order), '[]'::jsonb) into v_themes
  from (
    select f.key,
           f.sort_order,
           count(*) as comments,
           count(distinct rc.response_id) as people,
           count(*) filter (where a.value <= 2) as low,
           count(*) filter (where a.value = 3) as mid,
           count(*) filter (where a.value >= 4) as high
    from app.response_comments rc
    join app.factors f on f.key = rc.factor_key
    left join app.answers a
      on a.response_id = rc.response_id and a.factor_key = rc.factor_key and a.ordinal = rc.ordinal
    where rc.response_id = any(v_released)
    group by f.key, f.sort_order
    having count(distinct rc.response_id) >= v_k
  ) t;

  return jsonb_build_object('status', 'ok', 'n', v_n, 'threshold', v_k,
                            'wrote', v_wrote, 'themes', v_themes);
end $fn$;

revoke all on function public.comment_themes(uuid) from public, anon;
grant execute on function public.comment_themes(uuid) to authenticated;

-- ------------------------------------------------------------------ results_summary
--
-- As 0022 for a caller who sees the whole house: the organisation's figure includes
-- every response, which is the point, and is safe now that the parts published beside
-- it never leave a remainder under k.
--
-- For an avdelingsleder the figure is over their department, and that department must
-- be released in the same way `results_by_group` releases it. Otherwise the leader of a
-- protected group reads the figures the daglig leder was shown as withheld, and the two
-- screens together reopen the gap. A protected department answers `protected`, with the
-- count and no figures, so the screen can say why.
create or replace function public.results_summary(p_round uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_org uuid; v_k int; v_n int; v_factors jsonb; v_overall numeric;
  v_whole boolean; v_scope text; v_label text;
  v_visible uuid[]; v_released uuid[];
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
      return jsonb_build_object('status', 'insufficient_data', 'n', v_n, 'threshold', v_k,
                                'scope', v_scope, 'scope_label', v_label);
    end if;

    select coalesce(array_agg(rel.group_id), '{}') into v_released
    from app.group_release(p_round) rel
    where rel.status = 'ok' and rel.group_id = any(v_visible);

    if cardinality(v_released) = 0 then
      return jsonb_build_object('status', 'protected', 'n', v_n, 'threshold', v_k,
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

  select jsonb_agg(x order by (x->>'sort_order')::int) into v_factors
  from (
    select jsonb_build_object('key', f.key, 'law_ref', f.law_ref, 'sort_order', f.sort_order,
             'index', round(avg(app.to_index(ans.value))),
             'band', app.risk_band(round(avg(app.to_index(ans.value))))) as x
    from app.answers ans
    join app.responses resp on resp.id = ans.response_id
    join app.factors f on f.key = ans.factor_key
    where resp.round_id = p_round
      and (v_whole or resp.group_id = any(v_released))
    group by f.key, f.law_ref, f.sort_order
  ) s;

  select round(avg((e->>'index')::numeric)) into v_overall
  from jsonb_array_elements(coalesce(v_factors, '[]'::jsonb)) e;

  return jsonb_build_object('status','ok','n',v_n,'threshold',v_k,
    'index',v_overall,'band',app.risk_band(v_overall),
    'scope', v_scope, 'scope_label', v_label,
    'factors',coalesce(v_factors,'[]'::jsonb));
end $fn$;

revoke all on function public.results_summary(uuid) from public, anon;
grant execute on function public.results_summary(uuid) to authenticated;
