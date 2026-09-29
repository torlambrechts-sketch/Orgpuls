import { canSee, HREF, type Section } from './access'
import type { AdminRole } from './api'

/**
 * The admin's menu (Sentral, X-095; was X-091): six areas in the top bar — Overview, Customers,
 * CRM, Content, Analytics, Admin — and under the bar the pages of the area you are in. Every page keeps its
 * icon for the phone's menu sheet.
 *
 * A role sees an area only when it may see one of its pages (lib/admin/access.ts); the database
 * still decides what every call returns.
 */
export type AdminIcon =
  | 'dashboard'
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

export type NavItem = { key: string; href: string; icon: AdminIcon; exact?: boolean }
export type NavGroup = { key: 'overview' | 'customers' | 'crm' | 'content' | 'analytics' | 'admin'; icon: AdminIcon; items: NavItem[] }

/** an area's own icon, in the phone's menu sheet */
const GROUP_ICON: Record<NavGroup['key'], AdminIcon> = { overview: 'dashboard', customers: 'users', crm: 'target', content: 'globe', analytics: 'chart', admin: 'shield' }

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
    ],
  },
  {
    key: 'crm',
    items: [
      { key: 'crmOverview', section: 'crm', href: '/admin/crm', icon: 'target', exact: true },
      { key: 'crmInbox', section: 'crm', href: '/admin/crm/inbox', icon: 'inbox' },
      { key: 'crmPipeline', section: 'crm', href: '/admin/crm/pipeline', icon: 'kanban' },
      { key: 'crmProspects', section: 'crm', href: '/admin/crm/prospects', icon: 'building' },
      { key: 'crmContacts', section: 'crm', href: '/admin/crm/contacts', icon: 'contacts' },
      { key: 'crmLists', section: 'crm', href: '/admin/crm/lists', icon: 'list' },
      { key: 'crmSegments', section: 'crm', href: '/admin/crm/segments', icon: 'filter' },
      { key: 'crmCampaigns', section: 'crm', href: '/admin/crm/campaigns', icon: 'mail' },
      { key: 'tickets', section: 'tickets', href: HREF.tickets, icon: 'ticket' },
      { key: 'crmTemplates', section: 'crm', href: '/admin/crm/templates', icon: 'template' },
      { key: 'crmStages', section: 'crm', href: '/admin/crm/stages', icon: 'flag' },
    ],
  },
  {
    key: 'content',
    items: [
      { key: 'cms', section: 'cms', href: HREF.cms, icon: 'page' },
      { key: 'cmsRedirects', section: 'cms', href: '/admin/cms/redirects', icon: 'redirect' },
      { key: 'seo', section: 'seo', href: HREF.seo, icon: 'search' },
      { key: 'translations', section: 'translations', href: HREF.translations, icon: 'globe' },
      { key: 'legal', section: 'legal', href: HREF.legal, icon: 'scale' },
      { key: 'modules', section: 'modules', href: HREF.modules, icon: 'puzzle' },
    ],
  },
  {
    key: 'analytics',
    items: [
      { key: 'web', section: 'web', href: HREF.web, icon: 'chart' },
      { key: 'acquisition', section: 'acquisition', href: HREF.acquisition, icon: 'coins' },
    ],
  },
  {
    key: 'admin',
    items: [
      { key: 'admins', section: 'admins', href: HREF.admins, icon: 'shield' },
      { key: 'ops', section: 'ops', href: HREF.ops, icon: 'activity' },
      { key: 'audit', section: 'audit', href: HREF.audit, icon: 'log' },
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
export const isCurrent = (item: Pick<NavItem, 'href' | 'exact'>, path: string) =>
  item.exact ? path === item.href : path === item.href || path.startsWith(`${item.href}/`)

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
