import { z } from 'zod'

/**
 * Where "Se i plattformen" and "Dette bruker dere" point (D-88): the Plattform section each
 * key names, as the design's `U` table maps them. Labels are `site.story.use.<key>`.
 */
export const USES = {
  mal: '/plattform#malinger',
  svar: '/plattform#respondent',
  res: '/plattform#resultater',
  vis: '/plattform#segment',
  kom: '/plattform#kommentarer',
  tilt: '/plattform#tiltak',
  rap: '/plattform#rapport',
  rol: '/plattform#roller',
  opp: '/plattform#oppsett',
  ast: '/plattform#assistent',
} as const
export type UseKey = keyof typeof USES

/** A story section's words, as `site.hvorfor.sections[]` and `site.bruksomrader.sections[]` hold them. */
export const StoryWords = z.object({
  k: z.string(),
  t: z.string(),
  d: z.string(),
  points: z.array(z.string()),
  src: z.string().optional(),
  m: z.object({
    title: z.string(),
    note: z.string(),
    foot: z.string().optional(),
    rows: z.array(z.string()).optional(),
    cols: z.array(z.string()).optional(),
    teams: z.array(z.string()).optional(),
    steps: z.array(z.object({ t: z.string(), d: z.string() })).optional(),
    cards: z.array(z.object({ tag: z.string(), t: z.string(), meta: z.string() })).optional(),
    labels: z.array(z.string()).optional(),
  }),
})
