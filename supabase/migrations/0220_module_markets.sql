-- 0220_module_markets.sql — a module is offered in its market (SE-D, D-260).
--
-- The industry modules state Norwegian law: their legal basis names arbeidsmiljøloven and the
-- regulation's chapters, and their statements were written against Norwegian practice. Until now
-- any organisation could switch one on, so an organisation in Sweden (0218) would have been asked
-- questions grounded in another country's law, and its report would cite it as its own.
--
--   * app.module_markets lists, per module key, the markets the module is offered in. A key with
--     no row is Norway's: every module written before this one is, and a module synced without a
--     market stays where the product has always offered it. A module for another market is given
--     its row by the migration that brings it. Written by migrations only, as the markets are (0214).
--   * app.module_market_ok(key, market) states that rule, once.
--   * app.module_usable (0071) adds it, with the organisation's market. It is the one gate every
--     path a module takes into a round passes: set_org_module (through latest_usable_module, 0074),
--     round_default_modules, the round_modules trigger (round_module_ok), and the wording and
--     variant writers (0083, 0089). The pilot rule is unchanged: a draft is still usable only where
--     it is piloted, and now only in its market as well.
--   * public.org_module_keys(org) gives the screens the same answer — the keys an organisation may
--     use — so Målinger › Spørsmålssett and Måleoppsett offer what the database will accept, with
--     no second copy of the rule in the application.
--
-- No organisation outside Norway had a module on, a pilot or a module on a round when this was
-- written (hosted, 2026-10-10), so nothing already stored falls foul of the rule.

-- ---------------------------------------------------------------- the markets of a module
create table app.module_markets (
  module_key text not null check (module_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  market     text not null references app.markets (code),
  created_at timestamptz not null default now(),
  primary key (module_key, market)
);
create index module_markets_market_idx on app.module_markets (market);

comment on table app.module_markets is
  'The markets a module is offered in (D-260), by key, for every version. A key with no row is offered in Norway only. Written by migrations only; read through app.module_market_ok.';

alter table app.module_markets enable row level security;
revoke all on app.module_markets from anon, authenticated;
grant select on app.module_markets to authenticated;
create policy module_markets_read on app.module_markets for select to authenticated using (true);
-- no insert, update or delete policy and no write grant: a module's market is a migration's

-- ---------------------------------------------------------------- the rule, once
/** Whether a module key is offered in a market: one of its own, or Norway's when it names none. */
create function app.module_market_ok(p_key text, p_market text) returns boolean
  language sql stable security definer set search_path = ''
as $fn$
  select case
    when exists (select 1 from app.module_markets mm where mm.module_key = p_key)
      then exists (select 1 from app.module_markets mm where mm.module_key = p_key and mm.market = p_market)
    else coalesce(p_market, 'no') = 'no'
  end
$fn$;
-- called by module_usable (a definer) only; no client calls it (definer_grants_invariants)
revoke all on function app.module_market_ok(text, text) from public, anon, authenticated;

/** 0071's gate, with one addition: the module is offered in the organisation's market. */
create or replace function app.module_usable(p_module uuid, p_org uuid) returns boolean
  language sql stable security definer set search_path = ''
as $fn$
  select exists (select 1 from app.question_modules m
                 where m.id = p_module
                   and (m.status = 'published'
                        or (m.status = 'draft' and exists (select 1 from app.module_pilots p
                                                           where p.module_id = m.id and p.org_id = p_org)))
                   and app.module_market_ok(m.key, (select o.market from app.organizations o where o.id = p_org)))
$fn$;
revoke all on function app.module_usable(uuid, uuid) from public, anon;
grant execute on function app.module_usable(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- what the screens offer
/** The module keys an organisation may use, for its members: what module_usable accepts. */
create function public.org_module_keys(p_org uuid) returns text[]
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce(array_agg(distinct m.key order by m.key), '{}')
  from app.question_modules m
  where app.is_org_member(p_org) and app.module_usable(m.id, p_org)
$fn$;
revoke all on function public.org_module_keys(uuid) from public, anon;
grant execute on function public.org_module_keys(uuid) to authenticated;
