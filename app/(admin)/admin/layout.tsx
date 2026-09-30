import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { AdminShell } from '@/components/admin/AdminShell'
import { HREF, type Section } from '@/lib/admin/access'
import { adminSignOut } from '@/lib/admin/actions'
import { autoApprove, isError, whoami } from '@/lib/admin/api'
import { GROWTH_PAGES } from '@/lib/admin/growth'
import { navFor } from '@/lib/admin/nav'
import Link from 'next/link'
import './sentral.css'

/**
 * The platform admin's shell (D-90; Sentral, X-095). Every page under it is behind three checks, here and
 * again in the database on every call: signed in, an active admin role, and a second factor.
 * The admin is in English, by decision, and never indexed.
 */
export const metadata: Metadata = { title: 'Sentral', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/** The sections built so far; the rest of the specification's list is added as it is built. */
const BUILT: readonly Section[] = ['dashboard', 'orgs', 'health', 'users', 'ops', 'web', 'seo', 'acquisition', 'crm', 'cms', 'modules', 'legal', 'translations', 'tickets', 'audit', 'admins']
/** the pages the menu may offer: every built section, the CRM's own pages and the CMS's redirects */
const PAGES = [
  ...BUILT.map((s) => HREF[s]),
  '/admin/crm/inbox',
  '/admin/crm/pipeline',
  '/admin/crm/prospects',
  '/admin/crm/contacts',
  '/admin/crm/lists',
  '/admin/crm/segments',
  '/admin/crm/campaigns',
  '/admin/crm/journeys',
  '/admin/crm/tasks',
  '/admin/crm/scoring',
  '/admin/crm/templates',
  '/admin/crm/stages',
  '/admin/cms/redirects',
  '/admin/cms/templates',
  '/admin/cms/landing',
  '/admin/cms/media',
  '/admin/billing',
  '/admin/settings',
  '/admin/web/pages',
  '/admin/web/goals',
  '/admin/web/visits',
  // Sentral › Growth and design revision 3's other new pages (D-181): each page is built, most
  // still in their phase's nothing-yet state
  ...GROWTH_PAGES,
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const who = await whoami()
  if (!who) redirect('/admin/login')
  if (!who.is_admin || !who.role) redirect('/admin/mfa')
  if (who.mfa_enforced && who.aal !== 'aal2') redirect('/admin/mfa')

  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  // the auto-approve switch (0101): said on every admin page while it is on
  const auto = who.role === 'super_admin' || who.role === 'support' ? await autoApprove() : null
  const autoOn = !!auto && !isError(auto) && auto.on
  const groups = navFor(who.role, PAGES)

  return (
    <AdminShell
      groups={groups}
      role={t(`role.${who.role}`)}
      email={who.email ?? ''}
      signOut={adminSignOut}
      labels={{
        title: t('title'),
        nav: t('nav.navLabel'),
        sub: t('nav.subLabel'),
        groups: { overview: t('nav.area.overview'), customers: t('nav.area.customers'), crm: t('nav.area.crm'), marketing: t('nav.area.marketing'), content: t('nav.area.content'), analytics: t('nav.area.analytics'), growth: t('nav.area.growth'), admin: t('nav.area.admin') },
        items: Object.fromEntries(groups.flatMap((g) => g.items).map((i) => [i.key, t(`nav.item.${i.key}`)])),
        site: t('nav.site'),
        siteName: t('nav.siteName'),
        siteDomain: t('nav.siteDomain'),
        account: t('nav.account'),
        more: t('nav.more'),
        openMenu: t('nav.openMenu'),
        closeMenu: t('nav.closeMenu'),
        signOut: t('nav.signOut'),
      }}
    >
      <>
        {autoOn ? (
          <p role="status" className="mb-[18px] mt-0 rounded-panel border border-line bg-band px-[16px] py-[10px] text-[13px] font-semibold text-cautiondeep">
            {t('autoBanner')}{' '}
            <Link href="/admin/translations" className="text-cautiondeep underline">
              {t('autoBannerLink')}
            </Link>
          </p>
        ) : null}
        {children}
        <p className="mb-0 mt-[28px] text-[11.5px] text-mut">{t('common.privacy')}</p>
      </>
    </AdminShell>
  )
}
