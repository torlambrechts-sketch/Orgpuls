-- 0127 — «Send test til meg» and the ready-to-send check (D-126, D-171)
--
-- 1. A test of a round's invitation goes to the daglig leder's own address, never to anyone
--    else, at most five an hour. Its link opens the round's preview (/forhandsvis), which needs
--    a sign-in and writes nothing: a test carries no token, so it can answer nothing (D-34).
--    The dispatcher claims tests beside the outbox and renders them with the invitation's own
--    renderer, from the facts `round_send_preview` reads.
-- 2. `round_ready` gathers what a round needs before it opens: who in its audience the
--    invitation reaches and by which channel, the invited groups that cannot reach the
--    threshold, the two consultations, and the caller's last test. Counts and group names only.

-- ---------------------------------------------------------------- the invitation's facts, once
/*
 * round_send_preview's body, without the membership check, so the dispatcher (service role, no
 * auth.uid()) builds a test from the same facts the preview shows. Not callable by any client.
 */
create function app.round_preview_json(p_round uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  r       record;
  v_pulse int;
begin
  select ro.id, ro.org_id, ro.status, ro.opens_at, ro.closes_at, ro.intro_message, ro.results_publish_on,
         ms.kind, ms.year, o.name as org_name, coalesce(o.default_lang, 'no') as lang,
         coalesce(o.timezone, 'Europe/Oslo') as tz, o.invite_greeting,
         (select p.full_name from app.profiles p where p.id = ro.intro_by) as intro_by_name,
         (select p.full_name from app.profiles p where p.id = o.invite_greeting_by) as greeting_by
    into r
  from app.rounds ro
  join app.measurements ms on ms.id = ro.measurement_id
  join app.organizations o on o.id = ro.org_id
  where ro.id = p_round;
  if r.id is null then
    return null;
  end if;

  if r.kind = 'puls' and r.opens_at is not null then
    select count(*) into v_pulse
    from app.rounds r2 join app.measurements m2 on m2.id = r2.measurement_id
    where r2.org_id = r.org_id and m2.kind = 'puls' and m2.year = r.year and r2.opens_at is not null
      and (r2.opens_at < r.opens_at or (r2.opens_at = r.opens_at and r2.id <= r.id));
  end if;

  return jsonb_build_object(
    'org', r.org_name,
    'lang', r.lang,
    'k', app.k_threshold(r.org_id),
    'status', r.status,
    'round', jsonb_build_object('kind', r.kind, 'year', r.year, 'pulse', nullif(v_pulse, 0),
                                'opens_at', r.opens_at, 'closes_at', r.closes_at),
    'close_on', (r.closes_at at time zone r.tz)::date,
    'publish_on', r.results_publish_on,
    'intro', r.intro_message,
    'intro_by', r.intro_by_name,
    'org_greeting', case when r.invite_greeting is not null then
      jsonb_build_object('text', r.invite_greeting, 'by', r.greeting_by) end,
    'minutes', app.round_minutes(r.id),
    'results_shared', exists (
      select 1 from app.year_wheels yw join app.wheel_notifications wn on wn.wheel_id = yw.id
      where yw.org_id = r.org_id and wn.audience = 'alle_ansatte'),
    'since', app.since_last(r.id),
    'logo', app.logo_key(r.org_id),
    'results_page', (
      select ro.share_slug from app.rounds ro
      where ro.org_id = r.org_id and ro.id <> r.id and ro.status = 'lukket' and ro.results_page
        and app.results_published(ro.id)
      order by ro.closes_at desc nulls last limit 1));
end $fn$;
revoke all on function app.round_preview_json(uuid) from public, anon, authenticated;

create or replace function public.round_send_preview(p_round uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_org uuid;
begin
  select ro.org_id into v_org from app.rounds ro where ro.id = p_round;
  if v_org is null or not app.is_org_member(v_org) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  return app.round_preview_json(p_round);
end $fn$;

-- ---------------------------------------------------------------- 1: the tests
create table app.send_tests (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references app.organizations (id) on delete cascade,
  round_id   uuid not null references app.rounds (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  to_email   text not null check (to_email ~ '^[^@\s]+@[^@\s]+$'),
  status     text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  error      text check (error is null or error ~ '^[a-z_]{1,40}$'),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at    timestamptz
);
comment on table app.send_tests is
  'A test of a round''s invitation to the daglig leder''s own address (0127). No token: its link opens the preview.';
create index send_tests_round_user on app.send_tests (round_id, user_id, created_at desc);
create index send_tests_user on app.send_tests (user_id, created_at desc);
create index send_tests_org on app.send_tests (org_id);
create index send_tests_pending on app.send_tests (created_at) where status in ('pending', 'sending');
-- read and written only through the functions below
alter table app.send_tests enable row level security;
revoke all on app.send_tests from public, anon, authenticated;

create function public.send_test_invitation(p_round uuid) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  r       record;
  v_email text;
begin
  select ro.id, ro.org_id, ro.status, o.mail_enabled into r
  from app.rounds ro join app.organizations o on o.id = ro.org_id where ro.id = p_round;
  if r.id is null or not app.has_role(r.org_id, array['daglig_leder']::app.org_role[]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if r.status = 'lukket' then return jsonb_build_object('error', 'closed'); end if;
  if not r.mail_enabled then return jsonb_build_object('error', 'mail_off'); end if;
  select lower(u.email) into v_email from auth.users u where u.id = auth.uid();
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+$' then
    return jsonb_build_object('error', 'no_address');
  end if;
  if (select count(*) from app.send_tests t
      where t.user_id = auth.uid() and t.created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('error', 'rate_limited');
  end if;
  insert into app.send_tests (org_id, round_id, user_id, to_email)
  values (r.org_id, p_round, auth.uid(), v_email);
  return jsonb_build_object('ok', true, 'to', v_email);
end $fn$;
revoke all on function public.send_test_invitation(uuid) from public, anon;
grant execute on function public.send_test_invitation(uuid) to authenticated;

/*
 * The dispatcher's claim: tests waiting (or claimed more than ten minutes ago and never finished),
 * each with the invitation's facts and the name the test is addressed to. Service role only.
 */
create function public.dispatch_test_claim(p_batch int default 10) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_out jsonb;
begin
  with picked as (
    select t.id from app.send_tests t
    where t.status = 'pending' or (t.status = 'sending' and t.claimed_at < now() - interval '10 minutes')
    order by t.created_at
    limit greatest(1, least(coalesce(p_batch, 10), 50))
    for update skip locked
  ), claimed as (
    update app.send_tests t set status = 'sending', claimed_at = now()
    from picked where t.id = picked.id
    returning t.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'round_id', c.round_id,
           'to', c.to_email,
           'name', (select p.full_name from app.profiles p where p.id = c.user_id),
           'preview', app.round_preview_json(c.round_id))), '[]'::jsonb)
    into v_out
  from claimed c;
  return v_out;
end $fn$;
revoke all on function public.dispatch_test_claim(int) from public, anon, authenticated;
grant execute on function public.dispatch_test_claim(int) to service_role;

create function public.dispatch_test_done(p_id uuid, p_ok boolean, p_error text default null) returns void
  language sql volatile security definer set search_path = ''
as $fn$
  update app.send_tests
     set status = case when p_ok then 'sent' else 'failed' end,
         sent_at = case when p_ok then now() end,
         error = case when p_ok then null else coalesce(substring(lower(p_error) from '^[a-z_]{1,40}'), 'failed') end
   where id = p_id and status = 'sending';
$fn$;
revoke all on function public.dispatch_test_done(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.dispatch_test_done(uuid, boolean, text) to service_role;

-- ---------------------------------------------------------------- 2: ready to send
/*
 * What a round needs before it opens, for Måleoppsett's send card. The audience is the one the
 * opening mints invitations for (0108): active employees, in the round's groups where it names
 * any. Counts and group names only, never whose address; the daglig leder's.
 */
create function public.round_ready(p_round uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  r   record;
  v_k int;
  v   record;
begin
  select ro.id, ro.org_id, ro.status, o.sms_enabled, o.mail_enabled into r
  from app.rounds ro join app.organizations o on o.id = ro.org_id where ro.id = p_round;
  if r.id is null or not app.has_role(r.org_id, array['daglig_leder']::app.org_role[]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_k := app.k_threshold(r.org_id);

  select count(*) as total,
         count(*) filter (where e.email is not null) as email,
         count(*) filter (where e.email is null and e.phone is not null) as phone_only,
         count(*) filter (where e.email is null and e.phone is null) as neither
    into v
  from app.employees e
  where e.org_id = r.org_id and e.active
    and (not exists (select 1 from app.round_groups rg where rg.round_id = p_round)
         or e.group_id in (select rg.group_id from app.round_groups rg where rg.round_id = p_round));

  return jsonb_build_object(
    'status', r.status,
    'mail', r.mail_enabled,
    'sms', r.sms_enabled,
    'k', v_k,
    'audience', v.total,
    'email', v.email,
    'phone_only', v.phone_only,
    'neither', v.neither,
    -- an invited group with fewer active employees than the threshold can never show a figure
    'small_groups', coalesce((
      select jsonb_agg(g.name order by g.name)
      from app.groups g
      where g.org_id = r.org_id
        and (not exists (select 1 from app.round_groups rg where rg.round_id = p_round)
             or g.id in (select rg.group_id from app.round_groups rg where rg.round_id = p_round))
        and (select count(*) from app.employees e where e.group_id = g.id and e.active) between 1 and v_k - 1
    ), '[]'::jsonb),
    'consultations', jsonb_build_object(
      'verneombud_raad', exists (select 1 from app.round_consultations c
                                 where c.round_id = p_round and c.kind = 'verneombud_raad' and c.confirmed),
      'droftet_tillitsvalgte', exists (select 1 from app.round_consultations c
                                       where c.round_id = p_round and c.kind = 'droftet_tillitsvalgte' and c.confirmed)),
    'test', (
      select jsonb_build_object('to', t.to_email, 'status', t.status, 'at', t.created_at, 'sent_at', t.sent_at)
      from app.send_tests t where t.round_id = p_round and t.user_id = auth.uid()
      order by t.created_at desc limit 1));
end $fn$;
revoke all on function public.round_ready(uuid) from public, anon;
grant execute on function public.round_ready(uuid) to authenticated;

-- a demo copy takes no tests: they are one person's, and a sandbox sends no mail
insert into app.demo_copy_plan (table_name, step, mode, via, note)
values ('send_tests', null, 'skip', null, 'one leader''s test sends; a sandbox sends no mail');
