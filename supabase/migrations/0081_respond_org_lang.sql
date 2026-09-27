-- 0081_respond_org_lang.sql — the survey page falls back to the organisation's language (D-127
-- addendum, 2026-09-27).
--
-- With a language flag on, a personal message is in the employee's own language where the survey
-- is offered in it, and otherwise in bokmål (0080). That moved an English organisation's
-- employees with no language of their own from English mail to bokmål the moment `locale_en` was
-- signed off. The dispatcher now falls back to the organisation's language before bokmål, and the
-- survey page must open in the same one, so respond_locales also returns it.
--
-- respond_locales is 0079's, with the one marked line. The organisation's language says nothing
-- about the respondent, and nothing is stored with an answer (I6).

create or replace function public.respond_locales(p_token text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_inv   app.invitations%rowtype;
  v_round app.rounds%rowtype;
  v_state jsonb;
  v_texts jsonb;
begin
  if p_token is null or length(p_token) < 16 then
    return jsonb_build_object('error', 'invalid_token');
  end if;
  select * into v_inv from app.invitations i where i.token_hash = extensions.digest(p_token, 'sha256');
  if not found or v_inv.responded_at is not null or v_inv.expires_at <= now() then
    return jsonb_build_object('error', 'invalid_token');
  end if;
  select * into v_round from app.rounds r where r.id = v_inv.round_id;
  if v_round.status <> 'apen' then
    return jsonb_build_object('error', 'invalid_token');
  end if;

  v_state := app.round_locale_state(v_round.id);

  -- the wording, only for the languages that have all of it
  select coalesce(jsonb_object_agg(l.locale, (
           select coalesce(jsonb_object_agg(t.item_id, t.text), '{}'::jsonb)
           from app.item_translations t
           where t.locale = l.locale and t.approved_at is not null
             and t.item_id in (select app.round_item_keys(v_round.id)))), '{}'::jsonb)
  into v_texts
  from jsonb_each(v_state) as l(locale, s)
  where (l.s ->> 'missing')::int = 0;

  return jsonb_build_object(
    'employee_lang', (select e.language from app.employees e where e.id = v_inv.employee_id),
    -- 0081: the organisation's language, which its invitations were written in
    'org_lang', (select o.default_lang from app.organizations o where o.id = v_round.org_id),
    'locales', v_state,
    'texts', v_texts);
end $fn$;
revoke all on function public.respond_locales(text) from public;
grant execute on function public.respond_locales(text) to anon, authenticated;
