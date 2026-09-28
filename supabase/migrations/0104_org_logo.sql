-- 0104_org_logo.sql — the organisation's own logo (Oppsett › Selskap), and the evaluation
-- reminder's place in the dispatcher (0103). D-154.
--
-- The design sets a logo under «Hva står i toppen» — «Bedriftens logo: Deres egen logo i toppen» —
-- and shows it in the 30 px brand mark of the header and the side rail (bundle v3 lines 34, 73,
-- 3662-3695, 6288). The gap analysis asked for it in the invitation as well (P1-1: a picture in
-- the invitation, OR 3,05; D-149 left it out because nothing stored one).
--
-- Stored here, not in Storage. The logo is served from the application's own origin at
-- /logo/<key> — so the page CSP's img-src 'self' holds, and a mail can carry the same address —
-- and its row lives under RLS like everything else. It is small by rule (256 KB), and its type is
-- read from its first bytes, never from what the browser said: PNG, JPEG or WebP. No SVG — an SVG
-- is a document that can carry script, and this one would be served from our own origin.
--
-- The key is the address: 32 hex characters of the SHA-256 of the organisation and the bytes, so a
-- new logo has a new address (cached for a year) and an address cannot be guessed from an
-- organisation's id. `public.org_logo` answers anonymously for an exact key only: the survey, the
-- entry page, the round page and the mails show the logo to people who cannot sign in, and a
-- logo is not a secret. Nothing about a respondent is in it or near it.

create table app.org_logos (
  org_id      uuid primary key references app.organizations (id) on delete cascade,
  key         text not null unique check (key ~ '^[0-9a-f]{32}$'),
  mime        text not null check (mime in ('image/png', 'image/jpeg', 'image/webp')),
  content     bytea not null check (octet_length(content) between 1 and 262144),
  -- «Hva står i toppen»: the logo in the header's brand mark, or Orgpuls's own
  in_header   boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

alter table app.org_logos enable row level security;

-- members read their organisation's row (the shell shows it); every write goes through the RPCs
create policy org_logo_read on app.org_logos
  for select to authenticated using (app.is_org_member(org_id));

revoke all on app.org_logos from anon, public;
grant select on app.org_logos to authenticated;

-- a demo copy brings no logo: the address is the organisation's own, and a visitor may upload one
insert into app.demo_copy_plan (table_name, step, mode, via, note)
values ('org_logos', null, 'skip', null, 'the address is the organisation''s own; a visitor may upload one');

/* The address of an organisation's logo, or null. For the definer functions that hand it out. */
create function app.logo_key(p_org uuid) returns text
  language sql stable security definer set search_path = ''
as $fn$
  select key from app.org_logos where org_id = p_org
$fn$;
revoke all on function app.logo_key(uuid) from public, anon, authenticated;

/*
 * Upload or replace. The daglig leder only, as for the rest of Oppsett › Selskap (org_update).
 * p_data is base64; the type is decided by the bytes.
 */
create function public.set_org_logo(p_org uuid, p_data text) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_bytes bytea;
  v_mime  text;
  v_key   text;
begin
  if not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  begin
    v_bytes := decode(coalesce(p_data, ''), 'base64');
  exception when others then
    return jsonb_build_object('error', 'unreadable');
  end;
  if octet_length(v_bytes) = 0 then return jsonb_build_object('error', 'unreadable'); end if;
  if octet_length(v_bytes) > 262144 then return jsonb_build_object('error', 'too_large'); end if;

  v_mime := case
    when substring(v_bytes from 1 for 8) = '\x89504e470d0a1a0a'::bytea then 'image/png'
    when substring(v_bytes from 1 for 3) = '\xffd8ff'::bytea then 'image/jpeg'
    when substring(v_bytes from 1 for 4) = '\x52494646'::bytea
         and substring(v_bytes from 9 for 4) = '\x57454250'::bytea then 'image/webp'
  end;
  if v_mime is null then return jsonb_build_object('error', 'type'); end if;

  v_key := left(encode(extensions.digest(convert_to(p_org::text, 'UTF8') || v_bytes, 'sha256'), 'hex'), 32);

  insert into app.org_logos (org_id, key, mime, content, updated_by)
  values (p_org, v_key, v_mime, v_bytes, auth.uid())
  on conflict (org_id) do update
    set key = excluded.key, mime = excluded.mime, content = excluded.content,
        updated_at = now(), updated_by = excluded.updated_by;
  return jsonb_build_object('key', v_key);
end $fn$;
revoke all on function public.set_org_logo(uuid, text) from public, anon;
grant execute on function public.set_org_logo(uuid, text) to authenticated;

create function public.remove_org_logo(p_org uuid) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
begin
  if not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from app.org_logos where org_id = p_org;
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.remove_org_logo(uuid) from public, anon;
grant execute on function public.remove_org_logo(uuid) to authenticated;

create function public.set_logo_in_header(p_org uuid, p_on boolean) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
begin
  if not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update app.org_logos set in_header = coalesce(p_on, true), updated_at = now() where org_id = p_org;
  return jsonb_build_object('ok', found);
end $fn$;
revoke all on function public.set_logo_in_header(uuid, boolean) from public, anon;
grant execute on function public.set_logo_in_header(uuid, boolean) to authenticated;

/*
 * The image, by its exact address, for the /logo route. Anonymous by design (see the head); a
 * malformed key is not looked up.
 */
create function public.org_logo(p_key text) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select case when p_key ~ '^[0-9a-f]{32}$' then (
    select jsonb_build_object('mime', l.mime, 'data', encode(l.content, 'base64'))
    from app.org_logos l where l.key = p_key) end
$fn$;
revoke all on function public.org_logo(text) from public;
grant execute on function public.org_logo(text) to anon, authenticated;

-- ---------------------------------------------------------------- the readers that carry it
-- Each is the current definition with one key added, 'logo' (and, in dispatch_claim, the
-- evaluation reminder of 0103).

CREATE OR REPLACE FUNCTION public.entry_info(p_code text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((
    select jsonb_build_object(
      'org', o.name,
      -- 0104: the organisation's logo, by its address
      'logo', app.logo_key(o.id),
      'lang', coalesce(o.default_lang, 'no'),
      'open', exists (select 1 from app.rounds r
                      where r.org_id = o.id and r.status = 'apen'
                        and (r.closes_at is null or r.closes_at > now())),
      'email', o.mail_enabled,
      'sms', o.mail_enabled and o.sms_enabled)
    from app.entry_codes c join app.organizations o on o.id = c.org_id
    where c.code = lower(btrim(p_code))
  ), jsonb_build_object('error', 'unknown'))
$function$;

CREATE OR REPLACE FUNCTION public.respond_form(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_inv    app.invitations%rowtype;
  v_org    app.organizations%rowtype;
  v_round  app.rounds%rowtype;
  v_qs     jsonb;
  v_extra  jsonb;
  v_module jsonb;
  v_own    jsonb;
begin
  if p_token is null or length(p_token) < 16 then
    return jsonb_build_object('error', 'invalid_token');
  end if;

  select * into v_inv from app.invitations i
  where i.token_hash = extensions.digest(p_token, 'sha256');

  if not found then
    return jsonb_build_object('error', 'invalid_token');
  end if;
  if v_inv.responded_at is not null then
    return jsonb_build_object('error', 'already_responded');
  end if;
  if v_inv.expires_at <= now() then
    return jsonb_build_object('error', 'expired');
  end if;

  select * into v_round from app.rounds r where r.id = v_inv.round_id;
  if v_round.status <> 'apen' then
    return jsonb_build_object('error', 'round_closed');
  end if;

  select * into v_org from app.organizations o where o.id = v_inv.org_id;

  -- shuffled per token, stable on reload
  select jsonb_agg(jsonb_build_object('factor', q.factor_key, 'ordinal', q.ordinal)
                   order by q.seed)
  into v_qs
  from (
    select rf.factor_key, s.ordinal,
           extensions.digest(p_token || rf.factor_key || s.ordinal::text, 'sha256') as seed
    from app.round_factors rf
    join app.statements s on s.factor_key = rf.factor_key
    where rf.round_id = v_round.id
  ) q;

  select jsonb_agg(jsonb_build_object(
           'key', x.extra_key, 'kind', q.kind,
           'options', (select count(*) from app.extra_options o where o.extra_key = x.extra_key))
         order by q.sort_order)
  into v_extra
  from app.round_extra_questions x
  join app.extra_questions q on q.key = x.extra_key
  where x.round_id = v_round.id;

  -- one module per round in practice; an array so a second would need no new shape
  select jsonb_agg(jsonb_build_object(
           'name', m.name,
           -- 0089: a module in variants takes about eight seconds a statement, as asked
           'minutes', case when rm.variant_key is null then m.estimated_minutes
                           else greatest(1, round(cardinality(rm.item_ids) * 8 / 60.0))::int end,
           'statements', (
             select coalesce(jsonb_agg(jsonb_build_object('item', i.id, 'factor', coalesce(f.i18n->('nb.' || rm.wording)->>'name', f.name),
                                                  'text', coalesce(i.text->>('nb.' || rm.wording), i.text->>'nb'),
                                                  'factor_en', f.i18n->'en'->>'name', 'text_en', i.text->>'en',
                                                  'help', i.help->>'nb', 'help_en', i.help->>'en')
                                       order by extensions.digest(p_token || i.id::text, 'sha256')), '[]'::jsonb)
             from app.module_items i
             -- 0089: the factor the respondent reads it under: the simplified one in the simplified
             -- set, its own in the extended set; in a puls, simplified for a core statement
             join lateral (
               select ff.name, ff.i18n from app.module_factor_items mi join app.module_factors ff on ff.id = mi.factor_id
               where mi.item_id = i.id
                 and (ff.variant_key is null
                      or ff.variant_key = coalesce(rm.variant_key, case when i.core_indicator then 'forenklet' else 'utvidet' end))
               order by ff.sort limit 1
             ) f on true
             where i.id = any (rm.item_ids)),
           'count', case when rm.include_count_items then (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'item', i.id, 'text', coalesce(i.text->>('nb.' || rm.wording), i.text->>'nb'),
                      'options', (select jsonb_agg(o->>'nb' order by n) from jsonb_array_elements(i.options) with ordinality as y(o, n)),
                      'text_en', i.text->>'en',
                      'options_en', (select jsonb_agg(o->>'en' order by n) from jsonb_array_elements(i.options) with ordinality as y(o, n)),
                      -- 0090: the answer each option is sent as
                      'answers', to_jsonb(app.count_answer_keys(i)))
                    order by i.sort), '[]'::jsonb)
             from app.module_items i where i.module_id = m.id and i.kind = 'count'
               -- 0089: the count questions of the round's variant; 0090: and of its factors
               and app.count_item_asked(i, rm)) else '[]'::jsonb end,
           'segments', case when rm.include_segments then (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'item', i.id, 'text', i.text->>'nb',
                      'options', (select jsonb_agg(o->>'nb' order by n) from jsonb_array_elements(i.options) with ordinality as y(o, n)),
                      'text_en', i.text->>'en',
                      'options_en', (select jsonb_agg(o->>'en' order by n) from jsonb_array_elements(i.options) with ordinality as y(o, n)))
                    order by i.sort), '[]'::jsonb)
             from app.module_items i where i.module_id = m.id and i.kind = 'segment') else '[]'::jsonb end)
         order by m.key)
  into v_module
  from app.round_modules rm join app.question_modules m on m.id = rm.module_id
  where rm.round_id = v_round.id;

  -- 0095: the organisation's own questions, in the order they were written, in its own words
  select jsonb_agg(jsonb_build_object('id', q.id, 'text', q.body, 'kind', q.kind) order by q.created_at, q.id)
  into v_own
  from app.round_org_questions rq join app.org_questions q on q.id = rq.question_id
  where rq.round_id = v_round.id;

  return jsonb_build_object(
    'org', v_org.name,
    -- 0104: the organisation's logo, by its address; says nothing about the person
    'logo', app.logo_key(v_org.id),
    'threshold', app.k_threshold(v_inv.org_id),
    'questions', coalesce(v_qs, '[]'::jsonb),
    'extra', coalesce(v_extra, '[]'::jsonb),
    'modules', coalesce(v_module, '[]'::jsonb),
    'own', coalesce(v_own, '[]'::jsonb)
  );
end $function$;

CREATE OR REPLACE FUNCTION public.round_page(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- 0104
    'logo', app.logo_key(r.org_id),
    'round', jsonb_build_object('kind', r.kind, 'year', r.year, 'opens_at', r.opens_at, 'closes_at', r.closes_at),
    'threshold', v_k,
    'asked', coalesce(v_asked, 0),
    'answered', coalesce(v_answered, 0),
    'index', v_overall,
    'band', case when v_overall is not null then app.risk_band(v_overall) end,
    'factors', coalesce(v_factors, '[]'::jsonb),
    'measures', v_measures);
end $function$;

CREATE OR REPLACE FUNCTION public.dispatch_claim(p_batch integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$

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
      -- 0104: an evaluation recorded since, or no longer due (A-02)
      when x.kind = 'evaluering' and not exists (
        select 1 from app.evaluation_due(x.org_id) d
        where d.due_on is not null and d.due_on <= (now() at time zone 'Europe/Oslo')::date) then 'resolved'
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
      -- 0104 (A-02): when the ordning was last evaluated, by which cadence, and when it fell due
      'evaluation', case when x.kind = 'evaluering' then (
        select jsonb_build_object('cadence', d.cadence, 'last_on', d.last_on, 'due_on', d.due_on)
        from app.evaluation_due(x.org_id) d) end,
      -- 0104: the organisation's logo, by its address, for the head of every notice
      'logo', app.logo_key(x.org_id),
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
end $function$;
