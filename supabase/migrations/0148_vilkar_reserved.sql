-- 0148 — /vilkar is the terms of use's address now, so no CMS page may take it (D-194).
--
-- The terms were a draft in docs/legal and are published as app/(marketing)/vilkar. A CMS page
-- with the slug `vilkar` would sit behind the code route and never be shown, so the address is
-- reserved as every other route of the site is (0114, 0124, 0135). Hosted holds no CMS page with
-- that slug, so the check on app.cms_pages holds for every existing row.
--
-- Supersedes 0135's definition; the list is the same with 'vilkar' added.

create or replace function app.cms_reserved(p_kind text, p_slug text) returns boolean
  language sql immutable set search_path = ''
as $fn$
  select case p_kind
    when 'page' then p_slug = any (array[
      -- app/(marketing)
      'artikler', 'avmeld', 'bli-med', 'bransjer', 'bruksomrader', 'demo', 'hvorfor', 'kontakt', 'logg-inn', 'lovkrav', 'nyhetsbrev',
      'nytt-passord', 'personvernerklaering', 'plattform', 'priser', 'registrer', 'sikkerhet', 'smaa-bedrifter', 'verneombud',
      'vurdering', 'vilkar',
      -- the industries (content/industries)
      'bygg-og-anlegg', 'helse-og-omsorg', 'barnehage-og-skole', 'kunnskap-og-kontor', 'handel',
      -- app/(app), the admin, and the app's other roots
      'forhandsvis', 'hjelp', 'innsikt', 'integrasjoner', 'kommentarer', 'maleoppsett', 'malinger', 'oppsett', 'rapport', 'resultater', 'tiltak',
      'admin', 'api', 'auth', 'inn', 'logo', 'media', 'primitives', 'r', 's', 'sitemap', 'robots',
      -- addresses next.config.ts redirects
      'resultat', 'samtaler', 'arshjulet', 'om-oss'])
    when 'article' then p_slug = any (array[
      'nye-regler-psykososialt-arbeidsmiljo-2026', 'krav-til-kartlegging-av-psykososialt-arbeidsmiljo', 'medarbeiderundersokelse-sporsmal',
      'hvor-ofte-bor-dere-male-arbeidsmiljoet', 'anonym-medarbeiderundersokelse', 'verneombudets-rolle-i-kartleggingen'])
    else true
  end
$fn$;
