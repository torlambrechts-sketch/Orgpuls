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
const LANGS: readonly string[] = ['no', 'en', 'pl', 'uk', 'lt', 'sv', 'da'] satisfies readonly Lang[]
const isLang = (v: unknown): v is Lang => typeof v === 'string' && LANGS.includes(v)
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
    | 'tiltak_status'
    | 'tiltak_forfalt'
    | 'svarprosent'
    | 'evaluering'
    | 'tilgang'
  audience: string | null
  /** the channel the database chose for the link (0033; Teams since 0176, Slack since 0185); role notices are always e-mail */
  channel: 'email' | 'sms' | 'teams' | 'slack'
  /** the organisation's own SMS text, or null for the default */
  sms_text: string | null
  lang: string
  /** the organisation's market (0219, D-257): whose law a notice states */
  market?: string | null
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
  /** the round's page for employees, /r/<slug> (0100, P1-3): a results notice's or a «dette gjør vi» notice's own round (0212), an invitation's last shared one */
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
  /** a request to join (0232, D-279): the name the person gave and the address they signed up with */
  request?: { name: string | null; email: string } | null
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
  /** present only when Teams carries this person's link (0176): whom the bot addresses */
  teams?: { object_id: string; tenant_id: string; conversation_id: string | null; service_url: string | null } | null
  name: string | null
  lang: string | null
  member: boolean
  /** present only when Slack carries this person's link (0185): the member id, and the organisation whose bot writes */
  slack?: { user_id: string; org: string } | null
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

/** Each market's legal pack's mail texts, per mail language (messages/market/<market>/<lang>.json) */
export type MailPacks = Record<string, Partial<Record<Lang, MailMessages>>>

const mergeTree = (a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...a }
  for (const [k, v] of Object.entries(b)) {
    const was = out[k]
    out[k] = v && typeof v === 'object' && was && typeof was === 'object' ? mergeTree(was as Record<string, unknown>, v as Record<string, unknown>) : v
  }
  return out
}

/**
 * The texts an organisation in `market` reads (D-257). The message files state Norway's law; a
 * notice that cites a paragraph (the safety representative's before a survey, the evaluation
 * reminder, the results notice) states its own market's instead, as the product does
 * (lib/i18n/market-overlay.ts): the market's pack laid over each language. A language the pack is
 * not written in reads its English, never Norway's law. Norway has no pack.
 */
export function marketCatalogue(cat: MailCatalogue, packs: MailPacks, market: string | null | undefined): MailCatalogue {
  const pack = market ? packs[market] : undefined
  if (!pack) return brandedCatalogue(cat, brandNameOf(market))
  const fallback = pack.en ?? Object.values(pack)[0]
  const out = { ...cat } as MailCatalogue
  for (const lang of Object.keys(cat) as Lang[]) {
    const law = pack[lang] ?? fallback
    const own = out[lang]
    if (law && own) out[lang] = mergeTree(own, law)
  }
  return brandedCatalogue(out, brandNameOf(market))
}

/**
 * Each market's brand name (lib/brand.ts MARKET_BRAND and BRANDS; tests/unit/mail.test.ts holds the
 * two equal): what a notice to an organisation there calls the product, and the sender's name.
 */
export const MARKET_BRAND_NAME: Readonly<Record<string, string>> = { no: 'Orgpuls', se: 'Orgpuls', gb: 'Empvibe' }
export const brandNameOf = (market: string | null | undefined): string => MARKET_BRAND_NAME[market ?? ''] ?? 'Orgpuls'

/**
 * A market's own site, where the links in its organisations' mail, SMS, Teams and Slack lead since it
 * opened: Empvibe's for the United Kingdom (UK-G, D-275), se.orgpuls.com for Sweden (SE-F, D-276), where
 * a Swedish leader's session is (lib/hosts.ts EMPVIBE_URL, SE_URL; tests/unit/market-links.test.ts
 * holds them to the host registry). Norway is reached through the product's own address,
 * ORGPULS_APP_URL.
 */
export const MARKET_SITE_URL: Readonly<Record<string, string>> = { gb: 'https://www.empvibe.com', se: 'https://se.orgpuls.com' }

/** The product's own production address (lib/hosts.ts MAIN_URL), the only base a market's site replaces */
const PRODUCTION = /^https:\/\/www\.orgpuls\.com\/?$/

/**
 * The base of a link to an organisation in this market: its own site when the run is production's.
 * Any other run — local, QA, a branch or a staging project — keeps its own base: its tokens exist
 * only in its own database.
 */
export function appUrlOf(appUrl: string, market: string | null | undefined): string {
  const own = MARKET_SITE_URL[market ?? '']
  return own && PRODUCTION.test(appUrl) ? own : appUrl
}

/**
 * The SMS sender an organisation's employees see (Brevo's alphanumeric sender, at most 11 characters):
 * its brand's name. Orgpuls's own markets keep the configured sender (ORGPULS_SMS_SENDER).
 */
export function smsSenderOf(market: string | null | undefined, fallback: string): string {
  const name = brandNameOf(market)
  return name === 'Orgpuls' ? fallback : name
}

/**
 * A brand's own mail domain (UK-G, D-275). Its organisations' mail is sent from it once Brevo reports
 * it authenticated, under the product's own address's name before the @; until then, from the
 * product's address under the brand's name (X-111).
 */
export const MARKET_MAIL_DOMAIN: Readonly<Record<string, string>> = { gb: 'empvibe.com' }

/** The sender of a mail to an organisation in this market, given the domains Brevo has authenticated */
export function senderFor(
  base: { email: string; name: string },
  market: string | null | undefined,
  authenticated: ReadonlySet<string>,
): { email: string; name: string } {
  const name = brandNameOf(market)
  if (name === 'Orgpuls') return base
  const domain = MARKET_MAIL_DOMAIN[market ?? '']
  const email = domain && authenticated.has(domain) ? `${base.email.split('@')[0]}@${domain}` : base.email
  return { email, name }
}

/**
 * A mail's sender, and where answers to it go: from a brand's own domain, to the support inbox,
 * since the domain has no mailbox of its own yet (D-275); from the product's address, as before.
 */
export function mailFrom(
  base: { email: string; name: string },
  market: string | null | undefined,
  authenticated: ReadonlySet<string>,
  support: string,
): { sender: { email: string; name: string }; replyTo?: { email: string; name: string } } {
  const sender = senderFor(base, market, authenticated)
  return sender.email === base.email ? { sender } : { sender, replyTo: { email: support, name: sender.name } }
}

/**
 * The site an Auth mail's link leads back to (UK-G, D-275): the one the person signed up, was invited
 * or asked for a new password on, read from the request's redirect_to, which Auth has already held to
 * its allow list; else the product's own. With it, the market whose brand and language the mail takes.
 */
export function authSite(redirectTo: string | null | undefined, appUrl: string): { url: string; market: string | null } {
  let origin = ''
  try {
    origin = new URL(redirectTo ?? '').origin
  } catch {
    return { url: appUrl, market: null }
  }
  for (const [market, url] of Object.entries(MARKET_SITE_URL)) {
    const own = new URL(url)
    // the bare domain is the site's alias (lib/hosts.ts)
    if (origin === own.origin || origin === `${own.protocol}//${own.host.replace(/^www\./, '')}`) return { url: appUrlOf(appUrl, market), market }
  }
  return { url: appUrl, market: null }
}

/**
 * The language of an Auth mail to a person whose sign-up named none: the market's, else bokmål. English
 * for Sweden as well, the language a Swedish organisation's leaders read their mail in until it exists
 * in Swedish (D-255)
 */
export const MARKET_AUTH_LANG: Readonly<Record<string, Lang>> = { gb: 'en', se: 'en' }

/**
 * The texts under a brand's name, as lib/brand.ts `rebrand` does for the app: «Orgpuls» becomes the
 * brand's name, an address (orgpuls.com, hjelp@orgpuls.no) stays, and the possessive follows the
 * language. Orgpuls reads the catalogue as written.
 */
export function brandedCatalogue(cat: MailCatalogue, name: string): MailCatalogue {
  if (name === 'Orgpuls') return cat
  const walk = (v: unknown, lang: string): unknown => {
    if (typeof v === 'string')
      return v.replace(/Orgpuls(?:'s|’s|'|’)(?![\p{L}\p{N}])/gu, lang === 'en' ? `${name}'s` : `${name}s`).replace(/Orgpuls/g, name)
    if (Array.isArray(v)) return v.map((x) => walk(x, lang))
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x, lang)]))
    return v
  }
  return Object.fromEntries(Object.entries(cat).map(([lang, m]) => [lang, walk(m, lang)])) as MailCatalogue
}

/**
 * An organisation's language as its notices read it (D-255): bokmål and English as they are. An
 * organisation in Swedish (the Swedish market, D-254) reads English, the language behind Swedish
 * in the app (D-252), until the leaders' notices are written in Swedish; never bokmål. Anything
 * else is bokmål, as before.
 */
export const orgLangOf = (v: string | null | undefined): Lang => (v === 'en' || v === 'sv' ? 'en' : 'no')

/**
 * The language one person reads a notice to many in (groupsOf). In Norway, as before: theirs where
 * it is bokmål or English, else the organisation's, else bokmål. In a Swedish organisation (D-255):
 * bokmål for someone who chose bokmål, English for everyone else.
 */
export function groupLang(personal: string | null | undefined, org: string | null | undefined): Lang {
  if (org === 'sv') return personal === 'no' ? 'no' : 'en'
  return langOf(personal ?? org)
}

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

/**
 * Each market's time zone (lib/markets.ts MARKET_TIME_ZONE; tests/unit/mail.test.ts holds the two
 * equal), the zone an organisation there takes at sign-up and keeps: the clock its notices' dates are
 * on (D-280), so a deadline at midnight in London is not the next day's in a British inbox.
 */
export const MARKET_TIME_ZONE: Readonly<Record<string, string>> = { no: 'Europe/Oslo', se: 'Europe/Stockholm', gb: 'Europe/London' }
export const timeZoneOf = (market: string | null | undefined): string => MARKET_TIME_ZONE[market ?? ''] ?? 'Europe/Oslo'

export function dateOf(iso: string | null, lang: Lang, withYear = false, timeZone = 'Europe/Oslo'): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat(DATE_LOCALE[lang] ?? 'nb-NO', {
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' as const } : {}),
    timeZone,
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
<html lang="${p.lang === 'no' ? 'nb' : p.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(p.title ?? 'Orgpuls')}</title></head>
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

/**
 * Each market's survey language (lib/i18n/offered.ts surveyBaseOf; tests/unit/mail.test.ts holds the
 * two equal): where it is offered it comes first and bokmål is not offered beside it (D-280), so an
 * invitation and the survey page it links to agree on the languages.
 */
export const MARKET_SURVEY_BASE: Readonly<Record<string, Lang>> = { no: 'no', se: 'sv', gb: 'en' }

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
  const offered: Lang[] = ['no', ...(ready as Lang[])]
  const base = MARKET_SURVEY_BASE[job.market ?? ''] ?? 'no'
  return base !== 'no' && offered.includes(base) ? [base, ...offered.filter((l) => l !== base && l !== 'no')] : offered
}

/**
 * The language one person reads their own message in. Without a language flag, the
 * organisation's, as before. With one: theirs where offered, then the organisation's where
 * offered, then the survey's own (bokmål, or the market's language, D-280) — the order the survey page opens in (lib/i18n/offered.ts chooseLocale),
 * so an English organisation's employee with no language set keeps English mail.
 */
export function personalLang(job: NoticeJob, r: Recipient, offered: Lang[] | null): Lang {
  // the organisation's as the notices have it: a Swedish organisation reads English, never bokmål (D-255)
  const org = orgLangOf(job.lang)
  if (!offered) return org
  // any survey language: `offered` holds only those whose mail texts and page strings are ready
  // (offeredFor), so a Polish employee gets Polish exactly when the survey is offered in it (D-209)
  const own = isLang(r.lang) ? r.lang : null
  if (own && offered.includes(own)) return own
  // the organisation's own survey language where it is offered: Swedish for a Swedish organisation
  if (isLang(job.lang) && offered.includes(job.lang)) return job.lang
  // then the survey's own: bokmål, or the market's language where it is offered (D-280)
  return offered.includes(org) ? org : (offered[0] ?? 'no')
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
      x.due ? fill(pick(m, 'tiltak.item'), { title: x.title, date: dateOf(x.due, group.lang, false, timeZoneOf(job.market)) }) : fill(pick(m, 'tiltak.itemNoDate'), { title: x.title }),
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
      ev?.due_on ? fill(pick(m, 'evaluering.lead'), { date: dateOf(ev.due_on, group.lang, true, timeZoneOf(job.market)) }) : pick(m, 'evaluering.leadNoDate'),
      ev?.last_on ? fill(pick(m, 'evaluering.last'), { date: dateOf(ev.last_on, group.lang, true, timeZoneOf(job.market)) }) : pick(m, 'evaluering.none'),
      pick(m, 'evaluering.what'),
    ]
    const cta = group.member ? { label: pick(m, 'evaluering.cta'), url: `${base}/rapport` } : null
    return { subject, ...layout({ brand, title: subject, lang: group.lang, greeting, paragraphs, cta, after: [], footer }) }
  }

  // somebody signed up and found this organisation already here (0232, D-279): to its daglig leder.
  // Who asks is in the body only. What they typed as their name is kept to letters, spaces, hyphens and
  // apostrophes: no address, link or instruction rides in a mail from the product's own sender.
  if (job.kind === 'tilgang') {
    const req = job.request ?? null
    if (!req) throw new Error('tilgang without a request')
    const name = req.name ? req.name.replace(/[^\p{L}\p{M}'’ -]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) : ''
    const subject = fill(pick(m, 'tilgang.subject'), { org })
    const paragraphs = [
      fill(pick(m, name ? 'tilgang.lead' : 'tilgang.leadNoName'), { name, email: req.email, org }),
      pick(m, 'tilgang.what'),
    ]
    const cta = group.member ? { label: pick(m, 'tilgang.cta'), url: `${base}/oppsett?fane=roller` } : null
    return { subject, ...layout({ brand, title: subject, lang: group.lang, greeting, paragraphs, cta, after: [pick(m, 'tilgang.unknown')], footer }) }
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
        ? [job.publish_on ? fill(pick(m, 'invitasjon.resultsOn'), { date: dateOf(job.publish_on, group.lang, false, timeZoneOf(job.market)) }) : pick(m, 'invitasjon.results')]
        : []),
      // 0100 (P1-3): what the last round showed and what is being done, before this one is asked
      ...(invite && job.results_page ? [`${pick(m, 'invitasjon.lastPage')} ${pageLink(base, job.results_page)}`] : []),
    ]
    const after = [
      ...(job.round.closes_at ? [fill(pick(m, 'invitasjon.deadline'), { date: dateOf(job.round.closes_at, group.lang, false, timeZoneOf(job.market)) })] : []),
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
    const date = dateOf(job.round.opens_at, group.lang, false, timeZoneOf(job.market))
    const audience = job.audience ?? 'alle_ansatte'
    const paragraphs = [cap(fill(pick(m, 'forvarsel.lead'), { org, round, date })), pick(m, `forvarsel.${audience}`)]
    const cta = group.member ? { label: pick(m, 'forvarsel.cta'), url: `${base}/malinger` } : null
    const subject = cap(fill(pick(m, 'forvarsel.subject'), { org, round, date }))
    return { subject, ...layout({ brand, title: subject, lang: group.lang, greeting, paragraphs, cta, after: [], footer }) }
  }

  // «dette gjør vi» (0212, D-245): to everyone asked, once the measures are decided — the page's link
  // and nothing else; no measure, figure or name travels in the mail
  if (job.kind === 'tiltak_status') {
    if (!job.results_page) throw new Error('tiltak_status without a page')
    const subject = cap(fill(pick(m, 'tiltakStatus.subject'), { org, round }))
    return {
      subject,
      ...layout({
        brand,
        title: subject,
        lang: group.lang,
        greeting,
        paragraphs: [cap(fill(pick(m, 'tiltakStatus.lead'), { org, round })), pick(m, 'tiltakStatus.page')],
        cta: { label: pick(m, 'tiltakStatus.cta'), url: pageLink(base, job.results_page) },
        after: [pick(m, 'tiltakStatus.anonymous')],
        footer,
      }),
    }
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
    const lang = groupLang(r.lang, job.lang)
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

export function renderAuth(cat: MailCatalogue, action: AuthAction, lang: Lang, email: string, link: string, footer = 'Orgpuls · orgpuls.com'): Rendered {
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
      footer,
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
    return fill(pick(m, key), { org: job.org, round, date: dateOf(job.round.closes_at, lang, false, timeZoneOf(job.market)) })
  }
  if (job.kind === 'lenke') return fill(pick(m, 'sms.link'), { org: job.org })
  // the organisation's own text goes to those who read the organisation's language: Swedish in a Swedish one
  const own = isLang(job.lang) && job.lang !== 'no' && job.lang !== 'en' ? job.lang : langOf(job.lang)
  return job.sms_text?.trim() && lang === own ? job.sms_text : fill(pick(m, 'sms.default'), { org: job.org })
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
// A notice to a person who asked to be told when management answers their comment (0204,
// X-103). It says only that something came, never what was written, and links the person's
// own conversation — the key in the fragment, as text, so no click tracking sees it (D-97).
// ---------------------------------------------------------------------------------------

export interface ReplyNoticeJob {
  id: string
  /** the organisation's market (0230): whose brand, site and SMS sender the notice has */
  market?: string | null
  reason: 'svar' | 'kontakt'
  channel: 'email' | 'sms'
  email: string | null
  phone: string | null
  lang: string
  org: string
  key: string
}

/** The conversation's page with its key in the fragment, which no server is sent */
export function threadLink(appUrl: string, key: string): string {
  if (!/^[0-9a-f]{64}$/.test(key)) throw new Error('notice without a valid key')
  return `${appUrl.replace(/\/+$/, '')}/s/samtale#${key}`
}

/** The person's language where its mail texts are complete in this run's catalogue, else bokmål */
export function noticeLang(cat: MailCatalogue, lang: string): Lang {
  const l = lang as Lang
  if (l === 'no' || l === 'en') return l
  try {
    return cat[l] && pick(cat[l], 'svarvarsel.subject') ? l : 'no'
  } catch {
    return 'no'
  }
}

export function renderReplyNotice(cat: MailCatalogue, job: ReplyNoticeJob, appUrl: string): Rendered {
  const lang = noticeLang(cat, job.lang)
  const m = cat[lang]
  const subject = pick(m, 'svarvarsel.subject')
  const { text, html } = layout({
    lang,
    title: subject,
    greeting: pick(m, 'greetingPlain'),
    paragraphs: [fill(pick(m, job.reason === 'kontakt' ? 'svarvarsel.kontakt' : 'svarvarsel.svar'), { org: job.org })],
    cta: { label: pick(m, 'svarvarsel.cta'), url: threadLink(appUrl, job.key), plain: true },
    after: [pick(m, 'svarvarsel.why')],
    footer: fill(pick(m, 'automatic'), { org: job.org }),
  })
  return { subject, text, html }
}

export function replyNoticeSms(cat: MailCatalogue, job: ReplyNoticeJob): string {
  const m = cat[noticeLang(cat, job.lang)]
  return fill(pick(m, job.reason === 'kontakt' ? 'svarvarsel.smsKontakt' : 'svarvarsel.smsSvar'), { org: job.org })
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
  /** the organisation's market (0219, D-257) */
  market?: string | null
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
  const date = dateOf(job.step === 'trial_ended' || job.step === 'read_only_soon' ? job.read_only_from : job.trial_ends_at, lang, false, timeZoneOf(job.market))
  // the agreement's last day is the day before it ends at midnight
  const ends = cancel ? dateOf(new Date(new Date(job.cancel_effective_at!).getTime() - 1000).toISOString(), lang, false, timeZoneOf(job.market)) : ''
  const deleted = cancel ? dateOf(job.deletion_due_at!, lang, false, timeZoneOf(job.market)) : ''
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
