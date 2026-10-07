-- 0212 · «Dette sa dere, dette gjør vi», told when there is something to tell (D-245)
--
-- The round's page for employees (0100, D-151) shows the whole organisation's figures and the
-- collective measures decided from the round, and its link goes out in the results notice when the
-- round closes. At that moment nothing has usually been decided yet: the page says «Ingen tiltak er
-- bestemt ennå», and when the measures are decided weeks later, nobody is told. The growth review of
-- 7 October 2026 («Dere sa – vi gjorde») asks for that second message, so that everyone who answered
-- sees that something came of it.
--
--   * public.tell_employees(round): the daglig leder sends it, once per round. It goes to the round's
--     audience (`alle_ansatte`, as the results notice) by e-mail, with the page's link and nothing
--     else: no measure, no figure and no name in the mail itself. Refused unless the round is closed,
--     its page is shown and published (0105), and at least one collective measure has been decided
--     from it – the page then has something to show.
--   * public.measures_notice(round): what the card on Resultater needs – how many collective measures
--     are decided, and when the message was queued and sent.
--   * dispatch_claim: the new kind carries the page's link as the results notice does, and goes stale
--     like it if the page is hidden before it is sent, or after fourteen days.

create function public.tell_employees(p_round uuid) returns jsonb
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
  if not exists (select 1 from app.measures m
                 where m.round_id = p_round and m.kind = 'kollektivt' and m.step <> 'foreslatt') then
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

revoke all on function public.tell_employees(uuid) from public, anon;
grant execute on function public.tell_employees(uuid) to authenticated;

create function public.measures_notice(p_round uuid) returns jsonb
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
    'decided', (select count(*) from app.measures m
                where m.round_id = p_round and m.kind = 'kollektivt' and m.step <> 'foreslatt'),
    'queued_at', o.created_at,
    'sent_at', o.sent_at,
    'failed', o.failed_at is not null);
end $fn$;

revoke all on function public.measures_notice(uuid) from public, anon;
grant execute on function public.measures_notice(uuid) to authenticated;

-- ---------------------------------------------------------------- the claim
-- A change to the definition as it stands, in place (as 0176 did), so this composes with whatever
-- else has rewritten it; a definition that no longer holds the text stops the migration.
do $$
declare
  v_def text := pg_get_functiondef('public.dispatch_claim(integer)'::regprocedure);
  v_new text;
begin
  v_new := replace(v_def,
    $a$      when x.kind = 'resultat' and (r.status <> 'lukket' or x.due_at < now() - interval '14 days') then 'stale'$a$,
    $a$      when x.kind = 'resultat' and (r.status <> 'lukket' or x.due_at < now() - interval '14 days') then 'stale'
      -- 0212: «dette gjør vi» only while the page it points to is shown
      when x.kind = 'tiltak_status' and (r.status <> 'lukket' or x.due_at < now() - interval '14 days'
        or not exists (select 1 from app.rounds ro where ro.id = x.round_id and ro.results_page and app.results_published(ro.id))) then 'stale'$a$);
  if v_new = v_def then
    raise exception '0212: dispatch_claim no longer has the results notice''s stale rule';
  end if;
  v_def := v_new;
  v_new := replace(v_def,
    $a$        when x.kind = 'resultat' then ($a$,
    $a$        when x.kind in ('resultat', 'tiltak_status') then ($a$);
  if v_new = v_def then
    raise exception '0212: dispatch_claim no longer carries the results notice''s page';
  end if;
  execute v_new;
end $$;
