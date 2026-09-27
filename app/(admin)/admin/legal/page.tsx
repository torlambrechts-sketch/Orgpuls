import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { LegalCheck, TranslationsApproveForm } from '@/components/admin/LegalForms'
import { Badge, Card, day, PageHead, Problem, Stat } from '@/components/admin/ui'
import { isError, legalApprovals, translationState, whoami, type TranslationState } from '@/lib/admin/api'
import respondentUi from '@/lib/i18n/respondent-ui.json'
import { respondentLines } from '@/lib/i18n/respondent-strings'
import enMessages from '@/messages/en.json'
import { legalInputs } from '@/lib/legal/inputs'
import { DPA_IN_FORCE, legalUnits, LEGAL_SECTIONS, type LegalUnit } from '@/lib/legal/registry'

/**
 * The legal review (D-130, X-065): every legal text in the product and on the site, each with an
 * «Approved» box. An approval names the exact text (its SHA-256, 0082), so an edited text comes
 * back as changed. The English survey's translations are approved here too, all at once.
 * Super-admin only; the database checks that on every call.
 */
export const dynamic = 'force-dynamic'

const SHOW = ['all', 'open', 'changed', 'approved'] as const
type Show = (typeof SHOW)[number]
const LANG = ['all', 'no', 'en'] as const
type Lang = (typeof LANG)[number]

type Props = { searchParams: Promise<{ show?: string; lang?: string }> }

export default async function AdminLegal(props: Props) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const sp = await props.searchParams
  const show: Show = (SHOW as readonly string[]).includes(sp.show ?? '') ? (sp.show as Show) : 'all'
  const lang: Lang = (LANG as readonly string[]).includes(sp.lang ?? '') ? (sp.lang as Lang) : 'all'

  const [who, approvals, en, inputs] = await Promise.all([whoami(), legalApprovals(), translationState('en'), legalInputs()])
  if (who?.role !== 'super_admin' || isError(approvals)) {
    return <Problem text={!isError(approvals) || approvals.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  }

  const byKey = new Map(approvals.approvals.map((a) => [a.key, a]))
  // the same inputs the approve action checks against (lib/legal/inputs.ts)
  const units = legalUnits(inputs)
  const stateOf = (u: LegalUnit) => {
    const a = byKey.get(u.key)
    return !a ? 'open' : a.hash === u.hash ? 'approved' : 'changed'
  }
  // the pills count what they would show, in the language chosen; the tiles above are the whole
  const count = (s: Show, l: Lang = lang) => units.filter((u) => (s === 'all' || stateOf(u) === s) && (l === 'all' || u.lang === l)).length
  const shown = units.filter((u) => (show === 'all' || stateOf(u) === show) && (lang === 'all' || u.lang === lang))

  const title = (u: LegalUnit) => t(`legal.unit.${u.title.key}`, u.title.values ?? {})
  const where = (u: LegalUnit) => t(`legal.whereAt.${u.where.key}`, u.where.values ?? {})
  const href = (next: { show?: Show; lang?: Lang }) => {
    const q = new URLSearchParams()
    const s = next.show ?? show
    const l = next.lang ?? lang
    if (s !== 'all') q.set('show', s)
    if (l !== 'all') q.set('lang', l)
    return `/admin/legal${q.size ? `?${q}` : ''}` as Route
  }
  const problems = Object.fromEntries(
    ['not_allowed', 'invalid', 'not_found', 'stale', 'confirm_required', 'failed'].map((k) => [k, t(`legal.problem.${k}`)]),
  )
  const checkLabels = { approved: t('legal.approved'), saving: t('legal.saving'), done: t('legal.done'), problems }

  return (
    <>
      <PageHead title={t('legal.title')} lead={t('legal.lead')} />

      <div className="mb-[18px] grid gap-[12px] [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
        <Stat label={t('legal.stat.texts')} value={units.length} />
        <Stat label={t('legal.stat.approved')} value={count('approved', 'all')} />
        <Stat label={t('legal.stat.changed')} value={count('changed', 'all')} />
        <Stat label={t('legal.stat.open')} value={count('open', 'all')} />
      </div>

      {inputs.failed.length ? (
        <div className="mb-[18px] flex flex-col gap-[8px]">
          {inputs.failed.map((k) => (
            <Problem key={k} text={t(`legal.sourceFailed.${k}`)} />
          ))}
        </div>
      ) : null}

      {!isError(en) ? <EnglishSurvey t={t} state={en} problems={problems} /> : null}

      <nav aria-label={t('legal.filter')} className="my-[18px] flex flex-wrap items-center gap-[6px] text-[13px]">
        {SHOW.map((s) => (
          <Link
            key={s}
            href={href({ show: s })}
            aria-current={s === show ? 'page' : undefined}
            className={`rounded-pill border px-[11px] py-[5px] font-semibold no-underline hover:no-underline ${s === show ? 'border-ink bg-ink text-bg hover:text-bg' : 'border-line bg-sf text-ink hover:text-ink'}`}
          >
            {t('legal.countLabel', { label: t(`legal.show.${s}`), n: count(s) })}
          </Link>
        ))}
        <span aria-hidden="true" className="mx-[6px] h-[18px] w-px bg-line" />
        {LANG.map((l) => (
          <Link
            key={l}
            href={href({ lang: l })}
            aria-current={l === lang ? 'page' : undefined}
            className={`rounded-pill border px-[11px] py-[5px] font-semibold no-underline hover:no-underline ${l === lang ? 'border-ink bg-ink text-bg hover:text-bg' : 'border-line bg-sf text-ink hover:text-ink'}`}
          >
            {t(`legal.lang.${l}`)}
          </Link>
        ))}
      </nav>

      <div className="flex flex-col gap-[16px]">
        {LEGAL_SECTIONS.map((section) => {
          const list = shown.filter((u) => u.section === section)
          if (!list.length) return null
          return (
            <Card key={section} title={t('legal.countLabel', { label: t(`legal.section.${section}`), n: list.length })}>
              <p className="mb-[4px] mt-0 max-w-[80ch] text-[12.5px] leading-[1.5] text-mut">{t(`legal.sectionLead.${section}`)}</p>
              <ul className="m-0 list-none p-0">
                {list.map((u) => {
                  const a = byKey.get(u.key)
                  const state = stateOf(u)
                  return (
                    <li key={u.key} className="border-t border-line py-[12px]">
                      <div className="flex flex-wrap items-start justify-between gap-[12px]">
                        <div className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-[6px]">
                            <b className="text-[13.5px]">{title(u)}</b>
                            <Badge>{t(`legal.langCode.${u.lang}`)}</Badge>
                            <Badge tone={u.live ? 'green' : 'grey'}>{u.live ? t('legal.live') : t('legal.notLive')}</Badge>
                            <Badge tone={state === 'approved' ? 'green' : state === 'changed' ? 'yellow' : 'red'}>{t(`legal.state.${state}`)}</Badge>
                          </span>
                          <span className="mt-[4px] block text-[12px] leading-[1.5] text-mut">
                            {t('legal.whereSource', { where: where(u), source: u.source })}
                          </span>
                          {a ? (
                            <span className="mt-[2px] block text-[12px] text-mut">
                              {t(state === 'approved' ? 'legal.approvedBy' : 'legal.changedSince', { by: a.by ?? t('legal.someone'), date: day(a.at) })}
                            </span>
                          ) : null}
                          {u.key === 'msg:no:doc.dpa' ? (
                            <span className="mt-[2px] block text-[12px] text-mut">
                              {t('legal.dpaInForce', { version: DPA_IN_FORCE.version, hash: DPA_IN_FORCE.sha256.slice(0, 12) })}
                            </span>
                          ) : null}
                        </div>
                        {u.missing?.length ? (
                          <p role="alert" className="m-0 text-[12.5px] font-semibold text-dangerdeep">
                            {t('legal.broken', { paths: u.missing.join(', ') })}
                          </p>
                        ) : (
                          <LegalCheck
                            key={u.key}
                            unitKey={u.key}
                            hash={u.hash}
                            approved={state === 'approved'}
                            label={t('legal.approvedLabel', { title: title(u), lang: t(`legal.lang.${u.lang}`) })}
                            labels={checkLabels}
                          />
                        )}
                      </div>
                      <details className="mt-[8px]">
                        <summary className="cursor-pointer text-[12.5px] font-semibold text-link">
                          {t('legal.showText', { n: u.lines.length })}
                        </summary>
                        <dl className="m-0 mt-[8px] rounded-ctl border border-line bg-bg px-[14px] py-[10px]">
                          {u.lines.map((l) => (
                            <div key={l.path} className="py-[4px]">
                              <dt className="break-all font-mono text-[11px] text-mut">{l.path}</dt>
                              <dd className="m-0 whitespace-pre-wrap text-[13px] leading-[1.55]">{l.text}</dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )
        })}
        {shown.length === 0 ? <p className="m-0 text-[13px] text-mut">{t('legal.none')}</p> : null}
      </div>
    </>
  )
}

/** The English survey (0079): its items and the page strings, approved at once (0082). */
function EnglishSurvey({
  t,
  state,
  problems,
}: {
  t: Awaited<ReturnType<typeof getTranslations<'admin'>>>
  state: TranslationState
  problems: Record<string, string>
}) {
  const hash = (respondentUi as Record<string, string>).en ?? ''
  const approved = state.items.filter((i) => i.approved).length
  const uiOk = state.ui.some((u) => u.hash === hash)
  const open = state.items.length - approved
  // every item any survey could ask has an approved row, and this build's page strings are approved:
  // the offered rule's own two conditions (lib/i18n/offered.ts; the flag is signed off)
  const ready = state.missing === 0 && uiOk
  const strings = respondentLines(enMessages as Record<string, unknown>)
  return (
    <Card title={t('legal.en.title')} aside={<Badge tone={ready ? 'green' : 'red'}>{ready ? t('legal.en.on') : t('legal.en.off')}</Badge>}>
      <p className="mb-[10px] mt-0 max-w-[80ch] text-[13px] leading-[1.55] text-mut">{t('legal.en.lead')}</p>
      <ul className="m-0 mb-[12px] list-disc pl-[18px] text-[13px] leading-[1.7]">
        <li>{t('legal.en.items', { approved, total: state.items.length })}</li>
        <li>{state.missing === 0 ? t('legal.en.coverOk') : t('legal.en.coverMissing', { n: state.missing })}</li>
        <li>{uiOk ? t('legal.en.uiOk') : t('legal.en.uiOpen', { n: strings.length })}</li>
      </ul>
      {/* mounted either way, so the answer to an approval that leaves nothing open is still shown */}
      <TranslationsApproveForm
        locale="en"
        digest={state.digest}
        open={open > 0 || !uiOk}
        labels={{ read: t('legal.en.read'), submit: t('legal.en.submit'), saving: t('legal.saving'), done: t('legal.en.done'), problems }}
      />
      <details className="mt-[12px]">
        <summary className="cursor-pointer text-[12.5px] font-semibold text-link">{t('legal.en.showUi', { n: strings.length })}</summary>
        <dl className="m-0 mt-[8px] rounded-ctl border border-line bg-bg px-[14px] py-[10px]">
          {strings.map((l) => (
            <div key={l.path} className="py-[4px]">
              <dt className="break-all font-mono text-[11px] text-mut">{l.path}</dt>
              <dd className="m-0 whitespace-pre-wrap text-[13px] leading-[1.55]">{l.text}</dd>
            </div>
          ))}
        </dl>
      </details>
      <details className="mt-[12px]">
        <summary className="cursor-pointer text-[12.5px] font-semibold text-link">{t('legal.en.show', { n: state.items.length })}</summary>
        <dl className="m-0 mt-[8px] rounded-ctl border border-line bg-bg px-[14px] py-[10px]">
          {state.items.map((i) => (
            <div key={i.item} className="py-[4px]">
              <dt className="break-all font-mono text-[11px] text-mut">
                {t(i.approved ? 'legal.en.itemApproved' : 'legal.en.itemOpen', { item: i.item, source: i.source })}
              </dt>
              <dd className="m-0 text-[13px] leading-[1.55]">{i.text}</dd>
            </div>
          ))}
        </dl>
      </details>
    </Card>
  )
}
