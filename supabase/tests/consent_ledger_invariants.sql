-- consent_ledger_invariants.sql — the append-only consent ledger over the CRM's consent (0141, D-182),
-- proved against the live schema.
--
--   * the ledger and its purposes: RLS on, no policy, no client grant (1)
--   * every path that grants or withdraws consent writes a record under its own method: the double
--     opt-in, one-click unsubscribe (a list, and everything), the preference centre, the provider's
--     bounce and complaint, the admin's contact, list and unsubscribe actions, the import, the company
--     import's role address, the demo request and the account sync; the signup itself only asks (2)
--   * the ledger refuses an edit and a delete while its contact exists (3)
--   * a contact's erasure takes its records (the cascade), and an account's deletion clears created_by (4)
--   * an account's login that moves onto a suppressed address, and off it, moves its contact (crm_sync)
--     and the ledger with it — lapsed, then granted — under account_sync and with no author, though an
--     admin was signed in; a list never confirmed records nothing when its contact unsubscribes (5)
--   * crm_contacts and crm_list_members — what the dispatcher reads — equal the ledger's latest record
--     for every contact and purpose in the database (6)
--   * a granted or withdrawn record is an event, carrying no contact, organisation, account or key (7)
--   * every contact with a basis, or a withdrawal, has a record: the backfill and the triggers left no gap (8)
--   * suppression holds SHA-256 hashes only; every list is a purpose, and a new list becomes one (9)
--   * nothing written here survives (10)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/consent_ledger_invariants.sql

create unlogged table if not exists public._cle(seq int, name text, expected text, actual text, pass bool);
truncate public._cle;

do $$
declare
  v_org     uuid := '00000000-0000-4000-8000-0000000c1a01';
  v_admin   uuid := '00000000-0000-4000-8000-0000000c1b01';
  v_demo    uuid := '00000000-0000-4000-8000-0000000c1b02';
  v_acct    uuid := '00000000-0000-4000-8000-0000000c1b03';
  v_gone    uuid := '00000000-0000-4000-8000-0000000c1b04';
  v_news    uuid := (select l.id from app.crm_lists l where l.product_id = 'orgpuls' and l.key = 'nyhetsbrev');
  v_camp    uuid;
  v_p1      uuid;
  v_p2      uuid;
  v_p3      uuid;
  v_p4      uuid;
  v_p8      uuid;
  v_by      text;
  v_tok1    constant text := repeat('c1', 32);
  v_tok2    constant text := repeat('c2', 32);
  v_txt     text;
  v_n       bigint;
  v_rows    jsonb := '[]';
  claims    constant text := '{"sub":"%s","role":"authenticated","aal":"aal2"}';
  v_expected constant text :=
    'p1 marketing=granted/consent/double_opt_in doi; p1 list:nyhetsbrev=granted/consent/double_opt_in doi; '
    'p1 list:nyhetsbrev=withdrawn/consent/one_click_unsubscribe; p1 list:produktnytt=granted/consent/preference_centre; '
    'p1 marketing=withdrawn/consent/one_click_unsubscribe; p1 list:produktnytt=withdrawn/consent/one_click_unsubscribe; '
    'p2 marketing=granted/consent/admin by; p2 marketing=lapsed/consent/provider_bounce; '
    'p3 marketing=granted/consent/admin by; p3 marketing=withdrawn/consent/provider_complaint; '
    'p4 marketing=granted/consent/import by; p4 list:nyhetsbrev=granted/consent/admin by; p4 list:nyhetsbrev=withdrawn/consent/admin by; '
    'p4 marketing=withdrawn/consent/admin by; '
    'p6 marketing=granted/consent/demo_request; p7 marketing=granted/existing_customer_15_3/account_sync; '
    'post marketing=granted/business_address/import by';
begin
  -- 1 ---------------------------------------------------------------- closed to clients
  select string_agg(format('%s:%s/%s/%s', c.relname, c.relrowsecurity,
           (select count(*) from pg_policies p where p.schemaname = 'app' and p.tablename = c.relname),
           (has_table_privilege('authenticated', c.oid, 'select') or has_table_privilege('anon', c.oid, 'select'))), ' ' order by c.relname)
    into v_txt
  from pg_class c where c.relnamespace = 'app'::regnamespace and c.relname in ('consent_records', 'consent_purposes');
  v_rows := v_rows || jsonb_build_object('seq', 1, 'name', 'the ledger and its purposes: RLS on, no policy, no client grant',
    'expected', 'consent_purposes:t/0/f consent_records:t/0/f', 'actual', v_txt, 'pass', v_txt = 'consent_purposes:t/0/f consent_records:t/0/f');

  begin
    insert into auth.users (id, email) values (v_admin, 'admin@cle-probe.no'), (v_demo, 'p6@cle-probe.no'), (v_acct, 'p7@cle-probe.no'),
                                              (v_gone, 'gone@cle-probe.no');
    insert into app.platform_admins (user_id, role) values (v_admin, 'marketing');
    insert into app.organizations (id, name, org_number, employee_count) values (v_org, 'Samtykke AS', '999001441', 12);
    insert into app.profiles (id, full_name) values (v_acct, 'Kunde');
    insert into app.memberships (org_id, user_id, role) values (v_org, v_acct, 'daglig_leder');
    update app.billing set confirmed_at = now(), plan = 'small', invoice_email = 'faktura@cle-probe.no' where org_id = v_org;
    insert into app.crm_campaigns (name, utm_campaign, list_id) values ('Probe', 'cle-probe', v_news) returning id into v_camp;
    set constraints all deferred;

    -- 2 -------------------------------------------------------------- every path, its method
    -- the signup asks; it grants nothing
    perform set_config('request.jwt.claims', '', true);
    perform public.crm_newsletter_signup('p1@cle-probe.no', 'Per', null, 'no', 'newsletter', null, array['nyhetsbrev']);
    select id into v_p1 from app.crm_contacts where email = 'p1@cle-probe.no';
    set constraints all immediate; set constraints all deferred;
    v_n := (select count(*) from app.consent_records where contact_id = v_p1);
    -- the double opt-in (the dispatcher mints the token on its lease; here it is set by hand)
    update app.crm_contacts set optin_hash = app.crm_token_hash(v_tok1), optin_sent_at = now() - interval '5 minutes' where id = v_p1;
    perform public.crm_confirm(v_tok1);
    set constraints all immediate; set constraints all deferred;
    -- one-click unsubscribe from the list the campaign went to
    insert into app.crm_sends (kind, campaign_id, contact_id, status, unsub_hash) values ('campaign', v_camp, v_p1, 'sent', app.crm_token_hash(v_tok2));
    perform public.crm_unsubscribe(v_tok2, 'list');
    set constraints all immediate; set constraints all deferred;
    -- the preference centre: product news on
    perform public.crm_set_preferences(v_tok2, array['produktnytt'], false);
    set constraints all immediate; set constraints all deferred;
    -- one-click unsubscribe from everything
    perform public.crm_unsubscribe(v_tok2, 'all');
    set constraints all immediate; set constraints all deferred;

    -- the admin records consent; the provider reports a bounce, and a complaint
    perform set_config('app.consent_via', '', true);
    perform set_config('request.jwt.claims', format(claims, v_admin), true);
    v_p2 := (public.admin_crm_save_contact(null, '{"email":"p2@cle-probe.no","consent_source":"Signed form at a fair"}')->>'id')::uuid;
    v_p3 := (public.admin_crm_save_contact(null, '{"email":"p3@cle-probe.no","consent_source":"Signed form at a fair"}')->>'id')::uuid;
    set constraints all immediate; set constraints all deferred;
    perform set_config('request.jwt.claims', '', true);
    insert into app.crm_sends (kind, campaign_id, contact_id, status, provider_id) values
      ('campaign', v_camp, v_p2, 'sent', '<cle-p2@probe>'), ('campaign', v_camp, v_p3, 'sent', '<cle-p3@probe>');
    perform public.record_crm_event('hard_bounce', '<cle-p2@probe>', now());
    set constraints all immediate; set constraints all deferred;
    perform public.record_crm_event('spam', '<cle-p3@probe>', now());
    set constraints all immediate; set constraints all deferred;

    -- the import; the admin's list add and remove, and unsubscribe
    perform set_config('app.consent_via', '', true);
    perform set_config('request.jwt.claims', format(claims, v_admin), true);
    perform public.admin_crm_import('[{"email":"p4@cle-probe.no","consent_source":"Webinar sign-up list"}]');
    set constraints all immediate; set constraints all deferred;
    select id into v_p4 from app.crm_contacts where email = 'p4@cle-probe.no';
    perform set_config('app.consent_via', '', true);
    perform public.admin_crm_list_add(v_news, array[v_p4], 'Asked at the webinar');
    set constraints all immediate; set constraints all deferred;
    perform public.admin_crm_list_remove(v_news, v_p4, 'Asked to leave');
    set constraints all immediate; set constraints all deferred;
    perform public.admin_crm_contact_action(v_p4, 'unsubscribe', 'Asked by phone');
    set constraints all immediate; set constraints all deferred;
    -- the company import: a role address in Enhetsregisteret
    perform public.admin_crm_company_import('[{"org_number":"999001442","name":"Firma AS","email":"post@cle-probe.no"}]', 'brreg', null);
    set constraints all immediate; set constraints all deferred;

    -- the demo request, with the box ticked; the account sync, for a customer
    perform set_config('app.consent_via', '', true);
    perform set_config('request.jwt.claims', '', true);
    insert into app.demo_requests (email, domain, network, consent, lang) values ('p6@cle-probe.no', 'cle-probe.no', md5('cle-probe'), true, 'no');
    perform app.demo_lead(v_demo);
    set constraints all immediate; set constraints all deferred;
    perform app.crm_sync();
    set constraints all immediate; set constraints all deferred;

    select v_n || '|' || string_agg(split_part(c.email, '@', 1) || ' ' || r.purpose || '=' || r.status || '/' || coalesce(r.lawful_basis, '-') || '/' || r.method
             || case when r.doi_sent_at is not null and r.doi_confirmed_at >= r.doi_sent_at then ' doi' else '' end
             || case when r.created_by = v_admin then ' by' else '' end, '; ' order by c.email, r.id)
      into v_txt
    from app.consent_records r join app.crm_contacts c on c.id = r.contact_id
    where c.email like '%@cle-probe.no';
    v_rows := v_rows || jsonb_build_object('seq', 2, 'name', 'every path that grants or withdraws consent writes a record under its own method; the signup writes none',
      'expected', '0|' || v_expected, 'actual', v_txt, 'pass', v_txt = '0|' || v_expected);

    -- 3 -------------------------------------------------------------- append-only
    v_txt := '';
    begin
      update app.consent_records set status = 'granted' where contact_id = v_p3 and status = 'withdrawn';
      v_txt := 'edited';
    exception when check_violation then v_txt := 'refused'; end;
    begin
      delete from app.consent_records where contact_id = v_p3;
      v_txt := v_txt || ',deleted';
    exception when check_violation then v_txt := v_txt || ',refused'; end;
    begin
      update app.consent_records set created_by = null where contact_id = v_p2 and created_by = v_admin;
      v_txt := v_txt || ',cleared';
    exception when check_violation then v_txt := v_txt || ',refused'; end;
    v_rows := v_rows || jsonb_build_object('seq', 3, 'name', 'the ledger refuses an edit, a delete, and clearing its author while they exist',
      'expected', 'refused,refused,refused', 'actual', v_txt, 'pass', v_txt = 'refused,refused,refused');

    -- 4 -------------------------------------------------------------- referential maintenance is allowed
    insert into app.consent_records (contact_id, purpose, status, lawful_basis, method, created_by)
    values (v_p2, 'marketing', 'granted', 'consent', 'admin', v_gone);
    delete from auth.users where id = v_gone;
    v_txt := (select count(*) from app.consent_records where created_by = v_gone)::text;
    delete from app.crm_contacts where id = v_p3;
    v_txt := v_txt || '|' || (select count(*) from app.consent_records where contact_id = v_p3);
    v_rows := v_rows || jsonb_build_object('seq', 4, 'name', 'an account''s deletion clears created_by; a contact''s erasure takes its records',
      'expected', '0|0', 'actual', v_txt, 'pass', v_txt = '0|0');
    -- (the extra record above is removed with its contact, so row 6 compares the paths' records)
    delete from app.crm_contacts where id = v_p2;

    -- 5 -------------------------------------------------------------- an address that moves
    -- suppression is kept by address: the account's login moves onto a bounced address and then on to
    -- a clean one; crm_sync moves its contact each time, and the ledger follows. An admin is signed in
    -- (crm_sync runs inside the CRM's reads), and is not the author of what the sync records.
    insert into app.crm_suppression (email_hash, reason) values (app.crm_hash('p7-new@cle-probe.no'), 'hard_bounce');
    set constraints all immediate; set constraints all deferred;
    perform set_config('app.consent_via', '', true);
    perform set_config('request.jwt.claims', format(claims, v_admin), true);
    update auth.users set email = 'p7-new@cle-probe.no' where id = v_acct;
    perform app.crm_sync();
    set constraints all immediate; set constraints all deferred;
    update auth.users set email = 'p7-third@cle-probe.no' where id = v_acct;
    perform app.crm_sync();
    set constraints all immediate; set constraints all deferred;
    perform set_config('request.jwt.claims', '', true);
    select string_agg(r.status || '/' || r.method || '/' || case when r.created_by is null then '-' else 'by' end, ',' order by r.id)
      into v_by
    from app.consent_records r join app.crm_contacts c on c.id = r.contact_id
    where c.user_id = v_acct and r.purpose = 'marketing';
    -- a list never confirmed: its contact unsubscribes while the double opt-in waits
    perform set_config('app.consent_via', '', true);
    perform public.crm_newsletter_signup('p8@cle-probe.no', 'Pia', null, 'no', 'newsletter', null, array['nyhetsbrev']);
    select id into v_p8 from app.crm_contacts where email = 'p8@cle-probe.no';
    set constraints all immediate; set constraints all deferred;
    update app.crm_contacts set status = 'unsubscribed', updated_at = now() where id = v_p8;
    set constraints all immediate; set constraints all deferred;
    select concat_ws('|', v_by,
      (select c.email from app.crm_contacts c where c.user_id = v_acct),
      (select count(*) from app.crm_list_members m where m.contact_id = v_p8 and m.status = 'pending'),
      (select count(*) from app.consent_records r where r.contact_id = v_p8 and r.purpose like 'list:%'))
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 5, 'name', 'an account''s address moving onto a suppressed one and off it lapses and re-grants its contact (account_sync, no author); an unconfirmed list records nothing on unsubscribe',
      'expected', 'granted/account_sync/-,lapsed/account_sync/-,granted/account_sync/-|p7-third@cle-probe.no|1|0', 'actual', v_txt,
      'pass', v_txt = 'granted/account_sync/-,lapsed/account_sync/-,granted/account_sync/-|p7-third@cle-probe.no|1|0');

    -- 6 -------------------------------------------------------------- the dispatcher's state is the ledger's latest
    select count(*) into v_n
    from app.crm_contacts c
    left join lateral (select r.status, r.lawful_basis from app.consent_records r
                       where r.contact_id = c.id and r.purpose = 'marketing' order by r.id desc limit 1) l on true
    cross join lateral (select exists (select 1 from app.crm_suppression s
                                       where s.email_hash = encode(extensions.digest(convert_to(c.email, 'UTF8'), 'sha256'), 'hex')) as sup) x
    where coalesce(l.status, 'not_given') is distinct from
            case when c.status = 'unsubscribed' then 'withdrawn' when c.basis = 'none' then 'not_given'
                 when x.sup then 'lapsed' when c.status = 'active' then 'granted' else 'not_given' end
       or (c.basis <> 'none' and l.status in ('granted', 'lapsed', 'withdrawn')
           and l.lawful_basis is distinct from case c.basis when 'consent' then 'consent' when 'customer' then 'existing_customer_15_3'
                                                             when 'business' then 'business_address' end);
    v_txt := v_n::text;
    select count(*) into v_n
    from app.crm_list_members m
    join app.crm_contacts c on c.id = m.contact_id
    join app.consent_purposes p on p.list_id = m.list_id
    left join lateral (select r.status from app.consent_records r
                       where r.contact_id = c.id and r.purpose = p.key order by r.id desc limit 1) l on true
    cross join lateral (select exists (select 1 from app.crm_suppression s
                                       where s.email_hash = encode(extensions.digest(convert_to(c.email, 'UTF8'), 'sha256'), 'hex')) as sup) x
    where case when m.status = 'pending' and l.status is null then false
               when m.status = 'unsubscribed' or c.status = 'unsubscribed' then l.status is distinct from 'withdrawn'
               when m.status = 'pending' then l.status = 'granted'
               when x.sup then l.status is distinct from 'lapsed'
               when c.status = 'active' then l.status is distinct from 'granted'
               else l.status = 'granted' end;
    v_txt := v_txt || '|' || v_n || '|' || (select count(*) from app.crm_contacts);
    v_rows := v_rows || jsonb_build_object('seq', 6, 'name', 'for every contact and list membership in the database, the CRM''s state equals the ledger''s latest record',
      'expected', '0|0|' || split_part(v_txt, '|', 3), 'actual', v_txt,
      'pass', split_part(v_txt, '|', 1) = '0' and split_part(v_txt, '|', 2) = '0' and split_part(v_txt, '|', 3)::int >= 5);

    -- 7 -------------------------------------------------------------- consent events carry no one
    select concat_ws('|',
      (select count(*) filter (where name = 'consent.granted') > 0 and count(*) filter (where name = 'consent.withdrawn') > 0
       from app.growth_events where source = 'trigger' and name like 'consent.%' and created_at = now()),
      (select count(*) from app.growth_events where name like 'consent.%' and (org_id is not null or user_id is not null or dedupe_key is not null
         or occurred_at <> date_trunc('hour', occurred_at) or props::text like '%@%' or props::text ~ '[0-9a-f]{8}-[0-9a-f]{4}-')))
      into v_txt;
    v_rows := v_rows || jsonb_build_object('seq', 7, 'name', 'granted and withdrawn records are events without a contact, an organisation, an account, a key or an exact time',
      'expected', 't|0', 'actual', v_txt, 'pass', v_txt = 't|0');

    raise exception 'rollback';
  exception when others then
    if sqlerrm <> 'rollback' then raise; end if;
  end;

  -- 8 ---------------------------------------------------------------- no gap
  select count(*) into v_n
  from app.crm_contacts c cross join lateral app.consent_derive(c.id, 'marketing') d
  where d.status is not null and d.status <> 'not_given'
    and not exists (select 1 from app.consent_records r where r.contact_id = c.id and r.purpose = 'marketing');
  v_txt := v_n::text;
  select count(*) into v_n
  from app.crm_list_members m join app.consent_purposes p on p.list_id = m.list_id
  where m.status in ('subscribed', 'unsubscribed')
    and not exists (select 1 from app.consent_records r where r.contact_id = m.contact_id and r.purpose = p.key);
  v_txt := v_txt || '|' || v_n;
  v_rows := v_rows || jsonb_build_object('seq', 8, 'name', 'every contact with a basis or a withdrawal, and every decided list membership, has a record',
    'expected', '0|0', 'actual', v_txt, 'pass', v_txt = '0|0');

  -- 9 ---------------------------------------------------------------- hashes, and purposes
  select concat_ws('|',
    (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
     where table_schema = 'app' and table_name = 'crm_suppression'),
    (select count(*) from app.crm_suppression where email_hash !~ '^[0-9a-f]{64}$'),
    (select count(*) from app.crm_lists l where l.product_id = 'orgpuls' and not exists (select 1 from app.consent_purposes p where p.list_id = l.id)))
    into v_txt;
  begin
    insert into app.crm_lists (key, name_no, name_en) values ('cle-probe', 'Probe', 'Probe');
    v_txt := v_txt || '|' || (select count(*) from app.consent_purposes where key = 'list:cle-probe');
    raise exception 'rollback';
  exception when others then if sqlerrm <> 'rollback' then raise; end if;
  end;
  v_rows := v_rows || jsonb_build_object('seq', 9, 'name', 'suppression holds SHA-256 hashes only; every list is a purpose, and a new list becomes one',
    'expected', 'email_hash,reason,at|0|0|1', 'actual', v_txt, 'pass', v_txt = 'email_hash,reason,at|0|0|1');

  -- 10 --------------------------------------------------------------- nothing left
  select count(*)::text into v_txt from (
    select id::text from auth.users where email like '%@cle-probe.no'
    union all select id::text from app.crm_contacts where email like '%@cle-probe.no'
    union all select id::text from app.organizations where id = v_org
    union all select key from app.consent_purposes where key = 'list:cle-probe') x;
  v_rows := v_rows || jsonb_build_object('seq', 10, 'name', 'every probe row was rolled back', 'expected', '0', 'actual', v_txt, 'pass', v_txt = '0');

  insert into public._cle
  select (r->>'seq')::int, r->>'name', r->>'expected', r->>'actual', (r->>'pass')::boolean from jsonb_array_elements(v_rows) r;
end $$;

select seq, name, expected, actual, pass from public._cle order by seq;

do $$
declare v_failed text; v_count int;
begin
  select string_agg(seq || ' ' || name, '; ' order by seq) filter (where pass is not true), count(*) into v_failed, v_count from public._cle;
  if v_failed is not null then raise exception 'consent ledger invariants failed: %', v_failed; end if;
  if v_count <> 10 then raise exception 'consent ledger invariants: expected 10 rows, got %', v_count; end if;
end $$;
