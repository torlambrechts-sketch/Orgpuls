/**
 * Design view → admin route, for sentral-run.mjs (D-181). The rows are the table in
 * docs/implementation/growth-admin.md § 1: design revision 3's thirteen new views and the three it changes.
 * `slug` names the view's render exactly as sentral-baseline.mjs names it
 * (design-reference/sentral/renders/<slug>-1440.png).
 *
 * A view is shot only when its route has a page in app/(admin)/admin; the rest are skipped with
 * a line saying so, so a phase that has not built its page yet does not fail the gate.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** as sentral-baseline.mjs's `slug`: «CRM › Brønnøysund triggers» → CRM_Bronnoysund_triggers */
export const slug = (area, page) => `${area}-${page}`.replace(/[^A-Za-z0-9ø]+/g, '_').replace(/ø/g, 'o')

/** [area, page, route] as the design's D.nav names the view and the plan routes it */
export const VIEW_ROUTES = [
  ['Growth', 'Board', '/admin/growth'],
  ['Growth', '90-day plan', '/admin/growth/plan'],
  ['Growth', 'Funnel & lead math', '/admin/growth/funnel'],
  ['Growth', 'Event catalogue', '/admin/growth/events'],
  ['Growth', 'Automation rules', '/admin/growth/rules'],
  ['Growth', 'Experiments', '/admin/growth/experiments'],
  ['Growth', 'Risks & decisions', '/admin/growth/risks'],
  ['Growth', 'Coverage review', '/admin/growth/coverage'],
  ['CRM', 'Consent', '/admin/crm/consent'],
  ['CRM', 'Brønnøysund triggers', '/admin/crm/triggers'],
  ['CRM', 'Partners', '/admin/crm/partners'],
  // changed in revision 3: fit × intent, a 1-hour SLA, the design principles
  ['CRM', 'Lead scoring', '/admin/crm/scoring'],
  ['CRM', 'Tasks', '/admin/crm/tasks'],
  ['CRM', 'Journeys', '/admin/crm/journeys'],
  ['Content', 'Tools & lead magnets', '/admin/cms/magnets'],
  ['Admin', 'Deliverability', '/admin/deliverability'],
].map(([area, page, route]) => ({ area, page, route, name: slug(area, page) }))

/** The page file that serves a route of the admin, relative to the repository */
export const pageFile = (route) => join('app', '(admin)', ...route.split('/').filter(Boolean), 'page.tsx')

/** Whether the admin serves the route yet */
export const routeExists = (route, root = '.') => existsSync(join(root, pageFile(route)))

/** The render a view is compared with */
export const baselineFile = (name, width = 1440) => join('design-reference', 'sentral', 'renders', `${name}-${width}.png`)
