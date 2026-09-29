-- 0111 — follow-ups that send themselves, with the exits and limits good practice asks for (X-091)
--
-- A follow-up (0093) was a campaign scheduled by hand, sent in one batch to those the first mail
-- had reached N days before. The research (docs/implementation/crm-conversion.md, X-076; the SaaS
-- CRM brief, X-091) puts ~40 % of replies on follow-ups, 3–4 days or a week apart, capped at about
-- seven touches, and ending at once for anyone who answers. So:
--
--   follow_auto   the follow-up sends itself: armed once, each recipient gets it when their own
--                 first mail is follow_days old, on weekdays 08–16 Oslo time, until the first mail's
--                 last recipient has passed; then it is done
--   follow_when   who it goes to: no_reply (everyone who has not answered or moved on, 0093's rule),
--                 no_click, or no_open. Opens are the weakest signal — Apple's proxy opens are not
--                 counted (0053), so «not opened» includes Apple readers — and the screen says so
--
-- For every follow-up, by hand or by itself, the exits are: an unsubscribe, a hard bounce, invalid,
-- blocked or spam; a reply logged on the company since the first mail; the company moved on from
-- the first mail's stage; and (new) a company that is won, lost or parked. A chain of follow-ups is
-- capped at seven mails in all. An automatic follow-up has no A/B subject.
--
-- crm_settings.daily_cap: at most this many campaign mails a day (Oslo), so a new sending domain is
-- warmed and a cold batch does not arrive all at once. Tests and confirmations are never held.
--
-- admin_crm_campaign_resend: «Resend after 7 days» — a draft follow-up with the first mail's
-- content, to those who have not clicked, sending itself. admin_crm_sequence: the chain a campaign
-- belongs to, each step with its funnel and the replies it brought.

alter table app.crm_campaigns
  add column follow_auto boolean not null default false,
  add column follow_when text not null default 'no_reply' check (follow_when in ('no_reply', 'no_click', 'no_open')),
  add constraint crm_campaigns_follow_auto check (not follow_auto or follows_id is not null);
comment on column app.crm_campaigns.follow_auto is
  'The follow-up sends itself to each recipient when their first mail is follow_days old, weekdays 08–16 Oslo (0111).';

alter table app.crm_settings
  add column daily_cap int check (daily_cap is null or daily_cap between 1 and 5000);
comment on column app.crm_settings.daily_cap is 'At most this many campaign mails a day, Oslo time (0111); null: no cap.';

-- ---------------------------------------------------------------- helpers
create function app.crm_business_hours(t timestamptz default now()) returns boolean
  language sql stable set search_path = ''
as $fn$
  select extract(isodow from t at time zone 'Europe/Oslo') between 1 and 5
     and (t at time zone 'Europe/Oslo')::time between time '08:00' and time '16:00'
$fn$;

/** how many mails a chain holds up to and including this campaign */
create function app.crm_chain_depth(p_id uuid) returns int
  language sql stable security definer set search_path = ''
as $fn$
  with recursive up as (
    select c.id, c.follows_id, 1 as n from app.crm_campaigns c where c.id = p_id
    union all
    select c.id, c.follows_id, up.n + 1 from app.crm_campaigns c join up on c.id = up.follows_id where up.n < 20
  )
  select coalesce(max(n), 0) from up
$fn$;

/**
 * Who a follow-up may go to now: those its first mail reached at least follow_days ago, still
 * mailable, who have not unsubscribed, bounced, answered or moved on — narrowed by follow_when.
 */
create function app.crm_follow_audience(v_c app.crm_campaigns) returns table (contact_id uuid, email text)
  language sql stable security definer set search_path = ''
as $fn$
  select c.id, c.email
  from app.crm_sends p
  join app.crm_campaigns pc on pc.id = p.campaign_id
  join app.crm_contacts c on c.id = p.contact_id
  left join app.crm_companies co on co.id = c.company_id
  where p.campaign_id = v_c.follows_id and p.kind = 'campaign' and p.status = 'sent'
    and p.sent_at <= now() - make_interval(days => v_c.follow_days)
    and p.unsubscribed_at is null and coalesce(p.delivery::text, '') not in ('hard_bounce', 'invalid', 'blocked', 'spam')
    and (v_c.follow_when <> 'no_click' or p.clicked_at is null)
    and (v_c.follow_when <> 'no_open' or (p.opened_at is null and p.clicked_at is null))
    -- an answer ends the conversation's automation
    and (co.id is null or not exists (select 1 from app.crm_activities a where a.company_id = co.id and a.kind = 'reply' and a.created_at >= p.sent_at))
    -- won, lost or parked companies are not chased
    and (co.id is null or not exists (select 1 from app.crm_stages st where st.key = co.stage and st.kind in ('won', 'lost', 'parked')))
    and (coalesce(pc.stage_on_send, pc.stage_target) is null or co.stage = coalesce(pc.stage_on_send, pc.stage_target))
    and (v_c.stage_target is null or co.stage = v_c.stage_target)
    and case when v_c.list_id is not null then app.crm_on_list(c, v_c.list_id) else app.crm_mailable(c) end
$fn$;

-- ---------------------------------------------------------------- readiness: an automatic follow-up may be armed before its first mail goes
create or replace function app.crm_campaign_ready(c app.crm_campaigns) returns text
  language sql stable set search_path = ''
as $fn$
  select case
    when char_length(btrim(c.subject)) = 0 then 'no_subject'
    when not app.crm_blocks_ok(c.blocks) then 'invalid_blocks'
    when c.segment_id is null and c.list_id is null and c.stage_target is null and c.follows_id is null then 'no_segment'
    when c.publish_web and c.slug is null then 'no_slug'
    when c.follows_id is not null and not exists (select 1 from app.crm_campaigns p where p.id = c.follows_id
           and (p.status in ('sending', 'sent') or (c.follow_auto and p.status = 'scheduled'))) then 'follows_unsent'
    when c.follow_auto and btrim(c.subject_b) <> '' then 'auto_no_ab'
  end
$fn$;

-- ---------------------------------------------------------------- the pipeline settings, with the follow-up's rule
create or replace function public.admin_crm_campaign_pipeline(p_id uuid, p jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_c app.crm_campaigns;
  v_parent app.crm_campaigns;
  v_target text := nullif(p->>'stage_target', '');
  v_on_send text := nullif(p->>'stage_on_send', '');
  v_when text := coalesce(nullif(p->>'follow_when', ''), 'no_reply');
  v_auto boolean;
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
  if v_when not in ('no_reply', 'no_click', 'no_open') then
    return jsonb_build_object('ok', false, 'error', 'invalid_follow');
  end if;
  begin
    v_sender := nullif(p->>'sender_id', '')::uuid;
    v_follows := nullif(p->>'follows_id', '')::uuid;
    v_days := nullif(p->>'follow_days', '')::int;
    v_auto := coalesce((p->>'follow_auto')::boolean, false);
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
    -- no loops, and at most seven mails in a chain
    if exists (with recursive up as (select v_parent.id as id, v_parent.follows_id as f, 1 as n
                                     union all select c.id, c.follows_id, up.n + 1 from app.crm_campaigns c join up on c.id = up.f where up.n < 20)
               select 1 from up where up.id = p_id) then
      return jsonb_build_object('ok', false, 'error', 'invalid_follow');
    end if;
    if app.crm_chain_depth(v_parent.id) >= 7 then
      return jsonb_build_object('ok', false, 'error', 'too_many_steps');
    end if;
  end if;
  if v_follows is null then v_auto := false; end if;
  update app.crm_campaigns set stage_target = v_target, stage_on_send = v_on_send, sender_id = v_sender,
    follows_id = v_follows, follow_days = case when v_follows is not null then v_days end,
    follow_when = case when v_follows is not null then v_when else 'no_reply' end,
    follow_auto = v_auto,
    list_id = case when v_follows is not null then v_parent.list_id else list_id end,
    lang = case when v_follows is not null then v_parent.lang else lang end,
    updated_at = now()
  where id = p_id;
  perform app.admin_log('crm.campaign_pipeline', null, 'crm_campaign', p_id::text);
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.admin_crm_campaign_pipeline(uuid, jsonb) from public, anon;
grant execute on function public.admin_crm_campaign_pipeline(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------- «Resend after 7 days»
create function public.admin_crm_campaign_resend(p_id uuid, p_days int default 7) returns jsonb
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
revoke all on function public.admin_crm_campaign_resend(uuid, int) from public, anon;
grant execute on function public.admin_crm_campaign_resend(uuid, int) to authenticated;

-- ---------------------------------------------------------------- the chain, step by step
create function public.admin_crm_sequence(p_id uuid) returns jsonb
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
  with recursive up as (
    select c.id, c.follows_id, 1 as n from app.crm_campaigns c where c.id = p_id
    union all select c.id, c.follows_id, up.n + 1 from app.crm_campaigns c join up on c.id = up.follows_id where up.n < 20
  )
  select id into v_root from up order by n desc limit 1;
  return jsonb_build_object('ok', true, 'steps', (
    with recursive down as (
      select c.*, 1 as step from app.crm_campaigns c where c.id = v_root
      union all select c.*, down.step + 1 from app.crm_campaigns c join down on c.follows_id = down.id where down.step < 20
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id, 'number', d.number, 'name', d.name, 'status', d.status, 'step', d.step, 'subject', d.subject,
      'follow_days', d.follow_days, 'follow_when', d.follow_when, 'follow_auto', d.follow_auto,
      'scheduled_at', d.scheduled_at, 'finished_at', d.finished_at,
      'stats', app.crm_campaign_stats(d.id),
      -- answers logged on the recipients' companies after this step's mail reached them
      'replied', (select count(distinct co.id) from app.crm_sends s join app.crm_contacts c on c.id = s.contact_id
                  join app.crm_companies co on co.id = c.company_id
                  where s.campaign_id = d.id and s.kind = 'campaign' and s.status = 'sent'
                    and exists (select 1 from app.crm_activities a where a.company_id = co.id and a.kind = 'reply' and a.created_at >= s.sent_at)),
      'waiting', case when d.follow_auto and d.status in ('scheduled', 'sending')
                   then (select count(*) from app.crm_follow_audience((select c from app.crm_campaigns c where c.id = d.id)) x where not exists (select 1 from app.crm_sends s where s.campaign_id = d.id and s.contact_id = x.contact_id)) end
      ) order by d.step, d.created_at), '[]') from down d));
end $fn$;
revoke all on function public.admin_crm_sequence(uuid) from public, anon;
grant execute on function public.admin_crm_sequence(uuid) to authenticated;

-- ---------------------------------------------------------------- the daily cap
create function public.admin_crm_daily_cap(p_cap int) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_cap is not null and p_cap not between 1 and 5000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  update app.crm_settings set daily_cap = p_cap, changed_by = auth.uid(), changed_at = now() where id;
  perform app.admin_log('crm.daily_cap', null, null, null, null, jsonb_build_object('cap', p_cap));
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.admin_crm_daily_cap(int) from public, anon;
grant execute on function public.admin_crm_daily_cap(int) to authenticated;

create function public.admin_crm_sending() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true,
    'daily_cap', (select s.daily_cap from app.crm_settings s where s.id),
    'sent_today', (select count(*) from app.crm_sends s where s.kind = 'campaign' and s.status = 'sent'
                   and (s.sent_at at time zone 'Europe/Oslo')::date = (now() at time zone 'Europe/Oslo')::date),
    'business_hours', app.crm_business_hours());
end $fn$;
revoke all on function public.admin_crm_sending() from public, anon;
grant execute on function public.admin_crm_sending() to authenticated;

-- ---------------------------------------------------------------- the dispatcher's claim
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
    for v_cc in select * from app.crm_campaigns where status in ('scheduled', 'sending') and follow_auto and scheduled_at <= now()
        for update skip locked loop
      insert into app.crm_sends (kind, campaign_id, contact_id, to_email, variant)
      select 'campaign', v_cc.id, x.contact_id, x.email, 'a' from app.crm_follow_audience(v_cc) x
      on conflict do nothing;
      update app.crm_campaigns c set status = 'sending', started_at = coalesce(c.started_at, now()),
        audience = (select count(*) from app.crm_sends s where s.campaign_id = c.id and s.kind = 'campaign'), updated_at = now()
      where c.id = v_cc.id;
    end loop;
  end if;
  -- … and are done once the first mail is done and its last recipient's time has passed
  update app.crm_campaigns c set status = 'sent', finished_at = now(), updated_at = now()
  where c.follow_auto and c.status in ('scheduled', 'sending')
    and exists (select 1 from app.crm_campaigns p where p.id = c.follows_id and p.status in ('sent', 'cancelled')
                  and coalesce(p.finished_at, p.updated_at) + make_interval(days => c.follow_days + 1) < now())
    and not exists (select 1 from app.crm_sends s where s.campaign_id = c.id and s.status in ('held', 'pending', 'sending'));

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
