import { canSee, HREF, type Section } from './access'
import type { AdminRole } from './api'

/**
 * The admin's menu (X-091): the sections grouped the way the work is — the customers, the CRM and
 * the marketing that feeds it, the content of the site, and the platform itself — each page with its
 * icon (components/admin/icons.tsx). The CRM's own pages are menu entries, not a row of tabs.
 *
 * A role sees a group only when it may see one of its pages (lib/admin/access.ts); the database
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
export type NavGroup = { key: 'overview' | 'customers' | 'crm' | 'content' | 'platform'; icon: AdminIcon; items: NavItem[] }

/** a section's own icon: its heading when the rail is narrowed to icons */
const GROUP_ICON: Record<NavGroup['key'], AdminIcon> = { overview: 'dashboard', customers: 'users', crm: 'target', content: 'globe', platform: 'shield' }

/** each page once, under the section it belongs to; `section` is the access key that shows it */
const MODEL: { key: NavGroup['key']; items: (NavItem & { section: Section })[] }[] = [
  { key: 'overview', items: [{ key: 'dashboard', section: 'dashboard', href: HREF.dashboard, icon: 'dashboard', exact: true }] },
  {
    key: 'customers',
    items: [
      { key: 'orgs', section: 'orgs', href: HREF.orgs, icon: 'building' },
      { key: 'health', section: 'health', href: HREF.health, icon: 'pulse' },
      { key: 'users', section: 'users', href: HREF.users, icon: 'users' },
      { key: 'tickets', section: 'tickets', href: HREF.tickets, icon: 'ticket' },
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
      { key: 'crmTemplates', section: 'crm', href: '/admin/crm/templates', icon: 'template' },
      { key: 'crmStages', section: 'crm', href: '/admin/crm/stages', icon: 'flag' },
      { key: 'web', section: 'web', href: HREF.web, icon: 'chart' },
      { key: 'acquisition', section: 'acquisition', href: HREF.acquisition, icon: 'coins' },
    ],
  },
  {
    key: 'content',
    items: [
      { key: 'cms', section: 'cms', href: HREF.cms, icon: 'page' },
      { key: 'cmsRedirects', section: 'cms', href: '/admin/cms/redirects', icon: 'redirect' },
      { key: 'seo', section: 'seo', href: HREF.seo, icon: 'search' },
      { key: 'modules', section: 'modules', href: HREF.modules, icon: 'puzzle' },
      { key: 'legal', section: 'legal', href: HREF.legal, icon: 'scale' },
      { key: 'translations', section: 'translations', href: HREF.translations, icon: 'globe' },
    ],
  },
  {
    key: 'platform',
    items: [
      { key: 'ops', section: 'ops', href: HREF.ops, icon: 'activity' },
      { key: 'audit', section: 'audit', href: HREF.audit, icon: 'log' },
      { key: 'admins', section: 'admins', href: HREF.admins, icon: 'shield' },
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

/** The section holding the page you are on: the one the menu opens with */
export const groupOf = (groups: NavGroup[], path: string) => groups.find((g) => g.items.some((i) => isCurrent(i, path)))?.key ?? groups[0]?.key ?? null

/** The rail's state, kept in a cookie so the server draws it as it was left */
export const RAIL_COOKIE = 'op_admin_rail'
