-- 0057_crm_claim_basis.sql — the claim tells the renderer each recipient's basis (D-103).
--
-- A mail to a company's role address (basis 'business') says in its footer why that address
-- gets it: the company is listed with it in Enhetsregisteret. crm_mail_claim (0056) now
-- includes the contact's basis in each job. Nothing else changes.

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
    if v_c.list_id is not null then
      insert into app.crm_sends (kind, campaign_id, contact_id, to_email)
      select 'campaign', v_c.id, c.id, c.email from app.crm_contacts c
      where app.crm_on_list(c, v_c.list_id)
        and (v_filter is null or c.id in (select x.id from app.crm_segment_contacts(v_filter) x))
      on conflict do nothing;
    else
      insert into app.crm_sends (kind, campaign_id, contact_id, to_email)
      select 'campaign', v_c.id, s.id, s.email
      from (select distinct on (x.id) x.* from app.crm_segment_contacts(coalesce(v_filter, '{"types":[]}')) x) s
      where app.crm_mailable(s) and s.lang = v_c.lang
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
      'campaign', (select jsonb_build_object('kind', g.kind, 'style', g.style, 'signature', g.signature,
                     'subject', case when v_s.variant = 'b' and btrim(g.subject_b) <> '' then g.subject_b else g.subject end,
                     'preheader', g.preheader, 'blocks', g.blocks, 'utm_campaign', g.utm_campaign,
                     'web_slug', case when g.publish_web then g.slug end,
                     'list', (select jsonb_build_object('name_no', l.name_no, 'name_en', l.name_en) from app.crm_lists l where l.id = g.list_id))
                   from app.crm_campaigns g where g.id = v_s.campaign_id));
  end loop;
  return v_jobs;
end $fn$;
