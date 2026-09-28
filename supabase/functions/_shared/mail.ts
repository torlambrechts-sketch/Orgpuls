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

/** Bokmål and English are the platform's; the rest are survey languages whose texts come from the registry (D-133) */
export type Lang = 'no' | 'en' | 'pl' | 'uk' | 'lt' | 'sv' | 'da'
/** The `mail` subtree of one language's messages. */
export type MailMessages = Record<string, unknown>
export type MailCatalogue = Record<'no' | 'en', MailMessages> & Partial<Record<Lang, MailMessages>>

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
  kind:
    | 'forvarsel'
    | 'invitasjon'
    | 'paminnelse'
    | 'siste_paminnelse'
    | 'lenke'
    | 'resultat'
    | 'tiltak_forfalt'
    | 'svarprosent'
    | 'evaluering'
  audience: string | null
  /** the channel the database chose for the link (0033); role notices are always e-mail */
  channel: 'email' | 'sms'
  /** the organisation's own SMS text, or null for the default */
  sms_text: string | null
  lang: string
  org: string
  k: number
  /** null for a measure's notice (0099), which belongs to no round */
  round: NoticeRound | null
  recipients: Recipient[]
  token: string | null
  /** for a personal message, the survey's language state (0080): items missing, UI hashes approved, and whether the organisation pilots it (0085) */
  locales?: Record<string, { missing: number; ui: string[]; pilot?: boolean; auto?: boolean }> | null
  /** an invitation's length in minutes, from what the round asks (0099, P1-1) */
  minutes?: number | null
  /** everyone is told the results: the ladder has an «alle ansatte» row (0097, 0099) */
  results_shared?: boolean | null
  /** the daglig leder's own greeting, and their name (0099) */
  greeting?: { text: string; by: string | null } | null
  /** a tiltak_forfalt's measures: a leader's titles and their dates (0099) */
  measures?: { title: string; due: string | null }[] | null
  /** the round's page for employees, /r/<slug> (0100, P1-3): a results notice's own round, an invitation's last shared one */
  results_page?: string | null
  /** an evaluation reminder's facts (0103, 0104; A-02): the cadence, the last one, when it fell due */
  evaluation?: { cadence: string | null; last_on: string | null; due_on: string | null } | null
  /** the organisation's logo by its address, /logo/<key> (0104, D-154), for the head of the mail */
  logo?: string | null
  /**
   * «Siden sist» for an invitation's e-mail (0105, engagement phase 2): the whole organisation's
   * measures since the last grunnlinje, titles with people's names masked. The dispatcher drops it
   * unless `engagement_since_last` is on; an SMS never carries it (D-128).
   */
  since?: { first: true } | { first: false; since: string; items: { title: string; status: 'gjennomfort' | 'pagar' }[]; done: number } | null
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

/**
 * A language's mail texts with the bokmål or English overrides approved in admin › Translations
 * (0101, D-152) laid over them: `flat` is public.message_overrides, keyed by the message's full
 * path; only `mail.*` strings the catalogue has are replaced, never a branch, never a new key.
 */
export function withMailOverrides(tree: MailMessages, flat: Record<string, unknown>): MailMessages {
  const keys = Object.keys(flat).filter((k) => k.startsWith('mail.') && typeof flat[k] === 'string')
  if (!keys.length) return tree
  const out = structuredClone(tree) as Record<string, unknown>
  for (const k of keys) {
    const parts = k.slice('mail.'.length).split('.')
    let node: unknown = out
    for (const p of parts.slice(0, -1)) node = node && typeof node === 'object' ? (node as Record<string, unknown>)[p] : undefined
    const last = parts.at(-1)!
    if (node && typeof node === 'object' && typeof (node as Record<string, unknown>)[last] === 'string') (node as Record<string, unknown>)[last] = flat[k]
  }
  return out
}

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
export function pick(m: MailMessages | undefined, path: string): string {
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
const DATE_LOCALE: Record<Lang, string> = { no: 'nb-NO', en: 'en-GB', pl: 'pl-PL', uk: 'uk-UA', lt: 'lt-LT', sv: 'sv-SE', da: 'da-DK' }

export function dateOf(iso: string | null, lang: Lang): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat(DATE_LOCALE[lang] ?? 'nb-NO', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Oslo',
  }).format(new Date(iso))
}

/** "grunnlinjen 2026", "puls 2 · 2027" — lower case, for the middle of a sentence. */
export function roundName(m: MailMessages | undefined, r: NoticeRound): string {
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
  /** the document's title — the subject — so a mail opened as a page names itself */
  title?: string
  /** the organisation's logo and name, in place of the Orgpuls wordmark (0104, D-154) */
  brand?: { src: string; name: string } | null
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
<html lang="${p.lang === 'en' ? 'en' : 'nb'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(p.title ?? 'Orgpuls')}</title></head>
<body style="margin:0;padding:0;background:#FCF6E9;font-family:'DM Sans',Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:28px 16px">
${
  p.brand
    ? `<div style="margin:0 0 16px"><img src="${escapeHtml(p.brand.src)}" alt="${escapeHtml(p.brand.name)}" height="40" style="display:block;height:40px;width:auto;max-width:200px;border:0"></div>`
    : `<div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:600;color:#191510;margin:0 0 16px">Orgpuls</div>`
}
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
 * The languages a personal message may be in (engagement P1.3, D-127): the respondent page's own
 * rule (lib/i18n/offered.ts), with the flags this function runs with and the hashes of the page
 * strings it was deployed with. A language the organisation pilots (0085) counts as flagged for
 * its messages. `null` when no language is on either way: then the message is in the
 * organisation's language, as before. Only a language with mail texts can be offered.
 */
export type LanguageOffer = {
  flags: ReadonlySet<string> | '*'
  /** the approved page-string hash per platform language (lib/i18n/respondent-ui.json) */
  hashes: Record<string, string>
  /** a survey language's page strings are all approved and current (survey-texts.ts complete) */
  uiReady?: Record<string, boolean>
}

export function offeredFor(cat: MailCatalogue, job: NoticeJob, offer: LanguageOffer | null): Lang[] | null {
  if (!offer) return null
  const on = (l: string) => offer.flags === '*' || offer.flags.has(`locale_${l}`) || job.locales?.[l]?.pilot === true
  // every language this build has mail texts for, besides bokmål (the catalogue is the registry's)
  const others = Object.keys(cat).filter((l) => l !== 'no')
  if (!others.some(on)) return null
  const ready = others.filter((l) => {
    const s = job.locales?.[l]
    const hash = offer.hashes[l]
    // auto-approve on (0101): this build's page strings count as approved, as on the survey page
    const ui = (hash !== undefined && (s?.auto === true || s?.ui.includes(hash))) || offer.uiReady?.[l] === true
    return on(l) && l in cat && s !== undefined && s.missing === 0 && ui
  })
  return ['no', ...(ready as Lang[])]
}

/**
 * The language one person reads their own message in. Without a language flag, the
 * organisation's, as before. With one: theirs where offered, then the organisation's where
 * offered, then bokmål — the order the survey page opens in (lib/i18n/offered.ts chooseLocale),
 * so an English organisation's employee with no language set keeps English mail.
 */
export function personalLang(job: NoticeJob, r: Recipient, offered: Lang[] | null): Lang {
  const org = langOf(job.lang)
  if (!offered) return org
  const own = r.lang === 'en' || r.lang === 'no' ? r.lang : null
  if (own && offered.includes(own)) return own
  return offered.includes(org) ? org : 'no'
}

/**
 * One person's link. It carries no `?lang=`: the survey page opens in the employee's own language
 * by the same rule the message was written by, so the suffix would only cost an SMS its eight
 * characters — an English final reminder from a long organisation name would take two (D-128).
 */
export function personalLink(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, '')}/s/${token}`
}

/** The kinds that carry one person's own link: a group of one, and a token minted for it. */
export function isPersonal(kind: NoticeJob['kind']): boolean {
  return kind === 'invitasjon' || kind === 'paminnelse' || kind === 'siste_paminnelse' || kind === 'lenke'
}

/** The round's page for employees (0100): only a slug the database made reaches a mail */
function pageLink(base: string, slug: string): string {
  if (!/^[A-Za-z0-9_-]{16}$/.test(slug)) throw new Error('results page without a valid link')
  return `${base}/r/${slug}`
}

/** «Siden sist» in an invitation (0105): a lead with the count finished, and the items, one a line */
function sinceBlock(m: MailMessages | undefined, since: NoticeJob['since']): string[] {
  if (!since || since.first || since.items.length === 0) return []
  const masked = (t: string) =>
    t.replace(/⟦([nas])⟧/g, (_, k: string) => `[${pick(m, `invitasjon.masked.${k}`)}]`)
  const lead =
    since.done === 0
      ? pick(m, 'invitasjon.sinceLead')
      : since.done === 1
        ? pick(m, 'invitasjon.sinceOne')
        : fill(pick(m, 'invitasjon.sinceMany'), { n: since.done })
  const items = since.items.map((i) =>
    fill(pick(m, 'invitasjon.sinceItem'), {
      title: masked(i.title),
      status: pick(m, i.status === 'gjennomfort' ? 'invitasjon.sinceDone' : 'invitasjon.sinceOngoing'),
    }),
  )
  return [`${lead}\n${items.join('\n')}`]
}

/** The organisation's logo (0104): only a key the database made reaches a mail */
function logoLink(base: string, key: string | null | undefined): string | null {
  return key && /^[0-9a-f]{32}$/.test(key) ? `${base}/logo/${key}` : null
}

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
  const org = job.org
  const greeting = group.name ? fill(pick(m, 'greeting'), { name: group.name }) : pick(m, 'greetingPlain')
  const footer = fill(pick(m, 'automatic'), { org })
  const base = appUrl.replace(/\/+$/, '')
  // the organisation's own logo at the head, where it has one (0104, D-154)
  const logo = logoLink(base, job.logo)
  const brand = logo ? { src: logo, name: org } : null

  // a measure past its date (0099, P1-5): to its owner, or to the verneombud as a copy
  if (job.kind === 'tiltak_forfalt') {
    const items = (job.measures ?? []).map((x) =>
      x.due ? fill(pick(m, 'tiltak.item'), { title: x.title, date: dateOf(x.due, group.lang) }) : fill(pick(m, 'tiltak.itemNoDate'), { title: x.title }),
    )
    const lead = job.audience === 'verneombud' ? fill(pick(m, 'tiltak.verneombud'), { org }) : pick(m, 'tiltak.owner')
    const subject = fill(pick(m, 'tiltak.subject'), { org })
    const cta = group.member ? { label: pick(m, 'tiltak.cta'), url: `${base}/tiltak` } : null
    return {
      subject,
      ...layout({ brand, title: subject, lang: group.lang, greeting, paragraphs: [lead, items.map((i) => `– ${i}`).join('\n')], cta, after: [pick(m, group.member ? 'tiltak.member' : 'tiltak.employee')], footer }),
    }
  }

  // the ordning is due for evaluation (aml. § 9-2 tredje ledd; 0103, A-02): to the daglig leder
  if (job.kind === 'evaluering') {
    const ev = job.evaluation ?? null
    const subject = fill(pick(m, 'evaluering.subject'), { org })
    const paragraphs = [
      ev?.due_on ? fill(pick(m, 'evaluering.lead'), { date: dateOf(ev.due_on, group.lang) }) : pick(m, 'evaluering.leadNoDate'),
      ev?.last_on ? fill(pick(m, 'evaluering.last'), { date: dateOf(ev.last_on, group.lang) }) : pick(m, 'evaluering.none'),
      pick(m, 'evaluering.what'),
    ]
    const cta = group.member ? { label: pick(m, 'evaluering.cta'), url: `${base}/rapport` } : null
    return { subject, ...layout({ brand, title: subject, lang: group.lang, greeting, paragraphs, cta, after: [], footer }) }
  }

  if (!job.round) throw new Error(`${job.kind} without a round`)
  const round = roundName(m, job.round)

  // a department lagging behind in an open round (0099, P1-6): no department and no figure in the mail
  if (job.kind === 'svarprosent') {
    const subject = cap(fill(pick(m, 'svarprosent.subject'), { org, round }))
    return {
      subject,
      ...layout({
        brand,
        title: subject, lang: group.lang, greeting,
        paragraphs: [cap(fill(pick(m, 'svarprosent.lead'), { round })), pick(m, 'svarprosent.what')],
        cta: group.member ? { label: pick(m, 'svarprosent.cta'), url: `${base}/malinger` } : null,
        after: [], footer,
      }),
    }
  }

  if (isPersonal(job.kind)) {
    if (!job.token) throw new Error(`${job.kind} without a link`)
    const link = personalLink(base, job.token)
    // the reminder texts, the second reminder's own lead, and the link a person asked for (0076)
    const reminder = job.kind === 'paminnelse' || job.kind === 'siste_paminnelse'
    const own = job.kind === 'invitasjon' ? 'invitasjon' : job.kind === 'lenke' ? 'lenke' : job.kind === 'paminnelse' ? 'paminnelse' : 'sistePaminnelse'
    // 0099 (P1-1): the invitation says how long it takes, carries the leader's greeting, and
    // promises the results where everyone is told them
    const invite = job.kind === 'invitasjon'
    const paragraphs = [
      cap(fill(pick(m, `${own}.lead`), { org, round })) + (invite && job.minutes ? ` ${fill(pick(m, 'invitasjon.minutes'), { minutes: job.minutes })}` : ''),
      ...(invite && job.greeting?.text
        ? [`«${job.greeting.text}»${job.greeting.by ? `\n${fill(pick(m, 'invitasjon.greetingBy'), { name: job.greeting.by })}` : ''}`]
        : []),
      fill(pick(m, 'invitasjon.anonymous'), { k: job.k }),
      ...(invite && job.channel === 'email' ? sinceBlock(m, job.since) : []),
      ...(invite && job.results_shared ? [pick(m, 'invitasjon.results')] : []),
      // 0100 (P1-3): what the last round showed and what is being done, before this one is asked
      ...(invite && job.results_page ? [`${pick(m, 'invitasjon.lastPage')} ${pageLink(base, job.results_page)}`] : []),
    ]
    const after = [
      ...(job.round.closes_at ? [fill(pick(m, 'invitasjon.deadline'), { date: dateOf(job.round.closes_at, group.lang) })] : []),
      ...(reminder || job.kind === 'lenke' ? [pick(m, 'paminnelse.replaces')] : []),
      pick(m, 'invitasjon.personal'),
    ]
    const subject = cap(fill(pick(m, `${own}.subject`), { org, round }))
    return { subject, ...layout({ brand, title: subject, lang: group.lang, greeting, paragraphs, cta: { label: pick(m, 'invitasjon.cta'), url: link, plain: true }, after, footer }) }
  }

  if (job.kind === 'forvarsel') {
    const date = dateOf(job.round.opens_at, group.lang)
    const audience = job.audience ?? 'alle_ansatte'
    const paragraphs = [cap(fill(pick(m, 'forvarsel.lead'), { org, round, date })), pick(m, `forvarsel.${audience}`)]
    const cta = group.member ? { label: pick(m, 'forvarsel.cta'), url: `${base}/malinger` } : null
    const subject = cap(fill(pick(m, 'forvarsel.subject'), { org, round, date }))
    return { subject, ...layout({ brand, title: subject, lang: group.lang, greeting, paragraphs, cta, after: [], footer }) }
  }

  // resultat: a leader reads it in Orgpuls; everyone else on the round's page, where it is shown (0100)
  const page = job.results_page ? pageLink(base, job.results_page) : null
  const paragraphs = [
    cap(fill(pick(m, 'resultat.lead'), { org, round })),
    pick(m, group.member ? 'resultat.member' : 'resultat.employee'),
    ...(page ? [group.member ? pick(m, 'resultat.memberPage') : pick(m, 'resultat.page')] : []),
  ]
  const cta = group.member
    ? { label: pick(m, 'resultat.cta'), url: `${base}/resultat` }
    : page
      ? { label: pick(m, 'resultat.pageCta'), url: page }
      : null
  const subject = cap(fill(pick(m, 'resultat.subject'), { org, round }))
  return { subject, ...layout({ brand, title: subject, lang: group.lang, greeting, paragraphs, cta, after: [], footer }) }
}

/** Recipients of one job, grouped by what they will read. */
export function groupsOf(
  job: NoticeJob,
  offered: Lang[] | null = null,
): Array<{ lang: Lang; member: boolean; name: string | null; to: Recipient[] }> {
  if (isPersonal(job.kind)) {
    return job.recipients.map((r) => ({ lang: personalLang(job, r, offered), member: r.member, name: r.name, to: [r] }))
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
 *
 * The organisation's own text is written in the organisation's language, so it goes only to
 * those who get the invitation in that language; anyone else gets the approved default in
 * their own (D-127).
 */
export function smsLead(cat: MailCatalogue, job: NoticeJob, lang: Lang): string {
  const m = cat[lang]
  if (!job.round) throw new Error(`${job.kind} without a round`)
  const round = roundName(m, job.round)
  if (job.kind === 'paminnelse' || job.kind === 'siste_paminnelse') {
    const key = job.kind === 'paminnelse' ? 'sms.reminder' : 'sms.lastReminder'
    return fill(pick(m, key), { org: job.org, round, date: dateOf(job.round.closes_at, lang) })
  }
  if (job.kind === 'lenke') return fill(pick(m, 'sms.link'), { org: job.org })
  return job.sms_text?.trim() && lang === langOf(job.lang) ? job.sms_text : fill(pick(m, 'sms.default'), { org: job.org })
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
// The trial's mail (0060, D-105): service mail to the daglig leder, sent when a step becomes
// true. One thing to do and one button each; replies go to support, and the footer says so.
// ---------------------------------------------------------------------------------------

export type LifecycleStep =
  | 'welcome'
  | 'setup_help'
  | 'first_sent'
  | 'results_ready'
  | 'trial_ending'
  | 'trial_ended'
  | 'read_only_soon'
  // a cancellation (0064, D-108): when it is registered, and seven days before deletion
  | 'cancelled'
  | 'deletion_soon'

export interface LifecycleJob {
  id: string
  step: LifecycleStep
  to_email: string
  name: string | null
  lang: string | null
  org: string
  k: number
  trial_ends_at: string
  read_only_from: string
  cancel_effective_at?: string | null
  deletion_due_at?: string | null
}

/** Where each step's button leads, in the app. */
export const LIFECYCLE_PATH: Record<LifecycleStep, string> = {
  welcome: '/oppsett?fane=ansatte',
  setup_help: '/oppsett?fane=ansatte',
  first_sent: '/malinger',
  results_ready: '/resultater',
  trial_ending: '/oppsett?fane=betaling',
  trial_ended: '/oppsett?fane=betaling',
  read_only_soon: '/oppsett?fane=betaling',
  cancelled: '/rapport',
  deletion_soon: '/rapport',
}

export function renderLifecycle(cat: MailCatalogue, job: LifecycleJob, appUrl: string, graceDays = 14): Rendered {
  const lang = langOf(job.lang)
  const m = cat[lang]
  const key = `lifecycle.${job.step}`
  // the trial's end for the first three steps and trial_ending; the read-only date after it;
  // for a cancellation, the day it ends and the day everything is deleted
  const cancel = job.step === 'cancelled' || job.step === 'deletion_soon'
  if (cancel && (!job.cancel_effective_at || !job.deletion_due_at)) throw new Error(`${job.step} without its dates`)
  const date = dateOf(job.step === 'trial_ended' || job.step === 'read_only_soon' ? job.read_only_from : job.trial_ends_at, lang)
  // the agreement's last day is the day before it ends at midnight
  const ends = cancel ? dateOf(new Date(new Date(job.cancel_effective_at!).getTime() - 1000).toISOString(), lang) : ''
  const deleted = cancel ? dateOf(job.deletion_due_at!, lang) : ''
  const vars = { org: job.org, k: job.k, date, grace: graceDays, ends, deleted }
  const greeting = job.name ? fill(pick(m, 'greeting'), { name: job.name }) : pick(m, 'greetingPlain')
  const url = `${appUrl.replace(/\/+$/, '')}${LIFECYCLE_PATH[job.step]}`
  const { text, html } = layout({
    lang,
    greeting,
    paragraphs: [fill(pick(m, `${key}.lead`), vars), fill(pick(m, `${key}.more`), vars)],
    cta: { label: pick(m, `${key}.cta`), url },
    after: [],
    footer: fill(pick(m, cancel ? 'lifecycle.footerCancelled' : 'lifecycle.footer'), { org: job.org }),
  })
  return { subject: fill(pick(m, `${key}.subject`), vars), text, html }
}

// ---------------------------------------------------------------------------------------
// Marketing (0055, D-101; 0056, D-103): a campaign written in the admin, and the
// newsletter's confirmation. Both go out on the marketing sender, never the product's.
//
// What makes a campaign mail work, and so what this renders:
//   - one column, 600 px at most, one primary button the reader meets without scrolling;
//   - buttons as tables around a link ("bulletproof"): Outlook draws them, and a tap target
//     is at least 44 px high;
//   - a preheader, and alt text on every image, since many readers see neither the image
//     nor anything but the first line;
//   - every link to orgpuls.com tagged with the campaign and the block it sits in
//     (utm_content = b3-button), so the report can say which link worked;
//   - a footer that says who sends, why this reader gets it, and how to stop.
// The 'letter' style is the plain personal mail first contact with a company should be:
// no logo, no card, links as text links, a signature.
// ---------------------------------------------------------------------------------------

export type CampaignBlockType = 'heading' | 'text' | 'button' | 'article' | 'bullets' | 'image' | 'divider' | 'quote' | 'event' | 'ps'
export type CampaignBlock = { type: CampaignBlockType; text?: string; url?: string; title?: string; label?: string; alt?: string; href?: string }

export interface CrmJob {
  id: string
  kind: 'campaign' | 'test' | 'optin'
  to_email: string
  token: string
  name: string | null
  company?: string | null
  basis?: string | null
  lang: string | null
  lists?: Array<{ name_no: string; name_en: string }> | null
  /** the person a campaign is sent as (0093): an address on the marketing domain, and their own inbox for answers */
  sender?: { name: string; email: string; reply_to: string } | null
  campaign: {
    kind: string
    style?: 'branded' | 'letter'
    signature?: string
    subject: string
    preheader: string
    blocks: CampaignBlock[]
    utm_campaign: string
    web_slug?: string | null
    list?: { name_no: string; name_en: string } | null
  } | null
}

const OWN_HOSTS = /(^|\.)orgpuls\.(com|no)$/

/**
 * A link to Orgpuls' own site carries the campaign's utm tags, so the site's analytics
 * (0050) can count the visits and signups it brought, and `content` names the block the
 * link sits in. Tags already on the link are kept; links elsewhere are left as written.
 */
export function withUtm(url: string, utmCampaign: string, content?: string): string {
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
  if (content) set('utm_content', content)
  return u.toString()
}

export const unsubscribeUrl = (siteUrl: string, token: string) => `${siteUrl.replace(/\/+$/, '')}/avmeld?t=${token}`
export const unsubscribeApi = (siteUrl: string, token: string) => `${siteUrl.replace(/\/+$/, '')}/api/avmeld?t=${token}`
export const confirmUrl = (siteUrl: string, token: string) => `${siteUrl.replace(/\/+$/, '')}/nyhetsbrev?t=${token}`
export const archiveUrl = (siteUrl: string, slug: string) => `${siteUrl.replace(/\/+$/, '')}/nyhetsbrev/arkiv/${slug}`

/** {firma} and {navn} in a campaign's text: the only placeholders, filled from the recipient. */
export function personalise(s: string, v: { company: string; firstName: string }): string {
  return s.replace(/\{firma\}/g, v.company).replace(/\{navn\}/g, v.firstName)
}

const INK = '#191510'
const MUTED = '#5F5849'
const para = 'margin:0 0 14px;font-size:15px;line-height:1.6;color:#191510;white-space:pre-line'

function button(label: string, href: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0"><tr><td bgcolor="#F5C64A" style="border-radius:12px;border:1px solid ${INK}"><a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:700;line-height:1.3;color:${INK};text-decoration:none;border-radius:12px">${escapeHtml(label)}</a></td></tr></table>`
}

export function renderCampaign(cat: MailCatalogue, job: CrmJob, siteUrl: string): Rendered {
  const lang = langOf(job.lang)
  const m = cat[lang]
  const c = job.campaign
  if (!c) throw new Error('campaign job without a campaign')
  const letter = c.style === 'letter'
  const vars = {
    company: job.company?.trim() || pick(m, 'crm.companyFallback'),
    firstName: job.name?.trim().split(/\s+/)[0] ?? '',
  }
  const fillIn = (s: string) => personalise(s, vars)
  const unsub = unsubscribeUrl(siteUrl, job.token)
  const subjectText = fillIn(c.subject)
  const subject = job.kind === 'test' ? `${pick(m, 'crm.test')} ${subjectText}` : subjectText
  const tag = (i: number, t: string) => `b${i + 1}-${t}`
  const link = (url: string, i: number, t: string) => withUtm(url, c.utm_campaign, tag(i, t))

  const text: string[] = []
  const html: string[] = []
  c.blocks.forEach((b, i) => {
    const body = fillIn(b.text ?? '')
    const title = fillIn(b.title ?? '')
    switch (b.type) {
      case 'heading':
        text.push(body.toUpperCase())
        html.push(`<h2 style="margin:6px 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:600;line-height:1.3;color:${INK}">${escapeHtml(body)}</h2>`)
        break
      case 'text':
        for (const p of body.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)) {
          text.push(p)
          html.push(`<p style="${para}">${escapeHtml(p)}</p>`)
        }
        break
      case 'button': {
        if (!b.url) break
        const href = link(b.url, i, 'button')
        text.push(`${body}: ${href}`)
        html.push(letter ? `<p style="${para}"><a href="${escapeHtml(href)}" style="color:#2F5D2A;font-weight:700">${escapeHtml(body)}</a></p>` : button(body, href))
        break
      }
      case 'article': {
        if (!b.url) break
        const href = link(b.url, i, 'article')
        const more = b.label?.trim() || (lang === 'en' ? 'Read more' : 'Les mer')
        text.push([title, body, `${more}: ${href}`].filter(Boolean).join('\n'))
        html.push(`<div style="margin:0 0 18px"><h3 style="margin:0 0 6px;font-size:17px;font-weight:700;line-height:1.35"><a href="${escapeHtml(href)}" style="color:${INK};text-decoration:none">${escapeHtml(title)}</a></h3>${body ? `<p style="margin:0 0 6px;font-size:14.5px;line-height:1.6;color:${INK}">${escapeHtml(body)}</p>` : ''}<a href="${escapeHtml(href)}" style="font-size:14.5px;font-weight:700;color:#2F5D2A">${escapeHtml(more)} →</a></div>`)
        break
      }
      case 'bullets': {
        const items = body.split('\n').map((s) => s.trim()).filter(Boolean)
        text.push(items.map((s) => `– ${s}`).join('\n'))
        html.push(`<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px">${items
          .map((s) => `<tr><td valign="top" style="padding:0 10px 8px 0;font-size:15px;line-height:1.5;color:#2F5D2A;font-weight:700">✓</td><td style="padding:0 0 8px;font-size:15px;line-height:1.5;color:${INK}">${escapeHtml(s)}</td></tr>`)
          .join('')}</table>`)
        break
      }
      case 'image': {
        if (!b.url) break
        const img = `<img src="${escapeHtml(b.url)}" alt="${escapeHtml(b.alt ?? '')}" width="512" style="display:block;width:100%;max-width:512px;height:auto;border:0;border-radius:12px">`
        text.push(`[${b.alt ?? ''}]`)
        html.push(`<div style="margin:0 0 16px">${b.href ? `<a href="${escapeHtml(link(b.href, i, 'image'))}">${img}</a>` : img}</div>`)
        break
      }
      case 'divider':
        text.push('—')
        html.push(`<hr style="border:0;border-top:1px solid #E8DFC9;margin:20px 0">`)
        break
      case 'quote':
        text.push(`«${body}»${title ? ` — ${title}` : ''}`)
        html.push(`<blockquote style="margin:0 0 16px;padding:4px 0 4px 16px;border-left:3px solid #F5C64A"><p style="margin:0;font-size:16px;line-height:1.55;font-style:italic;color:${INK}">«${escapeHtml(body)}»</p>${title ? `<p style="margin:6px 0 0;font-size:13px;color:${MUTED}">${escapeHtml(title)}</p>` : ''}</blockquote>`)
        break
      case 'event': {
        const href = b.url ? link(b.url, i, 'event') : null
        const label = b.label?.trim() || (lang === 'en' ? 'Sign up' : 'Meld deg på')
        const lines = body.split('\n').map((s) => s.trim()).filter(Boolean)
        text.push([title, ...lines, href ? `${label}: ${href}` : ''].filter(Boolean).join('\n'))
        html.push(`<div style="margin:0 0 18px;padding:18px 18px 4px;border:1px solid #E8DFC9;border-radius:14px;background:#FCF6E9"><p style="margin:0 0 8px;font-size:17px;font-weight:700;line-height:1.35;color:${INK}">${escapeHtml(title)}</p>${lines
          .map((l) => `<p style="margin:0 0 4px;font-size:14.5px;line-height:1.5;color:${INK}">${escapeHtml(l)}</p>`)
          .join('')}${href ? (letter ? `<p style="${para}"><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></p>` : button(label, href)) : '<div style="height:14px"></div>'}</div>`)
        break
      }
      case 'ps':
        text.push(`${pick(m, 'crm.ps')} ${body}`)
        html.push(`<p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:${MUTED}"><strong>${escapeHtml(pick(m, 'crm.ps'))}</strong> ${escapeHtml(body)}</p>`)
        break
    }
  })

  const why = c.list
    ? fill(pick(m, 'crm.listWhy'), { list: lang === 'en' ? c.list.name_en : c.list.name_no })
    : job.basis === 'business'
      ? fill(pick(m, 'crm.businessWhy'), { company: vars.company })
      : pick(m, 'crm.why')
  const sender = pick(m, 'crm.sender')
  const prefs = pick(m, 'crm.preferences')
  const web = c.web_slug ? withUtm(archiveUrl(siteUrl, c.web_slug), c.utm_campaign, 'web-version') : null
  const signature = (c.signature ?? '').trim()

  const textOut = [...text, ...(signature ? [signature] : []), '—', why, `${prefs}: ${unsub}`, sender].join('\n\n')
  // the preheader is the line mail programs show after the subject; hidden in the body
  const pre = c.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(fillIn(c.preheader))}${'&#8199;&#847;'.repeat(40)}</div>`
    : ''
  const top = web
    ? `<p style="margin:0 0 10px;text-align:right;font-size:12px"><a href="${escapeHtml(web)}" style="color:${MUTED}">${escapeHtml(pick(m, 'crm.viewInBrowser'))}</a></p>`
    : ''
  const sig = signature ? `<p style="${para};margin-top:18px">${escapeHtml(signature)}</p>` : ''
  const footer = `<p style="margin:16px 4px 0;font-size:12px;line-height:1.55;color:${MUTED}">${escapeHtml(why)} <a href="${escapeHtml(unsub)}" style="color:${MUTED}">${escapeHtml(prefs)}</a>.</p>
<p style="margin:6px 4px 0;font-size:12px;line-height:1.55;color:${MUTED}">${escapeHtml(sender)}</p>`

  const body = letter
    ? `<div style="max-width:600px;margin:0 auto;padding:24px 20px;background:#FFFFFF">${top}${html.join('\n')}${sig}<hr style="border:0;border-top:1px solid #E8DFC9;margin:24px 0 8px">${footer}</div>`
    : `<div style="max-width:600px;margin:0 auto;padding:24px 16px">${top}
<div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:600;color:${INK};margin:0 0 16px">Orgpuls</div>
<div style="background:#FFFDF6;border:1px solid #E8DFC9;border-radius:20px;padding:26px 24px">
${html.join('\n')}${sig}
</div>
${footer}
</div>`

  const htmlOut = `<!doctype html>
<html lang="${lang === 'en' ? 'en' : 'nb'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${letter ? '#FFFFFF' : '#FCF6E9'};font-family:'DM Sans',Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
${pre}
${body}
</body></html>`
  return { subject, text: textOut, html: htmlOut }
}

/** The double opt-in. The link carries the token, so it is written as text (D-97). */
export function renderOptin(cat: MailCatalogue, job: CrmJob, siteUrl: string): Rendered {
  const lang = langOf(job.lang)
  const m = cat[lang]
  const names = (job.lists ?? []).map((l) => (lang === 'en' ? l.name_en : l.name_no))
  const { text, html } = layout({
    lang,
    greeting: job.name ? fill(pick(m, 'greeting'), { name: job.name }) : pick(m, 'greetingPlain'),
    paragraphs: [pick(m, 'optin.lead'), ...(names.length ? [fill(pick(m, 'optin.lists'), { lists: names.join(', ') })] : [])],
    cta: { label: pick(m, 'optin.cta'), url: confirmUrl(siteUrl, job.token), plain: true },
    after: [pick(m, 'optin.ignore')],
    footer: pick(m, 'optin.footer'),
  })
  return { subject: pick(m, 'optin.subject'), text, html }
}
