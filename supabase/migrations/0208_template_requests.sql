-- 0208 · The free templates behind an e-mail address (D-241)
--
-- /maler gives away Excel and Word templates for the person's e-mail address. The address goes where
-- every other lead from the public site goes since X-104: to the platform, as an event, through the one
-- writer of platform_events. Nothing new is stored in Orgpuls.
--
--   template.requested   the template, the person's name and address, their organisation and role if
--                        they gave them, the language of the page, and whether they ticked the box for
--                        e-mail about new templates and articles (markedsføringsloven § 15 asks for it
--                        before any such mail; the template itself is what they asked for, not marketing)
--
-- `request_template` is the site's one call: it drops a filled honeypot, refuses a malformed address or
-- template key, and limits one address to ten requests an hour and the site to three hundred. Like a
-- contact message, a request waits for the platform until it is delivered: a person's own words and
-- address are not thrown away after 30 days because a webhook was down.

insert into app.platform_event_kinds (kind, fields, note) values
  ('template.requested', array['template', 'name', 'email', 'organisation', 'role', 'consent', 'lang'],
   'somebody downloaded a free template from /maler; consent is the box they ticked for e-mail about new templates and articles');

create function public.request_template(p_template text, p_name text, p_email text, p_org text, p_role text,
                                        p_consent boolean, p_lang text, p_trap text default null) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name  text := left(btrim(coalesce(p_name, '')), 120);
  v_key   text := btrim(coalesce(p_template, ''));
begin
  if coalesce(p_trap, '') <> '' then
    return jsonb_build_object('ok', true);
  end if;
  if v_name = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 or v_key !~ '^[a-z0-9-]{3,80}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if (select count(*) from app.platform_events e
      where e.kind = 'template.requested' and e.created_at > now() - interval '1 hour' and e.payload ->> 'email' = v_email) >= 10
     or (select count(*) from app.platform_events e
         where e.kind = 'template.requested' and e.created_at > now() - interval '1 hour') >= 300 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  perform app.platform_emit('template.requested', null, jsonb_build_object(
    'template', v_key, 'name', v_name, 'email', v_email,
    'organisation', nullif(left(btrim(coalesce(p_org, '')), 200), ''),
    'role', nullif(left(btrim(coalesce(p_role, '')), 80), ''),
    'consent', coalesce(p_consent, false),
    'lang', case when p_lang in ('no', 'en') then p_lang else 'no' end));
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.request_template(text, text, text, text, text, boolean, text, text) from public;
grant execute on function public.request_template(text, text, text, text, text, boolean, text, text) to anon, authenticated;

-- a template request is a person's address and name: it waits for the platform like a contact message
create or replace function public.platform_events_claim(p_batch int default 50) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
declare v_url text; v_rows jsonb;
begin
  delete from app.platform_events e
  where e.created_at < now() - interval '30 days'
    and (e.delivered_at is not null or e.kind not in ('contact.submitted', 'support.requested', 'demo.requested', 'template.requested'));
  select i.webhook_url into v_url from app.platform_installation i where i.enabled and i.webhook_url is not null;
  if v_url is null then
    return jsonb_build_object('url', null, 'events', '[]'::jsonb);
  end if;
  with picked as (
    select e.id from app.platform_events e
    where e.delivered_at is null and (e.claimed_at is null or e.claimed_at < now() - interval '10 minutes')
      and e.attempts < 20
    order by e.id
    limit greatest(1, least(coalesce(p_batch, 50), 200))
    for update skip locked)
  , claimed as (
    update app.platform_events e set claimed_at = now(), attempts = e.attempts + 1
    from picked where e.id = picked.id
    returning e.id, e.kind, e.org_id, e.payload, e.created_at)
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'org_id', c.org_id,
                                               'payload', c.payload, 'created_at', c.created_at) order by c.id), '[]'::jsonb)
  into v_rows from claimed c;
  return jsonb_build_object('url', v_url, 'secret', app.platform_secret('webhook'), 'events', v_rows);
end $fn$;
revoke all on function public.platform_events_claim(int) from public, anon, authenticated;
grant execute on function public.platform_events_claim(int) to service_role;
