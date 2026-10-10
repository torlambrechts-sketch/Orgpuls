import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { LogoMark } from '@/components/shell/Logo'
import { BRANDS } from '@/lib/brand'
import { holdingOf } from '@/lib/hosts'

/**
 * A brand's holding page before its site opens (D-269): what empvibe.com shows, at every address
 * (lib/hosts.ts HOLDING_HOSTS, hostGate). The brand's name in its own language, what it is and that
 * it opens here, and nothing else: no Orgpuls name, which means nothing in English, no sign-up,
 * since the United Kingdom's terms, agreement and prices are not in place (UK-F), and no indexing.
 *
 * The design has no such page. It is drawn with the site's own parts: the shared mark (X-111 keeps
 * Empvibe on Orgpuls's design), the wordmark as the header draws it, the display face for the heading.
 * On any other host the address does not exist.
 */
async function holding() {
  const brand = holdingOf((await headers()).get('host'))
  if (!brand) return null
  return { name: BRANDS[brand.brand].name, t: await getTranslations({ locale: brand.lang, namespace: 'holding' }) }
}

export async function generateMetadata(): Promise<Metadata> {
  const h = await holding()
  if (!h) return {}
  return { title: h.name, description: h.t('lead'), robots: { index: false, follow: false } }
}

export default async function HoldingPage() {
  const h = await holding()
  if (!h) notFound()
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-[16px] py-[48px] text-ink">
      <div className="w-full max-w-[520px]">
        <div className="flex items-center gap-[9px]">
          <LogoMark size={30} />
          <span className="font-display text-[19px] font-semibold tracking-[-0.01em]">{h.name}</span>
        </div>
        <h1 className="m-0 mt-[28px] font-display text-[34px] font-medium leading-[1.15] [text-wrap:balance]">{h.t('title', { brand: h.name })}</h1>
        <p className="m-0 mt-[14px] text-[15px] leading-[1.6] text-body [text-wrap:pretty]">{h.t('lead')}</p>
        <p className="m-0 mt-[10px] text-[13.5px] leading-[1.6] text-mut [text-wrap:pretty]">{h.t('note')}</p>
      </div>
    </main>
  )
}
