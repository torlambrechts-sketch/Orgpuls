import { getTranslations } from 'next-intl/server'
import { LegalReviewButton } from '@/components/admin/LegalForms'
import { Badge, day, PageHead, Problem, Segments, type BadgeTone } from '@/components/admin/ui'
import { autoRecord } from '@/lib/admin/auto'
import { isError, legalApprovals, legalReviews, whoami, type LegalReview } from '@/lib/admin/api'
import { approvedLineByLine, legalDocuments, lineDiff, type DiffLine, type LegalDoc } from '@/lib/legal/documents'
import { legalInputs } from '@/lib/legal/inputs'
import { DPA_IN_FORCE, legalUnits, type LegalUnit } from '@/lib/legal/registry'

/**
 * Legal texts (X-096; D-130 and X-078 before it): every legal text in the product and on the site,
 * as documents — an industry page, a module, the privacy statement — each read and marked reviewed
 * once. The text is stored as it was read (0122), so a document changed since shows exactly what
 * changed. It is a record of who read what, not a gate: nothing waits on it (X-078). A document
 * whose every line was approved under the old line-by-line review (0082) reads as reviewed.
 * Super-admin only; the database checks that on every call.
 */
export const dynamic = 'force-dynamic'

const SHOW = ['todo', 'changed', 'new', 'reviewed', 'all'] as const
type Show = (typeof SHOW)[number]
const LANG = ['all', 'no', 'en'] as const
type Lang = (typeof LANG)[number]
type State = 'reviewed' | 'changed' | 'new' | 'broken'
const TONE: Record<State, BadgeTone> = { reviewed: 'green', changed: 'yellow', new: 'red', broken: 'red' }

type Props = { searchParams: Promise<{ show?: string; lang?: string; doc?: string }> }

export default async function AdminLegal(props: Props) {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const sp = await props.searchParams
  const show: Show = (SHOW as readonly string[]).includes(sp.show ?? '') ? (sp.show as Show) : 'todo'
  const lang: Lang = (LANG as readonly string[]).includes(sp.lang ?? '') ? (sp.lang as Lang) : 'all'

  // while auto-approve is on (0101), the texts this build shows are recorded as approved first
  await autoRecord()
  const [who, reviews, approvals, inputs] = await Promise.all([whoami(), legalReviews(), legalApprovals(), legalInputs()])
  if (who?.role !== 'super_admin' || isError(reviews)) {
    return <Problem text={!isError(reviews) || reviews.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  }

  const units = legalUnits(inputs)
  const docs = legalDocuments(units)
  const reviewed = new Map(reviews.rows.map((r) => [r.key, r]))
  const lineApprovals = new Map(isError(approvals) ? [] : approvals.approvals.map((a) => [a.key, a.hash]))
  const stateOf = (d: LegalDoc): State => {
    if (d.missing.length) return 'broken'
    const r = reviewed.get(d.key)
    if (r) return r.hash === d.hash ? 'reviewed' : 'changed'
    return approvedLineByLine(d, lineApprovals) ? 'reviewed' : 'new'
  }
  const inShow = (d: LegalDoc, s: Show) => {
    const st = stateOf(d)
    return s === 'all' || (s === 'todo' ? st !== 'reviewed' : s === 'new' ? st === 'new' || st === 'broken' : st === s)
  }
  const inLang = (d: LegalDoc, l: Lang) => l === 'all' || d.lang === l
  const count = (s: Show, l: Lang = lang) => docs.filter((d) => inShow(d, s) && inLang(d, l)).length
  const shown = docs.filter((d) => inShow(d, show) && inLang(d, lang))

  const L = (k: string, v?: Record<string, string | number>) => t(`legal.docs.${k}`, v)
  const titleOf = (m: { key: string; values?: Record<string, string> }) => t(`legal.unit.${m.key}`, m.values ?? {})
  const where = (d: LegalDoc) => t(`legal.whereAt.${d.where.key}`, d.where.values ?? {})
  const href = (next: { show?: Show; lang?: Lang; doc?: string }) => {
    const q = new URLSearchParams()
    const s = next.show ?? show
    const l = next.lang ?? lang
    if (s !== 'todo') q.set('show', s)
    if (l !== 'all') q.set('lang', l)
    if (next.doc) q.set('doc', next.doc)
    return `/admin/legal${q.size ? `?${q}` : ''}`
  }
  // one document open at a time: its text, or what changed since it was reviewed
  const open = docs.find((d) => d.key === sp.doc) ?? null
  const problems = Object.fromEntries(['not_allowed', 'invalid', 'not_found', 'stale', 'failed'].map((k) => [k, t(`legal.problem.${k}`)]))
  const buttonLabels = { submit: L('markReviewed'), saving: t('legal.saving'), done: L('reviewedNow'), problems }

  return (
    <>
      <PageHead title={L('title')} lead={L('lead', { docs: docs.length, todo: count('todo', 'all') })} />

      {inputs.failed.length ? (
        <div className="mb-[18px] flex flex-col gap-[8px]">
          {inputs.failed.map((k) => (
            <Problem key={k} text={t(`legal.sourceFailed.${k}`)} />
          ))}
        </div>
      ) : null}

      {open ? (
        <section id="open" aria-labelledby="open-title" className="mb-[18px] rounded-panel border border-ink bg-sf px-[20px] py-[18px] md:px-[26px]">
          <div className="flex flex-wrap items-start justify-between gap-[12px]">
            <div className="min-w-0 flex-1">
              <h2 id="open-title" className="m-0 font-display text-[22px] font-medium">
                {titleOf(open.title)}
              </h2>
              <div className="mt-[4px] flex flex-wrap items-center gap-[6px] text-[12.5px] text-mut">
                <Badge>{t(`legal.langCode.${open.lang}`)}</Badge>
                <Badge tone={TONE[stateOf(open)]}>{L(`state.${stateOf(open)}`)}</Badge>
                <span>
                  {t(`legal.section.${open.section}`)} · {where(open)}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-[10px]">
              {stateOf(open) === 'changed' || stateOf(open) === 'new' ? <LegalReviewButton docKey={open.key} hash={open.hash} labels={buttonLabels} /> : null}
              <a href={href({})} className="text-[12.5px] font-semibold text-link">
                {L('close')}
              </a>
            </div>
          </div>
          {stateOf(open) === 'changed' && reviewed.get(open.key) ? (
            <Changes review={reviewed.get(open.key)!} doc={open} titleOf={titleOf} labels={{ gap: L('unchanged'), added: L('added'), removed: L('removed') }} />
          ) : (
            <FullText units={open.units} titleOf={titleOf} whereOf={(u) => t(`legal.whereAt.${u.where.key}`, u.where.values ?? {})} />
          )}
        </section>
      ) : null}

      <section className="rounded-panel border border-line bg-sf">
        <div className="flex flex-wrap items-center gap-[10px] px-[20px] py-[16px]">
          <Segments label={L('filter')} items={SHOW.map((s) => ({ key: s, label: L(`show.${s}`), n: count(s), href: href({ show: s }), on: s === show }))} />
          <Segments label={L('language')} items={LANG.map((l) => ({ key: l, label: t(`legal.lang.${l}`), href: href({ lang: l }), on: l === lang }))} />
        </div>
        <ul className="m-0 list-none p-0">
          {shown.map((d) => {
            const st = stateOf(d)
            const r = reviewed.get(d.key)
            return (
              <li key={d.key} className="border-t border-line px-[20px] py-[14px]">
                <div className="flex flex-wrap items-start justify-between gap-[12px]">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-[6px]">
                      <b className="text-[13.5px]">{titleOf(d.title)}</b>
                      <Badge>{t(`legal.langCode.${d.lang}`)}</Badge>
                      <Badge tone={TONE[st]}>{L(`state.${st}`)}</Badge>
                      {!d.live ? <Badge tone="grey">{t('legal.notLive')}</Badge> : null}
                    </div>
                    <div className="mt-[3px] text-[12px] leading-[1.5] text-mut">
                      {t(`legal.section.${d.section}`)} · {where(d)}
                      {d.units.length > 1 ? ` · ${L('parts', { n: d.units.length })}` : ''}
                    </div>
                    {r ? (
                      <div className="mt-[2px] text-[12px] text-mut">
                        {L(st === 'reviewed' ? 'reviewedBy' : 'changedSince', { by: r.by ?? t('legal.someone'), date: day(r.at) })}
                      </div>
                    ) : st === 'reviewed' ? (
                      <div className="mt-[2px] text-[12px] text-mut">{L('reviewedLineByLine')}</div>
                    ) : null}
                    {d.key === 'msg:no:doc.dpa' ? (
                      <div className="mt-[2px] text-[12px] text-mut">{t('legal.dpaInForce', { version: DPA_IN_FORCE.version, hash: DPA_IN_FORCE.sha256.slice(0, 12) })}</div>
                    ) : null}
                  </div>
                  {st === 'broken' ? (
                    <p role="alert" className="m-0 max-w-[40ch] text-[12.5px] font-semibold text-dangerdeep">
                      {t('legal.broken', { paths: d.missing.join(', ') })}
                    </p>
                  ) : st !== 'reviewed' ? (
                    <LegalReviewButton docKey={d.key} hash={d.hash} labels={buttonLabels} />
                  ) : null}
                </div>
                <a href={`${href({ doc: d.key })}#open`} className="mt-[6px] inline-block text-[12.5px] font-semibold text-link">
                  {st === 'changed' && r ? L('showChanges') : L('showText')}
                </a>
              </li>
            )
          })}
        </ul>
        {shown.length === 0 ? <p className="m-0 border-t border-line px-[20px] py-[18px] text-[13px] text-mut">{L(show === 'todo' ? 'allReviewed' : 'none')}</p> : null}
      </section>
      <p className="mb-0 mt-[14px] max-w-[90ch] text-[12px] leading-[1.55] text-mut md:px-[18px]">{L('note')}</p>
    </>
  )
}

/** The document as it reads now: each part under its title, each line under its path */
function FullText({ units, titleOf, whereOf }: { units: LegalUnit[]; titleOf: (m: LegalUnit['title']) => string; whereOf: (u: LegalUnit) => string }) {
  return (
    <div className="mt-[8px] flex flex-col gap-[10px] rounded-ctl border border-line bg-bg px-[14px] py-[12px]">
      {units.map((u) => (
        <div key={u.key}>
          {units.length > 1 ? (
            <div className="mb-[4px] text-[12.5px]">
              <b>{titleOf(u.title)}</b> <span className="text-mut">· {whereOf(u)}</span>
            </div>
          ) : null}
          <dl className="m-0">
            {u.lines.map((l) => (
              <div key={l.path} className="py-[3px]">
                <dt className="break-all font-mono text-[11px] text-mut">{l.path}</dt>
                <dd className="m-0 whitespace-pre-wrap text-[13px] leading-[1.55] [overflow-wrap:anywhere]">{l.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  )
}

/** What changed since the text was reviewed: added and removed lines, two unchanged lines around each */
function Changes({ review, doc, titleOf, labels }: { review: LegalReview; doc: LegalDoc; titleOf: (m: LegalUnit['title']) => string; labels: { gap: string; added: string; removed: string } }) {
  const diff = lineDiff(review.text, doc.text)
  const near = (i: number) => diff.slice(Math.max(0, i - 2), i + 3).some((x) => x.kind !== 'same')
  const title = new Map(doc.units.map((u) => [`# ${u.key}`, titleOf(u.title)]))
  const out: (DiffLine | null)[] = []
  diff.forEach((x, i) => {
    if (x.kind !== 'same' || near(i)) out.push(x)
    else if (out[out.length - 1] !== null) out.push(null)
  })
  return (
    <div className="mt-[8px] rounded-ctl border border-line bg-bg px-[14px] py-[10px] text-[13px] leading-[1.55]">
      {out.map((x, i) =>
        x === null ? (
          <div key={i} className="py-[2px] text-[12px] text-mut">
            {labels.gap}
          </div>
        ) : (
          <div
            key={i}
            className={`whitespace-pre-wrap rounded-[4px] px-[6px] [overflow-wrap:anywhere] ${x.kind === 'added' ? 'bg-teal/40' : x.kind === 'removed' ? 'bg-peach/60 line-through' : ''} ${x.text.startsWith('# ') ? 'mt-[4px] font-semibold' : ''}`}
          >
            <span aria-hidden="true" className="mr-[6px] font-mono text-[11px] text-mut">
              {x.kind === 'added' ? '+' : x.kind === 'removed' ? '−' : ' '}
            </span>
            {x.kind === 'same' ? null : <span className="sr-only">{x.kind === 'added' ? labels.added : labels.removed} </span>}
            {title.get(x.text) ?? x.text}
          </div>
        ),
      )}
    </div>
  )
}
