'use client'

import { useState, useTransition } from 'react'
import { confirmNewsletter, savePreferences, signUpNewsletter, unsubscribeNewsletter } from '@/lib/crm/actions'

/**
 * The newsletter's forms (D-101). No design exists for them; they are built from the contact
 * form's fields and the sign-in panel's card, so they read as the same site.
 */

const field = 'h-[46px] rounded-cta border border-line bg-bg px-[14px] text-[14.5px] font-normal text-ink'
const cta =
  'mt-[6px] h-[50px] cursor-pointer rounded-tile border border-ink bg-ac px-[22px] text-[15.5px] font-bold text-ink disabled:cursor-default disabled:opacity-70'

type SignupWords = {
  mail: string
  name: string
  company: string
  submit: string
  sending: string
  invalid: string
  limited: string
  failed: string
  sentTitle: string
  /** with `{mail}` */
  sentLead: string
  privacy: string
  listsTitle: string
  listsHint: string
  noLists: string
}

type ListChoice = { key: string; name: string; description: string }

export function NewsletterSignup({ words: w, lang, lists = [] }: { words: SignupWords; lang: 'no' | 'en'; lists?: ListChoice[] }) {
  const [chosen, setChosen] = useState<string[]>(lists.some((l) => l.key === 'nyhetsbrev') ? ['nyhetsbrev'] : lists.slice(0, 1).map((l) => l.key))
  const [mail, setMail] = useState('')
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [trap, setTrap] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [sending, start] = useTransition()

  if (sent) {
    return (
      <div role="status" className="mt-[18px] rounded-cta border border-line bg-sbg px-[16px] py-[14px]">
        <p className="m-0 text-[15px] font-bold">{w.sentTitle}</p>
        <p className="m-0 mt-[4px] text-[14px] leading-[1.6] text-body">{w.sentLead.replace('{mail}', sent)}</p>
      </div>
    )
  }

  return (
    <form
      noValidate
      className="mt-[18px] flex flex-col gap-[12px]"
      onSubmit={(e) => {
        e.preventDefault()
        if (!/.+@.+\..+/.test(mail.trim())) {
          setProblem(w.invalid)
          return
        }
        if (lists.length && chosen.length === 0) {
          setProblem(w.noLists)
          return
        }
        start(async () => {
          const r = await signUpNewsletter({ mail, name, company, lang, source: 'newsletter', trap, lists: chosen }).catch(() => null)
          if (r?.ok) setSent(mail.trim())
          else setProblem(r?.problem === 'invalid' ? w.invalid : r?.problem === 'rate_limited' ? w.limited : w.failed)
        })
      }}
    >
      <label className="flex flex-col gap-[6px] text-[13px] font-semibold">
        {w.mail}
        <input
          value={mail}
          type="email"
          autoComplete="email"
          required
          onChange={(e) => (setMail(e.target.value), setProblem(null))}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-[6px] text-[13px] font-semibold">
        {w.name}
        <input value={name} autoComplete="name" onChange={(e) => setName(e.target.value)} className={field} />
      </label>
      <label className="flex flex-col gap-[6px] text-[13px] font-semibold">
        {w.company}
        <input value={company} autoComplete="organization" onChange={(e) => setCompany(e.target.value)} className={field} />
      </label>
      {lists.length ? (
        <fieldset className="m-0 flex flex-col gap-[8px] border-0 p-0">
          <legend className="mb-[6px] text-[13px] font-semibold">{w.listsTitle}</legend>
          {lists.map((l) => (
            <ListBox
              key={l.key}
              list={l}
              checked={chosen.includes(l.key)}
              onChange={(on) => (setChosen(on ? [...chosen, l.key] : chosen.filter((k) => k !== l.key)), setProblem(null))}
            />
          ))}
          <span className="text-[12px] leading-[1.5] text-mut">{w.listsHint}</span>
        </fieldset>
      ) : null}
      {/* for form bots only: off screen, out of the tab order, hidden from assistive technology */}
      <input
        name="website"
        value={trap}
        onChange={(e) => setTrap(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-10000px] h-px w-px overflow-hidden"
      />
      <button type="submit" disabled={sending} className={cta}>
        {sending ? w.sending : w.submit}
      </button>
      {problem ? (
        <span role="alert" className="text-[13px] leading-[1.5] text-danger">
          {problem}
        </span>
      ) : null}
      <p className="m-0 text-[12.5px] leading-[1.55] text-mut">{w.privacy}</p>
    </form>
  )
}

type TokenWords = {
  submit: string
  sending: string
  doneTitle: string
  doneLead: string
  invalidTitle: string
  invalidLead: string
  again: string
}

/**
 * Confirming a subscription, or leaving one, takes a press: a link scanner that opens every
 * address in a mail must not be able to do either on the person's behalf.
 */
export function TokenAction({ words: w, token, action }: { words: TokenWords; token: string; action: 'confirm' | 'unsubscribe' }) {
  const [state, setState] = useState<'idle' | 'done' | 'invalid' | 'failed'>('idle')
  const [sending, start] = useTransition()

  if (state === 'done' || state === 'invalid') {
    return (
      <div role="status" className="mt-[18px]">
        <p className="m-0 font-display text-[22px] font-semibold leading-[1.2]">{state === 'done' ? w.doneTitle : w.invalidTitle}</p>
        <p className="m-0 mt-[8px] max-w-[46ch] text-[14px] leading-[1.6] text-body">{state === 'done' ? w.doneLead : w.invalidLead}</p>
        {state === 'invalid' || action === 'unsubscribe' ? (
          <a
            href="/nyhetsbrev"
            className="mt-[16px] inline-flex h-[44px] items-center rounded-cta border border-ink bg-sf px-[18px] text-[14.5px] font-bold text-ink no-underline hover:text-ink hover:no-underline"
          >
            {w.again}
          </a>
        ) : null}
      </div>
    )
  }

  return (
    <div className="mt-[18px]">
      <button
        type="button"
        disabled={sending}
        className={cta}
        onClick={() =>
          start(async () => {
            const r = await (action === 'confirm' ? confirmNewsletter(token) : unsubscribeNewsletter(token)).catch(() => null)
            setState(r?.ok ? 'done' : r?.problem === 'invalid' ? 'invalid' : 'failed')
          })
        }
      >
        {sending ? w.sending : w.submit}
      </button>
      {state === 'failed' ? (
        <p role="alert" className="m-0 mt-[10px] text-[13px] text-danger">
          {w.invalidLead}
        </p>
      ) : null}
    </div>
  )
}

/** One list, as a tickable card: its name and what it is for. */
function ListBox({ list, checked, onChange }: { list: ListChoice; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label
      className="flex cursor-pointer items-start gap-[11px] rounded-tile border-[1.5px] bg-bg px-[14px] py-[12px]"
      style={{ borderColor: checked ? '#191510' : '#E8DFC9' }}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-[3px] h-[16px] w-[16px] flex-none cursor-pointer accent-ink" />
      <span className="min-w-0">
        <span className="block text-[14px] font-bold">{list.name}</span>
        {list.description ? <span className="mt-[2px] block text-[12.5px] leading-[1.5] text-mut">{list.description}</span> : null}
      </span>
    </label>
  )
}

type PrefWords = {
  save: string
  saving: string
  saved: string
  all: string
  allTitle: string
  allLead: string
  again: string
  failed: string
}

/**
 * The preference centre (D-103): every public list, ticked as the recipient is subscribed.
 * Saving sets them; "all" leaves everything. Nothing changes until a button is pressed, so a
 * link scanner that opens the page changes nothing.
 */
export function PreferenceCentre({
  words: w,
  token,
  lists,
  allOff,
}: {
  words: PrefWords
  token: string
  lists: (ListChoice & { subscribed: boolean })[]
  allOff: boolean
}) {
  const [chosen, setChosen] = useState<string[]>(allOff ? [] : lists.filter((l) => l.subscribed).map((l) => l.key))
  const [state, setState] = useState<'idle' | 'saved' | 'all' | 'failed'>(allOff ? 'all' : 'idle')
  const [pending, start] = useTransition()

  if (state === 'all') {
    return (
      <div role="status" className="mt-[18px]">
        <p className="m-0 font-display text-[22px] font-semibold leading-[1.2]">{w.allTitle}</p>
        <p className="m-0 mt-[8px] max-w-[46ch] text-[14px] leading-[1.6] text-body">{w.allLead}</p>
        <a
          href="/nyhetsbrev"
          className="mt-[16px] inline-flex h-[44px] items-center rounded-cta border border-ink bg-sf px-[18px] text-[14.5px] font-bold text-ink no-underline hover:text-ink hover:no-underline"
        >
          {w.again}
        </a>
      </div>
    )
  }

  const save = (all: boolean) =>
    start(async () => {
      const r = await savePreferences(token, all ? [] : chosen, all || chosen.length === 0).catch(() => null)
      setState(r?.ok ? (all || chosen.length === 0 ? 'all' : 'saved') : 'failed')
    })

  return (
    <div className="mt-[18px] flex flex-col gap-[8px]">
      {lists.map((l) => (
        <ListBox
          key={l.key}
          list={l}
          checked={chosen.includes(l.key)}
          onChange={(on) => (setChosen(on ? [...chosen, l.key] : chosen.filter((k) => k !== l.key)), setState('idle'))}
        />
      ))}
      <button type="button" disabled={pending} onClick={() => save(false)} className={cta}>
        {pending ? w.saving : w.save}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => save(true)}
        className="cursor-pointer self-start border-0 bg-transparent p-0 text-[13px] font-semibold text-link underline"
      >
        {w.all}
      </button>
      {state === 'saved' ? (
        <p role="status" className="m-0 text-[13px] font-semibold text-link">
          {w.saved}
        </p>
      ) : null}
      {state === 'failed' ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {w.failed}
        </p>
      ) : null}
    </div>
  )
}
