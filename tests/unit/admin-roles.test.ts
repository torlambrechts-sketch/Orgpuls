import { describe, expect, it } from 'vitest'
import { canSee, CMS_WRITERS, cmsWriter, SECTIONS } from '@/lib/admin/access'
import { areaOf, csvCell } from '@/lib/admin/audit'

/** Admin (X-095 phase 10, D-170): the editor's reach, the audit log's areas and its CSV. */
describe('the editor role', () => {
  it('sees Content, SEO and the overview, and nothing about customers, admins or the business', () => {
    expect(SECTIONS.filter((s) => canSee('editor', s))).toEqual(['dashboard', 'seo', 'cms'])
  })

  it('may change the site as marketing and the owner may, as app.cms_can_write says', () => {
    expect(CMS_WRITERS).toEqual(['super_admin', 'marketing', 'editor'])
    expect(cmsWriter('editor')).toBe(true)
    expect(cmsWriter('analyst')).toBe(false)
    expect(cmsWriter(null)).toBe(false)
  })

  it('leaves billing to finance and the owner, and site settings to the owner', () => {
    expect((['super_admin', 'support', 'finance', 'analyst', 'marketing', 'editor'] as const).filter((r) => canSee(r, 'billing'))).toEqual(['super_admin', 'finance'])
    expect((['super_admin', 'support', 'finance', 'analyst', 'marketing', 'editor'] as const).filter((r) => canSee(r, 'settings'))).toEqual(['super_admin'])
  })
})

describe('the audit log', () => {
  it('puts each action in its area by prefix, and the unknown in Other', () => {
    expect(areaOf('cms.publish')).toBe('content')
    expect(areaOf('media.add')).toBe('content')
    expect(areaOf('site.indexing_off')).toBe('content')
    expect(areaOf('org.trial_extend')).toBe('customers')
    expect(areaOf('crm.campaign_send')).toBe('crm')
    expect(areaOf('admins.set')).toBe('admin')
    expect(areaOf('kpis.view')).toBe('reads')
    expect(areaOf('something.new')).toBe('other')
  })

  it('never lets a cell start a spreadsheet formula, and quotes what must be quoted', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('+47 1234')).toBe(`"'+47 1234"`)
    expect(csvCell('-1')).toBe(`"'-1"`)
    expect(csvCell('@sum')).toBe(`"'@sum"`)
    expect(csvCell('a, b')).toBe('"a, b"')
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell(null)).toBe('')
    expect(csvCell(12)).toBe('12')
  })
})
