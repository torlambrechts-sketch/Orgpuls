import type { Metadata } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { DemoRequest, type DemoWords } from '@/components/site/DemoForm'
import { Tick } from '@/components/site/parts'
import { DEMO_ROLES } from '@/lib/demo/roles'
import type { ShotId } from '@/lib/marketing/shot-ids'
import { pageMeta } from '@/lib/marketing/meta'
import { DemoShot } from './DemoShot'

/**
 * The demo (0094, D-143; 0146, D-191): a signup — name, work address, company, role and the
 * unticked consent box — a login link, and a copy of Demobedriften AS of the visitor's own.
 *
 * No design exists for the page. It is drawn in the v3 site's language (nettside-v3): the mint
 * top band with the ink pill and the Playfair heading of Plattform's hero, r20 hairline cards on
 * #FFFDF6, sections alternating #FCF6E9 and #FFFDF6 with a hairline between, the yellow form
 * button. Below the signup, six real screens (the product shots, D-84) say what to try, three
 * steps say how it works, and the demo's rules say what cannot happen.
 *
 * Every figure here is the template's: 64 employees in six departments and surveys from 2024,
 * 2025 and 2026 (scripts/seed/demo-org.mjs, which the hosted template was made from).
 */
export const dynamic = 'force-dynamic'

/** the six screens to try, in the order the product's own loop runs */
const EXPLORE: ShotId[] = ['oversikt', 'varmekart', 'samtaler', 'tiltak', 'arshjul', 'rapport']

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('demo')
  return pageMeta({ title: `${t('metaTitle')} · Orgpuls`, description: t('metaDescription'), path: '/demo' })
}

const section = 'mx-auto box-border max-w-[1240px] px-[20px] sm:px-[32px] lg:px-[56px]'
const kicker = 'block text-[11px] font-bold uppercase tracking-[0.12em] text-mut'
const h2 = 'm-0 mt-[12px] max-w-[24ch] font-display text-[clamp(28px,3.4vw,38px)] font-semibold leading-[1.1] [text-wrap:balance]'

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ feil?: string }> }) {
  const { feil } = await searchParams
  const t = await getTranslations('demo')
  const lang = (await getLocale()) === 'en' ? 'en' : 'no'
  const points = t.raw('points') as string[]
  const rules = t.raw('rules') as string[]
  const helpCount = (t.raw('sent.help') as string[]).length
  const steps = t.raw('how.steps') as { title: string; text: string }[]
  const startProblem = feil === 'closed' ? t('closed') : feil ? t('startFailed') : null

  const words: DemoWords = {
    title: t('form.title'),
    lead: t('form.lead'),
    name: t('form.name'),
    mail: t('form.mail'),
    company: t('form.company'),
    role: t('form.role'),
    rolePick: t('form.rolePick'),
    roles: Object.fromEntries(DEMO_ROLES.map((r) => [r, t(`form.roles.${r}`)])) as DemoWords['roles'],
    consent: t('form.consent'),
    submit: t('form.submit'),
    sending: t('form.sending'),
    nameMissing: t('form.nameMissing'),
    mailInvalid: t('form.mailInvalid'),
    companyMissing: t('form.companyMissing'),
    roleMissing: t('form.roleMissing'),
    fieldsProblem: t('form.fieldsProblem'),
    limited: t('form.limited'),
    closed: t('form.closed'),
    failed: t('form.failed'),
    note: t('form.note'),
    sent: {
      title: t('sent.title'),
      lead: t.raw('sent.lead') as string,
      from: t('sent.from'),
      helpTitle: t('sent.helpTitle'),
      help: Array.from({ length: helpCount }, (_, i) =>
        t.rich(`sent.help.${i}`, {
          mail: (chunks) => (
            <a href="mailto:hjelp@orgpuls.no?subject=Demo" className="font-semibold">
              {chunks}
            </a>
          ),
        }),
      ),
      again: t('sent.again'),
    },
  }

  return (
    <div className="animate-entry">
      {/* ------------------------------------------------------------ hero and signup */}
      <section className="border-b border-line bg-mint">
        <div
          className={`${section} grid gap-x-[56px] gap-y-[28px] pb-[56px] pt-[40px] lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:grid-rows-[auto_1fr] lg:pb-[72px] lg:pt-[56px] lg:[grid-template-areas:'intro_form''points_form']`}
        >
          <div className="min-w-0 lg:[grid-area:intro]">
            <span className="inline-block rounded-bar bg-ink px-[12px] py-[7px] text-[11px] font-bold uppercase tracking-[0.12em] text-bg">
              {t('badge')}
            </span>
            <h1 className="m-0 mt-[20px] max-w-[18ch] font-display text-[clamp(36px,5vw,56px)] font-semibold leading-[1.05] tracking-[-0.01em] [text-wrap:balance]">
              {t('title')}
            </h1>
            <p className="m-0 mt-[18px] max-w-[52ch] text-[16px] leading-[1.65] text-body [text-wrap:pretty] lg:text-[17px]">
              {t('lead')}
            </p>
          </div>

          <div id="skjema" className="min-w-0 scroll-mt-[118px] lg:[grid-area:form] lg:self-start">
            <div className="rounded-card border border-line bg-sf px-[20px] py-[24px] shadow-[0_18px_40px_-28px_rgba(25,21,16,.35)] sm:px-[28px] sm:py-[28px]">
              {startProblem ? (
                <p role="alert" className="m-0 mb-[16px] rounded-cta bg-peach px-[14px] py-[10px] text-[14px] font-semibold leading-[1.5] text-rustdeep">
                  {startProblem}
                </p>
              ) : null}
              <DemoRequest lang={lang} words={words} />
              <p className="m-0 mt-[14px] border-t border-line pt-[14px] text-[12.5px] leading-[1.55] text-mut [text-wrap:pretty]">
                {t('privacy')}{' '}
                <Link href="/personvernerklaering" className="font-semibold">
                  {t('privacyLink')}
                </Link>
              </p>
            </div>
          </div>

          <ul className="m-0 flex list-none flex-col gap-[10px] p-0 lg:[grid-area:points]">
            {points.map((p) => (
              <li key={p} className="flex gap-[10px] text-[15px] font-semibold leading-[1.5] text-ink">
                {/* the site's tick, on #FFFDF6: its own mint would vanish into the mint band */}
                <span
                  aria-hidden="true"
                  className="mt-[2px] flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[6px] bg-sf text-[10px] font-bold text-greendeep"
                >
                  ✓
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------------ what to explore */}
      <section aria-labelledby="demo-explore" className="border-b border-line bg-bg">
        <div className={`${section} py-[56px] lg:py-[72px]`}>
          <span className={kicker}>{t('explore.kicker')}</span>
          <h2 id="demo-explore" className={h2}>
            {t('explore.title')}
          </h2>
          <p className="m-0 mt-[14px] max-w-[56ch] text-[16px] leading-[1.65] text-body [text-wrap:pretty]">
            {t('explore.lead')}
          </p>
          <ul className="m-0 mt-[32px] grid list-none gap-[20px] p-0 [grid-template-columns:repeat(auto-fill,minmax(min(320px,100%),1fr))]">
            {EXPLORE.map((id) => (
              <li key={id} className="flex flex-col rounded-card border border-line bg-sf p-[14px]">
                <DemoShot id={id} />
                <h3 className="m-0 mt-[16px] px-[6px] text-[17px] font-bold leading-[1.3] [text-wrap:balance]">
                  {t(`explore.cards.${id}.title`)}
                </h3>
                <p className="m-0 mt-[6px] px-[6px] pb-[6px] text-[15px] leading-[1.55] text-body [text-wrap:pretty]">
                  {t(`explore.cards.${id}.try`)}
                </p>
              </li>
            ))}
          </ul>
          <p className="m-0 mt-[18px] max-w-[70ch] text-[13px] leading-[1.55] text-mut">{t('explore.note')}</p>
        </div>
      </section>

      {/* ------------------------------------------------------------ how it works */}
      <section aria-labelledby="demo-how" className="border-b border-line bg-sf">
        <div className={`${section} py-[56px] lg:py-[72px]`}>
          <span className={kicker}>{t('how.kicker')}</span>
          <h2 id="demo-how" className={h2}>
            {t('how.title')}
          </h2>
          <ol className="m-0 mt-[32px] grid list-none gap-[16px] p-0 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="rounded-card border border-line bg-bg px-[22px] py-[22px]">
                <span
                  aria-hidden="true"
                  className="flex h-[30px] w-[30px] items-center justify-center rounded-pill bg-ink text-[13px] font-bold text-bg"
                >
                  {i + 1}
                </span>
                <h3 className="m-0 mt-[14px] text-[17px] font-bold leading-[1.3]">{s.title}</h3>
                <p className="m-0 mt-[6px] text-[15px] leading-[1.6] text-body [text-wrap:pretty]">{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-[28px] rounded-card border border-line bg-bg px-[22px] py-[22px] sm:px-[26px]">
            <h3 className="m-0 text-[17px] font-bold">{t('rulesTitle')}</h3>
            <ul className="m-0 mt-[12px] grid list-none gap-x-[32px] gap-y-[10px] p-0 md:grid-cols-2">
              {rules.map((r) => (
                <li key={r} className="flex gap-[10px] text-[15px] leading-[1.55] text-body [text-wrap:pretty]">
                  <Tick />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ the end band */}
      <section aria-labelledby="demo-end" className="bg-bg">
        <div className={`${section} py-[56px] lg:py-[72px]`}>
          <div className="flex flex-wrap items-center justify-between gap-x-[40px] gap-y-[20px] rounded-[24px] border border-line bg-sf px-[22px] py-[30px] sm:px-[40px] sm:py-[36px]">
            <div className="min-w-0 max-w-[52ch]">
              <h2 id="demo-end" className="m-0 font-display text-[clamp(26px,3vw,32px)] font-semibold leading-[1.14] [text-wrap:balance]">
                {t('end.title')}
              </h2>
              <p className="m-0 mt-[10px] text-[16px] leading-[1.65] text-body [text-wrap:pretty]">{t('end.lead')}</p>
            </div>
            <div className="flex flex-col items-start gap-[14px]">
              <a
                href="#skjema"
                className="flex h-[52px] items-center gap-[9px] rounded-tile border border-ink bg-ac px-[22px] text-[16px] font-bold text-ink no-underline hover:text-ink hover:no-underline"
              >
                {t('end.cta')} <span aria-hidden="true">↑</span>
              </a>
              <Link href="/registrer" className="text-[14.5px] font-bold">
                {t('end.alt')} <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
