import type { Section } from './access'

/**
 * Design revision 3's new views (Sentral › Growth and its neighbours, D-181), each with its
 * address, the access section that shows it and the phase of docs/implementation/growth-admin.md
 * that fills it. G0 builds every route with the page head and the design's empty treatment; the
 * phase named here replaces that with the view itself.
 *
 * The keys are the menu's (lib/admin/nav.ts) and the message keys under `admin.growth.view`.
 */
export type GrowthPhase = 'G2' | 'G3' | 'G4'
export type GrowthView = { href: string; section: Section; phase: GrowthPhase }

export const GROWTH_VIEWS = {
  growthBoard: { href: '/admin/growth', section: 'growth', phase: 'G2' },
  growthPlan: { href: '/admin/growth/plan', section: 'growth', phase: 'G2' },
  growthFunnel: { href: '/admin/growth/funnel', section: 'growth', phase: 'G2' },
  growthEvents: { href: '/admin/growth/events', section: 'growth', phase: 'G2' },
  growthRules: { href: '/admin/growth/rules', section: 'growth', phase: 'G2' },
  growthExperiments: { href: '/admin/growth/experiments', section: 'growth', phase: 'G2' },
  growthRisks: { href: '/admin/growth/risks', section: 'growth', phase: 'G2' },
  growthCoverage: { href: '/admin/growth/coverage', section: 'growth', phase: 'G2' },
  crmConsent: { href: '/admin/crm/consent', section: 'crm', phase: 'G3' },
  crmTriggers: { href: '/admin/crm/triggers', section: 'crm', phase: 'G3' },
  crmPartners: { href: '/admin/crm/partners', section: 'crm', phase: 'G3' },
  cmsMagnets: { href: '/admin/cms/magnets', section: 'growth', phase: 'G4' },
  deliverability: { href: '/admin/deliverability', section: 'growth', phase: 'G4' },
} as const satisfies Record<string, GrowthView>

export type GrowthViewKey = keyof typeof GROWTH_VIEWS

/** The addresses the menu may offer: every one of these routes exists (app/(admin)/admin/…). */
export const GROWTH_PAGES: readonly string[] = Object.values(GROWTH_VIEWS).map((v) => v.href)
