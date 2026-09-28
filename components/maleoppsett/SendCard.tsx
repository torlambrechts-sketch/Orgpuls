'use client'

import { useId, useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { renderNotice, type MailMessages, type NoticeJob } from '@/supabase/functions/_shared/mail'
import { saveRoundSend, type SendProblem } from '@/app/(app)/maleoppsett/send-actions'
import type { SendPreview } from '@/lib/rounds/send'

/**
 * The send preview (engagement phase 2, P2.1): the round's introduction, the day the results are
 * shared with everyone, and the invitation as it will read, updating as it is edited.
 *
 * The invitation is rendered by `renderNotice`, the function the dispatcher sends with, from the
 * facts `round_send_preview` reads the way `dispatch_claim` does. Only the link is a placeholder:
 * it is personal, and no one's is shown here.
 */
export interface SendCardLabels {
  head: string
  lead: string
  introLabel: string
  introNote: string
  introLocked: string
  count: string
  publishLabel: string
  publishNote: string
  /** when the Årshjul tells nobody: the page opens on the day, and no notice goes out (0107) */
  publishNoteNoNotice: string
  publishNone: string
  save: string
  saved: string
  previewHead: string
  previewNote: string
  problems: Record<SendProblem, string>
}

const MAX = 600
const PLACEHOLDER_TOKEN = '…'

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function SendCard({
  roundId,
  preview,
  mail,
  lang,
  appUrl,
  showSince,
  viewerName,
  labels,
}: {
  roundId: string
  preview: SendPreview
  /** the `mail` messages of the organisation's language, admin overrides applied */
  mail: MailMessages
  lang: 'no' | 'en'
  appUrl: string
  /** engagement_since_last: the dispatcher drops «Siden sist» without it */
  showSince: boolean
  /** a saved introduction is signed by whoever saved it: the viewer, once they save this one */
  viewerName: string | null
  labels: SendCardLabels
}) {
  const ids = { intro: useId(), publish: useId() }
  const [intro, setIntro] = useState(preview.intro ?? '')
  const [publishOn, setPublishOn] = useState(preview.publish_on ?? '')
  const [pending, start] = useTransition()
  const [state, setState] = useState<{ saved: boolean; problem: SendProblem | null }>({ saved: false, problem: null })

  const introOpen = preview.status === 'planlagt'
  const closeOn = preview.close_on
  const dirty = intro.trim() !== (preview.intro ?? '') || (publishOn || null) !== preview.publish_on

  const rendered = useMemo(() => {
    const text = intro.trim()
    const greeting = text
      ? { text, by: text === preview.intro ? preview.intro_by : viewerName }
      : preview.org_greeting
    const job: NoticeJob = {
      id: 'preview',
      kind: 'invitasjon',
      audience: null,
      channel: 'email',
      sms_text: null,
      lang,
      org: preview.org,
      k: preview.k,
      round: preview.round,
      recipients: [],
      token: PLACEHOLDER_TOKEN,
      minutes: preview.minutes,
      results_shared: preview.results_shared,
      publish_on: publishOn || preview.publish_on,
      greeting,
      since: showSince ? preview.since : null,
      logo: preview.logo,
      results_page: preview.results_page,
    }
    try {
      return renderNotice({ no: mail, en: mail }, job, { lang, member: false, name: null }, appUrl)
    } catch {
      return null
    }
  }, [intro, publishOn, preview, mail, lang, appUrl, showSince, viewerName])

  const save = () => {
    setState({ saved: false, problem: null })
    start(async () => {
      const res = await saveRoundSend({ roundId, intro: intro.trim(), publishOn: publishOn || null })
      setState(res.ok ? { saved: true, problem: null } : { saved: false, problem: res.problem })
    })
  }

  return (
    <section
      aria-labelledby={`${ids.intro}-head`}
      className="rounded-panel border border-line bg-sf px-[24px] py-[22px]"
    >
      <div id={`${ids.intro}-head`} className="text-[11px] uppercase tracking-[0.11em] text-mut">
        {labels.head}
      </div>
      <p className="mt-[7px] text-[13px] leading-[1.6] text-body [text-wrap:pretty]">{labels.lead}</p>

      <label htmlFor={ids.intro} className="mt-[14px] block text-[13px] font-bold">
        {labels.introLabel}
      </label>
      <span className="mt-[2px] block text-[12px] leading-[1.5] text-mut [text-wrap:pretty]">
        {introOpen ? labels.introNote : labels.introLocked}
      </span>
      <textarea
        id={ids.intro}
        value={intro}
        maxLength={MAX}
        rows={4}
        disabled={!introOpen || pending}
        onChange={(e) => {
          setIntro(e.target.value)
          setState({ saved: false, problem: null })
        }}
        className="mt-[8px] w-full rounded-cta border-[1.5px] border-line bg-sf px-[13px] py-[10px] text-[14px] leading-[1.5] text-ink outline-none focus-visible:border-ink disabled:opacity-60"
      />
      <div className="mt-[4px] text-right text-[11.5px] tabular-nums text-mut">
        {labels.count.replace('{n}', String(intro.length)).replace('{max}', String(MAX))}
      </div>

      <label htmlFor={ids.publish} className="mt-[10px] block text-[13px] font-bold">
        {labels.publishLabel}
      </label>
      {closeOn ? (
        <>
          <span className="mt-[2px] block text-[12px] leading-[1.5] text-mut [text-wrap:pretty]">
            {preview.results_shared ? labels.publishNote : labels.publishNoteNoNotice}
          </span>
          <input
            id={ids.publish}
            type="date"
            value={publishOn}
            min={closeOn}
            max={addDays(closeOn, 60)}
            disabled={pending}
            onChange={(e) => {
              setPublishOn(e.target.value)
              setState({ saved: false, problem: null })
            }}
            className="mt-[8px] h-[42px] rounded-cta border-[1.5px] border-line bg-sf px-[13px] text-[14px] text-ink outline-none focus-visible:border-ink"
          />
        </>
      ) : (
        <span className="mt-[2px] block text-[12px] leading-[1.5] text-mut [text-wrap:pretty]">
          {labels.publishNone}
        </span>
      )}

      <div className="mt-[14px] flex items-center gap-[12px]">
        <Button size="sm" tone="secondary" pad={15} disabled={pending || !dirty} onClick={save}>
          {labels.save}
        </Button>
        <span role="status" className="text-[12.5px] leading-[1.5]">
          {state.problem ? (
            <span className="text-danger">{labels.problems[state.problem]}</span>
          ) : state.saved ? (
            <span className="text-mut">{labels.saved}</span>
          ) : null}
        </span>
      </div>

      {rendered ? (
        <div className="mt-[18px] border-t border-line pt-[16px]">
          <div className="text-[13.5px] font-semibold">{labels.previewHead}</div>
          <div className="mt-[2px] text-[11.5px] leading-[1.5] text-mut [text-wrap:pretty]">{labels.previewNote}</div>
          <div
            data-testid="m-send-preview"
            className="mt-[11px] rounded-btn border border-line bg-bg px-[14px] py-[12px] text-[12.5px] leading-[1.55]"
          >
            <div className="font-bold">{rendered.subject}</div>
            <div className="mt-[8px] whitespace-pre-wrap break-words [text-wrap:pretty]">{rendered.text}</div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
