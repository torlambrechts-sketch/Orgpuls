-- 0100_round_page.sql — «Dette sa dere, dette gjør vi»: a page per closed round for everyone
-- who was asked (gap analysis P1-3; D-151).
--
-- Every round carries a link of its own (rounds.share_slug: 96 random bits, base64url) and a
-- switch (rounds.results_page, on unless the daglig leder turns it off). Once the round has
-- closed, public.round_page(slug) returns, to anyone holding the link:
--   * the organisation's name and which round it was;
--   * how many were asked and how many answered, the same totals the leaders read
--     (public.participation) — a count, never who;
--   * the index and each factor's for the whole organisation only, under the rule the leaders'
--     own whole-house reading applies (public.results_summary): nothing below k respondents, and
--     a factor only where every one of its statements has k answers. No department, no
--     location, no statement, no comment: there is no cell here a difference could be taken
--     between;
--   * the collective measures decided from the round (not the proposed ones, never an
--     individual one), with factor, status and date. The title is the leaders' own text; any
--     employee's name in it is masked as in the comments (0095), while a department or a place
--     stays, since a measure for «lageret» is the point of it. Its owner is not named.
-- Nothing is logged per view.
--
-- The link goes in the round's results notice to the employees, and the last round's in the
-- next invitation (dispatch_claim's results_page). A sandbox's rounds get links of their own.

-- ---------------------------------------------------------------- the link and the switch
create function app.new_share_slug() returns text
language sql volatile set search_path = '' as $$
  select translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/', '-_')
$$;
comment on function app.new_share_slug() is
  'A round''s page link (0100): 12 random bytes, 16 characters of base64url.';

alter table app.rounds
  add column share_slug   text    not null default app.new_share_slug(),
  add column results_page boolean not null default true;
alter table app.rounds
  add constraint rounds_share_slug_key unique (share_slug),
  add constraint rounds_share_slug_shape check (share_slug ~ '^[A-Za-z0-9_-]{16}$');

comment on column app.rounds.share_slug is
  'The link to the round''s page for employees, /r/<slug> (0100, P1-3). Unguessable, not a secret of anyone''s.';
comment on column app.rounds.results_page is
  'Whether the round''s page is shown once it has closed (0100). The daglig leder may turn it off.';

create function public.set_results_page(p_round uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select r.org_id into v_org from app.rounds r where r.id = p_round;
  if v_org is null or not app.has_role(v_org, array['daglig_leder']::app.org_role[]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update app.rounds set results_page = coalesce(p_on, true) where id = p_round;
  return jsonb_build_object('results_page', coalesce(p_on, true));
end $$;
revoke all on function public.set_results_page(uuid, boolean) from public, anon;
grant execute on function public.set_results_page(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------- the page
create function public.round_page(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r          record;
  v_k        int;
  v_n        int;
  v_asked    int;
  v_answered int;
  v_factors  jsonb;
  v_overall  numeric;
  v_measures jsonb;
  v_pat      text[];
begin
  -- one answer for a link that is malformed, unknown, not yet closed or switched off
  if p_slug is null or p_slug !~ '^[A-Za-z0-9_-]{16}$' then
    return jsonb_build_object('error', 'not_available');
  end if;
  select ro.id, ro.org_id, ro.opens_at, ro.closes_at, ms.kind, ms.year, org.name as org_name
  into r
  from app.rounds ro
  join app.measurements ms on ms.id = ro.measurement_id
  join app.organizations org on org.id = ro.org_id
  where ro.share_slug = p_slug and ro.status = 'lukket' and ro.results_page;
  if r.id is null then
    return jsonb_build_object('error', 'not_available');
  end if;

  v_k := app.k_threshold(r.org_id);
  select count(*) into v_n from app.responses resp where resp.round_id = r.id;

  -- the totals public.participation gives the leaders: invited and still employed, and answered
  select count(e.id)::int, count(i.responded_at)::int into v_asked, v_answered
  from app.invitations i
  join app.employees e on e.id = i.employee_id and e.active
  where i.round_id = r.id;

  if v_n >= v_k then
    -- the whole house only, as public.results_summary reads it for the daglig leder
    select jsonb_agg(x order by (x->>'sort_order')::int) into v_factors
    from (
      select jsonb_build_object('key', f.key, 'sort_order', f.sort_order,
               'index', round(avg(app.to_index(ans.value))),
               'band', app.risk_band(round(avg(app.to_index(ans.value))))) as x
      from app.answers ans
      join app.responses resp on resp.id = ans.response_id
      join app.factors f on f.key = ans.factor_key
      where resp.round_id = r.id
      group by f.key, f.sort_order
      having (
        select min(y.m) from (
          select count(distinct a2.response_id) as m
          from app.statements st
          left join app.answers a2
            on a2.factor_key = st.factor_key and a2.ordinal = st.ordinal
           and a2.response_id in (select r3.id from app.responses r3 where r3.round_id = r.id)
          where st.factor_key = f.key
          group by st.ordinal) y) >= v_k
    ) s;
    select round(avg((e->>'index')::numeric)) into v_overall
    from jsonb_array_elements(coalesce(v_factors, '[]'::jsonb)) e;
  end if;

  -- people's names only: a measure's department or place is what employees need to see
  v_pat := app.mask_patterns(r.org_id);
  v_pat := array[null, null, v_pat[3], v_pat[4]];
  select coalesce(jsonb_agg(jsonb_build_object(
           'title', app.mask_apply(m.title, v_pat),
           'factor', m.factor_key,
           'step', m.step,
           'due', m.due_date,
           'done', m.completed_on)
         order by array_position(array['pagar', 'besluttet', 'gjennomfort', 'effekt_malt', 'lukket']::app.measure_step[], m.step),
                  m.due_date nulls last, m.title), '[]'::jsonb)
  into v_measures
  from app.measures m
  where m.round_id = r.id and m.kind = 'kollektivt' and m.step <> 'foreslatt';

  return jsonb_build_object(
    'status', case when v_n >= v_k then 'ok' else 'insufficient_data' end,
    'org', r.org_name,
    'round', jsonb_build_object('kind', r.kind, 'year', r.year, 'opens_at', r.opens_at, 'closes_at', r.closes_at),
    'threshold', v_k,
    'asked', coalesce(v_asked, 0),
    'answered', coalesce(v_answered, 0),
    'index', v_overall,
    'band', case when v_overall is not null then app.risk_band(v_overall) end,
    'factors', coalesce(v_factors, '[]'::jsonb),
    'measures', v_measures);
end $$;
revoke all on function public.round_page(text) from public;
grant execute on function public.round_page(text) to anon, authenticated;

-- ---------------------------------------------------------------- a sandbox's own links
create or replace function app.demo_copy_table(p_table text, p_template uuid, p_org uuid, p_owner uuid, p_build uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
as $fn$
declare
  v_plan  app.demo_copy_plan;
  v_rel   regclass := ('app.' || quote_ident(p_table))::regclass;
  v_cols  text;
  v_exprs text;
  v_where text;
  v_n     bigint;
begin
  select * into v_plan from app.demo_copy_plan where table_name = p_table and mode = 'copy';
  if not found then
    raise exception 'demo: % is not in the copy plan', p_table;
  end if;
  v_where := case when v_plan.via is null then 'x.org_id = $3'
                  else format('x.%I in (select m.old from app.demo_id_map m where m.build = $4)', v_plan.via) end;

  -- an id of this table's own is given a new value before any row points at it
  if exists (select 1 from pg_attribute a join pg_index i on i.indrelid = a.attrelid and i.indisprimary
             where a.attrelid = v_rel and a.attname = 'id' and i.indkey[0] = a.attnum and i.indnatts = 1
               and a.atttypid = 'uuid'::regtype) then
    execute format('insert into app.demo_id_map (build, old, new) select $4, x.id, gen_random_uuid() from app.%I x where %s',
                   p_table, v_where) using p_org, p_owner, p_template, p_build;
  end if;

  select string_agg(quote_ident(a.attname), ', ' order by a.attnum),
         string_agg(case
           -- every round goes in open: the triggers that fill a planned round from the
           -- organisation's defaults and modules (round_apply_defaults, round_default_modules)
           -- then stay out of it, and the round takes its own state once its rows are copied
           when p_table = 'rounds' and a.attname = 'status' then $$'apen'::app.round_status$$
           when p_table = 'rounds' and a.attname = 'frozen_at' then 'null'
           -- 0100: a sandbox's round has a page link of its own, never the template's
           when p_table = 'rounds' and a.attname = 'share_slug' then 'app.new_share_slug()'
           when p_table in ('invitations', 'comment_threads') and a.attname in ('token_hash', 'key_hash') then
             'extensions.digest(extensions.gen_random_bytes(32), ''sha256'')'
           when a.attname = 'org_id' then '$1'
           when a.atttypid = 'uuid'::regtype and fk.target in ('auth.users', 'app.profiles') then
             format('case when x.%I is null then null else $2 end', a.attname)
           when a.atttypid = 'uuid'::regtype then
             format('coalesce((select m.new from app.demo_id_map m where m.build = $4 and m.old = x.%1$I), x.%1$I)', a.attname)
           when a.atttypid = 'uuid[]'::regtype then
             format('case when x.%1$I is null then null else coalesce((select array_agg(coalesce(m.new, u.e) order by u.o) '
                    'from unnest(x.%1$I) with ordinality u(e, o) left join app.demo_id_map m on m.build = $4 and m.old = u.e), ''{}'') end',
                    a.attname)
           else format('x.%I', a.attname) end, ', ' order by a.attnum)
    into v_cols, v_exprs
  from pg_attribute a
  left join lateral (
    select k.confrelid::regclass::text as target from pg_constraint k
    where k.conrelid = a.attrelid and k.contype = 'f' and k.conkey = array[a.attnum]
    limit 1) fk on true
  where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
    and a.attidentity = '' and a.attgenerated = '';

  -- a round opened here pins today's wording, which the template's own then meets
  execute format('insert into app.%I (%s) select %s from app.%I x where %s%s',
                 p_table, v_cols, v_exprs, p_table, v_where,
                 case when p_table = 'round_translations' then ' on conflict do nothing' else '' end)
    using p_org, p_owner, p_template, p_build;
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;

revoke all on function app.demo_copy_table(text, uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- the link in the mail
create or replace function public.dispatch_claim(p_batch integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
as $$

declare
  v_out     jsonb := '[]'::jsonb;
  x         record;
  r         record;
  v_why     text;
  v_rcpt    jsonb;
  v_key     text;
  v_pulse   int;
  v_channel text;
  v_email   text;
  v_phone   text;
  v_sms     boolean;
  v_rule    text;
  v_personal boolean;
  v_org     record;
  v_items   jsonb;
begin
  for x in
    select o.*
    from app.outbox o
    join app.organizations org on org.id = o.org_id
    left join app.survey_defaults sd on sd.org_id = o.org_id
    where o.sent_at is null
      and o.failed_at is null
      and o.due_at <= now()
      and (o.claimed_at is null or o.claimed_at < now() - interval '10 minutes')
      and org.mail_enabled
      -- quiet hours: no invitation or reminder between 21 and 07 where the organisation is.
      -- A link somebody asked for is not held.
      and (o.kind not in ('invitasjon', 'paminnelse', 'siste_paminnelse')
           or not coalesce(sd.quiet_hours, true)
           or extract(hour from now() at time zone org.timezone) between 7 and 20)
    order by o.due_at, o.id
    limit least(greatest(coalesce(p_batch, 20), 1), 100)
    for update of o skip locked
  loop
    -- 0099: the organisation on its own, since a measure's notice belongs to no round
    select org.name as org_name, org.default_lang, app.k_threshold(org.id) as k,
           org.sms_enabled, org.sms_when, org.sms_text, org.invite_greeting,
           (select p.full_name from app.profiles p where p.id = org.invite_greeting_by) as greeting_by
    into v_org
    from app.organizations org where org.id = x.org_id;

    r := null;
    select ro.status, ro.opens_at, ro.closes_at, ro.sms_when as round_sms_when, ms.kind, ms.year
    into r
    from app.rounds ro
    join app.measurements ms on ms.id = ro.measurement_id
    where ro.id = x.round_id;

    -- 0099: a measure's notice lists what is overdue now, for its owner or for the verneombud
    v_items := null;
    if x.kind = 'tiltak_forfalt' then
      select coalesce(jsonb_agg(jsonb_build_object('title', me.title, 'due', me.due_date) order by me.due_date nulls last, me.title), '[]'::jsonb)
      into v_items
      from app.overdue_measures(x.org_id) me
      where x.employee_id is null or me.owner_employee_id = x.employee_id;
    end if;

    v_personal := x.kind in ('invitasjon', 'paminnelse', 'siste_paminnelse', 'lenke');

    v_why := case
      when v_personal and r.status <> 'apen' then 'round_not_open'
      when v_personal and exists (
        select 1 from app.invitations i
        where i.id = x.invitation_id and (i.responded_at is not null or i.expires_at <= now())
      ) then 'answered_or_expired'
      when x.kind = 'forvarsel' and r.status <> 'planlagt' then 'round_already_open'
      when x.kind = 'resultat' and (r.status <> 'lukket' or x.due_at < now() - interval '14 days') then 'stale'
      -- 0099: nothing overdue any more, or a round no longer open
      when x.kind = 'tiltak_forfalt' and jsonb_array_length(v_items) = 0 then 'resolved'
      when x.kind = 'svarprosent' and (r.status is distinct from 'apen' or x.due_at < now() - interval '3 days') then 'stale'
    end;

    v_channel := 'email';
    if v_why is null and v_personal then
      -- one person: choose the channel that carries their link
      select case when d.email is null or app.reserved_address(d.email) then null else d.email end, d.phone
      into v_email, v_phone
      from app.dispatch_recipients(x.id) d
      limit 1;
      v_sms := v_org.sms_enabled and v_phone is not null;
      v_rule := coalesce(r.round_sms_when, v_org.sms_when);
      if x.kind = 'lenke' then
        -- the channel they typed their address or number into
        v_channel := case
          when x.channel = 'sms' and v_sms then 'sms'
          when x.channel = 'email' and v_email is not null then 'email'
        end;
      else
        v_channel := case
          when v_sms and (v_rule = 'alle'
                          or (v_rule = 'paaminn' and x.kind in ('paminnelse', 'siste_paminnelse'))
                          or (v_rule = 'mangler' and v_email is null)) then 'sms'
          when v_email is not null then 'email'
          when v_sms then 'sms'
        end;
      end if;
      if v_channel is null then
        v_why := 'no_address';
      else
        select coalesce(jsonb_agg(jsonb_build_object(
                 'email', v_email,
                 'phone', case when v_sms then v_phone end,
                 'name', d.name, 'lang', d.lang, 'member', d.member)), '[]'::jsonb)
        into v_rcpt
        from app.dispatch_recipients(x.id) d;
      end if;
    elsif v_why is null then
      -- a role notice: e-mail only, never to a reserved address
      select coalesce(jsonb_agg(jsonb_build_object(
               'email', d.email, 'phone', null, 'name', d.name, 'lang', d.lang, 'member', d.member)), '[]'::jsonb)
      into v_rcpt
      from app.dispatch_recipients(x.id) d
      where d.email is not null and not app.reserved_address(d.email);
      if jsonb_array_length(v_rcpt) = 0 then v_why := 'no_address'; end if;
    end if;

    if v_why is not null then
      update app.outbox set failed_at = now(), last_error = v_why, claimed_at = null where id = x.id;
      continue;
    end if;

    v_key := null;
    if x.invitation_id is not null then
      v_key := app.new_respondent_token();
      update app.invitations set token_hash = extensions.digest(v_key, 'sha256') where id = x.invitation_id;
    end if;

    v_pulse := null;
    if x.round_id is not null and r.kind = 'puls' and r.opens_at is not null then
      select count(*) into v_pulse
      from app.rounds r2 join app.measurements m2 on m2.id = r2.measurement_id
      where r2.org_id = x.org_id and m2.kind = 'puls' and m2.year = r.year
        and r2.opens_at is not null
        and (r2.opens_at < r.opens_at or (r2.opens_at = r.opens_at and r2.id <= x.round_id));
    end if;

    update app.outbox set claimed_at = now(), attempts = attempts + 1 where id = x.id;

    v_out := v_out || jsonb_build_object(
      'id', x.id,
      'kind', x.kind,
      'audience', x.audience,
      'channel', v_channel,
      'sms_text', v_org.sms_text,
      'lang', coalesce(v_org.default_lang, 'no'),
      'org', v_org.org_name,
      'k', v_org.k,
      'round', case when x.round_id is not null then jsonb_build_object(
        'kind', r.kind, 'year', r.year, 'pulse', nullif(v_pulse, 0),
        'opens_at', r.opens_at, 'closes_at', r.closes_at) end,
      -- 0099 (P1-1): what an invitation says about itself — its length, whether everyone is told
      -- the results, and the daglig leder's own greeting
      'minutes', case when x.kind = 'invitasjon' then app.round_minutes(x.round_id) end,
      'results_shared', case when x.kind = 'invitasjon' then exists (
        select 1 from app.year_wheels yw join app.wheel_notifications wn on wn.wheel_id = yw.id
        where yw.org_id = x.org_id and wn.audience = 'alle_ansatte') end,
      'greeting', case when x.kind = 'invitasjon' and v_org.invite_greeting is not null then
        jsonb_build_object('text', v_org.invite_greeting, 'by', v_org.greeting_by) end,
      'measures', v_items,
      -- 0100 (P1-3): the page «Dette sa dere, dette gjør vi» — the round's own in its results
      -- notice, the last one shared in the next invitation
      'results_page', case
        when x.kind = 'resultat' then (
          select ro.share_slug from app.rounds ro
          where ro.id = x.round_id and ro.status = 'lukket' and ro.results_page)
        when x.kind = 'invitasjon' then (
          select ro.share_slug from app.rounds ro
          where ro.org_id = x.org_id and ro.id <> x.round_id and ro.status = 'lukket' and ro.results_page
          order by ro.closes_at desc nulls last limit 1)
      end,
      'recipients', v_rcpt,
      -- the languages the survey is ready in, for the personal kinds (0079): the dispatcher
      -- adds the flag and the page strings' hash, as the respondent page does
      'locales', case when v_personal then app.round_locale_state(x.round_id) end,
      'token', v_key);
  end loop;

  return v_out;
end $$;
revoke all on function public.dispatch_claim(int) from public, anon, authenticated;
grant execute on function public.dispatch_claim(int) to service_role;
