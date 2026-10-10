import type { Route } from 'next'
import Link from '@/components/site/SitePaths'
import { getTranslations } from 'next-intl/server'
import { templateBySlug } from '@/lib/marketing/templates'

/**
 * A free template where its reader is (D-243): at the foot of the article, informational page or industry
 * page it belongs to, a box with what the template is and a link to its page and form. A resource beside
 * the text, not an offer: it names the template and what is in it, nothing more.
 */
export async function TemplateTeaser({ slug, className = '' }: { slug: string; className?: string }) {
  const tpl = templateBySlug(slug)
  if (!tpl) return null
  const t = await getTranslations('seo.maler')
  return (
    <aside
      aria-label={t('teaser.kicker')}
      className={`flex flex-wrap items-center justify-between gap-x-[24px] gap-y-[14px] rounded-note border border-line bg-sbg px-[22px] py-[18px] ${className}`}
    >
      <div className="min-w-0 max-w-[60ch]">
        <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-mut">{t('teaser.kicker')}</span>
        <span className="mt-[4px] block font-display text-[19px] font-semibold leading-[1.25]">{t(`${tpl.key}.crumb`)}</span>
        <span className="mt-[4px] block text-[14px] leading-[1.55] text-body [text-wrap:pretty]">{t(`${tpl.key}.teaser`)}</span>
      </div>
      <Link
        href={`/maler/${tpl.slug}` as Route}
        className="inline-flex min-h-[46px] flex-none items-center gap-[8px] rounded-tile border border-ink bg-ac px-[18px] text-[14.5px] font-bold text-ink no-underline hover:text-ink hover:no-underline"
      >
        {t('teaser.cta')} <span aria-hidden="true">→</span>
      </Link>
    </aside>
  )
}
