import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'
import { getFormatter, getTranslations } from 'next-intl/server'
import { JsonLd } from '@/components/marketing/JsonLd'
import { archive } from '@/lib/crm/read'
import { pageMeta } from '@/lib/marketing/meta'
import { breadcrumbs, graph } from '@/lib/marketing/schema'
import { absolute } from '@/lib/marketing/site'

/**
 * The newsletter's web archive (D-103): every issue published to the web once it went out,
 * newest first, each with its own page. Indexed, in the sitemap, with a signup at the foot.
 */
export const revalidate = 600

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('archive')
  return pageMeta({ title: `${t('title')} · Orgpuls`, description: t('description'), path: '/nyhetsbrev/arkiv' })
}

export default async function ArchivePage() {
  const t = await getTranslations('archive')
  const format = await getFormatter()
  const rows = await archive()

  return (
    <div className="animate-entry mx-auto max-w-[760px] px-[26px] pb-[70px] pt-[44px]">
      <JsonLd
        data={graph(
          { '@type': 'CollectionPage', name: t('title'), description: t('description'), url: absolute('/nyhetsbrev/arkiv') },
          breadcrumbs([
            { name: 'Orgpuls', path: '/' },
            { name: t('title'), path: '/nyhetsbrev/arkiv' },
          ]),
        )}
      />
      <span className="inline-block rounded-pill bg-sbg px-[12px] py-[5px] text-[11.5px] font-bold">{t('badge')}</span>
      <h1 className="mt-[13px] font-display text-[clamp(30px,4vw,40px)] font-semibold leading-[1.1]">{t('title')}</h1>
      <p className="mt-[10px] max-w-[58ch] text-[16px] leading-[1.65] text-body [text-wrap:pretty]">{t('lead')}</p>

      {rows.length ? (
        <ol className="mt-[28px] flex list-none flex-col gap-[12px] p-0">
          {rows.map((r) => (
            <li key={r.slug} className="rounded-card border border-line bg-sf px-[22px] py-[18px]">
              <span className="block text-[12.5px] text-mut">
                {t('sent', { date: format.dateTime(new Date(r.published_at), { dateStyle: 'long', timeZone: 'Europe/Oslo' }) })}
              </span>
              <h2 className="m-0 mt-[4px] text-[19px] font-bold leading-[1.3]">
                <Link href={`/nyhetsbrev/arkiv/${r.slug}` as Route} className="text-ink no-underline hover:underline">
                  {r.title}
                </Link>
              </h2>
              {r.description || r.preheader ? <p className="mb-0 mt-[6px] text-[14.5px] leading-[1.6] text-body">{r.description ?? r.preheader}</p> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-[28px] text-[15px] text-mut">{t('empty')}</p>
      )}

      <div className="mt-[32px] rounded-card border-[1.5px] border-ink bg-sbg px-[24px] py-[22px]">
        <p className="m-0 text-[17px] font-bold">{t('subscribeTitle')}</p>
        <Link
          href={'/nyhetsbrev' as Route}
          className="mt-[12px] inline-flex h-[46px] items-center rounded-cta border border-ink bg-ac px-[20px] text-[15px] font-bold text-ink no-underline hover:text-ink hover:no-underline"
        >
          {t('subscribe')}
        </Link>
      </div>
    </div>
  )
}
