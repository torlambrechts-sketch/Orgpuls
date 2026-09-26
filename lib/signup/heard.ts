/** The answers to "Hvordan hørte du om oss?" (D-104), as app.org_attribution.heard allows them (0059). */
export const HEARD = ['search', 'ai', 'linkedin', 'colleague', 'bht', 'event', 'newsletter', 'other'] as const
export type Heard = (typeof HEARD)[number]
