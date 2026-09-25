import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { OrgStart } from './OrgStart'

/**
 * The pieces every page of the public site's design shares (D-88), transcribed from
 * design-reference/orgpuls/nettside. Each class list is the design's inline style, value for
 * value; the tokens are the ones tailwind.config.ts already holds.
 */

/** The small uppercase label over a heading. */
export function Eyebrow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`block text-[11px] uppercase tracking-[0.12em] text-mut ${className}`}>{children}</span>
}

/** A tick in a soft-mint square, before a line of a list. */
export function Tick({ size = 18 }: { size?: 16 | 18 }) {
  return (
    <span
      aria-hidden="true"
      className={`flex flex-none items-center justify-center bg-mint font-bold text-greendeep ${
        size === 16
          ? 'mt-[2px] h-[16px] w-[16px] rounded-[5px] text-[9px]'
          : 'mt-[2px] h-[18px] w-[18px] rounded-[6px] text-[10px]'
      }`}
    >
      ✓
    </span>
  )
}

/** "Orgpuls › Plattform", the pill, and nothing else: the pages differ from there down. */
export async function Crumbs({ page }: { page: string }) {
  const t = await getTranslations('site.chrome')
  return (
    <>
      <nav aria-label={t('crumbs')} className="flex items-center gap-[8px] text-[12.5px] text-mut">
        <Link href="/" className="text-mut hover:text-mut">
          Orgpuls
        </Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page" className="font-semibold text-ink">
          {page}
        </span>
      </nav>
      <span className="mt-[18px] inline-block rounded-pill bg-sbg px-[13px] py-[6px] text-[12px] font-bold">{page}</span>
    </>
  )
}

/** The two buttons under a subpage's lead: the trial, and the next page to read. */
export async function HeroButtons({ next }: { next: { href: string; label: string } }) {
  const t = await getTranslations('site.chrome')
  return (
    <div className="mt-[24px] flex flex-wrap gap-[10px]">
      <a
        href="#kom-i-gang"
        className="flex h-[48px] items-center rounded-cta border border-ink bg-ac px-[22px] text-[15px] font-bold text-ink hover:text-ink"
      >
        {t('trial')}
      </a>
      <Link
        href={next.href as Route}
        className="flex h-[48px] items-center rounded-cta border border-ink px-[20px] text-[15px] font-semibold text-ink hover:text-ink"
      >
        {next.label}
      </Link>
    </div>
  )
}

/** "Prøv det på deres egen virksomhet": the band every page but Om oss ends with. */
export async function StartBand() {
  const t = await getTranslations('site.chrome.start')
  return (
    <section id="kom-i-gang" className="mx-auto mt-[64px] max-w-[1120px] scroll-mt-[118px] px-[26px] pb-[72px]">
      <div className="grid items-center gap-[26px] rounded-[24px] border border-line bg-sf px-[40px] py-[36px] [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))] max-sm:px-[22px] max-sm:[grid-template-columns:minmax(0,1fr)]">
        <div>
          <h2 className="m-0 max-w-[22ch] font-display text-[32px] font-semibold leading-[1.14] [text-wrap:balance]">
            {t('title')}
          </h2>
          <p className="m-0 mt-[12px] max-w-[48ch] text-[15px] leading-[1.65] text-body [text-wrap:pretty]">{t('lead')}</p>
        </div>
        <OrgStart
          placeholder={t('placeholder')}
          submit={t('submit')}
          fetching={t.raw('fetching') as string}
          invalid={t('invalid')}
        />
      </div>
    </section>
  )
}

/** A section's label, heading and paragraph, as the subpages set them. */
export function SectionHead({
  k,
  t,
  d,
  h2Max = 'max-w-[22ch]',
  pMax = 'max-w-[50ch]',
  pLeading = 'leading-[1.65]',
}: {
  k: string
  t: string
  d?: string
  h2Max?: string
  pMax?: string
  pLeading?: string
}) {
  return (
    <>
      <Eyebrow>{k}</Eyebrow>
      <h2 className={`m-0 mt-[9px] font-display text-[32px] font-semibold leading-[1.14] [text-wrap:balance] ${h2Max}`}>{t}</h2>
      {d ? <p className={`m-0 mt-[12px] text-[15px] text-body [text-wrap:pretty] ${pLeading} ${pMax}`}>{d}</p> : null}
    </>
  )
}

/** The ticked list under a section's paragraph. */
export function Points({ items, className = 'mt-[18px]' }: { items: string[]; className?: string }) {
  return (
    <div className={`flex flex-col gap-[9px] ${className}`}>
      {items.map((p) => (
        <span key={p} className="flex gap-[10px] text-[14px] leading-[1.5] [text-wrap:pretty]">
          <Tick />
          {p}
        </span>
      ))}
    </div>
  )
}
