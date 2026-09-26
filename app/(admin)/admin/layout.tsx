import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { AdminNav } from '@/components/admin/AdminNav'
import { Badge } from '@/components/admin/ui'
import { sectionsFor, HREF, type Section } from '@/lib/admin/access'
import { adminSignOut } from '@/lib/admin/actions'
import { whoami } from '@/lib/admin/api'

/**
 * The platform admin's shell (D-90). Every page under it is behind three checks, here and
 * again in the database on every call: signed in, an active admin role, and a second factor.
 * The admin is in English, by decision, and never indexed.
 */
export const metadata: Metadata = { title: 'Orgpuls Admin', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/** The sections built so far; the rest of the specification's list is added as it is built. */
const BUILT: readonly Section[] = ['dashboard', 'orgs', 'health', 'users', 'ops', 'web', 'seo', 'acquisition', 'crm', 'tickets', 'audit', 'admins']

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const who = await whoami()
  if (!who) redirect('/admin/login')
  if (!who.is_admin || !who.role) redirect('/admin/mfa')
  if (who.mfa_enforced && who.aal !== 'aal2') redirect('/admin/mfa')

  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const items = sectionsFor(who.role, BUILT).map((s) => ({ href: HREF[s], label: t(`nav.${s}`) }))

  return (
    <div lang="en" className="min-h-screen bg-bg text-ink md:grid md:[grid-template-columns:220px_minmax(0,1fr)]">
      <aside className="border-line bg-sf px-[14px] py-[18px] max-md:border-b md:min-h-screen md:border-r">
        <span className="block px-[12px] font-display text-[19px] font-semibold">{t('title')}</span>
        <span className="mt-[6px] flex flex-wrap items-center gap-[6px] px-[12px]">
          <Badge tone="ink">{t(`role.${who.role}`)}</Badge>
        </span>
        <span className="mt-[4px] block truncate px-[12px] text-[11.5px] text-mut">{who.email}</span>
        <div className="mt-[16px]">
          <AdminNav items={items} label={t('nav.navLabel')} />
        </div>
        <form action={adminSignOut} className="mt-[16px] px-[12px]">
          <button
            type="submit"
            className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-link underline"
          >
            {t('nav.signOut')}
          </button>
        </form>
      </aside>
      <main className="min-w-0 px-[16px] py-[24px] md:px-[28px]">
        <div className="mx-auto max-w-[1180px]">
          {children}
          <p className="mb-0 mt-[28px] text-[11.5px] text-mut">{t('common.privacy')}</p>
        </div>
      </main>
    </div>
  )
}
