-- 0213 · «Fortell de ansatte» counts what the page shows (D-245)
--
-- The round's page lists the whole organisation's collective measures only: a measure for one
-- department is left out (0129, AUD-22). 0212 counted and required any collective measure, so the
-- card could say «4 tiltak er bestemt» over a page that shows two, and the message could go out to
-- a page that shows none. Both functions now apply the page's own rule.

create or replace function public.tell_employees(p_round uuid) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_org uuid;
  v_id  uuid;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round;
  if v_org is null or not app.has_role(v_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('error', 'not_allowed');
  end if;
  if not exists (select 1 from app.rounds r
                 where r.id = p_round and r.status = 'lukket' and r.results_page and app.results_published(r.id)) then
    return jsonb_build_object('error', 'page_not_shown');
  end if;
  -- 0213: a measure the page shows – collective, decided, for the whole organisation (0129, AUD-22)
  if not exists (select 1 from app.measures m
                 where m.round_id = p_round and m.kind = 'kollektivt' and m.step <> 'foreslatt'
                   and not exists (select 1 from app.measure_groups g where g.measure_id = m.id)) then
    return jsonb_build_object('error', 'no_measures');
  end if;
  insert into app.outbox (org_id, round_id, kind, audience, due_at)
  values (v_org, p_round, 'tiltak_status', 'alle_ansatte', now())
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('error', 'already');
  end if;
  return jsonb_build_object('queued', true);
end $fn$;

create or replace function public.measures_notice(p_round uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_org uuid;
  o     record;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round;
  if v_org is null or not app.has_role(v_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('error', 'not_available');
  end if;
  select ob.created_at, ob.sent_at, ob.failed_at into o
    from app.outbox ob where ob.round_id = p_round and ob.kind = 'tiltak_status' and ob.audience = 'alle_ansatte';
  return jsonb_build_object(
    -- 0213: what the page shows (0129, AUD-22)
    'decided', (select count(*) from app.measures m
                where m.round_id = p_round and m.kind = 'kollektivt' and m.step <> 'foreslatt'
                  and not exists (select 1 from app.measure_groups g where g.measure_id = m.id)),
    'queued_at', o.created_at,
    'sent_at', o.sent_at,
    'failed', o.failed_at is not null);
end $fn$;
