# Empvibe's articles — the UK topic plan (UK-H, D-278)

Research 11 October 2026, for Empvibe's site (www.empvibe.com/articles). No tool gave search volumes, so each topic was
ranked on evidence: how many pages compete and of what kind, whether HSE or Acas already own the answer, and how close
the searcher is to buying for a small UK employer. Every source named here was either in `docs/markets/uk-legal.md` or
answered HTTP 200 on 11 October 2026.

The articles follow Norway's editorial rule (D-235): an article answers one question the way a trade paper would and
sells nothing. No mention of the product, prices or trials; links only to other articles and to the two informational
pages (the law, safety representatives); every legal statement traceable to `docs/markets/uk-legal.md` or to the page
it quotes, verbatim. UK usage: «staff survey» first, «employee survey» second; «wellbeing», «organisation». Where an
article cites HSWA 1974 or MHSWR 1999 it says Great Britain and names Northern Ireland's twin.

## Findings that shaped the plan

1. **HSE says a survey may not be proportionate for a small firm.** Step 2 of the Management Standards («A survey is not
   an essential step and for smaller organisations it would not be proportionate to run such a survey, particularly
   where the same data can be gathered in other ways», updated 2022-05-17); the Talking Toolkits «were developed for
   smaller organisations so they can gather data that larger organisations may gather through surveys» (2025-09-05).
   Every survey article says so.
2. **HSE has a free online survey of its own**: the Stress Indicator Tool on books.hse.gov.uk, free for up to 50
   employees a year, reporting from 10 responses. HSENI suggests 10 too. The articles name both, and say what a smaller
   group threshold means, without naming any vendor.
3. **Competitors get the headcount rule wrong** («five or more workers», «more than five employees»), and none covers
   Northern Ireland, consultation or anonymity. The articles say «five or more employees» (MHSWR 1999 reg 3(6)).
4. HSE's downloads page links the Indicator Tool notes at a dead address; the working one is
   https://www.hse.gov.uk/stress/standards/notesindicatortool.htm.

## The ten, in the order the index and the start page take them

| # | Address | Target query | Section |
|---|---|---|---|
| 1 | `/articles/wellbeing-survey-questions` | staff wellbeing survey questions | Running a staff survey |
| 2 | `/articles/hse-indicator-tool` | HSE Indicator Tool | HSE's Management Standards and Indicator Tool |
| 3 | `/articles/stress-risk-assessment-steps` | how to do a stress risk assessment | Start here |
| 4 | `/articles/stress-risk-assessment-template` | stress risk assessment template | Start here |
| 5 | `/articles/hse-management-standards` | HSE Management Standards | HSE's Management Standards and Indicator Tool |
| 6 | `/articles/staff-survey-action-plan` | staff survey action plan | After the survey |
| 7 | `/articles/anonymous-staff-survey` | anonymous staff survey | Running a staff survey |
| 8 | `/articles/how-often-staff-survey` | how often should you run a staff survey | Running a staff survey |
| 9 | `/articles/sharing-staff-survey-results` | sharing staff survey results with employees | After the survey |
| 10 | `/articles/individual-stress-risk-assessment` | individual stress risk assessment | Start here |

Secondary queries, questions people ask, outlines, sources and the competitors each article has to beat are in the
research report kept with the session; the outlines are carried into each article's blocks. The registry is
`lib/marketing/articles-empvibe.ts`, the words `seo.articles.uk*` in `messages/market/gb/en.json`.

## Rejected, and why

- **The employer's legal duty on stress**: the law page (`/work-related-stress-law`) already targets it, and HSE's
  overview owns the query.
- **Safety representatives' rights**: competes with `/safety-representatives`; the provisions on time off, training and
  inspections are not in `uk-legal.md`.
- **Staff survey for small businesses**: an exact match for `/small-businesses`, and HSE's proportionality note argues
  against promoting surveys to small firms.
- **Work-related stress statistics**: HSE owns it, and the next annual release dates an article within weeks; one dated
  paragraph in #3.
- **Mental health risk assessment**: leads into individual health conditions, Equality Act adjustments (not
  researched) and health data; a secondary query of #4 and #10.
- **Psychosocial risk**: results dominated by Australian regulators and CIPD Ireland, no UK statute uses the term;
  folded into #5.
- **Pulse vs annual**: merged into #8.
