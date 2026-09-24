-- 0045_cell_release_one_pass.sql — the same release, counted in one pass.
--
-- `app.cell_release` (0042) decides, per statement and group, whether a cell may be shown:
-- k per cell, and complementary suppression so a withheld cell cannot be recovered by
-- subtraction. It counted each statement's respondents with its own query — 33 queries
-- per round, about 15 ms — and `results_by_group` calls it once per round, so Resultater's
-- and Tiltak's workspace spent 130 of its 200 ms here on the design fixture.
--
-- This counts every statement of the round in one aggregate (about 3 ms) and loops over
-- the result. Nothing else changes: the same statements in the same order, the same groups
-- smallest first with the same tie-break, the same release rule, the same factor rows. When
-- this was applied, its output was compared row for row with 0042's for every closed round
-- of every organisation, locally and on the hosted project, and was identical.
-- `release_invariants.sql` checks every cell's count against a direct count.
--
-- `create or replace` keeps the function's owner and grants.

create or replace function app.cell_release(p_round uuid)
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

  -- the people who answered each statement, per group, smallest first: counted in one pass
  -- over the round's answers, where 0042 asked once per statement
  for c in
    select st.factor_key, st.ordinal,
           array_agg(x.group_id order by x.n, x.group_id::text) filter (where x.n is not null) as g,
           array_agg(x.n        order by x.n, x.group_id::text) filter (where x.n is not null) as n
    from app.statements st
    left join (
      select a.factor_key, a.ordinal, resp.group_id, count(distinct a.response_id)::int as n
      from app.answers a join app.responses resp on resp.id = a.response_id
      where resp.round_id = p_round
      group by a.factor_key, a.ordinal, resp.group_id
    ) x on x.factor_key = st.factor_key and x.ordinal = st.ordinal
    group by st.factor_key, st.ordinal
    order by st.factor_key, st.ordinal
  loop
    v_g := c.g;
    v_n := c.n;
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
