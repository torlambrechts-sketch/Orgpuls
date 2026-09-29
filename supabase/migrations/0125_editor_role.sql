-- 0125 — the editor role (X-095 phase 10, plan decision 5; D-170)
--
-- A copywriter or translator's role: the site's pages, landing pages, media, redirects, the site
-- notice and SEO — no customer data. Added on its own because a new enum value cannot be used in the
-- transaction that adds it; 0126 gives it its gates.
alter type app.platform_role add value if not exists 'editor';
