import type { AdminRole } from './api'

/**
 * Which sections each admin role is shown (D-90), as the specification's access model has
 * it. The database decides what each call returns; this only keeps a role from being offered
 * a page that would answer "not allowed".
 */
export const SECTIONS = ['dashboard', 'orgs', 'health', 'users', 'ops', 'web', 'seo', 'acquisition', 'crm', 'cms', 'modules', 'legal', 'translations', 'tickets', 'audit', 'admins'] as const
export type Section = (typeof SECTIONS)[number]

const BY_ROLE: Record<AdminRole, readonly Section[]> = {
  super_admin: SECTIONS,
  support: ['dashboard', 'orgs', 'health', 'users', 'ops', 'web', 'tickets'],
  finance: ['dashboard', 'orgs', 'health', 'web', 'acquisition'],
  analyst: ['dashboard', 'web', 'seo', 'acquisition', 'crm', 'cms', 'modules'],
  // the CRM (0055, D-101): contacts, segments and campaigns, and the site they drive traffic to
  // account health (0060, D-105): which trials to call
  // the site's pages (0114, X-094): the CMS is marketing's, as the campaigns that point at it are
  marketing: ['dashboard', 'health', 'web', 'seo', 'acquisition', 'crm', 'cms'],
}

export const HREF: Record<Section, string> = {
  dashboard: '/admin',
  orgs: '/admin/orgs',
  health: '/admin/health',
  users: '/admin/users',
  ops: '/admin/ops',
  web: '/admin/web',
  seo: '/admin/seo',
  acquisition: '/admin/acquisition',
  crm: '/admin/crm',
  cms: '/admin/cms',
  modules: '/admin/modules',
  // the legal review (D-130): a super-admin's alone, since a legal sign-off is the owner's
  legal: '/admin/legal',
  // the survey languages' texts (D-133): a super-admin's, as the approvals are
  translations: '/admin/translations',
  tickets: '/admin/tickets',
  audit: '/admin/audit',
  admins: '/admin/admins',
}

export const sectionsFor = (role: AdminRole, built: readonly Section[]) => BY_ROLE[role].filter((s) => built.includes(s))
export const canSee = (role: AdminRole, s: Section) => BY_ROLE[role].includes(s)
