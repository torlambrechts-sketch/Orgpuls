import { getTranslations } from 'next-intl/server'
import type { CrmMessages } from '@/components/admin/CrmForms'
import { TemplateStart } from '@/components/admin/CrmPipelineForms'
import { CrmTabs } from '@/components/admin/CrmTabs'
import { Badge, Card, PageHead, Problem } from '@/components/admin/ui'
import en from '@/messages/en.json'
import no from '@/messages/no.json'
import { isError, whoami } from '@/lib/admin/api'
import { crmTemplates } from '@/lib/admin/crm'
import { renderCampaign, type MailCatalogue } from '@/supabase/functions/_shared/mail'

/**
 * Templates (D-103): the six seeded starting points, each shown as the mail it renders,
 * drawn by the module the dispatcher sends with, for a sample recipient.
 */
const SITE = 'https://www.orgpuls.com'

export default async function CrmTemplates() {
  const t = await getTranslations({ locale: 'en', namespace: 'admin' })
  const m = t.raw('crm') as CrmMessages
  const [data, who] = await Promise.all([crmTemplates(), whoami()])
  if (isError(data)) return <Problem text={data.error === 'not_allowed' ? t('common.notAllowed') : t('common.failed')} />
  const canWrite = who?.role === 'super_admin' || who?.role === 'marketing'
  const cat = { no: no.mail, en: en.mail } as unknown as MailCatalogue

  return (
    <>
      <PageHead title={m.templates.title} lead={m.templates.lead} />
      <CrmTabs current="templates" labels={m.tabs} />
      <div className="grid items-start gap-[14px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
        {data.rows.map((tpl) => {
          const r = renderCampaign(
            cat,
            {
              id: 'preview',
              kind: 'campaign',
              to_email: '',
              token: '0'.repeat(64),
              name: 'Kari Nordmann',
              company: 'Eksempel AS',
              basis: tpl.style === 'letter' ? 'business' : 'consent',
              lang: 'no',
              campaign: { kind: tpl.kind, style: tpl.style, subject: tpl.subject, preheader: tpl.preheader, blocks: tpl.blocks, utm_campaign: tpl.key },
            },
            SITE,
          )
          return (
            <Card key={tpl.key} title={tpl.name} aside={<Badge>{m.templates.styleName[tpl.style]}</Badge>}>
              <p className="mb-[8px] mt-0 text-[12.5px] leading-[1.5] text-mut">{tpl.description}</p>
              <p className="mb-[10px] mt-0 text-[13px]">
                <span className="font-semibold">{r.subject}</span>
                {tpl.preheader ? <span className="text-mut"> — {tpl.preheader}</span> : null}
              </p>
              <iframe
                title={`${m.campaign.preview} · ${tpl.name}`}
                srcDoc={r.html}
                sandbox=""
                loading="lazy"
                className="h-[460px] w-full rounded-ctl border border-line bg-bg"
              />
              {canWrite ? (
                <div className="mt-[10px]">
                  <TemplateStart m={m} template={tpl.key} name={tpl.name} />
                </div>
              ) : null}
            </Card>
          )
        })}
      </div>
    </>
  )
}
