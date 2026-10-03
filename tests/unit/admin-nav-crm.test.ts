import { describe, expect, it } from 'vitest'
import { currentItem, groupOf, navFor } from '@/lib/admin/nav'

/** CRM split into CRM (sales) and Marketing, contacts/lists/segments one entry (X-097). */
const BUILT = [
  '/admin', '/admin/orgs', '/admin/users', '/admin/tickets',
  '/admin/crm', '/admin/crm/pipeline', '/admin/crm/prospects', '/admin/crm/tasks', '/admin/crm/inbox', '/admin/crm/scoring', '/admin/crm/stages',
  '/admin/crm/campaigns', '/admin/crm/journeys', '/admin/crm/contacts', '/admin/crm/templates',
]
const all = navFor('super_admin', BUILT)

describe('the CRM and Marketing areas', () => {
  it('keeps sales in CRM and mail in Marketing, and support with the customers', () => {
    const keys = (g: string) => all.find((x) => x.key === g)?.items.map((i) => i.key)
    expect(keys('crm')).toEqual(['crmPipeline', 'crmProspects', 'crmTasks', 'crmInbox', 'crmScoring', 'crmStages'])
    expect(keys('marketing')).toEqual(['crmOverview', 'crmCampaigns', 'crmJourneys', 'crmContacts', 'crmTemplates'])
    expect(keys('customers')).toContain('tickets')
  })

  it('lights Contacts & lists on its lists and segments tabs, in Marketing', () => {
    for (const path of ['/admin/crm/contacts', '/admin/crm/lists', '/admin/crm/segments', '/admin/crm/lists/abc']) {
      expect(currentItem(all, path)?.key).toBe('crmContacts')
      expect(groupOf(all, path)).toBe('marketing')
    }
  })

  it('keeps the restore list behind CRM\'s More (0195)', () => {
    const nav = navFor('super_admin', [...BUILT, '/admin/crm/restore'])
    const item = nav.find((x) => x.key === 'crm')?.items.find((i) => i.key === 'crmRestore')
    expect(item?.more).toBe(true)
    expect(groupOf(nav, '/admin/crm/restore')).toBe('crm')
  })

  it('opens Marketing on its overview and a company record in CRM', () => {
    expect(currentItem(all, '/admin/crm')?.key).toBe('crmOverview')
    expect(groupOf(all, '/admin/crm/prospects/123')).toBe('crm')
    expect(groupOf(all, '/admin/crm/campaigns/9')).toBe('marketing')
  })
})
