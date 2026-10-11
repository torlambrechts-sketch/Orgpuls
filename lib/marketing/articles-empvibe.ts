import type { Article, ArticleGroup, LandingSlug } from './site'

/**
 * Empvibe's articles (UK-H, D-277): written for the United Kingdom, in British English, on UK law
 * as docs/markets/uk-legal.md sets it out, for the searches a UK employer makes (the topic plan in
 * docs/markets/uk-articles.md). Their words are the gb pack's (messages/market/gb/en.json
 * `seo.articles.<key>`), so none of Norway's articles is shown on Empvibe's site, and none of these
 * on Norway's. Informational, as Norway's are (D-235): no product, no prices, links only to other
 * articles and the two informational pages.
 *
 * Data only, edge-safe: lib/hosts.ts reads the slugs for the pages Empvibe's site serves and their
 * addresses (/articles/<slug>). Kept apart from lib/marketing/site.ts, whose entries
 * scripts/marketing/og-images.mjs reads as Norway's.
 */

/**
 * The index's sections on Empvibe's site, in order, by Norway's keys with the gb pack's headings
 * (`seo.index.groups.<group>`): start here (the stress risk assessment), HSE's Management Standards
 * and Indicator Tool, running a staff survey, after the survey
 */
export const EMPVIBE_ARTICLE_GROUPS: readonly ArticleGroup[] = ['start', 'lov', 'gjennomforing', 'etter']

/** Newest first, then in the topic plan's order: the start page shows the first three */
export const EMPVIBE_ARTICLES: Article[] = [
  {
    slug: 'wellbeing-survey-questions',
    key: 'ukQuestions',
    group: 'gjennomforing',
    published: '2026-10-11',
    modified: '2026-10-11',
    related: ['hse-indicator-tool', 'anonymous-staff-survey'],
    art: 'survey',
  },
  {
    slug: 'hse-indicator-tool',
    key: 'ukIndicatorTool',
    group: 'lov',
    published: '2026-10-11',
    modified: '2026-10-11',
    related: ['hse-management-standards', 'sharing-staff-survey-results'],
    art: 'survey',
  },
  {
    slug: 'stress-risk-assessment-steps',
    key: 'ukStressSteps',
    group: 'start',
    published: '2026-10-11',
    modified: '2026-10-11',
    related: ['stress-risk-assessment-template', 'hse-management-standards'],
    art: 'risk',
  },
  {
    slug: 'stress-risk-assessment-template',
    key: 'ukStressTemplate',
    group: 'start',
    published: '2026-10-11',
    modified: '2026-10-11',
    related: ['stress-risk-assessment-steps', 'staff-survey-action-plan'],
    art: 'law',
  },
  {
    slug: 'hse-management-standards',
    key: 'ukStandards',
    group: 'lov',
    published: '2026-10-11',
    modified: '2026-10-11',
    related: ['hse-indicator-tool', 'wellbeing-survey-questions'],
    art: 'law',
  },
  {
    slug: 'staff-survey-action-plan',
    key: 'ukActionPlan',
    group: 'etter',
    published: '2026-10-11',
    modified: '2026-10-11',
    related: ['sharing-staff-survey-results', 'how-often-staff-survey'],
    art: 'board',
  },
  {
    slug: 'anonymous-staff-survey',
    key: 'ukAnonymous',
    group: 'gjennomforing',
    published: '2026-10-11',
    modified: '2026-10-11',
    related: ['wellbeing-survey-questions', 'sharing-staff-survey-results'],
    art: 'anon',
  },
  {
    slug: 'how-often-staff-survey',
    key: 'ukHowOften',
    group: 'gjennomforing',
    published: '2026-10-11',
    modified: '2026-10-11',
    related: ['staff-survey-action-plan', 'anonymous-staff-survey'],
    art: 'wheel',
  },
  {
    slug: 'sharing-staff-survey-results',
    key: 'ukSharing',
    group: 'etter',
    published: '2026-10-11',
    modified: '2026-10-11',
    related: ['staff-survey-action-plan', 'anonymous-staff-survey'],
    art: 'meeting',
  },
  {
    slug: 'individual-stress-risk-assessment',
    key: 'ukIndividual',
    group: 'start',
    published: '2026-10-11',
    modified: '2026-10-11',
    related: ['stress-risk-assessment-steps', 'stress-risk-assessment-template'],
    art: 'meeting',
  },
]

/** Which articles each of Empvibe's landing pages points to */
export const EMPVIBE_LANDING_ARTICLES: Partial<Record<LandingSlug, [string, string]>> = {
  lovkrav: ['stress-risk-assessment-steps', 'hse-management-standards'],
  verneombud: ['sharing-staff-survey-results', 'anonymous-staff-survey'],
  'smaa-bedrifter': ['stress-risk-assessment-template', 'wellbeing-survey-questions'],
}

/** The article on the questions a survey asks, linked from the start page's survey and the platform's */
export const EMPVIBE_QUESTIONS_ARTICLE: string | null = 'wellbeing-survey-questions'
