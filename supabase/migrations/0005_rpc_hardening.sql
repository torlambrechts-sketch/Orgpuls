-- 0005_rpc_hardening.sql — two fixes to 0004, both found by taking Supabase's own
-- security advisor seriously instead of assuming it was wrong.
--
-- 1. anon could execute the result readers.
--
--    0004 ends with `revoke all on function ... from public`, which looks sufficient
--    and is not. Supabase configures ALTER DEFAULT PRIVILEGES to grant EXECUTE on new
--    functions to anon, authenticated and service_role. Those are *explicit* grants to
--    named roles, so revoking from PUBLIC leaves them untouched. The ACL read
--    `anon=X/postgres` despite the revoke.
--
--    Revoking from PUBLIC is not the same as revoking from anon. Say the role.
--
-- 2. The readers were an enumeration oracle.
--
--    They returned 'not_found' for a round that does not exist and 'forbidden' for one
--    that exists but belongs to another tenant. Anyone who could call them could
--    therefore test whether a given round id is real. Round ids are UUIDs and so hard
--    to guess, which lowers severity but does not make the distinction safe — and
--    combined with fix 1 it was reachable without signing in at all.
--
--    Both cases now return the same 'not_available'. A caller who may not see a round
--    cannot learn whether it exists.

create or replace function public.results_summary(p_round uuid)
  returns jsonb language plpgsql security definer stable set search_path = ''
as $fn$
declare v_org uuid; v_k int; v_n int; v_factors jsonb; v_overall numeric;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round;
  -- one branch for "does not exist" and "not yours": they must be indistinguishable
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'not_available');
  end if;

  v_k := app.k_threshold(v_org);
  select count(*) into v_n from app.responses where round_id = p_round;
  if v_n < v_k then
    return jsonb_build_object('status', 'insufficient_data', 'n', v_n, 'threshold', v_k);
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
    group by f.key, f.law_ref, f.sort_order
  ) s;

  select round(avg((e->>'index')::numeric)) into v_overall
  from jsonb_array_elements(coalesce(v_factors, '[]'::jsonb)) e;

  return jsonb_build_object('status','ok','n',v_n,'threshold',v_k,
    'index',v_overall,'band',app.risk_band(v_overall),
    'factors',coalesce(v_factors,'[]'::jsonb));
end $fn$;

create or replace function public.results_by_group(p_round uuid)
  returns jsonb language plpgsql security definer stable set search_path = ''
as $fn$
declare v_org uuid; v_k int; v_out jsonb;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round;
  if v_org is null or not app.is_org_member(v_org) then
    return jsonb_build_object('error', 'not_available');
  end if;

  v_k := app.k_threshold(v_org);

  select jsonb_agg(row_to_json(g)::jsonb order by g.group_name) into v_out
  from (
    select coalesce(grp.name, 'Uten gruppe') as group_name, counts.n as n,
      case when counts.n >= v_k then 'ok' else 'insufficient_data' end as status,
      case when counts.n >= v_k then (
        select jsonb_agg(jsonb_build_object('key', pf.key, 'index', pf.idx,
                                            'band', app.risk_band(pf.idx))
                         order by pf.sort_order)
        from (
          select f2.key, f2.sort_order, round(avg(app.to_index(a2.value))) as idx
          from app.answers a2
          join app.responses r2 on r2.id = a2.response_id
          join app.factors f2 on f2.key = a2.factor_key
          where r2.round_id = p_round and r2.group_id is not distinct from counts.group_id
          group by f2.key, f2.sort_order
        ) pf
      ) else null end as factors
    from (
      select resp.group_id, count(*) as n from app.responses resp
      where resp.round_id = p_round group by resp.group_id
    ) counts
    left join app.groups grp on grp.id = counts.group_id
  ) g;

  return jsonb_build_object('threshold', v_k, 'groups', coalesce(v_out, '[]'::jsonb));
end $fn$;

-- Name the role. `from public` does not reach a default-privilege grant to `anon`.
revoke execute on function public.results_summary(uuid)  from anon, public;
revoke execute on function public.results_by_group(uuid) from anon, public;
grant  execute on function public.results_summary(uuid)  to authenticated;
grant  execute on function public.results_by_group(uuid) to authenticated;

-- submit_response deliberately KEEPS its anon grant: the respondent is anonymous and
-- holds nothing but a token. That is the product, not an oversight.
