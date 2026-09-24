-- 0042_harden_results.sql — the P8 security pass (D-77).
--
-- An adversarial review of 0034–0041 found ways around k that these close. Each was
-- traced through the SQL and reproduced against the fixture before it was fixed; see
-- supabase/tests/hardening_invariants.sql.
--
-- 1. Results are for closed rounds only. Every reader answered for an open round, so two
--    reads minutes apart differenced one new respondent's answers. Each now finds an open
--    round as it finds no round at all: `not_available`.
-- 2. Who answered when is no longer readable. `invitations.responded_at` beside
--    `employee_id` named the person whose answers had just appeared, and whose comment
--    had just opened. The table is closed to clients, as the answer tables are: every
--    reader of it is a definer function, and participation is read as counts
--    (`participation`). This also ends client-written invitations, which let a leader pad
--    a small group with responses of their own and subtract them.
-- 3. A closed round's groups are fixed. Deleting a group moved its responses into "Uten
--    gruppe" and re-partitioned the round, and renaming one chose which of two equal
--    groups was protected; together they recovered a group of one. A group that holds
--    responses can no longer be deleted, and ties are broken by id, not name.
-- 4. k counts answers, not respondents. A statement can be skipped, so a group of six
--    where five skipped released one person's answer. `app.cell_release` decides each
--    statement cell per group from the people who answered it, with the same
--    complementary suppression 0034 applies per round; a factor cell is released only
--    where every statement of it is. The readers draw from it.
-- 5. A round's life is the database's. Clients may set four of a round's settings
--    (Måleoppsett); status and dates move only through definer functions, so the closed-
--    round rule in (1) cannot be sidestepped by closing a round early. The wheel takes
--    start_next_pulse's lock, so the two cannot open rounds at once.
-- 6. Smaller: `comment_themes` counts writers over released groups only; importance needs
--    20 pairs per factor; `setup_progress_touch` runs as invoker; the two-argument
--    `submit_response` left over from 0018 is dropped, so there is one write path — and
--    the thread each comment opens, which 0018 wrote onto that stray function, moves to
--    the one the form calls.

-- 4 ------------------------------------------------------------------ cell release
create function app.cell_release(p_round uuid)
  returns table (factor_key text, ordinal int, group_id uuid, n int, status text)
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_org    uuid;
  v_k      int;
  c        record;
  v_rel_g  uuid[];
  v_rel_s  text[];
  v_g      uuid[];
  v_n      int[];
  v_cand   uuid[];
  v_cand_n int[];
  v_prot   uuid[];
  v_total  int;
  v_rest   int;
  v_pos    int;
  i        int;
  v_cells  jsonb := '[]';
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

  for c in select st.factor_key, st.ordinal from app.statements st order by st.factor_key, st.ordinal loop
    -- the people who answered this statement, per group, smallest first
    select array_agg(x.group_id order by x.n, x.group_id::text),
           array_agg(x.n        order by x.n, x.group_id::text)
      into v_g, v_n
    from (
      select resp.group_id, count(distinct a.response_id)::int as n
      from app.answers a join app.responses resp on resp.id = a.response_id
      where resp.round_id = p_round and a.factor_key = c.factor_key and a.ordinal = c.ordinal
      group by resp.group_id
    ) x;
    continue when v_g is null;

    -- candidates: released for the round, and answered here by k
    v_cand := '{}'; v_cand_n := '{}'; v_total := 0;
    for i in 1..cardinality(v_g) loop
      v_total := v_total + v_n[i];
      v_pos := array_position(v_rel_g, v_g[i]);
      if v_n[i] >= v_k and v_rel_s[v_pos] = 'ok' then
        v_cand := v_cand || v_g[i];
        v_cand_n := v_cand_n || v_n[i];
      end if;
    end loop;

    -- the withheld answers must be none or at least k, or a subtraction recovers them
    v_rest := v_total - coalesce((select sum(x) from unnest(v_cand_n) x), 0);
    v_prot := '{}';
    i := 1;
    while v_rest > 0 and v_rest < v_k and i <= cardinality(v_cand) loop
      v_prot := v_prot || v_cand[i];
      v_rest := v_rest + v_cand_n[i];
      i := i + 1;
    end loop;

    for i in 1..cardinality(v_g) loop
      v_pos := array_position(v_rel_g, v_g[i]);
      v_cells := v_cells || jsonb_build_object(
        'factor_key', c.factor_key, 'ordinal', c.ordinal, 'group_id', v_g[i], 'n', v_n[i],
        'status', case
          when v_rel_s[v_pos] <> 'ok' then v_rel_s[v_pos]
          when v_n[i] < v_k then 'insufficient_data'
          when v_g[i] is null and array_position(v_prot, null) is not null then 'protected'
          when v_g[i] = any(v_prot) then 'protected'
          else 'ok'
        end);
    end loop;
  end loop;

  return query
  with s as (
    select * from jsonb_to_recordset(v_cells)
      as x(factor_key text, ordinal int, group_id uuid, n int, status text)
  )
  select s.factor_key, s.ordinal, s.group_id, s.n, s.status from s
  union all
  -- a factor, per group: released only where every statement of it is
  select st.factor_key, 0, gg.gid, min(coalesce(s.n, 0))::int,
         case
           when min(gg.rs) <> 'ok' then min(gg.rs)
           when bool_or(s.status is null or s.status = 'insufficient_data') then 'insufficient_data'
           when bool_and(s.status = 'ok') then 'ok'
           else 'protected'
         end
  from unnest(v_rel_g, v_rel_s) as gg(gid, rs)
  cross join app.statements st
  left join s on s.factor_key = st.factor_key and s.ordinal = st.ordinal
             and s.group_id is not distinct from gg.gid
  group by st.factor_key, gg.gid;
end $fn$;

revoke all on function app.cell_release(uuid) from public, anon, authenticated;

-- 3 --------------------------------------------------------------- group release
CREATE OR REPLACE FUNCTION app.group_release(p_round uuid)
 RETURNS TABLE(group_id uuid, n integer, status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org   uuid;
  v_k     int;
  v_rest  int;
  v_cand  uuid[];
  v_cand_n int[];
  v_prot  uuid[] := '{}';
  i       int := 1;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round and r.status = 'lukket';
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

  -- the visible groups, in the order they would be given up: by count, then by id. 0042:
  -- not by name, which a daglig leder can change after the round has closed and so choose
  -- which of two equal groups is given up.
  select array_agg(c.group_id order by c.n, c.group_id::text),
         array_agg(c.n        order by c.n, c.group_id::text)
    into v_cand, v_cand_n
  from (
    select resp.group_id, count(*)::int as n
    from app.responses resp
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
end $function$;

-- 1, 4, 6 ---------------------------------------------------------------- readers
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

  return jsonb_build_object('status','ok','n',v_n,'threshold',v_k,
    'index',v_overall,'band',app.risk_band(v_overall),
    'scope', v_scope, 'scope_label', v_label,
    'factors',coalesce(v_factors,'[]'::jsonb));
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

CREATE OR REPLACE FUNCTION public.results_importance(p_round uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid; v_n int; v_out jsonb;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round and r.status = 'lukket';
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
    -- 0042: the minimum counts pairs per factor, not answers to the recommendation question
    having count(*) >= 20
  ) c;

  return jsonb_build_object('status', 'ok', 'minimum', 20, 'factors', coalesce(v_out, '[]'::jsonb));
end $function$;

CREATE OR REPLACE FUNCTION public.results_recommendation(p_round uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid; v_k int; v_n int; v_answered int; v_for int; v_against int;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round and r.status = 'lukket';
  if v_org is null or not exists (
    select 1 from app.memberships m
    where m.user_id = auth.uid() and m.active and m.org_id = v_org
      and m.role in ('daglig_leder', 'verneombud')
  ) then
    return jsonb_build_object('error', 'not_available');
  end if;

  v_k := app.k_threshold(v_org);

  if not exists (
    select 1 from app.round_extra_questions rq
    where rq.round_id = p_round and rq.extra_key = 'anbefaling'
  ) then
    return jsonb_build_object('status', 'not_asked', 'threshold', v_k);
  end if;

  select count(*) into v_n from app.responses where round_id = p_round;

  select count(*),
         count(*) filter (where ea.option_ordinal = 5),
         count(*) filter (where ea.option_ordinal <= 3)
    into v_answered, v_for, v_against
  from app.extra_answers ea
  join app.responses r on r.id = ea.response_id
  where r.round_id = p_round and ea.extra_key = 'anbefaling';

  if v_n < v_k or v_answered < v_k then
    return jsonb_build_object('status', 'insufficient_data', 'threshold', v_k);
  end if;

  return jsonb_build_object('status', 'ok', 'threshold', v_k, 'n', v_n, 'answered', v_answered,
    'score', round(100.0 * (v_for - v_against) / v_answered)::int);
end $function$;

CREATE OR REPLACE FUNCTION public.comment_themes(p_round uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  select r.org_id into v_org from app.rounds r where r.id = p_round and r.status = 'lukket';
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

  -- 0042: over the released responses. Over the whole scope, "wrote" minus the released
  -- groups' writers told whether anyone in a withheld group had written.
  select count(distinct rc.response_id) into v_wrote
  from app.response_comments rc
  where rc.response_id = any(v_released);

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
end $function$;


-- 3 ------------------------------------------------------- a closed round's groups
alter table app.responses drop constraint responses_group_id_fkey;
alter table app.responses add constraint responses_group_id_fkey
  foreign key (group_id) references app.groups (id);

-- 2 -------------------------------------------------------------------- invitations
drop policy if exists invitation_read on app.invitations;
drop policy if exists invitation_write_insert on app.invitations;
drop policy if exists invitation_write_update on app.invitations;
drop policy if exists invitation_write_delete on app.invitations;
revoke all on app.invitations from anon, authenticated, public;

-- 5 -------------------------------------------------------------------------- rounds
revoke insert, update, delete on app.rounds from authenticated;
grant update (comment_policy, allow_dialogue, reminder_day, close_after_days) on app.rounds to authenticated;

-- 5 ----------------------------------------------------------------------- the tick
CREATE OR REPLACE FUNCTION app.wheel_tick()
 RETURNS app.job_runs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  w         app.year_wheels%rowtype;
  r         record;
  m         record;
  v_opened  int := 0;
  v_closed  int := 0;
  v_queued  int := 0;
  v_planned int := 0;
  v_n       int;
  v_tz      text;
  v_meas    uuid;
  v_round   uuid;
  v_year    int;
  v_at      timestamptz;
  v_run     app.job_runs;
begin
  for w in select * from app.year_wheels where active loop
    -- 0042: the same lock start_next_pulse takes, so the two cannot open rounds at once
    perform pg_advisory_xact_lock(hashtext('start_next_pulse:' || w.org_id::text));
    select coalesce(o.timezone, 'Europe/Oslo') into v_tz
    from app.organizations o where o.id = w.org_id;

    -- 1 ---------------------------------------------------------------- forvarsel
    -- The notification ladder. Each audience has its own lead time, and the verneombud's
    -- is first by construction of the rows rather than by a rule written here: § 6-2
    -- requires involvement before the kartlegging starts, so a wheel that warned them
    -- last would be a wheel that broke the law on a schedule.
    for r in
      select ro.id, ro.org_id, ro.opens_at from app.rounds ro
      where ro.org_id = w.org_id and ro.status = 'planlagt' and ro.opens_at is not null
    loop
      insert into app.outbox (org_id, round_id, kind, audience, due_at)
      select r.org_id, r.id, 'forvarsel', n.audience, r.opens_at - make_interval(days => n.lead_days)
      from app.wheel_notifications n
      where n.wheel_id = w.id
        and r.opens_at - make_interval(days => n.lead_days) <= now()
      on conflict do nothing;
      get diagnostics v_n = row_count;
      v_queued := v_queued + v_n;
    end loop;

    -- 2 ---------------------------------------------------------------- open
    for r in
      select ro.* from app.rounds ro
      where ro.org_id = w.org_id and ro.status = 'planlagt'
        and ro.opens_at is not null and ro.opens_at <= now()
    loop
      update app.rounds
      set status = 'apen',
          closes_at = r.opens_at + make_interval(days => r.close_after_days)
      where id = r.id;
      v_opened := v_opened + 1;

      /*
       * An invitation per invited employee, with a hash of bytes this function then
       * throws away. The row exists so the response rate has a denominator; it cannot be
       * redeemed until a dispatcher mints a real token for it. Nobody has been sent
       * anything yet, so nobody should be able to answer yet.
       */
      insert into app.invitations (org_id, round_id, employee_id, token_hash, sent_at, expires_at)
      select r.org_id, r.id, e.id,
             extensions.digest(encode(extensions.gen_random_bytes(32), 'hex'), 'sha256'),
             null,
             r.opens_at + make_interval(days => r.close_after_days)
      from app.employees e
      where e.org_id = r.org_id and e.active
        and (not exists (select 1 from app.round_groups rg where rg.round_id = r.id)
             or e.group_id in (select rg.group_id from app.round_groups rg where rg.round_id = r.id))
      on conflict do nothing;

      insert into app.outbox (org_id, round_id, kind, employee_id, invitation_id, due_at)
      select r.org_id, r.id, 'invitasjon', i.employee_id, i.id, r.opens_at
      from app.invitations i where i.round_id = r.id
      on conflict do nothing;
      get diagnostics v_n = row_count;
      v_queued := v_queued + v_n;
    end loop;

    -- 3 ---------------------------------------------------------------- reminder
    for r in
      select ro.* from app.rounds ro
      where ro.org_id = w.org_id and ro.status = 'apen'
        and ro.reminder_day is not null
        and ro.opens_at + make_interval(days => ro.reminder_day) <= now()
    loop
      insert into app.outbox (org_id, round_id, kind, employee_id, invitation_id, due_at)
      select r.org_id, r.id, 'paminnelse', i.employee_id, i.id,
             r.opens_at + make_interval(days => r.reminder_day)
      from app.invitations i
      where i.round_id = r.id and i.responded_at is null
      on conflict do nothing;
      get diagnostics v_n = row_count;
      v_queued := v_queued + v_n;
    end loop;

    -- 4 ---------------------------------------------------------------- close
    for r in
      select ro.* from app.rounds ro
      where ro.org_id = w.org_id and ro.status = 'apen'
        and ro.closes_at is not null and ro.closes_at <= now()
    loop
      update app.rounds set status = 'lukket', frozen_at = now() where id = r.id;
      v_closed := v_closed + 1;

      insert into app.outbox (org_id, round_id, kind, audience, due_at)
      select r.org_id, r.id, 'resultat', n.audience, r.closes_at
      from app.wheel_notifications n where n.wheel_id = w.id
      on conflict do nothing;
      get diagnostics v_n = row_count;
      v_queued := v_queued + v_n;
    end loop;

    -- 5 ---------------------------------------------------------------- plan ahead
    -- One round per month the cadence names, up to a year out, created only when it does
    -- not already exist. This is what makes "Neste: september 2027" a row rather than a
    -- sentence.
    for m in select * from app.wheel_months(w.cadence, w.baseline_month, w.skip_fellesferie) loop
      for v_year in extract(year from now())::int .. extract(year from now())::int + 1 loop
        v_at := app.first_tuesday(v_year, m.month, v_tz);
        continue when v_at <= now() or v_at > now() + interval '1 year';

        -- 0041: a month that already holds a round of this kind is planned, whatever its
        -- day. A first send-out on a chosen Tuesday must not gain a twin on the first one.
        continue when exists (
          select 1 from app.rounds ro join app.measurements ms on ms.id = ro.measurement_id
          where ro.org_id = w.org_id and ms.kind = m.kind
            and date_trunc('month', ro.opens_at at time zone v_tz)
              = date_trunc('month', v_at at time zone v_tz));

        -- 0041: a grunnlinje is yearly, so none within six months after another. A first
        -- send-out in October with the baseline month set to November is the year's
        -- grunnlinje; the wheel's own comes the November after.
        continue when m.kind = 'grunnlinje' and exists (
          select 1 from app.rounds ro join app.measurements ms on ms.id = ro.measurement_id
          where ro.org_id = w.org_id and ms.kind = 'grunnlinje'
            and ro.opens_at < v_at and ro.opens_at > v_at - interval '6 months');

        -- 0041: a puls follows measures. With none open it would carry no factor and send
        -- an empty survey, and in a month a grunnlinje opens it would ask the same again.
        continue when m.kind = 'puls' and (
          not exists (select 1 from app.measures me
                      where me.org_id = w.org_id and me.step <> 'lukket')
          or exists (
            select 1 from app.rounds ro join app.measurements ms on ms.id = ro.measurement_id
            where ro.org_id = w.org_id and ms.kind = 'grunnlinje'
              and date_trunc('month', ro.opens_at at time zone v_tz)
                = date_trunc('month', v_at at time zone v_tz)));

        select ms.id into v_meas from app.measurements ms
        where ms.org_id = w.org_id and ms.kind = m.kind and ms.year = v_year
          and extract(month from coalesce(
                (select min(ro.opens_at) from app.rounds ro where ro.measurement_id = ms.id),
                v_at)) = m.month
        limit 1;

        if v_meas is null then
          insert into app.measurements (org_id, kind, year, label)
          values (w.org_id, m.kind, v_year, null) returning id into v_meas;
        end if;

        select ro.id into v_round from app.rounds ro
        where ro.measurement_id = v_meas and ro.opens_at = v_at;

        if v_round is null then
          insert into app.rounds (org_id, measurement_id, status, opens_at, closes_at)
          values (w.org_id, v_meas, 'planlagt', v_at, v_at + interval '7 days');
          v_planned := v_planned + 1;

          -- a grunnlinje carries the whole instrument; a puls carries the factors that
          -- currently have an open measure, which is the design's own rule
          insert into app.round_factors (org_id, round_id, factor_key)
          select w.org_id, currval_round.id, f.key
          from (select ro.id from app.rounds ro
                where ro.measurement_id = v_meas and ro.opens_at = v_at) as currval_round
          cross join app.factors f
          where m.kind = 'grunnlinje'
             or f.key in (select distinct me.factor_key from app.measures me
                          where me.org_id = w.org_id and me.step <> 'lukket')
          on conflict do nothing;
        end if;
      end loop;
    end loop;
  end loop;

  insert into app.job_runs (opened, closed, queued, planned)
  values (v_opened, v_closed, v_queued, v_planned)
  returning * into v_run;

  return v_run;
end $function$;


-- 6 ---------------------------------------------------------------------- smaller
alter function app.setup_progress_touch() security invoker;

-- one write path (invariant 3): the form's function gains 0018's threads, the other goes
CREATE OR REPLACE FUNCTION public.submit_response(p_token text, p_answers jsonb, p_extra jsonb)
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

  select count(*) into v_bad
  from jsonb_array_elements(coalesce(p_extra, '[]'::jsonb)) x
  where not exists (
    select 1 from app.round_extra_questions rx
    where rx.round_id = v_inv.round_id and rx.extra_key = (x->>'key')
  );
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

  /*
   * A comment is kept whether or not the question it hangs on was scored, and each one
   * opens a thread whose key goes back to the respondent and nowhere else (0018). 0018
   * wrote this onto the two-argument function that 0010 had replaced, so the path the
   * form calls kept the comment and opened no thread: Kommentarer, which reads threads,
   * never saw a real respondent's comment. 0042 puts it here and drops the other.
   *
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

  -- v_resp is deliberately NOT returned: the caller must not be able to correlate
  -- their submission with a row.
  return jsonb_build_object('ok', true, 'answers', v_written, 'threads', v_keys);
end $function$;

drop function if exists public.submit_response(text, jsonb);
