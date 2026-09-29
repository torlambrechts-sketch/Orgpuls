import type { getTranslations } from 'next-intl/server'
import { LocalePilotForm, TranslationsApproveForm } from '@/components/admin/LegalForms'
import { Badge, Card, day, Table, Td } from '@/components/admin/ui'
import type { LocalePilot, TranslationState } from '@/lib/admin/api'
import { LOCALE_REGISTRY, TRANSLATION_LOCALES } from '@/lib/i18n/locales'
import respondentUi from '@/lib/i18n/respondent-ui.json'
import { respondentLines } from '@/lib/i18n/respondent-strings'
import enMessages from '@/messages/en.json'

/*
 * The English survey's approval and the language pilots (0082, 0085), shown on Languages since the
 * legal review became a review of documents (X-096): both are about which languages a survey is
 * offered in, not about legal text.
 */

/** The English survey (0079): its items and the page strings, approved at once (0082). */
export function EnglishSurvey({
  t,
  state,
  problems,
}: {
  t: Awaited<ReturnType<typeof getTranslations<'admin'>>>
  state: TranslationState
  problems: Record<string, string>
}) {
  const hash = (respondentUi as Record<string, string>).en ?? ''
  const approved = state.items.filter((i) => i.approved).length
  const uiOk = state.ui.some((u) => u.hash === hash)
  const open = state.items.length - approved
  // every item any survey could ask has an approved row, and this build's page strings are approved:
  // the offered rule's own two conditions (lib/i18n/offered.ts; the flag is signed off)
  const ready = state.missing === 0 && uiOk
  const strings = respondentLines(enMessages as Record<string, unknown>)
  return (
    <Card title={t('legal.en.title')} aside={<Badge tone={ready ? 'green' : 'red'}>{ready ? t('legal.en.on') : t('legal.en.off')}</Badge>}>
      <p className="mb-[10px] mt-0 max-w-[80ch] text-[13px] leading-[1.55] text-mut">{t('legal.en.lead')}</p>
      <ul className="m-0 mb-[12px] list-disc pl-[18px] text-[13px] leading-[1.7]">
        <li>{t('legal.en.items', { approved, total: state.items.length })}</li>
        <li>{state.missing === 0 ? t('legal.en.coverOk') : t('legal.en.coverMissing', { n: state.missing })}</li>
        <li>{uiOk ? t('legal.en.uiOk') : t('legal.en.uiOpen', { n: strings.length })}</li>
      </ul>
      {/* mounted either way, so the answer to an approval that leaves nothing open is still shown */}
      <TranslationsApproveForm
        locale="en"
        digest={state.digest}
        open={open > 0 || !uiOk}
        labels={{ read: t('legal.en.read'), submit: t('legal.en.submit'), saving: t('legal.saving'), done: t('legal.en.done'), problems }}
      />
      <details className="mt-[12px]">
        <summary className="cursor-pointer text-[12.5px] font-semibold text-link">{t('legal.en.showUi', { n: strings.length })}</summary>
        <dl className="m-0 mt-[8px] rounded-ctl border border-line bg-bg px-[14px] py-[10px]">
          {strings.map((l) => (
            <div key={l.path} className="py-[4px]">
              <dt className="break-all font-mono text-[11px] text-mut">{l.path}</dt>
              <dd className="m-0 whitespace-pre-wrap text-[13px] leading-[1.55]">{l.text}</dd>
            </div>
          ))}
        </dl>
      </details>
      <details className="mt-[12px]">
        <summary className="cursor-pointer text-[12.5px] font-semibold text-link">{t('legal.en.show', { n: state.items.length })}</summary>
        <dl className="m-0 mt-[8px] rounded-ctl border border-line bg-bg px-[14px] py-[10px]">
          {state.items.map((i) => (
            <div key={i.item} className="py-[4px]">
              <dt className="break-all font-mono text-[11px] text-mut">
                {t(i.approved ? 'legal.en.itemApproved' : 'legal.en.itemOpen', { item: i.item, source: i.source })}
              </dt>
              <dd className="m-0 text-[13px] leading-[1.55]">{i.text}</dd>
            </div>
          ))}
        </dl>
      </details>
    </Card>
  )
}

/** The organisations offered a survey language before everyone (0085), and the form to add or remove one. */
export function LanguagePilots({
  t,
  pilots,
  problems,
}: {
  t: Awaited<ReturnType<typeof getTranslations<'admin'>>>
  pilots: LocalePilot[]
  problems: Record<string, string>
}) {
  const nameOf = (code: string) => LOCALE_REGISTRY.find((l) => l.code === code)?.nativeName ?? code
  return (
    <Card title={t('legal.pilots.title')} className="mt-[16px]">
      <p className="mb-[10px] mt-0 max-w-[80ch] text-[13px] leading-[1.55] text-mut">{t('legal.pilots.lead')}</p>
      <div className="mb-[14px]">
        <Table head={[t('legal.pilots.col.locale'), t('legal.pilots.col.org'), t('legal.pilots.col.since')]} empty={pilots.length ? undefined : t('legal.pilots.none')}>
          {pilots.map((p) => (
            <tr key={`${p.locale}:${p.org_id}`}>
              <Td>{nameOf(p.locale)}</Td>
              <Td wrap>
                {p.name} <span className="font-mono text-[11.5px] text-mut">{p.org_id}</span>
              </Td>
              <Td>{day(p.at)}</Td>
            </tr>
          ))}
        </Table>
      </div>
      <LocalePilotForm
        locales={TRANSLATION_LOCALES.map((code) => ({ code, name: nameOf(code) }))}
        labels={{
          locale: t('legal.pilots.locale'),
          org: t('legal.pilots.org'),
          reason: t('legal.pilots.reason'),
          add: t('legal.pilots.add'),
          remove: t('legal.pilots.remove'),
          saving: t('legal.saving'),
          done: t('legal.done'),
          problems: { ...problems, reason_required: t('legal.pilots.reasonRequired') },
        }}
      />
    </Card>
  )
}
