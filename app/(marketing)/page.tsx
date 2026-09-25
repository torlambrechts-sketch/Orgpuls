import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { JsonLd } from '@/components/marketing/JsonLd'
import { Eyebrow, StartBand, Tick } from '@/components/site/parts'
import { pageMeta } from '@/lib/marketing/meta'
import { graph, organization, software, website } from '@/lib/marketing/schema'
import { zip } from '@/lib/site/zip'

/**
 * The start page (D-88): design-reference/orgpuls/nettside/Forside.dc.html.
 *
 * What it says is messages (`site.home`); what is here is the design's layout, and the
 * colours and links that belong to each card. The design's links point at its own files:
 * each role card goes to the part of the site written for that role, and "Møt teamet" to Om
 * oss. The three people in "Små team, korte veier" are roles drawn as Tuva's faces, as the
 * design draws them — nobody's name or photograph.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return pageMeta({ title: t('seo.home.title'), description: t('seo.home.description'), path: '/' })
}

const Stat = z.object({ v: z.string(), l: z.string() })
const Role = z.object({ i: z.string(), t: z.string(), s: z.string(), get: z.array(z.string()).length(3), cta: z.string() })
const Teaser = z.object({ k: z.string(), t: z.string(), d: z.string(), cta: z.string() })
const Member = z.object({ n: z.string(), r: z.string() })

/** Each role card's fill and where it goes, in the design's order. */
const ROLES = [
  { bg: 'bg-sf', href: '/bruksomrader#uten-hr' },
  { bg: 'bg-sbg', href: '/plattform' },
  { bg: 'bg-sf', href: '/plattform#roller' },
  { bg: 'bg-mint', href: '/bruksomrader#amu' },
] as const
const TEASERS = [
  { bg: 'bg-sf', href: '/plattform' },
  { bg: 'bg-sbg', href: '/bruksomrader' },
  { bg: 'bg-sf', href: '/hvorfor' },
] as const
const TEAM = [{ src: '/tuva/av1.png' }, { src: '/tuva/av5.png' }, { src: '/tuva/av7.png' }] as const

export default async function StartPage() {
  const t = await getTranslations('site.home')
  const stats = z.array(Stat).length(3).parse(t.raw('stats'))
  const roles = zip(ROLES, z.array(Role).parse(t.raw('roles')))
  const teasers = zip(TEASERS, z.array(Teaser).parse(t.raw('teasers')))
  const team = zip(TEAM, z.array(Member).parse(t.raw('about.team')))
  const seo = await getTranslations('seo.home')

  return (
    <div>
      <JsonLd data={graph(organization(), website(), software(seo('description')))} />

      <section id="topp" className="mx-auto max-w-[1120px] px-[26px] pt-[60px]">
        <div className="max-w-[780px]">
          <span className="inline-block rounded-pill bg-sbg px-[13px] py-[6px] text-[12px] font-bold">{t('pill')}</span>
          <h1 className="m-0 mt-[19px] font-display text-[56px] font-semibold leading-[1.04] [text-wrap:balance]">{t('h1')}</h1>
          <p className="m-0 mt-[17px] max-w-[54ch] text-[17.5px] leading-[1.65] text-body [text-wrap:pretty]">{t('lead')}</p>
          <div className="mt-[26px] flex flex-wrap gap-[10px]">
            <a
              href="#kom-i-gang"
              className="flex h-[50px] items-center rounded-tile border border-ink bg-ac px-[24px] text-[16px] font-bold text-ink hover:text-ink"
            >
              {(await getTranslations('site.chrome'))('trial')}
            </a>
            <Link
              href="/plattform"
              className="flex h-[50px] items-center rounded-tile border border-ink px-[22px] text-[16px] font-semibold text-ink hover:text-ink"
            >
              {t('how')}
            </Link>
          </div>
          <div className="mt-[26px] flex flex-wrap gap-[24px]">
            {stats.map((s) => (
              <span key={s.v}>
                <span className="block font-display text-[28px] font-semibold leading-none">{s.v}</span>
                <span className="mt-[4px] block text-[12.5px] text-mut">{s.l}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="mt-[44px]">
          <Eyebrow>{t('who')}</Eyebrow>
          <div className="mt-[12px] grid gap-[13px] [grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr))]">
            {roles.map((r) => (
              <Link
                key={r.i}
                href={r.href as Route}
                className={`flex min-h-[290px] flex-col gap-[12px] rounded-card border border-line px-[20px] py-[22px] text-ink hover:text-ink ${r.bg}`}
              >
                <span className="flex h-[44px] w-[44px] items-center justify-center rounded-tile bg-ink font-display text-[19px] font-semibold text-bg">
                  {r.i}
                </span>
                <span>
                  <span className="block text-[18px] font-bold">{r.t}</span>
                  <span className="mt-[3px] block text-[13px] text-mut">{r.s}</span>
                </span>
                <span className="flex flex-1 flex-col gap-[7px]">
                  {r.get.map((g) => (
                    <span key={g} className="flex gap-[8px] text-[13.5px] leading-[1.45] [text-wrap:pretty]">
                      <Tick size={16} />
                      {g}
                    </span>
                  ))}
                </span>
                <span className="flex h-[42px] items-center justify-center rounded-btn border border-ink bg-sf text-[13.5px] font-bold">
                  {r.cta}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] px-[26px] pt-[80px]">
        <Eyebrow>{t('explore')}</Eyebrow>
        <div className="mt-[12px] grid gap-[13px] [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
          {teasers.map((x) => (
            <Link
              key={x.k}
              href={x.href as Route}
              className={`flex min-h-[220px] flex-col gap-[10px] rounded-card border border-line p-[24px] text-ink hover:text-ink ${x.bg}`}
            >
              <span className="text-[11px] uppercase tracking-[0.12em] text-mut">{x.k}</span>
              <span className="font-display text-[24px] font-semibold leading-[1.15] [text-wrap:balance]">{x.t}</span>
              <span className="text-[13.5px] leading-[1.55] text-body [text-wrap:pretty]">{x.d}</span>
              <span className="mt-auto text-[13.5px] font-bold text-link">{x.cta} →</span>
            </Link>
          ))}
        </div>
      </section>

      <section
        id="om-oss"
        className="mx-auto grid max-w-[1120px] items-center gap-[36px] px-[26px] pt-[80px] [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]"
      >
        <div>
          <Eyebrow>{t('about.k')}</Eyebrow>
          <h2 className="m-0 mt-[9px] font-display text-[36px] font-semibold leading-[1.12] [text-wrap:balance]">
            {t('about.t')}
          </h2>
          <p className="m-0 mt-[13px] max-w-[50ch] text-[15px] leading-[1.7] text-body [text-wrap:pretty]">{t('about.d')}</p>
        </div>
        <div className="grid grid-cols-3 gap-[12px]">
          {team.map((m) => (
            <div key={m.n} className="rounded-note border border-line bg-sf p-[16px] text-center">
              {/* the design's own 64px faces, scaled by the browser as the design scales them */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.src}
                alt=""
                width={64}
                height={64}
                className="inline h-[64px] w-[64px] rounded-[18px] bg-bg object-cover align-baseline"
              />
              <span className="mt-[10px] block text-[14px] font-bold">{m.n}</span>
              <span className="mt-[2px] block text-[12px] text-mut">{m.r}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="pris" className="mx-auto mt-[80px] max-w-[1120px] scroll-mt-[90px] px-[26px]">
        <div className="flex flex-wrap items-center justify-between gap-[26px] rounded-[22px] bg-ink px-[36px] py-[30px] text-bg max-sm:px-[24px]">
          <div>
            <span className="block text-[11px] uppercase tracking-[0.12em] opacity-[.65]">{t('price.k')}</span>
            <span className="mt-[6px] block font-display text-[28px] font-semibold [text-wrap:balance]">{t('price.t')}</span>
            <span className="mt-[6px] block text-[14px] opacity-75">{t('price.d')}</span>
          </div>
          <div className="flex flex-none flex-wrap gap-[9px]">
            <Link
              href="/priser"
              className="flex h-[50px] items-center rounded-tile border border-[rgba(252,246,233,.35)] px-[22px] text-[15px] font-semibold text-bg hover:text-bg"
            >
              {t('price.see')}
            </Link>
            <a
              href="#kom-i-gang"
              className="flex h-[50px] items-center rounded-tile bg-ac px-[24px] text-[16px] font-bold text-ink hover:text-ink"
            >
              {t('price.start')}
            </a>
          </div>
        </div>
      </section>

      <StartBand />
    </div>
  )
}
