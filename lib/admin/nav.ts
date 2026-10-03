import { canSee, HREF, type Section } from './access'
import type { AdminRole } from './api'

/**
 * The admin's menu (Sentral, X-095; was X-091): the areas in the top bar — Overview, Customers,
 * CRM, Marketing, Content, Analytics, Growth, Admin — and under the bar the pages of the area you are in.
 * Every page keeps its icon for the phone's menu sheet. Growth sits between Analytics and Admin, as
 * design revision 3 draws it (D-181).
 *
 * A role sees an area only when it may see one of its pages (lib/admin/access.ts); the database
 * still decides what every call returns.
 */
export type AdminIcon =
  | 'dashboard'
  | 'image'
  | 'building'
  | 'pulse'
  | 'users'
  | 'ticket'
  | 'target'
  | 'kanban'
  | 'inbox'
  | 'mail'
  | 'contacts'
  | 'list'
  | 'filter'
  | 'template'
  | 'flag'
  | 'chart'
  | 'coins'
  | 'search'
  | 'puzzle'
  | 'scale'
  | 'globe'
  | 'activity'
  | 'log'
  | 'shield'
  | 'page'
  | 'redirect'

/**
 * `more`: a page of the area kept behind the sub-bar's «More», where the design draws no place for it.
 * `also`: other addresses the entry stands for — pages merged under one entry as tabs (Contacts & lists).
 */
export type NavItem = { key: string; href: string; icon: AdminIcon; exact?: boolean; more?: boolean; also?: readonly string[] }
export type NavGroup = { key: 'overview' | 'customers' | 'crm' | 'marketing' | 'content' | 'analytics' | 'growth' | 'admin'; icon: AdminIcon; items: NavItem[] }

/** an area's own icon, in the phone's menu sheet */
const GROUP_ICON: Record<NavGroup['key'], AdminIcon> = {
  overview: 'dashboard',
  customers: 'users',
  crm: 'target',
  marketing: 'mail',
  content: 'globe',
  analytics: 'chart',
  growth: 'pulse',
  admin: 'shield',
}

/** each page once, under the section it belongs to; `section` is the access key that shows it */
const MODEL: { key: NavGroup['key']; items: (NavItem & { section: Section })[] }[] = [
  {
    key: 'overview',
    items: [
      { key: 'dashboard', section: 'dashboard', href: HREF.dashboard, icon: 'dashboard', exact: true },
    ],
  },
  {
    key: 'customers',
    items: [
      { key: 'orgs', section: 'orgs', href: HREF.orgs, icon: 'building' },
      { key: 'health', section: 'health', href: HREF.health, icon: 'pulse' },
      { key: 'users', section: 'users', href: HREF.users, icon: 'users' },
      // support's queue sits with the customers it serves (X-097)
      { key: 'tickets', section: 'tickets', href: HREF.tickets, icon: 'ticket' },
    ],
  },
  {
    key: 'crm',
    items: [
      // sales (X-097): the companies in the pipeline, what to do next, replies, and who is warm
      { key: 'crmPipeline', section: 'crm', href: '/admin/crm/pipeline', icon: 'kanban' },
      { key: 'crmProspects', section: 'crm', href: '/admin/crm/prospects', icon: 'building' },
      { key: 'crmTasks', section: 'crm', href: '/admin/crm/tasks', icon: 'flag' },
      { key: 'crmInbox', section: 'crm', href: '/admin/crm/inbox', icon: 'inbox' },
      { key: 'crmScoring', section: 'crm', href: '/admin/crm/scoring', icon: 'chart' },
      // design revision 3 (D-181): the register's triggers and the partners are sales' own
      { key: 'crmTriggers', section: 'crm', href: '/admin/crm/triggers', icon: 'building' },
      { key: 'crmPartners', section: 'crm', href: '/admin/crm/partners', icon: 'users' },
      { key: 'crmStages', section: 'crm', href: '/admin/crm/stages', icon: 'flag', more: true },
      // 0195 (D-210): what was deleted, for restore
      { key: 'crmRestore', section: 'crm', href: '/admin/crm/restore', icon: 'log', more: true },
    ],
  },
  {
    key: 'marketing',
    items: [
      // marketing (X-097): mail and who it goes to — contacts, lists and segments are one entry with tabs
      { key: 'crmOverview', section: 'crm', href: '/admin/crm', icon: 'target', exact: true },
      { key: 'crmCampaigns', section: 'crm', href: '/admin/crm/campaigns', icon: 'mail' },
      { key: 'crmJourneys', section: 'crm', href: '/admin/crm/journeys', icon: 'activity' },
      { key: 'crmContacts', section: 'crm', href: '/admin/crm/contacts', icon: 'contacts', also: ['/admin/crm/lists', '/admin/crm/segments'] },
      // consent is the mail's legal basis, so it sits beside the contacts it covers (D-181)
      { key: 'crmConsent', section: 'crm', href: '/admin/crm/consent', icon: 'shield' },
      { key: 'crmTemplates', section: 'crm', href: '/admin/crm/templates', icon: 'template' },
    ],
  },
  {
    key: 'content',
    items: [
      { key: 'cms', section: 'cms', href: HREF.cms, icon: 'page' },
      { key: 'cmsTemplates', section: 'cms', href: '/admin/cms/templates', icon: 'template' },
      { key: 'cmsLanding', section: 'cms', href: '/admin/cms/landing', icon: 'flag' },
      // the tools and lead magnets carry consent rates and trials, so they are Growth's to see (D-181)
      { key: 'cmsMagnets', section: 'growth', href: '/admin/cms/magnets', icon: 'puzzle' },
      { key: 'cmsMedia', section: 'cms', href: '/admin/cms/media', icon: 'image' },
      { key: 'seo', section: 'seo', href: HREF.seo, icon: 'search' },
      { key: 'translations', section: 'translations', href: HREF.translations, icon: 'globe' },
      { key: 'cmsRedirects', section: 'cms', href: '/admin/cms/redirects', icon: 'redirect', more: true },
      { key: 'legal', section: 'legal', href: HREF.legal, icon: 'scale', more: true },
      { key: 'modules', section: 'modules', href: HREF.modules, icon: 'puzzle', more: true },
    ],
  },
  {
    key: 'analytics',
    items: [
      { key: 'web', section: 'web', href: HREF.web, icon: 'chart', exact: true },
      { key: 'webPages', section: 'web', href: '/admin/web/pages', icon: 'page' },
      { key: 'webGoals', section: 'web', href: '/admin/web/goals', icon: 'flag' },
      { key: 'webVisits', section: 'web', href: '/admin/web/visits', icon: 'globe', more: true },
      { key: 'acquisition', section: 'acquisition', href: HREF.acquisition, icon: 'coins', more: true },
    ],
  },
  {
    // Sentral › Growth (D-181): the report's engine, in the design's order
    key: 'growth',
    items: [
      { key: 'growthBoard', section: 'growth', href: HREF.growth, icon: 'kanban', exact: true },
      { key: 'growthPlan', section: 'growth', href: '/admin/growth/plan', icon: 'flag' },
      { key: 'growthFunnel', section: 'growth', href: '/admin/growth/funnel', icon: 'filter' },
      { key: 'growthEvents', section: 'growth', href: '/admin/growth/events', icon: 'list' },
      { key: 'growthRules', section: 'growth', href: '/admin/growth/rules', icon: 'activity' },
      { key: 'growthExperiments', section: 'growth', href: '/admin/growth/experiments', icon: 'target' },
      { key: 'growthRisks', section: 'growth', href: '/admin/growth/risks', icon: 'scale' },
      { key: 'growthCoverage', section: 'growth', href: '/admin/growth/coverage', icon: 'search' },
    ],
  },
  {
    key: 'admin',
    items: [
      { key: 'admins', section: 'admins', href: HREF.admins, icon: 'shield' },
      { key: 'billing', section: 'billing', href: HREF.billing, icon: 'coins' },
      { key: 'settings', section: 'settings', href: HREF.settings, icon: 'puzzle' },
      { key: 'deliverability', section: 'growth', href: '/admin/deliverability', icon: 'mail' },
      { key: 'audit', section: 'audit', href: HREF.audit, icon: 'log' },
      { key: 'ops', section: 'ops', href: HREF.ops, icon: 'activity', more: true },
    ],
  },
]

/** The menu a role is shown, among the pages that are built */
export function navFor(role: AdminRole, built: readonly string[]): NavGroup[] {
  return MODEL.map((g) => ({
    key: g.key,
    icon: GROUP_ICON[g.key],
    items: g.items.filter((i) => canSee(role, i.section) && built.includes(i.href)).map(({ section: _section, ...i }) => i),
  })).filter((g) => g.items.length > 0)
}

/** Whether a menu entry is the page you are on: exact for an index, else the page and what is under it */
export const isCurrent = (item: Pick<NavItem, 'href' | 'exact' | 'also'>, path: string): boolean =>
  (item.exact ? path === item.href : path === item.href || path.startsWith(`${item.href}/`)) ||
  (item.also ?? []).some((a) => path === a || path.startsWith(`${a}/`))

/** The address as the menu reads it: on the admin's own host a page has no /admin prefix */
export const adminPath = (path: string) => (path === '/admin' || path.startsWith('/admin/') ? path : path === '/' ? '/admin' : `/admin${path}`)

/** The page you are on: the entry whose address is the longest that holds it (Pages, not Redirects, for /admin/cms/…) */
export function currentItem(groups: NavGroup[], path: string): NavItem | null {
  const at = adminPath(path)
  let best: NavItem | null = null
  for (const i of groups.flatMap((g) => g.items)) if (isCurrent(i, at) && (!best || i.href.length > best.href.length)) best = i
  return best
}

/** The area holding the page you are on: the one whose pages the sub-bar shows */
export const groupOf = (groups: NavGroup[], path: string) => {
  const cur = currentItem(groups, path)
  return (cur && groups.find((g) => g.items.includes(cur))?.key) ?? groups[0]?.key ?? null
}
