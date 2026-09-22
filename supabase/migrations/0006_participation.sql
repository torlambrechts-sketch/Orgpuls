-- 0006_participation.sql — who answered, which is not the same question as what they said.
--
-- Participation is deliberately NOT k-anonymised, and that is not an oversight. The
-- design shows Administrasjon at 5 employees, 3 answered, 60% — on the same screen
-- where its results are withheld — and labels such a group:
--
--   "under terskel — vises bare som deltakelse, aldri som resultat"
--
-- A response rate is a fact about a group, not about a person's answers, so publishing
-- it discloses nothing about anyone. Withholding it would also break the product: you
-- cannot chase a low response rate you are not allowed to see.
--
-- Note which count drives which rule. `thin` is computed from HEADCOUNT, because the
-- warning is about a group too small to ever report; results are withheld on RESPONDENT
-- count in results_by_group. They are different numbers and conflating them would mask
-- the wrong groups.
--
-- What this function must never expose is WHO did not answer. It returns counts only.
-- The product's own promise is that the list of non-responders is unreadable:
--   "Ingen i virksomheten kan se den lista — verken du, lederne eller verneombudet."
-- The reminder path uses it server-side; no client may select it.

create function public.participation(p_round uuid)
  returns jsonb
  language plpgsql security definer stable
  set search_path = ''
as $fn$
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

  select jsonb_agg(row_to_json(x)::jsonb order by x.sort_order), sum(x.headcount), sum(x.answered)
  into v_rows, v_total, v_answered
  from (
    select grp.name                                   as group_name,
           grp.sort_order                             as sort_order,
           count(e.id)::int                           as headcount,
           count(i.responded_at)::int                 as answered,
           round(100.0 * count(i.responded_at) / nullif(count(e.id), 0))::int as pct,
           (count(e.id) < v_k)                        as thin
    from app.groups grp
    join app.employees e on e.group_id = grp.id and e.active
    join app.invitations i on i.employee_id = e.id and i.round_id = p_round
    where grp.org_id = v_org
    group by grp.name, grp.sort_order
  ) x;

  return jsonb_build_object(
    'threshold', v_k,
    'headcount', coalesce(v_total, 0),
    'answered',  coalesce(v_answered, 0),
    'pct', case when coalesce(v_total, 0) = 0 then 0
                else round(100.0 * v_answered / v_total)::int end,
    'groups', coalesce(v_rows, '[]'::jsonb)
  );
end $fn$;

-- Named explicitly, because revoking from PUBLIC does not remove Supabase's
-- default-privilege grant to anon. That lesson cost a migration once already (0005).
revoke execute on function public.participation(uuid) from anon, public;
grant  execute on function public.participation(uuid) to authenticated;
