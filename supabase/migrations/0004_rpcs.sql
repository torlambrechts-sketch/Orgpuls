-- 0004_rpcs.sql — the write path and the k-enforcing read path.
--
-- Everything a client touches lives in `public` (supabase-js .rpc() resolves there).
-- No table lives in `public`. Clients never select from app.responses or app.answers;
-- these functions are the only way results leave the database, and they apply k.
--
-- SCORING — derived from the design's own rendered numbers, not invented:
--   value 1..5 -> index 0..100 as (value - 1) * 25
--   factor index = round(mean of its statements' indices)
--   overall index = round(mean of factor indices)
--   bands: Lav >= 65, Middels 50-64, Høy < 50
-- Verified against the bundle: the eleven factor indices (41,44,52,57,58,64,66,69,71,
-- 76,78) have mean 61.45 -> 61, which is the ARBEIDSMILJØINDEKS the design shows; and
-- those bands split them 5/4/2, which is the "5 forsvarlig · 4 følges opp · 2 høy
-- risiko" the design prints beneath it.

create function app.to_index(p_value int) returns numeric
  language sql immutable parallel safe set search_path = ''
as $$ select ((p_value - 1) * 25)::numeric $$;

create function app.risk_band(p_index numeric) returns text
  language sql immutable parallel safe set search_path = ''
as $$
  select case
    when p_index is null then null
    when p_index >= 65 then 'lav'
    when p_index >= 50 then 'middels'
    else 'hoy'
  end
$$;

-- ---------------------------------------------------------------------------
-- WRITE PATH
--
-- The only way a response enters the database. Token-validated, single
-- transaction, and the two writes it makes are deliberately unrelated: the
-- invitation is marked (linked to a person) and the response is inserted
-- (linked to nobody). No foreign key joins them.
-- ---------------------------------------------------------------------------
create function public.submit_response(p_token text, p_answers jsonb)
  returns jsonb
  language plpgsql security definer
  set search_path = ''
as $fn$
declare
  v_inv     app.invitations%rowtype;
  v_group   uuid;
  v_resp    uuid;
  v_written int;
  v_asked   int;
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

  -- every answer must be for a factor this round actually asked about
  select count(*) into v_asked
  from jsonb_array_elements(p_answers) a
  where not exists (
    select 1 from app.round_factors rf
    where rf.round_id = v_inv.round_id and rf.factor_key = (a->>'factor')
  );
  if v_asked > 0 then
    return jsonb_build_object('ok', false, 'error', 'factor_not_in_round');
  end if;

  -- the group is the one thing carried across, because per-group results are the
  -- product. k-anonymity is what makes that safe, and it is applied on read.
  select e.group_id into v_group from app.employees e where e.id = v_inv.employee_id;

  update app.invitations set responded_at = now() where id = v_inv.id;

  insert into app.responses (org_id, round_id, group_id, submitted_hour)
  values (v_inv.org_id, v_inv.round_id, v_group, date_trunc('hour', now()))
  returning id into v_resp;

  insert into app.answers (response_id, factor_key, ordinal, value)
  select v_resp, (a->>'factor')::text, (a->>'ordinal')::int, (a->>'value')::int
  from jsonb_array_elements(p_answers) a;
  get diagnostics v_written = row_count;

  -- v_resp is deliberately NOT returned: the caller must not be able to correlate
  -- their submission with a row.
  return jsonb_build_object('ok', true, 'answers', v_written);
end $fn$;

revoke all on function public.submit_response(text, jsonb) from public;
grant execute on function public.submit_response(text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- READ PATH — k enforced per cell, not per query.
-- ---------------------------------------------------------------------------
create function public.results_summary(p_round uuid)
  returns jsonb
  language plpgsql security definer stable
  set search_path = ''
as $fn$
declare
  v_org uuid; v_k int; v_n int; v_factors jsonb; v_overall numeric;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round;
  if v_org is null then return jsonb_build_object('error', 'not_found'); end if;
  if not app.is_org_member(v_org) then return jsonb_build_object('error', 'forbidden'); end if;

  v_k := app.k_threshold(v_org);
  select count(*) into v_n from app.responses where round_id = p_round;

  if v_n < v_k then
    -- the headcount is disclosed (the statutory report names it), the answers are not
    return jsonb_build_object('status', 'insufficient_data', 'n', v_n, 'threshold', v_k);
  end if;

  -- cast: ordering by the text would put factors 10 and 11 before 2
  select jsonb_agg(x order by (x->>'sort_order')::int)
  into v_factors
  from (
    select jsonb_build_object(
             'key', f.key,
             'law_ref', f.law_ref,
             'sort_order', f.sort_order,
             'index', round(avg(app.to_index(ans.value))),
             'band', app.risk_band(round(avg(app.to_index(ans.value))))
           ) as x
    from app.answers ans
    join app.responses resp on resp.id = ans.response_id
    join app.factors f on f.key = ans.factor_key
    where resp.round_id = p_round
    group by f.key, f.law_ref, f.sort_order
  ) s;

  select round(avg((e->>'index')::numeric)) into v_overall
  from jsonb_array_elements(coalesce(v_factors, '[]'::jsonb)) e;

  return jsonb_build_object(
    'status', 'ok', 'n', v_n, 'threshold', v_k,
    'index', v_overall, 'band', app.risk_band(v_overall),
    'factors', coalesce(v_factors, '[]'::jsonb)
  );
end $fn$;

revoke all on function public.results_summary(uuid) from public;
grant execute on function public.results_summary(uuid) to authenticated;

-- Per-group results. Each group is its own cell and is judged on its own count:
-- a group below k returns its headcount and NO scores, and is still included in the
-- whole-organisation figure above. This is exactly what the design's report says:
-- "Administrasjon (3 svar) er derfor kun med i helheten, ikke som egen gruppe."
create function public.results_by_group(p_round uuid)
  returns jsonb
  language plpgsql security definer stable
  set search_path = ''
as $fn$
declare
  v_org uuid; v_k int; v_out jsonb;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round;
  if v_org is null then return jsonb_build_object('error', 'not_found'); end if;
  if not app.is_org_member(v_org) then return jsonb_build_object('error', 'forbidden'); end if;

  v_k := app.k_threshold(v_org);

  select jsonb_agg(row_to_json(g)::jsonb order by g.group_name)
  into v_out
  from (
    select
      coalesce(grp.name, 'Uten gruppe') as group_name,
      counts.n                          as n,
      case when counts.n >= v_k then 'ok' else 'insufficient_data' end as status,
      case when counts.n >= v_k then (
        -- per-factor means are computed in a derived table first; aggregating an
        -- aggregate directly is a nested-aggregate error, not merely bad style
        select jsonb_agg(jsonb_build_object('key', pf.key, 'index', pf.idx,
                                            'band', app.risk_band(pf.idx))
                         order by pf.sort_order)
        from (
          select f2.key, f2.sort_order, round(avg(app.to_index(a2.value))) as idx
          from app.answers a2
          join app.responses r2 on r2.id = a2.response_id
          join app.factors f2 on f2.key = a2.factor_key
          where r2.round_id = p_round
            and r2.group_id is not distinct from counts.group_id
          group by f2.key, f2.sort_order
        ) pf
      ) else null end as factors
    from (
      select resp.group_id, count(*) as n
      from app.responses resp
      where resp.round_id = p_round
      group by resp.group_id
    ) counts
    left join app.groups grp on grp.id = counts.group_id
  ) g;

  return jsonb_build_object('threshold', v_k, 'groups', coalesce(v_out, '[]'::jsonb));
end $fn$;

revoke all on function public.results_by_group(uuid) from public;
grant execute on function public.results_by_group(uuid) to authenticated;
