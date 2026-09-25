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
