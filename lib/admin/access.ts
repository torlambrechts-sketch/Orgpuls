import type { AdminRole } from './api'

/**
 * Which sections each admin role is shown (D-90), as the specification's access model has
 * it. The database decides what each call returns; this only keeps a role from being offered
 * a page that would answer "not allowed".
 */
export const SECTIONS = ['dashboard', 'orgs', 'health', 'users', 'ops', 'web', 'seo', 'acquisition', 'crm', 'cms', 'modules', 'legal', 'translations', 'tickets', 'audit', 'admins', 'billing', 'settings', 'growth'] as const
export type Section = (typeof SECTIONS)[number]

const BY_ROLE: Record<AdminRole, readonly Section[]> = {
  super_admin: SECTIONS,
  support: ['dashboard', 'orgs', 'health', 'users', 'ops', 'web', 'tickets'],
  finance: ['dashboard', 'orgs', 'health', 'web', 'acquisition', 'billing'],
  // Growth (D-181): the board, plan, funnel, events, rules, experiments, risks and coverage, the
  // magnets and deliverability — for the roles that see the CRM, as the plan's access model has it
  analyst: ['dashboard', 'web', 'seo', 'acquisition', 'crm', 'cms', 'modules', 'growth'],
  // the CRM (0055, D-101): contacts, segments and campaigns, and the site they drive traffic to
  // account health (0060, D-105): which trials to call
  // the site's pages (0114, X-094): the CMS is marketing's, as the campaigns that point at it are
  marketing: ['dashboard', 'health', 'web', 'seo', 'acquisition', 'crm', 'cms', 'growth'],
  // the site's words (0125, 0126; D-170): pages, templates, landing pages, media, redirects, the
  // notice and SEO — no customer, no admin, no figure of the business
  editor: ['dashboard', 'cms', 'seo'],
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
  // Admin › Billing & plans and Site settings (X-095, D-170)
  billing: '/admin/billing',
  settings: '/admin/settings',
  // Sentral › Growth (D-181)
  growth: '/admin/growth',
}

export const sectionsFor = (role: AdminRole, built: readonly Section[]) => BY_ROLE[role].filter((s) => built.includes(s))
export const canSee = (role: AdminRole, s: Section) => BY_ROLE[role].includes(s)

/** Who may change the site's pages, media, redirects and notice — as app.cms_can_write() says (0126) */
export const CMS_WRITERS: readonly AdminRole[] = ['super_admin', 'marketing', 'editor']
export const cmsWriter = (role: AdminRole | null | undefined) => !!role && CMS_WRITERS.includes(role)
