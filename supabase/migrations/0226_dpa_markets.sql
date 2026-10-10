-- 0226_dpa_markets.sql — a data processing agreement per market (UK-F1, X-113, D-274).
--
-- Until now there was one agreement: its words are Norway's (messages `dpa.*`), and a version is the
-- date it was published (0047, 0151). An organisation in the United Kingdom signs a different
-- agreement: one under Article 28 of the UK GDPR, in English, which governs itself (the gb pack's
-- `dpa`, messages/market/gb/en.json). Its versions run on their own, so:
--
--   * app.dpa_versions.market: whose agreement a version is. Every existing row is Norway's.
--   * A version of another market's agreement carries that market's code in front of its date
--     ('gb-2026-10-10'): versions are the primary key, and the signatures' foreign key, so two
--     markets publishing on the same day must not collide. Norway's keep their bare dates.
--   * app.dpa_market(market): the agreement an organisation in a market signs — its market's own
--     where one is published, else Norway's. Sweden signs Norway's until its PUB-avtal (SE-E), as
--     it does today. lib/legal/dpa.ts DPA_MARKET mirrors it; tests/unit/dpa.test.ts holds the two
--     to each other and to the versions published here.
--   * public.sign_dpa signs the newest version of the organisation's agreement, not the newest of
--     all: published today, the UK's would otherwise be "current" for every Norwegian organisation.
--   * The first UK version, with the SHA-256 of the gb pack's text (lib/legal/dpa.ts DPA_IN_FORCE.gb).
--
-- Nothing here concerns respondents. No signature changes: every one is of a Norwegian version, and
-- stays one.

-- ---------------------------------------------------------------- whose agreement a version is
alter table app.dpa_versions add column market text not null default 'no' references app.markets(code);

alter table app.dpa_versions drop constraint dpa_versions_version_check;
alter table app.dpa_versions add constraint dpa_versions_version_check
  check (version ~ '^([a-z]{2}-)?\d{4}-\d{2}-\d{2}(\.\d+)?$');
-- Norway's versions are bare dates; any other market's begins with its own code
alter table app.dpa_versions add constraint dpa_versions_market_prefix
  check (case when market = 'no' then version ~ '^\d' else version like market || '-%' end);

create index dpa_versions_market on app.dpa_versions (market, published_on desc, version desc);

-- A published version cannot change, its market included: a signature of it names that agreement.
create or replace function app.dpa_versions_fixed() returns trigger
  language plpgsql set search_path = ''
as $fn$
begin
  if tg_op = 'UPDATE' and (new.version, new.text_sha256, new.published_on, new.market)
       is distinct from (old.version, old.text_sha256, old.published_on, old.market) then
    raise exception 'a published agreement version cannot be changed; publish a new one';
  end if;
  return new;
end $fn$;

-- ---------------------------------------------------------------- the agreement a market signs
create function app.dpa_market(p_market text) returns text
  language sql stable set search_path = ''
as $fn$
  select case when exists (select 1 from app.dpa_versions v where v.market = p_market) then p_market else 'no' end
$fn$;

revoke all on function app.dpa_market(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- sign_dpa
-- As 0047, but the version in force is the newest of the organisation's market's agreement.
create or replace function public.sign_dpa(p_org uuid, p_version text, p_name text, p_title text) returns jsonb
  language plpgsql security definer set search_path = ''
as $fn$
declare
  v_current text;
  v_sha text;
  v_at timestamptz;
begin
  if p_org is null or not app.has_role(p_org, array['daglig_leder']::app.org_role[]) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  select v.version, v.text_sha256 into v_current, v_sha
  from app.dpa_versions v
  where v.market = app.dpa_market((select o.market from app.organizations o where o.id = p_org))
  order by v.published_on desc, v.version desc limit 1;
  if p_version is distinct from v_current then
    return jsonb_build_object('ok', false, 'error', 'not_current');
  end if;

  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 120
     or char_length(btrim(coalesce(p_title, ''))) not between 2 and 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid_signer');
  end if;

  insert into app.dpa_signatures (org_id, version, text_sha256, signed_by, signer_name, signer_title)
  values (p_org, v_current, v_sha, auth.uid(), btrim(p_name), btrim(p_title))
  on conflict (org_id, version) do nothing
  returning signed_at into v_at;

  if v_at is null then
    return jsonb_build_object('ok', false, 'error', 'already_signed');
  end if;
  return jsonb_build_object('ok', true, 'signed_at', v_at);
end $fn$;

revoke all on function public.sign_dpa(uuid, text, text, text) from public, anon;
grant execute on function public.sign_dpa(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------- the United Kingdom's first version
insert into app.dpa_versions (version, text_sha256, published_on, market)
values ('gb-2026-10-10', '46f551600233f48d5d92d1166e0c60f781ba1af864b3ef0dd10fd39f8bfef411', date '2026-10-10', 'gb');
