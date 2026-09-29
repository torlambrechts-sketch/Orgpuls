/**
 * The inbox check (X-092): what a campaign's own content does to its chance of reaching the inbox
 * rather than the spam folder or the promotions tab, checked the way the large mailbox providers
 * and the spam filters in front of company mail score it. Pure, so the editor runs it on every
 * keystroke and the schedule action runs the same function before it lets a campaign go.
 *
 * Three levels. `fail` stops scheduling: a deceptive «Re:» subject, a [placeholder] still in the
 * text, a link shortener, a mail with almost no text, a mail Gmail would clip (which cuts the
 * unsubscribe link off with it). `warn` is advice with a reason. `pass` also lists what the
 * sending always does (one-click unsubscribe, a plain-text part), so the author sees the whole
 * picture, and each of those is true of every mail the dispatcher sends.
 *
 * The sending domain's DNS (DKIM, DMARC, SPF) is looked up on the server
 * (lib/admin/mailDomain.ts) and joins the list there.
 */

export type Level = 'pass' | 'warn' | 'fail'
export interface Check {
  id: string
  level: Level
  /** values for the message: a count, the words found, a host */
  vars?: Record<string, string | number>
}

export interface CheckInput {
  style: 'branded' | 'letter'
  subject: string
  subjectB?: string
  preheader: string
  blocks: Array<{ type: string; text?: string; title?: string; label?: string; url?: string; href?: string; image?: string; alt?: string }>
  /** the rendered HTML, for its size */
  html?: string
  /** the footer's sender line, to see whether it names a postal address */
  footer?: string
}

/** Gmail shows «[Message clipped]» above 102 KB and hides the rest, the unsubscribe link included */
export const GMAIL_CLIP_BYTES = 102 * 1024
export const PLACEHOLDER = /\[[^[\]\n]{1,80}\]/

const SHORTENERS = /(^|\.)(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|cutt\.ly|shorturl\.at|tiny\.cc|rb\.gy)$/i
const OWN = /(^|\.)orgpuls\.(com|no)$/i
// a reply or forward prefix on a first mail misleads about an earlier conversation
const DECEPTIVE = /^\s*(re|sv|fw|fwd|vs|videresend)\s*:/i
// words and phrases that content filters (SpamAssassin's rule set, Microsoft and Google's
// classifiers) weigh against a sender, in bokmål and English; the subject is held to a stricter list
const SPAMMY = [
  '100 %', '100%', 'garantert', 'garanti', 'vinn ', 'du har vunnet', 'klikk her', 'klikk nå', 'handle nå', 'haster', 'siste sjanse',
  'risikofritt', 'tjen penger', 'ekstra inntekt', 'billigst', 'laveste pris', 'kontanter',
  'click here', 'act now', 'urgent', 'risk-free', 'risk free', 'no cost', 'earn money', 'extra income', 'cash', 'winner', 'guarantee', 'last chance',
  '$$$', '€€€',
]
const SUBJECT_ONLY = ['gratis', 'free', 'tilbud', 'offer', 'rabatt', 'discount', 'salg', 'sale', 'kjøp nå', 'buy now']
const VAGUE_LINK = /^(klikk her|her|click here|here|link|lenke|les mer her)$/i

const words = (s: string) => s.split(/\s+/).filter((w) => /\p{L}/u.test(w))
const urlHost = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase()
  } catch {
    return ''
  }
}

export function checkCampaign(c: CheckInput): Check[] {
  const out: Check[] = []
  const add = (id: string, level: Level, vars?: Check['vars']) => out.push({ id, level, ...(vars ? { vars } : {}) })
  const subjects = [c.subject, c.subjectB ?? ''].filter((s) => s.trim())
  const bodyText = c.blocks.map((b) => [b.title, b.text, b.label].filter(Boolean).join(' ')).join('\n')
  const lower = bodyText.toLowerCase()

  // ---- subject
  const longest = Math.max(0, ...subjects.map((s) => s.trim().length))
  const shortest = subjects.length ? Math.min(...subjects.map((s) => s.trim().length)) : 0
  add('subject_length', !subjects.length ? 'fail' : longest > 60 || shortest < 12 ? 'warn' : 'pass', { count: longest })
  add('subject_deceptive', subjects.some((s) => DECEPTIVE.test(s)) ? 'fail' : 'pass')
  const shouting = subjects.flatMap((s) => s.match(/\b[A-ZÆØÅ]{5,}\b/g) ?? [])
  const bangs = subjects.some((s) => (s.match(/!/g) ?? []).length > 1 || /[!?]{2,}/.test(s) || /[$€]/.test(s))
  add('subject_style', shouting.length || bangs ? 'warn' : 'pass', { words: shouting.join(', ') })
  const spam = [
    ...SPAMMY.filter((w) => lower.includes(w) || subjects.some((s) => s.toLowerCase().includes(w))),
    ...SUBJECT_ONLY.filter((w) => subjects.some((s) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'iu').test(s))),
  ]
  add('spam_words', spam.length ? 'warn' : 'pass', { words: [...new Set(spam)].map((w) => `«${w.trim()}»`).join(', ') })

  // ---- preheader
  const pre = c.preheader.trim()
  add(
    'preheader',
    c.style === 'letter' && !pre ? 'pass' : !pre || subjects.some((s) => s.trim().toLowerCase() === pre.toLowerCase()) ? 'warn' : 'pass',
    { count: pre.length },
  )

  // ---- placeholders
  const left = [...subjects, c.preheader, bodyText, ...c.blocks.map((b) => b.alt ?? '')].join('\n').match(new RegExp(PLACEHOLDER, 'g')) ?? []
  add('placeholder', left.length ? 'fail' : 'pass', { words: [...new Set(left)].slice(0, 4).join(', ') })

  // ---- text and pictures
  const count = words(bodyText).length
  const images = c.blocks.filter((b) => b.type === 'image' || b.image).length
  add('text_amount', count < 20 ? 'fail' : count > 800 ? 'warn' : 'pass', { count })
  add('image_ratio', images > 0 && count / images < 60 ? 'warn' : 'pass', { count: images })

  // ---- links
  // an image block's url is the picture itself; its href is the link
  const links = c.blocks.flatMap((b) => (b.type === 'image' ? [b.href] : [b.url, b.href]).filter((u): u is string => !!u))
  const distinct = [...new Set(links)]
  const hosts = [...new Set(distinct.map(urlHost).filter(Boolean))]
  const short = hosts.filter((h) => SHORTENERS.test(h))
  add('link_shortener', short.length ? 'fail' : 'pass', { words: short.join(', ') })
  const foreign = hosts.filter((h) => !OWN.test(h))
  add('link_domains', foreign.length > 2 ? 'warn' : 'pass', { count: foreign.length, words: foreign.join(', ') })
  add('link_count', distinct.length > 12 ? 'warn' : 'pass', { count: distinct.length })
  const vague = c.blocks.filter((b) => (b.type === 'button' && VAGUE_LINK.test((b.text ?? '').trim())) || ((b.label ?? '').trim() && VAGUE_LINK.test((b.label ?? '').trim())))
  add('link_text', vague.length ? 'warn' : 'pass')
  const ctas = c.blocks.filter((b) => ['hero', 'button', 'cta', 'event'].includes(b.type) && b.url).length
  add('cta_count', ctas > 3 ? 'warn' : 'pass', { count: ctas })

  // ---- a personal letter stays a letter
  if (c.style === 'letter') {
    add('letter_plain', images || c.blocks.some((b) => b.type === 'hero' || b.type === 'cta' || b.type === 'stats') ? 'warn' : 'pass')
    add('letter_personal', /\{(firma|navn)\}/.test([...subjects, bodyText].join(' ')) ? 'pass' : 'warn')
  }

  // ---- size
  if (c.html !== undefined) {
    const bytes = new TextEncoder().encode(c.html).length
    add('size', bytes > GMAIL_CLIP_BYTES ? 'fail' : bytes > 80 * 1024 ? 'warn' : 'pass', { count: Math.round(bytes / 1024) })
  }

  // ---- who sends: a postal address in the footer
  if (c.footer !== undefined) add('footer_address', /\b\d{4}\s+\p{L}{2,}/u.test(c.footer) ? 'pass' : 'warn')

  // ---- what every mail already carries (supabase/functions/orgpuls-dispatch)
  add('unsubscribe', 'pass')
  add('plain_text', 'pass')
  add('suppression', 'pass')
  return out
}

/** A campaign may be scheduled only with no check failing. */
export const blocking = (checks: Check[]) => checks.filter((c) => c.level === 'fail')
