/** What an in-app request can be about (D-92): the ticket categories a customer may choose. */
export const REQUEST_CATEGORIES = [
  'getting_started',
  'survey_delivery',
  'results_anonymity',
  'tiltak',
  'billing',
  'bug',
  'feature_request',
  'personvern',
] as const
export type RequestCategory = (typeof REQUEST_CATEGORIES)[number]

/** The longest page path a request keeps: `submit_help_request` (0051) stores at most 160 characters. */
export const HELP_PAGE_MAX = 160

/** A path and nothing else: no scheme, no host, no query string, no fragment (D-174). */
export const HELP_PAGE_PATTERN = /^\/[A-Za-z0-9\-._~%/]*$/

/**
 * The page a request is filed from, as the ticket records it (D-174): the path only. Anything
 * after `?` or `#` is cut, since a query can carry a search, a filter or a token, and a
 * respondent page under /s/ is never named, since its path is the invitation token. The
 * respondent pages are outside the app shell, so that is a second lock, not the first. A path
 * that does not fit the pattern, or is longer than the ticket keeps, is sent as '' rather than
 * cut into a different one.
 */
export function helpPagePath(pathname: string): string {
  const path = pathname.replace(/[?#][\s\S]*$/, '')
  if (path === '/s' || path.startsWith('/s/')) return ''
  return path.length <= HELP_PAGE_MAX && HELP_PAGE_PATTERN.test(path) ? path : ''
}
