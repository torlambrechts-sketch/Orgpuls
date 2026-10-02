-- 0185 — Slack as a channel for a person's survey link (D-205).
--
-- The dispatcher sends an invitation or a reminder by e-mail (0032) or SMS (0033) — and, where
-- 0176 is applied, Teams. Since this migration it can also send it as a direct message from the
-- Orgpuls bot in the organisation's own Slack workspace: one short, already translated text (the
-- lead the SMS carries) and the person's own link as a plain link, with unfurling off, no blocks,
-- no buttons, no tracking (supabase/functions/_shared/slack.ts).
--
-- What is stored, and where:
--   * organizations.slack_enabled / slack_when: on or off, and when Slack carries the link —
--     paaminn: the reminders; alle: every invitation and reminder. Off by default. There is no
--     «mangler» (those without e-mail) as SMS and Teams have: a person is found in Slack by their
--     work e-mail, so everybody Slack can reach has one. Slack cannot be turned on without a
--     working installation (slack_enabled_needs_install).
--   * rounds.slack_when: one round's rule; null follows the organisation's. Fixed once the round
--     has opened, as every other round setting (0076).
--   * app.slack_installs: the organisation's one installation — the workspace, the bot user, and
--     the bot's tokens. The tokens are not in this table: they are Supabase Vault secrets, and the
--     row holds their ids. RLS on, no policy, no grant: no client role can read the row, and
--     vault.decrypted_secrets is not granted to any client role. Only the service role's
--     functions below hand a token out, to the dispatcher.
--   * app.slack_members: the Slack member id of an employee, keyed by the employee — the register's
--     side of the product, like teams_conversations and address_problems. RLS on, no policy, no
--     grant. Made by matching work e-mail against the workspace's own members (slack_sync_apply),
--     at setup and on each sync, never per message. Nothing on invitations, responses or any answer
--     table names a Slack identity, and no key links this table to them.
--   * app.slack_install_log: who connected and disconnected, and when the installation stopped
--     working. The daglig leder reads it.
--   * app.slack_connect_nonces: the OAuth `state`, single use, stored as its SHA-256, 15 minutes,
--     bound to the organisation, the daglig leder and the session (the pattern of 0155).
--   * app.slack_revocations: tokens waiting for the dispatcher to call auth.revoke on them, after a
--     disconnect or a deleted organisation; their Vault secrets are deleted when it has.
--
-- The channel rule (dispatch_claim), for an invitation or a reminder:
--   Slack  when the organisation has Slack on and a working installation, the person a Slack match,
--          and the rule says so (alle; paaminn for a reminder);
--   else   the rule before this migration, unchanged (Teams where 0176 chose it comes first).
-- A link somebody asked for («lenke») goes by the channel they typed into, never Slack; a notice to
-- a role stays e-mail. The recipient row keeps the e-mail (and the number where SMS may carry it),
-- so the dispatcher falls back to it in the same run when Slack refuses — as SMS does.
--
-- dispatch_done records 'slack'. The outbox channel check gains 'slack' beside whatever it allows
-- now (so this composes with 0176's 'teams').
--
-- Anonymity: the claim hands the dispatcher the member id it needs to address one message and
-- nothing else; nothing is kept per message (no message timestamp: the message is never edited or
-- deleted, and nothing reacts to responded_at); no read receipt, no click is recorded. The app has
-- no Events API subscription and no interactivity endpoint, so nothing a person types to it is
-- ever received. Matching sends the dispatcher's list of workspace members to the database as
-- SHA-256 digests of their addresses, never the addresses.

-- ---------------------------------------------------------------- settings
alter table app.organizations
  add column slack_enabled boolean not null default false,
  add column slack_when text not null default 'alle' check (slack_when in ('paaminn', 'alle'));

comment on column app.organizations.slack_enabled is
  'Whether survey links may go as a Slack direct message from the Orgpuls bot (0185). Needs a working installation.';
comment on column app.organizations.slack_when is
  'paaminn: reminders only; alle: every invitation and reminder to people matched in Slack (0185).';

alter table app.rounds
  add column slack_when text check (slack_when in ('paaminn', 'alle'));

comment on column app.rounds.slack_when is
  'This round''s Slack rule; null follows the organisation''s (organizations.slack_when).';

grant update (slack_when) on app.rounds to authenticated;

-- fixed once open, as the round's other settings (0076 round_settings_fixed)
create function app.round_slack_when_fixed() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if current_user in ('authenticated', 'anon') and old.status <> 'planlagt'
     and new.slack_when is distinct from old.slack_when then
    raise exception 'a round''s settings are fixed once it has opened' using errcode = 'restrict_violation';
  end if;
  return new;
end $fn$;

create trigger round_slack_when_fixed before update of slack_when on app.rounds
  for each row execute function app.round_slack_when_fixed();

-- ---------------------------------------------------------------- the channel, everywhere it is named
-- the allowed channels as they stand, plus 'slack': composes with 0176's 'teams' either way round
do $$
declare
  v_vals text[];
begin
  select array_agg(distinct m[1] order by m[1]) into v_vals
  from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z]+)''', 'g') m
  where c.conname = 'outbox_channel_check' and c.conrelid = 'app.outbox'::regclass;
  if v_vals is null or not ('email' = any (v_vals) and 'sms' = any (v_vals)) then
    raise exception '0185: app.outbox.outbox_channel_check is not what this migration expects; write it by hand';
  end if;
  if not 'slack' = any (v_vals) then v_vals := v_vals || 'slack'::text; end if;
  alter table app.outbox drop constraint outbox_channel_check;
  execute format('alter table app.outbox add constraint outbox_channel_check check (channel in (%s))',
                 (select string_agg(quote_literal(v), ', ') from unnest(v_vals) v));
end $$;

-- ---------------------------------------------------------------- the installation
create table app.slack_installs (
  org_id            uuid primary key references app.organizations (id) on delete cascade,
  team_id           text not null unique check (team_id ~ '^T[A-Z0-9]{2,20}$'),
  team_name         text check (char_length(team_name) between 1 and 200),
  -- set when the workspace belongs to an Enterprise Grid organisation (a workspace install in it)
  enterprise_id     text check (enterprise_id ~ '^E[A-Z0-9]{2,20}$'),
  bot_user_id       text not null check (bot_user_id ~ '^[UW][A-Z0-9]{2,20}$'),
  -- Vault secret ids; the tokens themselves are never in a table a client can read
  access_secret     uuid not null,
  refresh_secret    uuid,
  -- when the access token expires (token rotation); null for a token that does not
  expires_at        timestamptz,
  -- a refresh is under way: a refresh token works once, so only one runner may redeem it
  refreshing_at     timestamptz,
  installed_by      uuid references auth.users (id) on delete set null,
  installed_at      timestamptz not null default now(),
  status            text not null default 'active' check (status in ('active', 'broken')),
  broken_reason     text check (broken_reason ~ '^[a-z_]{1,60}$'),
  broken_at         timestamptz,
  sync_requested_at timestamptz,
  sync_started_at   timestamptz,
  synced_at         timestamptz,
  -- how many members of the workspace could be matched at all (people, not guests, bots or strangers)
  sync_members      int check (sync_members >= 0),
  sync_error        text check (sync_error ~ '^[a-z0-9_]{1,60}$')
);
alter table app.slack_installs enable row level security;
revoke all on app.slack_installs from public, anon, authenticated;

comment on table app.slack_installs is
  'The Orgpuls Slack app''s installation in an organisation''s workspace (0185). Tokens in Vault; no client access.';

-- ---------------------------------------------------------------- the person, in the register
create table app.slack_members (
  employee_id   uuid primary key references app.employees (id) on delete cascade,
  org_id        uuid not null references app.organizations (id) on delete cascade,
  slack_user_id text not null check (slack_user_id ~ '^[UW][A-Z0-9]{2,20}$'),
  unique (org_id, slack_user_id)
);
alter table app.slack_members enable row level security;
revoke all on app.slack_members from public, anon, authenticated;

comment on table app.slack_members is
  'An employee''s Slack member id in the organisation''s workspace, matched by work e-mail (0185). Register side; no client access.';

-- ---------------------------------------------------------------- who connected and disconnected
-- `_log`, not `_events`: a table named `*_events` is in the growth firewall's scope (0141).
create table app.slack_install_log (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references app.organizations (id) on delete cascade,
  team_id     text not null,
  event       text not null check (event in ('connected', 'disconnected', 'broken')),
  reason      text check (reason ~ '^[a-z_]{1,60}$'),
  actor       uuid references auth.users (id) on delete set null,
  happened_at timestamptz not null default now()
);
create index slack_install_log_org_idx on app.slack_install_log (org_id, happened_at desc);
alter table app.slack_install_log enable row level security;
create policy slack_install_log_read on app.slack_install_log
  for select to authenticated using (app.has_role(org_id, array['daglig_leder']::app.org_role[]));
revoke all on app.slack_install_log from public, anon, authenticated;
grant select on app.slack_install_log to authenticated;

-- ---------------------------------------------------------------- the OAuth state (no client policy)
create table app.slack_connect_nonces (
  nonce_sha256 text primary key check (nonce_sha256 ~ '^[0-9a-f]{64}$'),
  org_id       uuid not null references app.organizations (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  session_id   uuid,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  used_at      timestamptz
);
alter table app.slack_connect_nonces enable row level security;
revoke all on app.slack_connect_nonces from public, anon, authenticated;

-- ---------------------------------------------------------------- tokens to revoke (no client policy)
-- No key to the organisation: a deleted organisation's tokens must still be revoked.
create table app.slack_revocations (
  id             bigint generated always as identity primary key,
  access_secret  uuid not null,
  refresh_secret uuid,
  queued_at      timestamptz not null default now(),
  claimed_at     timestamptz,
  attempts       int not null default 0
);
alter table app.slack_revocations enable row level security;
revoke all on app.slack_revocations from public, anon, authenticated;

insert into app.demo_copy_plan (table_name, step, mode, via, note) values
  ('slack_installs', null, 'skip', null, 'a Slack installation belongs to the real organisation (0185)'),
  ('slack_members', null, 'skip', null, 'a person''s Slack member id is that person''s, not the demo''s (0185)'),
  ('slack_install_log', null, 'skip', null, 'the installation''s history belongs to the real organisation (0185)'),
  ('slack_connect_nonces', null, 'skip', null, 'single-use OAuth state (0185)'),
  ('slack_revocations', null, 'skip', null, 'tokens waiting to be revoked (0185)');

-- ---------------------------------------------------------------- helpers (no client may call them)

/* The decrypted value of one Vault secret, or null. */
create function app.slack_secret(p_id uuid) returns text
  language sql stable security definer set search_path = ''
as $fn$
  select s.decrypted_secret from vault.decrypted_secrets s where s.id = p_id
$fn$;
revoke all on function app.slack_secret(uuid) from public, anon, authenticated;

/*
 * Ask the dispatcher to run now (a sync or a revocation is waiting), as 0143 asks for a poll: its
 * URL and secret from the Vault, which only the hosted project holds, so a local stack or CI never
 * calls out. Best effort: the five-minute schedule picks up whatever this does not.
 */
create function app.slack_kick() returns boolean
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_url    text := (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'orgpuls_dispatch_url');
  v_secret text := (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'orgpuls_dispatch_secret');
begin
  if v_url is null or v_secret is null then return false; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-dispatch-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000);
  return true;
exception when others then
  return false;
end $fn$;
revoke all on function app.slack_kick() from public, anon, authenticated;

-- an installation removed — disconnected, or its organisation deleted: its tokens wait for
-- auth.revoke, nobody stays matched, and Slack is off, so no screen says it is on while nothing
-- can be sent
create function app.slack_install_removed() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  insert into app.slack_revocations (access_secret, refresh_secret) values (old.access_secret, old.refresh_secret);
  delete from app.slack_members where org_id = old.org_id;
  update app.organizations set slack_enabled = false where id = old.org_id and slack_enabled;
  return null;
end $fn$;

create trigger slack_installs_removed after delete on app.slack_installs
  for each row execute function app.slack_install_removed();

-- Slack cannot be switched on without a working installation (definer: the daglig leder who
-- switches it may not read the installation, which no client role can)
create function app.slack_enabled_needs_install() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if new.slack_enabled and not old.slack_enabled
     and not exists (select 1 from app.slack_installs si where si.org_id = new.id and si.status = 'active') then
    raise exception 'Slack is not connected for this organisation' using errcode = 'check_violation';
  end if;
  return new;
end $fn$;

create trigger organizations_slack_needs_install before update of slack_enabled on app.organizations
  for each row execute function app.slack_enabled_needs_install();

-- a new address is a new match: the old one was made by the old address
create function app.employee_slack_email_changed() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if lower(btrim(coalesce(new.email, ''))) is distinct from lower(btrim(coalesce(old.email, ''))) then
    delete from app.slack_members where employee_id = new.id;
  end if;
  return new;
end $fn$;

create trigger employees_slack_email_changed after update of email on app.employees
  for each row execute function app.employee_slack_email_changed();

-- ---------------------------------------------------------------- connecting (the daglig leder)

create function public.slack_connect_start(p_org uuid) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_nonce text;
begin
  if not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if app.is_demo(p_org) then
    return jsonb_build_object('ok', false, 'error', 'demo');
  end if;
  -- one outstanding nonce per person and organisation; spent and stale ones go
  delete from app.slack_connect_nonces n
  where (n.org_id = p_org and n.user_id = auth.uid()) or n.expires_at < now() - interval '1 day';

  v_nonce := encode(extensions.gen_random_bytes(32), 'hex');
  insert into app.slack_connect_nonces (nonce_sha256, org_id, user_id, session_id, expires_at)
  values (encode(extensions.digest(v_nonce, 'sha256'), 'hex'), p_org, auth.uid(), app.jwt_session_id(),
          now() + interval '15 minutes');
  -- the plaintext leaves once, as the authorisation request's state; only its digest is kept
  return jsonb_build_object('ok', true, 'nonce', v_nonce);
end $fn$;
revoke all on function public.slack_connect_start(uuid) from public, anon;
grant execute on function public.slack_connect_start(uuid) to authenticated;

/*
 * Slack's answer, as the callback received and exchanged it: the state, and the installation from
 * oauth.v2.access (null when Slack answered with an error). The nonce is spent on the first call
 * whatever the outcome. On a refusal `revoke` tells the caller whether to revoke the token it holds:
 * never when the workspace is another organisation's, whose installation the same bot may serve.
 */
create function public.slack_connect_complete(p_state text, p_install jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_n       app.slack_connect_nonces%rowtype;
  v_old     app.slack_installs%rowtype;
  v_team    text := p_install ->> 'team_id';
  v_ent     text := nullif(p_install ->> 'enterprise_id', '');
  v_bot     text := p_install ->> 'bot_user_id';
  v_access  text := p_install ->> 'access_token';
  v_refresh text := nullif(p_install ->> 'refresh_token', '');
  v_expires int;
  v_scopes  text[] := string_to_array(coalesce(p_install ->> 'scope', ''), ',');
  v_a       uuid;
  v_r       uuid;
  refuse    constant text := '{"ok": false, "revoke": true}';
begin
  if auth.uid() is null then return refuse::jsonb || '{"error": "not_signed_in"}'; end if;
  if coalesce(p_state, '') !~ '^[0-9a-f]{64}$' then return refuse::jsonb || '{"error": "nonce_invalid"}'; end if;

  select * into v_n from app.slack_connect_nonces n
  where n.nonce_sha256 = encode(extensions.digest(p_state, 'sha256'), 'hex') and n.user_id = auth.uid()
  for update;
  if not found then return refuse::jsonb || '{"error": "nonce_invalid"}'; end if;
  if v_n.used_at is not null then return refuse::jsonb || '{"error": "nonce_used"}'; end if;
  if v_n.expires_at < now() then return refuse::jsonb || '{"error": "nonce_expired"}'; end if;
  update app.slack_connect_nonces set used_at = now() where nonce_sha256 = v_n.nonce_sha256;

  if v_n.session_id is distinct from app.jwt_session_id() then
    return refuse::jsonb || '{"error": "nonce_invalid"}';
  end if;
  if not app.has_role(v_n.org_id, array['daglig_leder']::app.org_role[]) then
    return refuse::jsonb || '{"error": "not_allowed"}';
  end if;
  if app.is_demo(v_n.org_id) then return refuse::jsonb || '{"error": "demo"}'; end if;
  if p_install is null then return jsonb_build_object('ok', false, 'revoke', false, 'error', 'consent_refused'); end if;

  -- an org-wide (Enterprise Grid) installation is not offered: one workspace per organisation
  if coalesce((p_install ->> 'is_enterprise_install')::boolean, false) then
    return refuse::jsonb || '{"error": "enterprise_install"}';
  end if;
  if (p_install ->> 'expires_in') ~ '^\d{1,7}$' then v_expires := (p_install ->> 'expires_in')::int; end if;
  if coalesce(p_install ->> 'token_type', '') <> 'bot'
     or coalesce(v_team, '') !~ '^T[A-Z0-9]{2,20}$'
     or (v_ent is not null and v_ent !~ '^E[A-Z0-9]{2,20}$')
     or coalesce(v_bot, '') !~ '^[UW][A-Z0-9]{2,20}$'
     or coalesce(v_access, '') !~ '^(xoxe\.)?xoxb-[A-Za-z0-9-]{10,250}$'
     or (v_refresh is not null and v_refresh !~ '^xoxe-[A-Za-z0-9-]{10,250}$')
     or (v_refresh is null) <> (v_expires is null)
     or (v_expires is not null and v_expires not between 60 and 604800)
     or char_length(coalesce(p_install ->> 'team_name', '')) > 200
     or not (array['chat:write', 'im:write', 'users:read', 'users:read.email'] <@ v_scopes) then
    return refuse::jsonb || '{"error": "invalid_install"}';
  end if;
  -- one organisation per workspace
  if exists (select 1 from app.slack_installs si where si.team_id = v_team and si.org_id <> v_n.org_id) then
    return jsonb_build_object('ok', false, 'revoke', false, 'error', 'team_taken');
  end if;

  v_a := vault.create_secret(v_access, null, 'Slack bot token (0185)');
  if v_refresh is not null then v_r := vault.create_secret(v_refresh, null, 'Slack refresh token (0185)'); end if;

  select * into v_old from app.slack_installs si where si.org_id = v_n.org_id for update;
  if found then
    -- connecting again: the same workspace keeps its matches and its old secrets simply go (its
    -- bot is the one just installed again); another workspace's tokens are revoked
    if v_old.team_id = v_team then
      delete from vault.secrets where id = v_old.access_secret or id = v_old.refresh_secret;
    else
      insert into app.slack_revocations (access_secret, refresh_secret) values (v_old.access_secret, v_old.refresh_secret);
      delete from app.slack_members where org_id = v_n.org_id;
    end if;
    update app.slack_installs set
      team_id = v_team, team_name = nullif(p_install ->> 'team_name', ''), enterprise_id = v_ent,
      bot_user_id = v_bot, access_secret = v_a, refresh_secret = v_r,
      expires_at = case when v_expires is not null then now() + make_interval(secs => v_expires) end,
      refreshing_at = null, installed_by = auth.uid(), installed_at = now(),
      status = 'active', broken_reason = null, broken_at = null,
      sync_requested_at = now(), sync_started_at = null, sync_error = null,
      synced_at = case when v_old.team_id = v_team then v_old.synced_at end,
      sync_members = case when v_old.team_id = v_team then v_old.sync_members end
    where org_id = v_n.org_id;
  else
    begin
      insert into app.slack_installs (org_id, team_id, team_name, enterprise_id, bot_user_id, access_secret,
                                      refresh_secret, expires_at, installed_by, sync_requested_at)
      values (v_n.org_id, v_team, nullif(p_install ->> 'team_name', ''), v_ent, v_bot, v_a, v_r,
              case when v_expires is not null then now() + make_interval(secs => v_expires) end, auth.uid(), now());
    exception when unique_violation then
      delete from vault.secrets where id = v_a or id = v_r;
      return jsonb_build_object('ok', false, 'revoke', false, 'error', 'team_taken');
    end;
  end if;

  insert into app.slack_install_log (org_id, team_id, event, actor) values (v_n.org_id, v_team, 'connected', auth.uid());
  perform app.slack_kick();
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.slack_connect_complete(text, jsonb) from public, anon;
grant execute on function public.slack_connect_complete(text, jsonb) to authenticated;

create function public.slack_disconnect(p_org uuid) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_team text;
begin
  if not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  -- the trigger queues the tokens for auth.revoke, forgets every match and turns Slack off
  delete from app.slack_installs si where si.org_id = p_org returning si.team_id into v_team;
  if v_team is null then return jsonb_build_object('ok', false, 'error', 'not_connected'); end if;
  insert into app.slack_install_log (org_id, team_id, event, actor) values (p_org, v_team, 'disconnected', auth.uid());
  perform app.slack_kick();
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.slack_disconnect(uuid) from public, anon;
grant execute on function public.slack_disconnect(uuid) to authenticated;

-- «Synkroniser nå»: the next dispatcher run matches again
create function public.slack_request_sync(p_org uuid) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
begin
  if not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  update app.slack_installs set sync_requested_at = now() where org_id = p_org and status = 'active';
  if not found then return jsonb_build_object('ok', false, 'error', 'not_connected'); end if;
  perform app.slack_kick();
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.slack_request_sync(uuid) from public, anon;
grant execute on function public.slack_request_sync(uuid) to authenticated;

-- ---------------------------------------------------------------- what the screens show
-- Every member learns whether Slack is connected and to which workspace; the counts and the
-- history are the daglig leder's. Counts, never names.
create function public.slack_status(p_org uuid) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_i    app.slack_installs%rowtype;
  v_dl   boolean := app.has_role(p_org, array['daglig_leder']::app.org_role[]);
  v_last jsonb;
  v_cnt  jsonb;
begin
  if not app.is_org_member(p_org) then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  select * into v_i from app.slack_installs si where si.org_id = p_org;
  if v_dl then
    select jsonb_build_object('event', e.event, 'reason', e.reason, 'happened_at', e.happened_at) into v_last
    from app.slack_install_log e where e.org_id = p_org order by e.happened_at desc, e.id desc limit 1;
    v_cnt := jsonb_build_object(
      'active', (select count(*) from app.employees e where e.org_id = p_org and e.active),
      'with_email', (select count(*) from app.employees e
                     where e.org_id = p_org and e.active and nullif(btrim(e.email), '') is not null),
      'matched', (select count(*) from app.slack_members sm join app.employees e on e.id = sm.employee_id and e.active
                  where sm.org_id = p_org),
      'sent_30d', (select count(*) from app.outbox o
                   where o.org_id = p_org and o.channel = 'slack' and o.sent_at > now() - interval '30 days'));
  end if;
  return jsonb_build_object(
    'ok', true,
    'connected', v_i.org_id is not null,
    'working', v_i.status = 'active',
    'team_name', v_i.team_name,
    'grid', v_i.enterprise_id is not null,
    'installed_at', v_i.installed_at,
    'installed_by', case when v_dl then (select p.full_name from app.profiles p where p.id = v_i.installed_by) end,
    'broken_reason', v_i.broken_reason,
    'broken_at', v_i.broken_at,
    'synced_at', v_i.synced_at,
    'sync_requested_at', v_i.sync_requested_at,
    'sync_members', case when v_dl then v_i.sync_members end,
    'sync_error', v_i.sync_error,
    'daglig_leder', v_dl,
    'counts', v_cnt,
    'last_event', v_last);
end $fn$;
revoke all on function public.slack_status(uuid) from public, anon;
grant execute on function public.slack_status(uuid) to authenticated;

-- ---------------------------------------------------------------- the dispatcher's (service role)

/*
 * The organisation's bot token, for one run. When it expires within half an hour and nobody else is
 * refreshing it, the refresh token comes with it and the caller holds the lease: it must report
 * back with slack_token_store or slack_install_broken.
 */
create function public.slack_token(p_org uuid) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_i app.slack_installs%rowtype;
begin
  select * into v_i from app.slack_installs si where si.org_id = p_org for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_connected'); end if;
  if v_i.status <> 'active' then return jsonb_build_object('ok', false, 'error', 'broken'); end if;
  if v_i.refresh_secret is not null and v_i.expires_at < now() + interval '30 minutes'
     and (v_i.refreshing_at is null or v_i.refreshing_at < now() - interval '2 minutes') then
    update app.slack_installs set refreshing_at = now() where org_id = p_org;
    return jsonb_build_object('ok', true, 'token', app.slack_secret(v_i.access_secret),
                              'expires_at', v_i.expires_at, 'refresh_token', app.slack_secret(v_i.refresh_secret));
  end if;
  return jsonb_build_object('ok', true, 'token', app.slack_secret(v_i.access_secret), 'expires_at', v_i.expires_at);
end $fn$;

/* A refreshed pair: both secrets replaced, the lease released */
create function public.slack_token_store(p_org uuid, p_access text, p_refresh text, p_expires_in int) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_i app.slack_installs%rowtype;
begin
  if coalesce(p_access, '') !~ '^(xoxe\.)?xoxb-[A-Za-z0-9-]{10,250}$'
     or coalesce(p_refresh, '') !~ '^xoxe-[A-Za-z0-9-]{10,250}$'
     or coalesce(p_expires_in, 0) not between 60 and 604800 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into v_i from app.slack_installs si where si.org_id = p_org for update;
  if not found or v_i.refresh_secret is null then return jsonb_build_object('ok', false, 'error', 'not_connected'); end if;
  perform vault.update_secret(v_i.access_secret, p_access);
  perform vault.update_secret(v_i.refresh_secret, p_refresh);
  update app.slack_installs
  set expires_at = now() + make_interval(secs => p_expires_in), refreshing_at = null
  where org_id = p_org;
  return jsonb_build_object('ok', true);
end $fn$;

/*
 * Slack refused the installation itself — the app removed, the token revoked, the workspace gone:
 * nothing more goes by Slack until a daglig leder connects again. A transient failure is not
 * reported here: the caller passes null and the refresh lease is released.
 */
create function public.slack_install_broken(p_org uuid, p_reason text) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_team text;
begin
  if p_reason is null then
    update app.slack_installs set refreshing_at = null where org_id = p_org;
    return jsonb_build_object('ok', true);
  end if;
  if p_reason !~ '^[a-z_]{1,60}$' then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  update app.slack_installs
  set status = 'broken', broken_reason = p_reason, broken_at = now(), refreshing_at = null, sync_started_at = null
  where org_id = p_org and status = 'active'
  returning team_id into v_team;
  if v_team is not null then
    insert into app.slack_install_log (org_id, team_id, event, reason) values (p_org, v_team, 'broken', p_reason);
  end if;
  return jsonb_build_object('ok', true);
end $fn$;

/* Installations whose members are to be matched now: asked for, or not matched for 20 hours */
create function public.slack_sync_due(p_limit int default 5) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_out jsonb;
begin
  with due as (
    select si.org_id from app.slack_installs si
    where si.status = 'active'
      and (si.sync_requested_at is not null or si.synced_at is null or si.synced_at < now() - interval '20 hours')
      and (si.sync_started_at is null or si.sync_started_at < now() - interval '10 minutes')
    order by si.sync_requested_at nulls last, si.synced_at nulls first
    limit least(greatest(coalesce(p_limit, 5), 1), 20)
    for update skip locked
  ), started as (
    update app.slack_installs si set sync_started_at = now()
    from due where si.org_id = due.org_id
    returning si.org_id, si.team_id, si.enterprise_id, si.bot_user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('org', s.org_id, 'team_id', s.team_id,
                                               'enterprise_id', s.enterprise_id, 'bot_user_id', s.bot_user_id)), '[]'::jsonb)
  into v_out from started s;
  return v_out;
end $fn$;

/*
 * The workspace's members who may be matched — people of this workspace (or its Enterprise Grid
 * organisation), not bots, guests, deactivated accounts or external people — as
 * [{id, email_sha256}], the digest of the lower-cased, trimmed address. Each is matched to the one
 * active employee of the organisation with that address; an address two employees share, or two
 * members, matches nobody. The matches replace the organisation's previous ones.
 */
create function public.slack_sync_apply(p_org uuid, p_members jsonb, p_seen int) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_n    int;
  v_emp  uuid[];
  v_uid  text[];
begin
  if not exists (select 1 from app.slack_installs si where si.org_id = p_org and si.status = 'active') then
    return jsonb_build_object('ok', false, 'error', 'not_connected');
  end if;
  if jsonb_typeof(p_members) is distinct from 'array' or coalesce(p_seen, -1) < 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  with m as (
    select e ->> 'id' as uid, lower(e ->> 'email_sha256') as h
    from jsonb_array_elements(p_members) e
    where (e ->> 'id') ~ '^[UW][A-Z0-9]{2,20}$' and lower(e ->> 'email_sha256') ~ '^[0-9a-f]{64}$'
  ), mu as (
    select h, min(uid) as uid from m group by h having count(distinct uid) = 1
  ), emp as (
    select e.id, encode(extensions.digest(lower(btrim(e.email)), 'sha256'), 'hex') as h
    from app.employees e
    where e.org_id = p_org and e.active and nullif(btrim(e.email), '') is not null
  ), eu as (
    select h, min(id::text)::uuid as id from emp group by h having count(*) = 1
  )
  select coalesce(array_agg(eu.id), '{}'), coalesce(array_agg(mu.uid), '{}') into v_emp, v_uid
  from eu join mu on mu.h = eu.h;

  delete from app.slack_members sm
  where sm.org_id = p_org
    and not exists (select 1 from unnest(v_emp, v_uid) x(employee_id, slack_user_id)
                    where x.employee_id = sm.employee_id and x.slack_user_id = sm.slack_user_id);
  insert into app.slack_members (employee_id, org_id, slack_user_id)
  select x.employee_id, p_org, x.slack_user_id from unnest(v_emp, v_uid) x(employee_id, slack_user_id)
  on conflict (employee_id) do nothing;
  select count(*) into v_n from app.slack_members where org_id = p_org;

  update app.slack_installs
  set synced_at = now(), sync_requested_at = null, sync_started_at = null, sync_error = null, sync_members = p_seen
  where org_id = p_org;
  return jsonb_build_object('ok', true, 'matched', v_n);
end $fn$;

create function public.slack_sync_failed(p_org uuid, p_code text) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
begin
  update app.slack_installs
  set sync_started_at = null,
      sync_error = case when p_code ~ '^[a-z0-9_]{1,60}$' then p_code else 'failed' end
  where org_id = p_org;
  return jsonb_build_object('ok', true);
end $fn$;

/*
 * What Slack said about one person, on one message: the member is gone, deactivated or cannot be
 * written to. The match is forgotten — the next sync makes it again if the person can be reached —
 * and the dispatcher sends the same link by e-mail in the same run. Only a claimed personal row.
 */
create function public.slack_dispatch_result(p_outbox uuid, p_problem text) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_x app.outbox;
begin
  select * into v_x from app.outbox where id = p_outbox;
  if v_x.id is null or v_x.employee_id is null
     or v_x.kind not in ('invitasjon', 'paminnelse', 'siste_paminnelse') then
    return jsonb_build_object('ok', false, 'error', 'not_personal');
  end if;
  if coalesce(p_problem, '') not in ('user_not_found', 'user_disabled', 'cannot_dm') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  delete from app.slack_members where employee_id = v_x.employee_id;
  return jsonb_build_object('ok', true);
end $fn$;

/* Tokens to revoke: leased for ten minutes; after five tries the secrets go anyway */
create function public.slack_revoke_claim(p_limit int default 10) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_out jsonb;
begin
  with gone as (
    delete from app.slack_revocations r where r.attempts >= 5
    returning r.access_secret, r.refresh_secret
  )
  delete from vault.secrets s using gone g where s.id = g.access_secret or s.id = g.refresh_secret;

  with due as (
    select r.id from app.slack_revocations r
    where r.claimed_at is null or r.claimed_at < now() - interval '10 minutes'
    order by r.queued_at, r.id
    limit least(greatest(coalesce(p_limit, 10), 1), 50)
    for update skip locked
  ), claimed as (
    update app.slack_revocations r set claimed_at = now(), attempts = r.attempts + 1
    from due where r.id = due.id
    returning r.id, r.access_secret, r.refresh_secret
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'token', app.slack_secret(c.access_secret),
                                               'refresh_token', app.slack_secret(c.refresh_secret))), '[]'::jsonb)
  into v_out from claimed c;
  return v_out;
end $fn$;

create function public.slack_revoke_done(p_id bigint) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_a uuid;
  v_r uuid;
begin
  delete from app.slack_revocations where id = p_id returning access_secret, refresh_secret into v_a, v_r;
  if v_a is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  delete from vault.secrets where id = v_a or id = v_r;
  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.slack_token(uuid) from public, anon, authenticated;
revoke all on function public.slack_token_store(uuid, text, text, int) from public, anon, authenticated;
revoke all on function public.slack_install_broken(uuid, text) from public, anon, authenticated;
revoke all on function public.slack_sync_due(int) from public, anon, authenticated;
revoke all on function public.slack_sync_apply(uuid, jsonb, int) from public, anon, authenticated;
revoke all on function public.slack_sync_failed(uuid, text) from public, anon, authenticated;
revoke all on function public.slack_dispatch_result(uuid, text) from public, anon, authenticated;
revoke all on function public.slack_revoke_claim(int) from public, anon, authenticated;
revoke all on function public.slack_revoke_done(bigint) from public, anon, authenticated;
grant execute on function public.slack_token(uuid) to service_role;
grant execute on function public.slack_token_store(uuid, text, text, int) to service_role;
grant execute on function public.slack_install_broken(uuid, text) to service_role;
grant execute on function public.slack_sync_due(int) to service_role;
grant execute on function public.slack_sync_apply(uuid, jsonb, int) to service_role;
grant execute on function public.slack_sync_failed(uuid, text) to service_role;
grant execute on function public.slack_dispatch_result(uuid, text) to service_role;
grant execute on function public.slack_revoke_claim(int) to service_role;
grant execute on function public.slack_revoke_done(bigint) to service_role;

-- ---------------------------------------------------------------- the claim, done, the reset, the demo lock
-- Each a change to the definition as it stands, in place (as 0150 and 0176 did), so this composes
-- with whatever else has rewritten them. Every anchor is a text both the definition before 0176
-- and 0176's own leave in place; where they differ, the alternatives are tried in order. A
-- definition that holds none of them stops the migration.
do $$
declare
  r     record;
  v_def text;
  v_alt jsonb;
  v_hit boolean;
begin
  for r in select * from (values
    (1, 'public.dispatch_claim(integer)', jsonb_build_array(jsonb_build_array(
        $a$  v_personal boolean;$a$,
        $a$  v_personal boolean;
  -- 0185: Slack
  v_slack   boolean;
  v_srule   text;
  v_suser   text;$a$))),
    (2, 'public.dispatch_claim(integer)', jsonb_build_array(jsonb_build_array(
        $a$org.sms_text, org.invite_greeting,$a$,
        $a$org.sms_text, org.invite_greeting, org.slack_enabled, org.slack_when,
           exists (select 1 from app.slack_installs si where si.org_id = org.id and si.status = 'active') as slack_ready,$a$))),
    (3, 'public.dispatch_claim(integer)', jsonb_build_array(jsonb_build_array(
        $a$ro.sms_when as round_sms_when,$a$,
        $a$ro.sms_when as round_sms_when, ro.slack_when as round_slack_when,$a$))),
    (4, 'public.dispatch_claim(integer)', jsonb_build_array(jsonb_build_array(
        $a$      v_rule := coalesce(r.round_sms_when, v_org.sms_when);$a$,
        $a$      v_rule := coalesce(r.round_sms_when, v_org.sms_when);
      -- 0185: Slack when the organisation has it on and a working installation, and the person a
      -- match in the workspace; the rule is the organisation's, or the round's own
      v_suser := (select sm.slack_user_id from app.slack_members sm
                  join app.employees e on e.id = sm.employee_id and e.active
                  where sm.employee_id = x.employee_id and sm.org_id = x.org_id);
      v_slack := v_org.slack_enabled and v_org.slack_ready and v_suser is not null;
      v_srule := coalesce(r.round_slack_when, v_org.slack_when);$a$))),
    (5, 'public.dispatch_claim(integer)', jsonb_build_array(jsonb_build_array(
        $a$          when v_sms and (v_rule = 'alle'$a$,
        $a$          when v_slack and (v_srule = 'alle'
                            or (v_srule = 'paaminn' and x.kind in ('paminnelse', 'siste_paminnelse'))) then 'slack'
          when v_sms and (v_rule = 'alle'$a$))),
    (6, 'public.dispatch_claim(integer)', jsonb_build_array(jsonb_build_array(
        $a$                 'phone', case when v_sms then v_phone end,$a$,
        $a$                 'phone', case when v_sms then v_phone end,
                 -- 0185: whom the bot writes to, only when Slack carries the link
                 'slack', case when v_channel = 'slack' then jsonb_build_object('user_id', v_suser, 'org', x.org_id) end,$a$))),
    (7, 'public.dispatch_done(uuid,boolean,text,boolean,text,text)', jsonb_build_array(
        -- before 0176: anything else was recorded as e-mail
        jsonb_build_array($a$p_channel in ('email', 'sms') then p_channel$a$,
                          $a$p_channel in ('email', 'sms', 'slack') then p_channel$a$),
        -- 0176: an unknown channel is refused
        jsonb_build_array($a$p_channel not in ('email', 'sms', 'teams')$a$,
                          $a$p_channel not in ('email', 'sms', 'teams', 'slack')$a$))),
    -- the reset of a round's «utsending» section puts Slack back on the standard too
    (8, 'public.reset_round_settings(uuid,text)', jsonb_build_array(jsonb_build_array(
        $a$update app.rounds set sms_when = null$a$,
        $a$update app.rounds set sms_when = null, slack_when = null$a$))),
    -- a demo's sending switches stay as they were made
    (9, 'app.demo_org_locked()', jsonb_build_array(jsonb_build_array(
        $a$new.sms_enabled$a$, $a$new.sms_enabled, new.slack_enabled$a$))),
    (10, 'app.demo_org_locked()', jsonb_build_array(jsonb_build_array(
        $a$old.sms_enabled$a$, $a$old.sms_enabled, old.slack_enabled$a$)))
  ) as t(seq, fn, alts) order by seq loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    v_hit := false;
    for v_alt in select * from jsonb_array_elements(r.alts) loop
      if position(v_alt ->> 0 in v_def) > 0 then
        execute replace(v_def, v_alt ->> 0, v_alt ->> 1);
        v_hit := true;
        exit;
      end if;
    end loop;
    if not v_hit then
      raise exception '0185 (%): % holds none of its anchors; read its definition and write this by hand', r.seq, r.fn;
    end if;
  end loop;
end $$;

-- the claim's and done's grants are the functions' own and survive a replace; restated for the record
revoke all on function public.dispatch_claim(int) from public, anon, authenticated;
grant execute on function public.dispatch_claim(int) to service_role;
revoke all on function public.dispatch_done(uuid, boolean, text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.dispatch_done(uuid, boolean, text, boolean, text, text) to service_role;
