'use client'

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Outcome, useKeptAction } from '@/components/admin/ActionForms'
import type { CrmMessages } from '@/components/admin/CrmForms'
import { Button } from '@/components/ui/Button'
import type { Block, Campaign } from '@/lib/admin/crm'
import { saveCampaign } from '@/lib/admin/crmActions'
import { checkCampaign, type Check } from '@/lib/crm/deliverability'
import { MAIL_MARK, renderCampaign, type MailCatalogue } from '@/supabase/functions/_shared/mail'

/**
 * The campaign studio (X-092): the draft on the left, the mail as it will arrive on the right —
 * drawn live by the module the dispatcher sends with, on a desktop, on a phone and as a line in
 * an inbox — and under it the inbox check, run on every change. The server runs the same check
 * again before it schedules (lib/admin/campaignMail.ts), with the sending domain's DNS added.
 */
type Common = { saving: string; done: string }
type BlockType = Block['type']
type Key = Exclude<keyof Block, 'type'>
type Field = { k: Key; as: 'line' | 'area' | 'url'; label: string; max: number; rows?: number; hint?: string }

const field = 'box-border w-full rounded-ctl border border-line bg-bg px-[12px] text-[13.5px] text-ink outline-none focus-visible:border-ink'
const input = `${field} h-[38px]`
const label = 'mb-[5px] block text-[12px] font-semibold'
const DEFAULT_URL = 'https://www.orgpuls.com/'

/** placeholders the message knows ({count}); any other {name} — {firma}, {navn} — is left as written */
const fill = (s: string, v: Record<string, string | number> = {}) => s.replace(/\{(\w+)\}/g, (all, k: string) => (k in v ? String(v[k]) : all))

const EMPTY: Record<BlockType, Block> = {
  hero: { type: 'hero', title: '', text: '', label: '', url: DEFAULT_URL },
  heading: { type: 'heading', text: '' },
  text: { type: 'text', text: '' },
  button: { type: 'button', text: '', url: DEFAULT_URL },
  features: { type: 'features', title: '', text: '' },
  steps: { type: 'steps', title: '', text: '' },
  stats: { type: 'stats', title: '', text: '' },
  article: { type: 'article', title: '', text: '', url: DEFAULT_URL, label: '' },
  bullets: { type: 'bullets', text: '' },
  image: { type: 'image', url: 'https://', alt: '', href: '' },
  quote: { type: 'quote', text: '', title: '' },
  event: { type: 'event', title: '', text: '', url: DEFAULT_URL, label: '' },
  cta: { type: 'cta', title: '', text: '', label: '', url: DEFAULT_URL },
  divider: { type: 'divider' },
  ps: { type: 'ps', text: '' },
}

/** the palette, in the order an author reaches for them */
const PALETTE = Object.keys(EMPTY) as BlockType[]

function fields(t: BlockType, f: CrmMessages['studio']['field']): Field[] {
  const url: Field = { k: 'url', as: 'url', label: f.url, max: 500 }
  const image: Field[] = [
    { k: 'image', as: 'url', label: f.image, max: 500, hint: f.imageHint },
    { k: 'alt', as: 'line', label: f.alt, max: 150 },
  ]
  switch (t) {
    case 'hero':
      return [{ k: 'title', as: 'line', label: f.headline, max: 150 }, { k: 'text', as: 'area', label: f.lead, max: 600, rows: 3 }, { k: 'label', as: 'line', label: f.buttonText, max: 60 }, url, ...image]
    case 'heading':
      return [{ k: 'text', as: 'line', label: f.heading, max: 150 }]
    case 'text':
      return [{ k: 'text', as: 'area', label: f.text, max: 3000, rows: 5 }]
    case 'button':
      return [{ k: 'text', as: 'line', label: f.buttonText, max: 60 }, url]
    case 'features':
    case 'steps':
      return [{ k: 'title', as: 'line', label: f.sectionTitle, max: 150 }, { k: 'text', as: 'area', label: f.pairs, max: 2000, rows: 4, hint: t === 'steps' ? f.stepsHint : f.featuresHint }]
    case 'stats':
      return [{ k: 'title', as: 'line', label: f.sectionTitle, max: 150 }, { k: 'text', as: 'area', label: f.stats, max: 600, rows: 3, hint: f.statsHint }]
    case 'article':
      return [{ k: 'title', as: 'line', label: f.title, max: 150 }, { k: 'text', as: 'area', label: f.text, max: 1000, rows: 3 }, url, { k: 'label', as: 'line', label: f.linkText, max: 60 }, ...image]
    case 'bullets':
      return [{ k: 'text', as: 'area', label: f.lines, max: 2000, rows: 4 }]
    case 'image':
      return [{ k: 'url', as: 'url', label: f.imageUrl, max: 500, hint: f.imageHint }, { k: 'alt', as: 'line', label: f.alt, max: 150 }, { k: 'href', as: 'url', label: f.imageLink, max: 500 }]
    case 'quote':
      return [{ k: 'text', as: 'area', label: f.quote, max: 600, rows: 2 }, { k: 'title', as: 'line', label: f.attribution, max: 150 }]
    case 'event':
      return [{ k: 'title', as: 'line', label: f.title, max: 150 }, { k: 'text', as: 'area', label: f.when, max: 600, rows: 3 }, url, { k: 'label', as: 'line', label: f.buttonText, max: 60 }]
    case 'cta':
      return [{ k: 'title', as: 'line', label: f.headline, max: 150 }, { k: 'text', as: 'area', label: f.text, max: 600, rows: 2 }, { k: 'label', as: 'line', label: f.buttonText, max: 60 }, url]
    case 'divider':
      return []
    case 'ps':
      return [{ k: 'text', as: 'area', label: f.text, max: 600, rows: 2 }]
  }
}

/** Only the keys a kind uses are sent, empty ones dropped; an untouched default link is no link */
function clean(b: Block, f: CrmMessages['studio']['field']): Block {
  const out: Block = { type: b.type }
  for (const { k } of fields(b.type, f)) {
    const v = b[k]
    if (typeof v !== 'string' || v.trim() === '' || v === 'https://') continue
    if (k === 'url' && (b.type === 'event' || b.type === 'hero') && v === DEFAULT_URL && !(b.label ?? '').trim()) continue
    out[k] = v
  }
  if (!out.image) delete out.alt
  if (b.type === 'image' && b.alt) out.alt = b.alt
  return out
}

/** A small drawing of each block, so the palette shows what a block looks like, not only its name */
function Thumb({ t }: { t: BlockType }) {
  const line = (w: string, extra = '') => <span className={`block h-[3px] rounded-full bg-rule ${extra}`} style={{ width: w }} />
  // the frame; each drawing adds its own background and direction, so no two classes compete
  const frame = 'flex h-[34px] w-[48px] flex-none justify-center gap-[3px] overflow-hidden rounded-[7px] border border-line p-[5px]'
  const box = `${frame} flex-col bg-sf`
  switch (t) {
    case 'hero':
      return (
        <span className={`${frame} flex-col bg-sbg`}>
          {line('70%', 'h-[5px] bg-ink')}
          {line('90%')}
          <span className="mt-[1px] block h-[6px] w-[45%] rounded-[3px] bg-ac" />
        </span>
      )
    case 'heading':
      return <span className={box}>{line('80%', 'h-[6px] bg-ink')}</span>
    case 'text':
      return (
        <span className={box}>
          {line('95%')}
          {line('85%')}
          {line('60%')}
        </span>
      )
    case 'button':
      return (
        <span className={box}>
          <span className="block h-[10px] w-[60%] rounded-[3px] border border-ink bg-ac" />
        </span>
      )
    case 'features':
      return (
        <span className={`${frame} grid grid-cols-2 content-center bg-sf`}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="flex items-center gap-[2px]">
              <span className="block h-[5px] w-[5px] rounded-full bg-sbg ring-1 ring-ac" />
              {line('60%')}
            </span>
          ))}
        </span>
      )
    case 'steps':
      return (
        <span className={box}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex items-center gap-[3px]">
              <span className="block h-[6px] w-[6px] rounded-full bg-ac" />
              {line('70%')}
            </span>
          ))}
        </span>
      )
    case 'stats':
      return (
        <span className={`${frame} flex-row items-center bg-sf`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex h-[20px] flex-1 flex-col items-center justify-center gap-[2px] rounded-[3px] bg-sbg">
              <span className="block h-[5px] w-[60%] rounded-full bg-ink" />
              <span className="block h-[2px] w-[70%] rounded-full bg-rule" />
            </span>
          ))}
        </span>
      )
    case 'article':
      return (
        <span className={`${frame} flex-col bg-bg`}>
          {line('70%', 'h-[4px] bg-ink')}
          {line('90%')}
          {line('35%', 'bg-link')}
        </span>
      )
    case 'bullets':
      return (
        <span className={box}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex items-center gap-[3px]">
              <span className="text-[6px] font-bold leading-none text-link">✓</span>
              {line('70%')}
            </span>
          ))}
        </span>
      )
    case 'image':
      return (
        <span className={`${frame} flex-col items-center bg-sf`}>
          <span className="block h-[20px] w-full rounded-[3px] bg-pulse" />
        </span>
      )
    case 'quote':
      return (
        <span className={`${frame} flex-col bg-bg`}>
          <span className="font-display text-[12px] leading-[0.6] text-ac">“</span>
          {line('85%')}
          {line('55%')}
        </span>
      )
    case 'event':
      return (
        <span className={`${frame} flex-col border-l-[3px] border-l-ac bg-bg`}>
          {line('70%', 'h-[4px] bg-ink')}
          {line('50%')}
          <span className="block h-[5px] w-[40%] rounded-[2px] bg-ac" />
        </span>
      )
    case 'cta':
      return (
        <span className={`${frame} flex-col border-ink bg-ink`}>
          {line('70%', 'h-[4px] bg-bg')}
          <span className="block h-[6px] w-[45%] rounded-[2px] bg-ac" />
        </span>
      )
    case 'divider':
      return <span className={`${frame} flex-col items-center bg-sf`}>{line('90%', 'h-[1px] bg-rule')}</span>
    case 'ps':
      return (
        <span className={box}>
          <span className="text-[6px] font-bold leading-none text-mut">P.S.</span>
          {line('80%')}
        </span>
      )
  }
}

const MARK: Record<Check['level'], { glyph: string; cls: string }> = {
  pass: { glyph: '✓', cls: 'bg-mint text-greendeep' },
  warn: { glyph: '!', cls: 'bg-sbg text-cautiondeep' },
  fail: { glyph: '✕', cls: 'bg-peach text-dangerdeep' },
}

/** The inbox check as a list: what fails first, then advice, then what already holds */
export function InboxCheck({ checks, m }: { checks: Check[]; m: CrmMessages }) {
  const s = m.studio.check
  const order = { fail: 0, warn: 1, pass: 2 }
  const sorted = [...checks].sort((a, b) => order[a.level] - order[b.level])
  const passed = checks.filter((c) => c.level === 'pass').length
  const failing = checks.some((c) => c.level === 'fail')
  const text = (c: Check) => {
    const item = (s.item as Record<string, Partial<Record<Check['level'], string>>>)[c.id]
    return fill(item?.[c.level] ?? c.id, c.vars)
  }
  return (
    <section aria-labelledby="inbox-check">
      <div className="flex flex-wrap items-baseline justify-between gap-[8px]">
        <h3 id="inbox-check" className="m-0 text-[14px] font-bold">
          {s.title}
        </h3>
        <span className="text-[12.5px] font-semibold tabular-nums text-mut">{fill(s.score, { pass: passed, total: checks.length })}</span>
      </div>
      <div className="mt-[8px] h-[6px] overflow-hidden rounded-full bg-track" aria-hidden="true">
        <span
          className={`block h-full rounded-full ${failing ? 'bg-rustbar' : passed === checks.length ? 'bg-greenbar' : 'bg-amberbar'}`}
          style={{ width: `${checks.length ? (100 * passed) / checks.length : 0}%` }}
        />
      </div>
      <p className={`mb-[10px] mt-[8px] text-[12.5px] font-semibold ${failing ? 'text-danger' : 'text-link'}`} role="status">
        {failing ? s.blocked : s.ok}
      </p>
      <ul className="m-0 flex list-none flex-col gap-[6px] p-0">
        {sorted.map((c) => (
          <li key={c.id} className="flex items-start gap-[8px] text-[12.5px] leading-[1.5]">
            <span aria-label={s.level[c.level]} className={`mt-[1px] flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full text-[10.5px] font-bold ${MARK[c.level].cls}`}>
              {MARK[c.level].glyph}
            </span>
            <span className={c.level === 'pass' ? 'text-mut' : 'text-ink'}>{text(c)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

type View = 'desktop' | 'phone' | 'inbox'

/**
 * The desktop view: the mail laid out in a 700 px window, as a desktop program shows it, scaled
 * down to the column it sits in, so a narrow column still shows the desktop layout, not the phone's.
 */
const DESKTOP = 700
function Desktop({ html, title, height }: { html: string; title: string; height: number }) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => setScale(Math.min(1, el.clientWidth / DESKTOP))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={box} className="overflow-hidden rounded-ctl border border-line bg-bg" style={{ height }}>
      <iframe
        title={title}
        srcDoc={html}
        sandbox=""
        className="block origin-top-left border-0"
        style={{ width: DESKTOP, height: height / scale, transform: `scale(${scale})` }}
      />
    </div>
  )
}

/** The rendered mail in a frame, on a desktop or a phone, or its line in an inbox */
export function MailPreview({
  html,
  subject,
  preheader,
  from,
  m,
  initial = 'desktop',
  compact = false,
}: {
  html: string
  subject: string
  preheader: string
  from: string
  m: CrmMessages
  initial?: View
  /** a shorter frame, for a gallery of several */
  compact?: boolean
}) {
  const [view, setView] = useState<View>(initial)
  const s = m.studio
  // the mark from this host's own copy (public/mail), so a preview does not wait on a deploy of the site
  html = html.replaceAll(`https://www.orgpuls.com${MAIL_MARK}`, MAIL_MARK)
  const tab = (v: View) => (
    <button
      key={v}
      type="button"
      role="tab"
      aria-selected={view === v}
      onClick={() => setView(v)}
      className={`h-[30px] rounded-pill px-[12px] text-[12.5px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ink ${view === v ? 'bg-ink text-bg' : 'text-mut hover:text-ink'}`}
    >
      {s.view[v]}
    </button>
  )
  return (
    <div>
      <div role="tablist" aria-label={s.preview} className="inline-flex gap-[2px] rounded-pill bg-track p-[3px]">
        {(['desktop', 'phone', 'inbox'] as View[]).map(tab)}
      </div>
      <div className="mt-[10px]">
        {view === 'inbox' ? (
          <div className="overflow-hidden rounded-ctl border border-line bg-sf">
            <div className="border-b border-line bg-bg px-[12px] py-[7px] text-[11px] font-bold uppercase tracking-[0.08em] text-mut">{s.inboxTitle}</div>
            <div className="flex items-start gap-[10px] px-[12px] py-[12px]">
              <span className="mt-[2px] flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-sbg text-[14px] font-bold text-ink" aria-hidden="true">
                {from.trim().charAt(0).toUpperCase() || 'O'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-[8px]">
                  <span className="truncate text-[14px] font-bold text-ink">{from}</span>
                  <span className="flex-none text-[11.5px] text-mut">{s.now}</span>
                </span>
                <span className="block truncate text-[13.5px] font-semibold text-ink">{subject || '—'}</span>
                <span className="block truncate text-[13px] text-mut">{preheader || s.noPreheader}</span>
              </span>
            </div>
            <p className="m-0 border-t border-line px-[12px] py-[8px] text-[11.5px] leading-[1.5] text-mut">{s.inboxLead}</p>
          </div>
        ) : view === 'phone' ? (
          <div className="mx-auto w-[395px] max-w-full rounded-[34px] border-[10px] border-ink bg-ink">
            <iframe title={`${s.preview} · ${s.view.phone}`} srcDoc={html} sandbox="" className={`block w-full rounded-[24px] bg-bg ${compact ? 'h-[520px]' : 'h-[680px]'}`} />
          </div>
        ) : (
          <Desktop html={html} title={`${s.preview} · ${s.view.desktop}`} height={compact ? 460 : 720} />
        )}
      </div>
      {compact ? null : <p className="mb-0 mt-[8px] text-[11.5px] text-mut">{s.sample}</p>}
    </div>
  )
}

export function CampaignStudio({
  m,
  common,
  campaign,
  segments,
  lists,
  cat,
  sender,
  domain,
  footer,
  maxBlocks = null,
}: {
  m: CrmMessages
  common: Common
  campaign: Campaign
  segments: { id: string; name: string; mailable: number }[]
  lists: { id: string; name_no: string; name_en: string; subscribed: number }[]
  cat: MailCatalogue
  sender: { name: string; email: string; signature: string } | null
  domain: Check[]
  footer: { no: string; en: string }
  /** the blocks-per-campaign limit (0192); null: unlimited */
  maxBlocks?: number | null
}) {
  const x = m.campaignX
  const s = m.studio
  const [name, setName] = useState(campaign.name)
  const [kind, setKind] = useState<string>(campaign.kind)
  const [lang, setLang] = useState<'no' | 'en'>(campaign.lang === 'en' ? 'en' : 'no')
  const [subject, setSubject] = useState(campaign.subject)
  const [subjectB, setSubjectB] = useState(campaign.subject_b)
  const [preheader, setPreheader] = useState(campaign.preheader)
  const [segment, setSegment] = useState(campaign.segment_id ?? '')
  const [list, setList] = useState(campaign.list_id ?? '')
  const [utm, setUtm] = useState(campaign.utm_campaign)
  const [style, setStyle] = useState<'branded' | 'letter'>(campaign.style)
  const [signature, setSignature] = useState(campaign.signature)
  const [abPercent, setAbPercent] = useState(String(campaign.ab_percent))
  const [abMetric, setAbMetric] = useState<string>(campaign.ab_metric)
  const [abWait, setAbWait] = useState(String(campaign.ab_wait_hours))
  const [publish, setPublish] = useState(campaign.publish_web)
  const [slug, setSlug] = useState(campaign.slug ?? '')
  const [webDescription, setWebDescription] = useState(campaign.web_description)
  const [blocks, setBlocks] = useState<Block[]>(campaign.blocks.length ? campaign.blocks : [EMPTY.text])
  const [open, setOpen] = useState<number | null>(campaign.blocks.length ? null : 0)
  const [state, action, pending] = useKeptAction(saveCampaign, () => undefined)

  const setBlock = (i: number, b: Partial<Block>) => setBlocks(blocks.map((v, j) => (j === i ? { ...v, ...b } : v)))
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= blocks.length) return
    const next = [...blocks]
    ;[next[i], next[j]] = [next[j]!, next[i]!]
    setBlocks(next)
    setOpen(open === i ? j : open === j ? i : open)
  }
  const add = (t: BlockType) => {
    setBlocks([...blocks, { ...EMPTY[t] }])
    setOpen(blocks.length)
  }
  const cleaned = blocks.map((b) => clean(b, s.field))

  // the preview and the check follow the typing a moment behind, so typing stays quick
  const draft = useDeferredValue({ cleaned, subject, preheader, style, lang, signature, kind, list, publish, slug, utm })
  const rendered = useMemo(() => {
    const l = lists.find((v) => v.id === draft.list)
    return renderCampaign(
      cat,
      {
        id: 'preview',
        kind: 'campaign',
        to_email: '',
        token: '0'.repeat(64),
        name: 'Kari Nordmann',
        company: 'Eksempel AS',
        basis: draft.style === 'letter' && !draft.list ? 'business' : 'consent',
        lang: draft.lang,
        campaign: {
          kind: draft.kind,
          style: draft.style,
          signature: draft.signature.trim() || sender?.signature || '',
          subject: draft.subject,
          preheader: draft.preheader,
          blocks: draft.cleaned,
          utm_campaign: draft.utm || 'preview',
          web_slug: draft.publish && draft.slug ? draft.slug : null,
          list: l ? { name_no: l.name_no, name_en: l.name_en } : null,
        },
      },
      'https://www.orgpuls.com',
    )
  }, [draft, cat, lists, sender])
  const checks = useMemo(
    () => [
      ...checkCampaign({
        style: draft.style,
        subject: draft.subject,
        subjectB,
        preheader: draft.preheader,
        blocks: draft.cleaned,
        html: rendered.html,
        footer: footer[draft.lang],
      }),
      ...domain,
    ],
    [draft, subjectB, rendered, footer, domain],
  )

  // a plain function, not a component: a component declared here would remount, and lose focus, on every key
  const line = (i: number, f: Field) => (
    <label key={f.k} className="mt-[8px] block">
      <span className="mb-[4px] block text-[11.5px] font-semibold text-mut">{f.label}</span>
      {f.as === 'area' ? (
        <textarea
          rows={f.rows ?? 3}
          value={(blocks[i]?.[f.k] as string | undefined) ?? ''}
          maxLength={f.max}
          onChange={(e) => setBlock(i, { [f.k]: e.target.value })}
          className={`${field} py-[9px] leading-[1.5]`}
        />
      ) : (
        <input
          type={f.as === 'url' ? 'url' : 'text'}
          value={(blocks[i]?.[f.k] as string | undefined) ?? ''}
          maxLength={f.max}
          onChange={(e) => setBlock(i, { [f.k]: e.target.value })}
          className={input}
        />
      )}
      {f.hint ? <span className="mt-[3px] block text-[11.5px] text-mut">{f.hint}</span> : null}
    </label>
  )

  const summary = (b: Block) => (b.title || b.text || b.label || b.alt || '').split('\n')[0]?.slice(0, 70) ?? ''
  const sectionTitle = 'm-0 text-[13px] font-bold uppercase tracking-[0.08em] text-mut'

  return (
    <div className="grid items-start gap-[18px] xl:[grid-template-columns:minmax(0,1fr)_minmax(380px,0.85fr)]">
      <form action={action} className="flex min-w-0 flex-col gap-[16px]">
        <input type="hidden" name="id" value={campaign.id} />
        <input type="hidden" name="blocks" value={JSON.stringify(cleaned)} />

        <fieldset className="m-0 flex min-w-0 flex-col gap-[10px] rounded-panel border border-line p-[14px]">
          <legend className={`${sectionTitle} px-[4px]`}>{s.section.setup}</legend>
          <div className="grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
            <label className="block">
              <span className={label}>{m.campaigns.name}</span>
              <input name="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} className={input} />
            </label>
            <label className="block">
              <span className={label}>{m.campaigns.kind_}</span>
              <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={input}>
                {Object.entries(m.campaigns.kind).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>{m.campaigns.lang}</span>
              <select name="lang" value={lang} onChange={(e) => setLang(e.target.value === 'en' ? 'en' : 'no')} className={input}>
                <option value="no">Norsk</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>
          <div role="radiogroup" aria-label={x.style} className="grid gap-[8px] [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
            {(['branded', 'letter'] as const).map((v) => (
              <label
                key={v}
                className={`flex cursor-pointer gap-[10px] rounded-ctl border px-[12px] py-[10px] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink ${style === v ? 'border-ink bg-sbg' : 'border-line bg-bg'}`}
              >
                <input type="radio" name="style" value={v} checked={style === v} onChange={() => setStyle(v)} className="sr-only" />
                <span className="text-[13px]">
                  <span className="block font-bold">{x.styleName[v]}</span>
                  <span className="block text-[12px] leading-[1.45] text-mut">{s.styleHint[v]}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
            <label className="block">
              <span className={label}>{x.list}</span>
              <select name="list_id" value={list} onChange={(e) => setList(e.target.value)} className={input}>
                <option value="">{x.noList}</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name_no} ({l.subscribed})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>{m.campaign.segment}</span>
              <select name="segment_id" value={segment} onChange={(e) => setSegment(e.target.value)} className={input}>
                <option value="">{m.campaign.noSegment}</option>
                {segments.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.mailable})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <span className="text-[11.5px] leading-[1.5] text-mut">{x.audienceHint}</span>
        </fieldset>

        <fieldset className="m-0 flex min-w-0 flex-col gap-[10px] rounded-panel border border-line p-[14px]">
          <legend className={`${sectionTitle} px-[4px]`}>{s.section.inbox}</legend>
          <label className="block">
            <span className={label}>{m.campaign.subject}</span>
            <input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} className={input} />
            <span className={`mt-[4px] block text-[11.5px] ${subject.length <= 50 ? 'text-mut' : 'text-cautiondeep'}`}>{fill(x.subjectMeter, { count: subject.length })}</span>
          </label>
          <label className="block">
            <span className={label}>{m.campaign.preheader}</span>
            <input name="preheader" value={preheader} onChange={(e) => setPreheader(e.target.value)} maxLength={200} className={input} />
            <span className={`mt-[4px] block text-[11.5px] ${preheader.length === 0 || (preheader.length >= 40 && preheader.length <= 90) ? 'text-mut' : 'text-cautiondeep'}`}>
              {fill(x.preheaderMeter, { count: preheader.length })}
            </span>
          </label>
          <span className="text-[11.5px] text-mut">{x.placeholders}</span>
          <details className="rounded-ctl border border-line px-[12px] py-[8px]" open={!!subjectB}>
            <summary className="cursor-pointer text-[12.5px] font-bold">{x.abTitle}</summary>
            <label className="mt-[8px] block">
              <span className={label}>{x.subjectB}</span>
              <input name="subject_b" value={subjectB} onChange={(e) => setSubjectB(e.target.value)} maxLength={150} className={input} />
            </label>
            <div className="mt-[8px] grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
              <label className="block">
                <span className={label}>{x.abPercent}</span>
                <input name="ab_percent" type="number" value={abPercent} onChange={(e) => setAbPercent(e.target.value)} className={input} />
              </label>
              <label className="block">
                <span className={label}>{x.abMetric}</span>
                <select name="ab_metric" value={abMetric} onChange={(e) => setAbMetric(e.target.value)} className={input}>
                  <option value="open">{x.metric.open}</option>
                  <option value="click">{x.metric.click}</option>
                </select>
              </label>
              <label className="block">
                <span className={label}>{x.abWait}</span>
                <input name="ab_wait_hours" type="number" value={abWait} onChange={(e) => setAbWait(e.target.value)} className={input} />
              </label>
            </div>
            <span className="mt-[6px] block text-[11.5px] text-mut">{x.abHint}</span>
          </details>
        </fieldset>

        <fieldset className="m-0 flex min-w-0 flex-col gap-[8px] rounded-panel border border-line p-[14px]">
          <legend className={`${sectionTitle} px-[4px]`}>{s.section.content}</legend>
          <ol className="m-0 flex list-none flex-col gap-[8px] p-0">
            {blocks.map((b, i) => {
              const expanded = open === i
              return (
                <li key={i} className={`rounded-panel border bg-sf ${expanded ? 'border-ink' : 'border-line'}`}>
                  <div className="flex items-center gap-[10px] px-[10px] py-[8px]">
                    <Thumb t={b.type} />
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setOpen(expanded ? null : i)}
                      className="min-w-0 flex-1 rounded-[6px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ink"
                    >
                      <span className="block text-[12.5px] font-bold">
                        {i + 1}. {s.block[b.type].name}
                      </span>
                      <span className="block truncate text-[12px] text-mut">{summary(b) || s.block[b.type].hint}</span>
                    </button>
                    <span className="flex flex-none gap-[2px]">
                      <Button size="sm" tone="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={m.campaign.up}>
                        ↑
                      </Button>
                      <Button size="sm" tone="ghost" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} aria-label={m.campaign.down}>
                        ↓
                      </Button>
                      <Button
                        size="sm"
                        tone="ghost"
                        aria-label={s.duplicate}
                        onClick={() => {
                          const next = [...blocks]
                          next.splice(i + 1, 0, { ...b })
                          setBlocks(next)
                          setOpen(i + 1)
                        }}
                      >
                        ⧉
                      </Button>
                      <Button
                        size="sm"
                        tone="ghost"
                        aria-label={m.campaign.remove}
                        onClick={() => {
                          setBlocks(blocks.filter((_, j) => j !== i))
                          setOpen(null)
                        }}
                      >
                        ✕
                      </Button>
                    </span>
                  </div>
                  {expanded ? (
                    <div className="border-t border-line px-[12px] pb-[12px] pt-[2px]">
                      {fields(b.type, s.field).map((f) => line(i, f))}
                      {b.type === 'divider' ? <p className="mb-0 mt-[8px] text-[12px] text-mut">{s.block.divider.hint}</p> : null}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ol>
          <div className="mt-[6px]">
            <p className="mb-[6px] mt-0 text-[12px] font-semibold">{s.add}</p>
            <div className="grid gap-[6px] [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
              {PALETTE.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => add(t)}
                  disabled={maxBlocks != null && blocks.length >= maxBlocks}
                  className="flex items-center gap-[8px] rounded-ctl border border-line bg-bg px-[8px] py-[6px] text-left outline-none hover:border-ink focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
                >
                  <Thumb t={t} />
                  <span className="min-w-0 text-[12px] font-semibold leading-[1.25]">{s.block[t].name}</span>
                </button>
              ))}
            </div>
          </div>
        </fieldset>

        <fieldset className="m-0 flex min-w-0 flex-col gap-[10px] rounded-panel border border-line p-[14px]">
          <legend className={`${sectionTitle} px-[4px]`}>{s.section.finish}</legend>
          <label className="block">
            <span className={label}>{x.signature}</span>
            <textarea name="signature" rows={2} maxLength={200} value={signature} onChange={(e) => setSignature(e.target.value)} className={`${field} py-[9px] leading-[1.5]`} />
            <span className="mt-[4px] block text-[11.5px] text-mut">{x.signatureHint}</span>
          </label>
          <label className="flex items-center gap-[8px] text-[13px]">
            <input type="checkbox" name="publish_web" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            {x.publishWeb}
          </label>
          {publish ? (
            <div className="grid gap-[10px] [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
              <label className="block">
                <span className={label}>{x.slug}</span>
                <input name="slug" value={slug} onChange={(e) => setSlug(e.target.value)} maxLength={80} className={input} />
              </label>
              <label className="block">
                <span className={label}>{x.webDescription}</span>
                <input name="web_description" value={webDescription} onChange={(e) => setWebDescription(e.target.value)} maxLength={200} className={input} />
              </label>
            </div>
          ) : (
            <>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="web_description" value={webDescription} />
            </>
          )}
          <span className="block text-[11.5px] text-mut">{x.webHint}</span>
          <label className="block">
            <span className={label}>{m.campaign.utm}</span>
            <input name="utm_campaign" value={utm} onChange={(e) => setUtm(e.target.value)} maxLength={60} className={input} />
            <span className="mt-[4px] block text-[11.5px] text-mut">{m.campaign.utmHint}</span>
          </label>
        </fieldset>

        <span className="sticky bottom-0 z-10 -mx-[4px] flex flex-wrap items-center gap-[10px] border-t border-line bg-sf px-[4px] py-[10px]">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? common.saving : m.campaign.save}
          </Button>
          <Outcome state={state} problems={m.problem} done={common.done} />
        </span>
      </form>

      <aside className="flex min-w-0 flex-col gap-[16px] xl:sticky xl:top-[16px]" aria-label={s.preview}>
        <MailPreview html={rendered.html} subject={rendered.subject} preheader={preheader} from={sender?.name || 'Orgpuls'} m={m} />
        <div className="rounded-panel border border-line bg-sf p-[14px]">
          <InboxCheck checks={checks} m={m} />
        </div>
      </aside>
    </div>
  )
}
