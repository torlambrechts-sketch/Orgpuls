'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { BTN } from './ui'
import type en from '@/messages/en.json'
import { parseContent, pathOf, placeholders, type CmsKind, type CmsLocale, type Layout } from '@/lib/cms/content'
import { DESCRIPTION_RANGE, seoScore, TITLE_RANGE, type SeoCheck } from '@/lib/cms/seo'
import { Block } from '@/lib/marketing/blocks'
import { SHOT_IDS, type ShotId } from '@/lib/marketing/shot-ids'
import { cmsArchive, cmsPreviewToken, cmsPublish, cmsRestore, cmsSave, cmsTranslate, cmsUnpublish } from '@/lib/admin/cmsActions'
import { BlockThumb, ScoreRing, SeoChecklist, SerpPreview, SocialCard, StateChip } from './CmsVisuals'

/**
 * The page editor (X-094): the page's words on the left, section by section, and on the right the
 * page itself as the public site draws it, through a one-hour preview link. The search score, the
 * Google result and the shared card follow every keystroke; the preview follows every save.
 *
 * The editor holds each language's draft in the browser until it is saved; «Save draft» writes
 * every language that changed, «Publish» saves first. The database checks the shape of every page
 * and refuses to publish one with a [placeholder] left in it.
 */
export type CmsMessages = (typeof en)['admin']['cms']
type BlockT = Block['t']

type LocaleRow = {
  locale: CmsLocale
  draft: unknown
  live_at: string | null
  pending_at: string | null
  translation: 'source' | 'draft' | 'reviewed'
  current: unknown
  changed: boolean
}
export type EditorPage = {
  id: string
  kind: CmsKind
  slug: string
  layout: Layout
  focus_keyword: string | null
  noindex: boolean
  shot: ShotId | null
  archived: boolean
  locales: LocaleRow[]
}
export type EditorRevision = { id: number; locale: CmsLocale; action: 'save' | 'publish' | 'schedule' | 'unpublish' | 'restore'; at: string; by: string | null; title: string | null }

type Item = { uid: string; b: Block; raw?: string }
type Faq = { uid: string; q: string; a: string }
type Doc = {
  title: string
  description: string
  crumb: string
  kicker: string
  h1: string
  lead: string
  signupLabel: string
  finalTitle: string
  finalBody: string
  items: Item[]
  faq: Faq[]
  sources: string
  translation: LocaleRow['translation']
}
type Meta = { slug: string; keyword: string; noindex: boolean; shot: ShotId | '' }

const field = 'box-border w-full rounded-ctl border border-line bg-bg px-[12px] text-[13.5px] text-ink outline-none focus-visible:border-ink'
const input = `${field} h-[38px]`
const area = `${field} py-[9px] leading-[1.5]`
const labelCls = 'mb-[5px] block text-[12px] font-semibold'
const hintCls = 'mt-[4px] block text-[11.5px] leading-[1.45] text-mut'
const fill = (s: string, v: Record<string, string | number> = {}) => s.replace(/\{(\w+)\}/g, (all, k: string) => (k in v ? String(v[k]) : all))

let seq = 0
const uid = () => `u${++seq}`

/** the palette, in the order an author reaches for them */
const PALETTE: BlockT[] = ['h2', 'p', 'ul', 'ol', 'cards', 'box', 'quote', 'law', 'table', 'links', 'shot', 'plans', 'h3']

const EMPTY: Record<BlockT, Block> = {
  h2: { t: 'h2', text: '' },
  h3: { t: 'h3', text: '' },
  p: { t: 'p', text: '' },
  ul: { t: 'ul', items: [] },
  ol: { t: 'ol', items: [] },
  quote: { t: 'quote', text: '', cite: '' },
  law: { t: 'law', items: [] },
  box: { t: 'box', title: '', text: '' },
  cards: { t: 'cards', items: [] },
  table: { t: 'table', head: [], rows: [] },
  links: { t: 'links', items: [] },
  plans: { t: 'plans' },
  shot: { t: 'shot', id: 'oversikt' },
}

// ---------------------------------------------------------------- the list-shaped sections, as lines of text
const lines = (s: string) =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
const cells = (l: string) => l.split('|').map((c) => c.trim())

/** The text an author edits for a list-shaped section; null for a section edited field by field */
function rawOf(b: Block): string | undefined {
  switch (b.t) {
    case 'ul':
    case 'ol':
      return b.items.join('\n')
    case 'law':
      return b.items.map((i) => `${i.ref} | ${i.text}`).join('\n')
    case 'cards':
      return b.items.map((i) => `${i.title} | ${i.text}`).join('\n')
    case 'links':
      return b.items.map((i) => `${i.title} | ${i.text} | ${i.href}`).join('\n')
    case 'table':
      return [b.head, ...b.rows].map((r) => r.join(' | ')).join('\n')
    default:
      return undefined
  }
}

function fromRaw(t: BlockT, raw: string): Block {
  const ls = lines(raw)
  switch (t) {
    case 'ul':
    case 'ol':
      return { t, items: ls }
    case 'law':
      return { t, items: ls.map((l) => cells(l)).map(([ref = '', ...rest]) => ({ ref, text: rest.join(' | ') })) }
    case 'cards':
      return { t, items: ls.map((l) => cells(l)).map(([title = '', ...rest]) => ({ title, text: rest.join(' | ') })) }
    case 'links':
      return {
        t,
        items: ls.map((l) => cells(l)).map((c) => ({ title: c[0] ?? '', text: c.length > 2 ? c.slice(1, -1).join(' | ') : (c[1] ?? ''), href: c.length > 2 ? (c[c.length - 1] ?? '') : '' })),
      }
    case 'table': {
      const [head = [], ...rows] = ls.map((l) => cells(l))
      return { t, head, rows }
    }
    default:
      return EMPTY[t]
  }
}

/** A section that would render nothing, or that the site would refuse */
function isEmpty(b: Block): boolean {
  if (!Block.safeParse(b).success) return true
  switch (b.t) {
    case 'h2':
    case 'h3':
    case 'p':
      return !b.text.trim()
    case 'quote':
      return !b.text.trim()
    case 'box':
      return !b.title.trim() && !b.text.trim()
    case 'cards':
      return b.items.length > 9
    case 'table':
      return b.head.length > 6
    default:
      return false
  }
}

function docOf(row: LocaleRow | undefined): Doc {
  const c = parseContent(row?.draft ?? {})
  return {
    title: c?.title ?? '',
    description: c?.description ?? '',
    crumb: c?.crumb ?? '',
    kicker: c?.kicker ?? '',
    h1: c?.h1 ?? '',
    lead: c?.lead ?? '',
    signupLabel: c?.signupLabel ?? '',
    finalTitle: c?.finalTitle ?? '',
    finalBody: c?.finalBody ?? '',
    items: (c?.blocks ?? []).map((b) => ({ uid: uid(), b, raw: rawOf(b) })),
    faq: (c?.faq ?? []).map((f) => ({ uid: uid(), q: f.q, a: f.a })),
    sources: (c?.sources ?? []).map((s) => `${s.label} | ${s.url}`).join('\n'),
    translation: row?.translation ?? 'source',
  }
}

/** The draft as the database stores it */
function contentOf(d: Doc) {
  return {
    title: d.title,
    description: d.description,
    crumb: d.crumb,
    kicker: d.kicker,
    h1: d.h1,
    lead: d.lead,
    signupLabel: d.signupLabel,
    blocks: d.items.map((i) => i.b),
    faq: d.faq.filter((f) => f.q.trim() || f.a.trim()).map((f) => ({ q: f.q, a: f.a })),
    finalTitle: d.finalTitle,
    finalBody: d.finalBody,
    sources: lines(d.sources)
      .map((l) => cells(l))
      .map(([label = '', ...rest]) => ({ label, url: rest.join('|').trim() })),
  }
}
const snapshot = (d: Doc) => JSON.stringify([contentOf(d), d.translation])
const metaSnapshot = (m: Meta) => JSON.stringify(m)

type Props = {
  page: EditorPage
  revisions: EditorRevision[]
  traffic: { views: number; visitors: number; cta: number; signups: number } | null
  days: number
  templateName: string
  /** where the public site is: '' when the admin and the site share a host */
  origins: Record<CmsLocale, string>
  hosts: Record<CmsLocale, string>
  canWrite: boolean
  m: CmsMessages
  when: Record<string, string>
}

export function CmsEditor({ page, revisions, traffic, days, templateName, origins, hosts, canWrite, m, when }: Props) {
  const e = m.editor
  const router = useRouter()
  const path = pathOf(page.kind, page.slug)
  const present = page.locales.map((l) => l.locale)
  const [locale, setLocale] = useState<CmsLocale>(present[0] ?? 'no')
  const [docs, setDocs] = useState<Partial<Record<CmsLocale, Doc>>>(() => Object.fromEntries(page.locales.map((l) => [l.locale, docOf(l)])))
  const [saved, setSaved] = useState<Partial<Record<CmsLocale, string>>>(() => Object.fromEntries(page.locales.map((l) => [l.locale, snapshot(docOf(l))])))
  const initialMeta: Meta = { slug: page.slug, keyword: page.focus_keyword ?? '', noindex: page.noindex, shot: page.shot ?? '' }
  const [meta, setMeta] = useState<Meta>(initialMeta)
  const [savedMeta, setSavedMeta] = useState(metaSnapshot(initialMeta))
  const [tab, setTab] = useState<'content' | 'translations' | 'seo' | 'history' | 'settings'>('content')
  const [problem, setProblem] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, startBusy] = useTransition()
  const [scheduleAt, setScheduleAt] = useState('')
  /** languages whose draft the server replaced (a restore, a new translation): re-read from the page */
  const reread = useRef(new Set<CmsLocale>())

  // a language added or restored on the server comes back with the page
  useEffect(() => {
    const fresh = page.locales.filter((l) => !(l.locale in docs) || reread.current.has(l.locale))
    if (!fresh.length) return
    setDocs((d) => ({ ...d, ...Object.fromEntries(fresh.map((l) => [l.locale, docOf(l)])) }))
    setSaved((s) => ({ ...s, ...Object.fromEntries(fresh.map((l) => [l.locale, snapshot(docOf(l))])) }))
    reread.current.clear()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the server's copy decides
  }, [page])

  const doc = docs[locale] ?? docOf(undefined)
  const row = page.locales.find((l) => l.locale === locale)
  const dirtyLocales = (Object.keys(docs) as CmsLocale[]).filter((l) => docs[l] && snapshot(docs[l]!) !== saved[l])
  const metaDirty = metaSnapshot(meta) !== savedMeta
  const dirty = dirtyLocales.length > 0 || metaDirty

  const setDoc = useCallback((patch: Partial<Doc>) => setDocs((d) => ({ ...d, [locale]: { ...(d[locale] ?? docOf(undefined)), ...patch } })), [locale])
  const setItems = (f: (items: Item[]) => Item[]) => setDoc({ items: f(doc.items) })

  const content = useMemo(() => contentOf(doc), [doc])
  const left = useMemo(() => placeholders(content), [content])
  const empties = doc.items.filter((i) => isEmpty(i.b)).map((i) => i.uid)
  const score = seoScore({
    layout: page.layout,
    slug: meta.slug,
    keyword: meta.keyword,
    noindex: meta.noindex,
    twin: present.length > 1,
    title: doc.title,
    description: doc.description,
    body: { h1: doc.h1, lead: doc.lead, blocks: content.blocks, faq: content.faq, sources: content.sources, raw: content },
  })
  const checkText = (c: SeoCheck) => fill((m.check as Record<string, Record<string, string>>)[c.id]?.[c.level] ?? c.id, { n: c.n ?? 0 })

  // ---------------------------------------------------------------- preview
  const [token, setToken] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const [view, setView] = useState<'desktop' | 'phone'>('desktop')
  const [previewFailed, setPreviewFailed] = useState(false)
  useEffect(() => {
    let live = true
    const get = () =>
      cmsPreviewToken({ id: page.id }).then((r) => {
        if (!live) return
        if (r.ok) setToken(r.token)
        else setPreviewFailed(true)
      })
    void get()
    // a link lasts an hour; a fresh one before it runs out
    const every = setInterval(get, 45 * 60 * 1000)
    return () => {
      live = false
      clearInterval(every)
    }
  }, [page.id])
  const previewUrl = token ? `${origins[locale]}${path}?cms=${token}&cmsl=${locale}&r=${nonce}` : null

  // ---------------------------------------------------------------- writing
  const fail = (p: string) => {
    setNotice(null)
    setProblem((m.problem as Record<string, string>)[p] ?? m.problem.failed)
  }
  const metaOut = () => ({ slug: meta.slug, focus_keyword: meta.keyword, noindex: meta.noindex, shot: meta.shot })

  /** every language that changed, and the settings; true when all of it was written */
  const save = async (): Promise<boolean> => {
    if (empties.length) {
      fail('empty_block')
      return false
    }
    const todo = dirtyLocales.length ? dirtyLocales : metaDirty ? [locale] : []
    for (const l of todo) {
      const d = docs[l]!
      if (d.items.some((i) => isEmpty(i.b))) {
        setLocale(l)
        fail('empty_block')
        return false
      }
      const r = await cmsSave({ id: page.id, locale: l, content: dirtyLocales.includes(l) ? contentOf(d) : null, meta: { ...metaOut(), translation: d.translation } })
      if (!r.ok) {
        setLocale(l)
        fail(r.problem)
        return false
      }
      setSaved((s) => ({ ...s, [l]: snapshot(d) }))
    }
    setSavedMeta(metaSnapshot(meta))
    setProblem(null)
    setNotice(e.saved)
    // a new address reloads the preview when the page comes back with it; the old one only redirects
    if (meta.slug === page.slug) setNonce((n) => n + 1)
    router.refresh()
    return true
  }

  const run = (f: () => Promise<{ ok: true } | { ok: false; problem: string }>, done?: () => void) =>
    startBusy(async () => {
      const r = await f()
      if (!r.ok) return fail(r.problem)
      setProblem(null)
      done?.()
      setNonce((n) => n + 1)
      router.refresh()
    })

  const publish = (at: string | null) =>
    startBusy(async () => {
      if (dirty && !(await save())) return
      const r = await cmsPublish({ id: page.id, locale, at })
      if (!r.ok) return fail(r.problem)
      setProblem(null)
      setNotice(at ? fill(m.stateLong.scheduled, { at: new Date(at).toLocaleString('en-GB') }) : m.state.live)
      setScheduleAt('')
      router.refresh()
    })

  // ⌘S / Ctrl-S saves; leaving with unsaved changes asks first
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    const key = (ev: KeyboardEvent) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 's') {
        ev.preventDefault()
        if (canWrite) startBusy(async () => void (await saveRef.current()))
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [canWrite])
  useEffect(() => {
    if (!dirty) return
    const stay = (ev: BeforeUnloadEvent) => ev.preventDefault()
    window.addEventListener('beforeunload', stay)
    return () => window.removeEventListener('beforeunload', stay)
  }, [dirty])

  const state = page.archived ? 'archived' : !row ? 'draft' : row.pending_at && new Date(row.pending_at) > new Date() ? 'scheduled' : row.current ? (row.changed ? 'changed' : 'live') : 'draft'
  const missing = (['no', 'en'] as const).filter((l) => !present.includes(l))
  const liveHref = `${origins[locale] || ''}${path}`

  // ---------------------------------------------------------------- the pieces
  const text = (k: keyof Doc & string, label: string, opts: { max: number; rows?: number; hint?: string; range?: readonly [number, number] } ) => {
    const v = String(doc[k] ?? '')
    const counter = opts.range ? fill(e.counterRange, { n: v.length, lo: opts.range[0], hi: opts.range[1] }) : null
    const off = opts.range && (v.length < opts.range[0] || v.length > opts.range[1])
    return (
      <label className="block min-w-0">
        <span className={`${labelCls} flex items-baseline justify-between gap-[8px]`}>
          <span>{label}</span>
          {counter ? <span className={`text-[11px] font-semibold ${off ? 'text-caution' : 'text-greendeep'}`}>{counter}</span> : null}
        </span>
        {opts.rows ? (
          <textarea value={v} maxLength={opts.max} rows={opts.rows} readOnly={!canWrite} onChange={(ev) => setDoc({ [k]: ev.target.value } as Partial<Doc>)} className={area} />
        ) : (
          <input value={v} maxLength={opts.max} readOnly={!canWrite} onChange={(ev) => setDoc({ [k]: ev.target.value } as Partial<Doc>)} className={input} />
        )}
        {opts.hint ? <span className={hintCls}>{opts.hint}</span> : null}
      </label>
    )
  }

  const blockFields = (it: Item, i: number) => {
    const b = it.b
    const set = (next: Block, raw?: string) => setItems((items) => items.map((x, j) => (j === i ? { ...x, b: next, raw } : x)))
    const one = (k: 'text' | 'title' | 'cite', label: string, rows?: number, max = 600) => {
      const v = String((b as Record<string, unknown>)[k] ?? '')
      return (
        <label className="block">
          <span className={labelCls}>{label}</span>
          {rows ? (
            <textarea value={v} rows={rows} maxLength={max} readOnly={!canWrite} onChange={(ev) => set({ ...b, [k]: ev.target.value } as Block)} className={area} />
          ) : (
            <input value={v} maxLength={max} readOnly={!canWrite} onChange={(ev) => set({ ...b, [k]: ev.target.value } as Block)} className={input} />
          )}
        </label>
      )
    }
    const listy = (label: string, rows = 4) => (
      <label className="block">
        <span className={labelCls}>{label}</span>
        <textarea value={it.raw ?? ''} rows={rows} readOnly={!canWrite} onChange={(ev) => set(fromRaw(b.t, ev.target.value), ev.target.value)} className={area} />
      </label>
    )
    switch (b.t) {
      case 'h2':
      case 'h3':
        return one('text', e.field.heading, undefined, 200)
      case 'p':
        return (
          <>
            {one('text', e.field.text, 5, 4000)}
            <span className={hintCls}>{e.inline}</span>
          </>
        )
      case 'ul':
      case 'ol':
        return listy(e.field.items)
      case 'quote':
        return (
          <>
            {one('text', e.field.quote, 3, 1200)}
            {one('cite', e.field.cite, undefined, 200)}
          </>
        )
      case 'law':
        return listy(e.field.law)
      case 'box':
        return (
          <>
            {one('title', e.field.boxTitle, undefined, 200)}
            {one('text', e.field.text, 3, 1500)}
          </>
        )
      case 'cards':
        return listy(e.field.cards)
      case 'table':
        return listy(e.field.table, 5)
      case 'links':
        return listy(e.field.links, 3)
      case 'plans':
        return <p className="m-0 text-[12.5px] text-mut">{e.plansNote}</p>
      case 'shot':
        return (
          <label className="block">
            <span className={labelCls}>{e.field.shot}</span>
            <select value={b.id} disabled={!canWrite} onChange={(ev) => set({ t: 'shot', id: ev.target.value as ShotId })} className={input}>
              {SHOT_IDS.map((s) => (
                <option key={s} value={s}>
                  {m.shots[s]}
                </option>
              ))}
            </select>
          </label>
        )
    }
  }

  const move = (i: number, by: -1 | 1) =>
    setItems((items) => {
      const j = i + by
      if (j < 0 || j >= items.length) return items
      const next = [...items]
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      return next
    })

  const iconBtn = 'inline-flex h-[28px] min-w-[28px] items-center justify-center rounded-[8px] border border-line bg-sf px-[7px] text-[12px] font-semibold text-ink hover:border-ink disabled:opacity-40'

  // the design's order: Content, Translations, SEO, Versions, Settings
  const tabs = [
    ['content', e.tabs.content],
    ['translations', e.tabs.translations],
    ['seo', e.tabs.seo],
    ['history', e.tabs.history],
    ['settings', e.tabs.settings],
  ] as const

  const hasSignup = page.layout === 'landing' || page.layout === 'splash'

  return (
    <div className="flex flex-col gap-[14px]">
      {/* ---------------------------------------------------------------- the bar, as the design's page detail draws it */}
      <div className="flex flex-wrap items-end justify-between gap-[14px] md:px-[18px]">
        <div className="min-w-0">
          <nav aria-label={e.back} className="flex items-center gap-[8px] text-[12.5px]">
            <Link href={'/admin/cms' as Route} className="text-ink no-underline hover:text-ink hover:underline">
              {e.back}
            </Link>
            <span aria-hidden="true" className="text-mut">→</span>
            <b className="truncate">{doc.h1 || doc.title || page.slug}</b>
          </nav>
          <h1 className="m-0 mt-[8px] font-display text-[28px] font-medium leading-[1.15]">{doc.h1 || doc.title || page.slug}</h1>
          <p className="m-0 mt-[8px] flex flex-wrap items-center gap-[8px] text-[12.5px] text-mut">
            <span className="inline-flex items-center gap-[6px] rounded-pill bg-sbg px-[11px] py-[5px] text-[11.5px] font-bold text-ink">
              <span aria-hidden="true" className={`block h-[6px] w-[6px] rounded-pill ${state === 'live' ? 'bg-teal' : state === 'archived' ? 'bg-mut' : 'bg-ac'}`} />
              {m.state[state as keyof typeof m.state] ?? state}
            </span>
            <span>
              {hosts[locale]}
              {path}
            </span>
            <span aria-hidden="true">·</span>
            <span>{templateName}</span>
            <span aria-hidden="true">·</span>
            <span>{m.layout[page.layout]}</span>
            {row?.live_at ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{fill(e.published, { at: when[`${locale}:live`] ?? '' })}</span>
              </>
            ) : null}
          </p>
        </div>
        {canWrite ? (
          <div className="flex flex-wrap items-center gap-[10px]">
            <span role="status" className={`text-[12px] font-semibold ${dirty ? 'text-caution' : 'text-mut'}`}>
              {busy ? e.saving : dirty ? e.unsaved : notice}
            </span>
            {previewUrl ? (
              <a href={previewUrl} target="_blank" rel="noopener" className={BTN.secondary}>
                {e.preview.title}
              </a>
            ) : null}
            {row?.current ? (
              <button
                type="button"
                disabled={busy}
                className={`${BTN.secondary} border-ink`}
                onClick={() => {
                  if (window.confirm(fill(e.unpublishConfirm, { language: m.language[locale] }))) run(() => cmsUnpublish({ id: page.id, locale }))
                }}
              >
                {e.unpublish}
              </button>
            ) : null}
            <button type="button" className={BTN.secondary} disabled={busy || !dirty || page.archived} onClick={() => startBusy(async () => void (await save()))}>
              {e.save}
            </button>
            <button type="button" className={BTN.primary} disabled={busy || page.archived} onClick={() => publish(null)}>
              {busy ? e.publishing : e.publish}
            </button>
            <details className="relative">
              <summary className={`${BTN.secondary} list-none [&::-webkit-details-marker]:hidden`}>{e.schedule} ▾</summary>
              <div className="absolute right-0 z-20 mt-[6px] w-[280px] rounded-panel border border-line bg-sf p-[14px] shadow-[0_12px_30px_rgba(25,21,16,0.12)]">
                <label className="block">
                  <span className={labelCls}>{e.scheduleAt}</span>
                  <input type="datetime-local" value={scheduleAt} onChange={(ev) => setScheduleAt(ev.target.value)} className={input} />
                </label>
                <span className={hintCls}>{e.scheduleHint}</span>
                <Button size="sm" className="mt-[10px]" disabled={busy || !scheduleAt || page.archived} onClick={() => publish(new Date(scheduleAt).toISOString())}>
                  {e.scheduleSubmit}
                </Button>
              </div>
            </details>
          </div>
        ) : null}
      </div>

      {problem ? (
        <p role="alert" className="m-0 rounded-panel border border-line bg-peach px-[16px] py-[10px] text-[13px] font-semibold text-dangerdeep">
          {problem}
        </p>
      ) : null}

      {/* ---------------------------------------------------------------- the languages */}
      <div className="flex flex-wrap items-center gap-[8px]" role="tablist" aria-label={m.table.languages}>
        {page.locales.map((l) => {
          const st = page.archived ? 'archived' : l.pending_at && new Date(l.pending_at) > new Date() ? 'scheduled' : l.current ? (l.changed ? 'changed' : 'live') : 'draft'
          return (
            <button
              key={l.locale}
              type="button"
              role="tab"
              aria-selected={l.locale === locale}
              onClick={() => setLocale(l.locale)}
              className={`inline-flex h-[36px] items-center gap-[8px] rounded-pill border px-[12px] text-[12.5px] font-bold ${l.locale === locale ? 'border-ink bg-sf' : 'border-line bg-bg text-mut'}`}
            >
              {m.language[l.locale]}
              <StateChip lang={l.locale} state={st} label={m.state[st]} />
              {dirtyLocales.includes(l.locale) ? <span className="block h-[7px] w-[7px] rounded-full bg-amberbar" aria-label={e.unsaved} /> : null}
            </button>
          )
        })}
        {canWrite
          ? missing.map((l) => (
              <button
                key={l}
                type="button"
                disabled={busy || page.archived}
                title={fill(e.addLanguageHint, { from: m.language[l === 'no' ? 'en' : 'no'] })}
                onClick={() =>
                  run(
                    () => cmsTranslate({ id: page.id, locale: l }),
                    () => setLocale(l),
                  )
                }
                className="inline-flex h-[36px] items-center rounded-pill border border-dashed border-rule px-[12px] text-[12.5px] font-bold text-link disabled:opacity-50"
              >
                + {fill(e.addLanguage, { language: m.language[l] })}
              </button>
            ))
          : null}
        <span className="ml-auto text-[12px] text-mut">{fill((m.stateLong as Record<string, string>)[state] ?? '', { at: when[`${locale}:pending`] ?? '' })}</span>
      </div>

      <div className="grid items-start gap-[16px] [grid-template-columns:minmax(0,1fr)] xl:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
        {/* ---------------------------------------------------------------- the words */}
        <div className="min-w-0 rounded-panel border border-line bg-sf">
          <div role="tablist" aria-label={e.tabs.content} className="flex flex-wrap gap-[4px] border-b border-line px-[12px] py-[10px]">
            {tabs.map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                id={`cms-tab-${k}`}
                aria-selected={tab === k}
                aria-controls={`cms-panel-${k}`}
                onClick={() => setTab(k)}
                className={`inline-flex items-center gap-[7px] rounded-ctl px-[13px] py-[7px] text-[13.5px] ${tab === k ? 'bg-sbg font-bold text-ink' : 'font-medium text-ink hover:bg-ink/5'}`}
              >
                {label}
                {k === 'seo' ? <span className="text-[11px] font-bold text-mut">{score.score}</span> : null}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`cms-panel-${tab}`} aria-labelledby={`cms-tab-${tab}`} className="flex flex-col gap-[18px] px-[18px] py-[18px]">
            {tab === 'content' ? (
              <>
                {left.length ? (
                  <p className="m-0 rounded-ctl bg-sbg px-[12px] py-[9px] text-[12.5px] font-semibold text-cautiondeep">{fill(e.placeholdersLeft, { list: left.slice(0, 6).join(', ') + (left.length > 6 ? ' …' : '') })}</p>
                ) : null}

                <section className="flex flex-col gap-[12px]">
                  <h2 className="m-0 text-[14px] font-bold">{e.hero}</h2>
                  {text('kicker', e.field.kicker, { max: 80 })}
                  {text('h1', e.field.h1, { max: 150 })}
                  {text('lead', e.field.lead, { max: 600, rows: 3 })}
                  {hasSignup ? text('signupLabel', e.field.signupLabel, { max: 80, hint: e.field.signupHint }) : null}
                </section>

                <section className="flex flex-col gap-[10px]">
                  <h2 className="m-0 text-[14px] font-bold">{e.sections}</h2>
                  {doc.items.length === 0 ? <p className="m-0 text-[12.5px] text-mut">{e.sectionsEmpty}</p> : null}
                  <ol className="m-0 flex list-none flex-col gap-[10px] p-0">
                    {doc.items.map((it, i) => (
                      <li key={it.uid} className={`rounded-ctl border bg-bg px-[12px] py-[10px] ${empties.includes(it.uid) ? 'border-caution' : 'border-line'}`}>
                        <div className="mb-[8px] flex items-center gap-[9px]">
                          <BlockThumb t={it.b.t} />
                          <span className="text-[12.5px] font-bold">{e.block[it.b.t]}</span>
                          {canWrite ? (
                            <span className="ml-auto flex gap-[4px]">
                              <button type="button" className={iconBtn} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${e.moveUp}: ${e.block[it.b.t]}`}>
                                ↑
                              </button>
                              <button type="button" className={iconBtn} disabled={i === doc.items.length - 1} onClick={() => move(i, 1)} aria-label={`${e.moveDown}: ${e.block[it.b.t]}`}>
                                ↓
                              </button>
                              <button type="button" className={iconBtn} onClick={() => setItems((items) => items.filter((x) => x.uid !== it.uid))} aria-label={`${e.remove}: ${e.block[it.b.t]}`}>
                                ✕
                              </button>
                            </span>
                          ) : null}
                        </div>
                        <div className="flex flex-col gap-[8px]">{blockFields(it, i)}</div>
                        {empties.includes(it.uid) ? <span className="mt-[6px] block text-[11.5px] font-semibold text-caution">{e.emptyBlock}</span> : null}
                      </li>
                    ))}
                  </ol>
                  {canWrite ? (
                    <div className="rounded-ctl border border-dashed border-rule px-[12px] py-[10px]">
                      <span className="mb-[8px] block text-[12px] font-bold">{e.addSection}</span>
                      <div className="grid gap-[6px] [grid-template-columns:repeat(auto-fill,minmax(118px,1fr))]">
                        {PALETTE.map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setItems((items) => [...items, { uid: uid(), b: EMPTY[t], raw: rawOf(EMPTY[t]) }])}
                            className="flex items-center gap-[8px] rounded-[10px] border border-line bg-sf px-[7px] py-[6px] text-left text-[12px] font-semibold hover:border-ink"
                          >
                            <BlockThumb t={t} />
                            {e.block[t]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>

                <section className="flex flex-col gap-[10px]">
                  <h2 className="m-0 text-[14px] font-bold">{e.faq}</h2>
                  <p className="m-0 text-[12px] leading-[1.5] text-mut">{e.faqHint}</p>
                  {doc.faq.map((f, i) => (
                    <div key={f.uid} className="flex flex-col gap-[6px] rounded-ctl border border-line bg-bg px-[12px] py-[10px]">
                      <label className="block">
                        <span className={`${labelCls} flex items-center justify-between`}>
                          <span>
                            {e.field.question} {i + 1}
                          </span>
                          {canWrite ? (
                            <button type="button" className={iconBtn} onClick={() => setDoc({ faq: doc.faq.filter((x) => x.uid !== f.uid) })} aria-label={`${e.remove}: ${e.field.question} ${i + 1}`}>
                              ✕
                            </button>
                          ) : null}
                        </span>
                        <input value={f.q} maxLength={300} readOnly={!canWrite} onChange={(ev) => setDoc({ faq: doc.faq.map((x) => (x.uid === f.uid ? { ...x, q: ev.target.value } : x)) })} className={input} />
                      </label>
                      <label className="block">
                        <span className={labelCls}>{e.field.answer}</span>
                        <textarea value={f.a} maxLength={2000} rows={3} readOnly={!canWrite} onChange={(ev) => setDoc({ faq: doc.faq.map((x) => (x.uid === f.uid ? { ...x, a: ev.target.value } : x)) })} className={area} />
                      </label>
                    </div>
                  ))}
                  {canWrite && doc.faq.length < 30 ? (
                    <button type="button" onClick={() => setDoc({ faq: [...doc.faq, { uid: uid(), q: '', a: '' }] })} className="self-start text-[12.5px] font-bold text-link">
                      + {e.faqAdd}
                    </button>
                  ) : null}
                </section>

                {page.layout !== 'document' ? (
                  <section className="flex flex-col gap-[10px]">
                    <h2 className="m-0 text-[14px] font-bold">{e.closing}</h2>
                    <p className="m-0 text-[12px] text-mut">{e.closingHint}</p>
                    {text('finalTitle', e.field.finalTitle, { max: 200 })}
                    {text('finalBody', e.field.finalBody, { max: 600, rows: 2 })}
                  </section>
                ) : null}

                {page.layout === 'article' ? (
                  <section className="flex flex-col gap-[8px]">
                    <h2 className="m-0 text-[14px] font-bold">{e.sources}</h2>
                    {text('sources', e.sources, { max: 12000, rows: 3, hint: e.sourcesHint })}
                  </section>
                ) : null}
              </>
            ) : null}

            {tab === 'seo' ? (
              <>
                <div className="flex items-center gap-[16px]">
                  <ScoreRing score={score.score} label={e.seo.score} />
                  <div>
                    <h2 className="m-0 text-[15px] font-bold">{e.seo.score}</h2>
                    <p className="m-0 mt-[4px] text-[12px] leading-[1.5] text-mut">{e.seo.scoreHint}</p>
                  </div>
                </div>
                <SeoChecklist checks={score.checks} text={checkText} />

                <div className="flex flex-col gap-[6px]">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-mut">{e.seo.snippet}</span>
                  <SerpPreview host={hosts[locale]} path={pathOf(page.kind, meta.slug || page.slug)} title={doc.title} description={doc.description} empty="—" />
                </div>

                {text('title', e.seo.title, { max: 90, range: TITLE_RANGE })}
                {text('description', e.seo.description, { max: 220, rows: 3, range: DESCRIPTION_RANGE })}
                {text('crumb', e.seo.crumb, { max: 60 })}
                <label className="block">
                  <span className={labelCls}>{e.seo.keyword}</span>
                  <input value={meta.keyword} maxLength={80} readOnly={!canWrite} onChange={(ev) => setMeta({ ...meta, keyword: ev.target.value })} className={input} />
                </label>
                <label className="block">
                  <span className={labelCls}>{e.seo.slug}</span>
                  <span className="flex items-center gap-[6px]">
                    <span className="whitespace-nowrap font-mono text-[12.5px] text-mut">{page.kind === 'article' ? '/artikler/' : '/'}</span>
                    <input
                      value={meta.slug}
                      maxLength={80}
                      readOnly={!canWrite}
                      onChange={(ev) => setMeta({ ...meta, slug: ev.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-') })}
                      className={`${input} font-mono`}
                    />
                  </span>
                  {page.locales.some((l) => l.live_at) ? <span className={hintCls}>{e.seo.slugLive}</span> : null}
                </label>
                <label className="flex items-start gap-[9px] text-[13px]">
                  <input type="checkbox" checked={meta.noindex} disabled={!canWrite} onChange={(ev) => setMeta({ ...meta, noindex: ev.target.checked })} className="mt-[3px]" />
                  <span>
                    <span className="block font-semibold">{e.seo.noindex}</span>
                    <span className={hintCls}>{e.seo.noindexHint}</span>
                  </span>
                </label>

                <div className="flex flex-col gap-[6px]">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-mut">{e.seo.social}</span>
                  <SocialCard host={hosts[locale]} title={doc.title || '—'} description={doc.description} image="/og.png" />
                </div>

                <div>
                  <h2 className="m-0 mb-[8px] text-[14px] font-bold">{fill(e.seo.traffic, { days })}</h2>
                  {traffic ? (
                    <dl className="m-0 grid grid-cols-4 gap-[8px]">
                      {(
                        [
                          [m.table.views, traffic.views],
                          [m.table.visitors, traffic.visitors],
                          [m.table.cta, traffic.cta],
                          [m.table.signups, traffic.signups],
                        ] as const
                      ).map(([k, v]) => (
                        <div key={k} className="rounded-ctl border border-line bg-bg px-[10px] py-[8px]">
                          <dt className="text-[10.5px] uppercase tracking-[0.06em] text-mut">{k}</dt>
                          <dd className="m-0 mt-[3px] font-display text-[20px] font-semibold">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="m-0 text-[12.5px] text-mut">{e.seo.trafficNone}</p>
                  )}
                </div>
              </>
            ) : null}

            {tab === 'settings' ? (
              <>
                <div>
                  <span className={labelCls}>{e.settings.template}</span>
                  <span className="text-[13px]">
                    {templateName} · {m.layout[page.layout]}
                  </span>
                </div>
                {page.layout === 'landing' || page.layout === 'splash' ? (
                  <label className="block">
                    <span className={labelCls}>{e.settings.shot}</span>
                    <select value={meta.shot} disabled={!canWrite} onChange={(ev) => setMeta({ ...meta, shot: ev.target.value as ShotId | '' })} className={input}>
                      <option value="">{e.settings.shotNone}</option>
                      {SHOT_IDS.map((s) => (
                        <option key={s} value={s}>
                          {m.shots[s]}
                        </option>
                      ))}
                    </select>
                    <span className={hintCls}>{e.settings.shotHint}</span>
                  </label>
                ) : null}
                <label className="block">
                  <span className={labelCls}>
                    {e.settings.translation} · {m.language[locale]}
                  </span>
                  <select value={doc.translation} disabled={!canWrite} onChange={(ev) => setDoc({ translation: ev.target.value as Doc['translation'] })} className={input}>
                    {(['source', 'draft', 'reviewed'] as const).map((s) => (
                      <option key={s} value={s}>
                        {e.translation[s]}
                      </option>
                    ))}
                  </select>
                  <span className={hintCls}>{e.settings.translationHint}</span>
                </label>
                {canWrite ? (
                  <div className="flex flex-wrap gap-[8px] border-t border-line pt-[14px]">
                    {row?.current ? (
                      <Button
                        size="sm"
                        tone="secondary"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(fill(e.unpublishConfirm, { language: m.language[locale] }))) run(() => cmsUnpublish({ id: page.id, locale }))
                        }}
                      >
                        {e.unpublish}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      tone="secondary"
                      disabled={busy}
                      onClick={() => {
                        if (page.archived || window.confirm(e.archiveConfirm)) run(() => cmsArchive({ id: page.id, archived: !page.archived }))
                      }}
                    >
                      {page.archived ? e.unarchive : e.archive}
                    </Button>
                  </div>
                ) : null}
              </>
            ) : null}

            {tab === 'translations' ? (
              <>
                <p className="m-0 text-[12.5px] leading-[1.5] text-mut">{e.translationsLead}</p>
                <ul className="m-0 flex list-none flex-col p-0">
                  {page.locales.map((l) => {
                    const st = page.archived ? 'archived' : l.pending_at && new Date(l.pending_at) > new Date() ? 'scheduled' : l.current ? (l.changed ? 'changed' : 'live') : 'draft'
                    return (
                      <li key={l.locale} className="flex flex-wrap items-center gap-[10px] border-b border-line py-[10px] text-[13px]">
                        <b className="min-w-[90px]">{m.language[l.locale]}</b>
                        <StateChip lang={l.locale} state={st} label={m.state[st]} />
                        <span className="flex-1 text-[12.5px] text-mut">{(e.translation as Record<string, string>)[l.translation] ?? l.translation}</span>
                        <button type="button" className={BTN.row} onClick={() => { setLocale(l.locale); setTab('content') }}>
                          {e.editLanguage}
                        </button>
                      </li>
                    )
                  })}
                  {canWrite
                    ? missing.map((l) => (
                        <li key={l} className="flex flex-wrap items-center gap-[10px] border-b border-line py-[10px] text-[13px]">
                          <b className="min-w-[90px]">{m.language[l]}</b>
                          <span className="flex-1 text-[12.5px] text-mut">{fill(e.addLanguageHint, { from: m.language[l === 'no' ? 'en' : 'no'] })}</span>
                          <button
                            type="button"
                            className={BTN.row}
                            disabled={busy || page.archived}
                            onClick={() => run(() => cmsTranslate({ id: page.id, locale: l }), () => setLocale(l))}
                          >
                            + {fill(e.addLanguage, { language: m.language[l] })}
                          </button>
                        </li>
                      ))
                    : null}
                </ul>
              </>
            ) : null}

            {tab === 'history' ? (
              <>
                <p className="m-0 text-[12.5px] leading-[1.5] text-mut">{e.history.lead}</p>
                {revisions.length === 0 ? <p className="m-0 text-[13px] text-mut">{e.history.empty}</p> : null}
                <ol className="m-0 flex list-none flex-col p-0">
                  {revisions.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-[10px] border-b border-line py-[8px] text-[12.5px]">
                      <span className="w-[130px] flex-none text-mut">{when[`rev:${r.id}`]}</span>
                      <span className="w-[26px] flex-none font-bold uppercase">{r.locale}</span>
                      <span className="w-[86px] flex-none font-semibold">{e.action[r.action]}</span>
                      <span className="min-w-0 flex-1 truncate">{r.title ?? '—'}</span>
                      <span className="text-mut">{r.by ?? ''}</span>
                      {canWrite && r.action !== 'unpublish' ? (
                        <button
                          type="button"
                          className={iconBtn}
                          disabled={busy || page.archived}
                          onClick={() => {
                            if (!window.confirm(fill(e.history.restoreConfirm, { language: m.language[r.locale] }))) return
                            run(
                              () => cmsRestore({ revision: r.id }),
                              () => {
                                reread.current.add(r.locale)
                                setLocale(r.locale)
                              },
                            )
                          }}
                        >
                          {e.history.restore}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </>
            ) : null}
          </div>
        </div>

        {/* ---------------------------------------------------------------- the page itself */}
        <div className="min-w-0 xl:sticky xl:top-[16px]">
          <div className="mb-[8px] flex flex-wrap items-center gap-[6px]">
            <span className="mr-auto text-[13px] font-bold">{e.preview.title}</span>
            {(['desktop', 'phone'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`inline-flex h-[30px] items-center rounded-pill border px-[11px] text-[12px] font-semibold ${view === v ? 'border-ink bg-ink text-bg' : 'border-line bg-sf text-ink'}`}
              >
                {e.preview[v]}
              </button>
            ))}
            <button type="button" onClick={() => setNonce((n) => n + 1)} className="inline-flex h-[30px] items-center rounded-pill border border-line bg-sf px-[11px] text-[12px] font-semibold">
              {e.preview.refresh}
            </button>
            {previewUrl ? (
              <a href={previewUrl} target="_blank" rel="noopener" className="inline-flex h-[30px] items-center rounded-pill border border-line bg-sf px-[11px] text-[12px] font-semibold text-ink">
                {e.preview.open} ↗
              </a>
            ) : null}
            {row?.current ? (
              <a href={liveHref} target="_blank" rel="noopener" className="inline-flex h-[30px] items-center text-[12px] font-semibold text-link">
                {e.openLive} ↗
              </a>
            ) : null}
          </div>
          {previewFailed ? (
            <p className="m-0 rounded-ctl border border-line bg-bg px-[14px] py-[12px] text-[12.5px] text-danger">{e.preview.failed}</p>
          ) : previewUrl ? (
            view === 'desktop' ? (
              <Scaled src={previewUrl} title={`${e.preview.title} · ${e.preview.desktop}`} width={1280} height={680} />
            ) : (
              <div className="mx-auto w-[410px] max-w-full rounded-[34px] border-[10px] border-ink bg-ink">
                <Scaled src={previewUrl} title={`${e.preview.title} · ${e.preview.phone}`} width={390} height={640} round />
              </div>
            )
          ) : (
            <div className="h-[680px] rounded-ctl border border-line bg-bg" aria-busy="true" />
          )}
          <p className="mb-0 mt-[8px] text-[11.5px] leading-[1.5] text-mut">{e.preview.note}</p>
        </div>
      </div>
    </div>
  )
}

/** The public page in a frame at its real width, scaled down to the column: what a reader's screen shows */
function Scaled({ src, title, width, height, round = false }: { src: string; title: string; width: number; height: number; round?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => setScale(Math.min(1, el.clientWidth / width))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [width])
  return (
    <div ref={box} className={`overflow-hidden bg-bg ${round ? 'rounded-[24px]' : 'rounded-ctl border border-line'}`} style={{ height }}>
      <iframe title={title} src={src} className="block origin-top-left border-0" style={{ width, height: height / scale, transform: `scale(${scale})` }} />
    </div>
  )
}
