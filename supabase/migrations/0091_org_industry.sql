-- 0091_org_industry.sql — the organisation's industry, chosen or taken from its NACE code (D-139).
--
-- Tor, 2026-09-27: "bygg resten også". innstillinger-og-forside.md § 3.1: Oppsett › Selskap gets
-- a «Bransje» setting. The industry decides which module Målinger and Måleoppsett suggest; the
-- core survey is the same for everyone.
--
--   industry_source  null      not chosen: the industry follows the registered NACE code, as before
--                    'brreg'   chosen to follow the NACE code, so it moves when the code does
--                    'manual'  chosen by the organisation: industry_key, or null for «Ingen
--                              bransjemodul»; a new NACE code never overwrites it
--   industry_key     the chosen industry's slug (content/industries/meta.ts), manual only
--   industry_suggested  what the NACE code suggested when the choice was made, manual only. When
--                    the code later suggests something else, Oppsett asks whether to switch;
--                    keeping the choice records the new suggestion so the question is not asked again.
--
-- The slugs themselves are the registry's, checked by zod at the one write path (the server action),
-- so a new industry is an entry in the registry and not a migration. Here only the shape is held.
-- The columns are the organisation's own, written under 0001's org_update policy (daglig leder).

alter table app.organizations
  add column industry_key text,
  add column industry_source text,
  add column industry_suggested text,
  add constraint organizations_industry_slug check (
    (industry_key is null or industry_key ~ '^[a-z]+(-[a-z]+)*$')
    and (industry_suggested is null or industry_suggested ~ '^[a-z]+(-[a-z]+)*$')),
  add constraint organizations_industry_source check (industry_source in ('brreg', 'manual')),
  -- only a manual choice names an industry; following the code stores nothing that could go stale
  add constraint organizations_industry_manual check (
    industry_source is not distinct from 'manual' or (industry_key is null and industry_suggested is null));
