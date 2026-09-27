-- 0093_crm_stages.sql — the pipeline's stages as data, moved by campaigns, with follow-ups and a
-- person as sender (D-142, X-076).
--
-- Tor, 2026-09-27: "The admin crm must have phases, so we can send a email through a campaign, move
-- it to the next stage and have other stages." The research behind the choices is in
-- docs/implementation/crm-conversion.md.
--
--   crm_stages            the stages, in order, with a kind (open, won, lost, parked). The eight of
--                         0056 are seeded, plus «nurture» (parked) for those a sequence did not
--                         reach. Trial and customer follow the plan (managed): nobody sets them by
--                         hand or by a campaign. A stage can be added, renamed, reordered, archived.
--   crm_companies.stage   now a reference to crm_stages instead of a fixed list.
--   crm_senders           a person to send as: name, an address on the marketing domain, a reply-to
--                         that reaches their inbox, and a signature.
--   crm_campaigns         + stage_target  send to the contacts of companies in this stage
--                         + stage_on_send move the company here once the mail has gone
--                         + sender_id     send as this person
--                         + follows_id, follow_days  a follow-up: to those the first mail reached,
--                                         the given days ago, whose company has not moved since
--   crm_settings.reply_stage  where a logged answer moves a company (engaged)
--   crm_activities.kind   + reply: «Svar mottatt», logged by a person
--
-- What moves a company, and what never does:
--   * sent: stage_on_send, forward only, from an open stage, never out of a managed one;
--   * an answer logged by a person: reply_stage, forward only;
--   * a person, by hand or for many at once (admin_crm_stage_move), to any stage they may set;
--   * never an open or a click. Opens are not evidence (X-063, Apple Mail Privacy Protection), and
--     a click may be a mail scanner's (Microsoft Safe Links).
-- A company with an organisation follows its plan (crm_sync) and is never moved by any of these.
-- The new tables have RLS on, no policy and no grant, like every crm_* table (0055).

-- ---------------------------------------------------------------- stages
create table app.crm_stages (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  sort int not null,
  kind text not null check (kind in ('open', 'won', 'lost', 'parked')),
  managed boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
alter table app.crm_stages enable row level security;
revoke all on app.crm_stages from public, anon, authenticated;

insert into app.crm_stages (key, name, sort, kind, managed) values
  ('new', 'New', 10, 'open', false),
  ('contacted', 'Contacted', 20, 'open', false),
  ('engaged', 'Engaged', 30, 'open', false),
  ('meeting', 'Meeting', 40, 'open', false),
  ('trial', 'Trial', 50, 'open', true),
  ('customer', 'Customer', 60, 'won', true),
  ('nurture', 'Nurture', 70, 'parked', false),
  ('lost', 'Lost', 80, 'lost', false),
  ('not_relevant', 'Not relevant', 90, 'lost', false);

-- the fixed list of 0056 gives way to the table
do $do$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'app.crm_companies'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%stage%'
  loop
    execute format('alter table app.crm_companies drop constraint %I', c.conname);
  end loop;
end $do$;
alter table app.crm_companies
  add constraint crm_companies_stage_fk foreign key (stage) references app.crm_stages (key) on update cascade;

-- ---------------------------------------------------------------- senders
create table app.crm_senders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  email text not null check (email ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'),
  reply_to text not null check (reply_to ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'),
  signature text not null default '' check (char_length(signature) <= 200),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
alter table app.crm_senders enable row level security;
revoke all on app.crm_senders from public, anon, authenticated;

-- ---------------------------------------------------------------- campaigns, settings, activities
alter table app.crm_campaigns
  add column stage_target text references app.crm_stages (key) on update cascade,
  add column stage_on_send text references app.crm_stages (key) on update cascade,
  add column sender_id uuid references app.crm_senders (id),
  add column follows_id uuid references app.crm_campaigns (id),
  add column follow_days int check (follow_days between 1 and 60),
  add constraint crm_campaigns_follow check ((follows_id is null) = (follow_days is null)),
  add constraint crm_campaigns_follow_self check (follows_id is distinct from id);

alter table app.crm_settings
  add column reply_stage text not null default 'engaged' references app.crm_stages (key) on update cascade;

do $do$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'app.crm_activities'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%'
  loop
    execute format('alter table app.crm_activities drop constraint %I', c.conname);
  end loop;
end $do$;
alter table app.crm_activities
  add constraint crm_activities_kind check (kind in ('note', 'call', 'meeting', 'email', 'task', 'stage', 'reply'));

-- ---------------------------------------------------------------- moving a company
/**
 * An automatic move (a campaign sent, an answer logged): forward only, from an open stage that
 * does not follow the plan, to a stage that is set by people and not archived. A move to a parked
 * or closed stage (e.g. «nurture» after the last follow-up) counts as forward. Logged as an activity.
 */
create function app.crm_advance(p_company uuid, p_to text, p_why text) returns boolean
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_co app.crm_companies;
  v_from app.crm_stages;
  v_to app.crm_stages;
begin
  select * into v_co from app.crm_companies where id = p_company for update;
  select * into v_to from app.crm_stages where key = p_to;
  if v_co.id is null or v_to.key is null or v_co.org_id is not null or v_to.managed or v_to.archived_at is not null then
    return false;
  end if;
  select * into v_from from app.crm_stages where key = v_co.stage;
  if v_from.kind <> 'open' or v_from.managed or v_from.key = v_to.key or (v_to.kind = 'open' and v_to.sort <= v_from.sort) then
    return false;
  end if;
  update app.crm_companies set stage = v_to.key, stage_changed_at = now(), updated_at = now() where id = p_company;
  perform app.crm_log(p_company, null, 'stage', v_from.key || ' → ' || v_to.key || ': ' || left(p_why, 300));
  return true;
end $fn$;
revoke all on function app.crm_advance(uuid, text, text) from public, anon, authenticated;

/**
 * A person moves companies, one or many: to a stage they may set, or (p_to null) each to the next
 * open stage after its own. A company that follows its plan is left where it is, and counted.
 */
create function public.admin_crm_stage_move(p_ids uuid[], p_to text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_id uuid;
  v_co app.crm_companies;
  v_to text;
  v_moved int := 0;
  v_skipped int := 0;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_ids is null or cardinality(p_ids) not between 1 and 500 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_to is not null and not exists (select 1 from app.crm_stages s where s.key = p_to and not s.managed and s.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_stage');
  end if;
  foreach v_id in array p_ids loop
    select * into v_co from app.crm_companies where id = v_id for update;
    if v_co.id is null or v_co.org_id is not null then
      v_skipped := v_skipped + 1; continue;
    end if;
    v_to := coalesce(p_to, (
      select n.key from app.crm_stages cur, app.crm_stages n
      where cur.key = v_co.stage and cur.kind = 'open' and n.kind = 'open' and not n.managed and n.archived_at is null and n.sort > cur.sort
      order by n.sort limit 1));
    if v_to is null or v_to = v_co.stage then
      v_skipped := v_skipped + 1; continue;
    end if;
    update app.crm_companies set stage = v_to, stage_changed_at = now(), updated_at = now() where id = v_id;
    perform app.crm_log(v_id, null, 'stage', v_co.stage || ' → ' || v_to);
    v_moved := v_moved + 1;
  end loop;
  perform app.admin_log('crm.stage_move', null, 'crm_company', null, null,
    jsonb_build_object('to', coalesce(p_to, 'next'), 'moved', v_moved, 'skipped', v_skipped));
  return jsonb_build_object('ok', true, 'moved', v_moved, 'skipped', v_skipped);
end $fn$;
revoke all on function public.admin_crm_stage_move(uuid[], text) from public, anon;
grant execute on function public.admin_crm_stage_move(uuid[], text) to authenticated;

-- ---------------------------------------------------------------- the stages and senders, for the admin
create function public.admin_crm_stages() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true,
    'reply_stage', (select s.reply_stage from app.crm_settings s),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('key', s.key, 'name', s.name, 'sort', s.sort, 'kind', s.kind, 'managed', s.managed,
               'archived', s.archived_at is not null,
               'companies', (select count(*) from app.crm_companies co where co.stage = s.key),
               'campaigns', (select count(*) from app.crm_campaigns c where s.key in (c.stage_target, c.stage_on_send)))
             order by s.sort, s.key), '[]') from app.crm_stages s));
end $fn$;
revoke all on function public.admin_crm_stages() from public, anon;
grant execute on function public.admin_crm_stages() to authenticated;

/** Add or change a stage: its name, place and kind; archive it. The plan's stages keep their kind. */
create function public.admin_crm_stage_save(p_key text, p jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_old app.crm_stages;
  v_kind text := coalesce(p->>'kind', 'open');
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if coalesce(p_key, '') !~ '^[a-z][a-z0-9_]{1,39}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_key');
  end if;
  if char_length(btrim(coalesce(p->>'name', ''))) not between 1 and 60 or coalesce(p->>'sort', '') !~ '^[0-9]{1,4}$'
     or v_kind not in ('open', 'won', 'lost', 'parked') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into v_old from app.crm_stages where key = p_key;
  if v_old.key is null then
    insert into app.crm_stages (key, name, sort, kind) values (p_key, btrim(p->>'name'), (p->>'sort')::int, v_kind);
    perform app.admin_log('crm.stage_create', null, 'crm_stage', p_key);
    return jsonb_build_object('ok', true);
  end if;
  if v_old.managed and v_kind <> v_old.kind then
    return jsonb_build_object('ok', false, 'error', 'managed');
  end if;
  if coalesce((p->>'archived')::boolean, false) and (v_old.managed
      or exists (select 1 from app.crm_companies co where co.stage = p_key)
      or exists (select 1 from app.crm_campaigns c where c.status in ('draft', 'scheduled', 'sending') and p_key in (c.stage_target, c.stage_on_send))
      or (select s.reply_stage from app.crm_settings s) = p_key) then
    return jsonb_build_object('ok', false, 'error', 'in_use');
  end if;
  update app.crm_stages set name = btrim(p->>'name'), sort = (p->>'sort')::int, kind = v_kind,
    archived_at = case when coalesce((p->>'archived')::boolean, false) then coalesce(archived_at, now()) end
  where key = p_key;
  perform app.admin_log('crm.stage_update', null, 'crm_stage', p_key);
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.admin_crm_stage_save(text, jsonb) from public, anon;
grant execute on function public.admin_crm_stage_save(text, jsonb) to authenticated;

/** Where a logged answer moves a company: a stage people set, not archived. Super-admin or marketing. */
create function public.admin_crm_reply_stage(p_key text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not exists (select 1 from app.crm_stages s where s.key = p_key and not s.managed and s.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_stage');
  end if;
  update app.crm_settings set reply_stage = p_key, changed_by = auth.uid(), changed_at = now();
  perform app.admin_log('crm.reply_stage', null, 'crm_stage', p_key);
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.admin_crm_reply_stage(text) from public, anon;
grant execute on function public.admin_crm_reply_stage(text) to authenticated;

create function public.admin_crm_senders() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true, 'rows', (
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'email', p.email, 'reply_to', p.reply_to,
             'signature', p.signature, 'archived', p.archived_at is not null,
             'campaigns', (select count(*) from app.crm_campaigns c where c.sender_id = p.id)) order by p.archived_at nulls first, p.name), '[]')
    from app.crm_senders p));
end $fn$;
revoke all on function public.admin_crm_senders() from public, anon;
grant execute on function public.admin_crm_senders() to authenticated;

/**
 * A person to send as. The address must be on the marketing domain the dispatcher sends from
 * (checked there, where the domain is known); the reply-to is the inbox that reads the answers.
 */
create function public.admin_crm_sender_save(p_id uuid, p jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_id uuid := p_id;
  v_email text := lower(btrim(coalesce(p->>'email', '')));
  v_reply text := lower(btrim(coalesce(p->>'reply_to', '')));
  v_re constant text := '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$';
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p->>'name', ''))) not between 1 and 80 or v_email !~ v_re or v_reply !~ v_re
     or char_length(coalesce(p->>'signature', '')) > 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if v_id is null then
    insert into app.crm_senders (name, email, reply_to, signature)
    values (btrim(p->>'name'), v_email, v_reply, coalesce(p->>'signature', '')) returning id into v_id;
  else
    update app.crm_senders set name = btrim(p->>'name'), email = v_email, reply_to = v_reply, signature = coalesce(p->>'signature', ''),
      archived_at = case when coalesce((p->>'archived')::boolean, false) then coalesce(archived_at, now()) end
    where id = v_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
  end if;
  perform app.admin_log('crm.sender_save', null, 'crm_sender', v_id::text);
  return jsonb_build_object('ok', true, 'id', v_id);
end $fn$;
revoke all on function public.admin_crm_sender_save(uuid, jsonb) from public, anon;
grant execute on function public.admin_crm_sender_save(uuid, jsonb) to authenticated;

/**
 * A campaign's pipeline settings, kept apart from 0059's editor save so that function stays as it
 * is: the stage it goes to, the stage it moves companies to, the person it is sent as, and whether
 * it is a follow-up. A draft only. A follow-up takes its first mail's list, so the same people
 * stay reachable on the same basis.
 */
create function public.admin_crm_campaign_pipeline(p_id uuid, p jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_c app.crm_campaigns;
  v_parent app.crm_campaigns;
  v_target text := nullif(p->>'stage_target', '');
  v_on_send text := nullif(p->>'stage_on_send', '');
  v_sender uuid;
  v_follows uuid;
  v_days int;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into v_c from app.crm_campaigns where id = p_id;
  if v_c.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_c.status <> 'draft' then
    return jsonb_build_object('ok', false, 'error', 'not_draft');
  end if;
  if v_target is not null and not exists (select 1 from app.crm_stages s where s.key = v_target and s.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_stage');
  end if;
  if v_on_send is not null and not exists (select 1 from app.crm_stages s where s.key = v_on_send and not s.managed and s.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_stage');
  end if;
  begin
    v_sender := nullif(p->>'sender_id', '')::uuid;
    v_follows := nullif(p->>'follows_id', '')::uuid;
    v_days := nullif(p->>'follow_days', '')::int;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end;
  if v_sender is not null and not exists (select 1 from app.crm_senders s where s.id = v_sender and s.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_sender');
  end if;
  if v_follows is not null then
    select * into v_parent from app.crm_campaigns where id = v_follows;
    if v_parent.id is null or v_parent.id = p_id or v_days is null or v_days not between 1 and 60 then
      return jsonb_build_object('ok', false, 'error', 'invalid_follow');
    end if;
  end if;
  update app.crm_campaigns set stage_target = v_target, stage_on_send = v_on_send, sender_id = v_sender,
    follows_id = v_follows, follow_days = case when v_follows is not null then v_days end,
    list_id = case when v_follows is not null then v_parent.list_id else list_id end,
    lang = case when v_follows is not null then v_parent.lang else lang end,
    updated_at = now()
  where id = p_id;
  perform app.admin_log('crm.campaign_pipeline', null, 'crm_campaign', p_id::text);
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.admin_crm_campaign_pipeline(uuid, jsonb) from public, anon;
grant execute on function public.admin_crm_campaign_pipeline(uuid, jsonb) to authenticated;

-- a campaign is aimed by a list, a segment, a stage or the mail it follows up
create or replace function app.crm_campaign_ready(c app.crm_campaigns) returns text
  language sql stable set search_path = ''
as $fn$
  select case
    when char_length(btrim(c.subject)) = 0 then 'no_subject'
    when not app.crm_blocks_ok(c.blocks) then 'invalid_blocks'
    when c.segment_id is null and c.list_id is null and c.stage_target is null and c.follows_id is null then 'no_segment'
    when c.publish_web and c.slug is null then 'no_slug'
    when c.follows_id is not null and not exists (select 1 from app.crm_campaigns p where p.id = c.follows_id and p.status in ('sending', 'sent')) then 'follows_unsent'
  end
$fn$;

-- ---------------------------------------------------------------- sent: the company moves on
create or replace function public.crm_mail_done(p_id uuid, p_ok boolean, p_provider_id text default null, p_error text default null, p_permanent boolean default false)
  returns void
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_s app.crm_sends;
  v_c app.crm_campaigns;
  v_company uuid;
begin
  update app.crm_sends set
    status = case when p_ok then 'sent' when p_permanent or attempts >= 5 then 'failed' else 'pending' end,
    provider_id = case when p_ok then left(p_provider_id, 200) else provider_id end,
    sent_at = case when p_ok then now() else sent_at end,
    to_email = case when p_ok or p_permanent or attempts >= 5 then null else to_email end,
    last_error = case when p_ok then null else left(regexp_replace(lower(coalesce(p_error, 'unknown')), '[^a-z0-9_]', '_', 'g'), 40) end,
    leased_until = null
  where id = p_id
  returning * into v_s;
  -- 0093: a campaign mail that has gone moves its company to the campaign's stage, forward only
  if p_ok and v_s.kind = 'campaign' then
    select * into v_c from app.crm_campaigns where id = v_s.campaign_id;
    select c.company_id into v_company from app.crm_contacts c where c.id = v_s.contact_id;
    if v_c.stage_on_send is not null and v_company is not null then
      perform app.crm_advance(v_company, v_c.stage_on_send, 'kampanje «' || v_c.name || '»');
    end if;
  end if;
end $fn$;

-- ---------------------------------------------------------------- 0056's functions, on the table of stages
create or replace function app.crm_filter_ok(f jsonb) returns boolean
  language plpgsql stable set search_path = ''
as $fn$
declare k text;
begin
  if f is null or jsonb_typeof(f) <> 'object' then return false; end if;
  for k in select jsonb_object_keys(f) loop
    if k not in ('types', 'roles', 'sources', 'tags', 'lang', 'min_employees', 'max_employees', 'nace', 'no_survey_days',
                 'mailable_only', 'stages', 'lists', 'bases') then
      return false;
    end if;
  end loop;
  if f ? 'types' and (jsonb_typeof(f->'types') <> 'array' or exists (select 1 from jsonb_array_elements_text(f->'types') v
      where v not in ('prospect', 'trial', 'customer', 'former'))) then return false; end if;
  if f ? 'roles' and (jsonb_typeof(f->'roles') <> 'array' or exists (select 1 from jsonb_array_elements_text(f->'roles') v
      where v not in ('daglig_leder', 'hr', 'leder', 'verneombud', 'annet'))) then return false; end if;
  if f ? 'sources' and (jsonb_typeof(f->'sources') <> 'array' or exists (select 1 from jsonb_array_elements_text(f->'sources') v
      where v not in ('user', 'newsletter', 'contact_form', 'import', 'manual', 'event', 'brreg'))) then return false; end if;
  -- 0093: a stage is one of the configured ones
  if f ? 'stages' and (jsonb_typeof(f->'stages') <> 'array' or exists (select 1 from jsonb_array_elements_text(f->'stages') v
      where v not in (select s.key from app.crm_stages s))) then return false; end if;
  if f ? 'bases' and (jsonb_typeof(f->'bases') <> 'array' or exists (select 1 from jsonb_array_elements_text(f->'bases') v
      where v not in ('consent', 'customer', 'business', 'none'))) then return false; end if;
  if f ? 'lists' and (jsonb_typeof(f->'lists') <> 'array' or exists (select 1 from jsonb_array_elements_text(f->'lists') v
      where v !~ '^[a-z0-9-]{2,40}$')) then return false; end if;
  if f ? 'tags' and (jsonb_typeof(f->'tags') <> 'array' or jsonb_array_length(f->'tags') > 20 or exists (
      select 1 from jsonb_array_elements_text(f->'tags') v where v !~ '^[a-z0-9æøå_-]{1,40}$')) then return false; end if;
  if f ? 'lang' and (f->>'lang') not in ('no', 'en') then return false; end if;
  if f ? 'nace' and (f->>'nace') !~ '^[0-9]{2}(\.[0-9]{1,3})?$' then return false; end if;
  if f ? 'min_employees' and (jsonb_typeof(f->'min_employees') <> 'number' or (f->>'min_employees')::numeric not between 0 and 100000) then return false; end if;
  if f ? 'max_employees' and (jsonb_typeof(f->'max_employees') <> 'number' or (f->>'max_employees')::numeric not between 0 and 100000) then return false; end if;
  if f ? 'no_survey_days' and (jsonb_typeof(f->'no_survey_days') <> 'number' or (f->>'no_survey_days')::numeric not between 1 and 3650) then return false; end if;
  if f ? 'mailable_only' and jsonb_typeof(f->'mailable_only') <> 'boolean' then return false; end if;
  return true;
end $fn$;

create or replace function public.admin_crm_company_save(p_id uuid, p jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_id uuid := p_id;
  v_old app.crm_companies;
  v_tags text[];
  v_orgnr text := nullif(regexp_replace(coalesce(p->>'org_number', ''), '\s', '', 'g'), '');
  v_stage text := nullif(p->>'stage', '');
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p ? 'name' and char_length(btrim(coalesce(p->>'name', ''))) not between 1 and 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if v_orgnr is not null and v_orgnr !~ '^[0-9]{9}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_org_number');
  end if;
  -- 0093: any configured stage a person may set: not one that follows the plan, not an archived one
  if v_stage is not null and not exists (select 1 from app.crm_stages s where s.key = v_stage and not s.managed and s.archived_at is null) then
    return jsonb_build_object('ok', false, 'error', 'invalid_stage');
  end if;
  if p ? 'tags' then
    if jsonb_typeof(p->'tags') <> 'array' or jsonb_array_length(p->'tags') > 20
       or exists (select 1 from jsonb_array_elements_text(p->'tags') t where t !~ '^[a-z0-9æøå_-]{1,40}$') then
      return jsonb_build_object('ok', false, 'error', 'invalid_tags');
    end if;
    v_tags := array(select distinct jsonb_array_elements_text(p->'tags'));
  end if;
  if nullif(p->>'owner_id', '') is not null and not exists (
      select 1 from app.platform_admins a where a.user_id = (p->>'owner_id')::uuid and a.active) then
    return jsonb_build_object('ok', false, 'error', 'invalid_owner');
  end if;
  begin
    perform nullif(p->>'next_step_at', '')::date;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'invalid_date');
  end;

  if v_id is null then
    if not p ? 'name' then
      return jsonb_build_object('ok', false, 'error', 'invalid_name');
    end if;
    if v_orgnr is not null and exists (select 1 from app.crm_companies c where c.product_id = 'orgpuls' and c.org_number = v_orgnr) then
      return jsonb_build_object('ok', false, 'error', 'exists');
    end if;
    insert into app.crm_companies (org_number, name, nace_code, employees, municipality, website, phone, source, stage, owner_id,
                                   next_step, next_step_at, tags)
    values (v_orgnr, btrim(p->>'name'), case when p->>'nace_code' ~ '^[0-9]{2}(\.[0-9]{1,3})?$' then p->>'nace_code' end,
            case when p->>'employees' ~ '^[0-9]{1,7}$' then (p->>'employees')::int end, nullif(left(btrim(coalesce(p->>'municipality', '')), 80), ''),
            nullif(left(btrim(coalesce(p->>'website', '')), 300), ''), nullif(left(btrim(coalesce(p->>'phone', '')), 40), ''),
            'manual', coalesce(v_stage, 'new'), nullif(p->>'owner_id', '')::uuid,
            nullif(left(btrim(coalesce(p->>'next_step', '')), 300), ''), nullif(p->>'next_step_at', '')::date, coalesce(v_tags, '{}'))
    returning id into v_id;
    perform app.crm_log(v_id, null, 'stage', 'Opprettet: ' || coalesce(v_stage, 'new'));
    perform app.admin_log('crm.company_create', null, 'crm_company', v_id::text);
    return jsonb_build_object('ok', true, 'id', v_id);
  end if;

  select * into v_old from app.crm_companies where id = v_id;
  if v_old.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_stage is not null and v_old.org_id is not null then
    return jsonb_build_object('ok', false, 'error', 'stage_follows_plan');
  end if;
  update app.crm_companies c set
    name = case when p ? 'name' then btrim(p->>'name') else c.name end,
    website = case when p ? 'website' then nullif(left(btrim(coalesce(p->>'website', '')), 300), '') else c.website end,
    phone = case when p ? 'phone' then nullif(left(btrim(coalesce(p->>'phone', '')), 40), '') else c.phone end,
    owner_id = case when p ? 'owner_id' then nullif(p->>'owner_id', '')::uuid else c.owner_id end,
    next_step = case when p ? 'next_step' then nullif(left(btrim(coalesce(p->>'next_step', '')), 300), '') else c.next_step end,
    next_step_at = case when p ? 'next_step_at' then nullif(p->>'next_step_at', '')::date else c.next_step_at end,
    lost_reason = case when p ? 'lost_reason' then nullif(left(btrim(coalesce(p->>'lost_reason', '')), 300), '') else c.lost_reason end,
    tags = coalesce(v_tags, c.tags),
    stage = coalesce(v_stage, c.stage),
    stage_changed_at = case when v_stage is not null and v_stage <> c.stage then now() else c.stage_changed_at end,
    updated_at = now()
  where c.id = v_id;
  if v_stage is not null and v_stage <> v_old.stage then
    perform app.crm_log(v_id, null, 'stage', v_old.stage || ' → ' || v_stage
      || case when (select s.kind from app.crm_stages s where s.key = v_stage) = 'lost' and nullif(p->>'lost_reason', '') is not null
              then ': ' || left(p->>'lost_reason', 300) else '' end);
  end if;
  perform app.admin_log('crm.company_update', v_old.org_id, 'crm_company', v_id::text);
  return jsonb_build_object('ok', true, 'id', v_id);
end $fn$;

create or replace function public.admin_crm_activity(p_company uuid, p_contact uuid, p_kind text, p_body text, p_due date default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_kind not in ('note', 'call', 'meeting', 'email', 'task', 'reply') or char_length(btrim(coalesce(p_body, ''))) not between 1 and 4000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if not exists (select 1 from app.crm_companies c where c.id = p_company) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_contact is not null and not exists (select 1 from app.crm_contacts c where c.id = p_contact and c.company_id = p_company) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  perform app.crm_log(p_company, p_contact, p_kind, btrim(p_body), case when p_kind = 'task' then p_due end);
  -- a first call, mail or meeting moves a new prospect to "contacted"
  if p_kind in ('call', 'email', 'meeting') then
    update app.crm_companies set stage = 'contacted', stage_changed_at = now() where id = p_company and stage = 'new' and org_id is null;
  end if;
  -- 0093: an answer is the signal that counts (not an open, not a click): the company moves on to
  -- the stage the settings name for it, forward only
  if p_kind = 'reply' then
    perform app.crm_advance(p_company, (select s.reply_stage from app.crm_settings s), 'svar mottatt');
  end if;
  perform app.admin_log('crm.activity_add', null, 'crm_company', p_company::text);
  return jsonb_build_object('ok', true);
end $fn$;


-- ---------------------------------------------------------------- the dispatcher's claim, with the new audiences and the sender
create or replace function public.crm_mail_claim(p_batch int default 25) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_c record;
  v_n int;
  v_test int;
  v_jobs jsonb := '[]';
  v_s record;
  v_token text;
  v_a numeric;
  v_b numeric;
  v_filter jsonb;
begin
  -- start what is due: the audience, split for an A/B test when there is a subject B
  for v_c in select * from app.crm_campaigns where status = 'scheduled' and scheduled_at <= now() for update skip locked loop
    v_filter := (select g.filter from app.crm_segments g where g.id = v_c.segment_id);
    if v_c.follows_id is not null then
      -- 0093: a follow-up goes to those the first mail reached, the given days ago, who have not
      -- moved on since: their company is still in the stage the first mail put it in (or aimed at)
      insert into app.crm_sends (kind, campaign_id, contact_id, to_email)
      select 'campaign', v_c.id, c.id, c.email
      from app.crm_sends p
      join app.crm_campaigns pc on pc.id = p.campaign_id
      join app.crm_contacts c on c.id = p.contact_id
      left join app.crm_companies co on co.id = c.company_id
      where p.campaign_id = v_c.follows_id and p.kind = 'campaign' and p.status = 'sent'
        and p.sent_at <= now() - make_interval(days => v_c.follow_days)
        and p.unsubscribed_at is null and coalesce(p.delivery::text, '') not in ('hard_bounce', 'invalid', 'blocked', 'spam')
        and (coalesce(pc.stage_on_send, pc.stage_target) is null or co.stage = coalesce(pc.stage_on_send, pc.stage_target))
        and (v_c.stage_target is null or co.stage = v_c.stage_target)
        and case when v_c.list_id is not null then app.crm_on_list(c, v_c.list_id) else app.crm_mailable(c) end
      on conflict do nothing;
    elsif v_c.list_id is not null then
      insert into app.crm_sends (kind, campaign_id, contact_id, to_email)
      select 'campaign', v_c.id, c.id, c.email from app.crm_contacts c
      where app.crm_on_list(c, v_c.list_id)
        and (v_filter is null or c.id in (select x.id from app.crm_segment_contacts(v_filter) x))
        and (v_c.stage_target is null or exists (select 1 from app.crm_companies co where co.id = c.company_id and co.stage = v_c.stage_target))
      on conflict do nothing;
    elsif v_c.segment_id is null and v_c.stage_target is not null then
      -- 0093: a stage alone: every mailable contact of a company in that stage
      insert into app.crm_sends (kind, campaign_id, contact_id, to_email)
      select 'campaign', v_c.id, c.id, c.email from app.crm_contacts c join app.crm_companies co on co.id = c.company_id
      where co.stage = v_c.stage_target and app.crm_mailable(c) and c.lang = v_c.lang
      on conflict do nothing;
    else
      insert into app.crm_sends (kind, campaign_id, contact_id, to_email)
      select 'campaign', v_c.id, s.id, s.email
      from (select distinct on (x.id) x.* from app.crm_segment_contacts(coalesce(v_filter, '{"types":[]}')) x) s
      where app.crm_mailable(s) and s.lang = v_c.lang
        and (v_c.stage_target is null or exists (select 1 from app.crm_companies co where co.id = s.company_id and co.stage = v_c.stage_target))
      on conflict do nothing;
    end if;
    get diagnostics v_n = row_count;
    if btrim(v_c.subject_b) <> '' and v_n >= 4 then
      v_test := greatest(2, (v_n * v_c.ab_percent / 100));
      with ranked as (
        select s.id, row_number() over (order by random()) as rn from app.crm_sends s where s.campaign_id = v_c.id and s.kind = 'campaign'
      )
      update app.crm_sends s set
        variant = case when r.rn <= v_test then case when r.rn % 2 = 1 then 'a' else 'b' end end,
        status = case when r.rn <= v_test then 'pending' else 'held' end
      from ranked r where r.id = s.id;
    else
      update app.crm_sends set variant = 'a' where campaign_id = v_c.id and kind = 'campaign';
    end if;
    update app.crm_campaigns set status = 'sending', started_at = now(), audience = v_n, updated_at = now() where id = v_c.id;
  end loop;

  -- decide A/B tests whose wait is over, and release the rest with the winner
  for v_c in select * from app.crm_campaigns where status = 'sending' and btrim(subject_b) <> '' and ab_decided_at is null
      and started_at + make_interval(hours => ab_wait_hours) <= now() for update skip locked loop
    select
      avg(case when v_c.ab_metric = 'click' then (s.clicked_at is not null)::int else (s.opened_at is not null)::int end) filter (where s.variant = 'a'),
      avg(case when v_c.ab_metric = 'click' then (s.clicked_at is not null)::int else (s.opened_at is not null)::int end) filter (where s.variant = 'b')
      into v_a, v_b
    from app.crm_sends s where s.campaign_id = v_c.id and s.kind = 'campaign' and s.status = 'sent';
    update app.crm_campaigns set ab_winner = case when coalesce(v_b, 0) > coalesce(v_a, 0) then 'b' else 'a' end, ab_decided_at = now()
    where id = v_c.id;
    update app.crm_sends set status = 'pending', variant = case when coalesce(v_b, 0) > coalesce(v_a, 0) then 'b' else 'a' end
    where campaign_id = v_c.id and status = 'held';
  end loop;

  update app.crm_campaigns c set status = 'sent', finished_at = now(), updated_at = now()
  where c.status = 'sending' and not exists (select 1 from app.crm_sends s where s.campaign_id = c.id and s.status in ('held', 'pending', 'sending'));

  for v_s in
    select s.id, s.kind, s.campaign_id, s.contact_id, s.to_email, s.variant from app.crm_sends s
    where (s.status = 'pending' or (s.status = 'sending' and s.leased_until < now())) and s.attempts < 5
    order by s.created_at limit least(greatest(coalesce(p_batch, 25), 1), 50)
    for update skip locked
  loop
    if v_s.kind = 'campaign' and not coalesce((
        select case when g.list_id is not null then app.crm_on_list(c, g.list_id) else app.crm_mailable(c) end
        from app.crm_contacts c, app.crm_campaigns g where c.id = v_s.contact_id and g.id = v_s.campaign_id), false) then
      update app.crm_sends set status = 'skipped', to_email = null where id = v_s.id;
      continue;
    end if;
    if v_s.kind = 'optin' and exists (select 1 from app.crm_contacts c where c.id = v_s.contact_id and c.basis = 'consent' and c.status = 'active'
        and not exists (select 1 from app.crm_list_members m where m.contact_id = c.id and m.status = 'pending')) then
      update app.crm_sends set status = 'skipped', to_email = null where id = v_s.id;
      continue;
    end if;
    v_token := app.crm_new_token();
    if v_s.kind = 'optin' then
      update app.crm_contacts set optin_hash = app.crm_token_hash(v_token) where id = v_s.contact_id;
      update app.crm_sends set status = 'sending', leased_until = now() + interval '2 minutes', attempts = attempts + 1 where id = v_s.id;
    else
      update app.crm_sends set status = 'sending', leased_until = now() + interval '2 minutes', attempts = attempts + 1,
        unsub_hash = app.crm_token_hash(v_token) where id = v_s.id;
    end if;
    v_jobs := v_jobs || jsonb_build_object(
      'id', v_s.id, 'kind', v_s.kind, 'to_email', v_s.to_email, 'token', v_token,
      'name', (select c.name from app.crm_contacts c where c.id = v_s.contact_id),
      'basis', (select c.basis from app.crm_contacts c where c.id = v_s.contact_id),
      'company', (select coalesce(co.name, c.company) from app.crm_contacts c left join app.crm_companies co on co.id = c.company_id
                  where c.id = v_s.contact_id),
      'lang', coalesce((select g.lang from app.crm_campaigns g where g.id = v_s.campaign_id),
                       (select c.lang from app.crm_contacts c where c.id = v_s.contact_id), 'no'),
      'lists', case when v_s.kind = 'optin' then (
                 select coalesce(jsonb_agg(jsonb_build_object('name_no', l.name_no, 'name_en', l.name_en) order by l.sort), '[]')
                 from app.crm_list_members m join app.crm_lists l on l.id = m.list_id
                 where m.contact_id = v_s.contact_id and m.status = 'pending') end,
      -- 0093: the campaign's person, when it has one: their name, address and reply-to
      'sender', (select jsonb_build_object('name', p.name, 'email', p.email, 'reply_to', p.reply_to)
                 from app.crm_campaigns g join app.crm_senders p on p.id = g.sender_id where g.id = v_s.campaign_id),
      'campaign', (select jsonb_build_object('kind', g.kind, 'style', g.style,
                     'signature', coalesce(nullif(btrim(g.signature), ''), (select p.signature from app.crm_senders p where p.id = g.sender_id), ''),
                     'subject', case when v_s.variant = 'b' and btrim(g.subject_b) <> '' then g.subject_b else g.subject end,
                     'preheader', g.preheader, 'blocks', g.blocks, 'utm_campaign', g.utm_campaign,
                     'web_slug', case when g.publish_web then g.slug end,
                     'list', (select jsonb_build_object('name_no', l.name_no, 'name_en', l.name_en) from app.crm_lists l where l.id = g.list_id))
                   from app.crm_campaigns g where g.id = v_s.campaign_id));
  end loop;
  return v_jobs;
end $fn$;
