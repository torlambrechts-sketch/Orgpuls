import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { AdminShell } from '@/components/admin/AdminShell'
import { HREF, type Section } from '@/lib/admin/access'
import { adminSignOut } from '@/lib/admin/actions'
import { autoApprove, isError, whoami } from '@/lib/admin/api'
import { navFor, RAIL_COOKIE } from '@/lib/admin/nav'
import Link from 'next/link'

/**
 * The platform admin's shell (D-90, X-091). Every page under it is behind three checks, here and
 * again in the database on every call: signed in, an active admin role, and a second factor.
 * The admin is in English, by decision, and never indexed.
 */
export const metadata: Metadata = { title: 'Orgpuls Admin', robots: { index: false, follow: false } }
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
  '/admin/crm/templates',
  '/admin/crm/stages',
  '/admin/cms/redirects',
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
  const collapsed = (await cookies()).get(RAIL_COOKIE)?.value === 'closed'

  return (
    <AdminShell
      groups={groups}
      collapsed={collapsed}
      role={t(`role.${who.role}`)}
      email={who.email ?? ''}
      signOut={adminSignOut}
      labels={{
        title: t('title'),
        nav: t('nav.navLabel'),
        groups: { overview: t('nav.group.overview'), customers: t('nav.group.customers'), crm: t('nav.group.crm'), content: t('nav.group.content'), platform: t('nav.group.platform') },
        items: Object.fromEntries(groups.flatMap((g) => g.items).map((i) => [i.key, t(`nav.item.${i.key}`)])),
        collapse: t('nav.collapse'),
        expand: t('nav.expand'),
        openMenu: t('nav.openMenu'),
        closeMenu: t('nav.closeMenu'),
        signOut: t('nav.signOut'),
      }}
    >
      <div className="mx-auto max-w-[1180px]">
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
      </div>
    </AdminShell>
  )
}
