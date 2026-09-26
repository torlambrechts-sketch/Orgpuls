/**
 * The mails Orgpuls sends, rendered from the `mail.*` messages. D-65.
 *
 * Pure on purpose: no imports, no Deno or Node globals. The two edge functions import it,
 * and `tests/unit/mail.test.ts` runs it under Vitest against messages/no.json and en.json,
 * so what the tests prove is what production sends.
 *
 * What a mail may carry is narrow, and the narrowness is the point:
 *   - no respondent free text, ever (CLAUDE.md invariant 7), and no result figure;
 *   - a respondent link only in the one mail addressed to that respondent;
 *   - a link into the app only for someone who can sign in to follow it.
 * Every value that came from the database is HTML-escaped before it is placed in markup.
 */

export type Lang = 'no' | 'en'
/** The `mail` subtree of one language's messages. */
export type MailMessages = Record<string, unknown>
export type MailCatalogue = Record<Lang, MailMessages>

export interface Rendered {
  subject: string
  text: string
  html: string
}

export interface NoticeRound {
  kind: string
  year: number
  pulse: number | null
  opens_at: string | null
  closes_at: string | null
}

/** One claimed outbox row, as `public.dispatch_claim` returns it. */
export interface NoticeJob {
  id: string
  kind: 'forvarsel' | 'invitasjon' | 'paminnelse' | 'resultat'
  audience: string | null
  /** the channel the database chose for the link (0033); role notices are always e-mail */
  channel: 'email' | 'sms'
  /** the organisation's own SMS text, or null for the default */
  sms_text: string | null
  lang: string
  org: string
  k: number
  round: NoticeRound
  recipients: Recipient[]
  token: string | null
}

export interface Recipient {
  /** null for a person reached only by SMS */
  email: string | null
  /** present only when SMS may carry this person's link (0033) */
  phone: string | null
  name: string | null
  lang: string | null
  member: boolean
}

export type AuthAction = 'recovery' | 'signup' | 'magiclink' | 'invite'
export const AUTH_ACTIONS: readonly AuthAction[] = ['recovery', 'signup', 'magiclink', 'invite']

// ---------------------------------------------------------------------------------------

export const langOf = (v: string | null | undefined): Lang => (v === 'en' ? 'en' : 'no')

/**
 * The same rule as `app.reserved_address` (0032): a reserved test domain (RFC 2606) is
 * never mailed. Kept here for the Auth hook, whose recipients never pass through SQL.
 */
export function isReservedAddress(email: string | null | undefined): boolean {
  if (!email) return true
  const domain = email.trim().toLowerCase().split('@')[1] ?? ''
  return /(^|\.)(example|test|invalid|localhost)$/.test(domain) || ['example.com', 'example.net', 'example.org'].includes(domain)
}

/** A message by dotted path. Missing is an error: a mail must never go out with a key in it. */
export function pick(m: MailMessages, path: string): string {
  let o: unknown = m
  for (const k of path.split('.')) o = o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined
  if (typeof o !== 'string') throw new Error(`mail message missing: ${path}`)
  return o
}

/** `{name}` placeholders only; the mail strings carry no plural forms. */
export function fill(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (all, k: string) => (k in vars ? String(vars[k]) : all))
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** "12. oktober" / "12 October", in the organisation's own zone. */
export function dateOf(iso: string | null, lang: Lang): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'nb-NO', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Oslo',
  }).format(new Date(iso))
}

/** "grunnlinjen 2026", "puls 2 · 2027" — lower case, for the middle of a sentence. */
export function roundName(m: MailMessages, r: NoticeRound): string {
  if (r.kind === 'puls' && r.pulse) return fill(pick(m, 'round.pulsN'), { n: r.pulse, year: r.year })
  const key = ['grunnlinje', 'puls', 'oppfolging'].includes(r.kind) ? r.kind : 'grunnlinje'
  return fill(pick(m, `round.${key}`), { year: r.year })
}

// ---------------------------------------------------------------------------------------
// Layout: plain text first, and HTML that is the same words in the product's colours.
// ---------------------------------------------------------------------------------------

interface Parts {
  lang: Lang
  greeting: string
  paragraphs: string[]
  /**
   * The mail's one link. `plain` writes it as text rather than as a link: Brevo rewrites every
   * <a href> in transactional mail through its click-tracking redirect, and cannot be told not
   * to, so a link that carries a token (a respondent's, a sign-in's) would pass through, and be
   * logged by, the provider with the recipient's address. As text it is not rewritten; the
   * recipient's mail program makes it clickable itself. D-97.
   */
  cta: { label: string; url: string; plain?: boolean } | null
  after: string[]
  footer: string
}

function layout(p: Parts): { text: string; html: string } {
  const text = [
    p.greeting,
    ...p.paragraphs,
    ...(p.cta ? [`${p.cta.label}: ${p.cta.url}`] : []),
    ...p.after,
    '—',
    p.footer,
  ].join('\n\n')

  // pre-line: a ticket reply's own line breaks (a signature) survive; notices have none
  const para = (s: string, style = 'margin:0 0 14px;font-size:15px;line-height:1.6;color:#191510;white-space:pre-line') =>
    `<p style="${style}">${escapeHtml(s)}</p>`

  const button = p.cta?.plain
    ? `<p style="margin:22px 0 6px;font-size:13.5px;font-weight:700;color:#191510">${escapeHtml(p.cta.label)}</p><p style="margin:0 0 22px;padding:12px 14px;border:1px solid #191510;border-radius:12px;background:#F5C64A;font-size:14px;font-weight:700;line-height:1.45;color:#191510;word-break:break-all">${escapeHtml(p.cta.url)}</p>`
    : p.cta
    ? `<p style="margin:22px 0 22px"><a href="${escapeHtml(p.cta.url)}" style="display:inline-block;padding:12px 20px;border-radius:12px;border:1px solid #191510;background:#F5C64A;color:#191510;font-size:15px;font-weight:700;text-decoration:none">${escapeHtml(p.cta.label)}</a></p>`
    : ''

  const html = `<!doctype html>
<html lang="${p.lang === 'en' ? 'en' : 'nb'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FCF6E9;font-family:'DM Sans',Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:28px 16px">
<div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:600;color:#191510;margin:0 0 16px">Orgpuls</div>
<div style="background:#FFFDF6;border:1px solid #E8DFC9;border-radius:20px;padding:26px 24px">
${para(p.greeting)}
${p.paragraphs.map((s) => para(s)).join('\n')}
${button}
${p.after.map((s) => para(s, 'margin:0 0 10px;font-size:13.5px;line-height:1.6;color:#5F5849')).join('\n')}
</div>
<p style="margin:16px 4px 0;font-size:12px;line-height:1.55;color:#5F5849">${escapeHtml(p.footer)}</p>
</div></body></html>`

  return { text, html }
}

// ---------------------------------------------------------------------------------------
// The four notices the year wheel queues.
// ---------------------------------------------------------------------------------------

/**
 * One notice for a group of recipients who read the same words: the same language, and
 * the same answer to "can they sign in". An invitation or a reminder is always a group of
 * one, since it carries that person's own link.
 */
export function renderNotice(
  cat: MailCatalogue,
  job: NoticeJob,
  group: { lang: Lang; member: boolean; name: string | null },
  appUrl: string,
): Rendered {
  const m = cat[group.lang]
  const round = roundName(m, job.round)
  const org = job.org
  const greeting = group.name ? fill(pick(m, 'greeting'), { name: group.name }) : pick(m, 'greetingPlain')
  const footer = fill(pick(m, 'automatic'), { org })
  const base = appUrl.replace(/\/+$/, '')

  if (job.kind === 'invitasjon' || job.kind === 'paminnelse') {
    if (!job.token) throw new Error(`${job.kind} without a link`)
    const link = `${base}/s/${job.token}`
    const reminder = job.kind === 'paminnelse'
    const paragraphs = [
      cap(fill(pick(m, reminder ? 'paminnelse.lead' : 'invitasjon.lead'), { org, round })),
      fill(pick(m, 'invitasjon.anonymous'), { k: job.k }),
    ]
    const after = [
      ...(job.round.closes_at ? [fill(pick(m, 'invitasjon.deadline'), { date: dateOf(job.round.closes_at, group.lang) })] : []),
      ...(reminder ? [pick(m, 'paminnelse.replaces')] : []),
      pick(m, 'invitasjon.personal'),
    ]
    const subject = cap(fill(pick(m, reminder ? 'paminnelse.subject' : 'invitasjon.subject'), { org, round }))
    return { subject, ...layout({ lang: group.lang, greeting, paragraphs, cta: { label: pick(m, 'invitasjon.cta'), url: link, plain: true }, after, footer }) }
  }

  if (job.kind === 'forvarsel') {
    const date = dateOf(job.round.opens_at, group.lang)
    const audience = job.audience ?? 'alle_ansatte'
    const paragraphs = [cap(fill(pick(m, 'forvarsel.lead'), { org, round, date })), pick(m, `forvarsel.${audience}`)]
    const cta = group.member ? { label: pick(m, 'forvarsel.cta'), url: `${base}/malinger` } : null
    const subject = cap(fill(pick(m, 'forvarsel.subject'), { org, round, date }))
    return { subject, ...layout({ lang: group.lang, greeting, paragraphs, cta, after: [], footer }) }
  }

  // resultat
  const paragraphs = [
    cap(fill(pick(m, 'resultat.lead'), { org, round })),
    pick(m, group.member ? 'resultat.member' : 'resultat.employee'),
  ]
  const cta = group.member ? { label: pick(m, 'resultat.cta'), url: `${base}/resultat` } : null
  const subject = cap(fill(pick(m, 'resultat.subject'), { org, round }))
  return { subject, ...layout({ lang: group.lang, greeting, paragraphs, cta, after: [], footer }) }
}

/** Recipients of one job, grouped by what they will read. */
export function groupsOf(job: NoticeJob): Array<{ lang: Lang; member: boolean; name: string | null; to: Recipient[] }> {
  const personal = job.kind === 'invitasjon' || job.kind === 'paminnelse'
  if (personal) {
    return job.recipients.map((r) => ({ lang: langOf(r.lang ?? job.lang), member: r.member, name: r.name, to: [r] }))
  }
  const byKey = new Map<string, { lang: Lang; member: boolean; name: null; to: Recipient[] }>()
  for (const r of job.recipients) {
    const lang = langOf(r.lang ?? job.lang)
    const key = `${lang}:${r.member}`
    const g = byKey.get(key) ?? { lang, member: r.member, name: null, to: [] }
    g.to.push(r)
    byKey.set(key, g)
  }
  return [...byKey.values()]
}

// ---------------------------------------------------------------------------------------
// Auth's own mails, through the send-email hook.
// ---------------------------------------------------------------------------------------

export function renderAuth(cat: MailCatalogue, action: AuthAction, lang: Lang, email: string, link: string): Rendered {
  const m = cat[lang]
  const p = `auth.${action}`
  return {
    subject: pick(m, `${p}.subject`),
    ...layout({
      lang,
      greeting: pick(m, 'greetingPlain'),
      paragraphs: [fill(pick(m, `${p}.lead`), { email })],
      cta: { label: pick(m, `${p}.cta`), url: link, plain: true },
      after: [pick(m, `${p}.ignore`)],
      footer: 'Orgpuls · orgpuls.com',
    }),
  }
}

/**
 * The SMS for an invitation or a reminder, before its link: the organisation's own text for
 * an invitation (the default when it has none), and for a reminder a fixed text that says
 * the previous link no longer works — a reminder mints a new one (0032, rule 2).
 */
export function smsLead(cat: MailCatalogue, job: NoticeJob, lang: Lang): string {
  const m = cat[lang]
  const round = roundName(m, job.round)
  if (job.kind === 'paminnelse') {
    return fill(pick(m, 'sms.reminder'), { org: job.org, round, date: dateOf(job.round.closes_at, lang) })
  }
  return job.sms_text?.trim() ? job.sms_text : fill(pick(m, 'sms.default'), { org: job.org })
}

/** The app route that turns an Auth token hash into a session (app/auth/confirm/route.ts). */
export function authLink(appUrl: string, action: AuthAction, tokenHash: string): string {
  // verifyOtp's own names: a sign-up confirmation and a magic link are both "email"
  const type = action === 'recovery' ? 'recovery' : action === 'invite' ? 'invite' : 'email'
  const next = action === 'recovery' ? '/nytt-passord' : '/innsikt'
  const q = new URLSearchParams({ token_hash: tokenHash, type, next })
  return `${appUrl.replace(/\/+$/, '')}/auth/confirm?${q.toString()}`
}

// ---------------------------------------------------------------------------------------
// A reply to a support ticket (D-92). The admin writes the whole message, greeting and
// signature included; this lays it out in the product's mail and adds the case number.
// ---------------------------------------------------------------------------------------

export interface TicketJob {
  id: string
  to_email: string
  to_name: string | null
  subject: string
  number: number
  body: string
}

export function renderTicketReply(cat: MailCatalogue, job: TicketJob, lang: Lang = 'no'): Rendered {
  const m = cat[lang]
  const paragraphs = job.body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  const { text, html } = layout({
    lang,
    greeting: paragraphs[0] ?? '',
    paragraphs: paragraphs.slice(1),
    cta: null,
    after: [fill(pick(m, 'ticket.replyHint'), { number: job.number })],
    footer: pick(m, 'ticket.footer'),
  })
  return { subject: job.subject, text, html }
}

// ---------------------------------------------------------------------------------------
// Marketing (0055, D-101): a campaign written in the admin, and the newsletter's
// confirmation. Both go out on the marketing sender, never the product's.
// ---------------------------------------------------------------------------------------

export type CampaignBlock = { type: 'heading' | 'text' | 'button'; text: string; url?: string }

export interface CrmJob {
  id: string
  kind: 'campaign' | 'test' | 'optin'
  to_email: string
  token: string
  name: string | null
  lang: string | null
  campaign: { kind: string; subject: string; preheader: string; blocks: CampaignBlock[]; utm_campaign: string } | null
}

const OWN_HOSTS = /(^|\.)orgpuls\.(com|no)$/

/**
 * A link to Orgpuls' own site carries the campaign's utm tags, so the site's analytics
 * (0050) can count the visits and signups it brought. Tags already on the link are kept;
 * links elsewhere are left as written.
 */
export function withUtm(url: string, utmCampaign: string): string {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return url
  }
  if (u.protocol !== 'https:' || !OWN_HOSTS.test(u.hostname)) return url
  const set = (k: string, v: string) => {
    if (!u.searchParams.has(k)) u.searchParams.set(k, v)
  }
  set('utm_source', 'orgpuls')
  set('utm_medium', 'email')
  set('utm_campaign', utmCampaign)
  return u.toString()
}

export const unsubscribeUrl = (siteUrl: string, token: string) => `${siteUrl.replace(/\/+$/, '')}/avmeld?t=${token}`
export const unsubscribeApi = (siteUrl: string, token: string) => `${siteUrl.replace(/\/+$/, '')}/api/avmeld?t=${token}`
export const confirmUrl = (siteUrl: string, token: string) => `${siteUrl.replace(/\/+$/, '')}/nyhetsbrev?t=${token}`

export function renderCampaign(cat: MailCatalogue, job: CrmJob, siteUrl: string): Rendered {
  const lang = langOf(job.lang)
  const m = cat[lang]
  const c = job.campaign
  if (!c) throw new Error('campaign job without a campaign')
  const unsub = unsubscribeUrl(siteUrl, job.token)
  const subject = job.kind === 'test' ? `${pick(m, 'crm.test')} ${c.subject}` : c.subject

  const text: string[] = []
  const html: string[] = []
  for (const b of c.blocks) {
    if (b.type === 'heading') {
      text.push(b.text.toUpperCase())
      html.push(`<h2 style="margin:6px 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:21px;font-weight:600;line-height:1.3;color:#191510">${escapeHtml(b.text)}</h2>`)
    } else if (b.type === 'text') {
      for (const p of b.text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)) {
        text.push(p)
        html.push(`<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#191510;white-space:pre-line">${escapeHtml(p)}</p>`)
      }
    } else if (b.type === 'button' && b.url) {
      const href = withUtm(b.url, c.utm_campaign)
      text.push(`${b.text}: ${href}`)
      html.push(`<p style="margin:20px 0 20px"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 20px;border-radius:12px;border:1px solid #191510;background:#F5C64A;color:#191510;font-size:15px;font-weight:700;text-decoration:none">${escapeHtml(b.text)}</a></p>`)
    }
  }
  const why = pick(m, 'crm.why')
  const sender = pick(m, 'crm.sender')
  const textOut = [...text, '—', why, fill(pick(m, 'crm.unsubscribeText'), { url: unsub }), sender].join('\n\n')
  // the preheader is the line mail programs show after the subject; hidden in the body
  const pre = c.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(c.preheader)}</div>`
    : ''
  const htmlOut = `<!doctype html>
<html lang="${lang === 'en' ? 'en' : 'nb'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#FCF6E9;font-family:'DM Sans',Arial,Helvetica,sans-serif">
${pre}
<div style="max-width:560px;margin:0 auto;padding:28px 16px">
<div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:600;color:#191510;margin:0 0 16px">Orgpuls</div>
<div style="background:#FFFDF6;border:1px solid #E8DFC9;border-radius:20px;padding:26px 24px">
${html.join('\n')}
</div>
<p style="margin:16px 4px 0;font-size:12px;line-height:1.55;color:#5F5849">${escapeHtml(why)} <a href="${escapeHtml(unsub)}" style="color:#5F5849">${escapeHtml(pick(m, 'crm.unsubscribe'))}</a>.</p>
<p style="margin:6px 4px 0;font-size:12px;line-height:1.55;color:#5F5849">${escapeHtml(sender)}</p>
</div></body></html>`
  return { subject, text: textOut, html: htmlOut }
}

/** The double opt-in. The link carries the token, so it is written as text (D-97). */
export function renderOptin(cat: MailCatalogue, job: CrmJob, siteUrl: string): Rendered {
  const lang = langOf(job.lang)
  const m = cat[lang]
  const { text, html } = layout({
    lang,
    greeting: job.name ? fill(pick(m, 'greeting'), { name: job.name }) : pick(m, 'greetingPlain'),
    paragraphs: [pick(m, 'optin.lead')],
    cta: { label: pick(m, 'optin.cta'), url: confirmUrl(siteUrl, job.token), plain: true },
    after: [pick(m, 'optin.ignore')],
    footer: pick(m, 'optin.footer'),
  })
  return { subject: pick(m, 'optin.subject'), text, html }
}
