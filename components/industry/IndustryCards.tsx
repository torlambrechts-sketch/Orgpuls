import type { Route } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { hasPublicPage, INDUSTRIES, isNewIndustry, pageIn } from '@/content/industries'

/** `topics` and `extra` are the Bransjer hub's module cards (D-190); the start page's cards read `d` */
const Card = z.object({
  slug: z.string(),
  k: z.string(),
  t: z.string(),
  d: z.string(),
  cta: z.string(),
  topics: z.array(z.string()).default([]),
  extra: z.string().optional(),
})
export type IndustryCard = z.infer<typeof Card> & { isNew: boolean }

/**
 * The industry cards (innstillinger-og-forside.md § 5.1, D-141): in the registry's order, only
 * where the address shows a page, each with «Ny» for 90 days after its page is launched
 * (`card.newUntil`). The words are `site.bransjer.cards`, by slug.
 */
export async function industryCards(): Promise<IndustryCard[]> {
  const t = await getTranslations('site.bransjer')
  const lang = (await getLocale()) === 'en' ? 'en' : 'no'
  const words = z.array(Card).parse(t.raw('cards'))
  const today = new Date().toISOString().slice(0, 10)
  return INDUSTRIES.flatMap((i) => {
    const w = words.find((c) => c.slug === i.slug)
    if (!w || !hasPublicPage(i, lang)) return []
    return [{ ...w, isNew: isNewIndustry(pageIn(i, lang) ?? null, today) }]
  })
}

/** «Ny», on the accent (bg-ac), as a chip is drawn elsewhere on the site */
export function NewChip({ label }: { label: string }) {
  return <span className="flex-none rounded-pill bg-ac px-[9px] py-[2px] text-[11px] font-bold text-ink">{label}</span>
}

/** The start page's cards (D-125), also on /bruksomrader behind `home_industries_block` */
export async function IndustryCards() {
  const [cards, t] = await Promise.all([industryCards(), getTranslations('site.home.industries')])
  return (
    <div className="mt-[12px] grid gap-[13px] [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
      {cards.map((x, i) => (
        <Link
          key={x.slug}
          href={`/${x.slug}` as Route}
          className={`flex min-h-[180px] flex-col gap-[10px] rounded-card border border-line p-[24px] text-ink hover:text-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ink ${i % 2 ? 'bg-mint' : 'bg-sbg'}`}
        >
          <span className="flex items-start justify-between gap-[10px]">
            <span className="text-[11px] uppercase tracking-[0.12em] text-mut">{x.k}</span>
            {x.isNew ? <NewChip label={t('new')} /> : null}
          </span>
          <span className="font-display text-[24px] font-semibold leading-[1.15] [text-wrap:balance]">{x.t}</span>
          <span className="text-[13.5px] leading-[1.55] text-body [text-wrap:pretty]">{x.d}</span>
          <span className="mt-auto text-[13.5px] font-bold text-link">{x.cta} →</span>
        </Link>
      ))}
    </div>
  )
}
