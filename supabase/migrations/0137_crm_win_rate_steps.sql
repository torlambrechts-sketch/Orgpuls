-- 0137 — CRM: a stage history for the win rate, honest pipeline sums, and call and LinkedIn steps
--         in a sequence (X-091, D-159 follow-up)
--
-- Deal value exists since 0119 (a yearly contract value per company, an estimate). What was not
-- honest yet:
--
--   * The board summed values as though a deal without one were worth 0 kr, from at most the 500
--     companies the list reader returns. admin_crm_pipeline_summary sums in the database, over every
--     company, and says per stage how many deals carry a value, so a sum is never mistaken for
--     complete.
--   * A win rate needs to know which deals were won and lost in a period. Stage changes were only
--     half recorded: some writers log a text line ('a → b'), others (the plan sync, the first call,
--     a cancellation) only move stage_changed_at, which forgets the stage before. app.crm_stage_changes
--     is fed by a trigger on crm_companies, so every writer is recorded, with the kind of the stage
--     left and the stage reached at the time. It starts empty: the win rate counts from this
--     migration on (crm_settings.stage_history_since), and says so. It is not backfilled: a
--     company's current stage and stage_changed_at say where it is, not where it came from, and a
--     customer who cancels moves from a won stage to a lost one (0064) — churn, not a lost deal.
--     Only a move from an open or parked stage to a won or lost one closes a deal.
--   * Stages carry no probability and the design draws no weighted pipeline, so none is added.
--
-- A sequence (0111) was a chain of mails. A step may now be a call or a LinkedIn message
-- (crm_campaigns.step_kind): it sends nothing. When a contact comes due for it (its days after the
-- step before, with the same exits as a mail), it makes a task for the company's owner, linked to
-- the step (crm_activities.campaign_id), due that day. The chain waits on the task: the next step
-- counts its days from when the task was done or skipped (crm_activities.skipped, set with done_at;
-- «Skip» exists only for a task a step made). A step is finished once everyone due has a task and
-- every task is done or skipped. A task needs a company (0056), so a contact without one goes no
-- further than a call or LinkedIn step.

-- ---------------------------------------------------------------- the stage history
alter table app.crm_settings add column stage_history_since timestamptz not null default now();
comment on column app.crm_settings.stage_history_since is
  'When app.crm_stage_changes began recording (0137): the win rate counts no earlier than this.';

create table app.crm_stage_changes (
  id bigint generated always as identity primary key,
  company_id uuid not null references app.crm_companies (id) on delete cascade,
  from_stage text,
  from_kind text check (from_kind in ('open', 'won', 'lost', 'parked')),
  to_stage text not null,
  to_kind text check (to_kind in ('open', 'won', 'lost', 'parked')),
  changed_at timestamptz not null default now(),
  constraint crm_stage_changes_from check ((from_stage is null) = (from_kind is null))
);
comment on table app.crm_stage_changes is
  'Every stage a CRM company entered, with the kind of the stage it left and the one it reached then (0137). Written by a trigger only.';
create index crm_stage_changes_closing on app.crm_stage_changes (changed_at) where to_kind in ('won', 'lost');
create index crm_stage_changes_company on app.crm_stage_changes (company_id, changed_at desc);
-- read through admin_crm_pipeline_summary only: no client role reads or writes it
alter table app.crm_stage_changes enable row level security;
revoke all on app.crm_stage_changes from public, anon, authenticated;

create function app.crm_stage_record() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if tg_op = 'INSERT' or old.stage is distinct from new.stage then
    insert into app.crm_stage_changes (company_id, from_stage, from_kind, to_stage, to_kind)
    values (new.id,
            case when tg_op = 'UPDATE' then old.stage end,
            case when tg_op = 'UPDATE' then (select s.kind from app.crm_stages s where s.key = old.stage) end,
            new.stage,
            (select s.kind from app.crm_stages s where s.key = new.stage));
  end if;
  return null;
end $fn$;
revoke all on function app.crm_stage_record() from public, anon, authenticated;
create trigger crm_stage_record after insert or update of stage on app.crm_companies
  for each row execute function app.crm_stage_record();

-- The history is a record: nobody changes a row. A delete is allowed only when the company is
-- already gone — the cascade of its own deletion (CLAUDE.md: immutability permits referential
-- maintenance).
create function app.crm_stage_changes_guard() returns trigger
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if tg_op = 'UPDATE' then
    raise exception 'crm_stage_changes is a record: rows are not changed';
  end if;
  if exists (select 1 from app.crm_companies c where c.id = old.company_id) then
    raise exception 'crm_stage_changes is a record: rows go only with their company';
  end if;
  return old;
end $fn$;
revoke all on function app.crm_stage_changes_guard() from public, anon, authenticated;
create trigger crm_stage_changes_guard before update or delete on app.crm_stage_changes
  for each row execute function app.crm_stage_changes_guard();

-- ---------------------------------------------------------------- the pipeline in figures
-- Per stage: deals, how many carry a value, and the sum of those values. Open: the same over the
-- open stages people work in. Won this quarter (Oslo): deals now in a won stage that entered it
-- since the quarter began. Closed: deals whose last close in the period — from an open or parked
-- stage to a won or lost one — was a win or a loss, counted from p_from (default: the quarter) or
-- from when the history began, whichever is later. The rate itself is the page's to compute, and
-- over nothing closed it is nothing (lib/admin/pipeline.ts).
create function public.admin_crm_pipeline_summary(p_from timestamptz default null) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_quarter timestamptz := date_trunc('quarter', now() at time zone 'Europe/Oslo') at time zone 'Europe/Oslo';
  v_history timestamptz := (select s.stage_history_since from app.crm_settings s where s.id);
  v_since timestamptz;
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  v_since := greatest(coalesce(p_from, v_quarter), coalesce(v_history, now()));
  return jsonb_build_object('ok', true,
    'stages', (select coalesce(jsonb_agg(jsonb_build_object('key', x.key, 'count', x.n, 'valued', x.valued, 'value', x.value) order by x.sort), '[]')
               from (select s.key, s.sort, count(c.id) as n, count(c.value_nok) as valued, coalesce(sum(c.value_nok), 0) as value
                     from app.crm_stages s left join app.crm_companies c on c.stage = s.key
                     group by s.key, s.sort) x),
    'open', (select jsonb_build_object('count', count(*), 'valued', count(c.value_nok), 'value', coalesce(sum(c.value_nok), 0))
             from app.crm_companies c join app.crm_stages s on s.key = c.stage
             where s.kind = 'open' and s.archived_at is null),
    'won_quarter', (select jsonb_build_object('count', count(*), 'valued', count(c.value_nok), 'value', coalesce(sum(c.value_nok), 0))
                    from app.crm_companies c join app.crm_stages s on s.key = c.stage
                    where s.kind = 'won' and c.stage_changed_at >= v_quarter),
    'closed', (select jsonb_build_object('won', count(*) filter (where x.to_kind = 'won'), 'lost', count(*) filter (where x.to_kind = 'lost'))
               from (select distinct on (h.company_id) h.company_id, h.to_kind
                     from app.crm_stage_changes h
                     where h.changed_at >= v_since and h.to_kind in ('won', 'lost') and h.from_kind in ('open', 'parked')
                     order by h.company_id, h.changed_at desc, h.id desc) x),
    'since', v_since,
    'history_since', v_history,
    'quarter', v_quarter);
end $fn$;
revoke all on function public.admin_crm_pipeline_summary(timestamptz) from public, anon;
grant execute on function public.admin_crm_pipeline_summary(timestamptz) to authenticated;

-- ---------------------------------------------------------------- call and LinkedIn steps
alter table app.crm_campaigns
  add column step_kind text not null default 'mail' check (step_kind in ('mail', 'call', 'linkedin')),
  add constraint crm_campaigns_step_follows check (step_kind = 'mail' or (follows_id is not null and follow_auto));
comment on column app.crm_campaigns.step_kind is
  'mail: the step sends its mail. call, linkedin: it sends nothing and makes a task for the company owner per contact due (0137).';

alter table app.crm_activities
  add column campaign_id uuid references app.crm_campaigns (id) on delete set null,
  add column skipped boolean not null default false,
  add constraint crm_activities_skipped check (not skipped or (kind = 'task' and done_at is not null));
comment on column app.crm_activities.campaign_id is 'The call or LinkedIn step that made this task (0137); the sequence waits on it.';
comment on column app.crm_activities.skipped is 'The task a step made was passed over rather than done; the sequence goes on either way (0137).';
create unique index crm_activities_step_once on app.crm_activities (campaign_id, contact_id) where campaign_id is not null;

/** the first campaign of the chain a step belongs to */
create function app.crm_chain_root(p_id uuid) returns uuid
  language sql stable security definer set search_path = ''
as $fn$
  with recursive up as (
    select c.id, c.follows_id, 1 as n from app.crm_campaigns c where c.id = p_id
    union all
    select c.id, c.follows_id, up.n + 1 from app.crm_campaigns c join up on c.id = up.follows_id where up.n < 20
  )
  select id from up order by n desc limit 1
$fn$;
revoke all on function app.crm_chain_root(uuid) from public, anon, authenticated;

/**
 * Who a step may reach now (0111), and 0137's two changes: a step after a call or LinkedIn step
 * counts its days from when that step's task was done or skipped (an answer since the task was
 * made ends it, as since a mail); and a call or LinkedIn step reaches only contacts with a company,
 * since its task belongs to one.
 */
create or replace function app.crm_follow_audience(v_c app.crm_campaigns) returns table (contact_id uuid, email text)
  language sql stable security definer set search_path = ''
as $fn$
  with reached as (
    select p.contact_id, p.sent_at as at, p.sent_at as since, p.clicked_at, p.opened_at, p.unsubscribed_at, p.delivery::text as delivery
    from app.crm_sends p
    where p.campaign_id = v_c.follows_id and p.kind = 'campaign' and p.status = 'sent'
    union all
    select a.contact_id, a.done_at, a.created_at, null::timestamptz, null::timestamptz, null::timestamptz, null::text
    from app.crm_activities a
    where a.campaign_id = v_c.follows_id and a.kind = 'task' and a.done_at is not null and a.contact_id is not null
  )
  select c.id, c.email
  from reached p
  join app.crm_campaigns pc on pc.id = v_c.follows_id
  join app.crm_contacts c on c.id = p.contact_id
  left join app.crm_companies co on co.id = c.company_id
  where p.at <= now() - make_interval(days => v_c.follow_days)
    and p.unsubscribed_at is null and coalesce(p.delivery, '') not in ('hard_bounce', 'invalid', 'blocked', 'spam')
    and (v_c.follow_when <> 'no_click' or p.clicked_at is null)
    and (v_c.follow_when <> 'no_open' or (p.opened_at is null and p.clicked_at is null))
    -- an answer ends the conversation's automation
    and (co.id is null or not exists (select 1 from app.crm_activities a where a.company_id = co.id and a.kind = 'reply' and a.created_at >= p.since))
    -- won, lost or parked companies are not chased
    and (co.id is null or not exists (select 1 from app.crm_stages st where st.key = co.stage and st.kind in ('won', 'lost', 'parked')))
    and (coalesce(pc.stage_on_send, pc.stage_target) is null or co.stage = coalesce(pc.stage_on_send, pc.stage_target))
    and (v_c.stage_target is null or co.stage = v_c.stage_target)
    and case when v_c.list_id is not null then app.crm_on_list(c, v_c.list_id) else app.crm_mailable(c) end
    -- 0137: a call or LinkedIn step makes a task, and a task belongs to a company
    and (v_c.step_kind = 'mail' or co.id is not null)
$fn$;

/**
 * 0115's rule, and for a call or LinkedIn step: finished only when everyone due has a task and no
 * task it made is still open — the next step's days count from that.
 */
create or replace function app.crm_follow_done(c app.crm_campaigns) returns boolean
  language sql stable security definer set search_path = ''
as $fn$
  select exists (select 1 from app.crm_campaigns p where p.id = c.follows_id and p.status in ('sent', 'cancelled')
                   and coalesce(p.finished_at, p.updated_at) + make_interval(days => c.follow_days + 1) < now())
    and not exists (select 1 from app.crm_sends s where s.campaign_id = c.id and s.status in ('held', 'pending', 'sending'))
    and not exists (select 1 from app.crm_follow_audience(c) x
                    where not exists (select 1 from app.crm_sends s where s.campaign_id = c.id and s.contact_id = x.contact_id)
                      and not exists (select 1 from app.crm_activities a where a.campaign_id = c.id and a.contact_id = x.contact_id))
    and not exists (select 1 from app.crm_activities a where a.campaign_id = c.id and a.kind = 'task' and a.done_at is null)
$fn$;

/** A call or LinkedIn step's tasks: one per contact who has come due, for the company's owner, due today */
create function app.crm_step_tasks() returns int
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_cc app.crm_campaigns;
  v_n int := 0;
  v_k int;
begin
  for v_cc in select * from app.crm_campaigns where step_kind <> 'mail' and status in ('scheduled', 'sending') and scheduled_at <= now()
      for update skip locked loop
    insert into app.crm_activities (company_id, contact_id, kind, body, due_at, admin_id, admin_email, campaign_id)
    select c.company_id, x.contact_id, 'task', left(btrim(v_cc.subject), 4000), (now() at time zone 'Europe/Oslo')::date,
           co.owner_id, (select u.email::text from auth.users u where u.id = co.owner_id), v_cc.id
    from app.crm_follow_audience(v_cc) x
    join app.crm_contacts c on c.id = x.contact_id
    join app.crm_companies co on co.id = c.company_id
    where not exists (select 1 from app.crm_activities a where a.campaign_id = v_cc.id and a.contact_id = x.contact_id)
    on conflict do nothing;
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
    update app.crm_companies co set last_activity_at = now()
    where exists (select 1 from app.crm_activities a where a.campaign_id = v_cc.id and a.company_id = co.id and a.created_at = now());
    update app.crm_campaigns c set status = 'sending', started_at = coalesce(c.started_at, now()),
      audience = (select count(*) from app.crm_activities a where a.campaign_id = c.id and a.kind = 'task'), updated_at = now()
    where c.id = v_cc.id;
  end loop;
  return v_n;
end $fn$;
revoke all on function app.crm_step_tasks() from public, anon, authenticated;

-- a call or LinkedIn step is ready with its task text and a step before it; it has no mail to check
create or replace function app.crm_campaign_ready(c app.crm_campaigns) returns text
  language sql stable set search_path = ''
as $fn$
  select case
    when c.step_kind <> 'mail' then case
      when char_length(btrim(c.subject)) = 0 then 'no_subject'
      when c.follows_id is null or not c.follow_auto then 'invalid_follow'
      when not exists (select 1 from app.crm_campaigns p where p.id = c.follows_id and p.status in ('scheduled', 'sending', 'sent')) then 'follows_unsent'
    end
    when char_length(btrim(c.subject)) = 0 then 'no_subject'
    when not app.crm_blocks_ok(c.blocks) then 'invalid_blocks'
    when app.crm_placeholder_left(c) then 'placeholder_left'
    when c.segment_id is null and c.list_id is null and c.stage_target is null and c.follows_id is null then 'no_segment'
    when c.publish_web and c.slug is null then 'no_slug'
    when c.follows_id is not null and not exists (select 1 from app.crm_campaigns p where p.id = c.follows_id
           and (p.status in ('sending', 'sent') or (c.follow_auto and p.status = 'scheduled'))) then 'follows_unsent'
    when c.follow_auto and btrim(c.subject_b) <> '' then 'auto_no_ab'
  end
$fn$;

-- «Add a call step» / «Add a LinkedIn step»: a draft step after this one, or a draft step changed
create function public.admin_crm_step_save(p_id uuid, p jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_c app.crm_campaigns;
  v_parent app.crm_campaigns;
  v_kind text := p->>'step_kind';
  v_title text := btrim(coalesce(p->>'title', ''));
  v_name text := btrim(coalesce(p->>'name', ''));
  v_days int;
  v_id uuid;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if v_kind not in ('call', 'linkedin') then
    return jsonb_build_object('ok', false, 'error', 'invalid_step');
  end if;
  if char_length(v_title) not between 1 and 150 then
    return jsonb_build_object('ok', false, 'error', 'no_subject');
  end if;
  if char_length(v_name) not between 1 and 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if coalesce(p->>'follow_days', '') !~ '^[0-9]{1,2}$' or (p->>'follow_days')::int not between 1 and 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_follow');
  end if;
  v_days := (p->>'follow_days')::int;

  if p_id is null then
    select * into v_parent from app.crm_campaigns where id = nullif(p->>'follows_id', '')::uuid;
    if v_parent.id is null or v_parent.status = 'cancelled' then
      return jsonb_build_object('ok', false, 'error', 'invalid_follow');
    end if;
    if app.crm_chain_depth(v_parent.id) >= 7 then
      return jsonb_build_object('ok', false, 'error', 'too_many_steps');
    end if;
    insert into app.crm_campaigns (name, kind, lang, subject, blocks, list_id, utm_campaign, follows_id, follow_days, follow_when,
                                   follow_auto, step_kind, created_by)
    values (v_name, v_parent.kind, v_parent.lang, v_title, '[]', v_parent.list_id,
            left(v_parent.utm_campaign, 50) || '-' || v_kind, v_parent.id, v_days, 'no_reply', true, v_kind, auth.uid())
    returning id into v_id;
    perform app.admin_log('crm.step_create', null, 'crm_campaign', v_id::text, null, jsonb_build_object('follows', v_parent.id, 'kind', v_kind));
    return jsonb_build_object('ok', true, 'id', v_id);
  end if;

  select * into v_c from app.crm_campaigns where id = p_id for update;
  if v_c.id is null or v_c.step_kind = 'mail' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_c.status <> 'draft' then
    return jsonb_build_object('ok', false, 'error', 'not_draft');
  end if;
  update app.crm_campaigns set name = v_name, subject = v_title, step_kind = v_kind, follow_days = v_days, updated_at = now()
  where id = p_id;
  perform app.admin_log('crm.step_save', null, 'crm_campaign', p_id::text);
  return jsonb_build_object('ok', true, 'id', p_id);
end $fn$;
revoke all on function public.admin_crm_step_save(uuid, jsonb) from public, anon;
grant execute on function public.admin_crm_step_save(uuid, jsonb) to authenticated;

-- the pipeline settings and «Resend» are a mail's: a call or LinkedIn step keeps its own
create or replace function public.admin_crm_campaign_resend(p_id uuid, p_days int default 7) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_p app.crm_campaigns;
  v_id uuid;
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select * into v_p from app.crm_campaigns where id = p_id;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_p.step_kind <> 'mail' then
    return jsonb_build_object('ok', false, 'error', 'invalid_step');
  end if;
  if coalesce(p_days, 0) not between 1 and 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_follow');
  end if;
  if app.crm_chain_depth(v_p.id) >= 7 then
    return jsonb_build_object('ok', false, 'error', 'too_many_steps');
  end if;
  insert into app.crm_campaigns (name, kind, lang, subject, preheader, blocks, segment_id, list_id, utm_campaign, template_key, style,
                                 signature, sender_id, stage_target, follows_id, follow_days, follow_when, follow_auto, created_by)
  values (left(v_p.name || ' · resend', 120), v_p.kind, v_p.lang, v_p.subject, v_p.preheader, v_p.blocks, null, v_p.list_id,
          left(v_p.utm_campaign || '-resend', 60), v_p.template_key, v_p.style, v_p.signature, v_p.sender_id, null,
          v_p.id, p_days, 'no_click', true, auth.uid())
  returning id into v_id;
  perform app.admin_log('crm.campaign_resend', null, 'crm_campaign', v_id::text, null, jsonb_build_object('follows', p_id, 'days', p_days));
  return jsonb_build_object('ok', true, 'id', v_id);
end $fn$;

-- ---------------------------------------------------------------- tasks: done, skipped
create or replace function public.admin_crm_task_done(p_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  -- 0137: reopening a task also takes back a skip
  update app.crm_activities set done_at = case when done_at is null then now() end, skipped = false where id = p_id and kind = 'task';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app.admin_log('crm.task_done', null, 'crm_activity', p_id::text);
  return jsonb_build_object('ok', true);
end $fn$;

-- «Skip»: an open task a call or LinkedIn step made is passed over; the sequence goes on from now
create function public.admin_crm_task_skip(p_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  update app.crm_activities set done_at = now(), skipped = true
  where id = p_id and kind = 'task' and campaign_id is not null and done_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  perform app.admin_log('crm.task_skip', null, 'crm_activity', p_id::text);
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.admin_crm_task_skip(uuid) from public, anon;
grant execute on function public.admin_crm_task_skip(uuid) to authenticated;

-- 0120's task list, with the step that made a task (its kind, its journey) and whether it was skipped
create or replace function public.admin_crm_task_list(p_view text default 'open') returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if coalesce(p_view, '') not in ('open', 'done', 'all') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  return jsonb_build_object('ok', true,
    'counts', (select jsonb_build_object(
        'open', count(*) filter (where a.done_at is null),
        'done', count(*) filter (where a.done_at > now() - interval '90 days'),
        'all', count(*) filter (where a.done_at is null or a.done_at > now() - interval '90 days'),
        'journeys', count(*) filter (where a.campaign_id is not null and (a.done_at is null or a.done_at > now() - interval '90 days')))
      from app.crm_activities a where a.kind = 'task'),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'company_id', a.company_id, 'company', co.name,
        'contact', (select coalesce(nullif(btrim(c.name), ''), c.email) from app.crm_contacts c where c.id = a.contact_id),
        'body', a.body, 'due_at', a.due_at, 'done_at', a.done_at, 'created_at', a.created_at, 'admin_email', a.admin_email,
        'skipped', a.skipped, 'campaign_id', a.campaign_id, 'step_kind', st.step_kind,
        'journey', (select r.name from app.crm_campaigns r where r.id = app.crm_chain_root(st.id)))
        order by (a.done_at is not null), a.due_at nulls last, a.done_at desc, a.created_at), '[]')
      from app.crm_activities a join app.crm_companies co on co.id = a.company_id
      left join app.crm_campaigns st on st.id = a.campaign_id
      where a.kind = 'task'
        and case p_view when 'open' then a.done_at is null
                        when 'done' then a.done_at > now() - interval '90 days'
                        else a.done_at is null or a.done_at > now() - interval '90 days' end));
end $fn$;

-- ---------------------------------------------------------------- the sequence and the journeys, with task steps
create or replace function public.admin_crm_sequence(p_id uuid) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_root uuid;
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if not exists (select 1 from app.crm_campaigns where id = p_id) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_root := app.crm_chain_root(p_id);
  return jsonb_build_object('ok', true, 'steps', (
    with recursive down as (
      select c.*, 1 as step from app.crm_campaigns c where c.id = v_root
      union all select c.*, down.step + 1 from app.crm_campaigns c join down on c.follows_id = down.id where down.step < 20
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id, 'number', d.number, 'name', d.name, 'status', d.status, 'step', d.step, 'subject', d.subject,
      'step_kind', d.step_kind,
      'follow_days', d.follow_days, 'follow_when', d.follow_when, 'follow_auto', d.follow_auto,
      'scheduled_at', d.scheduled_at, 'finished_at', d.finished_at,
      'stats', app.crm_campaign_stats(d.id),
      -- 0137: a call or LinkedIn step's tasks, by state
      'tasks', case when d.step_kind <> 'mail' then (
                 select jsonb_build_object('made', count(*), 'open', count(*) filter (where a.done_at is null),
                                           'done', count(*) filter (where a.done_at is not null and not a.skipped),
                                           'skipped', count(*) filter (where a.skipped))
                 from app.crm_activities a where a.campaign_id = d.id and a.kind = 'task') end,
      -- answers logged on the recipients' companies after this step's mail reached them
      'replied', (select count(distinct co.id) from app.crm_sends s join app.crm_contacts c on c.id = s.contact_id
                  join app.crm_companies co on co.id = c.company_id
                  where s.campaign_id = d.id and s.kind = 'campaign' and s.status = 'sent'
                    and exists (select 1 from app.crm_activities a where a.company_id = co.id and a.kind = 'reply' and a.created_at >= s.sent_at)),
      'waiting', case when d.follow_auto and d.status in ('scheduled', 'sending')
                   then (select count(*) from app.crm_follow_audience((select c from app.crm_campaigns c where c.id = d.id)) x
                         where not exists (select 1 from app.crm_sends s where s.campaign_id = d.id and s.contact_id = x.contact_id)
                           and not exists (select 1 from app.crm_activities a where a.campaign_id = d.id and a.contact_id = x.contact_id)) end
      ) order by d.step, d.created_at), '[]') from down d));
end $fn$;

create or replace function public.admin_crm_journeys() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true, 'rows', (
    with recursive roots as (
      select r.* from app.crm_campaigns r
      where r.follows_id is null
        and (r.stage_target is not null or exists (select 1 from app.crm_campaigns f where f.follows_id = r.id))
    ), chain as (
      select r.id as root, r.id, 1 as step from roots r
      union all
      select chain.root, c.id, chain.step + 1 from app.crm_campaigns c join chain on c.follows_id = chain.id where chain.step < 20
    ), steps as (
      select ch.root, ch.step, c.* from chain ch join app.crm_campaigns c on c.id = ch.id
    ), per as (
      select r.id, r.number, r.name, r.status as first_status, r.stage_target, r.stage_on_send, r.created_at,
        (select count(*) from steps s where s.root = r.id and s.step_kind = 'mail') as mails,
        (select count(*) from steps s where s.root = r.id and s.step_kind <> 'mail') as tasks,
        (select bool_or(s.status in ('scheduled', 'sending')) from steps s where s.root = r.id) as running,
        (select bool_and(s.status in ('sent', 'cancelled')) from steps s where s.root = r.id) as finished,
        (select s.id from steps s where s.root = r.id order by s.step desc limit 1) as last_id,
        (select s.step_kind from steps s where s.root = r.id order by s.step desc limit 1) as last_kind,
        (select min(x.sent_at) from app.crm_sends x where x.campaign_id = r.id and x.kind = 'campaign' and x.status = 'sent') as first_sent
      from roots r
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'number', p.number, 'name', p.name,
      'status', case when p.first_status = 'cancelled' then 'cancelled'
                     when p.running then 'active'
                     when p.first_status = 'draft' then 'draft'
                     when p.finished then 'done' else 'active' end,
      'stage_target', p.stage_target, 'stage_on_send', p.stage_on_send, 'mails', p.mails, 'tasks', p.tasks,
      'reached', (select count(distinct x.contact_id) from app.crm_sends x where x.campaign_id = p.id and x.kind = 'campaign' and x.status = 'sent'),
      -- who an automatic step still waits to reach, and (0137) whose call or LinkedIn task is still open
      'in_journey', (select coalesce(sum((select count(*) from app.crm_follow_audience(s2) a
                                           where not exists (select 1 from app.crm_sends x where x.campaign_id = s2.id and x.contact_id = a.contact_id)
                                             and not exists (select 1 from app.crm_activities t where t.campaign_id = s2.id and t.contact_id = a.contact_id))), 0)
                     from app.crm_campaigns s2 join steps s on s.id = s2.id
                     where s.root = p.id and s2.follow_auto and s2.status in ('scheduled', 'sending'))
                  + (select count(*) from app.crm_activities t join steps s on s.id = t.campaign_id
                     where s.root = p.id and t.kind = 'task' and t.done_at is null),
      'completed', case when p.last_kind = 'mail'
                     then (select count(distinct x.contact_id) from app.crm_sends x where x.campaign_id = p.last_id and x.kind = 'campaign' and x.status = 'sent')
                     else (select count(distinct t.contact_id) from app.crm_activities t where t.campaign_id = p.last_id and t.kind = 'task' and t.done_at is not null) end,
      'moved', (select count(distinct co.id) from app.crm_sends x
                join app.crm_contacts c on c.id = x.contact_id join app.crm_companies co on co.id = c.company_id
                join app.crm_stages now_s on now_s.key = co.stage
                join app.crm_stages from_s on from_s.key = coalesce(p.stage_on_send, p.stage_target)
                where x.campaign_id = p.id and x.kind = 'campaign' and x.status = 'sent'
                  and now_s.kind in ('open', 'won') and now_s.sort > from_s.sort),
      'replied', (select count(distinct co.id) from app.crm_sends x
                  join app.crm_contacts c on c.id = x.contact_id join app.crm_companies co on co.id = c.company_id
                  where x.campaign_id = p.id and x.kind = 'campaign' and x.status = 'sent'
                    and exists (select 1 from app.crm_activities a where a.company_id = co.id and a.kind = 'reply' and a.created_at >= x.sent_at)),
      'first_sent', p.first_sent, 'created_at', p.created_at
    ) order by p.created_at desc), '[]') from per p));
end $fn$;

-- the campaign list says which rows are call or LinkedIn steps, so the Campaigns page lists mail only
create or replace function public.admin_crm_campaigns() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.admin_log('crm.campaigns');
  return jsonb_build_object('ok', true, 'rows', (
    select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'number', c.number, 'name', c.name, 'kind', c.kind, 'status', c.status,
      'subject', c.subject, 'segment', g.name, 'list', l.name_no, 'ab', btrim(c.subject_b) <> '', 'ab_winner', c.ab_winner,
      'scheduled_at', c.scheduled_at, 'finished_at', c.finished_at, 'audience', c.audience, 'utm_campaign', c.utm_campaign,
      'publish_web', c.publish_web, 'slug', c.slug, 'stats', app.crm_campaign_stats(c.id), 'step_kind', c.step_kind,
      'signups', (select count(*) from app.org_attribution a where c.utm_campaign in (a.first_campaign, a.last_campaign)))
      order by c.created_at desc), '[]')
    from app.crm_campaigns c left join app.crm_segments g on g.id = c.segment_id left join app.crm_lists l on l.id = c.list_id));
end $fn$;

-- ---------------------------------------------------------------- the dispatcher's claim
-- 0115's, with two changes: automatic follow-ups that send mail are the mail steps only, and in
-- business hours the call and LinkedIn steps make their tasks (app.crm_step_tasks). The rule that
-- finishes a step (app.crm_follow_done) now serves both kinds.
create or replace function public.crm_mail_claim(p_batch int default 25) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_c record;
  v_cc app.crm_campaigns;
  v_n int;
  v_test int;
  v_jobs jsonb := '[]';
  v_s record;
  v_token text;
  v_a numeric;
  v_b numeric;
  v_filter jsonb;
  v_left int;
begin
  -- start what is due: the audience, split for an A/B test when there is a subject B
  for v_c in select * from app.crm_campaigns where status = 'scheduled' and scheduled_at <= now() and not follow_auto for update skip locked loop
    v_filter := (select g.filter from app.crm_segments g where g.id = v_c.segment_id);
    if v_c.follows_id is not null then
      -- 0093, 0111: a follow-up goes to those the first mail reached the given days ago who have
      -- not answered, unsubscribed, bounced or moved on
      select * into v_cc from app.crm_campaigns where id = v_c.id;
      insert into app.crm_sends (kind, campaign_id, contact_id, to_email)
      select 'campaign', v_c.id, x.contact_id, x.email from app.crm_follow_audience(v_cc) x
      on conflict do nothing;
    elsif v_c.list_id is not null then
      insert into app.crm_sends (kind, campaign_id, contact_id, to_email)
      select 'campaign', v_c.id, c.id, c.email from app.crm_contacts c
      where app.crm_on_list(c, v_c.list_id)
        and (v_filter is null or c.id in (select x.id from app.crm_segment_contacts(v_filter) x))
        and (v_c.stage_target is null or exists (select 1 from app.crm_companies co where co.id = c.company_id and co.stage = v_c.stage_target))
      on conflict do nothing;
    elsif v_c.segment_id is null and v_c.stage_target is not null then
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

  -- 0111: automatic follow-ups add whoever has come due, in business hours
  if app.crm_business_hours() then
    for v_cc in select * from app.crm_campaigns where status in ('scheduled', 'sending') and follow_auto and step_kind = 'mail' and scheduled_at <= now()
        for update skip locked loop
      insert into app.crm_sends (kind, campaign_id, contact_id, to_email, variant)
      select 'campaign', v_cc.id, x.contact_id, x.email, 'a' from app.crm_follow_audience(v_cc) x
      on conflict do nothing;
      update app.crm_campaigns c set status = 'sending', started_at = coalesce(c.started_at, now()),
        audience = (select count(*) from app.crm_sends s where s.campaign_id = c.id and s.kind = 'campaign'), updated_at = now()
      where c.id = v_cc.id;
    end loop;
    -- 0137: call and LinkedIn steps make a task for each contact who has come due
    perform app.crm_step_tasks();
  end if;
  -- … and are done once the step before is done and its last contact's time has passed
  update app.crm_campaigns c set status = 'sent', finished_at = now(), updated_at = now()
  where c.follow_auto and c.status in ('scheduled', 'sending') and app.crm_follow_done(c);

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
  where c.status = 'sending' and not c.follow_auto
    and not exists (select 1 from app.crm_sends s where s.campaign_id = c.id and s.status in ('held', 'pending', 'sending'));

  -- 0111: the day's cap on campaign mail; tests and confirmations are never held by it
  v_left := (select s.daily_cap from app.crm_settings s where s.id)
          - (select count(*) from app.crm_sends s where s.kind = 'campaign' and s.status in ('sent', 'sending')
               and (coalesce(s.sent_at, now()) at time zone 'Europe/Oslo')::date = (now() at time zone 'Europe/Oslo')::date);

  for v_s in
    select s.id, s.kind, s.campaign_id, s.contact_id, s.to_email, s.variant from app.crm_sends s
    where (s.status = 'pending' or (s.status = 'sending' and s.leased_until < now())) and s.attempts < 5
      and (s.kind <> 'campaign' or v_left is null or v_left > 0)
    order by s.kind <> 'campaign' desc, s.created_at limit least(greatest(coalesce(p_batch, 25), 1), 50)
    for update skip locked
  loop
    if v_s.kind = 'campaign' and v_left is not null then
      if v_left <= 0 then continue; end if;
      v_left := v_left - 1;
    end if;
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
