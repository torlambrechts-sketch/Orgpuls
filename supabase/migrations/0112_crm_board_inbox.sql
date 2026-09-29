-- 0112 — the pipeline as a board, and an inbox with a first-response clock (X-091)
--
-- Two practices from the SaaS CRM brief (X-091) the CRM had no place for:
--
--   exit_criterion   each stage says what the buyer did to reach it («they answered», «a meeting is
--                    booked»), shown on the board's column, editable with the stage. A stage that
--                    closes on the seller's own activity is how pipelines fill with wishful deals.
--   sla_minutes      the first-response target for an inbound lead. Answering within minutes rather
--                    than hours is the most studied lever in B2B sales and the least acted on; the
--                    inbox shows each lead's clock against it.
--
-- admin_crm_inbox: the inbound leads of the last days — trial sign-ups (companies from sign-up), and
-- people who wrote through the contact form or asked for a demo — each with when it came and when
-- someone first answered it (the first call, mail, meeting, reply or note logged on it after it came).
-- A lead's own message is not read here: the inbox lists who and when, never what they wrote.

alter table app.crm_stages
  add column exit_criterion text check (exit_criterion is null or char_length(btrim(exit_criterion)) between 1 and 200);
comment on column app.crm_stages.exit_criterion is 'What the buyer did to reach this stage (0112), shown on the board.';
update app.crm_stages set exit_criterion = v.c from (values
  ('new', 'In the CRM, not yet contacted'),
  ('contacted', 'We wrote or called; no answer yet'),
  ('engaged', 'They answered'),
  ('meeting', 'A meeting or demo is booked'),
  ('trial', 'Their trial is running'),
  ('customer', 'They pay'),
  ('nurture', 'Not now; keep in touch'),
  ('lost', 'They said no'),
  ('not_relevant', 'Not a fit')) v(k, c)
where key = v.k and exit_criterion is null;

alter table app.crm_settings
  add column sla_minutes int not null default 5 check (sla_minutes between 1 and 1440);
comment on column app.crm_settings.sla_minutes is 'First-response target for an inbound lead, in minutes (0112).';

-- ---------------------------------------------------------------- stages, with their exit criterion
create or replace function public.admin_crm_stages() returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true,
    'reply_stage', (select s.reply_stage from app.crm_settings s),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('key', s.key, 'name', s.name, 'sort', s.sort, 'kind', s.kind, 'managed', s.managed,
               'archived', s.archived_at is not null, 'exit_criterion', s.exit_criterion,
               'companies', (select count(*) from app.crm_companies co where co.stage = s.key),
               'campaigns', (select count(*) from app.crm_campaigns c where s.key in (c.stage_target, c.stage_on_send)))
             order by s.sort, s.key), '[]') from app.crm_stages s));
end $fn$;
revoke all on function public.admin_crm_stages() from public, anon;
grant execute on function public.admin_crm_stages() to authenticated;

create or replace function public.admin_crm_stage_save(p_key text, p jsonb) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_old app.crm_stages;
  v_kind text := coalesce(p->>'kind', 'open');
  v_exit text := nullif(btrim(coalesce(p->>'exit_criterion', '')), '');
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if coalesce(p_key, '') !~ '^[a-z][a-z0-9_]{1,39}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_key');
  end if;
  if char_length(btrim(coalesce(p->>'name', ''))) not between 1 and 60 or coalesce(p->>'sort', '') !~ '^[0-9]{1,4}$'
     or v_kind not in ('open', 'won', 'lost', 'parked') or char_length(coalesce(v_exit, '')) > 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into v_old from app.crm_stages where key = p_key;
  if v_old.key is null then
    insert into app.crm_stages (key, name, sort, kind, exit_criterion) values (p_key, btrim(p->>'name'), (p->>'sort')::int, v_kind, v_exit);
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
    exit_criterion = case when p ? 'exit_criterion' then v_exit else exit_criterion end,
    archived_at = case when coalesce((p->>'archived')::boolean, false) then coalesce(archived_at, now()) end
  where key = p_key;
  perform app.admin_log('crm.stage_update', null, 'crm_stage', p_key);
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.admin_crm_stage_save(text, jsonb) from public, anon;
grant execute on function public.admin_crm_stage_save(text, jsonb) to authenticated;

-- ---------------------------------------------------------------- the first-response target
create function public.admin_crm_sla(p_minutes int) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
begin
  if not app.crm_can_write() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if p_minutes is null or p_minutes not between 1 and 1440 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  update app.crm_settings set sla_minutes = p_minutes, changed_by = auth.uid(), changed_at = now() where id;
  perform app.admin_log('crm.sla', null, null, null, null, jsonb_build_object('minutes', p_minutes));
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.admin_crm_sla(int) from public, anon;
grant execute on function public.admin_crm_sla(int) to authenticated;

-- ---------------------------------------------------------------- the inbox
create function public.admin_crm_inbox(p_days int default 30) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_sla int := (select s.sla_minutes from app.crm_settings s where s.id);
begin
  if not app.crm_can_read() then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  perform app.crm_sync();
  perform app.admin_log('crm.inbox');
  return (
    with leads as (
      -- a trial sign-up: the company the sign-up made
      select 'trial'::text as kind, co.id as company_id, null::uuid as contact_id, co.name as company,
             (select coalesce(c.name, c.email) from app.crm_contacts c where c.company_id = co.id order by c.created_at limit 1) as person,
             co.employees, co.stage, co.created_at,
             (select min(a.created_at) from app.crm_activities a where a.company_id = co.id
                and a.kind in ('call', 'email', 'meeting', 'reply', 'note') and a.created_at >= co.created_at) as answered_at
      from app.crm_companies co
      where co.source = 'signup' and co.created_at >= now() - make_interval(days => v_days)
      union all
      -- someone who wrote to us or asked for a demo
      select c.source, c.company_id, c.id, coalesce(co.name, c.company), coalesce(c.name, c.email),
             co.employees, co.stage, c.created_at,
             (select min(a.created_at) from app.crm_activities a where (a.contact_id = c.id or (c.company_id is not null and a.company_id = c.company_id))
                and a.kind in ('call', 'email', 'meeting', 'reply', 'note') and a.created_at >= c.created_at)
      from app.crm_contacts c left join app.crm_companies co on co.id = c.company_id
      where c.source in ('contact_form', 'demo') and c.created_at >= now() - make_interval(days => v_days)
    ),
    week as (select * from leads where created_at >= now() - interval '7 days')
    select jsonb_build_object('ok', true, 'sla_minutes', v_sla,
      'awaiting', (select count(*) from leads where answered_at is null),
      'week', jsonb_build_object(
        'leads', (select count(*) from week),
        'trials', (select count(*) from week where kind = 'trial'),
        'answered', (select count(*) from week where answered_at is not null),
        'median_minutes', (select percentile_cont(0.5) within group (order by extract(epoch from answered_at - created_at) / 60)
                           from week where answered_at is not null),
        'within_sla', (select count(*) from week where answered_at is not null and answered_at - created_at <= make_interval(mins => v_sla))),
      'rows', (select coalesce(jsonb_agg(jsonb_build_object('kind', l.kind, 'company_id', l.company_id, 'contact_id', l.contact_id,
                 'company', l.company, 'person', l.person, 'employees', l.employees, 'stage', l.stage,
                 'created_at', l.created_at, 'answered_at', l.answered_at)
               order by (l.answered_at is not null), l.created_at desc), '[]') from leads l))
  );
end $fn$;
revoke all on function public.admin_crm_inbox(int) from public, anon;
grant execute on function public.admin_crm_inbox(int) to authenticated;
