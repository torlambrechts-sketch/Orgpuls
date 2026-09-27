-- 0085_locale_pilots.sql — a survey language, tried by named organisations first (D-132, X-068;
-- multilingual gap analysis, queue item 5).
--
-- The multilingual guide rolls a language out in steps: translated and approved, then offered to
-- three to five pilot customers, then to everyone. Until now the only switch was the deployment's
-- flag (`locale_pl`, lib/flags.ts), which is everyone at once. A pilot is 0068's module pilot for a
-- language: a super-admin names an organisation, with a reason, audited, and that organisation's
-- surveys are offered the language as if its flag were on. Nothing else about the rule changes: the
-- language is still offered only where every item the survey asks has an approved translation and
-- the respondent pages' strings are approved (0079, 0084). A pilot cannot make an unapproved
-- translation reach anyone.
--
-- app.round_locale_state gains `pilot` per language, so the survey page (lib/i18n/offered.ts) and
-- the dispatcher (supabase/functions/_shared/mail.ts) read it from where they already read the
-- rest. Nothing here is stored with an answer, and nothing makes language a segment (I6).

create table app.locale_pilots (
  locale    text not null check (locale in ('en', 'pl', 'lt')),
  org_id    uuid not null references app.organizations (id) on delete cascade,
  added_by  uuid references auth.users (id) on delete set null,
  added_at  timestamptz not null default now(),
  primary key (locale, org_id)
);
create index locale_pilots_org_idx on app.locale_pilots (org_id);
create index locale_pilots_added_by_idx on app.locale_pilots (added_by);

comment on table app.locale_pilots is
  'Organisations offered a survey language before its flag is on for everyone (0085). Written only by public.admin_locale_pilot; the history is app.admin_audit.';

alter table app.locale_pilots enable row level security;
-- read by round_locale_state and the admin functions (definer); no client reads or writes it
revoke all on app.locale_pilots from public, anon, authenticated;

-- 0084's, with whether the round's organisation pilots the language
create or replace function app.round_locale_state(p_round uuid) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_object_agg(l.locale, jsonb_build_object(
    'missing', (select count(*) from (select distinct k from app.round_item_keys(p_round) k) keys(k)
                where keys.k not in (select x.item_id from app.round_texts(p_round, l.locale) x)),
    'ui', (select coalesce(jsonb_agg(a.messages_hash order by a.approved_at), '[]'::jsonb)
           from app.ui_translation_approvals a where a.locale = l.locale),
    'pilot', exists (select 1 from app.locale_pilots p join app.rounds r on r.org_id = p.org_id
                     where r.id = p_round and p.locale = l.locale))), '{}'::jsonb)
  from (values ('en'), ('pl'), ('lt')) as l(locale)
$fn$;

/** Add or remove a pilot organisation for a language: super-admin, with a reason, audited. */
create function public.admin_locale_pilot(p_locale text, p_org uuid, p_on boolean, p_reason text) returns jsonb
  language plpgsql volatile security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  if coalesce(p_locale, '') not in ('en', 'pl', 'lt') or p_on is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if not exists (select 1 from app.organizations o where o.id = p_org) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_on then
    insert into app.locale_pilots (locale, org_id, added_by) values (p_locale, p_org, auth.uid()) on conflict do nothing;
  else
    delete from app.locale_pilots where locale = p_locale and org_id = p_org;
  end if;
  perform app.admin_log('locale.' || case when p_on then 'pilot_add' else 'pilot_remove' end,
                        p_org, 'locale', p_locale, btrim(p_reason), null);
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.admin_locale_pilot(text, uuid, boolean, text) from public, anon;
grant execute on function public.admin_locale_pilot(text, uuid, boolean, text) to authenticated;

/** Every language pilot, with its organisation's name. Super-admin. */
create function public.admin_locale_pilots() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not app.is_platform_admin(array['super_admin']::app.platform_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  return jsonb_build_object('ok', true, 'pilots', coalesce((
    select jsonb_agg(jsonb_build_object('locale', p.locale, 'org_id', o.id, 'name', o.name, 'at', p.added_at)
                     order by p.locale, o.name)
    from app.locale_pilots p join app.organizations o on o.id = p.org_id), '[]'::jsonb));
end $fn$;
revoke all on function public.admin_locale_pilots() from public, anon;
grant execute on function public.admin_locale_pilots() to authenticated;
