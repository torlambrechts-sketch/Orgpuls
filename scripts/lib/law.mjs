/**
 * What states Norwegian law, names its bodies or its register: a text in messages/no.json that a
 * market's legal pack has to replace with its own law's (lib/i18n/market-overlay.ts, D-257).
 * tests/unit/legal-pack.test.ts holds every such text to a counterpart in each pack, and
 * scripts/i18n/pack-delta.mjs never leaves one out of a pack as a copy: a pack that repeats it word
 * for word says the words hold under its own law too, and a later edit to Norway's must not reach it.
 */
export const NORWEGIAN_LAW =
  /Arbeidstilsynet|arbeidsmiljøloven|\baml\b|§|\bAMU\b|arbeidsmiljøutvalg|forskrift|internkontroll|Brønnøysund|norske|Norge|Lovdata|bedriftshelse|\bBHT\b|STAMI|Datatilsynet|kontrolltiltak|kap(ittel|\.) 2A/i

/**
 * Documents a market's pack holds whole, whatever their words: a signed agreement with its own version
 * and hash (dpa, 0226), and the privacy notice and the terms, each a market's own document (UK-F,
 * D-274). A copied sentence in one of them is the market's sentence, not Norway's.
 */
export const WHOLE_DOCUMENTS = ['dpa', 'seo.pages.personvernerklaering', 'seo.pages.vilkar']
