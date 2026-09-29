'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { slugify, type Layout } from '@/lib/cms/content'
import { cmsCreate, cmsRedirectDelete, cmsRedirectSave } from '@/lib/admin/cmsActions'
import type { AdminResult } from '@/lib/admin/actions'
import type { CmsMessages } from './CmsEditor'
import { LayoutThumb } from './CmsVisuals'
import { Outcome } from './ActionForms'

const field = 'box-border w-full rounded-ctl border border-line bg-bg px-[12px] text-[13.5px] text-ink outline-none focus-visible:border-ink'
const input = `${field} h-[38px]`
const labelCls = 'mb-[5px] block text-[12px] font-semibold'
const hintCls = 'mt-[4px] block text-[11.5px] leading-[1.45] text-mut'

export type TemplateCard = { key: string; name: string; description: string; kind: 'page' | 'article'; layout: Layout }

/**
 * A new page (X-094): the templates as a gallery, each drawn as the layout it gives the page, then
 * the address and the search it should answer. The address follows the working title until it is
 * edited by hand.
 */
export function CmsCreateForm({ templates, chosen, m }: { templates: TemplateCard[]; chosen: string | null; m: CmsMessages }) {
  const c = m.create
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(cmsCreate, null)
  const [template, setTemplate] = useState(chosen && templates.some((t) => t.key === chosen) ? chosen : (templates[0]?.key ?? ''))
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [own, setOwn] = useState(false)
  const t = templates.find((x) => x.key === template)
  return (
    <form action={action} className="flex flex-col gap-[18px]">
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-[10px] text-[14px] font-bold">{c.template}</legend>
        <div className="grid gap-[12px] [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
          {templates.map((x) => (
            <label
              key={x.key}
              className={`flex cursor-pointer flex-col gap-[9px] rounded-panel border-2 bg-sf p-[12px] has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
                template === x.key ? 'border-ink' : 'border-line hover:border-rule'
              }`}
            >
              <input type="radio" name="template" value={x.key} checked={template === x.key} onChange={() => setTemplate(x.key)} className="sr-only" />
              <LayoutThumb layout={x.layout} />
              <span className="flex items-center justify-between gap-[8px]">
                <span className="text-[13.5px] font-bold">{x.name}</span>
                <span className="rounded-pill bg-track px-[8px] py-[2px] text-[10.5px] font-bold uppercase tracking-[0.06em] text-mut">{m.layout[x.layout]}</span>
              </span>
              <span className="text-[12px] leading-[1.5] text-mut">{x.description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-[14px] [grid-template-columns:minmax(0,1fr)] md:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
        <label className="block">
          <span className={labelCls}>{c.name}</span>
          <input
            value={name}
            maxLength={120}
            onChange={(ev) => {
              setName(ev.target.value)
              if (!own) setSlug(slugify(ev.target.value))
            }}
            className={input}
          />
          <span className={hintCls}>{c.nameHint}</span>
        </label>
        <label className="block">
          <span className={labelCls}>{c.slug}</span>
          <span className="flex items-center gap-[6px]">
            <span className="whitespace-nowrap font-mono text-[12.5px] text-mut">{t?.kind === 'article' ? '/artikler/' : '/'}</span>
            <input
              name="slug"
              required
              value={slug}
              maxLength={80}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              onChange={(ev) => {
                setOwn(true)
                setSlug(ev.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-'))
              }}
              className={`${input} font-mono`}
            />
          </span>
          <span className={hintCls}>{c.slugHint}</span>
        </label>
        <label className="block">
          <span className={labelCls}>{c.keyword}</span>
          <input name="focus_keyword" maxLength={80} className={input} />
          <span className={hintCls}>{c.keywordHint}</span>
        </label>
        <fieldset className="m-0 border-0 p-0">
          <legend className={labelCls}>{c.languages}</legend>
          <span className="flex gap-[14px] text-[13px]">
            <label className="flex items-center gap-[6px]">
              <input type="checkbox" name="locales" value="no" defaultChecked /> {m.language.no}
            </label>
            <label className="flex items-center gap-[6px]">
              <input type="checkbox" name="locales" value="en" /> {m.language.en}
            </label>
          </span>
          <span className={hintCls}>{c.languagesHint}</span>
        </fieldset>
      </div>

      <span className="flex flex-wrap items-center gap-[12px]">
        <Button type="submit" size="sm" disabled={pending || !template || !slug}>
          {pending ? c.creating : c.submit}
        </Button>
        <Outcome state={state} problems={m.problem} done="" />
      </span>
    </form>
  )
}

/** A redirect from an old address, 301 or 302 */
export function RedirectAddForm({ m }: { m: CmsMessages }) {
  const r = m.redirects
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(cmsRedirectSave, null)
  return (
    <form action={action} className="grid items-end gap-[12px] [grid-template-columns:minmax(0,1fr)] md:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)_180px_auto]">
      <label className="block">
        <span className={labelCls}>{r.from}</span>
        <input name="from" required maxLength={200} placeholder="/…" className={`${input} font-mono`} />
        <span className={hintCls}>{r.fromHint}</span>
      </label>
      <label className="block">
        <span className={labelCls}>{r.to}</span>
        <input name="to" required maxLength={500} placeholder="/…" className={`${input} font-mono`} />
        <span className={hintCls}>{r.toHint}</span>
      </label>
      <label className="block">
        <span className={labelCls}>{r.type}</span>
        <select name="permanent" defaultValue="1" className={input}>
          <option value="1">{r.permanent}</option>
          <option value="0">{r.temporary}</option>
        </select>
        <span className={hintCls}>&nbsp;</span>
      </label>
      <span className="flex flex-col gap-[6px] pb-[20px]">
        <Button type="submit" size="sm" disabled={pending}>
          {r.add}
        </Button>
      </span>
      <span className="md:col-span-4">
        <Outcome state={state} problems={m.problem} done={m.editor.saved} />
      </span>
    </form>
  )
}

export function RedirectDeleteForm({ from, m }: { from: string; m: CmsMessages }) {
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(cmsRedirectDelete, null)
  return (
    <form action={action} className="flex items-center gap-[8px]">
      <input type="hidden" name="from" value={from} />
      <Button type="submit" size="tiny" tone="secondary" disabled={pending} aria-label={`${m.redirects.delete}: ${from}`}>
        {m.redirects.delete}
      </Button>
      {state && !state.ok ? <Outcome state={state} problems={m.problem} done="" /> : null}
    </form>
  )
}
