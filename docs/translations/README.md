# Survey translations: the machine drafts

Every text a respondent can meet has a first draft in Polish, Ukrainian, Lithuanian, Swedish and
Danish: the statements, the questions outside the index, the three published industry modules, the
survey pages, and the invitation, reminder and SMS texts. Each language has 553 texts (348 from the
first run, 205 from the second). The drafts are waiting for a human translator (X-071).

**Translations ship with the text (X-089, 2026-09-29).** A respondent-facing text that is added or
changed is drafted in all five languages in the same piece of work, never left for later: one
untranslated string takes a language out of every survey (D-133). See CLAUDE.md.

## Where they are

In admin › Translations, per language, every text beside its bokmål source, with origin *machine*
and status *draft*. Download a language there as JSON (recommended) or XLIFF 2.0. The translator
works in that file and imports it back (docs/implementation/translation-files.md).

- **Machine text is never approved** in these languages (0086). A text becomes approvable once the
  translator has imported it with origin *professional* and it has reached *pretested*, or with
  origin *official*.
- **The notes on each text are for the translator.** They are in English and name the choices a
  human should check: a term with real alternatives, a rewording made for gender neutrality or a
  placeholder, a register decision. In total there are 416 notes.

## How they were made

1. **The source:** the admin's own export (orgpuls-translations v1), built from the hosted
   project's published modules.
2. **One translator per language**, working from a shared brief:
   - plain language, about B1;
   - gender-neutral wherever the respondent or the manager is meant, since a gendered form would
     both exclude people and erode anonymity;
   - every `{placeholder}` readable uninflected;
   - every plural category of the language;
   - SMS length.

   Each followed its language's own norms (see the language pages) and wrote a glossary first.
3. **An independent reviewer per language** read every text against the bokmål and corrected what
   was wrong or clearly better. Every change is logged with before, after and reason.
4. **The import check** (`checkImport`, the same the admin runs) passed with zero errors in every
   language.
5. **A render check on the local QA stack**, where the survey was shown in each language and walked
   screen by screen, without submitting:
   - all 33 screens, at 320 and 390 px;
   - `lang` right, nothing overflowing, no text falling back to bokmål, no console error.

## The second run (2026-09-29)

- **What:** the 45 new page and mail texts of engagement phase 2 (`respond.since.*`,
  `respond.thanks.*`, `respond.reason*`, `respond.extent.*`, `mail.invitasjon.since*`,
  `.masked.*`, `.results*`, …), the question on whether a measure helped (`extra:tiltak_effekt`),
  two texts whose bokmål changed (`mail:invitasjon.lead`, `ui:respond.openNote`), and the
  handel and kunnskap-og-kontor modules (160 texts), which the first run predates. English for
  the handel, kunnskap-og-kontor and barnehage-og-skole modules, and the bygg and helse factor
  names, which the registry lacked.
- **How:** one translator per language, reading this page, the language page and the 348 texts
  already stored, so terms match. Every file passed `checkImport` with zero errors and zero
  warnings; module rows were written only where the bokmål's fingerprint equals the hosted
  module's.
- **Terms chosen here that the glossaries did not have** (each row carries its note): *tiltak*
  (pl «działania», uk «заходи», lt «priemonės», sv «åtgärder», da «tiltag»); *daglig leder* in the
  greeting's signature, gender-neutral where the language allows (lt «vadovybės vardu»; pl
  «dyrektor» is flagged); *KI* as AI (pl, sv, da «AI»; uk «ШІ»; lt «DI»); the extent scale
  «i svært liten grad … i svært stor grad», new to every language (sv and da note the QPSNordic
  and COPSOQ wordings for a methodologist).

## Swedish and Danish, and the official QPS Nordic

Orgpuls' core statements are Orgpuls wordings built on QPS Nordic, not QPS items. QPS asks frequency
questions («Kan du själv bestämma din arbetstakt?»), while Orgpuls uses agreement statements. So no
official text can simply be copied in.

- **Swedish:** the official Swedish QPSNordic (Arbetslivsrapport 2000:19) was used for terms. Where
  a statement corresponds to a QPSNordic item, the note cites the item and its official wording.
- **Danish:** the official Danish version was not available to us. It uses Arbejdstilsynet's and
  NFA's (COPSOQ) terms, and its notes cite the English QPSNordic item.

A methodologist decides whether any official wording replaces a draft, and the licence question
(gap analysis, decision 2) still applies.

## The language pages

- [Polish](pl.md)
- [Ukrainian](uk.md)
- [Lithuanian](lt.md)
- [Swedish](sv.md)
- [Danish](da.md)

Each page has the translator's glossary and decisions, the reviewer's log, and the open questions
for the human translator.
