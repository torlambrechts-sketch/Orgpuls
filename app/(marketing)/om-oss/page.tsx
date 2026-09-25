import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { JsonLd } from '@/components/marketing/JsonLd'
import { ContactBlock } from '@/components/site/ContactBlock'
import { SectionNav } from '@/components/site/SectionNav'
import { Crumbs, Eyebrow, SectionHead } from '@/components/site/parts'
import { pageMeta } from '@/lib/marketing/meta'
import { breadcrumbs, graph, organization } from '@/lib/marketing/schema'
import { CONTACT_MAIL } from '@/lib/marketing/site'
import { zip } from '@/lib/site/zip'

/**
 * Om oss (D-88): design-reference/orgpuls/nettside/Om oss.dc.html.
 *
 * Two places differ from the drawing, both because the drawing holds a place for something
 * that does not exist yet. The team cards have a photo slot and "Navn": until there are
 * names and photographs to show, each card shows its role and the illustrated face the start
 * page gives the same role. The contact form files a ticket in the admin's queue (ContactBlock,
 * D-92).
 */
export const dynamic = 'force-static'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return pageMeta({ title: t('seo.pages.omOss.title'), description: t('seo.pages.omOss.description'), path: '/om-oss' })
}

const SECTIONS = ['oppdrag', 'prinsipper', 'lofter', 'team', 'grunnlag', 'kontakt'] as const
const FACES = [
  { face: '/tuva/av1.png' },
  { face: '/tuva/av5.png' },
  { face: '/tuva/av7.png' },
  { face: '/tuva/av4.png' },
] as const
const BASIS = [
  { href: '/hvorfor#forskning' },
  { href: '/hvorfor#loven' },
  { href: '/plattform#resultater' },
  { href: '/hvorfor#anonymitet' },
] as const

const Strs = z.array(z.string())
const Fact = z.object({ v: z.string(), l: z.string() })
const Step = z.object({ t: z.string(), d: z.string() })
const Principle = z.object({ t: z.string(), d: z.string(), x: z.string() })
const Member = z.object({ n: z.string(), r: z.string(), d: z.string() })
const Basis = z.object({ k: z.string(), t: z.string(), d: z.string(), cta: z.string() })

export default async function OmOssPage() {
  const t = await getTranslations('site.omOss')
  const chrome = await getTranslations('site.chrome')

  const facts = z.array(Fact).length(3).parse(t.raw('facts'))
  const loop = z.array(Step).parse(t.raw('mission.loop'))
  const principles = z.array(Principle).parse(t.raw('principles.items'))
  const team = zip(FACES, z.array(Member).parse(t.raw('team.members')))
  const basis = zip(BASIS, z.array(Basis).parse(t.raw('basis.items')))

  return (
    <div>
      <JsonLd
        data={graph(
          organization(),
          breadcrumbs([
            { name: 'Orgpuls', path: '/' },
            { name: t('crumb'), path: '/om-oss' },
          ]),
        )}
      />
      <SectionNav label={chrome('sections')} items={SECTIONS.map((id) => ({ id, label: t(`sections.${id}`) }))} />

      <section className="mx-auto max-w-[1120px] px-[26px] pt-[60px]">
        <Crumbs page={t('crumb')} />
        <div className="grid items-end gap-[36px] [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
          <div>
            <h1 className="m-0 mt-[16px] max-w-[18ch] font-display text-[50px] font-semibold leading-[1.06] [text-wrap:balance]">
              {t('h1')}
            </h1>
            <p className="m-0 mt-[16px] max-w-[54ch] text-[17px] leading-[1.65] text-body [text-wrap:pretty]">{t('lead')}</p>
          </div>
          <div className="grid gap-[10px] [grid-template-columns:repeat(3,minmax(0,1fr))]">
            {facts.map((x) => (
              <div key={x.v} className="rounded-note border border-line bg-sf p-[16px]">
                <span className="block font-display text-[24px] font-semibold leading-[1.1]">{x.v}</span>
                <span className="mt-[6px] block text-[12px] leading-[1.4] text-mut">{x.l}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="oppdrag" className={SPLIT}>
        <div>
          <Eyebrow>{t('sections.oppdrag')}</Eyebrow>
          <h2 className="m-0 mt-[9px] max-w-[22ch] font-display text-[32px] font-semibold leading-[1.14] [text-wrap:balance]">
            {t('mission.t')}
          </h2>
          <p className="m-0 mt-[12px] max-w-[52ch] text-[15px] leading-[1.7] text-body [text-wrap:pretty]">{t('mission.p1')}</p>
          <p className="m-0 mt-[12px] max-w-[52ch] text-[15px] leading-[1.7] text-body [text-wrap:pretty]">{t('mission.p2')}</p>
        </div>
        <div className="rounded-[22px] bg-sbg px-[30px] py-[28px]">
          <span className="block font-display text-[24px] italic leading-[1.4] [text-wrap:pretty]">{t('mission.quote')}</span>
          <div className="mt-[22px] flex flex-col gap-0 border-t border-[rgba(25,21,16,.15)] pt-[18px]">
            {loop.map((l, i) => (
              <span key={l.t} className="flex items-center gap-[12px] py-[8px]">
                <span className="flex h-[28px] w-[28px] flex-none items-center justify-center rounded-pill bg-ink text-[12px] font-bold text-bg">
                  {i + 1}
                </span>
                <span className="text-[14px] font-bold">{l.t}</span>
                <span className="text-[12.5px] text-body">{l.d}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="prinsipper" className={STACK}>
        <SectionHead
          k={t('sections.prinsipper')}
          t={t('principles.t')}
          d={t('principles.d')}
          h2Max="max-w-[24ch]"
          pMax="max-w-[60ch]"
        />
        <div className="mt-[24px] grid gap-[13px] [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
          {principles.map((p, i) => (
            <div key={p.t} className="flex flex-col gap-[10px] rounded-panel border border-line bg-sf p-[22px]">
              <span className="font-display text-[30px] font-semibold leading-none">{i + 1}</span>
              <span className="text-[17px] font-bold [text-wrap:pretty]">{p.t}</span>
              <span className="text-[13.5px] leading-[1.6] text-body [text-wrap:pretty]">{p.d}</span>
              <span className="mt-auto border-t border-line pt-[10px] text-[12px] leading-[1.45] text-mut">
                <strong className="text-ink">{t('principles.inPractice')}</strong> {p.x}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section
        id="lofter"
        className="mx-auto grid max-w-[1120px] scroll-mt-[118px] items-start gap-[36px] px-[26px] pt-[56px] [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]"
      >
        <div>
          <SectionHead
            k={t('sections.lofter')}
            t={t('promises.t')}
            d={t('promises.d')}
            h2Max="max-w-[20ch]"
            pMax="max-w-[48ch]"
          />
        </div>
        <div className="grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]">
          <div className="rounded-panel border border-line bg-sf p-[22px]">
            <span className="block text-[11px] uppercase tracking-[0.1em] text-mut">{t('promises.orgHead')}</span>
            <div className="mt-[12px] flex flex-col gap-[10px]">
              {Strs.parse(t.raw('promises.org')).map((p) => (
                <span key={p} className="flex gap-[10px] text-[13.5px] leading-[1.5] [text-wrap:pretty]">
                  <span
                    aria-hidden="true"
                    className="mt-[2px] flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[6px] bg-ink text-[10px] font-bold text-bg"
                  >
                    ✓
                  </span>
                  {p}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-panel bg-mint p-[22px]">
            <span className="block text-[11px] uppercase tracking-[0.1em] text-greendeep">{t('promises.empHead')}</span>
            <div className="mt-[12px] flex flex-col gap-[10px]">
              {Strs.parse(t.raw('promises.emp')).map((p) => (
                <span key={p} className="flex gap-[10px] text-[13.5px] leading-[1.5] text-greendeep [text-wrap:pretty]">
                  <span
                    aria-hidden="true"
                    className="mt-[2px] flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[6px] bg-greendeep text-[10px] font-bold text-mint"
                  >
                    ✓
                  </span>
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="team" className={STACK}>
        <SectionHead k={t('sections.team')} t={t('team.t')} d={t('team.d')} h2Max="max-w-[24ch]" pMax="max-w-[60ch]" />
        <div className="mt-[24px] grid gap-[13px] [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]">
          {team.map((m) => (
            <div key={m.n} className="rounded-panel border border-line bg-sf p-[16px]">
              <div className="flex h-[220px] items-center justify-center overflow-hidden rounded-tile bg-bg">
                <span
                  role="img"
                  aria-label={m.n}
                  className="block h-[120px] w-[120px] rounded-[28px] bg-bg bg-cover bg-center bg-no-repeat"
                  style={{ backgroundImage: `url(${m.face})` }}
                />
              </div>
              <span className="mt-[13px] block text-[16px] font-bold">{m.n}</span>
              <span className="mt-[2px] block text-[13px] text-mut">{m.r}</span>
              <span className="mt-[9px] block text-[13px] leading-[1.55] text-body [text-wrap:pretty]">{m.d}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="grunnlag" className={STACK}>
        <SectionHead k={t('sections.grunnlag')} t={t('basis.t')} d={t('basis.d')} h2Max="max-w-[24ch]" pMax="max-w-[60ch]" />
        <div className="mt-[24px] grid gap-[13px] [grid-template-columns:repeat(auto-fit,minmax(min(250px,100%),1fr))]">
          {basis.map((b) => (
            <div key={b.t} className="flex flex-col gap-[8px] rounded-panel border border-line bg-sf p-[20px]">
              <span className="self-start rounded-pill bg-track px-[10px] py-[4px] text-[11px] font-bold text-mut">{b.k}</span>
              <span className="text-[16px] font-bold [text-wrap:pretty]">{b.t}</span>
              <span className="text-[13px] leading-[1.55] text-body [text-wrap:pretty]">{b.d}</span>
              <Link href={b.href as Route} className="mt-auto pt-[6px] text-[13px] font-bold">
                {b.cta} →
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section id="kontakt" className="mx-auto max-w-[1120px] scroll-mt-[118px] px-[26px] pb-[72px] pt-[56px]">
        <ContactBlock
          to={CONTACT_MAIL}
          words={{
            k: t('sections.kontakt'),
            t: t('contact.t'),
            d: t('contact.d'),
            topics: Strs.parse(t.raw('contact.topics')),
            topicsLabel: t('contact.topicsLabel'),
            name: t('contact.name'),
            mail: t('contact.mail'),
            org: t('contact.org'),
            orgPlaceholder: t('contact.orgPlaceholder'),
            msg: t('contact.msg'),
            send: t('contact.send'),
            invalid: t('contact.invalid'),
            sent: t('contact.sent'),
            limited: t('contact.limited'),
            failed: t.raw('contact.failed') as string,
          }}
        />
      </section>
    </div>
  )
}

const SPLIT =
  'mx-auto grid max-w-[1120px] scroll-mt-[118px] items-center gap-[36px] px-[26px] pt-[56px] [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]'
const STACK = 'mx-auto max-w-[1120px] scroll-mt-[118px] px-[26px] pt-[56px]'
