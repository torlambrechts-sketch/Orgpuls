# Translation files for survey languages

The survey can be offered in **Polish, Ukrainian, Lithuanian, Swedish and Danish** besides bokmål and
English (D-133). The platform itself stays bokmål and English, and the admin English.

Everything a respondent reads in one of these languages is managed in **admin › Translations**.
That covers the survey statements, the questions outside the index, the industry modules, the
survey pages, and the invitation, reminder and SMS texts.

## The recommendation: one JSON file per language

The canonical format is the **Orgpuls translation package**, one JSON file per language, exported
from admin › Translations. It is recommended because:

- **Self-contained.** Each entry carries what a translator needs: the bokmål source, the English as
  a reference, where the text appears, and the current translation.
- **Safe to round-trip.** Every entry carries the fingerprint (SHA-256) of the bokmål it was
  translated from. When the bokmål later changes, the translation is marked *out of date* instead
  of silently shown.
- **Readable.** It diffs cleanly, and any editor or translation tool reads it.

For a translation agency working in a CAT tool (Trados, memoQ, Phrase), export **XLIFF 2.0**
instead. It holds the same entries and imports back the same way.

We did not choose one message file per language in the repository, the usual `next-intl` setup.
Survey texts must be imported and approved without a deploy, and the questions and module texts
live in the database anyway.

### The JSON format

```json
{
  "format": "orgpuls-translations",
  "version": 1,
  "locale": "pl",
  "source_locale": "nb",
  "exported_at": "2026-09-27T12:00:00.000Z",
  "entries": [
    {
      "key": "core:ytring:1",
      "section": "core",
      "context": "Statement 1 of «Ytringsklima», answered on a 1–5 agreement scale. Part of the validated core instrument.",
      "source": "Jeg kan si fra om kritikkverdige forhold uten å frykte konsekvenser",
      "reference_en": "I can report censurable conditions without fearing consequences",
      "target": "",
      "status": "untranslated",
      "origin": null,
      "notes": "",
      "source_hash": "91d2…"
    }
  ]
}
```

A translator fills in `target`, and may set `status` and `notes`. Every other field is left as it
is.

| Field | Meaning |
|---|---|
| `key` | Which text. Never change it. |
| `section` | `core` (survey statements), `extra` (questions outside the index), `module` (industry modules), `ui` (survey pages), `mail` (invitations, reminders and SMS). |
| `source` | The bokmål. Always the original. |
| `reference_en` | The English, for reference only. |
| `target` | The translation. |
| `status` | The TRAPD step (see the workflow below): `draft`, `in_review`, `adjudicated` or `pretested`. `approved` in a file is imported as `pretested`, because only the admin approves. |
| `origin` | `official`, `professional` or `machine`. If missing, the import form's choice applies. |
| `notes` | Adjudication notes, a cognitive-interview finding, or anything else to keep with the text. |
| `source_hash` | The fingerprint of the bokmål this translation was made from. Leave it alone. |

### Rules for translators

- **Keep every `{placeholder}` exactly as it is**, for example `{org}`, `{round}` or `{date}`. The
  import refuses a text whose placeholders differ from the source's.
- **Plurals** (`{count, plural, …}`) need every form the language has:

  | Language | Forms |
  |---|---|
  | Polish, Ukrainian, Lithuanian | `one`, `few`, `many`, `other` |
  | Swedish, Danish | `one`, `other` |

  The import refuses a plural that is missing a form.
- **SMS texts** should fit one SMS. Accented or Cyrillic text allows 70 characters per SMS, not
  160. The import warns about a text that would take more than one.
- **Leave `target` empty** for anything not yet translated. Empty entries are skipped.

## The workflow

1. **Export.** In admin › Translations, choose the language and click **Download JSON** (or XLIFF
   2.0).
2. **Translate.** Per the multilingual guide's TRAPD protocol: two independent translations, a
   review, an adjudicator's decision, then 5–8 cognitive interviews. The file can travel between
   steps with its `status` advanced.
3. **Import.** Choose the file and who translated it, then click **Check file**. The check lists
   what would be written and what is kept out, and why. Then click **Import**. Nothing imported is
   approved.
4. **Approve.** When the translations are `pretested`, or are an official version, **Approve**
   approves exactly what the page shows. Machine text is never approved in these languages.
5. **Switch on.** Respondents are offered the language when two things hold:
   - every text a survey asks is approved, including the survey pages and the invitation texts;
   - the language's flag is on (`locale_pl` and so on), or the organisation is a language pilot.
     Pilots are set on the legal review page.

Each import and each approval is recorded in the audit log. Every version of every translation is
kept in the database's translation history, and a survey already running keeps the wording it
started with.

## Swedish and Danish

The QPS Nordic questionnaire has official Swedish and Danish versions. Import the core statements
from them with the origin set to **Official version**. An official text may be approved at any
step. The survey pages and invitations have no official version and go through a translator as
usual.

Before anything is published under the QPS Nordic name in a new language, the licence question
(gap analysis, decision 2) still applies.
