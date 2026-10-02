-- 0146_demo_signup.sql — the demo asks who is asking (D-191).
--
-- Tor, 2026-10-02: «Require email and signup so we get the email.» /demo took a work address and
-- an unticked consent box (0094, D-143). It now also takes a name, a company and a role, the same
-- three things a CRM contact holds (0055), so the lead that the proved address becomes says who it
-- is. The address is still proved by the login link before anything becomes a contact.
--
--   * app.demo_requests gains name, company and role, with the checks app.crm_contacts has. They
--     are nullable for the rows written before today, which app.demo_expire deletes within 30 days
--     as it deletes every request; a new request always carries all three.
--   * public.demo_request takes them, and refuses with 'invalid' a request without a name (1..120
--     characters) or a company (1..200), or with a role outside the CRM's set. Every guard of 0094
--     stays as it was: the switch, the address pattern, throwaway domains, three links a day to an
--     address, the network's daily hash (never the address, never the IP), the per-domain and
--     per-day limits, and the same answer for an address that already has an account. The old
--     four-argument signature is dropped: the app that calls the new one ships with this file.
--   * app.demo_lead carries them into the contact. A new contact takes all three; an existing one
--     takes each only where it has none — what a customer or a sales note already gave is never
--     overwritten by what a demo form says.
--
-- No answer table is touched, no policy is added, and the request table keeps RLS on with no
-- policy and no client privilege (demo_invariants 1).

alter table app.demo_requests
  add column name    text check (char_length(name) between 1 and 120),
  add column company text check (char_length(company) between 1 and 200),
  add column role    text check (role in ('daglig_leder', 'hr', 'leder', 'verneombud', 'annet'));

comment on column app.demo_requests.name is
  'Who asked for the demo (0146, D-191): carried into app.crm_contacts.name by app.demo_lead once the address is proved. Deleted with the request after 30 days.';
comment on column app.demo_requests.company is
  'The company they gave (0146, D-191): carried into app.crm_contacts.company by app.demo_lead. Deleted with the request after 30 days.';
comment on column app.demo_requests.role is
  'Their role, one of app.crm_contacts.role''s (0146, D-191): carried into the contact by app.demo_lead. Deleted with the request after 30 days.';

drop function public.demo_request(text, text, boolean, text);

-- A request for a login link. The app sends the link only on {ok: true}. p_ip is hashed with the
-- analytics' salt of the day (app.web_visitor) and never stored.
create function public.demo_request(p_email text, p_name text, p_company text, p_role text,
                                    p_ip text, p_consent boolean, p_lang text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  s         app.demo_settings;
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_name    text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_company text := regexp_replace(btrim(coalesce(p_company, '')), '\s+', ' ', 'g');
  v_domain  text;
  v_net     text;
  v_day     timestamptz := date_trunc('day', now() at time zone 'Europe/Oslo') at time zone 'Europe/Oslo';
begin
  select * into s from app.demo_settings;
  if not s.enabled then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  if v_email !~ '^[^@\s]{1,64}@[a-z0-9.-]{1,253}\.[a-z]{2,63}$' or char_length(v_email) > 254 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  -- who is asking: the three things a CRM contact holds, checked as the contact checks them
  if char_length(v_name) not between 1 and 120
     or char_length(v_company) not between 1 and 200
     or p_role is null or p_role not in ('daglig_leder', 'hr', 'leder', 'verneombud', 'annet') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  v_domain := split_part(v_email, '@', 2);
  if app.demo_throwaway(v_domain) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  v_net := app.web_visitor(p_ip, 'demo');

  -- three links a day to one address, so nobody can fill a stranger's inbox with them
  if (select count(*) from app.demo_requests r where r.email = v_email and r.at >= v_day) >= 3
     or (select count(*) from app.demo_requests r where r.network = v_net and r.at >= v_day) >= s.per_network_day
     or (not app.demo_free_mail(v_domain)
         and (select count(*) from app.demo_requests r where r.domain = v_domain and r.at >= v_day) >= s.per_domain_day)
     or (select count(*) from app.demo_requests r where r.at >= v_day) >= s.per_day then
    return jsonb_build_object('ok', false, 'error', 'limited');
  end if;

  insert into app.demo_requests (email, domain, network, consent, lang, name, company, role)
  values (v_email, v_domain, v_net, coalesce(p_consent, false), case when p_lang = 'en' then 'en' else 'no' end,
          v_name, v_company, p_role);
  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.demo_request(text, text, text, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.demo_request(text, text, text, text, text, boolean, text) to anon, authenticated;

-- The address is proved: its request becomes a CRM contact. Mailable only if the box was ticked;
-- a contact that already exists keeps what it had, only ever gains consent, and takes the name,
-- company and role only where it has none.
create or replace function app.demo_lead(p_user uuid) returns void
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_email text;
  r       app.demo_requests;
begin
  perform set_config('app.consent_via', 'demo_request', true);  -- 0141: the ledger records the method
  select lower(btrim(u.email)) into v_email from auth.users u where u.id = p_user;
  select * into r from app.demo_requests q where q.email = v_email order by q.at desc limit 1;
  if v_email is null or r.id is null then
    return;
  end if;
  insert into app.crm_contacts (email, name, company, role, source, basis, status, consent_at, consent_source, tags, lang)
  values (v_email, r.name, r.company, r.role, 'demo', case when r.consent then 'consent' else 'none' end, 'active',
          case when r.consent then r.at end, case when r.consent then 'demo request (box ticked, address proved)' end,
          array['demo'], r.lang)
  on conflict (product_id, email) do update set
    name = coalesce(app.crm_contacts.name, excluded.name),
    company = coalesce(app.crm_contacts.company, excluded.company),
    role = coalesce(app.crm_contacts.role, excluded.role),
    tags = case when 'demo' = any (app.crm_contacts.tags) or cardinality(app.crm_contacts.tags) >= 20
                then app.crm_contacts.tags else app.crm_contacts.tags || 'demo'::text end,
    basis = case when r.consent and app.crm_contacts.basis in ('none', 'business') then 'consent' else app.crm_contacts.basis end,
    consent_at = case when r.consent and app.crm_contacts.basis in ('none', 'business') then r.at else app.crm_contacts.consent_at end,
    consent_source = case when r.consent and app.crm_contacts.basis in ('none', 'business')
                          then 'demo request (box ticked, address proved)' else app.crm_contacts.consent_source end,
    updated_at = now();
end $fn$;

revoke all on function app.demo_lead(uuid) from public, anon, authenticated;
