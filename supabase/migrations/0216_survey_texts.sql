-- 0216 — the instrument's approved texts in a language, for the views a leader reads (D-253).
--
-- Swedish is a platform language since 0215 (D-252), and its catalogue, messages/sv.json, leaves
-- the survey instrument out: the statements, the factor names and the questions outside the index
-- are owned by the translation registry (app.item_translations, 0079/0084/0086), approved there,
-- and asked from there. A Swedish leader's results, report and question pages print the same
-- statements, so they read the same rows rather than a second copy in a message file.
--
-- public.survey_texts(locale) returns a language's approved instrument texts with the SHA-256 of
-- the bokmål each was translated from: the core statements (core:), the questions outside the
-- index and their options (extra:), and the factor and question labels (ui:factor., ui:extra.).
-- Nothing else: no draft, no page string, no mail text, no module item. The application lays a
-- text over its catalogue only where the bokmål it was translated from is still the bokmål
-- (lib/i18n/registry-overlay.ts); otherwise the English behind it stays.
--
-- Anonymous on purpose: these are the published instrument's wordings, the same texts the
-- respondent page and the public question pages show, and the loader runs without a session so it
-- can be cached (lib/i18n/survey-texts.ts). It reads no organisation's data.

create function public.survey_texts(p_locale text) returns jsonb
  language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_object_agg(t.item_id, jsonb_build_object('t', t.text, 'h', t.source_hash)), '{}'::jsonb)
  from app.item_translations t
  where t.locale = p_locale
    and t.status = 'approved'
    and (t.item_id like 'core:%' or t.item_id like 'extra:%' or t.item_id like 'ui:factor.%' or t.item_id like 'ui:extra.%')
$fn$;
revoke all on function public.survey_texts(text) from public;
grant execute on function public.survey_texts(text) to anon, authenticated;

comment on function public.survey_texts(text) is
  'A language''s approved instrument texts (core statements, extra questions and options, factor and question labels) with the bokmål source hash, for the leader''s views in that language (0216, D-253).';
