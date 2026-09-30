import { describe, expect, it } from 'vitest'
import { canSee, HREF } from '@/lib/admin/access'
import { ROLES } from '@/lib/admin/api'
import { DOT_CLASS, DOT_TONES, dotTone } from '@/lib/admin/dots'
import { GROWTH_PAGES, GROWTH_VIEWS } from '@/lib/admin/growth'
import { currentItem, groupOf, navFor } from '@/lib/admin/nav'

/** Sentral › Growth and design revision 3's other new pages in the menu (D-181). */
const OLD = [
  '/admin', '/admin/orgs', '/admin/tickets', '/admin/web', '/admin/admins', '/admin/billing', '/admin/settings', '/admin/audit',
  '/admin/crm', '/admin/crm/pipeline', '/admin/crm/prospects', '/admin/crm/tasks', '/admin/crm/inbox', '/admin/crm/scoring',
  '/admin/crm/campaigns', '/admin/crm/journeys', '/admin/crm/contacts', '/admin/crm/templates',
  '/admin/cms', '/admin/cms/templates', '/admin/cms/landing', '/admin/cms/media',
]
const all = navFor('super_admin', [...OLD, ...GROWTH_PAGES])
const keys = (g: string) => all.find((x) => x.key === g)?.items.map((i) => i.key)

describe('the Growth area', () => {
  it('sits between Analytics and Admin in the top bar', () => {
    const areas = all.map((g) => g.key)
    expect(areas.indexOf('growth')).toBe(areas.indexOf('analytics') + 1)
    expect(areas.indexOf('admin')).toBe(areas.indexOf('growth') + 1)
  })

  it('holds the design’s eight pages in the design’s order', () => {
    expect(keys('growth')).toEqual([
      'growthBoard', 'growthPlan', 'growthFunnel', 'growthEvents', 'growthRules', 'growthExperiments', 'growthRisks', 'growthCoverage',
    ])
    expect(all.find((g) => g.key === 'growth')?.items.every((i) => !i.more)).toBe(true)
  })

  it('puts Consent beside Contacts in Marketing, triggers and partners in CRM, magnets in Content, deliverability in Admin', () => {
    const m = keys('marketing')!
    expect(m.indexOf('crmConsent')).toBe(m.indexOf('crmContacts') + 1)
    expect(keys('crm')).toEqual(['crmPipeline', 'crmProspects', 'crmTasks', 'crmInbox', 'crmScoring', 'crmTriggers', 'crmPartners'])
    const c = keys('content')!
    expect(c.indexOf('cmsMagnets')).toBe(c.indexOf('cmsLanding') + 1)
    const a = keys('admin')!
    expect(a.indexOf('deliverability')).toBe(a.indexOf('settings') + 1)
    expect(a.indexOf('audit')).toBe(a.indexOf('deliverability') + 1)
  })

  it('lights the board only on its own address, and every Growth page in Growth', () => {
    expect(currentItem(all, '/admin/growth')?.key).toBe('growthBoard')
    expect(currentItem(all, '/admin/growth/plan')?.key).toBe('growthPlan')
    for (const [key, v] of Object.entries(GROWTH_VIEWS)) {
      expect(currentItem(all, v.href)?.key).toBe(key)
    }
    expect(groupOf(all, '/admin/growth/coverage')).toBe('growth')
    expect(groupOf(all, '/admin/crm/consent')).toBe('marketing')
    expect(groupOf(all, '/admin/crm/triggers')).toBe('crm')
    expect(groupOf(all, '/admin/cms/magnets')).toBe('content')
    expect(groupOf(all, '/admin/deliverability')).toBe('admin')
  })

  it('offers a page only once it is built', () => {
    const before = navFor('super_admin', OLD)
    expect(before.map((g) => g.key)).not.toContain('growth')
    expect(before.flatMap((g) => g.items).map((i) => i.key)).not.toContain('crmConsent')
    const partly = navFor('super_admin', [...OLD, '/admin/growth'])
    expect(partly.find((g) => g.key === 'growth')?.items.map((i) => i.key)).toEqual(['growthBoard'])
  })
})

describe('the growth section', () => {
  it('is shown to the roles that see the CRM, and to no other', () => {
    const crm = ROLES.filter((r) => canSee(r, 'crm'))
    expect(ROLES.filter((r) => canSee(r, 'growth'))).toEqual(crm)
    expect(crm).toEqual(['super_admin', 'analyst', 'marketing'])
    expect(HREF.growth).toBe('/admin/growth')
  })

  it('keeps Growth out of the menus of support, finance and editors', () => {
    for (const role of ['support', 'finance', 'editor'] as const) {
      const menu = navFor(role, [...OLD, ...GROWTH_PAGES]).flatMap((g) => g.items.map((i) => i.href))
      for (const href of GROWTH_PAGES) expect(menu).not.toContain(href)
    }
  })

  it('agrees with the menu on each new page’s section', () => {
    for (const role of ROLES) {
      const menu = navFor(role, GROWTH_PAGES).flatMap((g) => g.items.map((i) => i.href))
      for (const v of Object.values(GROWTH_VIEWS)) expect(menu.includes(v.href)).toBe(canSee(role, v.section))
    }
  })
})

describe('the design’s dot colours', () => {
  it('maps every tone to a token class', () => {
    for (const tone of DOT_TONES) expect(DOT_CLASS[tone]).toMatch(/^bg-[a-z0-9]+$/)
  })

  it('colours as the design’s maps do, yellow for a status it does not name', () => {
    expect(dotTone('board', 'live')).toBe('teal')
    expect(dotTone('board', 'building')).toBe('yellow')
    expect(dotTone('board', 'planned')).toBe('line')
    expect(dotTone('board', 'deferred')).toBe('mut')
    expect(dotTone('shared', 'past_due')).toBe('peach')
    expect(dotTone('shared', 'churned')).toBe('mut')
    expect(dotTone('consent', 'notice_given')).toBe('green')
    expect(dotTone('stream', 'internal')).toBe('green')
    expect(dotTone('stream', 'service_internal')).toBe('teal')
    expect(dotTone('shared', 'something_new')).toBe('yellow')
  })
})
