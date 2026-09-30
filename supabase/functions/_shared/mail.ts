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
  /** the day everyone is told (0105, 0106 AUD-06): an invitation names it, never the deadline */
  publish_on?: string | null
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
  /**
   * «Send test til meg» (0127): the round whose invitation this tests. A test has no token; its
   * link opens that round's preview, which needs a sign-in and answers nothing.
   */
  test_round?: string | null
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

const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('')

/**
 * A language's mail texts with the bokmål or English overrides approved in admin › Translations
 * (0101, D-152) laid over them: `flat` is public.message_overrides, keyed by the message's full
 * path; only `mail.*` strings the catalogue has are replaced, never a branch, never a new key.
 *
 * Since 0109 each value is {text, file}: the override applies only while this deployment's text at
 * that path still hashes to `file`, the text it replaced (X-090). Once the files carry a change,
 * folded back or rewritten, the files win. A plain string (a row before 0109) applies as before.
 */
export async function withMailOverrides(tree: MailMessages, flat: Record<string, unknown>): Promise<MailMessages> {
  const keys = Object.keys(flat).filter((k) => k.startsWith('mail.'))
  if (!keys.length) return tree
  const out = structuredClone(tree) as Record<string, unknown>
  for (const k of keys) {
    const v = flat[k]
    const text = typeof v === 'string' ? v : v && typeof v === 'object' && typeof (v as { text?: unknown }).text === 'string' ? (v as { text: string }).text : null
    if (text === null) continue
    const basis = v && typeof v === 'object' ? (v as { file?: unknown }).file : null
    const parts = k.slice('mail.'.length).split('.')
    let node: unknown = out
    for (const p of parts.slice(0, -1)) node = node && typeof node === 'object' ? (node as Record<string, unknown>)[p] : undefined
    const last = parts.at(-1)!
    if (!node || typeof node !== 'object' || typeof (node as Record<string, unknown>)[last] !== 'string') continue
    if (typeof basis === 'string' && (await sha256((node as Record<string, string>)[last]!)) !== basis) continue
    ;(node as Record<string, unknown>)[last] = text
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

export function dateOf(iso: string | null, lang: Lang, withYear = false): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat(DATE_LOCALE[lang] ?? 'nb-NO', {
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' as const } : {}),
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

/** A test's link (0127): the round's preview in the app, never a survey page */
export function testLink(appUrl: string, round: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(round)) throw new Error('test without a valid round')
  return `${appUrl.replace(/\/+$/, '')}/forhandsvis?runde=${round}`
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
      // a yearly cadence: the year is the point (audit AUD-21)
      ev?.due_on ? fill(pick(m, 'evaluering.lead'), { date: dateOf(ev.due_on, group.lang, true) }) : pick(m, 'evaluering.leadNoDate'),
      ev?.last_on ? fill(pick(m, 'evaluering.last'), { date: dateOf(ev.last_on, group.lang, true) }) : pick(m, 'evaluering.none'),
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
    const test = job.kind === 'invitasjon' && job.test_round ? job.test_round : null
    if (!job.token && !test) throw new Error(`${job.kind} without a link`)
    const link = test ? testLink(base, test) : personalLink(base, job.token as string)
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
      ...(invite && job.results_shared
        ? [job.publish_on ? fill(pick(m, 'invitasjon.resultsOn'), { date: dateOf(job.publish_on, group.lang) }) : pick(m, 'invitasjon.results')]
        : []),
      // 0100 (P1-3): what the last round showed and what is being done, before this one is asked
      ...(invite && job.results_page ? [`${pick(m, 'invitasjon.lastPage')} ${pageLink(base, job.results_page)}`] : []),
    ]
    const after = [
      ...(job.round.closes_at ? [fill(pick(m, 'invitasjon.deadline'), { date: dateOf(job.round.closes_at, group.lang) })] : []),
      ...(reminder || job.kind === 'lenke' ? [pick(m, 'paminnelse.replaces')] : []),
      pick(m, 'invitasjon.personal'),
    ]
    const real = cap(fill(pick(m, `${own}.subject`), { org, round }))
    // a test says so in its subject and above everything else, and where its link goes
    const subject = test ? fill(pick(m, 'test.subject'), { subject: real }) : real
    return {
      subject,
      ...layout({
        brand,
        title: subject,
        lang: group.lang,
        greeting,
        paragraphs: test ? [pick(m, 'test.lead'), ...paragraphs] : paragraphs,
        cta: { label: pick(m, 'invitasjon.cta'), url: link, plain: true },
        after,
        footer,
      }),
    }
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

/**
 * Whether a notice goes out as one provider message per person (0134, D-97): a notice to a role,
 * never a personal message. Each person's message id is then recorded on its own
 * (`dispatch_recipient_sent`), so a delivery event sets that person's state. A personal message —
 * an invitation above all — keeps its one id on its outbox row and is never split out.
 */
export function perRecipient(job: Pick<NoticeJob, 'kind' | 'audience' | 'token'>): boolean {
  return job.audience !== null && !isPersonal(job.kind) && !job.token
}

/** The key a notice's recipient is kept under (0134): SHA-256 of the lower-cased address, in hex, as the database digests it */
export const addressKey = (email: string) => sha256(email.trim().toLowerCase())

/**
 * The messages a notice to a role still owes: one per person with an address, in the group whose
 * words they read, less the people `reached` (their keys) already got it on an earlier attempt.
 */
export async function pendingSends(
  job: NoticeJob,
  offered: Lang[] | null,
  reached: ReadonlySet<string>,
): Promise<Array<{ group: { lang: Lang; member: boolean; name: string | null }; to: { email: string; name: string | null }; key: string }>> {
  const out: Array<{ group: { lang: Lang; member: boolean; name: string | null }; to: { email: string; name: string | null }; key: string }> = []
  const seen = new Set(reached)
  for (const g of groupsOf(job, offered)) {
    for (const r of g.to) {
      if (!r.email) continue
      const key = await addressKey(r.email)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ group: { lang: g.lang, member: g.member, name: g.name }, to: { email: r.email, name: r.name }, key })
    }
  }
  return out
}

/**
 * Runs `send` over `items`, at most `n` at a time. At the first failure it takes no new item and,
 * once those under way are done, returns that failure; null when every one succeeded.
 */
export async function inTurns<T, R extends { ok: boolean }>(items: readonly T[], n: number, send: (item: T) => Promise<R>): Promise<R | null> {
  let failed: R | null = null
  let next = 0
  const worker = async () => {
    while (failed === null && next < items.length) {
      const res = await send(items[next++]!)
      if (!res.ok && failed === null) failed = res
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker))
  return failed
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
// The reply that resolves the case also carries its one-use rating link (0135).
// ---------------------------------------------------------------------------------------

export interface TicketJob {
  id: string
  to_email: string
  to_name: string | null
  subject: string
  number: number
  body: string
  /** the rating key the claim minted for the reply that resolves the case (0135); else null */
  csat_key?: string | null
}

/** The rating page, on the public site: the key is its only way in (0135) */
export const csatUrl = (siteUrl: string, key: string) => `${siteUrl.replace(/\/+$/, '')}/vurdering?t=${key}`

export function renderTicketReply(cat: MailCatalogue, job: TicketJob, siteUrl: string, lang: Lang = 'no'): Rendered {
  const m = cat[lang]
  const paragraphs = job.body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  // the key only as a well-formed key; the link as text, so the provider's click tracking cannot
  // rewrite it and log the key with the address (D-97)
  const key = job.csat_key && /^[0-9a-f]{64}$/.test(job.csat_key) ? job.csat_key : null
  const { text, html } = layout({
    lang,
    greeting: paragraphs[0] ?? '',
    paragraphs: paragraphs.slice(1),
    cta: key ? { label: pick(m, 'ticket.csatLabel'), url: csatUrl(siteUrl, key), plain: true } : null,
    after: [...(key ? [pick(m, 'ticket.csatNote')] : []), fill(pick(m, 'ticket.replyHint'), { number: job.number })],
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

export type CampaignBlockType =
  | 'heading' | 'text' | 'button' | 'article' | 'bullets' | 'image' | 'divider' | 'quote' | 'event' | 'ps'
  // 0113 (X-092): the designed blocks
  | 'hero' | 'features' | 'steps' | 'stats' | 'cta'
export type CampaignBlock = {
  type: CampaignBlockType
  text?: string
  url?: string
  title?: string
  label?: string
  alt?: string
  href?: string
  /** a picture above a hero or an article (0113) */
  image?: string
}

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

// ---------------------------------------------------------------------------------------
// The branded layout (0113, X-092). What mail programs actually draw decides every choice:
//   - tables for layout, widths as attributes and bgcolor beside background: Outlook on
//     Windows renders with Word and ignores most CSS; an <!--[if mso]> table pins it to 600;
//   - live text for the name and every heading, never text in an image: a third of readers
//     have images off, and an image-only mail is what spam filters score highest;
//   - one embedded <style> for what inline styles cannot say: stacking columns under 620 px
//     (Gmail and Apple Mail read it) and a dark palette (Apple Mail, Outlook.com);
//   - one primary button per block, 44 px or taller, as a table around a link.
// Colours are the site's own tokens (tailwind.config.ts): cream canvas, card surface, ink,
// the yellow CTA, the soft-yellow panel, the green link.
// ---------------------------------------------------------------------------------------

const INK = '#191510'
const BODY = '#3A342A'
const MUTED = '#5F5849'
const LINE = '#E8DFC9'
const CANVAS = '#FCF6E9'
const CARD = '#FFFDF6'
const SOFT = '#FBEBBE'
const YELLOW = '#F5C64A'
const GREEN = '#2F5D2A'
const SERIF = "Georgia,'Times New Roman',serif"
const SANS = "'DM Sans',Arial,Helvetica,sans-serif"
const para = `margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK};white-space:pre-line`

/** The Orgpuls mark as a PNG (mail programs do not draw SVG), served from the site. */
export const MAIL_MARK = '/mail/mark.png'

/** "Title | text" lines, as features, steps and stats are written; at most `max`. */
export function pairs(s: string, max = 6): Array<{ a: string; b: string }> {
  return s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, max)
    .map((l) => {
      const i = l.indexOf('|')
      return i < 0 ? { a: l, b: '' } : { a: l.slice(0, i).trim(), b: l.slice(i + 1).trim() }
    })
}

function button(label: string, href: string, onDark = false): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0 4px"><tr><td bgcolor="${YELLOW}" style="border-radius:12px;border:1px solid ${onDark ? YELLOW : INK};mso-padding-alt:14px 24px"><a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 24px;font-family:${SANS};font-size:16px;font-weight:700;line-height:1.25;color:${INK};text-decoration:none;border-radius:12px">${escapeHtml(label)}&nbsp;&rarr;</a></td></tr></table>`
}

/** A block's own row in the card: padded, or full-bleed for a hero image and a band. */
const row = (inner: string, pad = '0 36px', cls = 'px') => `<tr><td class="${cls}" style="padding:${pad}">${inner}</td></tr>`

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
  const site = siteUrl.replace(/\/+$/, '')
  const unsub = unsubscribeUrl(siteUrl, job.token)
  const subjectText = fillIn(c.subject)
  const subject = job.kind === 'test' ? `${pick(m, 'crm.test')} ${subjectText}` : subjectText
  const tag = (i: number, t: string) => `b${i + 1}-${t}`
  const link = (url: string, i: number, t: string) => withUtm(url, c.utm_campaign, tag(i, t))
  const readMore = lang === 'en' ? 'Read more' : 'Les mer'
  const signUp = lang === 'en' ? 'Sign up' : 'Meld deg på'

  const text: string[] = []
  const html: string[] = []
  const plainLink = (label: string, href: string) =>
    `<p style="${para}"><a href="${escapeHtml(href)}" style="color:${GREEN};font-weight:700">${escapeHtml(label)}</a></p>`

  c.blocks.forEach((b, i) => {
    const body = fillIn(b.text ?? '')
    const title = fillIn(b.title ?? '')
    const label = fillIn(b.label ?? '')
    switch (b.type) {
      case 'hero': {
        const href = b.url ? link(b.url, i, 'hero') : null
        const cta = label.trim() || readMore
        text.push([title.toUpperCase(), body, href ? `${cta}: ${href}` : ''].filter(Boolean).join('\n\n'))
        if (letter) {
          html.push(`<p style="${para};font-weight:700">${escapeHtml(title)}</p>`, ...(body ? [`<p style="${para}">${escapeHtml(body)}</p>`] : []), ...(href ? [plainLink(cta, href)] : []))
          break
        }
        const img = b.image
          ? row(`<img src="${escapeHtml(b.image)}" alt="${escapeHtml(b.alt ?? '')}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:19px 19px 0 0">`, '0', 'bleed')
          : ''
        html.push(`${img}<tr><td class="px soft" bgcolor="${SOFT}" style="background:${SOFT};padding:34px 36px 30px;${b.image ? '' : 'border-radius:19px 19px 0 0'}">
<h1 class="ink" style="margin:0 0 12px;font-family:${SERIF};font-size:30px;font-weight:600;line-height:1.2;color:${INK}">${escapeHtml(title)}</h1>${body ? `<p class="ink" style="margin:0;font-size:17px;line-height:1.6;color:${INK};white-space:pre-line">${escapeHtml(body)}</p>` : ''}${href ? button(cta, href) : ''}</td></tr>
<tr><td style="height:30px;line-height:30px;font-size:0">&nbsp;</td></tr>`)
        break
      }
      case 'heading':
        text.push(body.toUpperCase())
        html.push(letter ? `<p style="${para};font-weight:700">${escapeHtml(body)}</p>` : row(`<h2 class="ink" style="margin:6px 0 12px;font-family:${SERIF};font-size:24px;font-weight:600;line-height:1.3;color:${INK}">${escapeHtml(body)}</h2>`))
        break
      case 'text':
        for (const p of body.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)) {
          text.push(p)
          html.push(letter ? `<p style="${para}">${escapeHtml(p)}</p>` : row(`<p class="body" style="margin:0 0 16px;font-size:16px;line-height:1.65;color:${BODY};white-space:pre-line">${escapeHtml(p)}</p>`))
        }
        break
      case 'button': {
        if (!b.url) break
        const href = link(b.url, i, 'button')
        text.push(`${body}: ${href}`)
        html.push(letter ? plainLink(body, href) : row(`${button(body, href)}<div style="height:14px;line-height:14px;font-size:0">&nbsp;</div>`))
        break
      }
      case 'article': {
        if (!b.url) break
        const href = link(b.url, i, 'article')
        const more = label.trim() || readMore
        text.push([title, body, `${more}: ${href}`].filter(Boolean).join('\n'))
        if (letter) {
          html.push(`<p style="${para}"><strong>${escapeHtml(title)}</strong>${body ? `<br>${escapeHtml(body)}` : ''}<br><a href="${escapeHtml(href)}" style="color:${GREEN}">${escapeHtml(more)}</a></p>`)
          break
        }
        const img = b.image
          ? `<a href="${escapeHtml(href)}"><img src="${escapeHtml(b.image)}" alt="${escapeHtml(b.alt ?? '')}" width="526" style="display:block;width:100%;max-width:526px;height:auto;border:0;border-radius:12px;margin:0 0 14px"></a>`
          : ''
        html.push(row(`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px"><tr><td class="tile" bgcolor="${CANVAS}" style="background:${CANVAS};border:1px solid ${LINE};border-radius:14px;padding:20px 22px">${img}<h3 style="margin:0 0 6px;font-size:18px;font-weight:700;line-height:1.35"><a href="${escapeHtml(href)}" class="ink" style="color:${INK};text-decoration:none">${escapeHtml(title)}</a></h3>${body ? `<p class="body" style="margin:0 0 10px;font-size:15px;line-height:1.6;color:${BODY}">${escapeHtml(body)}</p>` : ''}<a href="${escapeHtml(href)}" class="link" style="font-size:15px;font-weight:700;color:${GREEN}">${escapeHtml(more)}&nbsp;&rarr;</a></td></tr></table>`))
        break
      }
      case 'bullets': {
        const items = body.split('\n').map((s) => s.trim()).filter(Boolean)
        text.push(items.map((s) => `– ${s}`).join('\n'))
        html.push(
          (letter ? (x: string) => x : row)(
            `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px">${items
              .map(
                (s) =>
                  `<tr><td valign="top" style="padding:1px 12px 10px 0">${letter ? `<span style="color:${GREEN};font-weight:700">✓</span>` : `<span style="display:inline-block;width:22px;height:22px;line-height:22px;border-radius:11px;background:${SOFT};color:${INK};font-size:13px;font-weight:700;text-align:center">✓</span>`}</td><td class="ink" style="padding:0 0 10px;font-size:16px;line-height:1.55;color:${INK}">${escapeHtml(s)}</td></tr>`,
              )
              .join('')}</table>`,
          ),
        )
        break
      }
      case 'features':
      case 'steps': {
        const items = pairs(body, b.type === 'steps' ? 5 : 4)
        text.push([...(title ? [title.toUpperCase()] : []), ...items.map((x, j) => `${b.type === 'steps' ? `${j + 1}.` : '–'} ${x.a}${x.b ? `: ${x.b}` : ''}`)].join('\n'))
        if (letter) {
          html.push(`<p style="${para}">${title ? `<strong>${escapeHtml(title)}</strong><br>` : ''}${items.map((x, j) => `${b.type === 'steps' ? `${j + 1}. ` : '– '}<strong>${escapeHtml(x.a)}</strong>${x.b ? ` ${escapeHtml(x.b)}` : ''}`).join('<br>')}</p>`)
          break
        }
        const head = title ? `<h2 class="ink" style="margin:6px 0 16px;font-family:${SERIF};font-size:22px;font-weight:600;line-height:1.3;color:${INK}">${escapeHtml(title)}</h2>` : ''
        const cell = (x: { a: string; b: string }, j: number) =>
          `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td valign="top" width="40" style="padding:0 12px 0 0"><span style="display:inline-block;width:32px;height:32px;line-height:32px;border-radius:16px;background:${b.type === 'steps' ? YELLOW : SOFT};color:${INK};font-family:${SERIF};font-size:16px;font-weight:700;text-align:center">${b.type === 'steps' ? j + 1 : '✓'}</span></td><td valign="top"><p class="ink" style="margin:4px 0 4px;font-size:16px;font-weight:700;line-height:1.35;color:${INK}">${escapeHtml(x.a)}</p>${x.b ? `<p class="mut" style="margin:0;font-size:14.5px;line-height:1.55;color:${MUTED}">${escapeHtml(x.b)}</p>` : ''}</td></tr></table>`
        if (b.type === 'steps' || items.length < 2) {
          html.push(row(`${head}${items.map((x, j) => `<div style="margin:0 0 16px">${cell(x, j)}</div>`).join('')}`))
          break
        }
        // two columns that stack under 620 px
        const rows: string[] = []
        for (let j = 0; j < items.length; j += 2) {
          const two = items.slice(j, j + 2)
          rows.push(`<tr>${two.map((x, k) => `<td class="col" valign="top" width="50%" style="padding:0 ${k === 0 ? '12px' : '0'} 18px ${k === 1 ? '12px' : '0'}">${cell(x, j + k)}</td>`).join('')}${two.length === 1 ? '<td class="col" width="50%">&nbsp;</td>' : ''}</tr>`)
        }
        html.push(row(`${head}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${rows.join('')}</table>`))
        break
      }
      case 'stats': {
        const items = pairs(body, 3)
        text.push([...(title ? [title.toUpperCase()] : []), ...items.map((x) => `${x.a} – ${x.b}`)].join('\n'))
        if (letter) {
          html.push(`<p style="${para}">${title ? `<strong>${escapeHtml(title)}</strong><br>` : ''}${items.map((x) => `<strong>${escapeHtml(x.a)}</strong> ${escapeHtml(x.b)}`).join('<br>')}</p>`)
          break
        }
        const head = title ? `<h2 class="ink" style="margin:6px 0 14px;font-family:${SERIF};font-size:22px;font-weight:600;line-height:1.3;color:${INK}">${escapeHtml(title)}</h2>` : ''
        const w = Math.floor(100 / Math.max(1, items.length))
        html.push(
          row(
            `${head}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px"><tr>${items
              .map(
                (x, k) =>
                  `<td class="col" valign="top" width="${w}%" style="padding:0 ${k < items.length - 1 ? '6px' : '0'} 10px ${k > 0 ? '6px' : '0'}"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td class="tile" bgcolor="${CANVAS}" style="background:${CANVAS};border:1px solid ${LINE};border-radius:14px;padding:18px 16px;text-align:center"><p class="ink" style="margin:0 0 4px;font-family:${SERIF};font-size:34px;font-weight:600;line-height:1.1;color:${INK}">${escapeHtml(x.a)}</p><p class="mut" style="margin:0;font-size:13.5px;line-height:1.45;color:${MUTED}">${escapeHtml(x.b)}</p></td></tr></table></td>`,
              )
              .join('')}</tr></table>`,
          ),
        )
        break
      }
      case 'image': {
        if (!b.url) break
        const img = `<img src="${escapeHtml(b.url)}" alt="${escapeHtml(b.alt ?? '')}" width="526" style="display:block;width:100%;max-width:526px;height:auto;border:0;border-radius:14px">`
        text.push(`[${b.alt ?? ''}]`)
        const inner = `<div style="margin:0 0 18px">${b.href ? `<a href="${escapeHtml(link(b.href, i, 'image'))}">${img}</a>` : img}</div>`
        html.push(letter ? inner : row(inner))
        break
      }
      case 'divider':
        text.push('—')
        html.push(letter ? `<hr style="border:0;border-top:1px solid ${LINE};margin:20px 0">` : row(`<div class="rule" style="border-top:1px solid ${LINE};margin:8px 0 24px;font-size:0;line-height:0">&nbsp;</div>`))
        break
      case 'quote':
        text.push(`«${body}»${title ? ` — ${title}` : ''}`)
        html.push(
          letter
            ? `<blockquote style="margin:0 0 16px;padding:2px 0 2px 14px;border-left:3px solid ${LINE}"><p style="margin:0;font-size:15px;line-height:1.6;font-style:italic;color:${INK}">«${escapeHtml(body)}»</p>${title ? `<p style="margin:6px 0 0;font-size:13px;color:${MUTED}">${escapeHtml(title)}</p>` : ''}</blockquote>`
            : row(
                `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 20px"><tr><td class="tile" bgcolor="${CANVAS}" style="background:${CANVAS};border-radius:16px;padding:24px 26px"><p style="margin:0 0 2px;font-family:${SERIF};font-size:44px;line-height:0.9;color:${YELLOW}" aria-hidden="true">&ldquo;</p><p class="ink" style="margin:0;font-family:${SERIF};font-size:19px;line-height:1.5;font-style:italic;color:${INK}">${escapeHtml(body)}</p>${title ? `<p class="mut" style="margin:12px 0 0;font-size:13.5px;font-weight:700;color:${MUTED}">${escapeHtml(title)}</p>` : ''}</td></tr></table>`,
              ),
        )
        break
      case 'event': {
        const href = b.url ? link(b.url, i, 'event') : null
        const cta = label.trim() || signUp
        const lines = body.split('\n').map((s) => s.trim()).filter(Boolean)
        text.push([title, ...lines, href ? `${cta}: ${href}` : ''].filter(Boolean).join('\n'))
        if (letter) {
          html.push(`<p style="${para}"><strong>${escapeHtml(title)}</strong>${lines.map((l) => `<br>${escapeHtml(l)}`).join('')}</p>`, ...(href ? [plainLink(cta, href)] : []))
          break
        }
        html.push(
          row(
            `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px"><tr><td class="tile" bgcolor="${CANVAS}" style="background:${CANVAS};border:1px solid ${LINE};border-left:4px solid ${YELLOW};border-radius:14px;padding:22px 24px"><p class="mut" style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${MUTED}">${escapeHtml(pick(m, 'crm.event'))}</p><p class="ink" style="margin:0 0 10px;font-family:${SERIF};font-size:21px;font-weight:600;line-height:1.3;color:${INK}">${escapeHtml(title)}</p>${lines
              .map((l) => `<p class="body" style="margin:0 0 4px;font-size:15px;line-height:1.55;color:${BODY}">${escapeHtml(l)}</p>`)
              .join('')}${href ? button(cta, href) : ''}</td></tr></table>`,
          ),
        )
        break
      }
      case 'cta': {
        const href = b.url ? link(b.url, i, 'cta') : null
        const cta = label.trim() || readMore
        text.push([title, body, href ? `${cta}: ${href}` : ''].filter(Boolean).join('\n'))
        if (letter) {
          html.push(...(title ? [`<p style="${para};font-weight:700">${escapeHtml(title)}</p>`] : []), ...(body ? [`<p style="${para}">${escapeHtml(body)}</p>`] : []), ...(href ? [plainLink(cta, href)] : []))
          break
        }
        html.push(
          row(
            `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:6px 0 22px"><tr><td bgcolor="${INK}" style="background:${INK};border-radius:16px;padding:28px 28px 26px"><p style="margin:0 0 8px;font-family:${SERIF};font-size:23px;font-weight:600;line-height:1.3;color:${CANVAS}">${escapeHtml(title)}</p>${body ? `<p style="margin:0;font-size:15.5px;line-height:1.6;color:${LINE};white-space:pre-line">${escapeHtml(body)}</p>` : ''}${href ? button(cta, href, true) : ''}</td></tr></table>`,
          ),
        )
        break
      }
      case 'ps':
        text.push(`${pick(m, 'crm.ps')} ${body}`)
        html.push(
          (letter ? (x: string) => x : row)(
            `<p class="mut" style="margin:18px 0 0;font-size:14.5px;line-height:1.6;color:${MUTED}"><strong>${escapeHtml(pick(m, 'crm.ps'))}</strong> ${escapeHtml(body)}</p>`,
          ),
        )
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
  // the preheader is the line mail programs show after the subject; hidden in the body, then
  // padded with zero-width joiners so the body's first words do not follow it into the inbox
  const pre = c.preheader
    ? `<div style="display:none;max-height:0;max-width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;opacity:0;color:transparent">${escapeHtml(fillIn(c.preheader))}${'&#8199;&#847;'.repeat(60)}</div>`
    : ''
  const htmlLang = lang === 'en' ? 'en' : 'nb'
  const head = (dark: boolean, css: string) => `<!doctype html>
<html lang="${htmlLang}" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="format-detection" content="telephone=no,address=no,email=no,date=no"><meta name="color-scheme" content="${dark ? 'light dark' : 'light'}"><meta name="supported-color-schemes" content="${dark ? 'light dark' : 'light'}"><title>${escapeHtml(subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>${css}</style></head>`

  if (letter) {
    // the plain personal mail (0093): no logo, no card, links as text links, a signature
    const sig = signature ? `<p style="${para};margin-top:18px">${escapeHtml(signature)}</p>` : ''
    const top = web ? `<p style="margin:0 0 10px;text-align:right;font-size:12px"><a href="${escapeHtml(web)}" style="color:${MUTED}">${escapeHtml(pick(m, 'crm.viewInBrowser'))}</a></p>` : ''
    const footer = `<p style="margin:16px 0 0;font-size:12px;line-height:1.55;color:${MUTED}">${escapeHtml(why)} <a href="${escapeHtml(unsub)}" style="color:${MUTED}">${escapeHtml(prefs)}</a>.</p>
<p style="margin:6px 0 0;font-size:12px;line-height:1.55;color:${MUTED}">${escapeHtml(sender)}</p>`
    const htmlOut = `${head(false, 'a{color:#2F5D2A}')}
<body style="margin:0;padding:0;background:#FFFFFF;font-family:${SANS};-webkit-text-size-adjust:100%">
${pre}
<div style="max-width:600px;margin:0 auto;padding:24px 20px;background:#FFFFFF">${top}${html.join('\n')}${sig}<hr style="border:0;border-top:1px solid ${LINE};margin:24px 0 8px">${footer}</div>
</body></html>`
    return { subject, text: textOut, html: htmlOut }
  }

  const css = [
    'body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}',
    'table,td{mso-table-lspace:0;mso-table-rspace:0}',
    'img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none}',
    'a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}',
    '@media only screen and (max-width:620px){.px{padding-left:22px!important;padding-right:22px!important}.col{display:block!important;width:100%!important;padding-left:0!important;padding-right:0!important}.outer{padding:12px 8px!important}h1{font-size:26px!important}}',
    `@media (prefers-color-scheme:dark){.bg{background:#15120D!important}.card{background:#211D16!important;border-color:#3A342A!important}.soft{background:#3A301A!important}.tile{background:#2A251C!important;border-color:#3A342A!important}.ink{color:#F3EDE0!important}.body{color:#E3DBCB!important}.mut{color:#C4BCA8!important}.link{color:#9FD19A!important}.rule{border-color:#3A342A!important}}`,
    `[data-ogsc] .ink{color:#F3EDE0!important}[data-ogsc] .body{color:#E3DBCB!important}[data-ogsc] .mut{color:#C4BCA8!important}`,
  ].join('\n')
  const sig = signature ? row(`<p class="body" style="margin:10px 0 0;font-size:15.5px;line-height:1.6;color:${BODY};white-space:pre-line">${escapeHtml(signature)}</p>`) : ''
  const htmlOut = `${head(true, css)}
<body class="bg" style="margin:0;padding:0;background:${CANVAS};font-family:${SANS};word-spacing:normal">
${pre}
<table role="presentation" class="bg" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${CANVAS}" style="background:${CANVAS}"><tr><td class="outer" align="center" style="padding:28px 12px">
<!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;margin:0 auto">
<tr><td style="padding:0 6px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td valign="middle"><a href="${escapeHtml(withUtm(`${site}/`, c.utm_campaign, 'logo'))}" style="text-decoration:none"><img src="${escapeHtml(site + MAIL_MARK)}" width="32" height="32" alt="" style="display:inline-block;vertical-align:middle;width:32px;height:32px;border:0">&nbsp;<span class="ink" style="vertical-align:middle;font-family:${SERIF};font-size:21px;font-weight:600;color:${INK}">Orgpuls</span></a></td>
${web ? `<td valign="middle" align="right" style="font-size:12px"><a href="${escapeHtml(web)}" class="mut" style="color:${MUTED}">${escapeHtml(pick(m, 'crm.viewInBrowser'))}</a></td>` : ''}
</tr></table></td></tr>
<tr><td class="card" bgcolor="${CARD}" style="background:${CARD};border:1px solid ${LINE};border-radius:20px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
${c.blocks[0]?.type === 'hero' ? '' : '<tr><td style="height:34px;line-height:34px;font-size:0">&nbsp;</td></tr>'}
${html.join('\n')}
${sig}
<tr><td style="height:24px;line-height:24px;font-size:0">&nbsp;</td></tr>
</table></td></tr>
<tr><td style="padding:20px 8px 0"><p class="mut" style="margin:0 0 8px;font-size:12.5px;line-height:1.6;color:${MUTED}">${escapeHtml(why)} <a href="${escapeHtml(unsub)}" class="mut" style="color:${MUTED};text-decoration:underline">${escapeHtml(prefs)}</a>.</p>
<p class="mut" style="margin:0;font-size:12.5px;line-height:1.6;color:${MUTED}">${escapeHtml(sender)}</p></td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
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
