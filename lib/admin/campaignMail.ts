import 'server-only'
import en from '@/messages/en.json'
import no from '@/messages/no.json'
import { effectiveMessages } from '@/lib/i18n/overrides'
import { checkCampaign, type Check } from '@/lib/crm/deliverability'
import { renderCampaign, type MailCatalogue, type Rendered } from '@/supabase/functions/_shared/mail'
import { isError } from './api'
import { crmCampaign, crmLists, crmSenders, type Campaign, type Sender } from './crm'
import { domainChecks, domainOf } from './mailDomain'

/**
 * A campaign as its readers will get it (X-092): drawn by the module the dispatcher sends with,
 * with the mail texts as they stand today (the files and their approved overrides, as the
 * dispatcher reads them), for a sample recipient and a token that unsubscribes nobody. The
 * campaign page, the template gallery and the schedule action all draw it here, so the preview,
 * the inbox check and what is sent cannot drift apart.
 */
export const SITE = 'https://www.orgpuls.com'
export const SAMPLE = { name: 'Kari Nordmann', company: 'Eksempel AS' }

export async function mailCatalogue(): Promise<MailCatalogue> {
  const m = await effectiveMessages(no.mail, en.mail)
  return { no: m.no, en: m.en } as unknown as MailCatalogue
}

type Drawable = Pick<Campaign, 'kind' | 'style' | 'lang' | 'subject' | 'preheader' | 'blocks' | 'utm_campaign' | 'signature'> & {
  list_id?: string | null
  publish_web?: boolean
  slug?: string | null
}

export function drawCampaign(
  cat: MailCatalogue,
  c: Drawable,
  opts: { sender?: Sender | null; list?: { name_no: string; name_en: string } | null; subject?: string } = {},
): Rendered {
  return renderCampaign(
    cat,
    {
      id: 'preview',
      kind: 'campaign',
      to_email: '',
      token: '0'.repeat(64),
      name: SAMPLE.name,
      company: SAMPLE.company,
      basis: c.style === 'letter' && !c.list_id ? 'business' : 'consent',
      lang: c.lang,
      campaign: {
        kind: c.kind,
        style: c.style,
        // as the dispatcher signs it (0093): the campaign's own signature, else its sender's
        signature: c.signature.trim() || opts.sender?.signature || '',
        subject: opts.subject ?? c.subject,
        preheader: c.preheader,
        blocks: c.blocks,
        utm_campaign: c.utm_campaign,
        web_slug: c.publish_web ? (c.slug ?? null) : null,
        list: opts.list ?? null,
      },
    },
    SITE,
  )
}

/** The footer's sender line in the campaign's language, as sent */
export const footerOf = (cat: MailCatalogue, lang: string) => {
  const crm = (cat[lang === 'en' ? 'en' : 'no'] as { crm?: { sender?: unknown } }).crm
  return typeof crm?.sender === 'string' ? crm.sender : ''
}

/**
 * The domain a campaign is sent from: its sender's, else any sender's (all are on the one
 * marketing domain the dispatcher accepts), else the dispatcher's own marketing address when
 * this deployment knows it.
 */
export function sendingDomain(c: { sender_id: string | null }, senders: Sender[]): string | null {
  const own = senders.find((s) => s.id === c.sender_id)
  return domainOf(own?.email ?? senders.find((s) => !s.archived)?.email ?? process.env.ORGPULS_MARKETING_FROM ?? null)
}

/** Every check for one campaign: content, size, footer, and the sending domain */
export async function inboxCheck(
  cat: MailCatalogue,
  c: Campaign,
  senders: Sender[],
  list: { name_no: string; name_en: string } | null,
): Promise<{ checks: Check[]; html: string }> {
  const sender = senders.find((s) => s.id === c.sender_id) ?? null
  const r = drawCampaign(cat, c, { sender, list })
  const checks = [
    ...checkCampaign({
      style: c.style,
      subject: c.subject,
      subjectB: c.subject_b,
      preheader: c.preheader,
      blocks: c.blocks,
      html: r.html,
      footer: footerOf(cat, c.lang),
    }),
    ...(await domainChecks(sendingDomain(c, senders))),
  ]
  return { checks, html: r.html }
}

/** For the schedule action: the checks that stop this campaign, or null when it cannot be read */
export async function blockingChecks(id: string): Promise<Check[] | null> {
  const [data, senders, lists, cat] = await Promise.all([crmCampaign(id), crmSenders(), crmLists(), mailCatalogue()])
  if (isError(data)) return null
  const c = data.campaign
  const list = isError(lists) ? null : (lists.rows.find((l) => l.id === c.list_id) ?? null)
  const { checks } = await inboxCheck(cat, c, isError(senders) ? [] : senders.rows, list)
  return checks.filter((x) => x.level === 'fail')
}
