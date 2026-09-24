-- 0032_dispatch.sql — the outbox gets a sender.
--
-- Since 0020 the year wheel has queued notices in app.outbox and nothing has sent them
-- (D-29). The sender is an edge function, `orgpuls-dispatch`, that runs every five minutes
-- and delivers through Brevo. This migration is its half in the database: what may be sent,
-- to whom, with which link, and what happens when a send fails. D-65.
--
-- Four rules shape it.
--
-- 1. A LEASE, NOT A MARK. 0020's `mint_invitation_link` marked a row sent in the same
--    statement that minted its token — before anything had been delivered. A send that then
--    failed stranded that person: the row read "sent", and a second mint was refused. Here a
--    row is *claimed* (`claimed_at`, ten minutes), and only `dispatch_done` marks it sent,
--    once Brevo has accepted it. A claim that is never finished lapses and the row is taken
--    again. Delivery is at-least-once.
--
-- 2. THE LINK IS MINTED AT CLAIM, AND STORED NOWHERE. As in 0020, the plaintext leaves this
--    database in the claim's result and only its SHA-256 stays. A reminder, or a retry,
--    mints a new token, which replaces the previous one: the newest message's link is the
--    one that works, and the reminder says so. Keeping every earlier link alive would mean
--    several hashes per invitation, which is a change to the respondent write path and is
--    not made here.
--
-- 3. NOTHING STALE IS SENT. An invitation for a round that has closed, a reminder to
--    someone who has answered, a "starts in a fortnight" for a round already open, a result
--    notice weeks late: each is marked failed with its reason instead of sent.
--
-- 4. NOTHING IS SENT TO A FICTIONAL ADDRESS, AND AN ORGANISATION CAN BE SWITCHED OFF.
--    `mail_enabled` defaults to true, because e-mail is the product's channel. Organisations
--    whose every address is under a reserved test domain (RFC 2606) start switched off, and
--    those domains are refused per recipient besides. Mail sent to a domain that cannot
--    exist bounces, and bounces are what spoil a new sender domain's reputation.
--
-- The functions that hand out tokens and addresses are executable by service_role only:
-- the edge function holds that key, no client ever does.

-- ---------------------------------------------------------------------------
-- The switch, and the domains that are never real.
-- ---------------------------------------------------------------------------
create function app.reserved_address(p_email text)
  returns boolean
  language sql immutable parallel safe set search_path = ''
as $$
  select p_email is null
      or split_part(lower(btrim(p_email)), '@', 2) ~ '(^|\.)(example|test|invalid|localhost)$'
      or split_part(lower(btrim(p_email)), '@', 2) in ('example.com', 'example.net', 'example.org')
$$;

comment on function app.reserved_address(text) is
  'True for an address under a reserved test domain (RFC 2606) or none at all. The dispatcher never sends to one.';

alter table app.organizations
  add column mail_enabled boolean not null default true;

comment on column app.organizations.mail_enabled is
  'Whether the dispatcher sends this organisation''s queued notices. Default on; off for demo organisations.';

update app.organizations o
set mail_enabled = false
where exists (select 1 from app.employees e where e.org_id = o.id)
  and not exists (
    select 1 from app.employees e where e.org_id = o.id and not app.reserved_address(e.email)
  );

-- ---------------------------------------------------------------------------
-- The outbox's new states.
-- ---------------------------------------------------------------------------
alter table app.outbox
  add column claimed_at  timestamptz,
  add column failed_at   timestamptz,
  add column provider_id text check (length(provider_id) <= 200);

comment on column app.outbox.sent_at is
  'When the mail provider ACCEPTED the message. Not delivery: bounces are not reported back yet.';
comment on column app.outbox.claimed_at is
  'Set while a dispatcher holds the row. A claim older than ten minutes has lapsed.';
comment on column app.outbox.failed_at is
  'Set when the row will never be sent; last_error says why (stale, no address, five failed attempts).';

-- ---------------------------------------------------------------------------
-- Who a row is for.
-- ---------------------------------------------------------------------------
-- A row for one employee is for that employee. A row for an audience is for the members
-- holding that account role, and "alle ansatte" is the round's own scope — the rule 0020
-- uses to create its invitations. `member` says whether the person can sign in, which
-- decides whether a result notice may carry a link to the result.
--
-- The employees' statutory duties are NOT consulted. 0021 made the duty column a tripwire —
-- no policy and no routine may read it, so that a legal position can never turn into
-- access (settings_invariants 5) — and choosing a recipient is a routine reading it.
-- Relaxing that rule is the owner's decision, not this migration's. Until it is made, a
-- verneombud is reached through their account and a notice to "tillitsvalgte" finds no
-- one and fails as no_address, visibly, in the queue. D-65.
create function app.dispatch_recipients(p_outbox uuid)
  returns table (email text, name text, lang text, member boolean)
  language sql stable security definer set search_path = ''
as $$
  with x as (
    select * from app.outbox where id = p_outbox
  ),
  members as (
    select lower(u.email::text) as email, p.full_name as name, p.lang, m.role::text as role
    from x
    join app.memberships m on m.org_id = x.org_id and m.active
    join app.profiles p on p.id = m.user_id
    join auth.users u on u.id = m.user_id
  ),
  scope as (
    select e.* from x
    join app.rounds r on r.id = x.round_id
    join app.employees e on e.org_id = r.org_id and e.active
    where not exists (select 1 from app.round_groups rg where rg.round_id = r.id)
       or e.group_id in (select rg.group_id from app.round_groups rg where rg.round_id = r.id)
  ),
  picked as (
    select lower(e.email) as email, e.full_name as name, null::text as lang, false as member
    from x join app.employees e on e.id = x.employee_id
    union all
    select mb.email, mb.name, mb.lang, true from members mb, x
    where (x.audience = 'daglig_leder' and mb.role = 'daglig_leder')
       or (x.audience = 'avdelingsledere' and mb.role = 'avdelingsleder')
       or (x.audience = 'verneombud' and mb.role = 'verneombud')
    union all
    select lower(s.email), s.full_name, null, false from scope s, x
    where x.audience = 'alle_ansatte'
  )
  select distinct on (email) email, name, lang, member
  from picked
  where email is not null and btrim(email) <> ''
  order by email, member desc
$$;

revoke all on function app.dispatch_recipients(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Claim: the rows due now, each with its recipients and, for an invitation, a fresh link.
-- ---------------------------------------------------------------------------
create function public.dispatch_claim(p_batch int default 20)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_out   jsonb := '[]'::jsonb;
  x       record;
  r       record;
  v_why   text;
  v_rcpt  jsonb;
  v_key   text;
  v_pulse int;
begin
  for x in
    select o.*
    from app.outbox o
    join app.organizations org on org.id = o.org_id
    where o.sent_at is null
      and o.failed_at is null
      and o.due_at <= now()
      and (o.claimed_at is null or o.claimed_at < now() - interval '10 minutes')
      and org.mail_enabled
    order by o.due_at, o.id
    limit least(greatest(coalesce(p_batch, 20), 1), 100)
    for update of o skip locked
  loop
    select ro.status, ro.opens_at, ro.closes_at, ms.kind, ms.year,
           org.name as org_name, org.default_lang, app.k_threshold(ro.org_id) as k
    into r
    from app.rounds ro
    join app.measurements ms on ms.id = ro.measurement_id
    join app.organizations org on org.id = ro.org_id
    where ro.id = x.round_id;

    -- rule 3: what is no longer worth sending
    v_why := case
      when x.kind in ('invitasjon', 'paminnelse') and r.status <> 'apen' then 'round_not_open'
      when x.kind in ('invitasjon', 'paminnelse') and exists (
        select 1 from app.invitations i
        where i.id = x.invitation_id and (i.responded_at is not null or i.expires_at <= now())
      ) then 'answered_or_expired'
      when x.kind = 'forvarsel' and r.status <> 'planlagt' then 'round_already_open'
      when x.kind = 'resultat' and (r.status <> 'lukket' or x.due_at < now() - interval '14 days') then 'stale'
    end;

    -- rule 4: never a reserved address
    if v_why is null then
      select coalesce(jsonb_agg(jsonb_build_object(
               'email', d.email, 'name', d.name, 'lang', d.lang, 'member', d.member)), '[]'::jsonb)
      into v_rcpt
      from app.dispatch_recipients(x.id) d
      where not app.reserved_address(d.email);
      if jsonb_array_length(v_rcpt) = 0 then v_why := 'no_address'; end if;
    end if;

    if v_why is not null then
      update app.outbox set failed_at = now(), last_error = v_why, claimed_at = null where id = x.id;
      continue;
    end if;

    -- rule 2: the link, minted now and kept only as a hash
    v_key := null;
    if x.invitation_id is not null then
      v_key := encode(extensions.gen_random_bytes(32), 'hex');
      update app.invitations set token_hash = extensions.digest(v_key, 'sha256') where id = x.invitation_id;
    end if;

    -- the puls's number within its year, by the rule lib/rounds/read.ts numberPulses uses
    v_pulse := null;
    if r.kind = 'puls' and r.opens_at is not null then
      select count(*) into v_pulse
      from app.rounds r2 join app.measurements m2 on m2.id = r2.measurement_id
      where r2.org_id = x.org_id and m2.kind = 'puls' and m2.year = r.year
        and r2.opens_at is not null
        and (r2.opens_at < r.opens_at or (r2.opens_at = r.opens_at and r2.id <= x.round_id));
    end if;

    -- rule 1: a lease
    update app.outbox set claimed_at = now(), attempts = attempts + 1 where id = x.id;

    v_out := v_out || jsonb_build_object(
      'id', x.id,
      'kind', x.kind,
      'audience', x.audience,
      'lang', coalesce(r.default_lang, 'no'),
      'org', r.org_name,
      'k', r.k,
      'round', jsonb_build_object(
        'kind', r.kind, 'year', r.year, 'pulse', nullif(v_pulse, 0),
        'opens_at', r.opens_at, 'closes_at', r.closes_at),
      'recipients', v_rcpt,
      'token', v_key);
  end loop;

  return v_out;
end $fn$;

-- ---------------------------------------------------------------------------
-- Done: accepted, or failed. Release: not the message's fault, try again later.
-- ---------------------------------------------------------------------------
create function public.dispatch_done(
  p_id uuid, p_ok boolean, p_error text default null,
  p_permanent boolean default false, p_provider_id text default null)
  returns void
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if p_ok then
    update app.outbox
    set sent_at = now(), claimed_at = null, last_error = null, provider_id = left(p_provider_id, 200)
    where id = p_id and sent_at is null;

    update app.invitations i
    set sent_at = coalesce(i.sent_at, now())
    from app.outbox o
    where o.id = p_id and i.id = o.invitation_id;
  else
    update app.outbox
    set claimed_at = null,
        last_error = left(coalesce(p_error, 'failed'), 200),
        failed_at = case when p_permanent or attempts >= 5 then now() end
    where id = p_id and sent_at is null;
  end if;
end $fn$;

-- A provider outage or a rejected key is not a fault of the rows that met it: their claim
-- is dropped and the attempt it counted is given back, so a bad key cannot exhaust a queue.
create function public.dispatch_release(p_ids uuid[], p_error text default null)
  returns void
  language sql security definer set search_path = ''
as $$
  update app.outbox
  set claimed_at = null, attempts = greatest(attempts - 1, 0), last_error = left(p_error, 200)
  where id = any(p_ids) and sent_at is null;
$$;

revoke all on function public.dispatch_claim(int) from public, anon, authenticated;
revoke all on function public.dispatch_done(uuid, boolean, text, boolean, text) from public, anon, authenticated;
revoke all on function public.dispatch_release(uuid[], text) from public, anon, authenticated;
grant execute on function public.dispatch_claim(int) to service_role;
grant execute on function public.dispatch_done(uuid, boolean, text, boolean, text) to service_role;
grant execute on function public.dispatch_release(uuid[], text) to service_role;

-- ---------------------------------------------------------------------------
-- Every five minutes. Inert until Vault holds the function's URL and secret, which are set
-- on the hosted project only — so a local stack or CI never calls out.
-- ---------------------------------------------------------------------------
do $do$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net is unavailable here; the dispatch schedule stays inert';
end $do$;

select cron.schedule('orgpuls-dispatch', '*/5 * * * *', $job$
  select net.http_post(
           url := s.url,
           headers := jsonb_build_object('content-type', 'application/json', 'x-dispatch-secret', s.secret),
           body := '{}'::jsonb,
           timeout_milliseconds := 55000)
  from (select
          (select decrypted_secret from vault.decrypted_secrets where name = 'orgpuls_dispatch_url') as url,
          (select decrypted_secret from vault.decrypted_secrets where name = 'orgpuls_dispatch_secret') as secret) s
  where s.url is not null and s.secret is not null
$job$);
