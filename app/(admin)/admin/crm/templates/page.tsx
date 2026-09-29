import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { MailPreview } from '@/components/admin/CampaignStudio'
import type { CrmMessages } from '@/components/admin/CrmForms'
import { TemplateStart } from '@/components/admin/CrmPipelineForms'
import { Badge, PageHead, Problem } from '@/components/admin/ui'
import { isError, whoami } from '@/lib/admin/api'
import { drawCampaign, mailCatalogue } from '@/lib/admin/campaignMail'
import { crmTemplates, TEMPLATE_CATEGORIES } from '@/lib/admin/crm'
import { PLACEHOLDER } from '@/lib/crm/deliverability'

/**
 * The template gallery (D-103, X-092): every designed starting point, grouped by what it is for,
 * each drawn as the mail it renders — by the module the dispatcher sends with — for a sample
 * reader. A template that needs facts only the author has says so, and cannot be sent until they
 * are filled in.
 */
export default async function CrmTemplates({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('crm') as CrmMessages
  const g = m.studio.gallery
  const [data, who, cat] = await Promise.all([crmTemplates(), whoami(), mailCatalogue()])
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  const current = TEMPLATE_CATEGORIES.find((c) => c === category) ?? null
  const rows = data.rows.filter((r) => !current || r.category === current)
  const present = TEMPLATE_CATEGORIES.filter((c) => data.rows.some((r) => r.category === c))
  const chip = (key: string | null, text: string, n: number) => (
    <Link
      key={key ?? 'all'}
      href={(key ? `/admin/crm/templates?category=${key}` : '/admin/crm/templates') as Route}
      aria-current={current === key ? 'page' : undefined}
      className={`inline-flex h-[32px] items-center gap-[6px] rounded-pill border px-[12px] text-[12.5px] font-semibold no-underline ${
        current === key ? 'border-ink bg-ink text-bg hover:text-bg' : 'border-line bg-sf text-ink hover:border-ink hover:text-ink'
      }`}
    >
      {text}
      <span className={current === key ? 'text-bg/70' : 'text-mut'}>{n}</span>
    </Link>
  )

  return (
    <>
      <PageHead title={m.templates.title} lead={m.templates.lead} />
      <nav aria-label={m.templates.title} className="mb-[14px] flex flex-wrap gap-[6px]">
        {chip(null, g.all, data.rows.length)}
        {present.map((c) => chip(c, g.category[c], data.rows.filter((r) => r.category === c).length))}
      </nav>
      <p className="mb-[14px] mt-0 text-[12.5px] text-mut">{g.placeholders}</p>
      <div className="grid items-start gap-[14px] [grid-template-columns:repeat(auto-fill,minmax(min(100%,440px),1fr))]">
        {rows.map((tpl) => {
          const r = drawCampaign(cat, { ...tpl, lang: 'no', utm_campaign: tpl.key, signature: '' })
          const needs = [tpl.subject, tpl.preheader, ...tpl.blocks.map((b) => [b.title, b.text, b.label].join(' '))].some((s) => PLACEHOLDER.test(s))
          return (
            <article key={tpl.key} className="flex min-w-0 flex-col rounded-card border border-line bg-sf p-[16px]">
              <header className="mb-[8px] flex flex-wrap items-start justify-between gap-[8px]">
                <h2 className="m-0 font-display text-[19px] font-semibold leading-[1.25]">{tpl.name}</h2>
                <span className="flex flex-wrap gap-[4px]">
                  <Badge>{g.category[tpl.category]}</Badge>
                  <Badge tone={tpl.style === 'letter' ? 'green' : 'yellow'}>{m.templates.styleName[tpl.style]}</Badge>
                </span>
              </header>
              <p className="mb-[10px] mt-0 text-[12.5px] leading-[1.5] text-mut">{tpl.description}</p>
              <MailPreview html={r.html} subject={r.subject} preheader={tpl.preheader} from="Orgpuls" m={m} compact />
              <p className="mb-0 mt-[8px] text-[12px] text-mut">
                {g.blocks.replace('{count}', String(tpl.blocks.length))}
                {needs ? ` · ${m.problem.placeholder_left}` : ''}
              </p>
              {canWrite ? (
                <div className="mt-[10px] border-t border-line pt-[10px]">
                  <TemplateStart m={m} template={tpl.key} name={tpl.name} />
                </div>
              ) : null}
            </article>
          )
        })}
      </div>
    </>
  )
}
